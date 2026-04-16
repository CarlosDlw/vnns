/**
 * VNNS Shared State
 * Global namespace for shared state across all modules.
 */
window.VNNS = window.VNNS || {};

(function(V) {
  // --- Canvas & Rendering ---
  V.canvas = null;
  V.ctx = null;
  V.initialized = false;

  V.viewport = {
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

  // --- Network ---
  V.network = null; // Set during init (NetworkManager instance)

  // --- Selection ---
  V.selectedLayerIds = new Set();
  V.selectedNeuronIds = new Set();

  // --- Interaction ---
  V.isPanning = false;
  V.panStart = { x: 0, y: 0 };
  V.isDragging = false;
  V.dragTarget = null;
  V.dragOffset = { x: 0, y: 0 };
  V.dragMoved = false;
  V.isConnecting = false;
  V.connectFrom = null;
  V.mouseWorldPos = { x: 0, y: 0 };
  V.dropTargetLayerId = null;
  V.hoverLayerId = null;
  V.hoverNeuronId = null;
  V.hoverConnection = null;
  V.tooltipMouseX = 0;
  V.tooltipMouseY = 0;
  V.notes = [];

  // --- Dataset ---
  V.dataset = { headers: [], rows: [], columns: [] };

  // --- Training ---
  V.wasmBridge = null; // Set during init
  V.trainingWorker = null; // Set during init
  V.workerReady = false;
  V.trainingTimerInterval = null;
  V.trainingState = {
    running: false,
    paused: false,
    epoch: 0,
    maxEpochs: 1000,
    preparedData: null,
    startTime: 0,
    lastWeightsJSON: null
  };

  // --- Charts ---
  V.lossChart = null;
  V.accuracyChart = null;
  V._chartUpdatePending = false;

  // --- Visualization ---
  V.neuronActivations = new Map();

  // --- Properties Panel ---
  V._lastPropsKey = '';

  // --- Context Toolbar ---
  V.ctxTarget = null;

  // --- Undo / Redo ---
  V.history = null; // Set during init

  // --- Constants ---
  V.LAYER_COLORS = ['#0e639c', '#6a3d99', '#2a7a3a', '#a35200', '#8b0000', '#4a4a8a', '#5c3a6e', '#1a6e5a'];
  V.NEURON_RADIUS = 14;
  V.NEURON_GAP = 36;
  V.LAYER_WIDTH = 60;
  V.LAYER_HEIGHT = 120;
  V.ACTIVATIONS = [
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
  V.LAYER_TYPES = [
    { value: 'dense', label: 'Dense (Fully Connected)' },
    { value: 'input', label: 'Input' },
    { value: 'output', label: 'Output' },
  ];
  V.WEIGHT_INITS = [
    { value: 'random', label: 'Random' },
    { value: 'xavier', label: 'Xavier / Glorot' },
    { value: 'he', label: 'He' },
    { value: 'zeros', label: 'Zeros' },
  ];

  // --- Utilities ---
  V.isLightTheme = function() { return document.body.dataset.theme === 'light'; };

  V.logOutput = function(msg, level) {
    level = level || 'info';
    const outputLog = document.getElementById('output-log');
    if (!outputLog) return;
    const line = document.createElement('div');
    line.className = 'log-line log-' + level;
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.innerHTML = '<span class="log-time">[' + time + ']</span>' + msg;
    outputLog.appendChild(line);
    outputLog.scrollTop = outputLog.scrollHeight;
  };

  V.formatTime = function(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
  };

  V.escapeHtml = function(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  V.saveState = function() {
    if (V.history) V.history.snapshot();
  };

  V.snapToGridPos = function(x, y) {
    var g = V.viewport.gridSize;
    return { x: Math.round(x / g) * g, y: Math.round(y / g) * g };
  };

  V.layoutLayerNeurons = function(layer) {
    var neurons = V.network.getNeuronsByLayer(layer.id);
    var count = neurons.length;
    if (count === 0) return;
    var totalHeight = (count - 1) * V.NEURON_GAP;
    var startY = layer.position.y - totalHeight / 2;
    neurons.forEach(function(neuron, i) {
      neuron.position = { x: layer.position.x, y: startY + i * V.NEURON_GAP };
    });
  };

  V.screenToWorld = function(sx, sy) {
    var rect = V.canvas.getBoundingClientRect();
    var cx = rect.width / 2;
    var cy = rect.height / 2;
    return {
      x: (sx - cx - V.viewport.x) / V.viewport.zoom,
      y: (sy - cy - V.viewport.y) / V.viewport.zoom
    };
  };

  V.worldToScreen = function(wx, wy) {
    var rect = V.canvas.getBoundingClientRect();
    var cx = rect.width / 2;
    var cy = rect.height / 2;
    return {
      x: wx * V.viewport.zoom + V.viewport.x + cx,
      y: wy * V.viewport.zoom + V.viewport.y + cy
    };
  };

  V.getLayerScreenRect = function(layer) {
    var pos = V.worldToScreen(layer.position.x, layer.position.y);
    var neurons = V.network.getNeuronsByLayer(layer.id);
    var worldH = Math.max(neurons.length * V.NEURON_GAP + 40, V.LAYER_HEIGHT);
    var worldW = V.LAYER_WIDTH;
    var w = worldW * V.viewport.zoom;
    var h = worldH * V.viewport.zoom;
    return { x: pos.x - w / 2, y: pos.y - h / 2, w: w, h: h, cx: pos.x, cy: pos.y };
  };

  V.getNeuronScreenPos = function(neuron) {
    return V.worldToScreen(neuron.position.x, neuron.position.y);
  };

  V.render = function() {
    // Overridden in canvas-renderer.js
  };

  V.invalidateBackendNetwork = function() {
    // Overridden in training-controller.js
  };

  V.updateMetrics = function(epoch, loss, accuracy) {
    document.getElementById('metric-epoch').textContent = epoch;
    document.getElementById('metric-loss').textContent = loss.toFixed(6);
    document.getElementById('metric-accuracy').textContent = (accuracy * 100).toFixed(2) + '%';

    V.lossChart.data.labels.push(epoch);
    V.lossChart.data.datasets[0].data.push(loss);
    V.accuracyChart.data.labels.push(epoch);
    V.accuracyChart.data.datasets[0].data.push(accuracy);

    if (!V._chartUpdatePending) {
      V._chartUpdatePending = true;
      requestAnimationFrame(function() {
        V.lossChart.update('none');
        V.accuracyChart.update('none');
        V._chartUpdatePending = false;
      });
    }
  };

  V.makeSelectHtml = function(id, options, selected) {
    var html = '<select class="props-select" data-prop="' + id + '">';
    options.forEach(function(o) {
      html += '<option value="' + o.value + '"' + (o.value === selected ? ' selected' : '') + '>' + o.label + '</option>';
    });
    html += '</select>';
    return html;
  };

  V.switchPanel = function(viewName) {
    // Overridden in ui-panels.js
  };

})(window.VNNS);
