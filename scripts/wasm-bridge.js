/**
 * VNNS WASM Bridge
 * Wraps the C/WASM backend functions for use by the frontend.
 */
class WASMBridge {
  constructor() {
    this.module = null;
    this.ready = false;
    this.netId = -1;

    // cwrap'd functions (set after init)
    this._createNetwork = null;
    this._freeNetwork = null;
    this._predict = null;
    this._predictInplace = null;
    this._trainEpoch = null;
    this._trainBatch = null;
    this._evaluate = null;
    this._setLearningRate = null;
    this._setBatchSize = null;
    this._setClipGradient = null;
    this._getWeightsJson = null;
    this._setWeights = null;
    this._getNetworkInfo = null;
    this._freePtr = null;
    this._getLastAccuracy = null;
    this._getLastLoss = null;
  }

  async init() {
    if (this.ready) return;
    this.module = await VNNSModule();
    const M = this.module;

    this._createNetwork = M.cwrap('vnns_wasm_create_network', 'number', ['string']);
    this._freeNetwork = M.cwrap('vnns_wasm_free_network', null, ['number']);
    this._predict = M.cwrap('vnns_wasm_predict', 'number', ['number', 'number', 'number']);
    this._predictInplace = M.cwrap('vnns_wasm_predict_inplace', null, ['number', 'number', 'number']);
    this._trainEpoch = M.cwrap('vnns_wasm_train_epoch', 'number', ['number', 'number', 'number', 'number']);
    this._trainBatch = M.cwrap('vnns_wasm_train_batch', 'number', ['number', 'number', 'number', 'number']);
    this._evaluate = M.cwrap('vnns_wasm_evaluate', 'number', ['number', 'number', 'number', 'number']);
    this._setLearningRate = M.cwrap('vnns_wasm_set_learning_rate', null, ['number', 'number']);
    this._setBatchSize = M.cwrap('vnns_wasm_set_batch_size', null, ['number', 'number']);
    this._setClipGradient = M.cwrap('vnns_wasm_set_clip_gradient', null, ['number', 'number']);
    this._getWeightsJson = M.cwrap('vnns_wasm_get_weights_json', 'number', ['number']);
    this._setWeights = M.cwrap('vnns_wasm_set_weights', null, ['number', 'string']);
    this._getNetworkInfo = M.cwrap('vnns_wasm_get_network_info', 'number', ['number']);
    this._freePtr = M.cwrap('vnns_wasm_free_ptr', null, ['number']);
    this._getLastAccuracy = M.cwrap('vnns_wasm_get_last_accuracy', 'number', []);
    this._getLastLoss = M.cwrap('vnns_wasm_get_last_loss', 'number', []);

    this.ready = true;
  }

  /**
   * Build config JSON from NetworkManager topology + training params.
   * @param {NetworkManager} networkManager
   * @param {object} params - { optimizer, learningRate, batchSize, loss }
   * @returns {string} JSON config for vnns_wasm_create_network
   */
  buildConfigJSON(networkManager, params) {
    // Sort layers left-to-right by x position (visual order = network order)
    const layers = networkManager.getAllLayers()
      .sort((a, b) => a.position.x - b.position.x);

    if (layers.length < 2) {
      throw new Error('Need at least 2 layers (input + output)');
    }

    // Backend layers = transitions between visual layers
    // Backend layer i: input = neurons in visual layer i, output = neurons in visual layer i+1
    // activation = visual layer i+1's activation
    const numBackendLayers = layers.length - 1;
    const config = {
      num_layers: numBackendLayers
    };

    for (let i = 0; i < numBackendLayers; i++) {
      const fromLayer = layers[i];
      const toLayer = layers[i + 1];
      config[`layer_${i}_input`] = fromLayer.neurons.length;
      config[`layer_${i}_output`] = toLayer.neurons.length;
      config[`layer_${i}_activation`] = toLayer.activation || 'relu';
      config[`layer_${i}_bias`] = toLayer.useBias === false ? 0 : 1;
      config[`layer_${i}_init`] = toLayer.weightInit || 'xavier';
    }

    // Map frontend UI values to backend strings
    const optimizerMap = {
      'Adam': 'adam',
      'SGD': 'sgd',
      'SGD + Momentum': 'sgd_momentum',
      'RMSprop': 'rmsprop'
    };
    const lossMap = {
      'MSE': 'mse',
      'Binary CrossEntropy': 'binary_crossentropy',
      'Categorical CrossEntropy': 'categorical_crossentropy',
      'MAE': 'mae',
      'Huber': 'huber'
    };

    config.optimizer = optimizerMap[params.optimizer] || 'adam';
    config.loss = lossMap[params.loss] || 'mse';
    config.learning_rate = params.learningRate || 0.001;
    config.batch_size = params.batchSize || 32;
    config.momentum = 0.9;
    config.beta1 = 0.9;
    config.beta2 = 0.999;
    config.epsilon = 1e-8;
    config.clip_gradient = 5.0;

    return JSON.stringify(config);
  }

