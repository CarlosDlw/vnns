(() => {
  window.VNNSModules = window.VNNSModules || {};

  window.VNNSModules.createTrainingUI = function createTrainingUI(deps) {
    const getDataset = deps.getDataset;
    const getNetwork = deps.getNetwork;
    const getViewport = deps.getViewport;
    const render = deps.render;
    const switchPanel = deps.switchPanel;
    const resetPropertiesCache = deps.resetPropertiesCache;

    const lrSlider = document.getElementById('lr-slider');
    const lrValue = document.getElementById('lr-value');
    const epochsSlider = document.getElementById('epochs-slider');
    const epochsValue = document.getElementById('epochs-value');
    const batchSlider = document.getElementById('batch-slider');
    const batchValue = document.getElementById('batch-value');

    if (lrSlider && lrValue) {
      lrSlider.addEventListener('input', () => {
        lrValue.textContent = parseFloat(lrSlider.value).toFixed(6);
      });
    }

    if (epochsSlider && epochsValue) {
      epochsSlider.addEventListener('input', () => {
        epochsValue.textContent = parseInt(epochsSlider.value).toLocaleString();
      });
    }

    if (batchSlider && batchValue) {
      batchSlider.addEventListener('input', () => {
        batchValue.textContent = parseInt(batchSlider.value).toString();
      });
    }

    const paramConfigs = [
      { valueEl: document.getElementById('lr-value'), inputEl: document.getElementById('lr-input'), sliderEl: document.getElementById('lr-slider'), decimals: 6 },
      { valueEl: document.getElementById('epochs-value'), inputEl: document.getElementById('epochs-input'), sliderEl: document.getElementById('epochs-slider'), decimals: 0 },
      { valueEl: document.getElementById('batch-value'), inputEl: document.getElementById('batch-input'), sliderEl: document.getElementById('batch-slider'), decimals: 0 }
    ];

    paramConfigs.forEach((config) => {
      const { valueEl, inputEl, sliderEl, decimals } = config;
      if (!valueEl || !inputEl || !sliderEl) return;

      valueEl.addEventListener('click', () => {
        valueEl.classList.add('hidden');
        inputEl.classList.add('visible');
        inputEl.focus();
        inputEl.select();
      });

      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          inputEl.blur();
        }
        if (e.key === 'Escape') {
          inputEl.value = valueEl.textContent.replace(/,/g, '');
          inputEl.blur();
        }
      });

      inputEl.addEventListener('input', () => {
        let raw = inputEl.value.replace(/[^0-9.\-]/g, '');
        const parts = raw.split('.');
        if (parts.length > 2) {
          raw = parts[0] + '.' + parts.slice(1).join('');
        }
        if (raw !== inputEl.value) {
          inputEl.value = raw;
        }
      });

      inputEl.addEventListener('blur', () => {
        const min = parseFloat(inputEl.dataset.min);
        const max = parseFloat(inputEl.dataset.max);
        let val = parseFloat(inputEl.value);

        if (isNaN(val)) {
          val = parseFloat(sliderEl.value);
        }

        val = Math.max(min, Math.min(max, val));
        sliderEl.value = val;
        sliderEl.dispatchEvent(new Event('input'));

        const displayValue = decimals === 0 ? parseInt(val).toLocaleString() : parseFloat(val).toFixed(decimals);
        valueEl.textContent = displayValue;
        valueEl.classList.remove('hidden');
        inputEl.classList.remove('visible');
      });
    });

    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          display: true,
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#969696', font: { size: 9 }, maxTicksLimit: 5 }
        },
        y: {
          display: true,
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#969696', font: { size: 9 } }
        }
      },
      animation: false
    };

    const lossCtx = document.getElementById('loss-chart').getContext('2d');
    const lossChart = new Chart(lossCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: '#f48771',
          backgroundColor: 'rgba(244, 135, 113, 0.1)',
          borderWidth: 1.5,
          fill: true,
          pointRadius: 0,
          tension: 0.3
        }]
      },
      options: chartDefaults
    });

    const accuracyCtx = document.getElementById('accuracy-chart').getContext('2d');
    const accuracyChart = new Chart(accuracyCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: '#89d185',
          backgroundColor: 'rgba(137, 209, 133, 0.1)',
          borderWidth: 1.5,
          fill: true,
          pointRadius: 0,
          tension: 0.3
        }]
      },
      options: chartDefaults
    });

    function updateMetrics(epoch, loss, accuracy) {
      document.getElementById('metric-epoch').textContent = epoch;
      document.getElementById('metric-loss').textContent = loss.toFixed(6);
      document.getElementById('metric-accuracy').textContent = (accuracy * 100).toFixed(2) + '%';

      lossChart.data.labels.push(epoch);
      lossChart.data.datasets[0].data.push(loss);
      lossChart.update();

      accuracyChart.data.labels.push(epoch);
      accuracyChart.data.datasets[0].data.push(accuracy);
      accuracyChart.update();
    }

    window.updateMetrics = updateMetrics;

    const outputLog = document.getElementById('output-log');
    function logOutput(msg, level = 'info') {
      if (!outputLog) return;
      const line = document.createElement('div');
      line.className = `log-line log-${level}`;
      const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      line.innerHTML = `<span class="log-time">[${time}]</span>${msg}`;
      outputLog.appendChild(line);
      outputLog.scrollTop = outputLog.scrollHeight;
    }

    const clearOutputBtn = document.getElementById('output-clear');
    if (clearOutputBtn) {
      clearOutputBtn.addEventListener('click', () => {
        outputLog.innerHTML = '';
      });
    }

    const wasmBridge = new WASMBridge();
    const trainingState = {
      running: false,
      paused: false,
      epoch: 0,
      maxEpochs: 1000,
      preparedData: null,
      startTime: 0,
      animFrameId: null
    };

    const neuronActivations = new Map();

    function resetMetrics() {
      document.getElementById('metric-epoch').textContent = '0';
      document.getElementById('metric-loss').textContent = '-';
      document.getElementById('metric-accuracy').textContent = '-';
      document.getElementById('metric-time').textContent = '00:00';
      lossChart.data.labels = [];
      lossChart.data.datasets[0].data = [];
      lossChart.update();
      accuracyChart.data.labels = [];
      accuracyChart.data.datasets[0].data = [];
      accuracyChart.update();
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

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

    function setTrainingButtonStates(running, paused) {
      const play = document.getElementById('train-play');
      const pause = document.getElementById('train-pause');
      const stop = document.getElementById('train-stop');
      const step = document.getElementById('train-step');
      if (!play || !pause || !stop || !step) return;
      play.disabled = running && !paused;
      pause.disabled = !running || paused;
      stop.disabled = !running;
      step.disabled = running && !paused;
    }

    function invalidateBackendNetwork() {
      if (wasmBridge.netId < 0) return;
      if (trainingState.running) {
        trainingState.running = false;
        trainingState.paused = false;
        if (trainingState.animFrameId) {
          cancelAnimationFrame(trainingState.animFrameId);
          trainingState.animFrameId = null;
        }
        setTrainingButtonStates(false, false);
        logOutput('Training stopped - network or data changed', 'warning');
      }
      wasmBridge.destroy();
      trainingState.preparedData = null;
    }

    function syncWeightsFromBackend() {
      const network = getNetwork();
      const weightsData = wasmBridge.getWeightsJSON();
      if (!weightsData || !weightsData.weights || !network) return;

      const sortedLayers = network.getAllLayers().sort((a, b) => a.position.x - b.position.x);
      let wIdx = 0;
      const connections = network.getAllConnections();

      for (let i = 0; i < sortedLayers.length - 1; i++) {
        const fromNeurons = network.getNeuronsByLayer(sortedLayers[i].id);
        const toNeurons = network.getNeuronsByLayer(sortedLayers[i + 1].id);

        for (let from = 0; from < fromNeurons.length; from++) {
          for (let to = 0; to < toNeurons.length; to++) {
            if (wIdx >= weightsData.weights.length) continue;
            const conn = connections.find((c) => c.fromNeuron === fromNeurons[from].id && c.toNeuron === toNeurons[to].id);
            if (conn) conn.weight = weightsData.weights[wIdx];
            wIdx++;
          }
        }

        const toLayer = sortedLayers[i + 1];
        if (toLayer.useBias !== false) {
          for (let to = 0; to < toNeurons.length; to++) {
            if (wIdx >= weightsData.weights.length) continue;
            toNeurons[to].bias = weightsData.weights[wIdx];
            wIdx++;
          }
        }
      }

      if (typeof resetPropertiesCache === 'function') resetPropertiesCache();
      if (typeof render === 'function') render();
    }

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
      const network = getNetwork();
      neuronActivations.clear();
      if (!network) return;
      const sortedLayers = network.getAllLayers().sort((a, b) => a.position.x - b.position.x);
      if (sortedLayers.length === 0) return;

      const inputNeurons = network.getNeuronsByLayer(sortedLayers[0].id);
      inputNeurons.forEach((n, i) => {
        neuronActivations.set(n.id, inputValues && i < inputValues.length ? inputValues[i] : 0);
      });

      for (let l = 1; l < sortedLayers.length; l++) {
        const layer = sortedLayers[l];
        const toNeurons = network.getNeuronsByLayer(layer.id);
        const activation = layer.activation || 'relu';
        const rawValues = [];
        toNeurons.forEach((toN) => {
          let sum = toN.bias || 0;
          const conns = network.getAllConnections().filter((c) => c.toNeuron === toN.id);
          conns.forEach((c) => {
            const fromAct = neuronActivations.get(c.fromNeuron) || 0;
            sum += fromAct * (c.weight || 0);
          });
          rawValues.push({ neuron: toN, sum });
        });

        if (activation.toLowerCase() === 'softmax') {
          const maxVal = Math.max(...rawValues.map((r) => r.sum));
          const exps = rawValues.map((r) => Math.exp(r.sum - maxVal));
          const sumExp = exps.reduce((a, b) => a + b, 0);
          rawValues.forEach((r, i) => {
            neuronActivations.set(r.neuron.id, exps[i] / sumExp);
          });
        } else {
          rawValues.forEach((r) => {
            neuronActivations.set(r.neuron.id, applyActivationFn(r.sum, activation));
          });
        }
      }
    }

    function runActivationVisualization() {
      const viewport = getViewport();
      if (!viewport || !viewport.showActivations) {
        neuronActivations.clear();
        return;
      }
      if (!trainingState.preparedData || !trainingState.preparedData.trainData) return;

      const d = trainingState.preparedData;
      const sampleIdx = Math.floor(Math.random() * d.trainCount);
      const inputValues = [];
      for (let i = 0; i < d.inputSize; i++) {
        inputValues.push(d.trainData[sampleIdx * d.inputSize + i]);
      }
      computeActivations(inputValues);
      if (typeof render === 'function') render();
    }

    function stopTraining() {
      const viewport = getViewport();
      trainingState.running = false;
      trainingState.paused = false;
      if (trainingState.animFrameId) {
        cancelAnimationFrame(trainingState.animFrameId);
        trainingState.animFrameId = null;
      }
      setTrainingButtonStates(false, false);
      logOutput(`Training stopped at epoch ${trainingState.epoch}`);
      syncWeightsFromBackend();
      if (viewport && viewport.showActivations) runActivationVisualization();
    }

    function runTrainingStep() {
      const viewport = getViewport();
      if (!trainingState.running || trainingState.paused) return;
      const d = trainingState.preparedData;
      const epochsPerFrame = Math.max(1, Math.min(10, Math.floor(trainingState.maxEpochs / 200)));
      let lastResult = null;

      for (let i = 0; i < epochsPerFrame; i++) {
        if (trainingState.epoch >= trainingState.maxEpochs) break;
        lastResult = wasmBridge.trainEpoch(d.trainData, d.trainLabels, d.trainCount);
        trainingState.epoch++;
      }

      if (lastResult) {
        const elapsed = Date.now() - trainingState.startTime;
        updateMetrics(trainingState.epoch, lastResult.loss, lastResult.accuracy);
        document.getElementById('metric-time').textContent = formatTime(elapsed);
        if (viewport && viewport.showActivations && trainingState.epoch % 50 === 0) {
          syncWeightsFromBackend();
          runActivationVisualization();
        }
      }

      if (trainingState.epoch >= trainingState.maxEpochs) {
        stopTraining();
        logOutput(`Training complete - ${trainingState.epoch} epochs in ${formatTime(Date.now() - trainingState.startTime)}`, 'success');
        if (lastResult) {
          logOutput(`Train - Loss: ${lastResult.loss.toFixed(6)}, Accuracy: ${(lastResult.accuracy * 100).toFixed(2)}%`, 'info');
        }
        if (d.testCount > 0) {
          const evalResult = wasmBridge.evaluate(d.testData, d.testLabels, d.testCount);
          logOutput(`Test - Loss: ${evalResult.loss.toFixed(6)}, Accuracy: ${(evalResult.accuracy * 100).toFixed(2)}%`, 'success');
        }
        return;
      }

      trainingState.animFrameId = requestAnimationFrame(runTrainingStep);
    }

    function startTraining() {
      const dataset = getDataset();
      const network = getNetwork();

      if (!wasmBridge.ready) {
        alert('WASM backend is not loaded yet. Please wait.');
        return;
      }
      if (!dataset || dataset.rows.length === 0) {
        alert('Load a dataset first (Dataset panel).');
        return;
      }
      const layers = network.getAllLayers();
      if (layers.length < 2) {
        alert('Need at least 2 layers (input + output).');
        return;
      }
      const emptyLayer = layers.find((l) => l.neurons.length === 0);
      if (emptyLayer) {
        alert(`Layer "${emptyLayer.name}" has no neurons. All layers need at least 1 neuron.`);
        return;
      }

      try {
        const params = getTrainingParams();
        const splitConfig = getSplitConfig();
        const preparedData = prepareDatasetForWASM(dataset, splitConfig);
        const sortedLayers = layers.sort((a, b) => a.position.x - b.position.x);
        const firstLayerNeurons = sortedLayers[0].neurons.length;
        const lastLayerNeurons = sortedLayers[sortedLayers.length - 1].neurons.length;

        if (preparedData.inputSize !== firstLayerNeurons) {
          alert(`Input size mismatch: dataset has ${preparedData.inputSize} features but first layer "${sortedLayers[0].name}" has ${firstLayerNeurons} neurons.`);
          return;
        }
        if (preparedData.outputSize !== lastLayerNeurons) {
          alert(`Output size mismatch: dataset has ${preparedData.outputSize} targets but last layer "${sortedLayers[sortedLayers.length - 1].name}" has ${lastLayerNeurons} neurons.`);
          return;
        }

        wasmBridge.createNetwork(network, params);
        logOutput(`Training started - ${params.epochs} epochs, LR=${params.learningRate}, Batch=${params.batchSize}, Optimizer=${params.optimizer}, Loss=${params.loss}`);
        logOutput(`Dataset split - Train: ${preparedData.trainCount}, Val: ${preparedData.valCount}, Test: ${preparedData.testCount} samples`);
        logOutput(`Network - ${sortedLayers.map((l) => l.neurons.length).join(' -> ')} (${sortedLayers.length} layers)`);

        resetMetrics();
        trainingState.running = true;
        trainingState.paused = false;
        trainingState.epoch = 0;
        trainingState.maxEpochs = params.epochs;
        trainingState.preparedData = preparedData;
        trainingState.startTime = Date.now();
        setTrainingButtonStates(true, false);
        switchPanel('train');
        trainingState.animFrameId = requestAnimationFrame(runTrainingStep);
      } catch (err) {
        logOutput(`Training error: ${err.message}`, 'error');
      }
    }

    function pauseTraining() {
      if (!trainingState.running) return;
      trainingState.paused = true;
      if (trainingState.animFrameId) {
        cancelAnimationFrame(trainingState.animFrameId);
        trainingState.animFrameId = null;
      }
      setTrainingButtonStates(true, true);
      logOutput(`Training paused at epoch ${trainingState.epoch}`);
    }

    function resumeTraining() {
      if (!trainingState.running || !trainingState.paused) return;
      trainingState.paused = false;
      setTrainingButtonStates(true, false);
      logOutput('Training resumed');
      trainingState.animFrameId = requestAnimationFrame(runTrainingStep);
    }

    function stepTraining() {
      const dataset = getDataset();
      const network = getNetwork();
      if (!wasmBridge.ready) {
        alert('WASM backend is not loaded yet.');
        return;
      }

      if (wasmBridge.netId < 0) {
        if (!dataset || dataset.rows.length === 0) {
          alert('Load a dataset first.');
          return;
        }
        const layers = network.getAllLayers();
        if (layers.length < 2) {
          alert('Need at least 2 layers.');
          return;
        }
        try {
          const params = getTrainingParams();
          const splitConfig = getSplitConfig();
          trainingState.preparedData = prepareDatasetForWASM(dataset, splitConfig);
          const sortedLayers = layers.sort((a, b) => a.position.x - b.position.x);
          if (trainingState.preparedData.inputSize !== sortedLayers[0].neurons.length) {
            alert('Input size mismatch.');
            return;
          }
          if (trainingState.preparedData.outputSize !== sortedLayers[sortedLayers.length - 1].neurons.length) {
            alert('Output size mismatch.');
            return;
          }

          wasmBridge.createNetwork(network, params);
          resetMetrics();
          trainingState.epoch = 0;
          trainingState.maxEpochs = params.epochs;
          trainingState.startTime = Date.now();
          trainingState.running = true;
          trainingState.paused = true;
        } catch (err) {
          alert(`Error: ${err.message}`);
          return;
        }
      }

      const d = trainingState.preparedData;
      if (!d) return;
      const result = wasmBridge.trainEpoch(d.trainData, d.trainLabels, d.trainCount);
      trainingState.epoch++;
      const elapsed = Date.now() - trainingState.startTime;
      updateMetrics(trainingState.epoch, result.loss, result.accuracy);
      document.getElementById('metric-time').textContent = formatTime(elapsed);
      setTrainingButtonStates(true, true);
    }

    const playBtn = document.getElementById('train-play');
    const pauseBtn = document.getElementById('train-pause');
    const stopBtn = document.getElementById('train-stop');
    const stepBtn = document.getElementById('train-step');

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (trainingState.running && trainingState.paused) resumeTraining();
        else if (!trainingState.running) startTraining();
      });
    }
    if (pauseBtn) pauseBtn.addEventListener('click', pauseTraining);
    if (stopBtn) stopBtn.addEventListener('click', stopTraining);
    if (stepBtn) stepBtn.addEventListener('click', stepTraining);

    if (lrSlider) {
      lrSlider.addEventListener('input', () => {
        wasmBridge.setLearningRate(parseFloat(lrSlider.value));
      });
    }
    if (batchSlider) {
      batchSlider.addEventListener('input', () => {
        wasmBridge.setBatchSize(parseInt(batchSlider.value));
      });
    }

    const optimizerSelect = document.getElementById('optimizer-select');
    const lossSelect = document.getElementById('loss-select');
    if (optimizerSelect) optimizerSelect.addEventListener('change', invalidateBackendNetwork);
    if (lossSelect) lossSelect.addEventListener('change', invalidateBackendNetwork);

    wasmBridge.init().then(() => {
      logOutput('WASM backend ready', 'success');
    }).catch((err) => {
      logOutput(`WASM init failed: ${err}`, 'error');
    });

    setTrainingButtonStates(false, false);

    return {
      wasmBridge,
      trainingState,
      neuronActivations,
      logOutput,
      invalidateBackendNetwork,
      syncWeightsFromBackend,
      runActivationVisualization,
      applyActivationFn,
      computeActivations,
      getTrainingParams,
      getSplitConfig,
      startTraining,
      pauseTraining,
      resumeTraining,
      stopTraining,
      stepTraining
    };
  };
})();
