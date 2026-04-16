/**
 * VNNS Training Worker
 * Runs neural network training in a background thread via WebAssembly.
 * Keeps the main thread free for UI rendering and interaction.
 */
const _workerDir = self.location.href.substring(0, self.location.href.lastIndexOf('/') + 1);
const _backendDir = _workerDir + '../backend/build/';
importScripts(_backendDir + 'vnns.js');

let module = null;
let ready = false;
let netId = -1;

let _createNetwork, _freeNetwork, _trainEpoch, _evaluate;
let _getLastAccuracy, _getLastLoss, _getWeightsJson, _freePtr;
let _setLearningRate, _setBatchSize, _setClipGradient;

let training = {
  running: false,
  paused: false,
  epoch: 0,
  maxEpochs: 0,
  weightsInterval: 50,
  dataPtr: 0,
  labelsPtr: 0,
  sampleCount: 0,
  testDataPtr: 0,
  testLabelsPtr: 0,
  testCount: 0,
  valDataPtr: 0,
  valLabelsPtr: 0,
  valCount: 0,
  earlyStopping: false,
  patience: 10,
  minDelta: 0,
  bestValLoss: Infinity,
  patienceCounter: 0
};

async function initWASM() {
  try {
    module = await VNNSModule({
      locateFile: (file) => _backendDir + file
    });
    const M = module;

    _createNetwork = M.cwrap('vnns_wasm_create_network', 'number', ['string']);
    _freeNetwork = M.cwrap('vnns_wasm_free_network', null, ['number']);
    _trainEpoch = M.cwrap('vnns_wasm_train_epoch', 'number', ['number', 'number', 'number', 'number']);
    _evaluate = M.cwrap('vnns_wasm_evaluate', 'number', ['number', 'number', 'number', 'number']);
    _getLastAccuracy = M.cwrap('vnns_wasm_get_last_accuracy', 'number', []);
    _getLastLoss = M.cwrap('vnns_wasm_get_last_loss', 'number', []);
    _getWeightsJson = M.cwrap('vnns_wasm_get_weights_json', 'number', ['number']);
    _freePtr = M.cwrap('vnns_wasm_free_ptr', null, ['number']);
    _setLearningRate = M.cwrap('vnns_wasm_set_learning_rate', null, ['number', 'number']);
    _setBatchSize = M.cwrap('vnns_wasm_set_batch_size', null, ['number', 'number']);
    _setClipGradient = M.cwrap('vnns_wasm_set_clip_gradient', null, ['number', 'number']);

    ready = true;
    self.postMessage({ type: 'ready' });
  } catch (err) {
    self.postMessage({ type: 'error', message: 'WASM init failed: ' + err.message });
  }
}

function allocFloats(arr) {
  const bytes = arr.length * 4;
  const ptr = module._malloc(bytes);
  for (let i = 0; i < arr.length; i++) {
    module.setValue(ptr + i * 4, arr[i], 'float');
  }
  return ptr;
}

function freeTrainingData() {
  if (training.dataPtr) { module._free(training.dataPtr); training.dataPtr = 0; }
  if (training.labelsPtr) { module._free(training.labelsPtr); training.labelsPtr = 0; }
  if (training.testDataPtr) { module._free(training.testDataPtr); training.testDataPtr = 0; }
  if (training.testLabelsPtr) { module._free(training.testLabelsPtr); training.testLabelsPtr = 0; }
  if (training.valDataPtr) { module._free(training.valDataPtr); training.valDataPtr = 0; }
  if (training.valLabelsPtr) { module._free(training.valLabelsPtr); training.valLabelsPtr = 0; }
}

function getWeightsJSON() {
  if (netId < 0) return null;
  const ptr = _getWeightsJson(netId);
  if (!ptr) return null;
  const str = module.UTF8ToString(ptr);
  _freePtr(ptr);
  return str;
}

function destroyNetwork() {
  training.running = false;
  training.paused = false;
  freeTrainingData();
  if (netId >= 0) { _freeNetwork(netId); netId = -1; }
}

function setupTrainingData(msg) {
  freeTrainingData();
  training.dataPtr = allocFloats(msg.trainData);
  training.labelsPtr = allocFloats(msg.trainLabels);
  training.sampleCount = msg.trainCount;

  if (msg.testData && msg.testData.length > 0) {
    training.testDataPtr = allocFloats(msg.testData);
    training.testLabelsPtr = allocFloats(msg.testLabels);
    training.testCount = msg.testCount;
  } else {
    training.testCount = 0;
  }

  if (msg.valData && msg.valData.length > 0) {
    training.valDataPtr = allocFloats(msg.valData);
    training.valLabelsPtr = allocFloats(msg.valLabels);
    training.valCount = msg.valCount;
  } else {
    training.valCount = 0;
  }
}

