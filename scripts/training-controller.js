/**
 * VNNS Training Controller
 * Worker handler, start/pause/stop/step, metrics, weight sync, activation visualization.
 */
(function(V) {
  'use strict';

  // --- Activation helpers ---
  function applyActivationFn(x, fn) {
    switch ((fn || '').toLowerCase()) {
      case 'relu': return Math.max(0, x);
      case 'leakyrelu': return x > 0 ? x : 0.01 * x;
      case 'sigmoid': return 1 / (1 + Math.exp(-x));
      case 'tanh': return Math.tanh(x);
      case 'softmax': return x;
      case 'elu': return x >= 0 ? x : Math.exp(x) - 1;
      case 'gelu': return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));
      case 'swish': return x / (1 + Math.exp(-x));
      default: return x;
    }
  }

  function computeActivations(inputValues) {
    V.neuronActivations.clear();
    var sortedLayers = V.network.getAllLayers().sort(function(a, b) { return a.position.x - b.position.x; });
    if (sortedLayers.length === 0) return;

    var inputNeurons = V.network.getNeuronsByLayer(sortedLayers[0].id);
    inputNeurons.forEach(function(n, i) {
      V.neuronActivations.set(n.id, inputValues && i < inputValues.length ? inputValues[i] : 0);
    });

    for (var l = 1; l < sortedLayers.length; l++) {
      var layer = sortedLayers[l];
      var toNeurons = V.network.getNeuronsByLayer(layer.id);
      var activation = layer.activation || 'relu';
      var rawValues = [];

      toNeurons.forEach(function(toN) {
        var sum = toN.bias || 0;
        var conns = V.network.getAllConnections().filter(function(c) { return c.toNeuron === toN.id; });
        conns.forEach(function(c) {
          var fromAct = V.neuronActivations.get(c.fromNeuron) || 0;
          sum += fromAct * (c.weight || 0);
        });
        rawValues.push({ neuron: toN, sum: sum });
      });

      if (activation.toLowerCase() === 'softmax') {
        var maxVal = Math.max.apply(null, rawValues.map(function(r) { return r.sum; }));
        var exps = rawValues.map(function(r) { return Math.exp(r.sum - maxVal); });
        var sumExp = exps.reduce(function(a, b) { return a + b; }, 0);
        rawValues.forEach(function(r, i) {
          V.neuronActivations.set(r.neuron.id, exps[i] / sumExp);
        });
      } else {
        rawValues.forEach(function(r) {
          V.neuronActivations.set(r.neuron.id, applyActivationFn(r.sum, activation));
        });
      }
    }
  }

  function runActivationVisualization() {
    if (!V.viewport.showActivations) { V.neuronActivations.clear(); return; }
    if (!V.trainingState.preparedData || !V.trainingState.preparedData.trainData) return;

    var d = V.trainingState.preparedData;
    var sampleIdx = Math.floor(Math.random() * d.trainCount);
    var inputValues = [];
    for (var i = 0; i < d.inputSize; i++) {
      inputValues.push(d.trainData[sampleIdx * d.inputSize + i]);
    }
    computeActivations(inputValues);
    V.render();
  }

  // --- Invalidate ---
  function invalidateBackendNetwork() {
    if (V.trainingState.running) {
      V.trainingState.running = false;
      V.trainingState.paused = false;
      V.trainingWorker.postMessage({ type: 'destroy' });
      stopTrainingTimer();
      setTrainingButtonStates(false, false);
      V.logOutput('Training stopped — network or data changed', 'warning');
    }
    if (V.wasmBridge.netId >= 0) V.wasmBridge.destroy();
    V.trainingState.preparedData = null;
    V.trainingState.lastWeightsJSON = null;
  }

  // --- Timer ---
  function startTrainingTimer() {
    stopTrainingTimer();
    V.trainingTimerInterval = setInterval(function() {
      if (V.trainingState.running && !V.trainingState.paused) {
        document.getElementById('metric-time').textContent = V.formatTime(Date.now() - V.trainingState.startTime);
      }
    }, 100);
  }

  function stopTrainingTimer() {
    if (V.trainingTimerInterval) {
      clearInterval(V.trainingTimerInterval);
      V.trainingTimerInterval = null;
    }
  }

  // --- Helpers ---
  function getTrainingParams() {
    return {
      optimizer: document.getElementById('optimizer-select').value,
      learningRate: parseFloat(document.getElementById('lr-slider').value),
      batchSize: parseInt(document.getElementById('batch-slider').value),
      loss: document.getElementById('loss-select').value,
      epochs: parseInt(document.getElementById('epochs-slider').value)
    };
  }

  function getSplitConfig() {
    return {
      train: parseInt(document.getElementById('split-train').value),
      val: parseInt(document.getElementById('split-val').value),
      shuffle: document.getElementById('split-shuffle').checked,
      seed: parseInt(document.getElementById('split-seed').value) || 42
    };
  }

  function resetMetrics() {
    document.getElementById('metric-epoch').textContent = '0';
    document.getElementById('metric-loss').textContent = '—';
    document.getElementById('metric-accuracy').textContent = '—';
    document.getElementById('metric-val-loss').textContent = '—';
    document.getElementById('metric-time').textContent = '00:00';
    V.lossChart.data.labels = [];
    V.lossChart.data.datasets[0].data = [];
    V.lossChart.data.datasets[1].data = [];
    V.lossChart.update();
    V.accuracyChart.data.labels = [];
    V.accuracyChart.data.datasets[0].data = [];
    V.accuracyChart.update();
  }

  function setTrainingButtonStates(running, paused) {
    document.getElementById('train-play').disabled = running && !paused;
    document.getElementById('train-pause').disabled = !running || paused;
    document.getElementById('train-stop').disabled = !running;
    document.getElementById('train-step').disabled = running && !paused;
  }

  function ensureMainThreadNetwork(weightsJSON) {
    try {
      if (V.wasmBridge.netId < 0) {
        var params = getTrainingParams();
        V.wasmBridge.createNetwork(V.network, params);
      }
      if (weightsJSON) V.wasmBridge.setWeightsJSON(weightsJSON);
    } catch (err) {
      V.logOutput('Failed to sync network to main thread: ' + err.message, 'error');
    }
  }

  function syncWeightsFromBackend(weightsData) {
    if (!weightsData) weightsData = V.wasmBridge.getWeightsJSON();
    if (!weightsData || !weightsData.weights) return;

    var sortedLayers = V.network.getAllLayers().sort(function(a, b) { return a.position.x - b.position.x; });
    var wIdx = 0;

    for (var i = 0; i < sortedLayers.length - 1; i++) {
      var fromNeurons = V.network.getNeuronsByLayer(sortedLayers[i].id);
      var toNeurons = V.network.getNeuronsByLayer(sortedLayers[i + 1].id);

      for (var from = 0; from < fromNeurons.length; from++) {
        for (var to = 0; to < toNeurons.length; to++) {
          if (wIdx < weightsData.weights.length) {
            var conn = V.network.getAllConnections().find(function(c) {
              return c.fromNeuron === fromNeurons[from].id && c.toNeuron === toNeurons[to].id;
            });
            if (conn) conn.weight = weightsData.weights[wIdx];
            wIdx++;
          }
        }
      }
      var toLayer = sortedLayers[i + 1];
      if (toLayer.useBias !== false) {
        for (var to2 = 0; to2 < toNeurons.length; to2++) {
          if (wIdx < weightsData.weights.length) {
            toNeurons[to2].bias = weightsData.weights[wIdx];
            wIdx++;
          }
        }
      }
    }

    V._lastPropsKey = '';
    V.render();
  }

  // --- Worker Message Handler ---
  function setupWorkerHandlers() {
    V.trainingWorker.onmessage = function(e) {
      var msg = e.data;

      switch (msg.type) {
        case 'ready':
          V.workerReady = true;
          V.logOutput('Training worker ready', 'success');
          break;

        case 'started':
          V.logOutput('Worker training loop started', 'info');
          break;

        case 'progress':
          V.trainingState.epoch = msg.epoch;
          V.updateMetrics(msg.epoch, msg.loss, msg.accuracy, msg.valLoss);
          if (msg.weightsJSON) {
            V.trainingState.lastWeightsJSON = msg.weightsJSON;
            syncWeightsFromBackend(JSON.parse(msg.weightsJSON));
            if (V.viewport.showActivations) runActivationVisualization();
          }
          break;

        case 'complete': {
          V.trainingState.running = false;
          V.trainingState.epoch = msg.epoch;
          stopTrainingTimer();
          setTrainingButtonStates(false, false);

          var elapsed = Date.now() - V.trainingState.startTime;
          V.updateMetrics(msg.epoch, msg.loss, msg.accuracy, msg.valLoss);
          document.getElementById('metric-time').textContent = V.formatTime(elapsed);

          if (msg.weightsJSON) {
            V.trainingState.lastWeightsJSON = msg.weightsJSON;
            syncWeightsFromBackend(JSON.parse(msg.weightsJSON));
            ensureMainThreadNetwork(msg.weightsJSON);
            V.renderDecisionBoundary();
          }

          if (msg.earlyStopped) {
            V.logOutput('Early stopping triggered at epoch ' + msg.epoch + ' (patience exhausted)', 'warning');
          }
          V.logOutput('Training complete — ' + msg.epoch + ' epochs in ' + V.formatTime(elapsed), 'success');
          V.logOutput('Train — Loss: ' + msg.loss.toFixed(6) + ', Accuracy: ' + (msg.accuracy * 100).toFixed(2) + '%', 'info');

          if (msg.valLoss !== undefined && msg.valLoss >= 0) {
            V.logOutput('Val — Loss: ' + msg.valLoss.toFixed(6), 'info');
          }

          if (msg.testLoss !== undefined) {
            V.logOutput('Test — Loss: ' + msg.testLoss.toFixed(6) + ', Accuracy: ' + (msg.testAccuracy * 100).toFixed(2) + '%', 'success');
          }

          if (V.viewport.showActivations) runActivationVisualization();
          break;
        }

        case 'paused':
          V.trainingState.paused = true;
          V.trainingState.epoch = msg.epoch;
          setTrainingButtonStates(true, true);
          V.logOutput('Training paused at epoch ' + msg.epoch);
          if (msg.weightsJSON) {
            V.trainingState.lastWeightsJSON = msg.weightsJSON;
            syncWeightsFromBackend(JSON.parse(msg.weightsJSON));
            ensureMainThreadNetwork(msg.weightsJSON);
            V.renderDecisionBoundary();
            if (V.viewport.showActivations) runActivationVisualization();
          }
          break;

        case 'resumed':
          V.trainingState.paused = false;
          setTrainingButtonStates(true, false);
          V.logOutput('Training resumed');
          break;

        case 'stopped':
          V.trainingState.running = false;
          V.trainingState.epoch = msg.epoch;
          stopTrainingTimer();
          setTrainingButtonStates(false, false);
          V.logOutput('Training stopped at epoch ' + msg.epoch);
          if (msg.weightsJSON) {
            V.trainingState.lastWeightsJSON = msg.weightsJSON;
            syncWeightsFromBackend(JSON.parse(msg.weightsJSON));
            ensureMainThreadNetwork(msg.weightsJSON);
            if (V.viewport.showActivations) runActivationVisualization();
          }
          break;

        case 'step':
          V.trainingState.epoch = msg.epoch;
          V.updateMetrics(msg.epoch, msg.loss, msg.accuracy);
          document.getElementById('metric-time').textContent = V.formatTime(Date.now() - V.trainingState.startTime);
          if (msg.weightsJSON) {
            V.trainingState.lastWeightsJSON = msg.weightsJSON;
            syncWeightsFromBackend(JSON.parse(msg.weightsJSON));
            ensureMainThreadNetwork(msg.weightsJSON);
            V.renderDecisionBoundary();
            if (V.viewport.showActivations) runActivationVisualization();
          }
          setTrainingButtonStates(true, true);
          break;

        case 'destroyed':
          break;

        case 'error':
          V.logOutput('Worker error: ' + msg.message, 'error');
          V.trainingState.running = false;
          stopTrainingTimer();
          setTrainingButtonStates(false, false);
          break;
      }
    };

    V.trainingWorker.onerror = function(e) {
      V.logOutput('Worker crash: ' + e.message, 'error');
      V.trainingState.running = false;
      stopTrainingTimer();
      setTrainingButtonStates(false, false);
    };
  }

  // --- Training Actions ---
  function startTraining() {
    if (!V.workerReady) {
      alert('Training backend is not loaded yet. Please wait.');
      return;
    }

    if (V.dataset.rows.length === 0) {
      alert('Load a dataset first (Dataset panel).');
      return;
    }

    var layers = V.network.getAllLayers();
    if (layers.length < 2) {
      alert('Need at least 2 layers (input + output).');
      return;
    }

    var emptyLayer = layers.find(function(l) { return l.neurons.length === 0; });
    if (emptyLayer) {
      alert('Layer "' + emptyLayer.name + '" has no neurons. All layers need at least 1 neuron.');
      return;
    }

    try {
      var params = getTrainingParams();
      var splitConfig = getSplitConfig();
      var preparedData = prepareDatasetForWASM(V.dataset, splitConfig);

      var sortedLayers = layers.sort(function(a, b) { return a.position.x - b.position.x; });
      var firstLayerNeurons = sortedLayers[0].neurons.length;
      var lastLayerNeurons = sortedLayers[sortedLayers.length - 1].neurons.length;

      if (preparedData.inputSize !== firstLayerNeurons) {
        alert('Input size mismatch: dataset has ' + preparedData.inputSize + ' features but first layer "' + sortedLayers[0].name + '" has ' + firstLayerNeurons + ' neurons.');
        return;
      }
      if (preparedData.outputSize !== lastLayerNeurons) {
        alert('Output size mismatch: dataset has ' + preparedData.outputSize + ' targets but last layer "' + sortedLayers[sortedLayers.length - 1].name + '" has ' + lastLayerNeurons + ' neurons.');
        return;
      }

      var configJSON = V.wasmBridge.buildConfigJSON(V.network, params);
      if (V.wasmBridge.netId >= 0) V.wasmBridge.destroy();

      V.logOutput('Training started — ' + params.epochs + ' epochs, LR=' + params.learningRate + ', Batch=' + params.batchSize + ', Optimizer=' + params.optimizer + ', Loss=' + params.loss);
      V.logOutput('Dataset split — Train: ' + preparedData.trainCount + ', Val: ' + preparedData.valCount + ', Test: ' + preparedData.testCount + ' samples');
      if (document.getElementById('early-stopping-check').checked) {
        V.logOutput('Early Stopping enabled — Patience: ' + document.getElementById('patience-slider').value + ', Min Delta: ' + document.getElementById('min-delta-slider').value);
      }
      V.logOutput('Network — ' + sortedLayers.map(function(l) { return l.neurons.length; }).join(' → ') + ' (' + sortedLayers.length + ' layers)');

      // Show/hide val loss metric based on val split
      document.getElementById('metric-val-loss-item').style.display = preparedData.valCount > 0 ? '' : 'none';
      V.logOutput('Network — ' + sortedLayers.map(function(l) { return l.neurons.length; }).join(' → ') + ' (' + sortedLayers.length + ' layers)');

      resetMetrics();
      V.trainingState.running = true;
      V.trainingState.paused = false;
      V.trainingState.epoch = 0;
      V.trainingState.maxEpochs = params.epochs;
      V.trainingState.preparedData = preparedData;
      V.trainingState.startTime = Date.now();
      V.trainingState.lastWeightsJSON = null;
      setTrainingButtonStates(true, false);

      V.switchPanel('train');
      startTrainingTimer();

      V.trainingWorker.postMessage({
        type: 'start',
        configJSON: configJSON,
        trainData: preparedData.trainData,
        trainLabels: preparedData.trainLabels,
        trainCount: preparedData.trainCount,
        valData: preparedData.valData,
        valLabels: preparedData.valLabels,
        valCount: preparedData.valCount,
        testData: preparedData.testData,
        testLabels: preparedData.testLabels,
        testCount: preparedData.testCount,
        maxEpochs: params.epochs,
        weightsInterval: 50,
        earlyStopping: document.getElementById('early-stopping-check').checked,
        patience: parseInt(document.getElementById('patience-slider').value) || 10,
        minDelta: parseFloat(document.getElementById('min-delta-slider').value) || 0
      });
    } catch (err) {
      V.logOutput('Training error: ' + err.message, 'error');
    }
  }

  function pauseTraining() {
    if (V.trainingState.running) {
      V.trainingWorker.postMessage({ type: 'pause' });
    }
  }

  function resumeTraining() {
    if (V.trainingState.running && V.trainingState.paused) {
      V.trainingWorker.postMessage({ type: 'resume' });
    }
  }

  function stopTraining() {
    if (V.trainingState.running) {
      V.trainingWorker.postMessage({ type: 'stop' });
    }
  }

  function stepTraining() {
    if (!V.workerReady) {
      alert('Training backend is not loaded yet.');
      return;
    }

    if (!V.trainingState.preparedData) {
      if (V.dataset.rows.length === 0) {
        alert('Load a dataset first.');
        return;
      }
      var layers = V.network.getAllLayers();
      if (layers.length < 2) {
        alert('Need at least 2 layers.');
        return;
      }

      try {
        var params = getTrainingParams();
        var splitConfig = getSplitConfig();
        V.trainingState.preparedData = prepareDatasetForWASM(V.dataset, splitConfig);

        var sortedLayers = layers.sort(function(a, b) { return a.position.x - b.position.x; });
        if (V.trainingState.preparedData.inputSize !== sortedLayers[0].neurons.length) {
          alert('Input size mismatch.');
          return;
        }
        if (V.trainingState.preparedData.outputSize !== sortedLayers[sortedLayers.length - 1].neurons.length) {
          alert('Output size mismatch.');
          return;
        }

        var configJSON = V.wasmBridge.buildConfigJSON(V.network, params);
        if (V.wasmBridge.netId >= 0) V.wasmBridge.destroy();

        resetMetrics();
        V.trainingState.epoch = 0;
        V.trainingState.maxEpochs = params.epochs;
        V.trainingState.startTime = Date.now();
        V.trainingState.running = true;
        V.trainingState.paused = true;
        V.trainingState.lastWeightsJSON = null;

        V.trainingWorker.postMessage({
          type: 'step',
          configJSON: configJSON,
          trainData: V.trainingState.preparedData.trainData,
          trainLabels: V.trainingState.preparedData.trainLabels,
          trainCount: V.trainingState.preparedData.trainCount,
          valData: V.trainingState.preparedData.valData,
          valLabels: V.trainingState.preparedData.valLabels,
          valCount: V.trainingState.preparedData.valCount,
          testData: V.trainingState.preparedData.testData,
          testLabels: V.trainingState.preparedData.testLabels,
          testCount: V.trainingState.preparedData.testCount,
          maxEpochs: params.epochs
        });
        return;
      } catch (err) {
        alert('Error: ' + err.message);
        return;
      }
    }

    V.trainingWorker.postMessage({ type: 'step' });
  }

  // --- Init ---
  function init() {
    V.wasmBridge = new WASMBridge();
    V.trainingWorker = new Worker('scripts/training-worker.js');

    V.wasmBridge.init().then(function() {
      V.logOutput('WASM backend ready', 'success');
    }).catch(function(err) {
      V.logOutput('WASM init failed: ' + err, 'error');
    });

    V.trainingWorker.postMessage({ type: 'init' });
    setupWorkerHandlers();
    setTrainingButtonStates(false, false);

    // Wire buttons
    document.getElementById('train-play').addEventListener('click', function() {
      if (V.trainingState.running && V.trainingState.paused) resumeTraining();
      else if (!V.trainingState.running) startTraining();
    });
    document.getElementById('train-pause').addEventListener('click', pauseTraining);
    document.getElementById('train-stop').addEventListener('click', stopTraining);
    document.getElementById('train-step').addEventListener('click', stepTraining);

    // Hyperparam changes
    document.getElementById('lr-slider').addEventListener('input', function() {
      var lr = parseFloat(document.getElementById('lr-slider').value);
      V.wasmBridge.setLearningRate(lr);
      V.trainingWorker.postMessage({ type: 'setLearningRate', value: lr });
    });
    document.getElementById('batch-slider').addEventListener('input', function() {
      var bs = parseInt(document.getElementById('batch-slider').value);
      V.wasmBridge.setBatchSize(bs);
      V.trainingWorker.postMessage({ type: 'setBatchSize', value: bs });
    });
    document.getElementById('optimizer-select').addEventListener('change', invalidateBackendNetwork);
    document.getElementById('loss-select').addEventListener('change', invalidateBackendNetwork);

    // Early stopping toggle
    var esCheck = document.getElementById('early-stopping-check');
    esCheck.checked = false;
    document.getElementById('early-stopping-params').style.display = 'none';
    esCheck.addEventListener('change', function() {
      document.getElementById('early-stopping-params').style.display = this.checked ? '' : 'none';
    });
  }

  // --- Exports ---
  V.invalidateBackendNetwork = invalidateBackendNetwork;
  V.syncWeightsFromBackend = syncWeightsFromBackend;
  V.computeActivations = computeActivations;
  V.runActivationVisualization = runActivationVisualization;
  V.applyActivationFn = applyActivationFn;
  V.getTrainingParams = getTrainingParams;
  V.startTraining = startTraining;
  V.ensureMainThreadNetwork = ensureMainThreadNetwork;
  V.initTraining = init;

  // renderDecisionBoundary stub (set in predict-panel.js)
  V.renderDecisionBoundary = V.renderDecisionBoundary || function() {};

})(window.VNNS);
