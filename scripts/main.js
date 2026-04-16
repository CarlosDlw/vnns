/**
 * VNNS Main Orchestrator
 * Initializes canvas, network, charts, history.
 * Wires all UI events and bootstraps modules.
 */
document.addEventListener('DOMContentLoaded', function() {
  var V = window.VNNS;

  // --- Canvas & Network ---
  V.canvas = document.getElementById('network-canvas');
  V.ctx = V.canvas.getContext('2d');
  V.network = new NetworkManager();
  V.network._onChange = function() { V.invalidateBackendNetwork(); };

  var zoomLevelEl = document.getElementById('zoom-level');

  // --- Theme ---
  var themeStorageKey = 'vnns-theme';

  function applyTheme(theme) {
    var nextTheme = theme === 'light' ? 'light' : 'dark';
    document.body.dataset.theme = nextTheme;
    localStorage.setItem(themeStorageKey, nextTheme);
    if (V.initialized) V.render();
  }

  function toggleTheme() {
    applyTheme(document.body.dataset.theme === 'light' ? 'dark' : 'light');
  }

  V.toggleTheme = toggleTheme;
  applyTheme(localStorage.getItem(themeStorageKey) || 'dark');

  // --- Resize Handle ---
  var handle = document.getElementById('resize-handle');
  var panelTop = document.getElementById('panel-top');
  var panelBottom = document.getElementById('panel-bottom');
  var rightPanel = document.querySelector('.right-panel');
  var isResizing = false;

  handle.addEventListener('mousedown', function(e) {
    isResizing = true;
    handle.classList.add('active');
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isResizing) return;
    var panelRect = rightPanel.getBoundingClientRect();
    var offset = e.clientY - panelRect.top;
    var totalHeight = panelRect.height - 4;
    var clampedOffset = Math.max(50, Math.min(offset, totalHeight - 50));
    panelTop.style.flex = 'none';
    panelBottom.style.flex = 'none';
    panelTop.style.height = clampedOffset + 'px';
    panelBottom.style.height = (totalHeight - clampedOffset) + 'px';
  });

  document.addEventListener('mouseup', function() {
    if (isResizing) {
      isResizing = false;
      handle.classList.remove('active');
      document.body.style.cursor = '';
    }
  });

  // --- Menubar Dropdowns ---
  var menuItems = document.querySelectorAll('.menubar .menu-item');
  var activeMenu = null;

  function closeAllMenus() {
    menuItems.forEach(function(m) { m.classList.remove('active'); });
    activeMenu = null;
  }

  menuItems.forEach(function(item) {
    item.addEventListener('click', function(e) {
      e.stopPropagation();
      if (item.classList.contains('active')) {
        closeAllMenus();
      } else {
        closeAllMenus();
        item.classList.add('active');
        activeMenu = item;
      }
    });

    item.addEventListener('mouseenter', function() {
      if (activeMenu && activeMenu !== item) {
        closeAllMenus();
        item.classList.add('active');
        activeMenu = item;
      }
    });
  });

  document.addEventListener('click', function(e) {
    if (activeMenu && !e.target.closest('.menubar')) {
      closeAllMenus();
    }
  });

  // --- Sidebar & switchPanel ---
  var leftActivityIcons = document.querySelectorAll('.activitybar .activity-icon');
  var sidebarViews = document.querySelectorAll('.sidebar-view');

  leftActivityIcons.forEach(function(icon) {
    icon.addEventListener('click', function() {
      var viewId = icon.dataset.view;
      leftActivityIcons.forEach(function(i) { i.classList.remove('active'); });
      icon.classList.add('active');
      sidebarViews.forEach(function(view) {
        view.classList.remove('active');
        if (view.id === 'view-' + viewId) view.classList.add('active');
      });
    });
  });

  V.switchPanel = function(viewName) {
    leftActivityIcons.forEach(function(i) {
      i.classList.remove('active');
      if (i.dataset.view === viewName) i.classList.add('active');
    });
    sidebarViews.forEach(function(view) {
      view.classList.remove('active');
      if (view.id === 'view-' + viewName) view.classList.add('active');
    });
    if (viewName === 'predict' && V.buildPredictInputs) {
      V.buildPredictInputs();
    }
  };

  // --- Slider Params ---
  var lrSlider = document.getElementById('lr-slider');
  var lrValue = document.getElementById('lr-value');
  var epochsSlider = document.getElementById('epochs-slider');
  var epochsValue = document.getElementById('epochs-value');
  var batchSlider = document.getElementById('batch-slider');
  var batchValue = document.getElementById('batch-value');

  if (lrSlider && lrValue) {
    lrSlider.addEventListener('input', function() {
      lrValue.textContent = parseFloat(lrSlider.value).toFixed(6);
    });
  }
  if (epochsSlider && epochsValue) {
    epochsSlider.addEventListener('input', function() {
      epochsValue.textContent = parseInt(epochsSlider.value).toLocaleString();
    });
  }
  if (batchSlider && batchValue) {
    batchSlider.addEventListener('input', function() {
      batchValue.textContent = parseInt(batchSlider.value).toString();
    });
  }

  var paramConfigs = [
    { valueEl: document.getElementById('lr-value'), inputEl: document.getElementById('lr-input'), sliderEl: lrSlider, decimals: 6 },
    { valueEl: document.getElementById('epochs-value'), inputEl: document.getElementById('epochs-input'), sliderEl: epochsSlider, decimals: 0 },
    { valueEl: document.getElementById('batch-value'), inputEl: document.getElementById('batch-input'), sliderEl: batchSlider, decimals: 0 },
  ];

  paramConfigs.forEach(function(config) {
    var valueEl = config.valueEl, inputEl = config.inputEl, sliderEl = config.sliderEl, decimals = config.decimals;

    valueEl.addEventListener('click', function() {
      valueEl.classList.add('hidden');
      inputEl.classList.add('visible');
      inputEl.focus();
      inputEl.select();
    });

    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') inputEl.blur();
      if (e.key === 'Escape') { inputEl.value = valueEl.textContent.replace(/,/g, ''); inputEl.blur(); }
    });

    inputEl.addEventListener('input', function() {
      var raw = inputEl.value.replace(/[^0-9.\-]/g, '');
      var parts = raw.split('.');
      if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
      if (raw !== inputEl.value) inputEl.value = raw;
    });

    inputEl.addEventListener('blur', function() {
      var min = parseFloat(inputEl.dataset.min);
      var max = parseFloat(inputEl.dataset.max);
      var val = parseFloat(inputEl.value);
      if (isNaN(val)) val = parseFloat(sliderEl.value);
      val = Math.max(min, Math.min(max, val));
      if (sliderEl) { sliderEl.value = val; sliderEl.dispatchEvent(new Event('input')); }
      var displayValue = decimals === 0 ? parseInt(val).toLocaleString() : parseFloat(val).toFixed(decimals);
      valueEl.textContent = displayValue;
      valueEl.classList.remove('hidden');
      inputEl.classList.remove('visible');
    });
  });

  // --- Chart.js ---
  var chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#969696', font: { size: 9 }, maxTicksLimit: 5 } },
      y: { display: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#969696', font: { size: 9 } } }
    },
    animation: false
  };

  V.lossChart = new Chart(document.getElementById('loss-chart').getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: '#f48771', backgroundColor: 'rgba(244, 135, 113, 0.1)', borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.3 }] },
    options: chartDefaults
  });

  V.accuracyChart = new Chart(document.getElementById('accuracy-chart').getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: '#89d185', backgroundColor: 'rgba(137, 209, 133, 0.1)', borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.3 }] },
    options: chartDefaults
  });

  // Global updateMetrics (also called by Worker messages via window.updateMetrics)
  window.updateMetrics = V.updateMetrics;

  // --- Output Log Clear ---
  document.getElementById('output-clear').addEventListener('click', function() {
    document.getElementById('output-log').innerHTML = '';
  });

  // --- History (Undo/Redo) ---
  V.history = {
    undoStack: [],
    redoStack: [],
    maxSize: 50,
    _snapshotting: false,

    snapshot: function() {
      if (this._snapshotting) return;
      var state = JSON.stringify(V.network.toJSON());
      if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === state) return;
      this.undoStack.push(state);
      if (this.undoStack.length > this.maxSize) this.undoStack.shift();
      this.redoStack = [];
    },

    undo: function() {
      if (this.undoStack.length === 0) return;
      this._snapshotting = true;
      var currentState = JSON.stringify(V.network.toJSON());
      this.redoStack.push(currentState);
      var prev = this.undoStack.pop();
      V.network.fromJSON(JSON.parse(prev));
      V.network.getAllLayers().forEach(function(l) { V.layoutLayerNeurons(l); });
      V.selectedLayerIds.clear();
      V.selectedNeuronIds.clear();
      if (V.hideContextToolbar) V.hideContextToolbar();
      V.render();
      this._snapshotting = false;
    },

    redo: function() {
      if (this.redoStack.length === 0) return;
      this._snapshotting = true;
      var currentState = JSON.stringify(V.network.toJSON());
      this.undoStack.push(currentState);
      var next = this.redoStack.pop();
      V.network.fromJSON(JSON.parse(next));
      V.network.getAllLayers().forEach(function(l) { V.layoutLayerNeurons(l); });
      V.selectedLayerIds.clear();
      V.selectedNeuronIds.clear();
      if (V.hideContextToolbar) V.hideContextToolbar();
      V.render();
      this._snapshotting = false;
    },

    clear: function() {
      this.undoStack = [];
      this.redoStack = [];
    }
  };

  // --- Auto Layout ---
  V.autoLayout = function() {
    var layers = V.network.getAllLayers();
    if (layers.length === 0) return;
    V.saveState();
    var gap = 200;
    var totalWidth = (layers.length - 1) * gap;
    var startX = -totalWidth / 2;

    layers.forEach(function(layer, i) {
      var x = startX + i * gap;
      var y = 0;
      if (V.viewport.snapToGrid) {
        var snapped = V.snapToGridPos(x, y);
        x = snapped.x;
        y = snapped.y;
      }
      layer.position.x = x;
      layer.position.y = y;
      V.layoutLayerNeurons(layer);
    });
    V.render();
  };

  // --- Resize Canvas ---
  function resizeCanvas() {
    var rect = V.canvas.parentElement.getBoundingClientRect();
    V.canvas.width = rect.width * window.devicePixelRatio;
    V.canvas.height = rect.height * window.devicePixelRatio;
    V.canvas.style.width = rect.width + 'px';
    V.canvas.style.height = rect.height + 'px';
    V.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    V.render();
  }

  window.addEventListener('resize', resizeCanvas);

  // --- Canvas Mouse Events ---
  var tooltipEl = document.getElementById('canvas-tooltip');

  V.canvas.addEventListener('mouseleave', function() {
    V.hoverNeuronId = null;
    V.hoverLayerId = null;
    V.hoverConnection = null;
    tooltipEl.style.display = 'none';
  });

  V.canvas.addEventListener('mousedown', function(e) {
    tooltipEl.style.display = 'none';
    var rect = V.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      V.isPanning = true;
      V.panStart = { x: e.clientX - V.viewport.x, y: e.clientY - V.viewport.y };
      V.canvas.classList.add('panning');
      e.preventDefault();
      return;
    }

    if (e.button === 0) {
      var neuron = V.hitTestNeuron(mx, my);

      if (V.isConnecting && V.connectFrom) {
        if (neuron && neuron.id !== V.connectFrom) {
          var fromNeuron = V.network.getNeuron(V.connectFrom);
          if (fromNeuron.layerId !== neuron.layerId) {
            V.saveState();
            V.network.createConnection({ fromNeuron: V.connectFrom, toNeuron: neuron.id, fromLayer: fromNeuron.layerId, toLayer: neuron.layerId });
          }
        }
        V.isConnecting = false;
        V.connectFrom = null;
        V.render();
        return;
      }

      if (e.shiftKey) {
        if (neuron) { V.selectedNeuronIds.add(neuron.id); V.selectedLayerIds.clear(); V.render(); return; }
        var layer = V.hitTestLayer(mx, my);
        if (layer) { V.selectedLayerIds.add(layer.id); V.selectedNeuronIds.clear(); V.render(); return; }
        V.selectedLayerIds.clear(); V.selectedNeuronIds.clear(); V.render(); return;
      }

      if (neuron) {
        V.selectedNeuronIds.clear(); V.selectedLayerIds.clear();
        V.selectedNeuronIds.add(neuron.id);
        V.isDragging = true; V.dragMoved = false;
        V.dragTarget = { type: 'neuron', id: neuron.id, originalLayerId: neuron.layerId };
        V.dragOffset = { x: neuron.position.x - V.screenToWorld(mx, my).x, y: neuron.position.y - V.screenToWorld(mx, my).y };
        V.render(); return;
      }

      var layer = V.hitTestLayer(mx, my);
      if (layer) {
        V.selectedNeuronIds.clear(); V.selectedLayerIds.clear();
        V.selectedLayerIds.add(layer.id);
        V.isDragging = true; V.dragMoved = false;
        V.dragTarget = { type: 'layer', id: layer.id };
        V.dragOffset = { x: layer.position.x - V.screenToWorld(mx, my).x, y: layer.position.y - V.screenToWorld(mx, my).y };
        V.render(); return;
      }

      V.selectedNeuronIds.clear(); V.selectedLayerIds.clear();
      if (V.hideContextToolbar) V.hideContextToolbar();
      V.isPanning = true;
      V.panStart = { x: e.clientX - V.viewport.x, y: e.clientY - V.viewport.y };
      V.canvas.classList.add('panning');
      V.render();
    }
  });

  V.canvas.addEventListener('mousemove', function(e) {
    var rect = V.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    V.mouseWorldPos = V.screenToWorld(mx, my);

    V.hoverNeuronId = null; V.hoverLayerId = null; V.hoverConnection = null;
    V.tooltipMouseX = e.clientX; V.tooltipMouseY = e.clientY;
    var neuron = V.hitTestNeuron(mx, my);
    if (neuron) { V.hoverNeuronId = neuron.id; }
    else { var layer = V.hitTestLayer(mx, my); if (layer) { V.hoverLayerId = layer.id; } else { V.hoverConnection = V.hitTestConnection(mx, my, 6); } }
    V.updateTooltip();

    if (V.isConnecting) { V.render(); return; }

    if (V.isDragging && V.dragTarget) {
      V.dragMoved = true;
      var world = V.screenToWorld(mx, my);

      if (V.dragTarget.type === 'neuron') {
        V.dropTargetLayerId = null;
        var hoveredNeuron = V.hitTestNeuron(mx, my, V.dragTarget.id);
        if (!hoveredNeuron) {
          var hoveredLayer = V.hitTestLayer(mx, my);
          if (hoveredLayer && hoveredLayer.id !== V.dragTarget.originalLayerId) V.dropTargetLayerId = hoveredLayer.id;
        }
        var n = V.network.getNeuron(V.dragTarget.id);
        if (n) { n.position.x = world.x + V.dragOffset.x; n.position.y = world.y + V.dragOffset.y; }
      } else if (V.dragTarget.type === 'layer') {
        var layer = V.network.getLayer(V.dragTarget.id);
        if (layer) { layer.position.x = world.x + V.dragOffset.x; layer.position.y = world.y + V.dragOffset.y; V.layoutLayerNeurons(layer); }
      }
      V.render(); return;
    }

    if (V.isPanning) {
      V.viewport.x = e.clientX - V.panStart.x;
      V.viewport.y = e.clientY - V.panStart.y;
      V.render();
    }
  });

  window.addEventListener('mouseup', function() {
    if (V.isDragging && V.dragTarget && V.dragTarget.type === 'neuron' && V.dropTargetLayerId) {
      var neuron = V.network.getNeuron(V.dragTarget.id);
      if (neuron && neuron.layerId !== V.dropTargetLayerId) {
        V.saveState();
        V.network.updateNeuron(V.dragTarget.id, { layerId: V.dropTargetLayerId });
        var conns = V.network.getConnectionsByNeuron(V.dragTarget.id);
        conns.forEach(function(conn) {
          var from = V.network.getNeuron(conn.fromNeuron);
          var to = V.network.getNeuron(conn.toNeuron);
          if (from && to && from.layerId === to.layerId) V.network.deleteConnection(conn.id);
        });
        var oldLayer = V.network.getLayer(V.dragTarget.originalLayerId);
        var newLayer = V.network.getLayer(V.dropTargetLayerId);
        if (oldLayer) V.layoutLayerNeurons(oldLayer);
        if (newLayer) V.layoutLayerNeurons(newLayer);
      }
      V.dropTargetLayerId = null;
      V.render();
    } else if (V.isDragging && V.dragTarget && V.dragTarget.type === 'neuron') {
      var oldLayer = V.network.getLayer(V.dragTarget.originalLayerId);
      if (oldLayer) V.layoutLayerNeurons(oldLayer);
      V.render();
    }

    if (V.isDragging && V.dragTarget && V.dragTarget.type === 'layer') {
      var layer = V.network.getLayer(V.dragTarget.id);
      if (layer) {
        if (V.viewport.snapToGrid) {
          var snapped = V.snapToGridPos(layer.position.x, layer.position.y);
          layer.position.x = snapped.x; layer.position.y = snapped.y;
        }
        V.layoutLayerNeurons(layer);
        V.render();
      }
    }

    if (V.isDragging) {
      if (!V.dragMoved && V.dragTarget) V.showContextToolbar(V.dragTarget);
      if (V.dragMoved) V.resetPropsKey();
      V.isDragging = false; V.dragTarget = null; V.dragMoved = false;
    }
    if (V.isPanning) {
      V.isPanning = false;
      V.canvas.classList.remove('panning');
    }
  });

  V.canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    var rect = V.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var worldBefore = V.screenToWorld(mx, my);
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    V.viewport.zoom = Math.max(V.viewport.minZoom, Math.min(V.viewport.maxZoom, V.viewport.zoom * delta));
    var screenAfter = V.worldToScreen(worldBefore.x, worldBefore.y);
    V.viewport.x -= (screenAfter.x - mx);
    V.viewport.y -= (screenAfter.y - my);
    zoomLevelEl.textContent = Math.round(V.viewport.zoom * 100) + '%';
    V.render();
  }, { passive: false });

  // --- Minimap Click/Drag ---
  var minimapContainer = document.getElementById('minimap-container');
  var minimapCanvas = document.getElementById('minimap-canvas');
  var minimapDragging = false;

  function minimapNavigate(e) {
    var t = minimapCanvas._transform;
    if (!t) return;
    var rect = minimapContainer.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var worldX = (mx - t.offX) / t.scale + t.bounds.minX;
    var worldY = (my - t.offY) / t.scale + t.bounds.minY;
    var canvasRect = V.canvas.getBoundingClientRect();
    V.viewport.x = canvasRect.width / 2 - worldX * V.viewport.zoom;
    V.viewport.y = canvasRect.height / 2 - worldY * V.viewport.zoom;
    V.render();
  }

  minimapContainer.addEventListener('mousedown', function(e) {
    e.preventDefault(); e.stopPropagation();
    minimapDragging = true;
    minimapNavigate(e);
  });

  window.addEventListener('mousemove', function(e) {
    if (minimapDragging) minimapNavigate(e);
  });

  window.addEventListener('mouseup', function() { minimapDragging = false; }, true);

  // --- Zoom Buttons ---
  document.getElementById('zoom-in').addEventListener('click', function() {
    V.viewport.zoom = Math.min(V.viewport.maxZoom, V.viewport.zoom * 1.2);
    zoomLevelEl.textContent = Math.round(V.viewport.zoom * 100) + '%';
    V.render();
  });

  document.getElementById('zoom-out').addEventListener('click', function() {
    V.viewport.zoom = Math.max(V.viewport.minZoom, V.viewport.zoom * 0.8);
    zoomLevelEl.textContent = Math.round(V.viewport.zoom * 100) + '%';
    V.render();
  });

  document.getElementById('zoom-fit').addEventListener('click', function() {
    V.viewport.x = 0; V.viewport.y = 0; V.viewport.zoom = 1;
    zoomLevelEl.textContent = '100%';
    V.render();
  });

  document.getElementById('zoom-fit-content').addEventListener('click', function() {
    var layers = V.network.getAllLayers();
    if (layers.length === 0) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    layers.forEach(function(layer) {
      var layerNeurons = V.network.getNeuronsByLayer(layer.id);
      var worldH = Math.max(layerNeurons.length * V.NEURON_GAP + 40, V.LAYER_HEIGHT);
      minX = Math.min(minX, layer.position.x - V.LAYER_WIDTH / 2);
      maxX = Math.max(maxX, layer.position.x + V.LAYER_WIDTH / 2);
      minY = Math.min(minY, layer.position.y - worldH / 2);
      maxY = Math.max(maxY, layer.position.y + worldH / 2);
    });
    var padding = 60;
    var contentW = maxX - minX + padding * 2;
    var contentH = maxY - minY + padding * 2;
    var centerX = (minX + maxX) / 2;
    var centerY = (minY + maxY) / 2;
    var rect = V.canvas.getBoundingClientRect();
    var scaleX = rect.width / contentW;
    var scaleY = rect.height / contentH;
    var newZoom = Math.max(V.viewport.minZoom, Math.min(V.viewport.maxZoom, Math.min(scaleX, scaleY)));
    V.viewport.zoom = newZoom;
    V.viewport.x = -centerX * newZoom;
    V.viewport.y = -centerY * newZoom;
    zoomLevelEl.textContent = Math.round(V.viewport.zoom * 100) + '%';
    V.render();
  });

  // --- Toggle Buttons ---
  document.getElementById('toggle-grid').addEventListener('click', function() {
    V.viewport.showGrid = !V.viewport.showGrid;
    V.render();
  });

  var toggleSnapBtn = document.getElementById('toggle-snap');
  toggleSnapBtn.classList.add('active');
  toggleSnapBtn.addEventListener('click', function() {
    V.viewport.snapToGrid = !V.viewport.snapToGrid;
    toggleSnapBtn.classList.toggle('active', V.viewport.snapToGrid);
    V.render();
  });

  var minimapVisible = true;
  var toggleMinimapBtn = document.getElementById('toggle-minimap');
  toggleMinimapBtn.addEventListener('click', function() {
    minimapVisible = !minimapVisible;
    minimapContainer.style.display = minimapVisible ? '' : 'none';
    toggleMinimapBtn.classList.toggle('active', minimapVisible);
    if (minimapVisible) V.render();
  });

  var toggleWeightsBtn = document.getElementById('toggle-weights');
  toggleWeightsBtn.addEventListener('click', function() {
    V.viewport.showWeights = !V.viewport.showWeights;
    toggleWeightsBtn.classList.toggle('active', V.viewport.showWeights);
    V.render();
  });

  var toggleActivationsBtn = document.getElementById('toggle-activations');
  toggleActivationsBtn.addEventListener('click', function() {
    V.viewport.showActivations = !V.viewport.showActivations;
    toggleActivationsBtn.classList.toggle('active', V.viewport.showActivations);
    if (V.viewport.showActivations) {
      V.runActivationVisualization();
    } else {
      V.neuronActivations.clear();
      V.render();
    }
  });

  // --- Add Neuron / Layer / Clear ---
  var btnAddNeuron = document.querySelector('#view-create .sidebar-btn:first-child');
  var btnAddLayer = document.querySelector('#view-create .sidebar-btn:nth-child(2)');
  var btnClearCanvas = document.getElementById('btn-clear-canvas');
  var btnAutoConnect = document.getElementById('btn-auto-connect');
  var btnClearConnections = document.getElementById('btn-clear-connections');

  if (btnAddNeuron) {
    btnAddNeuron.addEventListener('click', function() {
      if (V.selectedLayerIds.size > 0) {
        var layerId = V.selectedLayerIds.values().next().value;
        var layer = V.network.getLayer(layerId);
        if (layer) { V.saveState(); V.network.createNeuron({ layerId: layerId }); V.layoutLayerNeurons(layer); V.render(); }
      }
    });
  }

  if (btnAddLayer) {
    btnAddLayer.addEventListener('click', function() {
      V.saveState();
      var count = V.network.getAllLayers().length;
      var activations = ['relu', 'sigmoid', 'tanh', 'softmax', 'linear'];
      var layer = V.network.createLayer({
        name: count === 0 ? 'Input' : 'Layer ' + (count + 1),
        type: 'dense', activation: activations[count % activations.length],
        position: { x: count * 200, y: 0 }
      });
      V.selectedLayerIds.clear(); V.selectedNeuronIds.clear();
      V.selectedLayerIds.add(layer.id);
      V.render();
    });
  }

  if (btnClearConnections) {
    btnClearConnections.addEventListener('click', function() {
      var connections = V.network.getAllConnections();
      if (connections.length === 0) return;
      V.saveState();
      connections.forEach(function(conn) { V.network.deleteConnection(conn.id); });
      V.render();
    });
  }

  if (btnClearCanvas) {
    btnClearCanvas.addEventListener('click', function() {
      var layers = V.network.getAllLayers();
      if (layers.length === 0) return;
      V.saveState();
      layers.forEach(function(layer) { V.network.deleteLayer(layer.id); });
      V.selectedLayerIds.clear(); V.selectedNeuronIds.clear();
      V.notes = [];
      V.render();
    });
  }

  var btnAutoLayout = document.getElementById('btn-auto-layout');
  if (btnAutoLayout) {
    btnAutoLayout.addEventListener('click', function() { V.autoLayout(); });
  }

  // --- Auto-Connect Modal ---
  var modal = document.getElementById('auto-connect-modal');
  var modalClose = document.getElementById('modal-close');
  var modalCancel = document.getElementById('modal-cancel');
  var modalConfirm = document.getElementById('modal-confirm');
  var connectType = document.getElementById('connect-type');
  var customRangeSection = document.getElementById('custom-range-section');
  var connectFromLayer = document.getElementById('connect-from-layer');
  var connectToLayer = document.getElementById('connect-to-layer');
  var connectBidirectional = document.getElementById('connect-bidirectional');

  if (btnAutoConnect) {
    btnAutoConnect.addEventListener('click', function() {
      var layers = V.network.getAllLayers();
      if (layers.length < 2) { alert('You need at least 2 layers to create connections.'); return; }
      connectFromLayer.innerHTML = '';
      connectToLayer.innerHTML = '';
      layers.forEach(function(layer, i) {
        var opt1 = document.createElement('option'); opt1.value = layer.id; opt1.textContent = layer.name || 'Layer ' + (i + 1); connectFromLayer.appendChild(opt1);
        var opt2 = document.createElement('option'); opt2.value = layer.id; opt2.textContent = layer.name || 'Layer ' + (i + 1); connectToLayer.appendChild(opt2);
      });
      if (layers.length >= 2) { connectFromLayer.selectedIndex = 0; connectToLayer.selectedIndex = layers.length - 1; }
      modal.style.display = 'flex';
    });
  }

  connectType.addEventListener('change', function() {
    var v = connectType.value;
    customRangeSection.style.display = v === 'custom' ? 'block' : 'none';
    document.getElementById('skip-section').style.display = v === 'skip' ? 'block' : 'none';
    document.getElementById('random-section').style.display = v === 'random' ? 'block' : 'none';
  });

  modalClose.addEventListener('click', function() { modal.style.display = 'none'; });
  modalCancel.addEventListener('click', function() { modal.style.display = 'none'; });
  modal.querySelector('.modal-overlay').addEventListener('click', function() { modal.style.display = 'none'; });

  modalConfirm.addEventListener('click', function() {
    var type = connectType.value;
    var bidirectional = connectBidirectional.checked;
    var layers = V.network.getAllLayers();
    V.saveState();
    var created = 0;

    function connectPair(fromLayerId, toLayerId) {
      var fromNeurons = V.network.getNeuronsByLayer(fromLayerId);
      var toNeurons = V.network.getNeuronsByLayer(toLayerId);
      fromNeurons.forEach(function(fn) {
        toNeurons.forEach(function(tn) {
          V.network.createConnection({ fromNeuron: fn.id, toNeuron: tn.id, fromLayer: fromLayerId, toLayer: toLayerId });
          created++;
        });
      });
      if (bidirectional) {
        toNeurons.forEach(function(tn) {
          fromNeurons.forEach(function(fn) {
            V.network.createConnection({ fromNeuron: tn.id, toNeuron: fn.id, fromLayer: toLayerId, toLayer: fromLayerId });
            created++;
          });
        });
      }
    }

    if (type === 'sequential') {
      for (var i = 0; i < layers.length - 1; i++) connectPair(layers[i].id, layers[i + 1].id);
    } else if (type === 'full') {
      for (var i = 0; i < layers.length; i++) {
        for (var j = 0; j < layers.length; j++) {
          if (i === j) continue;
          var fromNeurons = V.network.getNeuronsByLayer(layers[i].id);
          var toNeurons = V.network.getNeuronsByLayer(layers[j].id);
          fromNeurons.forEach(function(fn) {
            toNeurons.forEach(function(tn) {
              var existing = V.network.getAllConnections().find(function(c) { return c.fromNeuron === fn.id && c.toNeuron === tn.id; });
              if (!existing) { V.network.createConnection({ fromNeuron: fn.id, toNeuron: tn.id, fromLayer: layers[i].id, toLayer: layers[j].id }); created++; }
            });
          });
        }
      }
    } else if (type === 'one-to-one') {
      for (var i = 0; i < layers.length - 1; i++) {
        var fromNeurons = V.network.getNeuronsByLayer(layers[i].id);
        var toNeurons = V.network.getNeuronsByLayer(layers[i + 1].id);
        var count = Math.min(fromNeurons.length, toNeurons.length);
        for (var n = 0; n < count; n++) {
          V.network.createConnection({ fromNeuron: fromNeurons[n].id, toNeuron: toNeurons[n].id, fromLayer: layers[i].id, toLayer: layers[i + 1].id });
          created++;
          if (bidirectional) {
            V.network.createConnection({ fromNeuron: toNeurons[n].id, toNeuron: fromNeurons[n].id, fromLayer: layers[i + 1].id, toLayer: layers[i].id });
            created++;
          }
        }
      }
    } else if (type === 'skip') {
      var k = parseInt(document.getElementById('skip-distance').value) || 2;
      for (var i = 0; i < layers.length - k; i++) connectPair(layers[i].id, layers[i + k].id);
    } else if (type === 'random') {
      var prob = (parseInt(document.getElementById('random-probability').value) || 50) / 100;
      for (var i = 0; i < layers.length - 1; i++) {
        var fromNeurons = V.network.getNeuronsByLayer(layers[i].id);
        var toNeurons = V.network.getNeuronsByLayer(layers[i + 1].id);
        fromNeurons.forEach(function(fn) {
          toNeurons.forEach(function(tn) {
            if (Math.random() < prob) { V.network.createConnection({ fromNeuron: fn.id, toNeuron: tn.id, fromLayer: layers[i].id, toLayer: layers[i + 1].id }); created++; }
          });
        });
        if (bidirectional) {
          toNeurons.forEach(function(tn) {
            fromNeurons.forEach(function(fn) {
              if (Math.random() < prob) { V.network.createConnection({ fromNeuron: tn.id, toNeuron: fn.id, fromLayer: layers[i + 1].id, toLayer: layers[i].id }); created++; }
            });
          });
        }
      }
    } else if (type === 'custom') {
      var fromId = connectFromLayer.value;
      var toId = connectToLayer.value;
      if (fromId === toId) { alert('Please select different layers.'); return; }
      connectPair(fromId, toId);
    }

    modal.style.display = 'none';
    V.render();
  });

  // --- Keyboard Shortcuts ---
  document.addEventListener('keydown', function(e) {
    var tag = document.activeElement && document.activeElement.tagName;
    var isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (document.activeElement && document.activeElement.isContentEditable);

    if (e.key === 'F1') { e.preventDefault(); V.handleMenuAction('menu-learn'); return; }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); if (e.shiftKey) V.history.redo(); else V.history.undo(); }
      if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); V.history.redo(); }
      if (e.shiftKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); V.handleMenuAction('menu-new-network'); }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); V.handleMenuAction('menu-export-json'); }
      if (e.key === 'o' || e.key === 'O') { e.preventDefault(); V.handleMenuAction('menu-import-json'); }
      if (e.shiftKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); V.handleMenuAction('menu-auto-connect'); }
      if (e.shiftKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); V.handleMenuAction('menu-auto-layout'); }
      return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace' || ((e.key === 'x' || e.key === 'X') && !isEditing)) && !isEditing) {
      if (V.selectedNeuronIds.size > 0 || V.selectedLayerIds.size > 0) V.saveState();
      if (V.selectedNeuronIds.size > 0) {
        V.selectedNeuronIds.forEach(function(id) { V.network.deleteNeuron(id); });
        V.selectedNeuronIds.clear(); if (V.hideContextToolbar) V.hideContextToolbar(); V.render();
      }
      if (V.selectedLayerIds.size > 0) {
        V.selectedLayerIds.forEach(function(id) { V.network.deleteLayer(id); });
        V.selectedLayerIds.clear(); if (V.hideContextToolbar) V.hideContextToolbar(); V.render();
      }
    }

    if (e.key === 'Escape') { V.isConnecting = false; V.connectFrom = null; if (V.hideContextToolbar) V.hideContextToolbar(); V.render(); }

    if (isEditing) return;

    switch (e.key) {
      case 'l': case 'L': V.handleMenuAction('menu-add-layer'); break;
      case 'a': case 'A': V.handleMenuAction('menu-add-neuron'); break;
      case 'g': case 'G': V.handleMenuAction('menu-toggle-grid'); break;
      case 'w': case 'W': V.handleMenuAction('menu-toggle-weights'); break;
      case 'm': case 'M': V.handleMenuAction('menu-toggle-minimap'); break;
      case 't': case 'T': V.handleMenuAction('menu-toggle-theme'); break;
      case 'f': case 'F': V.handleMenuAction('menu-fit-content'); break;
      case '1': V.switchPanel('create'); break;
      case '2': V.switchPanel('dataset'); break;
      case '3': V.switchPanel('train'); break;
      case '4': V.switchPanel('predict'); break;
      case '?': V.handleMenuAction('menu-shortcuts'); break;
    }
  });

  // --- Window Globals ---
  window.startConnection = function(neuronId) { V.isConnecting = true; V.connectFrom = neuronId; V.render(); };
  window.getNetwork = function() { return V.network; };
  window.getSelectedLayers = function() { return Array.from(V.selectedLayerIds); };
  window.getSelectedNeurons = function() { return Array.from(V.selectedNeuronIds); };
  window.getViewport = function() { return Object.assign({}, V.viewport); };
  window.screenToWorld = V.screenToWorld;

  // --- Predict icon handler ---
  document.querySelector('.activity-icon[data-view="predict"]').addEventListener('click', function() {
    if (V.buildPredictInputs) V.buildPredictInputs();
  });

  // --- Init Modules ---
  V.initTraining();
  V.initDataset();
  V.initPredict();
  V.initUI();

  // --- Boot ---
  resizeCanvas();
  V.initialized = true;
});