  /**
   * Create a network from the visual topology.
   * @param {NetworkManager} networkManager
   * @param {object} params
   * @returns {number} network id
   */
  createNetwork(networkManager, params) {
    if (!this.ready) throw new Error('WASM not initialized');
    if (this.netId >= 0) {
      this._freeNetwork(this.netId);
      this.netId = -1;
    }
    const configJson = this.buildConfigJSON(networkManager, params);
    this.netId = this._createNetwork(configJson);
    if (this.netId < 0) throw new Error('Failed to create network. Check layer sizes.');
    return this.netId;
  }

  /**
   * Allocate a Float32Array on the WASM heap and copy data in.
   */
  _allocFloats(arr) {
    const bytes = arr.length * 4;
    const ptr = this.module._malloc(bytes);
    for (let i = 0; i < arr.length; i++) {
      this.module.setValue(ptr + i * 4, arr[i], 'float');
    }
    return ptr;
  }

  /**
   * Train one epoch. Returns { loss, accuracy }.
   */
  trainEpoch(dataArr, labelsArr, sampleCount) {
    if (!this.ready || this.netId < 0) throw new Error('No network');
    const dataPtr = this._allocFloats(dataArr);
    const labelsPtr = this._allocFloats(labelsArr);
    const loss = this._trainEpoch(this.netId, dataPtr, labelsPtr, sampleCount);
    const accuracy = this._getLastAccuracy();
    this.module._free(dataPtr);
    this.module._free(labelsPtr);
    return { loss, accuracy };
  }

  /**
   * Evaluate on test data. Returns { loss, accuracy }.
   */
  evaluate(dataArr, labelsArr, sampleCount) {
    if (!this.ready || this.netId < 0) throw new Error('No network');
    const dataPtr = this._allocFloats(dataArr);
    const labelsPtr = this._allocFloats(labelsArr);
    this._evaluate(this.netId, dataPtr, labelsPtr, sampleCount);
    const accuracy = this._getLastAccuracy();
    const loss = this._getLastLoss();
    this.module._free(dataPtr);
    this.module._free(labelsPtr);
    return { loss, accuracy };
  }

  /**
   * Run prediction on a single input. Returns Float32Array of outputs.
   */
  predict(inputArr) {
    if (!this.ready || this.netId < 0) throw new Error('No network');
    const inPtr = this._allocFloats(inputArr);
    const outPtr = this._predict(this.netId, inPtr, inputArr.length);
    if (!outPtr) { this.module._free(inPtr); return null; }
    // Get network info to know output size
    const infoPtr = this._getNetworkInfo(this.netId);
    const infoStr = this.module.UTF8ToString(infoPtr);
    this._freePtr(infoPtr);
    const info = JSON.parse(infoStr);
    const result = new Float32Array(info.output_size);
    for (let i = 0; i < info.output_size; i++) {
      result[i] = this.module.getValue(outPtr + i * 4, 'float');
    }
    this._freePtr(outPtr);
    this.module._free(inPtr);
    return result;
  }

  /**
   * Get all weights as JSON.
   */
  getWeightsJSON() {
    if (!this.ready || this.netId < 0) return null;
    const ptr = this._getWeightsJson(this.netId);
    if (!ptr) return null;
    const str = this.module.UTF8ToString(ptr);
    this._freePtr(ptr);
    return JSON.parse(str);
  }

  /**
   * Get network info.
   */
  getNetworkInfo() {
    if (!this.ready || this.netId < 0) return null;
    const ptr = this._getNetworkInfo(this.netId);
    if (!ptr) return null;
    const str = this.module.UTF8ToString(ptr);
    this._freePtr(ptr);
    return JSON.parse(str);
  }

  setLearningRate(lr) {
    if (this.ready && this.netId >= 0) this._setLearningRate(this.netId, lr);
  }

