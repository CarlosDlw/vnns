document.addEventListener('DOMContentLoaded', () => {
  let switchPanel = () => {};
  let buildPredictInputs = () => {};
  let renderMinimap = () => {};
  let updatePropertiesPanel = () => {};
  let dataset = { headers: [], rows: [], columns: [] };

  const trainingUI = window.VNNSModules.createTrainingUI({
    getDataset: () => dataset,
    getNetwork: () => network,
    getViewport: () => viewport,
    render: () => render(),
    switchPanel: (viewName) => switchPanel(viewName),
    resetPropertiesCache: () => {}
  });

  const wasmBridge = trainingUI.wasmBridge;
  const trainingState = trainingUI.trainingState;
  const neuronActivations = trainingUI.neuronActivations;
  const logOutput = trainingUI.logOutput;

  const invalidateBackendNetwork = () => trainingUI.invalidateBackendNetwork();
  const syncWeightsFromBackend = () => trainingUI.syncWeightsFromBackend();
  const runActivationVisualization = () => trainingUI.runActivationVisualization();
  const applyActivationFn = (x, fn) => trainingUI.applyActivationFn(x, fn);
  const computeActivations = (inputValues) => trainingUI.computeActivations(inputValues);

  const datasetUI = window.VNNSModules.createDatasetUI({
    getDataset: () => dataset,
    setDataset: (nextDataset) => { dataset = nextDataset; },
    logOutput: (msg, level) => logOutput(msg, level),
    invalidateBackendNetwork: () => invalidateBackendNetwork()
  });

  const buildDataset = () => datasetUI.buildDataset();
  const renderColumns = () => datasetUI.renderColumns();
  const updateSplit = () => datasetUI.updateSplit();

  const predictUI = window.VNNSModules.createPredictUI({
    getDataset: () => dataset,
    getNetwork: () => network,
    getViewport: () => viewport,
    getCtx: () => ctx,
    getWasmBridge: () => wasmBridge,
    getTrainingState: () => trainingState,
    getNeuronActivations: () => neuronActivations,
    logOutput: (msg, level) => logOutput(msg, level),
    syncWeightsFromBackend: () => syncWeightsFromBackend(),
    computeActivations: (inputValues) => computeActivations(inputValues),
    applyActivationFn: (x, fn) => applyActivationFn(x, fn),
    getNeuronScreenPos: (neuron) => getNeuronScreenPos(neuron),
    render: () => render()
  });

  buildPredictInputs = () => predictUI.buildPredictInputs();

  const menusUI = window.VNNSModules.createMenusUI({
    onMenuAction: (action) => handleMenuAction(action),
    onPredictPanel: () => buildPredictInputs()
  });

  switchPanel = (viewName) => menusUI.switchPanel(viewName);

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

  const canvasRenderer = window.VNNSModules.createCanvasRenderer({
    canvas,
    ctx,
    network,
    viewport,
    getDropTargetLayerId: () => dropTargetLayerId,
    selectedLayerIds,
    selectedNeuronIds,
    isDraggingRef: () => isDragging,
    dragTargetRef: () => dragTarget,
    isConnectingRef: () => isConnecting,
    connectFromRef: () => connectFrom,
    mouseWorldPosRef: () => mouseWorldPos,
    neuronActivations,
    notesRef: () => notes,
    ctxTargetRef: () => ctxTarget,
    updateContextToolbarPosition: () => updateContextToolbarPosition(),
    renderMinimap: () => renderMinimap(),
    updatePropertiesPanel: () => updatePropertiesPanel()
  });

  const {
    LAYER_COLORS,
    NEURON_RADIUS,
    NEURON_GAP,
    LAYER_WIDTH,
    LAYER_HEIGHT,
    layoutLayerNeurons,
    resizeCanvas,
    screenToWorld,
    worldToScreen,
    getLayerScreenRect,
    getNeuronScreenPos,
    hitTestLayer,
    hitTestNeuron,
    hitTestConnection,
    render
  } = canvasRenderer;

  const canvasInteraction = window.VNNSModules.createCanvasInteraction({
    canvas,
    network,
    viewport,
    neuronActivations,
    selectedLayerIds,
    selectedNeuronIds,
    refs: {
      get isDragging() { return isDragging; },
      set isDragging(v) { isDragging = v; },
      get dragTarget() { return dragTarget; },
      set dragTarget(v) { dragTarget = v; },
      get dragMoved() { return dragMoved; },
      set dragMoved(v) { dragMoved = v; },
      get dragOffset() { return dragOffset; },
      set dragOffset(v) { dragOffset = v; },
      get isPanning() { return isPanning; },
      set isPanning(v) { isPanning = v; },
      get panStart() { return panStart; },
      set panStart(v) { panStart = v; },
      get isConnecting() { return isConnecting; },
      set isConnecting(v) { isConnecting = v; },
      get connectFrom() { return connectFrom; },
      set connectFrom(v) { connectFrom = v; },
      get mouseWorldPos() { return mouseWorldPos; },
      set mouseWorldPos(v) { mouseWorldPos = v; },
      get dropTargetLayerId() { return dropTargetLayerId; },
      set dropTargetLayerId(v) { dropTargetLayerId = v; },
      get hoverLayerId() { return hoverLayerId; },
      set hoverLayerId(v) { hoverLayerId = v; },
      get hoverNeuronId() { return hoverNeuronId; },
      set hoverNeuronId(v) { hoverNeuronId = v; },
      get hoverConnection() { return hoverConnection; },
      set hoverConnection(v) { hoverConnection = v; },
      get tooltipMouseX() { return tooltipMouseX; },
      set tooltipMouseX(v) { tooltipMouseX = v; },
      get tooltipMouseY() { return tooltipMouseY; },
      set tooltipMouseY(v) { tooltipMouseY = v; }
    },
    screenToWorld,
    worldToScreen,
    hitTestLayer,
    hitTestNeuron,
    hitTestConnection,
    layoutLayerNeurons,
    render,
    saveState,
    snapToGridPos,
    showContextToolbar,
    hideContextToolbar,
    runActivationVisualization,
    zoomLevelEl,
    LAYER_WIDTH,
    LAYER_HEIGHT,
    NEURON_GAP,
    LAYER_COLORS,
    getNeuronScreenPos
  });

  renderMinimap = () => canvasInteraction.renderMinimap();
  updatePropertiesPanel = () => canvasInteraction.updatePropertiesPanel();

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

  resizeCanvas();
});