function runTrainingLoop() {
  if (!training.running || training.paused) return;

  const batchStart = training.epoch;
  const startTime = performance.now();
  let lastLoss = 0, lastAccuracy = 0;
  let earlyStopped = false;

  // Run epochs for ~16ms before yielding to allow message processing
  while (training.epoch < training.maxEpochs && training.running) {
    lastLoss = _trainEpoch(netId, training.dataPtr, training.labelsPtr, training.sampleCount);
    lastAccuracy = _getLastAccuracy();
    training.epoch++;
    if (performance.now() - startTime >= 16) break;
  }

  // Evaluate validation set
  let valLoss = -1;
  if (training.valCount > 0) {
    _evaluate(netId, training.valDataPtr, training.valLabelsPtr, training.valCount);
    valLoss = _getLastLoss();
  }

  // Early stopping check
  if (training.earlyStopping && valLoss >= 0) {
    if (valLoss < training.bestValLoss - training.minDelta) {
      training.bestValLoss = valLoss;
      training.patienceCounter = 0;
    } else {
      training.patienceCounter += (training.epoch - batchStart);
    }
    if (training.patienceCounter >= training.patience) {
      earlyStopped = true;
    }
  }

  const isComplete = training.epoch >= training.maxEpochs || earlyStopped;
  const prevInterval = Math.floor(batchStart / training.weightsInterval);
  const currInterval = Math.floor(training.epoch / training.weightsInterval);
  const sendWeights = isComplete || (currInterval > prevInterval);

  if (isComplete) {
    training.running = false;
    const msg = {
      type: 'complete',
      epoch: training.epoch,
      loss: lastLoss,
      accuracy: lastAccuracy,
      weightsJSON: getWeightsJSON(),
      earlyStopped: earlyStopped
    };

    if (valLoss >= 0) msg.valLoss = valLoss;

    if (training.testCount > 0) {
      _evaluate(netId, training.testDataPtr, training.testLabelsPtr, training.testCount);
      msg.testLoss = _getLastLoss();
      msg.testAccuracy = _getLastAccuracy();
    }

    freeTrainingData();
    self.postMessage(msg);
    return;
  }

  const msg = {
    type: 'progress',
    epoch: training.epoch,
    loss: lastLoss,
    accuracy: lastAccuracy
  };

  if (valLoss >= 0) msg.valLoss = valLoss;

  if (sendWeights) {
    msg.weightsJSON = getWeightsJSON();
  }

  self.postMessage(msg);
  setTimeout(runTrainingLoop, 0);
}

self.onmessage = function(e) {
  const msg = e.data;

  switch (msg.type) {
    case 'init':
      initWASM();
      break;

    case 'start': {
      if (!ready) {
        self.postMessage({ type: 'error', message: 'WASM not initialized' });
        return;
      }

      destroyNetwork();
      netId = _createNetwork(msg.configJSON);
      if (netId < 0) {
        self.postMessage({ type: 'error', message: 'Failed to create network. Check layer sizes.' });
        return;
      }

      setupTrainingData(msg);
      training.epoch = 0;
      training.maxEpochs = msg.maxEpochs;
      training.weightsInterval = msg.weightsInterval || 50;
      training.running = true;
      training.paused = false;
      training.earlyStopping = !!msg.earlyStopping;
      training.patience = msg.patience || 10;
      training.minDelta = msg.minDelta || 0;
      training.bestValLoss = Infinity;
      training.patienceCounter = 0;

      self.postMessage({ type: 'started' });
      runTrainingLoop();
      break;
    }

    case 'pause':
      training.paused = true;
      self.postMessage({ type: 'paused', epoch: training.epoch, weightsJSON: getWeightsJSON() });
      break;

    case 'resume':
      if (training.running && training.paused) {
        training.paused = false;
        self.postMessage({ type: 'resumed' });
        runTrainingLoop();
      }
      break;

    case 'stop': {
      training.running = false;
      training.paused = false;
      const wj = getWeightsJSON();
      freeTrainingData();
      self.postMessage({ type: 'stopped', epoch: training.epoch, weightsJSON: wj });
      break;
    }

    case 'step': {
      if (!ready) {
        self.postMessage({ type: 'error', message: 'WASM not initialized' });
        return;
      }

      // Create network if needed (first step without start)
      if (netId < 0) {
        if (!msg.configJSON) {
          self.postMessage({ type: 'error', message: 'No network — provide configJSON with step' });
          return;
        }
        netId = _createNetwork(msg.configJSON);
        if (netId < 0) {
          self.postMessage({ type: 'error', message: 'Failed to create network' });
          return;
        }
        setupTrainingData(msg);
        training.epoch = 0;
        training.maxEpochs = msg.maxEpochs || Infinity;
        training.running = true;
        training.paused = true;
      }

      if (!training.dataPtr) {
        self.postMessage({ type: 'error', message: 'No training data for step' });
        return;
      }

      const loss = _trainEpoch(netId, training.dataPtr, training.labelsPtr, training.sampleCount);
      const accuracy = _getLastAccuracy();
      training.epoch++;

      self.postMessage({
        type: 'step',
        epoch: training.epoch,
        loss,
        accuracy,
        weightsJSON: getWeightsJSON()
      });
      break;
    }

    case 'setLearningRate':
      if (netId >= 0) _setLearningRate(netId, msg.value);
      break;

    case 'setBatchSize':
      if (netId >= 0) _setBatchSize(netId, msg.value);
      break;

    case 'destroy':
      destroyNetwork();
      self.postMessage({ type: 'destroyed' });
      break;
  }
};