  setBatchSize(bs) {
    if (this.ready && this.netId >= 0) this._setBatchSize(this.netId, bs);
  }

  destroy() {
    if (this.netId >= 0 && this.ready) {
      this._freeNetwork(this.netId);
      this.netId = -1;
    }
  }
}

/**
 * Prepare dataset arrays for WASM training.
 * @param {object} dataset - { headers, rows, columns }
 * @param {object} splitConfig - { train%, val%, shuffle, seed }
 * @returns {{ trainData, trainLabels, valData, valLabels, testData, testLabels, inputSize, outputSize, trainCount, valCount, testCount }}
 */
function prepareDatasetForWASM(dataset, splitConfig) {
  const featureCols = [];
  const targetCols = [];

  dataset.columns.forEach((col, i) => {
    if (col.role === 'feature') featureCols.push(i);
    else if (col.role === 'target') targetCols.push(i);
  });

  if (featureCols.length === 0) throw new Error('No feature columns selected');
  if (targetCols.length === 0) throw new Error('No target column selected');

  // Build flat arrays from rows
  const numRows = dataset.rows.length;
  const inputSize = featureCols.length;
  const outputSize = targetCols.length;

  // Extract values and apply normalization
  const featureStats = featureCols.map(i => {
    const col = dataset.columns[i];
    const vals = dataset.rows.map(r => parseFloat(r[i]) || 0);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { vals, mean, std, min, max, norm: col.normalization };
  });

  // Build normalized feature array
  const allFeatures = new Float32Array(numRows * inputSize);
  for (let r = 0; r < numRows; r++) {
    for (let f = 0; f < inputSize; f++) {
      let v = featureStats[f].vals[r];
      if (featureStats[f].norm === 'minmax') {
        const range = featureStats[f].max - featureStats[f].min;
        v = range > 0 ? (v - featureStats[f].min) / range : 0;
      } else if (featureStats[f].norm === 'standard') {
        v = (v - featureStats[f].mean) / featureStats[f].std;
      }
      allFeatures[r * inputSize + f] = v;
    }
  }

  // Build labels array
  const allLabels = new Float32Array(numRows * outputSize);
  for (let r = 0; r < numRows; r++) {
    for (let t = 0; t < outputSize; t++) {
      allLabels[r * outputSize + t] = parseFloat(dataset.rows[r][targetCols[t]]) || 0;
    }
  }

  // Shuffle if needed
  const indices = Array.from({ length: numRows }, (_, i) => i);
  if (splitConfig.shuffle) {
    // Seeded shuffle
    let seed = splitConfig.seed || 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
  }

  // Split
  const trainPct = splitConfig.train / 100;
  const valPct = splitConfig.val / 100;
  const trainEnd = Math.floor(numRows * trainPct);
  const valEnd = trainEnd + Math.floor(numRows * valPct);

  const trainCount = trainEnd;
  const valCount = valEnd - trainEnd;
  const testCount = numRows - valEnd;

  function sliceData(start, end) {
    const count = end - start;
    const data = new Float32Array(count * inputSize);
    const labels = new Float32Array(count * outputSize);
    for (let i = 0; i < count; i++) {
      const srcIdx = indices[start + i];
      for (let f = 0; f < inputSize; f++) {
        data[i * inputSize + f] = allFeatures[srcIdx * inputSize + f];
      }
      for (let t = 0; t < outputSize; t++) {
        labels[i * outputSize + t] = allLabels[srcIdx * outputSize + t];
      }
    }
    return { data, labels };
  }

  const train = sliceData(0, trainEnd);
  const val = valCount > 0 ? sliceData(trainEnd, valEnd) : { data: new Float32Array(0), labels: new Float32Array(0) };
  const test = testCount > 0 ? sliceData(valEnd, numRows) : { data: new Float32Array(0), labels: new Float32Array(0) };

  return {
    trainData: train.data,
    trainLabels: train.labels,
    valData: val.data,
    valLabels: val.labels,
    testData: test.data,
    testLabels: test.labels,
    inputSize,
    outputSize,
    trainCount,
    valCount,
    testCount,
    featureStats: featureStats.map(s => ({ mean: s.mean, std: s.std, min: s.min, max: s.max, norm: s.norm })),
    featureCols,
    targetCols
  };
}

window.WASMBridge = WASMBridge;
window.prepareDatasetForWASM = prepareDatasetForWASM;
