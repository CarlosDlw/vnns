document.addEventListener('DOMContentLoaded', () => {
  const handle = document.getElementById('resize-handle');
  const panelTop = document.getElementById('panel-top');
  const panelBottom = document.getElementById('panel-bottom');
  const rightPanel = document.querySelector('.right-panel');
  let isResizing = false;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    handle.classList.add('active');
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const panelRect = rightPanel.getBoundingClientRect();
    const offset = e.clientY - panelRect.top;
    const totalHeight = panelRect.height - 4;

    const clampedOffset = Math.max(50, Math.min(offset, totalHeight - 50));

    panelTop.style.flex = 'none';
    panelBottom.style.flex = 'none';
    panelTop.style.height = clampedOffset + 'px';
    panelBottom.style.height = (totalHeight - clampedOffset) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      handle.classList.remove('active');
      document.body.style.cursor = '';
    }
  });

  // Menubar dropdowns
  const menuItems = document.querySelectorAll('.menubar .menu-item');
  let activeMenu = null;

  function closeAllMenus() {
    menuItems.forEach(m => m.classList.remove('active'));
    activeMenu = null;
  }

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.classList.contains('active')) {
        closeAllMenus();
      } else {
        closeAllMenus();
        item.classList.add('active');
        activeMenu = item;
      }
    });

    item.addEventListener('mouseenter', () => {
      if (activeMenu && activeMenu !== item) {
        closeAllMenus();
        item.classList.add('active');
        activeMenu = item;
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (activeMenu && !e.target.closest('.menubar')) {
      closeAllMenus();
    }
  });

  document.querySelectorAll('.menu-dropdown-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      const action = btn.dataset.action;
      if (action) handleMenuAction(action);
    });
  });

  const leftActivityIcons = document.querySelectorAll('.activitybar .activity-icon');
  const sidebarViews = document.querySelectorAll('.sidebar-view');

  leftActivityIcons.forEach(icon => {
    icon.addEventListener('click', () => {
      const viewId = icon.dataset.view;

      leftActivityIcons.forEach(i => i.classList.remove('active'));
      icon.classList.add('active');

      sidebarViews.forEach(view => {
        view.classList.remove('active');
        if (view.id === `view-${viewId}`) {
          view.classList.add('active');
        }
      });
    });
  });

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
    { valueEl: document.getElementById('batch-value'), inputEl: document.getElementById('batch-input'), sliderEl: document.getElementById('batch-slider'), decimals: 0 },
  ];

  paramConfigs.forEach(config => {
    const { valueEl, inputEl, sliderEl, decimals } = config;

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

    inputEl.addEventListener('input', (e) => {
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

      if (sliderEl) {
        sliderEl.value = val;
        sliderEl.dispatchEvent(new Event('input'));
      }

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

  window.updateMetrics = function(epoch, loss, accuracy) {
    document.getElementById('metric-epoch').textContent = epoch;
    document.getElementById('metric-loss').textContent = loss.toFixed(6);
    document.getElementById('metric-accuracy').textContent = (accuracy * 100).toFixed(2) + '%';

    lossChart.data.labels.push(epoch);
    lossChart.data.datasets[0].data.push(loss);
    lossChart.update();

    accuracyChart.data.labels.push(epoch);
    accuracyChart.data.datasets[0].data.push(accuracy);
    accuracyChart.update();
  };

  // --- Output Log ---
  const outputLog = document.getElementById('output-log');
  function logOutput(msg, level = 'info') {
    const line = document.createElement('div');
    line.className = 'log-line log-' + level;
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.innerHTML = `<span class="log-time">[${time}]</span>${msg}`;
    outputLog.appendChild(line);
    outputLog.scrollTop = outputLog.scrollHeight;
  }
  document.getElementById('output-clear').addEventListener('click', () => {
    outputLog.innerHTML = '';
  });

  // --- WASM Training Integration ---
  const wasmBridge = new WASMBridge();
  let trainingState = {
    running: false,
    paused: false,
    epoch: 0,
    maxEpochs: 1000,
    preparedData: null,
    startTime: 0,
    animFrameId: null
  };

  /**
   * Invalidate the backend WASM network.
   * Called when topology, dataset, or non-live params change so that
   * stale backend state is never used for training or prediction.
   */
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
      logOutput('Training stopped — network or data changed', 'warning');
    }
    wasmBridge.destroy();
    trainingState.preparedData = null;
  }

  // Init WASM on load
  wasmBridge.init().then(() => {
    logOutput('WASM backend ready', 'success');
  }).catch(err => {
    logOutput('WASM init failed: ' + err, 'error');
  });

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

  function setTrainingButtonStates(running, paused) {
    document.getElementById('train-play').disabled = running && !paused;
    document.getElementById('train-pause').disabled = !running || paused;
    document.getElementById('train-stop').disabled = !running;
    document.getElementById('train-step').disabled = running && !paused;
  }

  function runTrainingStep() {
    if (!trainingState.running || trainingState.paused) return;

    const d = trainingState.preparedData;
    // Run multiple epochs per frame for faster training
    const epochsPerFrame = Math.max(1, Math.min(10, Math.floor(trainingState.maxEpochs / 200)));
    let lastResult = null;

    for (let i = 0; i < epochsPerFrame; i++) {
      if (trainingState.epoch >= trainingState.maxEpochs) break;
      lastResult = wasmBridge.trainEpoch(d.trainData, d.trainLabels, d.trainCount);
      trainingState.epoch++;
    }

    if (lastResult) {
      const elapsed = Date.now() - trainingState.startTime;
      window.updateMetrics(trainingState.epoch, lastResult.loss, lastResult.accuracy);
      document.getElementById('metric-time').textContent = formatTime(elapsed);

      // Update activation visualization every 50 epochs
      if (viewport.showActivations && trainingState.epoch % 50 === 0) {
        syncWeightsFromBackend();
        runActivationVisualization();
      }
    }

    if (trainingState.epoch >= trainingState.maxEpochs) {
      stopTraining();
      logOutput(`Training complete — ${trainingState.epoch} epochs in ${formatTime(Date.now() - trainingState.startTime)}`, 'success');
      if (lastResult) {
        logOutput(`Train — Loss: ${lastResult.loss.toFixed(6)}, Accuracy: ${(lastResult.accuracy * 100).toFixed(2)}%`, 'info');
      }
      if (d.testCount > 0) {
        const evalResult = wasmBridge.evaluate(d.testData, d.testLabels, d.testCount);
        logOutput(`Test — Loss: ${evalResult.loss.toFixed(6)}, Accuracy: ${(evalResult.accuracy * 100).toFixed(2)}%`, 'success');
      }
      return;
    }

    trainingState.animFrameId = requestAnimationFrame(runTrainingStep);
  }

  function startTraining() {
    if (!wasmBridge.ready) {
      alert('WASM backend is not loaded yet. Please wait.');
      return;
    }

    if (dataset.rows.length === 0) {
      alert('Load a dataset first (Dataset panel).');
      return;
    }

    const layers = network.getAllLayers();
    if (layers.length < 2) {
      alert('Need at least 2 layers (input + output).');
      return;
    }

    // Check layers have neurons
    const emptyLayer = layers.find(l => l.neurons.length === 0);
    if (emptyLayer) {
      alert(`Layer "${emptyLayer.name}" has no neurons. All layers need at least 1 neuron.`);
      return;
    }

    try {
      const params = getTrainingParams();
      const splitConfig = getSplitConfig();
      const preparedData = prepareDatasetForWASM(dataset, splitConfig);

      // Validate input/output size matches network
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

      // Create the backend network
      wasmBridge.createNetwork(network, params);
      logOutput(`Training started — ${params.epochs} epochs, LR=${params.learningRate}, Batch=${params.batchSize}, Optimizer=${params.optimizer}, Loss=${params.loss}`);
      logOutput(`Dataset split — Train: ${preparedData.trainCount}, Val: ${preparedData.valCount}, Test: ${preparedData.testCount} samples`);
      logOutput(`Network — ${sortedLayers.map(l => l.neurons.length).join(' → ')} (${sortedLayers.length} layers)`);

      resetMetrics();
      trainingState.running = true;
      trainingState.paused = false;
      trainingState.epoch = 0;
      trainingState.maxEpochs = params.epochs;
      trainingState.preparedData = preparedData;
      trainingState.startTime = Date.now();
      setTrainingButtonStates(true, false);

      // Switch to train panel to show progress
      switchPanel('train');

      trainingState.animFrameId = requestAnimationFrame(runTrainingStep);
    } catch (err) {
      logOutput('Training error: ' + err.message, 'error');
    }
  }

  function pauseTraining() {
    if (trainingState.running) {
      trainingState.paused = true;
      if (trainingState.animFrameId) {
        cancelAnimationFrame(trainingState.animFrameId);
        trainingState.animFrameId = null;
      }
      setTrainingButtonStates(true, true);
      logOutput('Training paused at epoch ' + trainingState.epoch);
    }
  }

  function resumeTraining() {
    if (trainingState.running && trainingState.paused) {
      trainingState.paused = false;
      setTrainingButtonStates(true, false);
      logOutput('Training resumed');
      trainingState.animFrameId = requestAnimationFrame(runTrainingStep);
    }
  }

  function stopTraining() {
    trainingState.running = false;
    trainingState.paused = false;
    if (trainingState.animFrameId) {
      cancelAnimationFrame(trainingState.animFrameId);
      trainingState.animFrameId = null;
    }
    setTrainingButtonStates(false, false);
    logOutput(`Training stopped at epoch ${trainingState.epoch}`);

    // Sync weights back to frontend connections
    syncWeightsFromBackend();
    if (viewport.showActivations) runActivationVisualization();
  }

  function stepTraining() {
    if (!wasmBridge.ready) {
      alert('WASM backend is not loaded yet.');
      return;
    }

    // If no network exists yet, start fresh
    if (wasmBridge.netId < 0) {
      if (dataset.rows.length === 0) {
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
          alert(`Input size mismatch.`);
          return;
        }
        if (trainingState.preparedData.outputSize !== sortedLayers[sortedLayers.length - 1].neurons.length) {
          alert(`Output size mismatch.`);
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
        alert('Error: ' + err.message);
        return;
      }
    }

    const d = trainingState.preparedData;
    if (!d) return;

    const result = wasmBridge.trainEpoch(d.trainData, d.trainLabels, d.trainCount);
    trainingState.epoch++;
    const elapsed = Date.now() - trainingState.startTime;
    window.updateMetrics(trainingState.epoch, result.loss, result.accuracy);
    document.getElementById('metric-time').textContent = formatTime(elapsed);
    setTrainingButtonStates(true, true);
  }

  function syncWeightsFromBackend() {
    const weightsData = wasmBridge.getWeightsJSON();
    if (!weightsData || !weightsData.weights) return;

    const sortedLayers = network.getAllLayers().sort((a, b) => a.position.x - b.position.x);
    let wIdx = 0;

    for (let i = 0; i < sortedLayers.length - 1; i++) {
      const fromNeurons = network.getNeuronsByLayer(sortedLayers[i].id);
      const toNeurons = network.getNeuronsByLayer(sortedLayers[i + 1].id);

      // Backend stores all weights first, then all biases per layer
      // Weight order: weights[from * output_size + to] (input-major)
      for (let from = 0; from < fromNeurons.length; from++) {
        for (let to = 0; to < toNeurons.length; to++) {
          if (wIdx < weightsData.weights.length) {
            const conn = network.getAllConnections().find(
              c => c.fromNeuron === fromNeurons[from].id && c.toNeuron === toNeurons[to].id
            );
            if (conn) {
              conn.weight = weightsData.weights[wIdx];
            }
            wIdx++;
          }
        }
      }
      // Biases come after all weights for this layer
      const toLayer = sortedLayers[i + 1];
      if (toLayer.useBias !== false) {
        for (let to = 0; to < toNeurons.length; to++) {
          if (wIdx < weightsData.weights.length) {
            toNeurons[to].bias = weightsData.weights[wIdx];
            wIdx++;
          }
        }
      }
    }

    _lastPropsKey = '';
    render();
  }

  // --- Neuron Activation Visualization ---
  let neuronActivations = new Map(); // neuronId -> activation value (0..1)

  function applyActivationFn(x, fn) {
    switch ((fn || '').toLowerCase()) {
      case 'relu': return Math.max(0, x);
      case 'leakyrelu': return x > 0 ? x : 0.01 * x;
      case 'sigmoid': return 1 / (1 + Math.exp(-x));
      case 'tanh': return Math.tanh(x);
      case 'softmax': return x; // handled per-layer
      case 'elu': return x >= 0 ? x : Math.exp(x) - 1;
      case 'gelu': return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));
      case 'swish': return x / (1 + Math.exp(-x));
      default: return x; // linear
    }
  }

  function computeActivations(inputValues) {
    neuronActivations.clear();
    const sortedLayers = network.getAllLayers().sort((a, b) => a.position.x - b.position.x);
    if (sortedLayers.length === 0) return;

    // Set input layer activations
    const inputNeurons = network.getNeuronsByLayer(sortedLayers[0].id);
    inputNeurons.forEach((n, i) => {
      neuronActivations.set(n.id, inputValues && i < inputValues.length ? inputValues[i] : 0);
    });

    // Forward through each subsequent layer
    for (let l = 1; l < sortedLayers.length; l++) {
      const layer = sortedLayers[l];
      const toNeurons = network.getNeuronsByLayer(layer.id);
      const activation = layer.activation || 'relu';
      const rawValues = [];

      toNeurons.forEach(toN => {
        let sum = toN.bias || 0;
        // Sum weighted inputs from all connections TO this neuron
        const conns = network.getAllConnections().filter(c => c.toNeuron === toN.id);
        conns.forEach(c => {
          const fromAct = neuronActivations.get(c.fromNeuron) || 0;
          sum += fromAct * (c.weight || 0);
        });
        rawValues.push({ neuron: toN, sum });
      });

      // Apply activation
      if (activation.toLowerCase() === 'softmax') {
        const maxVal = Math.max(...rawValues.map(r => r.sum));
        const exps = rawValues.map(r => Math.exp(r.sum - maxVal));
        const sumExp = exps.reduce((a, b) => a + b, 0);
        rawValues.forEach((r, i) => {
          neuronActivations.set(r.neuron.id, exps[i] / sumExp);
        });
      } else {
        rawValues.forEach(r => {
          neuronActivations.set(r.neuron.id, applyActivationFn(r.sum, activation));
        });
      }
    }
  }

  function runActivationVisualization() {
    if (!viewport.showActivations) { neuronActivations.clear(); return; }
    if (!trainingState.preparedData || !trainingState.preparedData.trainData) return;

    const d = trainingState.preparedData;
    // Pick a random sample from training data
    const sampleIdx = Math.floor(Math.random() * d.trainCount);
    const inputValues = [];
    for (let i = 0; i < d.inputSize; i++) {
      inputValues.push(d.trainData[sampleIdx * d.inputSize + i]);
    }
    computeActivations(inputValues);
    render();
  }

  // Wire training buttons
  document.getElementById('train-play').addEventListener('click', () => {
    if (trainingState.running && trainingState.paused) {
      resumeTraining();
    } else if (!trainingState.running) {
      startTraining();
    }
  });

  document.getElementById('train-pause').addEventListener('click', () => {
    pauseTraining();
  });

  document.getElementById('train-stop').addEventListener('click', () => {
    stopTraining();
  });

  document.getElementById('train-step').addEventListener('click', () => {
    stepTraining();
  });

  // Update backend hyperparams on change
  document.getElementById('lr-slider').addEventListener('input', () => {
    wasmBridge.setLearningRate(parseFloat(document.getElementById('lr-slider').value));
  });

  document.getElementById('batch-slider').addEventListener('input', () => {
    wasmBridge.setBatchSize(parseInt(document.getElementById('batch-slider').value));
  });

  // Invalidate backend when optimizer or loss function changes
  document.getElementById('optimizer-select').addEventListener('change', () => {
    invalidateBackendNetwork();
  });
  document.getElementById('loss-select').addEventListener('change', () => {
    invalidateBackendNetwork();
  });

  setTrainingButtonStates(false, false);

  const fileInput = document.getElementById('file-input');
  const btnUpload = document.getElementById('btn-upload');
  const btnPaste = document.getElementById('btn-paste');
  const btnUrl = document.getElementById('btn-url');
  const btnGenerate = document.getElementById('btn-generate');
  const urlGroup = document.getElementById('url-group');
  const fetchUrlBtn = document.getElementById('fetch-url-btn');
  const dataUrlInput = document.getElementById('data-url');

  let dataset = { headers: [], rows: [], columns: [] };

  btnUpload.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      if (file.name.endsWith('.csv')) parseCSV(text);
      else if (file.name.endsWith('.json')) parseJSON(text);
    };
    reader.readAsText(file);
  });

  btnPaste.addEventListener('click', () => {
    const data = prompt('Paste CSV or JSON data:');
    if (!data) return;
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) parseJSON(data);
      else parseCSV(data);
    } catch {
      parseCSV(data);
    }
  });

  btnUrl.addEventListener('click', () => {
    urlGroup.style.display = urlGroup.style.display === 'none' ? 'flex' : 'none';
  });

  fetchUrlBtn.addEventListener('click', async () => {
    const url = dataUrlInput.value.trim();
    if (!url) return;
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (url.endsWith('.csv')) parseCSV(text);
      else parseJSON(text);
    } catch (err) {
      alert('Failed to fetch data: ' + err.message);
    }
  });

  btnGenerate.addEventListener('click', () => {
    const rows = 200;
    const headers = ['x1', 'x2', 'x3', 'y'];
    const data = [];
    for (let i = 0; i < rows; i++) {
      const x1 = Math.random() * 10;
      const x2 = Math.random() * 5;
      const x3 = Math.random() * 2;
      const y = (x1 * 0.5 + x2 * 0.3 + x3 * 0.2 + Math.random() * 0.5) > 4 ? 1 : 0;
      data.push({ x1: +x1.toFixed(4), x2: +x2.toFixed(4), x3: +x3.toFixed(4), y });
    }
    parseJSON(JSON.stringify(data));
  });

  // --- Manual Dataset Editor ---
  const deModal = document.getElementById('dataset-editor-modal');
  const deHead = document.getElementById('de-head');
  const deBody = document.getElementById('de-body');
  const deRoles = document.getElementById('de-roles');
  const deInfo = document.getElementById('de-info');
  let deHeaders = [];
  let deRows = [];
  let deColRoles = [];

  function deUpdateInfo() {
    deInfo.textContent = `${deHeaders.length} cols × ${deRows.length} rows`;
  }

  function deRenderTable() {
    // Header row
    deHead.innerHTML = '<tr><th class="de-row-num">#</th>' +
      deHeaders.map((h, i) => `<th><input type="text" value="${h}" data-col="${i}" placeholder="col_${i}" class="de-header-input"></th>`).join('') + '</tr>';

    // Data rows
    deBody.innerHTML = deRows.map((row, r) =>
      '<tr><td class="de-row-num">' + (r + 1) + '</td>' +
      row.map((val, c) => `<td><input type="text" value="${val}" data-row="${r}" data-col="${c}" placeholder="0" class="de-cell-input"></td>`).join('') + '</tr>'
    ).join('');

    // Roles
    deRoles.innerHTML = deHeaders.map((h, i) =>
      `<div class="de-role-item">
        <span class="de-col-name" title="${h}">${h || 'col_' + i}</span>
        <select data-col="${i}" class="de-role-select">
          <option value="feature" ${deColRoles[i] === 'feature' ? 'selected' : ''}>Feature</option>
          <option value="target" ${deColRoles[i] === 'target' ? 'selected' : ''}>Target</option>
        </select>
      </div>`
    ).join('');

    deUpdateInfo();
  }

  // Event delegation for table inputs
  deHead.addEventListener('input', (e) => {
    if (e.target.classList.contains('de-header-input')) {
      const col = parseInt(e.target.dataset.col);
      deHeaders[col] = e.target.value;
      // Update role label
      const roleLabel = deRoles.querySelectorAll('.de-col-name')[col];
      if (roleLabel) roleLabel.textContent = e.target.value || 'col_' + col;
    }
  });

  deBody.addEventListener('input', (e) => {
    if (e.target.classList.contains('de-cell-input')) {
      const r = parseInt(e.target.dataset.row);
      const c = parseInt(e.target.dataset.col);
      deRows[r][c] = e.target.value;
    }
  });

  deRoles.addEventListener('change', (e) => {
    if (e.target.classList.contains('de-role-select')) {
      deColRoles[parseInt(e.target.dataset.col)] = e.target.value;
    }
  });

  // Tab navigation between cells
  deModal.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && e.target.classList.contains('de-cell-input')) {
      e.preventDefault();
      const r = parseInt(e.target.dataset.row);
      const c = parseInt(e.target.dataset.col);
      let nextR = r, nextC = c;
      if (e.shiftKey) {
        nextC--;
        if (nextC < 0) { nextC = deHeaders.length - 1; nextR--; }
      } else {
        nextC++;
        if (nextC >= deHeaders.length) { nextC = 0; nextR++; }
      }
      if (nextR >= 0 && nextR < deRows.length) {
        const nextInput = deBody.querySelector(`input[data-row="${nextR}"][data-col="${nextC}"]`);
        if (nextInput) { nextInput.focus(); nextInput.select(); }
      } else if (nextR >= deRows.length && !e.shiftKey) {
        // Auto-add row when tabbing past last cell
        deRows.push(new Array(deHeaders.length).fill(''));
        deRenderTable();
        const newInput = deBody.querySelector(`input[data-row="${nextR}"][data-col="0"]`);
        if (newInput) { newInput.focus(); newInput.select(); }
      }
    }
  });

  document.getElementById('de-add-col').addEventListener('click', () => {
    const name = 'col_' + deHeaders.length;
    deHeaders.push(name);
    deColRoles.push('feature');
    deRows.forEach(row => row.push(''));
    deRenderTable();
  });

  document.getElementById('de-add-row').addEventListener('click', () => {
    deRows.push(new Array(deHeaders.length).fill(''));
    deRenderTable();
    // Focus first cell of new row
    const newInput = deBody.querySelector(`input[data-row="${deRows.length - 1}"][data-col="0"]`);
    if (newInput) newInput.focus();
  });

  document.getElementById('de-del-col').addEventListener('click', () => {
    if (deHeaders.length === 0) return;
    deHeaders.pop();
    deColRoles.pop();
    deRows.forEach(row => row.pop());
    deRenderTable();
  });

  document.getElementById('de-del-row').addEventListener('click', () => {
    if (deRows.length === 0) return;
    deRows.pop();
    deRenderTable();
  });

  function openDatasetEditor() {
    // Pre-populate from existing dataset, or start with defaults
    if (dataset.headers.length > 0) {
      deHeaders = [...dataset.headers];
      deRows = dataset.rows.map(r => [...r]);
      deColRoles = dataset.columns.length > 0
        ? dataset.columns.map(c => c.role || 'feature')
        : deHeaders.map((_, i) => i === deHeaders.length - 1 ? 'target' : 'feature');
    } else {
      deHeaders = ['x1', 'x2', 'y'];
      deRows = [new Array(3).fill('')];
      deColRoles = ['feature', 'feature', 'target'];
    }
    deRenderTable();
    deModal.style.display = 'flex';
  }

  function closeDatasetEditor() {
    deModal.style.display = 'none';
  }

  document.getElementById('btn-manual').addEventListener('click', openDatasetEditor);
  document.getElementById('dataset-editor-close').addEventListener('click', closeDatasetEditor);
  deModal.querySelector('.modal-overlay').addEventListener('click', closeDatasetEditor);
  document.getElementById('de-cancel').addEventListener('click', closeDatasetEditor);

  document.getElementById('de-apply').addEventListener('click', () => {
    // Validate
    const headers = deHeaders.map((h, i) => h.trim() || ('col_' + i));
    const rows = deRows.filter(row => row.some(v => v !== ''));
    if (headers.length === 0) { alert('Add at least one column.'); return; }
    if (rows.length === 0) { alert('Add at least one data row.'); return; }

    // Apply to dataset
    dataset = { headers, rows: rows.map(r => [...r]), columns: [] };
    buildDataset();

    // Override roles from editor
    deColRoles.forEach((role, i) => {
      if (dataset.columns[i]) dataset.columns[i].role = role;
    });
    renderColumns();

    closeDatasetEditor();
    logOutput(`Manual dataset applied — ${rows.length} rows, ${headers.length} columns`);
  });

  function parseCSV(text) {
    const lines = text.trim().split('\n').map(l => l.split(',').map(c => c.trim()));
    if (lines.length < 2) return;
    const headers = lines[0];
    const rows = lines.slice(1);
    dataset = { headers, rows, columns: [] };
    buildDataset();
  }

  function parseJSON(text) {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr) || arr.length === 0) return;
    const headers = Object.keys(arr[0]);
    const rows = arr.map(r => headers.map(h => r[h]));
    dataset = { headers, rows, columns: [] };
    buildDataset();
  }

  function buildDataset() {
    detectColumnTypes();
    renderPreview();
    renderColumns();
    renderStats();
    logOutput(`Dataset loaded — ${dataset.rows.length} rows, ${dataset.headers.length} columns`);
    invalidateBackendNetwork();
    document.getElementById('preview-section').style.display = '';
    document.getElementById('columns-section').style.display = '';
    document.getElementById('split-section').style.display = '';
    document.getElementById('stats-section').style.display = '';
  }

  function detectColumnTypes() {
    dataset.columns = dataset.headers.map((name, i) => {
      const vals = dataset.rows.map(r => r[i]);
      const numeric = vals.filter(v => !isNaN(v) && v !== '').length;
      const unique = new Set(vals).size;
      const type = numeric > vals.length * 0.8 ? 'numeric' : 'categorical';
      return {
        name,
        type,
        role: i === dataset.headers.length - 1 ? 'target' : 'feature',
        normalization: 'none',
        unique,
        missing: vals.filter(v => v === '' || v === null || v === undefined).length
      };
    });
  }

  function renderPreview() {
    const thead = document.getElementById('preview-head');
    const tbody = document.getElementById('preview-body');
    const maxRows = Math.min(dataset.rows.length, 15);
    thead.innerHTML = '<tr>' + dataset.headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    tbody.innerHTML = dataset.rows.slice(0, maxRows).map(r =>
      '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>'
    ).join('');
  }

  function renderColumns() {
    const list = document.getElementById('columns-list');
    list.innerHTML = dataset.columns.map((col, i) => `
      <div class="column-item">
        <div class="column-header">
          <span class="column-name">
            <span class="codicon codicon-${col.role === 'target' ? 'target' : 'symbol-field'}"></span>
            ${col.name}
            <span class="column-type ${col.type}">${col.type}</span>
          </span>
        </div>
        <div class="column-controls">
          <label class="column-toggle">
            <input type="checkbox" ${col.role === 'feature' ? 'checked' : ''} data-idx="${i}" data-role="feature">
            Feature
          </label>
          <label class="column-toggle">
            <input type="checkbox" ${col.role === 'target' ? 'checked' : ''} data-idx="${i}" data-role="target">
            Target
          </label>
          <select class="column-select" data-idx="${i}" data-setting="normalization">
            <option value="none" ${col.normalization === 'none' ? 'selected' : ''}>No norm</option>
            <option value="minmax" ${col.normalization === 'minmax' ? 'selected' : ''}>MinMax</option>
            <option value="standard" ${col.normalization === 'standard' ? 'selected' : ''}>Standard</option>
          </select>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const role = e.target.dataset.role;
        if (e.target.checked) {
          if (role === 'target') {
            list.querySelectorAll(`input[data-role="target"]`).forEach(c => { if (parseInt(c.dataset.idx) !== idx) c.checked = false; });
            dataset.columns.forEach((c, j) => { if (j !== idx) c.role = 'feature'; });
          }
          dataset.columns[idx].role = role;
          if (role === 'target') list.querySelector(`input[data-idx="${idx}"][data-role="feature"]`).checked = false;
          else list.querySelector(`input[data-idx="${idx}"][data-role="target"]`).checked = false;
        }
        invalidateBackendNetwork();
      });
    });

    list.querySelectorAll('.column-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        dataset.columns[parseInt(e.target.dataset.idx)].normalization = e.target.value;
        invalidateBackendNetwork();
      });
    });
  }

  function renderStats() {
    const grid = document.getElementById('stats-grid');
    const totalMissing = dataset.columns.reduce((s, c) => s + c.missing, 0);
    let html = `
      <div class="stat-item"><span class="stat-label">Rows</span><span class="stat-value">${dataset.rows.length.toLocaleString()}</span></div>
      <div class="stat-item"><span class="stat-label">Columns</span><span class="stat-value">${dataset.headers.length}</span></div>
      <div class="stat-item"><span class="stat-label">Missing values</span><span class="stat-value">${totalMissing}</span></div>
    `;
    dataset.columns.forEach(col => {
      const vals = dataset.rows.map((r, i) => r[dataset.headers.indexOf(col.name)]).filter(v => v !== '' && !isNaN(v)).map(Number);
      if (vals.length > 0 && col.type === 'numeric') {
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        html += `
          <div class="stat-item" style="padding-top:8px;border-top:1px solid #3c3c3c;margin-top:4px">
            <span class="stat-label" style="color:#cccccc;font-weight:600">${col.name}</span>
          </div>
          <div class="stat-item"><span class="stat-label">Mean</span><span class="stat-value">${mean.toFixed(4)}</span></div>
          <div class="stat-item"><span class="stat-label">Std</span><span class="stat-value">${std.toFixed(4)}</span></div>
          <div class="stat-item"><span class="stat-label">Min</span><span class="stat-value">${min.toFixed(4)}</span></div>
          <div class="stat-item"><span class="stat-label">Max</span><span class="stat-value">${max.toFixed(4)}</span></div>
        `;
      } else {
        html += `
          <div class="stat-item" style="padding-top:8px;border-top:1px solid #3c3c3c;margin-top:4px">
            <span class="stat-label" style="color:#cccccc;font-weight:600">${col.name}</span>
            <span class="stat-value">${col.unique} unique</span>
          </div>
        `;
      }
    });
    grid.innerHTML = html;
  }

  const splitTrain = document.getElementById('split-train');
  const splitVal = document.getElementById('split-val');
  const splitTrainVal = document.getElementById('split-train-value');
  const splitValVal = document.getElementById('split-val-value');
  const splitTestVal = document.getElementById('split-test-value');

  function updateSplit() {
    const train = parseInt(splitTrain.value);
    const val = parseInt(splitVal.value);
    const test = 100 - train - val;
    if (test < 0) {
      splitVal.value = 100 - train;
      updateSplit();
      return;
    }
    splitTrainVal.textContent = train + '%';
    splitValVal.textContent = val + '%';
    splitTestVal.textContent = test + '%';
  }

  splitTrain.addEventListener('input', updateSplit);
  splitVal.addEventListener('input', updateSplit);

  const canvas = document.getElementById('network-canvas');
  const ctx = canvas.getContext('2d');
  const zoomLevelEl = document.getElementById('zoom-level');

  const network = new NetworkManager();

  // Invalidate backend whenever the visual topology changes
  network._onChange = () => invalidateBackendNetwork();

  // Undo / Redo system
  const history = {
    undoStack: [],
    redoStack: [],
    maxSize: 50,
    _snapshotting: false,

    snapshot() {
      if (this._snapshotting) return;
      const state = JSON.stringify(network.toJSON());
      // Don't push duplicate states
      if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === state) return;
      this.undoStack.push(state);
      if (this.undoStack.length > this.maxSize) this.undoStack.shift();
      this.redoStack = [];
    },

    undo() {
      if (this.undoStack.length === 0) return;
      this._snapshotting = true;
      const currentState = JSON.stringify(network.toJSON());
      this.redoStack.push(currentState);
      const prev = this.undoStack.pop();
      network.fromJSON(JSON.parse(prev));
      // Re-layout all layers
      network.getAllLayers().forEach(l => layoutLayerNeurons(l));
      selectedLayerIds.clear();
      selectedNeuronIds.clear();
      hideContextToolbar();
      render();
      this._snapshotting = false;
    },

    redo() {
      if (this.redoStack.length === 0) return;
      this._snapshotting = true;
      const currentState = JSON.stringify(network.toJSON());
      this.undoStack.push(currentState);
      const next = this.redoStack.pop();
      network.fromJSON(JSON.parse(next));
      network.getAllLayers().forEach(l => layoutLayerNeurons(l));
      selectedLayerIds.clear();
      selectedNeuronIds.clear();
      hideContextToolbar();
      render();
      this._snapshotting = false;
    },

    clear() {
      this.undoStack = [];
      this.redoStack = [];
    }
  };

  function saveState() {
    history.snapshot();
  }

  const viewport = {
    x: 0,
    y: 0,
    zoom: 1,
    gridSize: 20,
    showGrid: true,
    snapToGrid: true,
    showWeights: false,
    showActivations: false,
    minZoom: 0.1,
    maxZoom: 5,
  };

  function snapToGridPos(x, y) {
    const g = viewport.gridSize;
    return { x: Math.round(x / g) * g, y: Math.round(y / g) * g };
  }

  function autoLayout() {
    const layers = network.getAllLayers();
    if (layers.length === 0) return;
    saveState();

    const gap = 200;
    const totalWidth = (layers.length - 1) * gap;
    const startX = -totalWidth / 2;

    layers.forEach((layer, i) => {
      let x = startX + i * gap;
      let y = 0;
      if (viewport.snapToGrid) {
        const snapped = snapToGridPos(x, y);
        x = snapped.x;
        y = snapped.y;
      }
      layer.position.x = x;
      layer.position.y = y;
      layoutLayerNeurons(layer);
    });

    render();
  }

  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let notes = [];

  let selectedLayerIds = new Set();
  let selectedNeuronIds = new Set();
  let isDragging = false;
  let dragTarget = null;
  let dragOffset = { x: 0, y: 0 };
  let dragMoved = false;
  let isConnecting = false;
  let connectFrom = null;
  let mouseWorldPos = { x: 0, y: 0 };
  let dropTargetLayerId = null;
  let hoverLayerId = null;
  let hoverNeuronId = null;
  let hoverConnection = null;
  let tooltipMouseX = 0;
  let tooltipMouseY = 0;

  // Context toolbar references (elements created later, declared here for render access)
  const ctxToolbar = document.getElementById('context-toolbar');
  const ctxToolsBtn = document.getElementById('ctx-tools-btn');
  const ctxDropdown = document.getElementById('ctx-dropdown');
  let ctxTarget = null;

  function updateContextToolbarPosition() {
    if (!ctxTarget) return;
    const contentRect = canvas.parentElement.getBoundingClientRect();

    if (ctxTarget.type === 'layer') {
      const layer = network.getLayer(ctxTarget.id);
      if (!layer) { ctxToolbar.style.display = 'none'; ctxTarget = null; return; }
      const r = getLayerScreenRect(layer);
      ctxToolbar.style.left = (r.x + r.w + 8) + 'px';
      ctxToolbar.style.top = (r.y) + 'px';
    } else if (ctxTarget.type === 'neuron') {
      const neuron = network.getNeuron(ctxTarget.id);
      if (!neuron) { ctxToolbar.style.display = 'none'; ctxTarget = null; return; }
      const pos = getNeuronScreenPos(neuron);
      const nr = NEURON_RADIUS * viewport.zoom;
      ctxToolbar.style.left = (pos.x + nr + 8) + 'px';
      ctxToolbar.style.top = (pos.y - 15) + 'px';
    }
  }

  const LAYER_COLORS = ['#0e639c', '#6a3d99', '#2a7a3a', '#a35200', '#8b0000', '#4a4a8a', '#5c3a6e', '#1a6e5a'];
  const NEURON_RADIUS = 14;
  const NEURON_GAP = 36;
  const LAYER_WIDTH = 60;
  const LAYER_HEIGHT = 120;

  function layoutLayerNeurons(layer) {
    const neurons = network.getNeuronsByLayer(layer.id);
    const count = neurons.length;
    if (count === 0) return;

    const totalHeight = (count - 1) * NEURON_GAP;
    const startY = layer.position.y - totalHeight / 2;

    neurons.forEach((neuron, i) => {
      neuron.position = { x: layer.position.x, y: startY + i * NEURON_GAP };
    });
  }

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    render();
  }

  function screenToWorld(sx, sy) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    return {
      x: (sx - cx - viewport.x) / viewport.zoom,
      y: (sy - cy - viewport.y) / viewport.zoom
    };
  }

  function worldToScreen(wx, wy) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    return {
      x: wx * viewport.zoom + viewport.x + cx,
      y: wy * viewport.zoom + viewport.y + cy
    };
  }

  function drawGrid() {
    if (!viewport.showGrid) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const gs = viewport.gridSize * viewport.zoom;

    if (gs < 6) return;

    const offsetX = (viewport.x + w / 2) % gs;
    const offsetY = (viewport.y + h / 2) % gs;

    ctx.strokeStyle = viewport.zoom > 1.5 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = offsetX; x < w; x += gs) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = offsetY; y < h; y += gs) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
    }
    ctx.stroke();

    if (viewport.zoom > 0.8) {
      const bigGs = gs * 5;
      const bigOffsetX = (viewport.x + w / 2) % bigGs;
      const bigOffsetY = (viewport.y + h / 2) % bigGs;

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      for (let x = bigOffsetX; x < w; x += bigGs) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = bigOffsetY; y < h; y += bigGs) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }
  }

  function getLayerScreenRect(layer) {
    const pos = worldToScreen(layer.position.x, layer.position.y);
    const neurons = network.getNeuronsByLayer(layer.id);
    const worldH = Math.max(neurons.length * NEURON_GAP + 40, LAYER_HEIGHT);
    const worldW = LAYER_WIDTH;
    const w = worldW * viewport.zoom;
    const h = worldH * viewport.zoom;
    return { x: pos.x - w / 2, y: pos.y - h / 2, w, h, cx: pos.x, cy: pos.y };
  }

  function isDropTarget(layer) {
    return layer.id === dropTargetLayerId;
  }

  function getNeuronScreenPos(neuron) {
    return worldToScreen(neuron.position.x, neuron.position.y);
  }

  function hitTestLayer(mx, my) {
    const layers = network.getAllLayers();
    for (let i = layers.length - 1; i >= 0; i--) {
      const r = getLayerScreenRect(layers[i]);
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        return layers[i];
      }
    }
    return null;
  }

  function hitTestNeuron(mx, my, excludeId = null) {
    const neurons = network.getAllNeurons();
    for (let i = neurons.length - 1; i >= 0; i--) {
      if (excludeId && neurons[i].id === excludeId) continue;
      const pos = getNeuronScreenPos(neurons[i]);
      const r = NEURON_RADIUS * viewport.zoom;
      const dx = mx - pos.x;
      const dy = my - pos.y;
      if (dx * dx + dy * dy <= r * r) {
        return neurons[i];
      }
    }
    return null;
  }

  function hitTestConnection(mx, my, threshold) {
    threshold = threshold || 5;
    const connections = network.getAllConnections();
    let closest = null;
    let closestDist = threshold;
    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      const from = network.getNeuron(conn.fromNeuron);
      const to = network.getNeuron(conn.toNeuron);
      if (!from || !to) continue;
      const p1 = getNeuronScreenPos(from);
      const p2 = getNeuronScreenPos(to);
      // Point-to-segment distance
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;
      let t = ((mx - p1.x) * dx + (my - p1.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const px = p1.x + t * dx;
      const py = p1.y + t * dy;
      const dist = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
      if (dist < closestDist) {
        closestDist = dist;
        closest = conn;
      }
    }
    return closest;
  }

  function drawLayerBox(layer, color, isSelected) {
    const r = getLayerScreenRect(layer);

    const isDrop = isDropTarget(layer);
    ctx.fillStyle = isDrop ? 'rgba(79, 193, 255, 0.15)' : 
                   isSelected ? 'rgba(79, 193, 255, 0.08)' : 
                   'rgba(30, 30, 30, 0.6)';
    ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.strokeStyle = isDrop ? '#00bfff' : 
                     isSelected ? '#4fc1ff' : 
                     color;
    ctx.lineWidth = isDrop ? 3 : (isSelected ? 2 : 1);
    if (isDrop || isSelected) {
      ctx.setLineDash([]);
    }
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);

    if (viewport.zoom > 0.3) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `${Math.max(8, 10 * viewport.zoom)}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(layer.name, r.cx, r.y + 4);

      // Badge: neuron count · activation
      const neurons = network.getNeuronsByLayer(layer.id);
      const act = (layer.activation || 'linear').replace(/relu/i, 'ReLU').replace(/sigmoid/i, 'σ').replace(/tanh/i, 'tanh').replace(/softmax/i, 'SM').replace(/leakyrelu/i, 'LReLU').replace(/linear/i, 'Lin').replace(/elu/i, 'ELU').replace(/gelu/i, 'GELU').replace(/swish/i, 'Swish');
      const badgeText = `${neurons.length}n · ${act}`;
      const badgeFontSize = Math.max(7, 8 * viewport.zoom);
      ctx.font = `${badgeFontSize}px -apple-system, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.textBaseline = 'bottom';
      ctx.fillText(badgeText, r.cx, r.y + r.h - 3);
    } else if (viewport.zoom < 0.25) {
      // Minimal mode: larger text showing layer name and neuron count
      const neurons = network.getNeuronsByLayer(layer.id);
      const fontSize = Math.max(10, 14 * viewport.zoom / 0.25);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${layer.name}`, r.cx, r.cy - fontSize * 0.5);
      ctx.font = `${fontSize * 0.8}px -apple-system, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`${neurons.length} neurons`, r.cx, r.cy + fontSize * 0.5);
    }
  }

  function drawLayers() {
    const layers = network.getAllLayers();

    layers.forEach((layer, li) => {
      const color = layer.style.color || LAYER_COLORS[li % LAYER_COLORS.length];
      const isSelected = selectedLayerIds.has(layer.id);
      drawLayerBox(layer, color, isSelected);
    });

    // At very low zoom, draw arrows between consecutive layers instead of individual connections
    if (viewport.zoom < 0.25) {
      drawLayerArrows();
    }
  }

  function drawLayerArrows() {
    const layers = network.getAllLayers();
    if (layers.length < 2) return;

    // Sort layers by x position to determine flow order
    const sorted = [...layers].sort((a, b) => a.position.x - b.position.x);

    // Build a set of connected layer pairs
    const connections = network.getAllConnections();
    const connectedPairs = new Set();
    connections.forEach(conn => {
      const key = `${conn.fromLayer}→${conn.toLayer}`;
      connectedPairs.add(key);
    });

    // Count connections between each pair
    const pairCounts = {};
    connections.forEach(conn => {
      const key = `${conn.fromLayer}→${conn.toLayer}`;
      pairCounts[key] = (pairCounts[key] || 0) + 1;
    });

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i].id}→${sorted[j].id}`;
        const keyRev = `${sorted[j].id}→${sorted[i].id}`;
        const count = (pairCounts[key] || 0) + (pairCounts[keyRev] || 0);
        if (count === 0) continue;

        const r1 = getLayerScreenRect(sorted[i]);
        const r2 = getLayerScreenRect(sorted[j]);

        // Draw thick arrow from r1 right edge to r2 left edge
        const startX = r1.x + r1.w;
        const startY = r1.cy;
        const endX = r2.x;
        const endY = r2.cy;

        // Arrow line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = 'rgba(79, 193, 255, 0.4)';
        ctx.lineWidth = Math.max(2, 4 * viewport.zoom / 0.25);
        ctx.stroke();

        // Arrowhead
        const angle = Math.atan2(endY - startY, endX - startX);
        const headLen = Math.max(6, 10 * viewport.zoom / 0.25);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headLen * Math.cos(angle - 0.4), endY - headLen * Math.sin(angle - 0.4));
        ctx.lineTo(endX - headLen * Math.cos(angle + 0.4), endY - headLen * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = 'rgba(79, 193, 255, 0.5)';
        ctx.fill();

        // Connection count label at midpoint
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        const fontSize = Math.max(8, 11 * viewport.zoom / 0.25);
        ctx.font = `${fontSize}px -apple-system, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${count}`, midX, midY - 3);
      }
    }
  }

  function drawNeurons() {
    // Semantic zoom: hide neurons entirely at very low zoom
    if (viewport.zoom < 0.25) return;

    const neurons = network.getAllNeurons();
    const layers = network.getAllLayers();
    const isCollapsed = viewport.zoom < 0.5;

    neurons.forEach(neuron => {
      const pos = getNeuronScreenPos(neuron);
      const layerIdx = layers.findIndex(l => l.id === neuron.layerId);
      const layer = layers[layerIdx];
      const color = (layer && layer.style.color) || LAYER_COLORS[layerIdx % LAYER_COLORS.length];
      const r = NEURON_RADIUS * viewport.zoom;
      const isSelected = selectedNeuronIds.has(neuron.id);
      const isDraggingThis = isDragging && dragTarget && dragTarget.id === neuron.id;

      if (isCollapsed) {
        // Collapsed mode: small dots, no labels, no glow
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#4fc1ff' : color;
        ctx.fill();
        return;
      }

      // Activation visualization
      let fillColor = isSelected ? '#4fc1ff' : color;
      let glowColor = null;
      if (viewport.showActivations && neuronActivations.has(neuron.id) && !isSelected) {
        const act = neuronActivations.get(neuron.id);
        // Clamp to 0..1 for color mapping (sigmoid-like for unbounded activations)
        const norm = act >= 0 && act <= 1 ? act : 1 / (1 + Math.exp(-act));
        // Interpolate: dark (low) -> bright green/yellow (high)
        const r255 = Math.round(40 + norm * 215);
        const g255 = Math.round(40 + norm * 200);
        const b255 = Math.round(60 - norm * 30);
        fillColor = `rgb(${r255}, ${g255}, ${b255})`;
        if (norm > 0.5) {
          glowColor = `rgba(${r255}, ${g255}, ${b255}, ${0.3 + norm * 0.4})`;
        }
      }

      // Glow for high activations
      if (glowColor) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = glowColor;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      if (isDraggingThis) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 200, 100, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (viewport.zoom > 0.5) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.max(8, 9 * viewport.zoom)}px Consolas, Monaco, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const idx = network.getNeuronsByLayer(neuron.layerId).findIndex(n => n.id === neuron.id);
        ctx.fillText(`N${idx}`, pos.x, pos.y);
      }
    });
  }

  function drawConnections() {
    // Semantic zoom: skip individual connections at very low zoom (arrows used instead)
    if (viewport.zoom < 0.25) return;

    const connections = network.getAllConnections();
    const showWeights = viewport.showWeights;
    const isCollapsed = viewport.zoom < 0.5;

    // Precompute max absolute weight for normalization
    let maxAbsWeight = 0;
    if (showWeights) {
      connections.forEach(conn => {
        const abs = Math.abs(conn.weight || 0);
        if (abs > maxAbsWeight) maxAbsWeight = abs;
      });
      if (maxAbsWeight === 0) maxAbsWeight = 1;
    }

    connections.forEach(conn => {
      const from = network.getNeuron(conn.fromNeuron);
      const to = network.getNeuron(conn.toNeuron);
      if (!from || !to) return;

      const p1 = getNeuronScreenPos(from);
      const p2 = getNeuronScreenPos(to);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      const isSelected = selectedNeuronIds.has(conn.fromNeuron) || 
                        selectedNeuronIds.has(conn.toNeuron) ||
                        (selectedLayerIds.has(conn.fromLayer) && selectedLayerIds.has(conn.toLayer));

      if (showWeights && !isSelected && !isCollapsed) {
        const w = conn.weight || 0;
        const norm = Math.abs(w) / maxAbsWeight; // 0..1
        const alpha = 0.15 + norm * 0.75; // 0.15..0.9
        const thickness = (0.5 + norm * 3.5) * viewport.zoom; // 0.5..4
        if (w >= 0) {
          // Positive: blue
          ctx.strokeStyle = `rgba(79, 193, 255, ${alpha})`;
        } else {
          // Negative: red
          ctx.strokeStyle = `rgba(255, 100, 100, ${alpha})`;
        }
        ctx.lineWidth = thickness;
      } else {
        const baseAlpha = isCollapsed ? 0.1 : 0.25;
        ctx.strokeStyle = isSelected ? '#4fc1ff' : `rgba(79, 193, 255, ${baseAlpha})`;
        ctx.lineWidth = (isSelected ? 2 : (isCollapsed ? 0.5 : 1)) * viewport.zoom;
      }
      ctx.stroke();
    });

    if (isConnecting && connectFrom) {
      const from = network.getNeuron(connectFrom);
      if (from) {
        const p1 = getNeuronScreenPos(from);
        const rect = canvas.getBoundingClientRect();
        const p2 = worldToScreen(mouseWorldPos.x, mouseWorldPos.y);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        const toNeuron = hitTestNeuron(p2.x, p2.y);
        ctx.strokeStyle = toNeuron ? 'rgba(255, 100, 100, 0.8)' : 'rgba(79, 193, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function drawNotes() {
    notes.forEach(note => {
      const pos = worldToScreen(note.x, note.y);
      const fontSize = Math.max(9, 13 * viewport.zoom);

      ctx.font = `${fontSize}px -apple-system, sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(note.text, pos.x, pos.y);
    });
  }

  function render() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawGrid();
    drawConnections();
    drawLayers();
    drawNeurons();
    drawNotes();
    if (ctxTarget) updateContextToolbarPosition();
    renderMinimap();
    updatePropertiesPanel();
  }

  // --- Tooltip ---
  const tooltipEl = document.getElementById('canvas-tooltip');

  function updateTooltip() {
    if (isDragging || isPanning || isConnecting) {
      tooltipEl.style.display = 'none';
      return;
    }

    let html = '';

    if (hoverNeuronId) {
      const neuron = network.getNeuron(hoverNeuronId);
      if (neuron) {
        const layer = network.getLayer(neuron.layerId);
        const layerNeurons = network.getNeuronsByLayer(neuron.layerId);
        const idx = layerNeurons.findIndex(n => n.id === neuron.id);
        const inConns = network.getAllConnections().filter(c => c.toNeuron === neuron.id);
        const outConns = network.getAllConnections().filter(c => c.fromNeuron === neuron.id);
        const act = neuron.activation || (layer ? layer.activation : 'linear') || 'linear';
        const activation = neuronActivations.get(neuron.id);

        html = `<div class="tt-title">Neuron N${idx}</div>`;
        html += `<div class="tt-row"><span class="tt-label">Layer</span><span class="tt-value">${layer ? layer.name : '—'}</span></div>`;
        html += `<div class="tt-row"><span class="tt-label">Activation</span><span class="tt-value">${act}</span></div>`;
        html += `<div class="tt-row"><span class="tt-label">Bias</span><span class="tt-value">${(neuron.bias || 0).toFixed(4)}</span></div>`;
        html += `<div class="tt-row"><span class="tt-label">In / Out</span><span class="tt-value">${inConns.length} / ${outConns.length}</span></div>`;
        if (activation !== undefined) {
          html += `<div class="tt-row"><span class="tt-label">Value</span><span class="tt-value">${activation.toFixed(4)}</span></div>`;
        }
      }
    } else if (hoverLayerId) {
      const layer = network.getLayer(hoverLayerId);
      if (layer) {
        const neurons = network.getNeuronsByLayer(layer.id);
        html = `<div class="tt-title">${layer.name}</div>`;
        html += `<div class="tt-row"><span class="tt-label">Neurons</span><span class="tt-value">${neurons.length}</span></div>`;
        html += `<div class="tt-row"><span class="tt-label">Activation</span><span class="tt-value">${layer.activation || 'linear'}</span></div>`;
        html += `<div class="tt-row"><span class="tt-label">Bias</span><span class="tt-value">${layer.useBias !== false ? 'Yes' : 'No'}</span></div>`;
        html += `<div class="tt-row"><span class="tt-label">Init</span><span class="tt-value">${layer.weightInit || 'xavier'}</span></div>`;
      }
    } else if (hoverConnection) {
      const w = hoverConnection.weight || 0;
      const cls = w >= 0 ? 'positive' : 'negative';
      const fromN = network.getNeuron(hoverConnection.fromNeuron);
      const toN = network.getNeuron(hoverConnection.toNeuron);
      const fromLayer = fromN ? network.getLayer(fromN.layerId) : null;
      const toLayer = toN ? network.getLayer(toN.layerId) : null;
      html = `<div class="tt-title">Connection</div>`;
      html += `<div class="tt-row"><span class="tt-label">Weight</span><span class="tt-value ${cls}">${w.toFixed(6)}</span></div>`;
      if (fromLayer && toLayer) {
        html += `<div class="tt-row"><span class="tt-label">From</span><span class="tt-value">${fromLayer.name}</span></div>`;
        html += `<div class="tt-row"><span class="tt-label">To</span><span class="tt-value">${toLayer.name}</span></div>`;
      }
    }

    if (!html) {
      tooltipEl.style.display = 'none';
      return;
    }

    tooltipEl.innerHTML = html;
    tooltipEl.style.display = 'block';

    // Position tooltip near mouse, but keep it within the canvas area
    const canvasRect = canvas.getBoundingClientRect();
    let tx = tooltipMouseX - canvasRect.left + 14;
    let ty = tooltipMouseY - canvasRect.top + 14;
    const tw = tooltipEl.offsetWidth;
    const th = tooltipEl.offsetHeight;
    if (tx + tw > canvasRect.width - 8) tx = tx - tw - 28;
    if (ty + th > canvasRect.height - 8) ty = ty - th - 28;
    tooltipEl.style.left = tx + 'px';
    tooltipEl.style.top = ty + 'px';
  }

  // --- Properties Panel ---
  const propertiesContent = document.getElementById('properties-content');
  let _lastPropsKey = '';

  const ACTIVATIONS = [
    { value: 'linear', label: 'Linear' },
    { value: 'relu', label: 'ReLU' },
    { value: 'leaky_relu', label: 'Leaky ReLU' },
    { value: 'sigmoid', label: 'Sigmoid' },
    { value: 'tanh', label: 'Tanh' },
    { value: 'softmax', label: 'Softmax' },
    { value: 'elu', label: 'ELU' },
    { value: 'gelu', label: 'GELU' },
    { value: 'swish', label: 'Swish' },
  ];

  const LAYER_TYPES = [
    { value: 'dense', label: 'Dense (Fully Connected)' },
    { value: 'input', label: 'Input' },
    { value: 'output', label: 'Output' },
  ];

  const WEIGHT_INITS = [
    { value: 'random', label: 'Random' },
    { value: 'xavier', label: 'Xavier / Glorot' },
    { value: 'he', label: 'He' },
    { value: 'zeros', label: 'Zeros' },
  ];

  function makeSelectHtml(id, options, selected) {
    let html = `<select class="props-select" data-prop="${id}">`;
    options.forEach(o => {
      html += `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${o.label}</option>`;
    });
    html += '</select>';
    return html;
  }

  function getPropsKey() {
    if (selectedLayerIds.size === 1) return 'layer:' + [...selectedLayerIds][0];
    if (selectedNeuronIds.size === 1) return 'neuron:' + [...selectedNeuronIds][0];
    if (selectedLayerIds.size > 1) return 'layers:' + selectedLayerIds.size;
    if (selectedNeuronIds.size > 1) return 'neurons:' + selectedNeuronIds.size;
    return 'none';
  }

  function updatePropertiesPanel() {
    const key = getPropsKey();
    if (key === _lastPropsKey) return;
    _lastPropsKey = key;

    if (selectedLayerIds.size === 1) {
      const layerId = [...selectedLayerIds][0];
      const layer = network.getLayer(layerId);
      if (!layer) return showEmptyProps();
      renderLayerProps(layer);
    } else if (selectedNeuronIds.size === 1) {
      const neuronId = [...selectedNeuronIds][0];
      const neuron = network.getNeuron(neuronId);
      if (!neuron) return showEmptyProps();
      renderNeuronProps(neuron);
    } else if (selectedLayerIds.size > 1) {
      renderMultiLayerProps();
    } else if (selectedNeuronIds.size > 1) {
      renderMultiNeuronProps();
    } else {
      showEmptyProps();
    }
  }

  function showEmptyProps() {
    propertiesContent.innerHTML = `
      <div class="props-empty">
        <span class="codicon codicon-info"></span>
        <span>Select a layer or neuron</span>
      </div>`;
  }

  function renderLayerProps(layer) {
    const layers = network.getAllLayers();
    const li = layers.findIndex(l => l.id === layer.id);
    const neurons = network.getNeuronsByLayer(layer.id);
    const connsIn = network.getConnectionsByLayer(layer.id, 'incoming');
    const connsOut = network.getConnectionsByLayer(layer.id, 'outgoing');
    const color = layer.style.color || LAYER_COLORS[li % LAYER_COLORS.length];
    const useBias = layer.useBias !== false;
    const weightInit = layer.weightInit || 'xavier';

    propertiesContent.innerHTML = `
      <div class="props-group">
        <div class="props-group-header">
          <span class="codicon codicon-chevron-down"></span> General
        </div>
        <div class="props-group-body">
          <div class="props-row">
            <span class="props-label">Name</span>
            <input class="props-input" data-prop="name" value="${escapeHtml(layer.name)}" />
          </div>
          <div class="props-row">
            <span class="props-label">Type</span>
            ${makeSelectHtml('type', LAYER_TYPES, layer.type)}
          </div>
          <div class="props-row">
            <span class="props-label">Activation</span>
            ${makeSelectHtml('activation', ACTIVATIONS, layer.activation)}
          </div>
          <div class="props-row">
            <span class="props-label">Color</span>
            <input type="color" class="props-color-input" data-prop="color" value="${color}" />
          </div>
        </div>
      </div>
      <div class="props-group">
        <div class="props-group-header">
          <span class="codicon codicon-chevron-down"></span> Parameters
        </div>
        <div class="props-group-body">
          <div class="props-row">
            <span class="props-label">Neurons</span>
            <input class="props-input" data-prop="neuronCount" type="number" min="0" max="64" value="${neurons.length}" style="width:50px" />
          </div>
          <div class="props-row">
            <label class="props-checkbox">
              <input type="checkbox" data-prop="useBias" ${useBias ? 'checked' : ''} />
              Use Bias
            </label>
          </div>
          <div class="props-row">
            <span class="props-label">Weight Init</span>
            ${makeSelectHtml('weightInit', WEIGHT_INITS, weightInit)}
          </div>
        </div>
      </div>
      <div class="props-group">
        <div class="props-group-header">
          <span class="codicon codicon-chevron-down"></span> Position
        </div>
        <div class="props-group-body">
          <div class="props-row">
            <span class="props-label">X</span>
            <input class="props-input" data-prop="posX" type="number" value="${Math.round(layer.position.x)}" style="width:65px" />
            <span class="props-label" style="min-width:20px">Y</span>
            <input class="props-input" data-prop="posY" type="number" value="${Math.round(layer.position.y)}" style="width:65px" />
          </div>
        </div>
      </div>
      <div class="props-group">
        <div class="props-group-header">
          <span class="codicon codicon-chevron-down"></span> Statistics
        </div>
        <div class="props-group-body">
          <div class="props-stat"><span class="props-stat-label">Neurons</span><span class="props-stat-value">${neurons.length}</span></div>
          <div class="props-stat"><span class="props-stat-label">Connections In</span><span class="props-stat-value">${connsIn.length}</span></div>
          <div class="props-stat"><span class="props-stat-label">Connections Out</span><span class="props-stat-value">${connsOut.length}</span></div>
          <div class="props-stat"><span class="props-stat-label">Parameters</span><span class="props-stat-value">${neurons.length > 0 ? connsIn.length + (useBias ? neurons.length : 0) : 0}</span></div>
          <div class="props-stat"><span class="props-stat-label">Layer Index</span><span class="props-stat-value">${li}</span></div>
          <div class="props-stat"><span class="props-stat-label">ID</span><span class="props-stat-value">${layer.id}</span></div>
        </div>
      </div>`;

    wireLayerPropsEvents(layer);
  }

  function renderNeuronProps(neuron) {
    const layer = network.getLayer(neuron.layerId);
    const layers = network.getAllLayers();
    const li = layers.findIndex(l => l.id === neuron.layerId);
    const neuronIdx = layer ? network.getNeuronsByLayer(layer.id).findIndex(n => n.id === neuron.id) : 0;
    const connsIn = network.getConnectionsByNeuron(neuron.id, 'incoming');
    const connsOut = network.getConnectionsByNeuron(neuron.id, 'outgoing');
    const color = (layer && layer.style.color) || LAYER_COLORS[li % LAYER_COLORS.length];
    const neuronActivation = neuron.activation || (layer ? layer.activation : 'relu');

    propertiesContent.innerHTML = `
      <div class="props-group">
        <div class="props-group-header">
          <span class="codicon codicon-chevron-down"></span> Neuron
        </div>
        <div class="props-group-body">
          <div class="props-row">
            <span class="props-label">Label</span>
            <span class="props-value" style="color:${color}">N${neuronIdx}</span>
          </div>
          <div class="props-row">
            <span class="props-label">Layer</span>
            <span class="props-value">${layer ? escapeHtml(layer.name) : '—'}</span>
          </div>
          <div class="props-row">
            <span class="props-label">Activation</span>
            ${makeSelectHtml('neuronActivation', [{value: '', label: 'Inherit (' + (layer ? layer.activation : 'relu') + ')'}, ...ACTIVATIONS], neuron.activation || '')}
          </div>
        </div>
      </div>
      <div class="props-group">
        <div class="props-group-header">
          <span class="codicon codicon-chevron-down"></span> Parameters
        </div>
        <div class="props-group-body">
          <div class="props-row">
            <span class="props-label">Bias</span>
            <input class="props-input" data-prop="bias" type="number" step="0.01" value="${neuron.bias}" style="width:80px" />
          </div>
        </div>
      </div>
      <div class="props-group">
        <div class="props-group-header">
          <span class="codicon codicon-chevron-down"></span> Connections (${connsIn.length + connsOut.length})
        </div>
        <div class="props-group-body">
          ${connsIn.length > 0 ? `<div style="font-size:10px;color:#888;margin-bottom:4px;">INCOMING (${connsIn.length})</div>` : ''}
          ${connsIn.map(c => {
            const fromN = network.getNeuron(c.fromNeuron);
            const fromL = fromN ? network.getLayer(fromN.layerId) : null;
            const fromIdx = fromL ? network.getNeuronsByLayer(fromL.id).findIndex(n => n.id === c.fromNeuron) : '?';
            return `<div class="props-row">
              <span class="props-label" style="min-width:55px">${fromL ? escapeHtml(fromL.name) : '?'}.N${fromIdx}</span>
              <span class="props-value" style="color:#888">w=</span>
              <input class="props-input" data-conn="${c.id}" type="number" step="0.01" value="${c.weight.toFixed(4)}" style="width:70px" />
            </div>`;
          }).join('')}
          ${connsOut.length > 0 ? `<div style="font-size:10px;color:#888;margin-bottom:4px;margin-top:6px;">OUTGOING (${connsOut.length})</div>` : ''}
          ${connsOut.map(c => {
            const toN = network.getNeuron(c.toNeuron);
            const toL = toN ? network.getLayer(toN.layerId) : null;
            const toIdx = toL ? network.getNeuronsByLayer(toL.id).findIndex(n => n.id === c.toNeuron) : '?';
            return `<div class="props-row">
              <span class="props-label" style="min-width:55px">${toL ? escapeHtml(toL.name) : '?'}.N${toIdx}</span>
              <span class="props-value" style="color:#888">w=</span>
              <input class="props-input" data-conn="${c.id}" type="number" step="0.01" value="${c.weight.toFixed(4)}" style="width:70px" />
            </div>`;
          }).join('')}
          ${(connsIn.length + connsOut.length) === 0 ? '<div style="font-size:11px;color:#666;">No connections</div>' : ''}
        </div>
      </div>
      <div class="props-group">
        <div class="props-group-header">
          <span class="codicon codicon-chevron-down"></span> Info
        </div>
        <div class="props-group-body">
          <div class="props-stat"><span class="props-stat-label">ID</span><span class="props-stat-value">${neuron.id}</span></div>
          <div class="props-stat"><span class="props-stat-label">Position</span><span class="props-stat-value">${Math.round(neuron.position.x)}, ${Math.round(neuron.position.y)}</span></div>
        </div>
      </div>`;

    wireNeuronPropsEvents(neuron);
  }

  function renderMultiLayerProps() {
    const ids = [...selectedLayerIds];
    const totalNeurons = ids.reduce((s, id) => s + network.getNeuronsByLayer(id).length, 0);
    propertiesContent.innerHTML = `
      <div class="props-group">
        <div class="props-group-header">
          <span class="codicon codicon-chevron-down"></span> Multi-Selection
        </div>
        <div class="props-group-body">
          <div class="props-stat"><span class="props-stat-label">Layers selected</span><span class="props-stat-value">${ids.length}</span></div>
          <div class="props-stat"><span class="props-stat-label">Total Neurons</span><span class="props-stat-value">${totalNeurons}</span></div>
          <div class="props-row" style="margin-top:8px">
            <span class="props-label">Activation</span>
            ${makeSelectHtml('multiActivation', [{value: '', label: '— mixed —'}, ...ACTIVATIONS], '')}
          </div>
        </div>
      </div>`;

    const sel = propertiesContent.querySelector('[data-prop="multiActivation"]');
    if (sel) {
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        saveState();
        ids.forEach(id => {
          const layer = network.getLayer(id);
          if (layer) layer.activation = sel.value;
        });
        invalidateBackendNetwork();
        _lastPropsKey = '';
        render();
      });
    }
  }

  function renderMultiNeuronProps() {
    const ids = [...selectedNeuronIds];
    propertiesContent.innerHTML = `
      <div class="props-group">
        <div class="props-group-header">
          <span class="codicon codicon-chevron-down"></span> Multi-Selection
        </div>
        <div class="props-group-body">
          <div class="props-stat"><span class="props-stat-label">Neurons selected</span><span class="props-stat-value">${ids.length}</span></div>
        </div>
      </div>`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function wireLayerPropsEvents(layer) {
    const content = propertiesContent;

    const nameInput = content.querySelector('[data-prop="name"]');
    if (nameInput) {
      nameInput.addEventListener('change', () => {
        saveState();
        layer.name = nameInput.value;
        _lastPropsKey = '';
        render();
      });
    }

    const typeSelect = content.querySelector('[data-prop="type"]');
    if (typeSelect) {
      typeSelect.addEventListener('change', () => {
        saveState();
        layer.type = typeSelect.value;
        _lastPropsKey = '';
        render();
      });
    }

    const actSelect = content.querySelector('[data-prop="activation"]');
    if (actSelect) {
      actSelect.addEventListener('change', () => {
        saveState();
        layer.activation = actSelect.value;
        invalidateBackendNetwork();
        _lastPropsKey = '';
        render();
      });
    }

    const colorInput = content.querySelector('[data-prop="color"]');
    if (colorInput) {
      colorInput.addEventListener('input', () => {
        layer.style.color = colorInput.value;
        render();
      });
      colorInput.addEventListener('change', () => {
        saveState();
        layer.style.color = colorInput.value;
        _lastPropsKey = '';
        render();
      });
    }

    const neuronCountInput = content.querySelector('[data-prop="neuronCount"]');
    if (neuronCountInput) {
      neuronCountInput.addEventListener('change', () => {
        saveState();
        const target = parseInt(neuronCountInput.value) || 0;
        const current = network.getNeuronsByLayer(layer.id);
        if (target > current.length) {
          for (let i = current.length; i < target; i++) {
            network.createNeuron({ layerId: layer.id });
          }
        } else if (target < current.length) {
          for (let i = current.length - 1; i >= target; i--) {
            network.deleteNeuron(current[i].id);
          }
        }
        layoutLayerNeurons(layer);
        _lastPropsKey = '';
        render();
      });
    }

    const biasCheck = content.querySelector('[data-prop="useBias"]');
    if (biasCheck) {
      biasCheck.addEventListener('change', () => {
        saveState();
        layer.useBias = biasCheck.checked;
        invalidateBackendNetwork();
        _lastPropsKey = '';
        render();
      });
    }

    const weightInitSelect = content.querySelector('[data-prop="weightInit"]');
    if (weightInitSelect) {
      weightInitSelect.addEventListener('change', () => {
        saveState();
        layer.weightInit = weightInitSelect.value;
        invalidateBackendNetwork();
        _lastPropsKey = '';
        render();
      });
    }

    const posXInput = content.querySelector('[data-prop="posX"]');
    const posYInput = content.querySelector('[data-prop="posY"]');
    if (posXInput) {
      posXInput.addEventListener('change', () => {
        saveState();
        layer.position.x = parseFloat(posXInput.value) || 0;
        layoutLayerNeurons(layer);
        _lastPropsKey = '';
        render();
      });
    }
    if (posYInput) {
      posYInput.addEventListener('change', () => {
        saveState();
        layer.position.y = parseFloat(posYInput.value) || 0;
        layoutLayerNeurons(layer);
        _lastPropsKey = '';
        render();
      });
    }

    // Collapsible group headers
    content.querySelectorAll('.props-group-header').forEach(header => {
      header.addEventListener('click', () => {
        const body = header.nextElementSibling;
        const icon = header.querySelector('.codicon');
        if (body.style.display === 'none') {
          body.style.display = '';
          icon.className = 'codicon codicon-chevron-down';
        } else {
          body.style.display = 'none';
          icon.className = 'codicon codicon-chevron-right';
        }
      });
    });
  }

  function wireNeuronPropsEvents(neuron) {
    const content = propertiesContent;

    const biasInput = content.querySelector('[data-prop="bias"]');
    if (biasInput) {
      biasInput.addEventListener('change', () => {
        saveState();
        neuron.bias = parseFloat(biasInput.value) || 0;
        _lastPropsKey = '';
        render();
      });
    }

    const actSelect = content.querySelector('[data-prop="neuronActivation"]');
    if (actSelect) {
      actSelect.addEventListener('change', () => {
        saveState();
        neuron.activation = actSelect.value || null;
        invalidateBackendNetwork();
        _lastPropsKey = '';
        render();
      });
    }

    // Connection weight inputs
    content.querySelectorAll('[data-conn]').forEach(input => {
      input.addEventListener('change', () => {
        saveState();
        const connId = input.dataset.conn;
        const conn = network.getConnection(connId);
        if (conn) {
          conn.weight = parseFloat(input.value) || 0;
        }
        _lastPropsKey = '';
        render();
      });
    });

    // Collapsible group headers
    content.querySelectorAll('.props-group-header').forEach(header => {
      header.addEventListener('click', () => {
        const body = header.nextElementSibling;
        const icon = header.querySelector('.codicon');
        if (body.style.display === 'none') {
          body.style.display = '';
          icon.className = 'codicon codicon-chevron-down';
        } else {
          body.style.display = 'none';
          icon.className = 'codicon codicon-chevron-right';
        }
      });
    });
  }

  // --- Minimap ---
  const minimapCanvas = document.getElementById('minimap-canvas');
  const minimapCtx = minimapCanvas.getContext('2d');
  const minimapContainer = document.getElementById('minimap-container');
  let minimapVisible = true;

  function getWorldBounds() {
    const layers = network.getAllLayers();
    const neurons = network.getAllNeurons();
    if (layers.length === 0) return { minX: -200, maxX: 200, minY: -200, maxY: 200 };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    layers.forEach(layer => {
      const ns = network.getNeuronsByLayer(layer.id);
      const worldH = Math.max(ns.length * NEURON_GAP + 40, LAYER_HEIGHT);
      const halfW = LAYER_WIDTH / 2;
      const halfH = worldH / 2;
      minX = Math.min(minX, layer.position.x - halfW);
      maxX = Math.max(maxX, layer.position.x + halfW);
      minY = Math.min(minY, layer.position.y - halfH);
      maxY = Math.max(maxY, layer.position.y + halfH);
    });

    const padX = (maxX - minX) * 0.15 + 60;
    const padY = (maxY - minY) * 0.15 + 60;
    return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
  }

  function renderMinimap() {
    if (!minimapVisible) return;

    const cRect = minimapContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    minimapCanvas.width = cRect.width * dpr;
    minimapCanvas.height = cRect.height * dpr;
    minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mw = cRect.width;
    const mh = cRect.height;

    minimapCtx.clearRect(0, 0, mw, mh);

    const bounds = getWorldBounds();
    const bw = bounds.maxX - bounds.minX;
    const bh = bounds.maxY - bounds.minY;
    const scale = Math.min(mw / bw, mh / bh);
    const offX = (mw - bw * scale) / 2;
    const offY = (mh - bh * scale) / 2;

    function worldToMini(wx, wy) {
      return {
        x: (wx - bounds.minX) * scale + offX,
        y: (wy - bounds.minY) * scale + offY
      };
    }

    // Draw connections
    const connections = network.getAllConnections();
    minimapCtx.strokeStyle = 'rgba(79, 193, 255, 0.2)';
    minimapCtx.lineWidth = 0.5;
    connections.forEach(conn => {
      const from = network.getNeuron(conn.fromNeuron);
      const to = network.getNeuron(conn.toNeuron);
      if (!from || !to) return;
      const p1 = worldToMini(from.position.x, from.position.y);
      const p2 = worldToMini(to.position.x, to.position.y);
      minimapCtx.beginPath();
      minimapCtx.moveTo(p1.x, p1.y);
      minimapCtx.lineTo(p2.x, p2.y);
      minimapCtx.stroke();
    });

    // Draw layers
    const layers = network.getAllLayers();
    layers.forEach((layer, li) => {
      const color = layer.style.color || LAYER_COLORS[li % LAYER_COLORS.length];
      const ns = network.getNeuronsByLayer(layer.id);
      const worldH = Math.max(ns.length * NEURON_GAP + 40, LAYER_HEIGHT);
      const w = LAYER_WIDTH * scale;
      const h = worldH * scale;
      const pos = worldToMini(layer.position.x, layer.position.y);
      minimapCtx.fillStyle = color + '40';
      minimapCtx.fillRect(pos.x - w / 2, pos.y - h / 2, w, h);
      minimapCtx.strokeStyle = color;
      minimapCtx.lineWidth = 1;
      minimapCtx.strokeRect(pos.x - w / 2, pos.y - h / 2, w, h);
    });

    // Draw neurons as dots
    const neurons = network.getAllNeurons();
    neurons.forEach(neuron => {
      const li = layers.findIndex(l => l.id === neuron.layerId);
      const layer = layers[li];
      const color = (layer && layer.style.color) || LAYER_COLORS[li % LAYER_COLORS.length];
      const pos = worldToMini(neuron.position.x, neuron.position.y);
      const r = Math.max(1.5, NEURON_RADIUS * scale);
      minimapCtx.beginPath();
      minimapCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      minimapCtx.fillStyle = color;
      minimapCtx.fill();
    });

    // Draw viewport rectangle
    const canvasRect = canvas.getBoundingClientRect();
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(canvasRect.width, canvasRect.height);
    const vpTL = worldToMini(topLeft.x, topLeft.y);
    const vpBR = worldToMini(bottomRight.x, bottomRight.y);
    const vpW = vpBR.x - vpTL.x;
    const vpH = vpBR.y - vpTL.y;

    minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    minimapCtx.lineWidth = 1.5;
    minimapCtx.strokeRect(vpTL.x, vpTL.y, vpW, vpH);
    minimapCtx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    minimapCtx.fillRect(vpTL.x, vpTL.y, vpW, vpH);

    // Store transform for click interaction
    minimapCanvas._transform = { bounds, scale, offX, offY };
  }

  // Minimap click/drag to pan
  let minimapDragging = false;

  function minimapNavigate(e) {
    const t = minimapCanvas._transform;
    if (!t) return;
    const rect = minimapContainer.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldX = (mx - t.offX) / t.scale + t.bounds.minX;
    const worldY = (my - t.offY) / t.scale + t.bounds.minY;

    const canvasRect = canvas.getBoundingClientRect();
    const cx = canvasRect.width / 2;
    const cy = canvasRect.height / 2;
    viewport.x = cx - worldX * viewport.zoom;
    viewport.y = cy - worldY * viewport.zoom;
    render();
  }

  minimapContainer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    minimapDragging = true;
    minimapNavigate(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (minimapDragging) {
      minimapNavigate(e);
    }
  });

  window.addEventListener('mouseup', () => {
    minimapDragging = false;
  }, true);

  canvas.addEventListener('mouseleave', () => {
    hoverNeuronId = null;
    hoverLayerId = null;
    hoverConnection = null;
    tooltipEl.style.display = 'none';
  });

  canvas.addEventListener('mousedown', (e) => {
    tooltipEl.style.display = 'none';
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanning = true;
      panStart = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
      canvas.classList.add('panning');
      e.preventDefault();
      return;
    }

    if (e.button === 0) {
      const neuron = hitTestNeuron(mx, my);
      
      if (isConnecting && connectFrom) {
        if (neuron && neuron.id !== connectFrom) {
          const fromNeuron = network.getNeuron(connectFrom);
          if (fromNeuron.layerId !== neuron.layerId) {
            saveState();
            network.createConnection({
              fromNeuron: connectFrom,
              toNeuron: neuron.id,
              fromLayer: fromNeuron.layerId,
              toLayer: neuron.layerId
            });
          }
        }
        isConnecting = false;
        connectFrom = null;
        render();
        return;
      }

      if (e.shiftKey) {
        if (neuron) {
          selectedNeuronIds.add(neuron.id);
          selectedLayerIds.clear();
          render();
          return;
        }
        const layer = hitTestLayer(mx, my);
        if (layer) {
          selectedLayerIds.add(layer.id);
          selectedNeuronIds.clear();
          render();
          return;
        }
        selectedLayerIds.clear();
        selectedNeuronIds.clear();
        render();
        return;
      }

      if (neuron) {
        selectedNeuronIds.clear();
        selectedLayerIds.clear();
        selectedNeuronIds.add(neuron.id);
        isDragging = true;
        dragMoved = false;
        dragTarget = { type: 'neuron', id: neuron.id, originalLayerId: neuron.layerId };
        dragOffset = { x: neuron.position.x - screenToWorld(mx, my).x, y: neuron.position.y - screenToWorld(mx, my).y };
        render();
        return;
      }

      const layer = hitTestLayer(mx, my);
      if (layer) {
        selectedNeuronIds.clear();
        selectedLayerIds.clear();
        selectedLayerIds.add(layer.id);
        isDragging = true;
        dragMoved = false;
        dragTarget = { type: 'layer', id: layer.id };
        dragOffset = { x: layer.position.x - screenToWorld(mx, my).x, y: layer.position.y - screenToWorld(mx, my).y };
        render();
        return;
      }

      selectedNeuronIds.clear();
      selectedLayerIds.clear();
      hideContextToolbar();
      isPanning = true;
      panStart = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
      canvas.classList.add('panning');
      render();
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    mouseWorldPos = screenToWorld(mx, my);

    hoverNeuronId = null;
    hoverLayerId = null;
    hoverConnection = null;
    tooltipMouseX = e.clientX;
    tooltipMouseY = e.clientY;
    const neuron = hitTestNeuron(mx, my);
    if (neuron) {
      hoverNeuronId = neuron.id;
    } else {
      const layer = hitTestLayer(mx, my);
      if (layer) {
        hoverLayerId = layer.id;
      } else {
        hoverConnection = hitTestConnection(mx, my, 6);
      }
    }
    updateTooltip();

    if (isConnecting) {
      render();
      return;
    }

    if (isDragging && dragTarget) {
      dragMoved = true;
      const world = screenToWorld(mx, my);
      
      if (dragTarget.type === 'neuron') {
        dropTargetLayerId = null;
        
        const hoveredNeuron = hitTestNeuron(mx, my, dragTarget.id);
        if (!hoveredNeuron) {
          const hoveredLayer = hitTestLayer(mx, my);
          if (hoveredLayer && hoveredLayer.id !== dragTarget.originalLayerId) {
            dropTargetLayerId = hoveredLayer.id;
          }
        }

        const n = network.getNeuron(dragTarget.id);
        if (n) {
          n.position.x = world.x + dragOffset.x;
          n.position.y = world.y + dragOffset.y;
        }
      }
      else if (dragTarget.type === 'layer') {
        const layer = network.getLayer(dragTarget.id);
        if (layer) {
          layer.position.x = world.x + dragOffset.x;
          layer.position.y = world.y + dragOffset.y;
          layoutLayerNeurons(layer);
        }
      }
      
      render();
      return;
    }

    if (isPanning) {
      viewport.x = e.clientX - panStart.x;
      viewport.y = e.clientY - panStart.y;
      render();
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDragging && dragTarget && dragTarget.type === 'neuron' && dropTargetLayerId) {
      const neuron = network.getNeuron(dragTarget.id);
      if (neuron && neuron.layerId !== dropTargetLayerId) {
        saveState();
        network.updateNeuron(dragTarget.id, { layerId: dropTargetLayerId });

        // Remove connections that became same-layer after move
        const conns = network.getConnectionsByNeuron(dragTarget.id);
        conns.forEach(conn => {
          const from = network.getNeuron(conn.fromNeuron);
          const to = network.getNeuron(conn.toNeuron);
          if (from && to && from.layerId === to.layerId) {
            network.deleteConnection(conn.id);
          }
        });
        
        const oldLayer = network.getLayer(dragTarget.originalLayerId);
        const newLayer = network.getLayer(dropTargetLayerId);
        if (oldLayer) layoutLayerNeurons(oldLayer);
        if (newLayer) layoutLayerNeurons(newLayer);
      }
      dropTargetLayerId = null;
      render();
    } else if (isDragging && dragTarget && dragTarget.type === 'neuron') {
      const oldLayer = network.getLayer(dragTarget.originalLayerId);
      if (oldLayer) layoutLayerNeurons(oldLayer);
      render();
    }

    if (isDragging && dragTarget && dragTarget.type === 'layer') {
      const layer = network.getLayer(dragTarget.id);
      if (layer) {
        if (viewport.snapToGrid) {
          const snapped = snapToGridPos(layer.position.x, layer.position.y);
          layer.position.x = snapped.x;
          layer.position.y = snapped.y;
        }
        layoutLayerNeurons(layer);
        render();
      }
    }

    if (isDragging) {
      // Show context toolbar if it was a click (not a drag)
      if (!dragMoved && dragTarget) {
        showContextToolbar(dragTarget);
      }
      if (dragMoved) _lastPropsKey = '';
      isDragging = false;
      dragTarget = null;
      dragMoved = false;
    }
    if (isPanning) {
      isPanning = false;
      canvas.classList.remove('panning');
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const worldBefore = screenToWorld(mx, my);

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    viewport.zoom = Math.max(viewport.minZoom, Math.min(viewport.maxZoom, viewport.zoom * delta));

    const screenAfter = worldToScreen(worldBefore.x, worldBefore.y);
    viewport.x -= (screenAfter.x - mx);
    viewport.y -= (screenAfter.y - my);

    zoomLevelEl.textContent = Math.round(viewport.zoom * 100) + '%';
    render();
  }, { passive: false });

  document.getElementById('zoom-in').addEventListener('click', () => {
    viewport.zoom = Math.min(viewport.maxZoom, viewport.zoom * 1.2);
    zoomLevelEl.textContent = Math.round(viewport.zoom * 100) + '%';
    render();
  });

  document.getElementById('zoom-out').addEventListener('click', () => {
    viewport.zoom = Math.max(viewport.minZoom, viewport.zoom * 0.8);
    zoomLevelEl.textContent = Math.round(viewport.zoom * 100) + '%';
    render();
  });

  document.getElementById('zoom-fit').addEventListener('click', () => {
    viewport.x = 0;
    viewport.y = 0;
    viewport.zoom = 1;
    zoomLevelEl.textContent = '100%';
    render();
  });

  document.getElementById('zoom-fit-content').addEventListener('click', () => {
    const layers = network.getAllLayers();
    const neurons = network.getAllNeurons();
    if (layers.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    layers.forEach(layer => {
      const layerNeurons = network.getNeuronsByLayer(layer.id);
      const worldH = Math.max(layerNeurons.length * NEURON_GAP + 40, LAYER_HEIGHT);
      const halfW = LAYER_WIDTH / 2;
      const halfH = worldH / 2;
      minX = Math.min(minX, layer.position.x - halfW);
      maxX = Math.max(maxX, layer.position.x + halfW);
      minY = Math.min(minY, layer.position.y - halfH);
      maxY = Math.max(maxY, layer.position.y + halfH);
    });

    const padding = 60;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / contentW;
    const scaleY = rect.height / contentH;
    const newZoom = Math.max(viewport.minZoom, Math.min(viewport.maxZoom, Math.min(scaleX, scaleY)));

    viewport.zoom = newZoom;
    viewport.x = -centerX * newZoom;
    viewport.y = -centerY * newZoom;
    zoomLevelEl.textContent = Math.round(viewport.zoom * 100) + '%';
    render();
  });

  document.getElementById('toggle-grid').addEventListener('click', () => {
    viewport.showGrid = !viewport.showGrid;
    render();
  });

  const toggleSnapBtn = document.getElementById('toggle-snap');
  toggleSnapBtn.classList.add('active');
  toggleSnapBtn.addEventListener('click', () => {
    viewport.snapToGrid = !viewport.snapToGrid;
    toggleSnapBtn.classList.toggle('active', viewport.snapToGrid);
    render();
  });

  const toggleMinimapBtn = document.getElementById('toggle-minimap');
  toggleMinimapBtn.addEventListener('click', () => {
    minimapVisible = !minimapVisible;
    minimapContainer.style.display = minimapVisible ? '' : 'none';
    toggleMinimapBtn.classList.toggle('active', minimapVisible);
    if (minimapVisible) renderMinimap();
  });

  const toggleWeightsBtn = document.getElementById('toggle-weights');
  toggleWeightsBtn.addEventListener('click', () => {
    viewport.showWeights = !viewport.showWeights;
    toggleWeightsBtn.classList.toggle('active', viewport.showWeights);
    render();
  });

  const toggleActivationsBtn = document.getElementById('toggle-activations');
  toggleActivationsBtn.addEventListener('click', () => {
    viewport.showActivations = !viewport.showActivations;
    toggleActivationsBtn.classList.toggle('active', viewport.showActivations);
    if (viewport.showActivations) {
      runActivationVisualization();
    } else {
      neuronActivations.clear();
      render();
    }
  });

  const btnAddNeuron = document.querySelector('#view-create .sidebar-btn:first-child');
  const btnAddLayer = document.querySelector('#view-create .sidebar-btn:nth-child(2)');
  const btnClearCanvas = document.getElementById('btn-clear-canvas');
  const btnAutoConnect = document.getElementById('btn-auto-connect');
  const btnClearConnections = document.getElementById('btn-clear-connections');

  if (btnAddNeuron) {
    btnAddNeuron.addEventListener('click', () => {
      if (selectedLayerIds.size > 0) {
        const layerId = selectedLayerIds.values().next().value;
        const layer = network.getLayer(layerId);
        if (layer) {
          saveState();
          network.createNeuron({ layerId });
          layoutLayerNeurons(layer);
          render();
        }
      }
    });
  }

  if (btnAddLayer) {
    btnAddLayer.addEventListener('click', () => {
      saveState();
      const count = network.getAllLayers().length;
      const activations = ['relu', 'sigmoid', 'tanh', 'softmax', 'linear'];
      const layer = network.createLayer({
        name: count === 0 ? 'Input' : `Layer ${count + 1}`,
        type: 'dense',
        activation: activations[count % activations.length],
        position: { x: count * 200, y: 0 }
      });
      selectedLayerIds.clear();
      selectedNeuronIds.clear();
      selectedLayerIds.add(layer.id);
      render();
    });
  }

  if (btnClearConnections) {
    btnClearConnections.addEventListener('click', () => {
      const connections = network.getAllConnections();
      if (connections.length === 0) {
        return;
      }
      saveState();
      connections.forEach(conn => {
        network.deleteConnection(conn.id);
      });
      render();
    });
  }

  if (btnClearCanvas) {
    btnClearCanvas.addEventListener('click', () => {
      const layers = network.getAllLayers();
      if (layers.length === 0) return;
      saveState();
      layers.forEach(layer => {
        network.deleteLayer(layer.id);
      });
      selectedLayerIds.clear();
      selectedNeuronIds.clear();
      notes = [];
      render();
    });
  }

  const btnAutoLayout = document.getElementById('btn-auto-layout');
  if (btnAutoLayout) {
    btnAutoLayout.addEventListener('click', () => {
      autoLayout();
    });
  }

  const modal = document.getElementById('auto-connect-modal');
  const modalClose = document.getElementById('modal-close');
  const modalCancel = document.getElementById('modal-cancel');
  const modalConfirm = document.getElementById('modal-confirm');
  const connectType = document.getElementById('connect-type');
  const customRangeSection = document.getElementById('custom-range-section');
  const connectFromLayer = document.getElementById('connect-from-layer');
  const connectToLayer = document.getElementById('connect-to-layer');
  const connectBidirectional = document.getElementById('connect-bidirectional');

  if (btnAutoConnect) {
    btnAutoConnect.addEventListener('click', () => {
      const layers = network.getAllLayers();
      if (layers.length < 2) {
        alert('You need at least 2 layers to create connections.');
        return;
      }

      connectFromLayer.innerHTML = '';
      connectToLayer.innerHTML = '';
      layers.forEach((layer, i) => {
        const opt1 = document.createElement('option');
        opt1.value = layer.id;
        opt1.textContent = layer.name || `Layer ${i + 1}`;
        connectFromLayer.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = layer.id;
        opt2.textContent = layer.name || `Layer ${i + 1}`;
        connectToLayer.appendChild(opt2);
      });

      if (layers.length >= 2) {
        connectFromLayer.selectedIndex = 0;
        connectToLayer.selectedIndex = layers.length - 1;
      }

      modal.style.display = 'flex';
    });
  }

  connectType.addEventListener('change', () => {
    const v = connectType.value;
    customRangeSection.style.display = v === 'custom' ? 'block' : 'none';
    document.getElementById('skip-section').style.display = v === 'skip' ? 'block' : 'none';
    document.getElementById('random-section').style.display = v === 'random' ? 'block' : 'none';
  });

  modalClose.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modalCancel.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.querySelector('.modal-overlay').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modalConfirm.addEventListener('click', () => {
    const type = connectType.value;
    const bidirectional = connectBidirectional.checked;
    const layers = network.getAllLayers();

    saveState();
    let connectionsCreated = 0;

    if (type === 'sequential') {
      for (let i = 0; i < layers.length - 1; i++) {
        const fromLayer = layers[i];
        const toLayer = layers[i + 1];
        const fromNeurons = network.getNeuronsByLayer(fromLayer.id);
        const toNeurons = network.getNeuronsByLayer(toLayer.id);

        fromNeurons.forEach(fn => {
          toNeurons.forEach(tn => {
            network.createConnection({
              fromNeuron: fn.id,
              toNeuron: tn.id,
              fromLayer: fromLayer.id,
              toLayer: toLayer.id
            });
            connectionsCreated++;
          });
        });

        if (bidirectional) {
          toNeurons.forEach(tn => {
            fromNeurons.forEach(fn => {
              network.createConnection({
                fromNeuron: tn.id,
                toNeuron: fn.id,
                fromLayer: toLayer.id,
                toLayer: fromLayer.id
              });
              connectionsCreated++;
            });
          });
        }
      }
    } else if (type === 'full') {
      for (let i = 0; i < layers.length; i++) {
        for (let j = 0; j < layers.length; j++) {
          if (i === j) continue;
          
          const fromLayer = layers[i];
          const toLayer = layers[j];
          const fromNeurons = network.getNeuronsByLayer(fromLayer.id);
          const toNeurons = network.getNeuronsByLayer(toLayer.id);

          fromNeurons.forEach(fn => {
            toNeurons.forEach(tn => {
              const existing = network.getAllConnections().find(
                c => c.fromNeuron === fn.id && c.toNeuron === tn.id
              );
              if (!existing) {
                network.createConnection({
                  fromNeuron: fn.id,
                  toNeuron: tn.id,
                  fromLayer: fromLayer.id,
                  toLayer: toLayer.id
                });
                connectionsCreated++;
              }
            });
          });
        }
      }
    } else if (type === 'one-to-one') {
      for (let i = 0; i < layers.length - 1; i++) {
        const fromLayer = layers[i];
        const toLayer = layers[i + 1];
        const fromNeurons = network.getNeuronsByLayer(fromLayer.id);
        const toNeurons = network.getNeuronsByLayer(toLayer.id);
        const count = Math.min(fromNeurons.length, toNeurons.length);

        for (let n = 0; n < count; n++) {
          network.createConnection({
            fromNeuron: fromNeurons[n].id,
            toNeuron: toNeurons[n].id,
            fromLayer: fromLayer.id,
            toLayer: toLayer.id
          });
          connectionsCreated++;

          if (bidirectional) {
            network.createConnection({
              fromNeuron: toNeurons[n].id,
              toNeuron: fromNeurons[n].id,
              fromLayer: toLayer.id,
              toLayer: fromLayer.id
            });
            connectionsCreated++;
          }
        }
      }
    } else if (type === 'skip') {
      const k = parseInt(document.getElementById('skip-distance').value) || 2;
      for (let i = 0; i < layers.length - k; i++) {
        const fromLayer = layers[i];
        const toLayer = layers[i + k];
        const fromNeurons = network.getNeuronsByLayer(fromLayer.id);
        const toNeurons = network.getNeuronsByLayer(toLayer.id);

        fromNeurons.forEach(fn => {
          toNeurons.forEach(tn => {
            network.createConnection({
              fromNeuron: fn.id,
              toNeuron: tn.id,
              fromLayer: fromLayer.id,
              toLayer: toLayer.id
            });
            connectionsCreated++;
          });
        });

        if (bidirectional) {
          toNeurons.forEach(tn => {
            fromNeurons.forEach(fn => {
              network.createConnection({
                fromNeuron: tn.id,
                toNeuron: fn.id,
                fromLayer: toLayer.id,
                toLayer: fromLayer.id
              });
              connectionsCreated++;
            });
          });
        }
      }
    } else if (type === 'random') {
      const prob = (parseInt(document.getElementById('random-probability').value) || 50) / 100;
      for (let i = 0; i < layers.length - 1; i++) {
        const fromLayer = layers[i];
        const toLayer = layers[i + 1];
        const fromNeurons = network.getNeuronsByLayer(fromLayer.id);
        const toNeurons = network.getNeuronsByLayer(toLayer.id);

        fromNeurons.forEach(fn => {
          toNeurons.forEach(tn => {
            if (Math.random() < prob) {
              network.createConnection({
                fromNeuron: fn.id,
                toNeuron: tn.id,
                fromLayer: fromLayer.id,
                toLayer: toLayer.id
              });
              connectionsCreated++;
            }
          });
        });

        if (bidirectional) {
          toNeurons.forEach(tn => {
            fromNeurons.forEach(fn => {
              if (Math.random() < prob) {
                network.createConnection({
                  fromNeuron: tn.id,
                  toNeuron: fn.id,
                  fromLayer: toLayer.id,
                  toLayer: fromLayer.id
                });
                connectionsCreated++;
              }
            });
          });
        }
      }
    } else if (type === 'custom') {
      const fromLayerId = connectFromLayer.value;
      const toLayerId = connectToLayer.value;

      if (fromLayerId === toLayerId) {
        alert('Please select different layers.');
        return;
      }

      const fromLayer = network.getLayer(fromLayerId);
      const toLayer = network.getLayer(toLayerId);
      const fromNeurons = network.getNeuronsByLayer(fromLayerId);
      const toNeurons = network.getNeuronsByLayer(toLayerId);

      fromNeurons.forEach(fn => {
        toNeurons.forEach(tn => {
          network.createConnection({
            fromNeuron: fn.id,
            toNeuron: tn.id,
            fromLayer: fromLayerId,
            toLayer: toLayerId
          });
          connectionsCreated++;
        });
      });

      if (bidirectional) {
        toNeurons.forEach(tn => {
          fromNeurons.forEach(fn => {
            network.createConnection({
              fromNeuron: tn.id,
              toNeuron: fn.id,
              fromLayer: toLayerId,
              toLayer: fromLayerId
            });
            connectionsCreated++;
          });
        });
      }
    }

    modal.style.display = 'none';
    render();
  });

  window.startConnection = function(neuronId) {
    isConnecting = true;
    connectFrom = neuronId;
    render();
  };

  window.getNetwork = () => network;
  window.getSelectedLayers = () => [...selectedLayerIds];
  window.getSelectedNeurons = () => [...selectedNeuronIds];
  window.getViewport = () => ({ ...viewport });
  window.screenToWorld = screenToWorld;

  window.addEventListener('resize', resizeCanvas);

  // Rename Modal
  const renameModal = document.getElementById('rename-modal');
  const renameInput = document.getElementById('rename-input');
  const renameConfirm = document.getElementById('rename-confirm');
  const renameCancel = document.getElementById('rename-cancel');
  const renameModalClose = document.getElementById('rename-modal-close');
  let renameLayerId = null;

  function openRenameModal(layerId) {
    const layer = network.getLayer(layerId);
    if (!layer) return;
    renameLayerId = layerId;
    renameInput.value = layer.name;
    renameModal.style.display = 'flex';
    setTimeout(() => { renameInput.focus(); renameInput.select(); }, 50);
  }

  function closeRenameModal() {
    renameModal.style.display = 'none';
    renameLayerId = null;
  }

  function confirmRename() {
    if (renameLayerId) {
      const layer = network.getLayer(renameLayerId);
      const val = renameInput.value.trim();
      if (layer && val) {
        saveState();
        layer.name = val;
        render();
      }
    }
    closeRenameModal();
  }

  renameConfirm.addEventListener('click', confirmRename);
  renameCancel.addEventListener('click', closeRenameModal);
  renameModalClose.addEventListener('click', closeRenameModal);
  renameModal.querySelector('.modal-overlay').addEventListener('click', closeRenameModal);
  renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmRename();
    if (e.key === 'Escape') closeRenameModal();
  });

  // Context Toolbar Logic
  let ctxJustShown = false;

  function showContextToolbar(target) {
    ctxTarget = target;
    ctxToolbar.style.display = 'block';
    ctxDropdown.style.display = 'none';
    updateContextToolbarPosition();
    ctxJustShown = true;
    requestAnimationFrame(() => { ctxJustShown = false; });
  }

  function hideContextToolbar() {
    ctxToolbar.style.display = 'none';
    ctxDropdown.style.display = 'none';
    ctxTarget = null;
  }

  function buildDropdownItems() {
    if (!ctxTarget) return;
    let html = '';

    if (ctxTarget.type === 'layer') {
      const layer = network.getLayer(ctxTarget.id);
      if (!layer) return;

      html += `<button class="ctx-dropdown-item" data-action="rename-layer"><span class="codicon codicon-edit"></span>Rename Layer</button>`;
      html += `<button class="ctx-dropdown-item" data-action="duplicate-layer"><span class="codicon codicon-copy"></span>Duplicate Layer</button>`;
      html += `<button class="ctx-dropdown-item" data-action="add-neuron"><span class="codicon codicon-add"></span>Add Neuron</button>`;
      html += `<button class="ctx-dropdown-item" data-action="set-neuron-count"><span class="codicon codicon-symbol-numeric"></span>Set Neuron Count</button>`;
      html += `<div class="ctx-dropdown-separator"></div>`;
      html += `<button class="ctx-dropdown-item" data-action="change-activation"><span class="codicon codicon-zap"></span>Activation</button>`;
      html += `<div class="ctx-activation-row" id="ctx-activation-row" style="display:none">`;
      const currentAct = (layer.activation || 'relu').toLowerCase();
      const acts = [
        { value: 'linear', label: 'Linear' },
        { value: 'relu', label: 'ReLU' },
        { value: 'leaky_relu', label: 'LReLU' },
        { value: 'sigmoid', label: 'Sigmoid' },
        { value: 'tanh', label: 'Tanh' },
        { value: 'softmax', label: 'Softmax' },
        { value: 'elu', label: 'ELU' },
        { value: 'gelu', label: 'GELU' },
        { value: 'swish', label: 'Swish' },
      ];
      acts.forEach(a => {
        const active = a.value === currentAct ? ' active' : '';
        html += `<button class="ctx-act-pill${active}" data-activation="${a.value}">${a.label}</button>`;
      });
      html += `</div>`;
      html += `<button class="ctx-dropdown-item" data-action="change-color"><span class="codicon codicon-symbol-color"></span>Change Color</button>`;
      html += `<div class="ctx-color-row" id="ctx-color-row" style="display:none">`;
      const colors = ['#0e639c', '#6a3d99', '#2a7a3a', '#a35200', '#8b0000', '#4a4a8a', '#5c3a6e', '#1a6e5a', '#b5862a', '#c74040', '#2980b9', '#27ae60'];
      const currentColor = layer.style.color || LAYER_COLORS[network.getAllLayers().indexOf(layer) % LAYER_COLORS.length];
      colors.forEach(c => {
        const active = c === currentColor ? ' active' : '';
        html += `<div class="ctx-color-swatch${active}" data-color="${c}" style="background:${c}"></div>`;
      });
      html += `</div>`;
      html += `<div class="ctx-dropdown-separator"></div>`;
      html += `<button class="ctx-dropdown-item" data-action="remove-layer" style="color:#f48771"><span class="codicon codicon-trash" style="color:#f48771"></span>Remove Layer</button>`;
    } else if (ctxTarget.type === 'neuron') {
      html += `<button class="ctx-dropdown-item" data-action="connect-from"><span class="codicon codicon-plug"></span>Start Connection</button>`;
      html += `<div class="ctx-dropdown-separator"></div>`;
      html += `<button class="ctx-dropdown-item" data-action="remove-neuron" style="color:#f48771"><span class="codicon codicon-trash" style="color:#f48771"></span>Remove Neuron</button>`;
    }

    ctxDropdown.innerHTML = html;

    // wire up actions
    ctxDropdown.querySelectorAll('.ctx-dropdown-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleCtxAction(btn.dataset.action);
      });
    });

    // wire up color swatches
    ctxDropdown.querySelectorAll('.ctx-color-swatch').forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        if (ctxTarget && ctxTarget.type === 'layer') {
          const layer = network.getLayer(ctxTarget.id);
          if (layer) {
            saveState();
            layer.style.color = swatch.dataset.color;
            render();
          }
        }
        hideContextToolbar();
      });
    });

    // wire up activation pills
    ctxDropdown.querySelectorAll('.ctx-act-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        if (ctxTarget && ctxTarget.type === 'layer') {
          const layer = network.getLayer(ctxTarget.id);
          if (layer) {
            saveState();
            layer.activation = pill.dataset.activation;
            invalidateBackendNetwork();
            render();
            logOutput(`Layer "${layer.name}" activation → ${pill.dataset.activation}`, 'info');
          }
        }
        hideContextToolbar();
      });
    });
  }

  function handleCtxAction(action) {
    if (!ctxTarget) return;

    if (action === 'remove-layer') {
      saveState();
      network.deleteLayer(ctxTarget.id);
      selectedLayerIds.delete(ctxTarget.id);
      hideContextToolbar();
      render();
    } else if (action === 'remove-neuron') {
      saveState();
      network.deleteNeuron(ctxTarget.id);
      selectedNeuronIds.delete(ctxTarget.id);
      const neuron = network.getNeuron(ctxTarget.id);
      hideContextToolbar();
      // re-layout parent layer
      network.getAllLayers().forEach(l => layoutLayerNeurons(l));
      render();
    } else if (action === 'rename-layer') {
      const layer = network.getLayer(ctxTarget.id);
      if (layer) {
        openRenameModal(ctxTarget.id);
      }
      hideContextToolbar();
    } else if (action === 'duplicate-layer') {
      const srcLayer = network.getLayer(ctxTarget.id);
      if (srcLayer) {
        saveState();
        const srcNeurons = network.getNeuronsByLayer(srcLayer.id);
        const newLayer = network.createLayer({
          name: srcLayer.name + ' (copy)',
          type: srcLayer.type,
          activation: srcLayer.activation,
          position: { x: srcLayer.position.x + 200, y: srcLayer.position.y },
          style: { ...srcLayer.style }
        });
        srcNeurons.forEach(() => {
          network.createNeuron({ layerId: newLayer.id });
        });
        layoutLayerNeurons(newLayer);
        selectedLayerIds.clear();
        selectedNeuronIds.clear();
        selectedLayerIds.add(newLayer.id);
        render();
      }
      hideContextToolbar();
    } else if (action === 'add-neuron') {
      const layer = network.getLayer(ctxTarget.id);
      if (layer) {
        saveState();
        network.createNeuron({ layerId: layer.id });
        layoutLayerNeurons(layer);
        render();
      }
      hideContextToolbar();
    } else if (action === 'connect-from') {
      isConnecting = true;
      connectFrom = ctxTarget.id;
      hideContextToolbar();
      render();
    } else if (action === 'change-color') {
      const colorRow = document.getElementById('ctx-color-row');
      if (colorRow) {
        colorRow.style.display = colorRow.style.display === 'none' ? 'flex' : 'none';
      }
      // Hide activation row if open
      const actRow = document.getElementById('ctx-activation-row');
      if (actRow) actRow.style.display = 'none';
      return; // don't close dropdown
    } else if (action === 'change-activation') {
      const actRow = document.getElementById('ctx-activation-row');
      if (actRow) {
        actRow.style.display = actRow.style.display === 'none' ? 'flex' : 'none';
      }
      // Hide color row if open
      const colorRow = document.getElementById('ctx-color-row');
      if (colorRow) colorRow.style.display = 'none';
      return; // don't close dropdown
    } else if (action === 'set-neuron-count') {
      const layer = network.getLayer(ctxTarget.id);
      if (layer) {
        const currentNeurons = network.getNeuronsByLayer(layer.id);
        const input = prompt(`Set neuron count for "${layer.name}":`, currentNeurons.length);
        if (input !== null) {
          const count = parseInt(input);
          if (!isNaN(count) && count >= 1 && count <= 256) {
            saveState();
            const diff = count - currentNeurons.length;
            if (diff > 0) {
              for (let i = 0; i < diff; i++) network.createNeuron({ layerId: layer.id });
            } else if (diff < 0) {
              for (let i = 0; i < -diff; i++) {
                network.deleteNeuron(currentNeurons[currentNeurons.length - 1 - i].id);
              }
            }
            layoutLayerNeurons(layer);
            render();
            logOutput(`Layer "${layer.name}" → ${count} neurons`, 'info');
          }
        }
      }
      hideContextToolbar();
    }
  }

  ctxToolsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ctxDropdown.style.display === 'none') {
      buildDropdownItems();
      ctxDropdown.style.display = 'block';
    } else {
      ctxDropdown.style.display = 'none';
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (ctxJustShown) return;
    if (ctxToolbar.style.display !== 'none' && !ctxToolbar.contains(e.target)) {
      hideContextToolbar();
    }
  });

  window.addEventListener('resize', resizeCanvas);
  
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (document.activeElement && document.activeElement.isContentEditable);

    if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing) {
      if (selectedNeuronIds.size > 0 || selectedLayerIds.size > 0) {
        saveState();
      }
      if (selectedNeuronIds.size > 0) {
        selectedNeuronIds.forEach(neuronId => {
          network.deleteNeuron(neuronId);
        });
        selectedNeuronIds.clear();
        hideContextToolbar();
        render();
      }
      if (selectedLayerIds.size > 0) {
        selectedLayerIds.forEach(layerId => {
          network.deleteLayer(layerId);
        });
        selectedLayerIds.clear();
        hideContextToolbar();
        render();
      }
    }
    
    if (e.key === 'Escape') {
      isConnecting = false;
      connectFrom = null;
      hideContextToolbar();
      render();
    }
  });

  // Canvas Context Menu (right-click)
  const ctxMenu = document.getElementById('canvas-context-menu');

  function hideContextMenu() {
    ctxMenu.style.display = 'none';
  }

  function showContextMenu(mx, my, screenMx, screenMy) {
    hideContextToolbar();
    const neuron = hitTestNeuron(mx, my);
    const layer = neuron ? null : hitTestLayer(mx, my);
    const layers = network.getAllLayers();
    const hasLayers = layers.length > 0;
    const hasConnections = network.getAllConnections().length > 0;
    let html = '';

    if (neuron) {
      const parentLayer = network.getLayer(neuron.layerId);
      const nIdx = parentLayer ? network.getNeuronsByLayer(parentLayer.id).findIndex(n => n.id === neuron.id) : 0;
      html += `<div class="ctxmenu-label">${parentLayer ? parentLayer.name : 'Neuron'} › N${nIdx}</div>`;
      html += `<button class="ctxmenu-item" data-action="ctx-connect"><span class="codicon codicon-plug"></span>Start Connection</button>`;
      html += `<div class="ctxmenu-separator"></div>`;
      html += `<button class="ctxmenu-item danger" data-action="ctx-remove-neuron" data-id="${neuron.id}"><span class="codicon codicon-trash"></span>Remove Neuron</button>`;
    } else if (layer) {
      html += `<div class="ctxmenu-label">${layer.name}</div>`;
      html += `<button class="ctxmenu-item" data-action="ctx-add-neuron-to" data-id="${layer.id}"><span class="codicon codicon-add"></span>Add Neuron</button>`;
      html += `<button class="ctxmenu-item" data-action="ctx-rename" data-id="${layer.id}"><span class="codicon codicon-edit"></span>Rename Layer</button>`;
      html += `<button class="ctxmenu-item" data-action="ctx-duplicate" data-id="${layer.id}"><span class="codicon codicon-copy"></span>Duplicate Layer</button>`;
      html += `<div class="ctxmenu-separator"></div>`;
      html += `<button class="ctxmenu-item danger" data-action="ctx-remove-layer" data-id="${layer.id}"><span class="codicon codicon-trash"></span>Remove Layer</button>`;
    } else {
      html += `<button class="ctxmenu-item" data-action="ctx-add-layer"><span class="codicon codicon-layers"></span>Add Layer Here</button>`;
      html += `<button class="ctxmenu-item" data-action="ctx-add-neuron-sel" ${!selectedLayerIds.size ? 'class="ctxmenu-item disabled"' : ''}><span class="codicon codicon-add"></span>Add Neuron to Selected</button>`;
      html += `<div class="ctxmenu-separator"></div>`;
      html += `<button class="ctxmenu-item ${!hasLayers ? 'disabled' : ''}" data-action="ctx-auto-connect"><span class="codicon codicon-plug"></span>Auto Connect</button>`;
      html += `<button class="ctxmenu-item ${!hasLayers ? 'disabled' : ''}" data-action="ctx-auto-layout"><span class="codicon codicon-layout"></span>Auto Layout</button>`;
      html += `<button class="ctxmenu-item ${!hasConnections ? 'disabled' : ''}" data-action="ctx-clear-connections"><span class="codicon codicon-clear-all"></span>Clear Connections</button>`;
      html += `<button class="ctxmenu-item ${!hasLayers ? 'disabled' : ''}" data-action="ctx-clear-canvas"><span class="codicon codicon-trash"></span>Clear Canvas</button>`;
    }

    ctxMenu.innerHTML = html;
    ctxMenu.style.left = mx + 'px';
    ctxMenu.style.top = my + 'px';
    ctxMenu.style.display = 'block';

    // Clamp to canvas bounds
    requestAnimationFrame(() => {
      const menuRect = ctxMenu.getBoundingClientRect();
      const canvasRect = canvas.parentElement.getBoundingClientRect();
      let left = mx, top = my;
      if (mx + menuRect.width > canvasRect.width) left = canvasRect.width - menuRect.width - 4;
      if (my + menuRect.height > canvasRect.height) top = canvasRect.height - menuRect.height - 4;
      ctxMenu.style.left = Math.max(0, left) + 'px';
      ctxMenu.style.top = Math.max(0, top) + 'px';
    });

    // Store world position for "Add Layer Here"
    ctxMenu._worldPos = screenToWorld(mx, my);
    if (neuron) ctxMenu._neuronId = neuron.id;

    // Wire up actions
    ctxMenu.querySelectorAll('.ctxmenu-item:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        handleContextMenuAction(action, id);
        hideContextMenu();
      });
    });
  }

  function handleContextMenuAction(action, id) {
    if (action === 'ctx-add-layer') {
      saveState();
      const pos = ctxMenu._worldPos || { x: 0, y: 0 };
      const count = network.getAllLayers().length;
      const activations = ['relu', 'sigmoid', 'tanh', 'softmax', 'linear'];
      const layer = network.createLayer({
        name: count === 0 ? 'Input' : `Layer ${count + 1}`,
        type: 'dense',
        activation: activations[count % activations.length],
        position: { x: pos.x, y: pos.y }
      });
      selectedLayerIds.clear();
      selectedNeuronIds.clear();
      selectedLayerIds.add(layer.id);
      render();
    } else if (action === 'ctx-add-neuron-sel') {
      if (selectedLayerIds.size > 0) {
        const layerId = selectedLayerIds.values().next().value;
        const layer = network.getLayer(layerId);
        if (layer) {
          saveState();
          network.createNeuron({ layerId });
          layoutLayerNeurons(layer);
          render();
        }
      }
    } else if (action === 'ctx-add-neuron-to') {
      const layer = network.getLayer(id);
      if (layer) {
        saveState();
        network.createNeuron({ layerId: id });
        layoutLayerNeurons(layer);
        render();
      }
    } else if (action === 'ctx-rename') {
      const layer = network.getLayer(id);
      if (layer) {
        openRenameModal(id);
      }
    } else if (action === 'ctx-duplicate') {
      const srcLayer = network.getLayer(id);
      if (srcLayer) {
        saveState();
        const srcNeurons = network.getNeuronsByLayer(srcLayer.id);
        const newLayer = network.createLayer({
          name: srcLayer.name + ' (copy)',
          type: srcLayer.type,
          activation: srcLayer.activation,
          position: { x: srcLayer.position.x + 200, y: srcLayer.position.y },
          style: { ...srcLayer.style }
        });
        srcNeurons.forEach(() => network.createNeuron({ layerId: newLayer.id }));
        layoutLayerNeurons(newLayer);
        selectedLayerIds.clear();
        selectedNeuronIds.clear();
        selectedLayerIds.add(newLayer.id);
        render();
      }
    } else if (action === 'ctx-remove-layer') {
      saveState();
      network.deleteLayer(id);
      selectedLayerIds.delete(id);
      render();
    } else if (action === 'ctx-remove-neuron') {
      saveState();
      network.deleteNeuron(id);
      selectedNeuronIds.delete(id);
      network.getAllLayers().forEach(l => layoutLayerNeurons(l));
      render();
    } else if (action === 'ctx-connect') {
      isConnecting = true;
      connectFrom = ctxMenu._neuronId;
      render();
    } else if (action === 'ctx-auto-connect') {
      btnAutoConnect.click();
    } else if (action === 'ctx-auto-layout') {
      autoLayout();
    } else if (action === 'ctx-clear-connections') {
      saveState();
      network.getAllConnections().forEach(conn => network.deleteConnection(conn.id));
      render();
    } else if (action === 'ctx-clear-canvas') {
      saveState();
      network.getAllLayers().forEach(layer => network.deleteLayer(layer.id));
      selectedLayerIds.clear();
      selectedNeuronIds.clear();
      notes = [];
      render();
    }
  }

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    showContextMenu(mx, my, e.clientX, e.clientY);
  });

  document.addEventListener('mousedown', (e) => {
    if (ctxMenu.style.display !== 'none' && !ctxMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // Menu bar actions
  const importJsonInput = document.getElementById('import-json-input');
  const shortcutsModal = document.getElementById('shortcuts-modal');
  const aboutModal = document.getElementById('about-modal');

  function switchPanel(viewName) {
    leftActivityIcons.forEach(i => {
      i.classList.remove('active');
      if (i.dataset.view === viewName) i.classList.add('active');
    });
    sidebarViews.forEach(view => {
      view.classList.remove('active');
      if (view.id === `view-${viewName}`) view.classList.add('active');
    });
    if (viewName === 'predict' && typeof buildPredictInputs === 'function') {
      buildPredictInputs();
    }
  }

  function handleMenuAction(action) {
    switch (action) {
      case 'menu-new-network':
        if (network.getAllLayers().length === 0 || confirm('Clear current network and start new?')) {
          saveState();
          network.getAllLayers().forEach(l => network.deleteLayer(l.id));
          selectedLayerIds.clear();
          selectedNeuronIds.clear();
          notes = [];
          viewport.x = 0; viewport.y = 0; viewport.zoom = 1;
          zoomLevelEl.textContent = '100%';
          history.clear();
          render();
        }
        break;

      case 'menu-export-json': {
        const data = {
          layers: network.getAllLayers().map(l => ({
            id: l.id, name: l.name, type: l.type, activation: l.activation,
            position: l.position, style: l.style,
            neurons: network.getNeuronsByLayer(l.id).map(n => ({ id: n.id, bias: n.bias }))
          })),
          connections: network.getAllConnections().map(c => ({
            fromNeuron: c.fromNeuron, toNeuron: c.toNeuron,
            fromLayer: c.fromLayer, toLayer: c.toLayer, weight: c.weight
          }))
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'vnns-topology.json';
        a.click();
        URL.revokeObjectURL(a.href);
        break;
      }

      case 'menu-import-json':
        importJsonInput.click();
        break;

      case 'menu-export-png': {
        const tempCanvas = document.createElement('canvas');
        const layers = network.getAllLayers();
        if (layers.length === 0) { render(); break; }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        layers.forEach(layer => {
          const neurons = network.getNeuronsByLayer(layer.id);
          const worldH = Math.max(neurons.length * NEURON_GAP + 40, LAYER_HEIGHT);
          minX = Math.min(minX, layer.position.x - LAYER_WIDTH / 2);
          maxX = Math.max(maxX, layer.position.x + LAYER_WIDTH / 2);
          minY = Math.min(minY, layer.position.y - worldH / 2);
          maxY = Math.max(maxY, layer.position.y + worldH / 2);
        });
        const pad = 40;
        const w = (maxX - minX) + pad * 2;
        const h = (maxY - minY) + pad * 2;
        tempCanvas.width = w * 2; tempCanvas.height = h * 2;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.scale(2, 2);
        tCtx.fillStyle = '#1e1e1e';
        tCtx.fillRect(0, 0, w, h);
        // Save current viewport, temporarily override for export
        const savedVp = { ...viewport };
        viewport.zoom = 1;
        viewport.x = -(minX + maxX) / 2;
        viewport.y = -(minY + maxY) / 2;
        // Use main canvas render approach on temp (simple export)
        render();
        viewport.x = savedVp.x; viewport.y = savedVp.y; viewport.zoom = savedVp.zoom;
        render();
        // Export from main canvas as fallback
        const link = document.createElement('a');
        link.download = 'vnns-network.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        break;
      }

      case 'menu-undo':
        history.undo();
        break;

      case 'menu-redo':
        history.redo();
        break;

      case 'menu-add-layer':
        btnAddLayer.click();
        break;

      case 'menu-add-neuron':
        btnAddNeuron.click();
        break;

      case 'menu-auto-connect':
        btnAutoConnect.click();
        break;

      case 'menu-auto-layout':
        autoLayout();
        break;

      case 'menu-clear-connections':
        btnClearConnections.click();
        break;

      case 'menu-clear-canvas':
        btnClearCanvas.click();
        break;

      case 'menu-zoom-in':
        document.getElementById('zoom-in').click();
        break;

      case 'menu-zoom-out':
        document.getElementById('zoom-out').click();
        break;

      case 'menu-fit-view':
        document.getElementById('zoom-fit').click();
        break;

      case 'menu-fit-content':
        document.getElementById('zoom-fit-content').click();
        break;

      case 'menu-toggle-grid':
        document.getElementById('toggle-grid').click();
        break;

      case 'menu-toggle-snap':
        document.getElementById('toggle-snap').click();
        break;

      case 'menu-toggle-minimap':
        document.getElementById('toggle-minimap').click();
        break;

      case 'menu-toggle-weights':
        document.getElementById('toggle-weights').click();
        break;

      case 'menu-toggle-activations':
        document.getElementById('toggle-activations').click();
        break;

      case 'menu-panel-create':
        switchPanel('create');
        break;

      case 'menu-panel-dataset':
        switchPanel('dataset');
        break;

      case 'menu-panel-train':
        switchPanel('train');
        break;

      case 'menu-shortcuts':
        shortcutsModal.style.display = 'flex';
        break;

      case 'menu-about':
        aboutModal.style.display = 'flex';
        break;

      // Templates
      case 'menu-tpl-simple-classifier':
        applyTemplate({
          layers: [
            { name: 'Input', neurons: 4, activation: 'linear' },
            { name: 'Hidden', neurons: 8, activation: 'relu' },
            { name: 'Output', neurons: 3, activation: 'softmax' }
          ],
          params: { optimizer: 'Adam', lr: 0.01, epochs: 2000, batch: 16, loss: 'Categorical CrossEntropy' },
          split: { train: 80, val: 10 },
          dataset: generateIrisDataset()
        });
        break;

      case 'menu-tpl-deep-network':
        applyTemplate({
          layers: [
            { name: 'Input', neurons: 4, activation: 'linear' },
            { name: 'Hidden 1', neurons: 16, activation: 'relu' },
            { name: 'Hidden 2', neurons: 16, activation: 'relu' },
            { name: 'Hidden 3', neurons: 8, activation: 'relu' },
            { name: 'Output', neurons: 3, activation: 'softmax' }
          ],
          params: { optimizer: 'Adam', lr: 0.005, epochs: 3000, batch: 16, loss: 'Categorical CrossEntropy' },
          split: { train: 70, val: 15 },
          dataset: generateIrisDataset()
        });
        break;

      case 'menu-tpl-wide-network':
        applyTemplate({
          layers: [
            { name: 'Input', neurons: 4, activation: 'linear' },
            { name: 'Hidden', neurons: 32, activation: 'relu' },
            { name: 'Output', neurons: 3, activation: 'softmax' }
          ],
          params: { optimizer: 'Adam', lr: 0.01, epochs: 2000, batch: 16, loss: 'Categorical CrossEntropy' },
          split: { train: 80, val: 10 },
          dataset: generateIrisDataset()
        });
        break;

      case 'menu-tpl-autoencoder':
        applyTemplate({
          layers: [
            { name: 'Input', neurons: 4, activation: 'linear' },
            { name: 'Encoder', neurons: 8, activation: 'relu' },
            { name: 'Latent', neurons: 3, activation: 'relu' },
            { name: 'Decoder', neurons: 8, activation: 'relu' },
            { name: 'Output', neurons: 4, activation: 'sigmoid' }
          ],
          params: { optimizer: 'Adam', lr: 0.005, epochs: 10000, batch: 16, loss: 'MSE' },
          split: { train: 80, val: 10 },
          dataset: generateAutoencoderDataset()
        });
        break;

      case 'menu-tpl-binary-classifier':
        applyTemplate({
          layers: [
            { name: 'Input', neurons: 2, activation: 'linear' },
            { name: 'Hidden', neurons: 8, activation: 'relu' },
            { name: 'Output', neurons: 1, activation: 'sigmoid' }
          ],
          params: { optimizer: 'Adam', lr: 0.01, epochs: 5000, batch: 16, loss: 'Binary CrossEntropy' },
          split: { train: 80, val: 10 },
          dataset: generateXORDataset()
        });
        break;

      case 'menu-tpl-regression':
        applyTemplate({
          layers: [
            { name: 'Input', neurons: 1, activation: 'linear' },
            { name: 'Hidden 1', neurons: 32, activation: 'relu' },
            { name: 'Hidden 2', neurons: 16, activation: 'relu' },
            { name: 'Output', neurons: 1, activation: 'linear' }
          ],
          params: { optimizer: 'Adam', lr: 0.003, epochs: 5000, batch: 16, loss: 'MSE' },
          split: { train: 80, val: 10 },
          dataset: generateRegressionDataset()
        });
        break;

      case 'menu-tpl-custom':
        openCustomTemplatePrompt();
        break;
    }
  }

  function applyTemplate(config) {
    const layerDefs = config.layers || config;
    if (network.getAllLayers().length > 0 && !confirm('This will replace the current network. Continue?')) return;

    saveState();
    // Clear current network
    network.getAllLayers().forEach(l => network.deleteLayer(l.id));
    selectedLayerIds.clear();
    selectedNeuronIds.clear();
    notes = [];

    const colors = ['#0e639c', '#2a7a3a', '#6a3d99', '#a35200', '#8b0000', '#4a4a8a', '#1a6e5a', '#b5862a'];

    // Create layers with neurons
    const createdLayers = [];
    layerDefs.forEach((def, i) => {
      const layer = network.createLayer({
        name: def.name,
        type: 'dense',
        activation: def.activation || 'relu',
        position: { x: i * 200, y: 0 },
        style: { color: colors[i % colors.length] }
      });
      for (let n = 0; n < def.neurons; n++) {
        network.createNeuron({ layerId: layer.id });
      }
      layoutLayerNeurons(layer);
      createdLayers.push(layer);
    });

    // Fully connect consecutive layers
    for (let i = 0; i < createdLayers.length - 1; i++) {
      const fromNeurons = network.getNeuronsByLayer(createdLayers[i].id);
      const toNeurons = network.getNeuronsByLayer(createdLayers[i + 1].id);
      fromNeurons.forEach(fn => {
        toNeurons.forEach(tn => {
          network.createConnection({
            fromNeuron: fn.id,
            toNeuron: tn.id,
            fromLayer: createdLayers[i].id,
            toLayer: createdLayers[i + 1].id
          });
        });
      });
    }

    autoLayout();
    viewport.x = 0; viewport.y = 0; viewport.zoom = 1;
    zoomLevelEl.textContent = '100%';
    history.clear();
    render();

    // Apply dataset if provided
    if (config.dataset) {
      const ds = config.dataset;
      dataset = { headers: ds.headers, rows: ds.rows, columns: [] };
      buildDataset();

      // Override column roles & normalization
      if (ds.roles) {
        ds.roles.forEach((role, i) => {
          if (dataset.columns[i]) dataset.columns[i].role = role;
        });
      }
      if (ds.normalizations) {
        ds.normalizations.forEach((norm, i) => {
          if (dataset.columns[i]) dataset.columns[i].normalization = norm;
        });
      }
      renderColumns();
      logOutput(`Dataset loaded — ${ds.rows.length} rows, ${ds.headers.length} columns`, 'info');
    }

    // Apply training params if provided
    if (config.params) {
      const p = config.params;
      if (p.optimizer) document.getElementById('optimizer-select').value = p.optimizer;
      if (p.lr) {
        document.getElementById('lr-slider').value = p.lr;
        document.getElementById('lr-value').textContent = p.lr.toFixed(6);
        document.getElementById('lr-input').value = p.lr.toFixed(6);
      }
      if (p.epochs) {
        document.getElementById('epochs-slider').value = p.epochs;
        document.getElementById('epochs-value').textContent = p.epochs.toLocaleString();
        document.getElementById('epochs-input').value = p.epochs;
      }
      if (p.batch) {
        document.getElementById('batch-slider').value = p.batch;
        document.getElementById('batch-value').textContent = p.batch;
        document.getElementById('batch-input').value = p.batch;
      }
      if (p.loss) document.getElementById('loss-select').value = p.loss;
    }

    // Apply split if provided
    if (config.split) {
      document.getElementById('split-train').value = config.split.train;
      document.getElementById('split-val').value = config.split.val;
      updateSplit();
    }

    const totalNeurons = createdLayers.reduce((sum, l) => sum + network.getNeuronsByLayer(l.id).length, 0);
    logOutput(`Template applied: ${layerDefs.map(d => d.neurons).join(' → ')} (${createdLayers.length} layers, ${totalNeurons} neurons)`, 'success');
    if (config.params) {
      logOutput(`Training config: ${config.params.optimizer}, LR=${config.params.lr}, Epochs=${config.params.epochs}, Batch=${config.params.batch}, Loss=${config.params.loss}`, 'info');
    }
  }

  // --- Template Dataset Generators ---

  function generateXORDataset() {
    // 4 canonical XOR patterns + 96 noisy variations = 100 samples
    const rng = (seed) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const r = rng(77);
    const canonical = [[0,0,0],[0,1,1],[1,0,1],[1,1,0]];
    const rows = canonical.map(c => c.map(String));
    for (let i = 0; i < 96; i++) {
      const base = canonical[i % 4];
      const noise = 0.15;
      rows.push([
        Math.max(0, Math.min(1, base[0] + (r() - 0.5) * noise)).toFixed(3),
        Math.max(0, Math.min(1, base[1] + (r() - 0.5) * noise)).toFixed(3),
        String(base[2])
      ]);
    }
    return {
      headers: ['x1', 'x2', 'y'],
      rows,
      roles: ['feature', 'feature', 'target'],
      normalizations: ['none', 'none', 'none']
    };
  }

  function generateIrisDataset() {
    // Iris-like dataset: 4 features, 3 one-hot target classes, 150 samples (50 per class)
    const rng = (seed) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const r = rng(42);
    const rows = [];

    // Class 0: Setosa-like (small petals)
    for (let i = 0; i < 50; i++) {
      rows.push([
        (4.6 + r() * 1.2).toFixed(1), (3.0 + r() * 0.8).toFixed(1),
        (1.0 + r() * 0.9).toFixed(1), (0.1 + r() * 0.4).toFixed(1),
        '1', '0', '0'
      ]);
    }
    // Class 1: Versicolor-like (medium petals)
    for (let i = 0; i < 50; i++) {
      rows.push([
        (4.9 + r() * 2.1).toFixed(1), (2.0 + r() * 0.8).toFixed(1),
        (3.0 + r() * 1.8).toFixed(1), (1.0 + r() * 0.6).toFixed(1),
        '0', '1', '0'
      ]);
    }
    // Class 2: Virginica-like (large petals)
    for (let i = 0; i < 50; i++) {
      rows.push([
        (5.6 + r() * 2.0).toFixed(1), (2.5 + r() * 0.9).toFixed(1),
        (4.5 + r() * 1.8).toFixed(1), (1.5 + r() * 1.0).toFixed(1),
        '0', '0', '1'
      ]);
    }

    return {
      headers: ['sepal_len', 'sepal_wid', 'petal_len', 'petal_wid', 'setosa', 'versicolor', 'virginica'],
      rows,
      roles: ['feature', 'feature', 'feature', 'feature', 'target', 'target', 'target'],
      normalizations: ['minmax', 'minmax', 'minmax', 'minmax', 'none', 'none', 'none']
    };
  }

  function generateRegressionDataset() {
    // y = sin(x) * 2 + noise, 200 samples
    const rng = (seed) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const r = rng(55);
    const rows = [];
    for (let i = 0; i < 200; i++) {
      const x = -3 + (i / 199) * 6; // -3 to 3
      const noise = (r() - 0.5) * 0.3;
      const y = Math.sin(x) * 2 + noise;
      rows.push([x.toFixed(3), y.toFixed(3)]);
    }
    return {
      headers: ['x', 'y'],
      rows,
      roles: ['feature', 'target'],
      normalizations: ['minmax', 'none']
    };
  }

  function generateAutoencoderDataset() {
    // 4-dimensional patterns to reconstruct, 200 samples from 8 clusters
    const rng = (seed) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const r = rng(99);
    const rows = [];

    const centers = [
      [0.2, 0.8, 0.1, 0.9],
      [0.8, 0.2, 0.9, 0.1],
      [0.5, 0.5, 0.5, 0.5],
      [0.1, 0.1, 0.9, 0.9],
      [0.9, 0.9, 0.1, 0.1],
      [0.3, 0.6, 0.7, 0.4],
      [0.7, 0.3, 0.3, 0.7],
      [0.1, 0.9, 0.5, 0.2]
    ];
    for (let c = 0; c < centers.length; c++) {
      for (let i = 0; i < 25; i++) {
        const vals = centers[c].map(v => Math.max(0, Math.min(1, v + (r() - 0.5) * 0.15)));
        const row = vals.map(v => v.toFixed(3));
        rows.push([...row, ...row]);
      }
    }

    return {
      headers: ['f1', 'f2', 'f3', 'f4', 't1', 't2', 't3', 't4'],
      rows,
      roles: ['feature', 'feature', 'feature', 'feature', 'target', 'target', 'target', 'target'],
      normalizations: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none']
    };
  }

  function openCustomTemplatePrompt() {
    const input = prompt(
      'Enter layer sizes separated by commas.\n' +
      'Example: 4, 16, 8, 3\n' +
      '(First = input, last = output, middle = hidden with ReLU)'
    );
    if (!input) return;

    const sizes = input.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1);
    if (sizes.length < 2) {
      alert('Need at least 2 layers (input + output).');
      return;
    }
    if (sizes.some(s => s > 256)) {
      alert('Max 256 neurons per layer.');
      return;
    }

    const layerDefs = sizes.map((n, i) => {
      let name, activation;
      if (i === 0) {
        name = 'Input';
        activation = 'linear';
      } else if (i === sizes.length - 1) {
        name = 'Output';
        activation = n > 1 ? 'softmax' : 'sigmoid';
      } else {
        name = `Hidden ${i}`;
        activation = 'relu';
      }
      return { name, neurons: n, activation };
    });

    applyTemplate({
      layers: layerDefs,
      params: { optimizer: 'Adam', lr: 0.01, epochs: 2000, batch: 16, loss: sizes[sizes.length - 1] > 1 ? 'Categorical CrossEntropy' : 'Binary CrossEntropy' },
      split: { train: 80, val: 10 }
    });
  }

  // Import JSON
  importJsonInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        // Clear current
        network.getAllLayers().forEach(l => network.deleteLayer(l.id));
        selectedLayerIds.clear();
        selectedNeuronIds.clear();

        // Rebuild
        const neuronIdMap = {};
        (data.layers || []).forEach(ld => {
          const layer = network.createLayer({
            id: ld.id, name: ld.name, type: ld.type,
            activation: ld.activation, position: ld.position, style: ld.style || {}
          });
          (ld.neurons || []).forEach(nd => {
            const neuron = network.createNeuron({ id: nd.id, layerId: layer.id, bias: nd.bias || 0 });
            neuronIdMap[nd.id] = neuron.id;
          });
          layoutLayerNeurons(layer);
        });
        (data.connections || []).forEach(cd => {
          network.createConnection({
            fromNeuron: cd.fromNeuron, toNeuron: cd.toNeuron,
            fromLayer: cd.fromLayer, toLayer: cd.toLayer, weight: cd.weight || 0
          });
        });
        render();
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    reader.readAsText(file);
    importJsonInput.value = '';
  });

  // Modal close handlers for shortcuts & about
  [shortcutsModal, aboutModal].forEach(modal => {
    modal.querySelector('.modal-close').addEventListener('click', () => modal.style.display = 'none');
    modal.querySelector('.modal-overlay').addEventListener('click', () => modal.style.display = 'none');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) { history.redo(); } else { history.undo(); }
      }
      if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); history.redo(); }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); handleMenuAction('menu-new-network'); }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); handleMenuAction('menu-export-json'); }
      if (e.key === 'o' || e.key === 'O') { e.preventDefault(); handleMenuAction('menu-import-json'); }
    }
  });

  // --- Predict Panel ---
  const predictInputsContainer = document.getElementById('predict-inputs');
  const predictOutputsContainer = document.getElementById('predict-outputs');
  const predictExpectedContainer = document.getElementById('predict-expected');
  const predictOutputSection = document.getElementById('predict-output-section');
  const predictExpectedSection = document.getElementById('predict-expected-section');
  const btnPredictRun = document.getElementById('btn-predict-run');
  const btnPredictSample = document.getElementById('btn-predict-sample');
  const predictAnimateCheckbox = document.getElementById('predict-animate');

  let predictInputFields = []; // {el, colIdx, stat}
  let predictSampleTargets = null; // Float32Array when a sample is loaded

  function buildPredictInputs() {
    predictInputFields = [];
    predictSampleTargets = null;
    predictOutputSection.style.display = 'none';
    predictExpectedSection.style.display = 'none';

    if (!trainingState.preparedData) {
      predictInputsContainer.innerHTML = '<div class="predict-empty"><span class="codicon codicon-info"></span><span>Train a model first</span></div>';
      return;
    }

    const pd = trainingState.preparedData;
    predictInputsContainer.innerHTML = '';

    pd.featureCols.forEach((colIdx, i) => {
      const col = dataset.columns[colIdx];
      const row = document.createElement('div');
      row.className = 'predict-input-row';

      const label = document.createElement('span');
      label.className = 'predict-input-label';
      label.textContent = col ? col.name : `Feature ${i}`;
      label.title = col ? col.name : `Feature ${i}`;

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'predict-input-field';
      input.step = 'any';
      input.value = '0';
      input.placeholder = '0';

      row.appendChild(label);
      row.appendChild(input);
      predictInputsContainer.appendChild(row);

      predictInputFields.push({ el: input, colIdx, stat: pd.featureStats[i] });
    });
  }

  function normalizeInputForPredict() {
    return predictInputFields.map(f => {
      let v = parseFloat(f.el.value) || 0;
      if (f.stat.norm === 'minmax') {
        const range = f.stat.max - f.stat.min;
        v = range > 0 ? (v - f.stat.min) / range : 0;
      } else if (f.stat.norm === 'standard') {
        v = (v - f.stat.mean) / f.stat.std;
      }
      return v;
    });
  }

  function displayPredictOutputs(outputs) {
    const pd = trainingState.preparedData;
    predictOutputSection.style.display = '';
    predictOutputsContainer.innerHTML = '';

    const maxVal = Math.max(...outputs.map(v => Math.abs(v)), 0.001);
    const isSoftmax = outputs.length > 1 && outputs.every(v => v >= 0 && v <= 1);
    const maxIdx = outputs.indexOf(Math.max(...outputs));

    outputs.forEach((val, i) => {
      const col = pd.targetCols[i] !== undefined ? dataset.columns[pd.targetCols[i]] : null;
      const name = col ? col.name : `Output ${i}`;

      const item = document.createElement('div');
      item.className = 'predict-output-item';

      const header = document.createElement('div');
      header.className = 'predict-output-header';

      const nameEl = document.createElement('span');
      nameEl.className = 'predict-output-name';
      nameEl.textContent = name;

      const valEl = document.createElement('span');
      valEl.className = 'predict-output-val';
      valEl.textContent = isSoftmax ? (val * 100).toFixed(2) + '%' : val.toFixed(6);

      header.appendChild(nameEl);
      header.appendChild(valEl);

      const barBg = document.createElement('div');
      barBg.className = 'predict-output-bar-bg';
      const bar = document.createElement('div');
      bar.className = 'predict-output-bar';
      if (i === maxIdx) bar.classList.add('highlight');
      const pct = isSoftmax ? (val * 100) : (Math.abs(val) / maxVal * 100);
      bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
      barBg.appendChild(bar);

      item.appendChild(header);
      item.appendChild(barBg);
      predictOutputsContainer.appendChild(item);
    });

    // Show expected if we have sample targets
    if (predictSampleTargets && predictSampleTargets.length > 0) {
      predictExpectedSection.style.display = '';
      predictExpectedContainer.innerHTML = '';

      const expectedMax = Math.max(...Array.from(predictSampleTargets).map(v => Math.abs(v)), 0.001);
      const expMaxIdx = Array.from(predictSampleTargets).indexOf(Math.max(...predictSampleTargets));

      predictSampleTargets.forEach((val, i) => {
        const col = pd.targetCols[i] !== undefined ? dataset.columns[pd.targetCols[i]] : null;
        const name = col ? col.name : `Output ${i}`;

        const item = document.createElement('div');
        item.className = 'predict-output-item';

        const header = document.createElement('div');
        header.className = 'predict-output-header';

        const nameEl = document.createElement('span');
        nameEl.className = 'predict-output-name';
        nameEl.textContent = name;

        const valEl = document.createElement('span');
        valEl.className = 'predict-output-val';
        valEl.textContent = isSoftmax ? (val * 100).toFixed(2) + '%' : val.toFixed(6);

        header.appendChild(nameEl);
        header.appendChild(valEl);

        const barBg = document.createElement('div');
        barBg.className = 'predict-output-bar-bg';
        const bar = document.createElement('div');
        bar.className = 'predict-output-bar';
        if (i === expMaxIdx) bar.classList.add('highlight');
        const pct = isSoftmax ? (val * 100) : (Math.abs(val) / expectedMax * 100);
        bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
        barBg.appendChild(bar);

        item.appendChild(header);
        item.appendChild(barBg);
        predictExpectedContainer.appendChild(item);
      });

      // Match badge
      if (isSoftmax && outputs.length > 1) {
        const predClass = outputs.indexOf(Math.max(...outputs));
        const expClass = Array.from(predictSampleTargets).indexOf(Math.max(...predictSampleTargets));
        const badge = document.createElement('div');
        badge.className = 'predict-match-badge ' + (predClass === expClass ? 'correct' : 'wrong');
        badge.innerHTML = predClass === expClass
          ? '<span class="codicon codicon-pass"></span> Correct'
          : '<span class="codicon codicon-error"></span> Mismatch';
        predictExpectedContainer.appendChild(badge);
      }
    } else {
      predictExpectedSection.style.display = 'none';
    }
  }

  // --- Forward Pass Animation ---
  let fwdAnimState = null; // { particles: [...], layerIdx, done, animId }

  function startForwardPassAnimation(inputValues, onComplete) {
    stopForwardPassAnimation();

    const sortedLayers = network.getAllLayers().sort((a, b) => a.position.x - b.position.x);
    if (sortedLayers.length < 2) { if (onComplete) onComplete(); return; }

    // Ensure activations are on for visual effect
    const wasShowingActivations = viewport.showActivations;
    viewport.showActivations = true;
    neuronActivations.clear();

    // Set input layer
    const inputNeurons = network.getNeuronsByLayer(sortedLayers[0].id);
    inputNeurons.forEach((n, i) => {
      neuronActivations.set(n.id, inputValues && i < inputValues.length ? inputValues[i] : 0);
    });

    fwdAnimState = {
      sortedLayers,
      layerIdx: 0, // currently animating FROM this layer TO layerIdx+1
      particles: [],
      progress: 0,
      wasShowingActivations,
      onComplete
    };

    spawnParticlesForLayer(0);
    fwdAnimState.animId = requestAnimationFrame(tickForwardAnimation);
  }

  function spawnParticlesForLayer(fromLayerIdx) {
    if (!fwdAnimState) return;
    const sortedLayers = fwdAnimState.sortedLayers;
    if (fromLayerIdx >= sortedLayers.length - 1) return;

    const fromLayer = sortedLayers[fromLayerIdx];
    const toLayer = sortedLayers[fromLayerIdx + 1];
    const fromNeurons = network.getNeuronsByLayer(fromLayer.id);
    const toNeurons = network.getNeuronsByLayer(toLayer.id);

    fwdAnimState.particles = [];
    fwdAnimState.progress = 0;

    fromNeurons.forEach(fn => {
      toNeurons.forEach(tn => {
        const conn = network.getAllConnections().find(
          c => c.fromNeuron === fn.id && c.toNeuron === tn.id
        );
        if (conn) {
          const act = neuronActivations.get(fn.id) || 0;
          fwdAnimState.particles.push({
            fromNeuron: fn,
            toNeuron: tn,
            weight: conn.weight || 0,
            fromAct: act
          });
        }
      });
    });
  }

  function tickForwardAnimation(ts) {
    if (!fwdAnimState) return;

    fwdAnimState.progress += 0.025;

    if (fwdAnimState.progress >= 1) {
      // Compute activations for the target layer
      const layerIdx = fwdAnimState.layerIdx + 1;
      const layer = fwdAnimState.sortedLayers[layerIdx];
      const toNeurons = network.getNeuronsByLayer(layer.id);
      const activation = layer.activation || 'relu';
      const rawValues = [];

      toNeurons.forEach(toN => {
        let sum = toN.bias || 0;
        const conns = network.getAllConnections().filter(c => c.toNeuron === toN.id);
        conns.forEach(c => {
          const fromAct = neuronActivations.get(c.fromNeuron) || 0;
          sum += fromAct * (c.weight || 0);
        });
        rawValues.push({ neuron: toN, sum });
      });

      if (activation.toLowerCase() === 'softmax') {
        const maxVal = Math.max(...rawValues.map(r => r.sum));
        const exps = rawValues.map(r => Math.exp(r.sum - maxVal));
        const sumExp = exps.reduce((a, b) => a + b, 0);
        rawValues.forEach((r, i) => {
          neuronActivations.set(r.neuron.id, exps[i] / sumExp);
        });
      } else {
        rawValues.forEach(r => {
          neuronActivations.set(r.neuron.id, applyActivationFn(r.sum, activation));
        });
      }

      fwdAnimState.layerIdx++;

      if (fwdAnimState.layerIdx >= fwdAnimState.sortedLayers.length - 1) {
        // Animation done
        fwdAnimState.particles = [];
        render();
        const cb = fwdAnimState.onComplete;
        const wasShowing = fwdAnimState.wasShowingActivations;
        fwdAnimState = null;
        if (!wasShowing) {
          // Keep activations visible briefly, then restore
          setTimeout(() => { viewport.showActivations = wasShowing; render(); }, 2000);
        }
        if (cb) cb();
        return;
      }

      // Next layer pair
      spawnParticlesForLayer(fwdAnimState.layerIdx);
    }

    render();
    drawForwardPassParticles();
    fwdAnimState.animId = requestAnimationFrame(tickForwardAnimation);
  }

  function drawForwardPassParticles() {
    if (!fwdAnimState || fwdAnimState.particles.length === 0) return;

    const t = fwdAnimState.progress;
    const r = 4 * viewport.zoom;

    fwdAnimState.particles.forEach(p => {
      const p1 = getNeuronScreenPos(p.fromNeuron);
      const p2 = getNeuronScreenPos(p.toNeuron);

      const x = p1.x + (p2.x - p1.x) * t;
      const y = p1.y + (p2.y - p1.y) * t;

      const intensity = Math.abs(p.fromAct);
      const alpha = 0.3 + Math.min(intensity, 1) * 0.7;

      // Color based on weight sign
      if (p.weight >= 0) {
        ctx.fillStyle = `rgba(79, 193, 255, ${alpha})`;
      } else {
        ctx.fillStyle = `rgba(255, 100, 100, ${alpha})`;
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      // Glow
      ctx.beginPath();
      ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
      const grd = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.5);
      if (p.weight >= 0) {
        grd.addColorStop(0, `rgba(79, 193, 255, ${alpha * 0.4})`);
      } else {
        grd.addColorStop(0, `rgba(255, 100, 100, ${alpha * 0.4})`);
      }
      grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grd;
      ctx.fill();
    });
  }

  function stopForwardPassAnimation() {
    if (fwdAnimState) {
      if (fwdAnimState.animId) cancelAnimationFrame(fwdAnimState.animId);
      viewport.showActivations = fwdAnimState.wasShowingActivations;
      fwdAnimState = null;
    }
  }

  // Wire predict buttons
  btnPredictRun.addEventListener('click', () => {
    if (!wasmBridge.ready || wasmBridge.netId < 0) {
      logOutput('No trained network available. Train a model first.', 'warn');
      return;
    }
    if (predictInputFields.length === 0) {
      logOutput('No input fields. Switch to Predict panel after training.', 'warn');
      return;
    }

    const normalized = normalizeInputForPredict();
    const animate = predictAnimateCheckbox.checked;

    if (animate) {
      // Sync weights first for JS forward pass
      syncWeightsFromBackend();
      btnPredictRun.disabled = true;
      startForwardPassAnimation(normalized, () => {
        // Run actual WASM predict for accurate output
        const result = wasmBridge.predict(normalized);
        if (result) {
          displayPredictOutputs(Array.from(result));
          logOutput(`Prediction: [${Array.from(result).map(v => v.toFixed(4)).join(', ')}]`, 'info');
        }
        btnPredictRun.disabled = false;
      });
    } else {
      const result = wasmBridge.predict(normalized);
      if (result) {
        // Also compute activations for visual feedback
        syncWeightsFromBackend();
        computeActivations(normalized);
        viewport.showActivations = true;
        render();
        displayPredictOutputs(Array.from(result));
        logOutput(`Prediction: [${Array.from(result).map(v => v.toFixed(4)).join(', ')}]`, 'info');
      } else {
        logOutput('Prediction failed.', 'error');
      }
    }
  });

  btnPredictSample.addEventListener('click', () => {
    if (!trainingState.preparedData) {
      logOutput('No dataset prepared. Train a model first.', 'warn');
      return;
    }

    const pd = trainingState.preparedData;
    // Pick random row from original dataset (raw values)
    const rowIdx = Math.floor(Math.random() * dataset.rows.length);
    const row = dataset.rows[rowIdx];

    // Fill input fields with raw (un-normalized) values
    predictInputFields.forEach(f => {
      f.el.value = parseFloat(row[f.colIdx]) || 0;
    });

    // Store expected targets for comparison
    predictSampleTargets = new Float32Array(pd.targetCols.length);
    pd.targetCols.forEach((colIdx, i) => {
      predictSampleTargets[i] = parseFloat(row[colIdx]) || 0;
    });

    logOutput(`Loaded sample #${rowIdx + 1} from dataset`, 'info');
  });

  // Also rebuild predict inputs when clicking the predict icon directly (inline handler)
  document.querySelector('.activity-icon[data-view="predict"]').addEventListener('click', () => {
    buildPredictInputs();
  });

  resizeCanvas();
});