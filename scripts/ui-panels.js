/**
 * VNNS UI Panels
 * Properties panel, context toolbar, context menu, rename modal,
 * handleMenuAction, applyTemplate, confirm modal, import JSON, info modals.
 */
(function(V) {
  'use strict';

  var LAYER_COLORS = V.LAYER_COLORS;

  // --- Properties Panel ---
  var propertiesContent = document.getElementById('properties-content');
  var _lastPropsKey = '';

  function getPropsKey() {
    if (V.selectedLayerIds.size === 1) return 'layer:' + V.selectedLayerIds.values().next().value;
    if (V.selectedNeuronIds.size === 1) return 'neuron:' + V.selectedNeuronIds.values().next().value;
    if (V.selectedLayerIds.size > 1) return 'layers:' + V.selectedLayerIds.size;
    if (V.selectedNeuronIds.size > 1) return 'neurons:' + V.selectedNeuronIds.size;
    return 'none';
  }

  function updatePropertiesPanel() {
    var key = getPropsKey();
    if (key === _lastPropsKey) return;
    _lastPropsKey = key;

    if (V.selectedLayerIds.size === 1) {
      var layerId = V.selectedLayerIds.values().next().value;
      var layer = V.network.getLayer(layerId);
      if (!layer) return showEmptyProps();
      renderLayerProps(layer);
    } else if (V.selectedNeuronIds.size === 1) {
      var neuronId = V.selectedNeuronIds.values().next().value;
      var neuron = V.network.getNeuron(neuronId);
      if (!neuron) return showEmptyProps();
      renderNeuronProps(neuron);
    } else if (V.selectedLayerIds.size > 1) {
      renderMultiLayerProps();
    } else if (V.selectedNeuronIds.size > 1) {
      renderMultiNeuronProps();
    } else {
      showEmptyProps();
    }
  }

  function showEmptyProps() {
    propertiesContent.innerHTML = '<div class="props-empty"><span class="codicon codicon-info"></span><span>Select a layer or neuron</span></div>';
  }

  function renderLayerProps(layer) {
    var layers = V.network.getAllLayers();
    var li = layers.findIndex(function(l) { return l.id === layer.id; });
    var neurons = V.network.getNeuronsByLayer(layer.id);
    var connsIn = V.network.getConnectionsByLayer(layer.id, 'incoming');
    var connsOut = V.network.getConnectionsByLayer(layer.id, 'outgoing');
    var color = layer.style.color || LAYER_COLORS[li % LAYER_COLORS.length];
    var useBias = layer.useBias !== false;
    var useBatchNorm = !!layer.useBatchNorm;
    var weightInit = layer.weightInit || 'xavier';
    var dropoutRate = layer.dropoutRate || 0;

    propertiesContent.innerHTML =
      '<div class="props-group"><div class="props-group-header"><span class="codicon codicon-chevron-down"></span> General</div><div class="props-group-body">' +
        '<div class="props-row"><span class="props-label">Name</span><input class="props-input" data-prop="name" value="' + V.escapeHtml(layer.name) + '" /></div>' +
        '<div class="props-row"><span class="props-label">Type</span>' + V.makeSelectHtml('type', V.LAYER_TYPES, layer.type) + '</div>' +
        '<div class="props-row"><span class="props-label">Activation</span>' + V.makeSelectHtml('activation', V.ACTIVATIONS, layer.activation) + '</div>' +
        '<div class="props-row"><span class="props-label">Color</span><input type="color" class="props-color-input" data-prop="color" value="' + color + '" /></div>' +
      '</div></div>' +
      '<div class="props-group"><div class="props-group-header"><span class="codicon codicon-chevron-down"></span> Parameters</div><div class="props-group-body">' +
        '<div class="props-row"><span class="props-label">Neurons</span><input class="props-input" data-prop="neuronCount" type="number" min="0" max="64" value="' + neurons.length + '" style="width:50px" /></div>' +
        '<div class="props-row"><label class="props-checkbox"><input type="checkbox" data-prop="useBias" ' + (useBias ? 'checked' : '') + ' /> Use Bias</label></div>' +
        '<div class="props-row"><label class="props-checkbox"><input type="checkbox" data-prop="useBatchNorm" ' + (useBatchNorm ? 'checked' : '') + ' /> Batch Norm</label></div>' +
        '<div class="props-row"><span class="props-label">Dropout</span><input class="props-input" data-prop="dropoutRate" type="number" min="0" max="0.9" step="0.05" value="' + dropoutRate.toFixed(2) + '" style="width:60px" /></div>' +
        '<div class="props-row"><span class="props-label">Weight Init</span>' + V.makeSelectHtml('weightInit', V.WEIGHT_INITS, weightInit) + '</div>' +
      '</div></div>' +
      '<div class="props-group"><div class="props-group-header"><span class="codicon codicon-chevron-down"></span> Position</div><div class="props-group-body">' +
        '<div class="props-row"><span class="props-label">X</span><input class="props-input" data-prop="posX" type="number" value="' + Math.round(layer.position.x) + '" style="width:65px" />' +
        '<span class="props-label" style="min-width:20px">Y</span><input class="props-input" data-prop="posY" type="number" value="' + Math.round(layer.position.y) + '" style="width:65px" /></div>' +
      '</div></div>' +
      '<div class="props-group"><div class="props-group-header"><span class="codicon codicon-chevron-down"></span> Statistics</div><div class="props-group-body">' +
        '<div class="props-stat"><span class="props-stat-label">Neurons</span><span class="props-stat-value">' + neurons.length + '</span></div>' +
        '<div class="props-stat"><span class="props-stat-label">Connections In</span><span class="props-stat-value">' + connsIn.length + '</span></div>' +
        '<div class="props-stat"><span class="props-stat-label">Connections Out</span><span class="props-stat-value">' + connsOut.length + '</span></div>' +
        '<div class="props-stat"><span class="props-stat-label">Parameters</span><span class="props-stat-value">' + (neurons.length > 0 ? connsIn.length + (useBias ? neurons.length : 0) : 0) + '</span></div>' +
        '<div class="props-stat"><span class="props-stat-label">Layer Index</span><span class="props-stat-value">' + li + '</span></div>' +
        '<div class="props-stat"><span class="props-stat-label">ID</span><span class="props-stat-value">' + layer.id + '</span></div>' +
      '</div></div>';

    wireLayerPropsEvents(layer);
  }

  function renderNeuronProps(neuron) {
    var layer = V.network.getLayer(neuron.layerId);
    var layers = V.network.getAllLayers();
    var li = layers.findIndex(function(l) { return l.id === neuron.layerId; });
    var neuronIdx = layer ? V.network.getNeuronsByLayer(layer.id).findIndex(function(n) { return n.id === neuron.id; }) : 0;
    var connsIn = V.network.getConnectionsByNeuron(neuron.id, 'incoming');
    var connsOut = V.network.getConnectionsByNeuron(neuron.id, 'outgoing');
    var color = (layer && layer.style.color) || LAYER_COLORS[li % LAYER_COLORS.length];

    var connsInHtml = connsIn.length > 0 ? '<div style="font-size:10px;color:#888;margin-bottom:4px;">INCOMING (' + connsIn.length + ')</div>' : '';
    connsIn.forEach(function(c) {
      var fromN = V.network.getNeuron(c.fromNeuron);
      var fromL = fromN ? V.network.getLayer(fromN.layerId) : null;
      var fromIdx = fromL ? V.network.getNeuronsByLayer(fromL.id).findIndex(function(n) { return n.id === c.fromNeuron; }) : '?';
      connsInHtml += '<div class="props-row"><span class="props-label" style="min-width:55px">' + (fromL ? V.escapeHtml(fromL.name) : '?') + '.N' + fromIdx + '</span>' +
        '<span class="props-value" style="color:#888">w=</span>' +
        '<input class="props-input" data-conn="' + c.id + '" type="number" step="0.01" value="' + c.weight.toFixed(4) + '" style="width:70px" /></div>';
    });

    var connsOutHtml = connsOut.length > 0 ? '<div style="font-size:10px;color:#888;margin-bottom:4px;margin-top:6px;">OUTGOING (' + connsOut.length + ')</div>' : '';
    connsOut.forEach(function(c) {
      var toN = V.network.getNeuron(c.toNeuron);
      var toL = toN ? V.network.getLayer(toN.layerId) : null;
      var toIdx = toL ? V.network.getNeuronsByLayer(toL.id).findIndex(function(n) { return n.id === c.toNeuron; }) : '?';
      connsOutHtml += '<div class="props-row"><span class="props-label" style="min-width:55px">' + (toL ? V.escapeHtml(toL.name) : '?') + '.N' + toIdx + '</span>' +
        '<span class="props-value" style="color:#888">w=</span>' +
        '<input class="props-input" data-conn="' + c.id + '" type="number" step="0.01" value="' + c.weight.toFixed(4) + '" style="width:70px" /></div>';
    });

    var noConns = (connsIn.length + connsOut.length) === 0 ? '<div style="font-size:11px;color:#666;">No connections</div>' : '';

    propertiesContent.innerHTML =
      '<div class="props-group"><div class="props-group-header"><span class="codicon codicon-chevron-down"></span> Neuron</div><div class="props-group-body">' +
        '<div class="props-row"><span class="props-label">Label</span><span class="props-value" style="color:' + color + '">N' + neuronIdx + '</span></div>' +
        '<div class="props-row"><span class="props-label">Layer</span><span class="props-value">' + (layer ? V.escapeHtml(layer.name) : '—') + '</span></div>' +
        '<div class="props-row"><span class="props-label">Activation</span>' + V.makeSelectHtml('neuronActivation', [{value: '', label: 'Inherit (' + (layer ? layer.activation : 'relu') + ')'}].concat(V.ACTIVATIONS), neuron.activation || '') + '</div>' +
      '</div></div>' +
      '<div class="props-group"><div class="props-group-header"><span class="codicon codicon-chevron-down"></span> Parameters</div><div class="props-group-body">' +
        '<div class="props-row"><span class="props-label">Bias</span><input class="props-input" data-prop="bias" type="number" step="0.01" value="' + neuron.bias + '" style="width:80px" /></div>' +
      '</div></div>' +
      '<div class="props-group"><div class="props-group-header"><span class="codicon codicon-chevron-down"></span> Connections (' + (connsIn.length + connsOut.length) + ')</div><div class="props-group-body">' +
        connsInHtml + connsOutHtml + noConns +
      '</div></div>' +
      '<div class="props-group"><div class="props-group-header"><span class="codicon codicon-chevron-down"></span> Info</div><div class="props-group-body">' +
        '<div class="props-stat"><span class="props-stat-label">ID</span><span class="props-stat-value">' + neuron.id + '</span></div>' +
        '<div class="props-stat"><span class="props-stat-label">Position</span><span class="props-stat-value">' + Math.round(neuron.position.x) + ', ' + Math.round(neuron.position.y) + '</span></div>' +
      '</div></div>';

    wireNeuronPropsEvents(neuron);
  }

  function renderMultiLayerProps() {
    var ids = Array.from(V.selectedLayerIds);
    var totalNeurons = ids.reduce(function(s, id) { return s + V.network.getNeuronsByLayer(id).length; }, 0);
    propertiesContent.innerHTML =
      '<div class="props-group"><div class="props-group-header"><span class="codicon codicon-chevron-down"></span> Multi-Selection</div><div class="props-group-body">' +
        '<div class="props-stat"><span class="props-stat-label">Layers selected</span><span class="props-stat-value">' + ids.length + '</span></div>' +
        '<div class="props-stat"><span class="props-stat-label">Total Neurons</span><span class="props-stat-value">' + totalNeurons + '</span></div>' +
        '<div class="props-row" style="margin-top:8px"><span class="props-label">Activation</span>' + V.makeSelectHtml('multiActivation', [{value: '', label: '— mixed —'}].concat(V.ACTIVATIONS), '') + '</div>' +
      '</div></div>';

    var sel = propertiesContent.querySelector('[data-prop="multiActivation"]');
    if (sel) {
      sel.addEventListener('change', function() {
        if (!sel.value) return;
        V.saveState();
        ids.forEach(function(id) {
          var layer = V.network.getLayer(id);
          if (layer) layer.activation = sel.value;
        });
        V.invalidateBackendNetwork();
        _lastPropsKey = '';
        V.render();
      });
    }
  }

  function renderMultiNeuronProps() {
    var ids = Array.from(V.selectedNeuronIds);
    propertiesContent.innerHTML =
      '<div class="props-group"><div class="props-group-header"><span class="codicon codicon-chevron-down"></span> Multi-Selection</div><div class="props-group-body">' +
        '<div class="props-stat"><span class="props-stat-label">Neurons selected</span><span class="props-stat-value">' + ids.length + '</span></div>' +
      '</div></div>';
  }

  function wireCollapsibleHeaders(content) {
    content.querySelectorAll('.props-group-header').forEach(function(header) {
      header.addEventListener('click', function() {
        var body = header.nextElementSibling;
        var icon = header.querySelector('.codicon');
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

  function wireLayerPropsEvents(layer) {
    var content = propertiesContent;
    var nameInput = content.querySelector('[data-prop="name"]');
    if (nameInput) nameInput.addEventListener('change', function() { V.saveState(); layer.name = nameInput.value; _lastPropsKey = ''; V.render(); });

    var typeSelect = content.querySelector('[data-prop="type"]');
    if (typeSelect) typeSelect.addEventListener('change', function() { V.saveState(); layer.type = typeSelect.value; _lastPropsKey = ''; V.render(); });

    var actSelect = content.querySelector('[data-prop="activation"]');
    if (actSelect) actSelect.addEventListener('change', function() { V.saveState(); layer.activation = actSelect.value; V.invalidateBackendNetwork(); _lastPropsKey = ''; V.render(); });

    var colorInput = content.querySelector('[data-prop="color"]');
    if (colorInput) {
      colorInput.addEventListener('input', function() { layer.style.color = colorInput.value; V.render(); });
      colorInput.addEventListener('change', function() { V.saveState(); layer.style.color = colorInput.value; _lastPropsKey = ''; V.render(); });
    }

    var neuronCountInput = content.querySelector('[data-prop="neuronCount"]');
    if (neuronCountInput) neuronCountInput.addEventListener('change', function() {
      V.saveState();
      var target = parseInt(neuronCountInput.value) || 0;
      var current = V.network.getNeuronsByLayer(layer.id);
      if (target > current.length) { for (var i = current.length; i < target; i++) V.network.createNeuron({ layerId: layer.id }); }
      else if (target < current.length) { for (var i = current.length - 1; i >= target; i--) V.network.deleteNeuron(current[i].id); }
      V.layoutLayerNeurons(layer);
      _lastPropsKey = '';
      V.render();
    });

    var biasCheck = content.querySelector('[data-prop="useBias"]');
    if (biasCheck) biasCheck.addEventListener('change', function() { V.saveState(); layer.useBias = biasCheck.checked; V.invalidateBackendNetwork(); _lastPropsKey = ''; V.render(); });

    var bnCheck = content.querySelector('[data-prop="useBatchNorm"]');
    if (bnCheck) bnCheck.addEventListener('change', function() { V.saveState(); layer.useBatchNorm = bnCheck.checked; V.invalidateBackendNetwork(); _lastPropsKey = ''; V.render(); });

    var dropoutInput = content.querySelector('[data-prop="dropoutRate"]');
    if (dropoutInput) dropoutInput.addEventListener('change', function() {
      V.saveState();
      var val = parseFloat(dropoutInput.value) || 0;
      val = Math.max(0, Math.min(0.9, val));
      layer.dropoutRate = val;
      dropoutInput.value = val.toFixed(2);
      V.invalidateBackendNetwork();
      _lastPropsKey = '';
      V.render();
    });

    var weightInitSelect = content.querySelector('[data-prop="weightInit"]');
    if (weightInitSelect) weightInitSelect.addEventListener('change', function() { V.saveState(); layer.weightInit = weightInitSelect.value; V.invalidateBackendNetwork(); _lastPropsKey = ''; V.render(); });

    var posXInput = content.querySelector('[data-prop="posX"]');
    if (posXInput) posXInput.addEventListener('change', function() { V.saveState(); layer.position.x = parseFloat(posXInput.value) || 0; V.layoutLayerNeurons(layer); _lastPropsKey = ''; V.render(); });

    var posYInput = content.querySelector('[data-prop="posY"]');
    if (posYInput) posYInput.addEventListener('change', function() { V.saveState(); layer.position.y = parseFloat(posYInput.value) || 0; V.layoutLayerNeurons(layer); _lastPropsKey = ''; V.render(); });

    wireCollapsibleHeaders(content);
  }

  function wireNeuronPropsEvents(neuron) {
    var content = propertiesContent;
    var biasInput = content.querySelector('[data-prop="bias"]');
    if (biasInput) biasInput.addEventListener('change', function() { V.saveState(); neuron.bias = parseFloat(biasInput.value) || 0; _lastPropsKey = ''; V.render(); });

    var actSelect = content.querySelector('[data-prop="neuronActivation"]');
    if (actSelect) actSelect.addEventListener('change', function() { V.saveState(); neuron.activation = actSelect.value || null; V.invalidateBackendNetwork(); _lastPropsKey = ''; V.render(); });

    content.querySelectorAll('[data-conn]').forEach(function(input) {
      input.addEventListener('change', function() {
        V.saveState();
        var conn = V.network.getConnection(input.dataset.conn);
        if (conn) conn.weight = parseFloat(input.value) || 0;
        _lastPropsKey = '';
        V.render();
      });
    });

    wireCollapsibleHeaders(content);
  }

  // --- Confirm Modal ---
  function showConfirmModal(title, message, onConfirm) {
    var modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    modal.style.display = '';
    var ok = document.getElementById('confirm-modal-ok');
    var cancel = document.getElementById('confirm-modal-cancel');
    var closeBtn = document.getElementById('confirm-modal-close');
    var overlay = modal.querySelector('.modal-overlay');
    var cleanup = function() { modal.style.display = 'none'; ok.removeEventListener('click', handleOk); cancel.removeEventListener('click', handleCancel); closeBtn.removeEventListener('click', handleCancel); overlay.removeEventListener('click', handleCancel); };
    var handleOk = function() { cleanup(); onConfirm(); };
    var handleCancel = function() { cleanup(); };
    ok.addEventListener('click', handleOk);
    cancel.addEventListener('click', handleCancel);
    closeBtn.addEventListener('click', handleCancel);
    overlay.addEventListener('click', handleCancel);
  }

  // --- Rename Modal ---
  var renameModal = document.getElementById('rename-modal');
  var renameInput = document.getElementById('rename-input');
  var renameLayerId = null;

  function openRenameModal(layerId) {
    var layer = V.network.getLayer(layerId);
    if (!layer) return;
    renameLayerId = layerId;
    renameInput.value = layer.name;
    renameModal.style.display = 'flex';
    setTimeout(function() { renameInput.focus(); renameInput.select(); }, 50);
  }

  function closeRenameModal() {
    renameModal.style.display = 'none';
    renameLayerId = null;
  }

  function confirmRename() {
    if (renameLayerId) {
      var layer = V.network.getLayer(renameLayerId);
      var val = renameInput.value.trim();
      if (layer && val) { V.saveState(); layer.name = val; V.render(); }
    }
    closeRenameModal();
  }

  // --- Context Toolbar ---
  var ctxToolbar = document.getElementById('context-toolbar');
  var ctxToolsBtn = document.getElementById('ctx-tools-btn');
  var ctxDropdown = document.getElementById('ctx-dropdown');
  var ctxTarget = null;
  var ctxJustShown = false;

  function updateContextToolbarPosition() {
    if (!ctxTarget) return;
    if (ctxTarget.type === 'layer') {
      var layer = V.network.getLayer(ctxTarget.id);
      if (!layer) { ctxToolbar.style.display = 'none'; ctxTarget = null; return; }
      var r = V.getLayerScreenRect(layer);
      ctxToolbar.style.left = (r.x + r.w + 8) + 'px';
      ctxToolbar.style.top = (r.y) + 'px';
    } else if (ctxTarget.type === 'neuron') {
      var neuron = V.network.getNeuron(ctxTarget.id);
      if (!neuron) { ctxToolbar.style.display = 'none'; ctxTarget = null; return; }
      var pos = V.getNeuronScreenPos(neuron);
      var nr = V.NEURON_RADIUS * V.viewport.zoom;
      ctxToolbar.style.left = (pos.x + nr + 8) + 'px';
      ctxToolbar.style.top = (pos.y - 15) + 'px';
    }
  }

  function showContextToolbar(target) {
    ctxTarget = target;
    ctxToolbar.style.display = 'block';
    ctxDropdown.style.display = 'none';
    updateContextToolbarPosition();
    ctxJustShown = true;
    requestAnimationFrame(function() { ctxJustShown = false; });
  }

  function hideContextToolbar() {
    ctxToolbar.style.display = 'none';
    ctxDropdown.style.display = 'none';
    ctxTarget = null;
  }

  function buildDropdownItems() {
    if (!ctxTarget) return;
    var html = '';

    if (ctxTarget.type === 'layer') {
      var layer = V.network.getLayer(ctxTarget.id);
      if (!layer) return;
      var currentAct = (layer.activation || 'relu').toLowerCase();
      var currentColor = layer.style.color || LAYER_COLORS[V.network.getAllLayers().indexOf(layer) % LAYER_COLORS.length];
      var acts = [{value:'linear',label:'Linear'},{value:'relu',label:'ReLU'},{value:'leaky_relu',label:'LReLU'},{value:'sigmoid',label:'Sigmoid'},{value:'tanh',label:'Tanh'},{value:'softmax',label:'Softmax'},{value:'elu',label:'ELU'},{value:'gelu',label:'GELU'},{value:'swish',label:'Swish'}];
      var colors = ['#0e639c','#6a3d99','#2a7a3a','#a35200','#8b0000','#4a4a8a','#5c3a6e','#1a6e5a','#b5862a','#c74040','#2980b9','#27ae60'];

      html += '<button class="ctx-dropdown-item" data-action="rename-layer"><span class="codicon codicon-edit"></span>Rename Layer</button>';
      html += '<button class="ctx-dropdown-item" data-action="duplicate-layer"><span class="codicon codicon-copy"></span>Duplicate Layer</button>';
      html += '<button class="ctx-dropdown-item" data-action="add-neuron"><span class="codicon codicon-add"></span>Add Neuron</button>';
      html += '<button class="ctx-dropdown-item" data-action="set-neuron-count"><span class="codicon codicon-symbol-numeric"></span>Set Neuron Count</button>';
      html += '<div class="ctx-dropdown-separator"></div>';
      html += '<button class="ctx-dropdown-item" data-action="change-activation"><span class="codicon codicon-zap"></span>Activation</button>';
      html += '<div class="ctx-activation-row" id="ctx-activation-row" style="display:none">';
      acts.forEach(function(a) { html += '<button class="ctx-act-pill' + (a.value === currentAct ? ' active' : '') + '" data-activation="' + a.value + '">' + a.label + '</button>'; });
      html += '</div>';
      html += '<button class="ctx-dropdown-item" data-action="change-color"><span class="codicon codicon-symbol-color"></span>Change Color</button>';
      html += '<div class="ctx-color-row" id="ctx-color-row" style="display:none">';
      colors.forEach(function(c) { html += '<div class="ctx-color-swatch' + (c === currentColor ? ' active' : '') + '" data-color="' + c + '" style="background:' + c + '"></div>'; });
      html += '</div>';
      html += '<div class="ctx-dropdown-separator"></div>';
      html += '<button class="ctx-dropdown-item" data-action="remove-layer" style="color:#f48771"><span class="codicon codicon-trash" style="color:#f48771"></span>Remove Layer</button>';
    } else if (ctxTarget.type === 'neuron') {
      html += '<button class="ctx-dropdown-item" data-action="connect-from"><span class="codicon codicon-plug"></span>Start Connection</button>';
      html += '<div class="ctx-dropdown-separator"></div>';
      html += '<button class="ctx-dropdown-item" data-action="remove-neuron" style="color:#f48771"><span class="codicon codicon-trash" style="color:#f48771"></span>Remove Neuron</button>';
    }

    ctxDropdown.innerHTML = html;

    ctxDropdown.querySelectorAll('.ctx-dropdown-item').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); handleCtxAction(btn.dataset.action); });
    });

    ctxDropdown.querySelectorAll('.ctx-color-swatch').forEach(function(swatch) {
      swatch.addEventListener('click', function(e) {
        e.stopPropagation();
        if (ctxTarget && ctxTarget.type === 'layer') {
          var layer = V.network.getLayer(ctxTarget.id);
          if (layer) { V.saveState(); layer.style.color = swatch.dataset.color; V.render(); }
        }
        hideContextToolbar();
      });
    });

    ctxDropdown.querySelectorAll('.ctx-act-pill').forEach(function(pill) {
      pill.addEventListener('click', function(e) {
        e.stopPropagation();
        if (ctxTarget && ctxTarget.type === 'layer') {
          var layer = V.network.getLayer(ctxTarget.id);
          if (layer) { V.saveState(); layer.activation = pill.dataset.activation; V.invalidateBackendNetwork(); V.render(); V.logOutput('Layer "' + layer.name + '" activation → ' + pill.dataset.activation, 'info'); }
        }
        hideContextToolbar();
      });
    });
  }

  function handleCtxAction(action) {
    if (!ctxTarget) return;
    if (action === 'remove-layer') {
      V.saveState(); V.network.deleteLayer(ctxTarget.id); V.selectedLayerIds.delete(ctxTarget.id); hideContextToolbar(); V.render();
    } else if (action === 'remove-neuron') {
      V.saveState(); V.network.deleteNeuron(ctxTarget.id); V.selectedNeuronIds.delete(ctxTarget.id); hideContextToolbar();
      V.network.getAllLayers().forEach(function(l) { V.layoutLayerNeurons(l); }); V.render();
    } else if (action === 'rename-layer') {
      openRenameModal(ctxTarget.id); hideContextToolbar();
    } else if (action === 'duplicate-layer') {
      var srcLayer = V.network.getLayer(ctxTarget.id);
      if (srcLayer) {
        V.saveState();
        var srcNeurons = V.network.getNeuronsByLayer(srcLayer.id);
        var newLayer = V.network.createLayer({ name: srcLayer.name + ' (copy)', type: srcLayer.type, activation: srcLayer.activation, position: { x: srcLayer.position.x + 200, y: srcLayer.position.y }, style: Object.assign({}, srcLayer.style) });
        srcNeurons.forEach(function() { V.network.createNeuron({ layerId: newLayer.id }); });
        V.layoutLayerNeurons(newLayer);
        V.selectedLayerIds.clear(); V.selectedNeuronIds.clear(); V.selectedLayerIds.add(newLayer.id); V.render();
      }
      hideContextToolbar();
    } else if (action === 'add-neuron') {
      var layer = V.network.getLayer(ctxTarget.id);
      if (layer) { V.saveState(); V.network.createNeuron({ layerId: layer.id }); V.layoutLayerNeurons(layer); V.render(); }
      hideContextToolbar();
    } else if (action === 'connect-from') {
      V.isConnecting = true; V.connectFrom = ctxTarget.id; hideContextToolbar(); V.render();
    } else if (action === 'change-color') {
      var colorRow = document.getElementById('ctx-color-row');
      if (colorRow) colorRow.style.display = colorRow.style.display === 'none' ? 'flex' : 'none';
      var actRow = document.getElementById('ctx-activation-row');
      if (actRow) actRow.style.display = 'none';
      return;
    } else if (action === 'change-activation') {
      var actRow = document.getElementById('ctx-activation-row');
      if (actRow) actRow.style.display = actRow.style.display === 'none' ? 'flex' : 'none';
      var colorRow = document.getElementById('ctx-color-row');
      if (colorRow) colorRow.style.display = 'none';
      return;
    } else if (action === 'set-neuron-count') {
      var layer = V.network.getLayer(ctxTarget.id);
      if (layer) {
        var currentNeurons = V.network.getNeuronsByLayer(layer.id);
        var input = prompt('Set neuron count for "' + layer.name + '":', currentNeurons.length);
        if (input !== null) {
          var count = parseInt(input);
          if (!isNaN(count) && count >= 1 && count <= 256) {
            V.saveState();
            var diff = count - currentNeurons.length;
            if (diff > 0) { for (var i = 0; i < diff; i++) V.network.createNeuron({ layerId: layer.id }); }
            else if (diff < 0) { for (var i = 0; i < -diff; i++) V.network.deleteNeuron(currentNeurons[currentNeurons.length - 1 - i].id); }
            V.layoutLayerNeurons(layer); V.render();
            V.logOutput('Layer "' + layer.name + '" → ' + count + ' neurons', 'info');
          }
        }
      }
      hideContextToolbar();
    }
  }

  // --- Canvas Context Menu (right-click) ---
  var ctxMenu = document.getElementById('canvas-context-menu');

  function hideContextMenu() { ctxMenu.style.display = 'none'; }

  function showContextMenu(mx, my) {
    hideContextToolbar();
    var neuron = V.hitTestNeuron(mx, my);
    var layer = neuron ? null : V.hitTestLayer(mx, my);
    var layers = V.network.getAllLayers();
    var hasLayers = layers.length > 0;
    var hasConnections = V.network.getAllConnections().length > 0;
    var html = '';

    if (neuron) {
      var parentLayer = V.network.getLayer(neuron.layerId);
      var nIdx = parentLayer ? V.network.getNeuronsByLayer(parentLayer.id).findIndex(function(n) { return n.id === neuron.id; }) : 0;
      html += '<div class="ctxmenu-label">' + (parentLayer ? parentLayer.name : 'Neuron') + ' > N' + nIdx + '</div>';
      html += '<button class="ctxmenu-item" data-action="ctx-connect"><span class="codicon codicon-plug"></span>Start Connection</button>';
      html += '<div class="ctxmenu-separator"></div>';
      html += '<button class="ctxmenu-item danger" data-action="ctx-remove-neuron" data-id="' + neuron.id + '"><span class="codicon codicon-trash"></span>Remove Neuron</button>';
    } else if (layer) {
      html += '<div class="ctxmenu-label">' + layer.name + '</div>';
      html += '<button class="ctxmenu-item" data-action="ctx-add-neuron-to" data-id="' + layer.id + '"><span class="codicon codicon-add"></span>Add Neuron</button>';
      html += '<button class="ctxmenu-item" data-action="ctx-rename" data-id="' + layer.id + '"><span class="codicon codicon-edit"></span>Rename Layer</button>';
      html += '<button class="ctxmenu-item" data-action="ctx-duplicate" data-id="' + layer.id + '"><span class="codicon codicon-copy"></span>Duplicate Layer</button>';
      html += '<div class="ctxmenu-separator"></div>';
      html += '<button class="ctxmenu-item danger" data-action="ctx-remove-layer" data-id="' + layer.id + '"><span class="codicon codicon-trash"></span>Remove Layer</button>';
    } else {
      html += '<button class="ctxmenu-item" data-action="ctx-add-layer"><span class="codicon codicon-layers"></span>Add Layer Here</button>';
      html += '<button class="ctxmenu-item' + (!V.selectedLayerIds.size ? ' disabled' : '') + '" data-action="ctx-add-neuron-sel"><span class="codicon codicon-add"></span>Add Neuron to Selected</button>';
      html += '<div class="ctxmenu-separator"></div>';
      html += '<button class="ctxmenu-item' + (!hasLayers ? ' disabled' : '') + '" data-action="ctx-auto-connect"><span class="codicon codicon-plug"></span>Auto Connect</button>';
      html += '<button class="ctxmenu-item' + (!hasLayers ? ' disabled' : '') + '" data-action="ctx-auto-layout"><span class="codicon codicon-layout"></span>Auto Layout</button>';
      html += '<button class="ctxmenu-item' + (!hasConnections ? ' disabled' : '') + '" data-action="ctx-clear-connections"><span class="codicon codicon-clear-all"></span>Clear Connections</button>';
      html += '<button class="ctxmenu-item' + (!hasLayers ? ' disabled' : '') + '" data-action="ctx-clear-canvas"><span class="codicon codicon-trash"></span>Clear Canvas</button>';
    }

    ctxMenu.innerHTML = html;
    ctxMenu.style.left = mx + 'px';
    ctxMenu.style.top = my + 'px';
    ctxMenu.style.display = 'block';

    requestAnimationFrame(function() {
      var menuRect = ctxMenu.getBoundingClientRect();
      var canvasRect = V.canvas.parentElement.getBoundingClientRect();
      var left = mx, top = my;
      if (mx + menuRect.width > canvasRect.width) left = canvasRect.width - menuRect.width - 4;
      if (my + menuRect.height > canvasRect.height) top = canvasRect.height - menuRect.height - 4;
      ctxMenu.style.left = Math.max(0, left) + 'px';
      ctxMenu.style.top = Math.max(0, top) + 'px';
    });

    ctxMenu._worldPos = V.screenToWorld(mx, my);
    if (neuron) ctxMenu._neuronId = neuron.id;

    ctxMenu.querySelectorAll('.ctxmenu-item:not(.disabled)').forEach(function(btn) {
      btn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        handleContextMenuAction(btn.dataset.action, btn.dataset.id);
        hideContextMenu();
      });
    });
  }

  function handleContextMenuAction(action, id) {
    if (action === 'ctx-add-layer') {
      V.saveState();
      var pos = ctxMenu._worldPos || { x: 0, y: 0 };
      var count = V.network.getAllLayers().length;
      var activations = ['relu', 'sigmoid', 'tanh', 'softmax', 'linear'];
      var layer = V.network.createLayer({ name: count === 0 ? 'Input' : 'Layer ' + (count + 1), type: 'dense', activation: activations[count % activations.length], position: { x: pos.x, y: pos.y } });
      V.selectedLayerIds.clear(); V.selectedNeuronIds.clear(); V.selectedLayerIds.add(layer.id); V.render();
    } else if (action === 'ctx-add-neuron-sel') {
      if (V.selectedLayerIds.size > 0) {
        var layerId = V.selectedLayerIds.values().next().value;
        var layer = V.network.getLayer(layerId);
        if (layer) { V.saveState(); V.network.createNeuron({ layerId: layerId }); V.layoutLayerNeurons(layer); V.render(); }
      }
    } else if (action === 'ctx-add-neuron-to') {
      var layer = V.network.getLayer(id);
      if (layer) { V.saveState(); V.network.createNeuron({ layerId: id }); V.layoutLayerNeurons(layer); V.render(); }
    } else if (action === 'ctx-rename') {
      openRenameModal(id);
    } else if (action === 'ctx-duplicate') {
      var srcLayer = V.network.getLayer(id);
      if (srcLayer) {
        V.saveState();
        var srcN = V.network.getNeuronsByLayer(srcLayer.id);
        var newL = V.network.createLayer({ name: srcLayer.name + ' (copy)', type: srcLayer.type, activation: srcLayer.activation, position: { x: srcLayer.position.x + 200, y: srcLayer.position.y }, style: Object.assign({}, srcLayer.style) });
        srcN.forEach(function() { V.network.createNeuron({ layerId: newL.id }); });
        V.layoutLayerNeurons(newL);
        V.selectedLayerIds.clear(); V.selectedNeuronIds.clear(); V.selectedLayerIds.add(newL.id); V.render();
      }
    } else if (action === 'ctx-remove-layer') {
      V.saveState(); V.network.deleteLayer(id); V.selectedLayerIds.delete(id); V.render();
    } else if (action === 'ctx-remove-neuron') {
      V.saveState(); V.network.deleteNeuron(id); V.selectedNeuronIds.delete(id);
      V.network.getAllLayers().forEach(function(l) { V.layoutLayerNeurons(l); }); V.render();
    } else if (action === 'ctx-connect') {
      V.isConnecting = true; V.connectFrom = ctxMenu._neuronId; V.render();
    } else if (action === 'ctx-auto-connect') {
      document.getElementById('btn-auto-connect').click();
    } else if (action === 'ctx-auto-layout') {
      V.autoLayout();
    } else if (action === 'ctx-clear-connections') {
      V.saveState(); V.network.getAllConnections().forEach(function(conn) { V.network.deleteConnection(conn.id); }); V.render();
    } else if (action === 'ctx-clear-canvas') {
      V.saveState(); V.network.getAllLayers().forEach(function(l) { V.network.deleteLayer(l.id); });
      V.selectedLayerIds.clear(); V.selectedNeuronIds.clear(); V.notes = []; V.render();
    }
  }

  // --- handleMenuAction ---
  function handleMenuAction(action) {
    switch (action) {
      case 'menu-new-network':
        if (V.network.getAllLayers().length === 0) {
          doNewNetwork();
        } else {
          showConfirmModal('New Network', 'Clear current network and start new?', doNewNetwork);
        }
        break;

      case 'menu-export-json': {
        var data = {
          layers: V.network.getAllLayers().map(function(l) {
            return { id: l.id, name: l.name, type: l.type, activation: l.activation, position: l.position, style: l.style,
              neurons: V.network.getNeuronsByLayer(l.id).map(function(n) { return { id: n.id, bias: n.bias }; }) };
          }),
          connections: V.network.getAllConnections().map(function(c) {
            return { fromNeuron: c.fromNeuron, toNeuron: c.toNeuron, fromLayer: c.fromLayer, toLayer: c.toLayer, weight: c.weight };
          })
        };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'vnns-topology.json';
        a.click();
        URL.revokeObjectURL(a.href);
        break;
      }

      case 'menu-import-json':
        document.getElementById('import-json-input').click();
        break;

      case 'menu-export-png': {
        var link = document.createElement('a');
        link.download = 'vnns-network.png';
        link.href = V.canvas.toDataURL('image/png');
        link.click();
        break;
      }

      case 'menu-undo': V.history.undo(); break;
      case 'menu-redo': V.history.redo(); break;
      case 'menu-add-layer': document.querySelector('#view-create .sidebar-btn:nth-child(2)').click(); break;
      case 'menu-add-neuron': document.querySelector('#view-create .sidebar-btn:first-child').click(); break;
      case 'menu-auto-connect': document.getElementById('btn-auto-connect').click(); break;
      case 'menu-auto-layout': V.autoLayout(); break;
      case 'menu-clear-connections': document.getElementById('btn-clear-connections').click(); break;
      case 'menu-clear-canvas': document.getElementById('btn-clear-canvas').click(); break;
      case 'menu-zoom-in': document.getElementById('zoom-in').click(); break;
      case 'menu-zoom-out': document.getElementById('zoom-out').click(); break;
      case 'menu-fit-view': document.getElementById('zoom-fit').click(); break;
      case 'menu-fit-content': document.getElementById('zoom-fit-content').click(); break;
      case 'menu-toggle-grid': document.getElementById('toggle-grid').click(); break;
      case 'menu-toggle-snap': document.getElementById('toggle-snap').click(); break;
      case 'menu-toggle-minimap': document.getElementById('toggle-minimap').click(); break;
      case 'menu-toggle-weights': document.getElementById('toggle-weights').click(); break;
      case 'menu-toggle-activations': document.getElementById('toggle-activations').click(); break;
      case 'menu-toggle-theme': V.toggleTheme(); break;
      case 'menu-panel-create': V.switchPanel('create'); break;
      case 'menu-panel-dataset': V.switchPanel('dataset'); break;
      case 'menu-panel-train': V.switchPanel('train'); break;
      case 'menu-panel-predict': V.switchPanel('predict'); break;
      case 'menu-shortcuts': document.getElementById('shortcuts-modal').style.display = 'flex'; break;
      case 'menu-learn': document.getElementById('learn-modal').style.display = 'flex'; break;
      case 'menu-about': document.getElementById('about-modal').style.display = 'flex'; break;

      case 'menu-tpl-simple-classifier':
        applyTemplate({ layers: [{name:'Input',neurons:4,activation:'linear'},{name:'Hidden',neurons:8,activation:'relu'},{name:'Output',neurons:3,activation:'softmax'}], params:{optimizer:'Adam',lr:0.01,epochs:2000,batch:16,loss:'Categorical CrossEntropy'}, split:{train:80,val:10}, dataset:V.generateIrisDataset() });
        break;
      case 'menu-tpl-deep-network':
        applyTemplate({ layers: [{name:'Input',neurons:4,activation:'linear'},{name:'Hidden 1',neurons:16,activation:'relu'},{name:'Hidden 2',neurons:16,activation:'relu'},{name:'Hidden 3',neurons:8,activation:'relu'},{name:'Output',neurons:3,activation:'softmax'}], params:{optimizer:'Adam',lr:0.005,epochs:3000,batch:16,loss:'Categorical CrossEntropy'}, split:{train:70,val:15}, dataset:V.generateIrisDataset() });
        break;
      case 'menu-tpl-wide-network':
        applyTemplate({ layers: [{name:'Input',neurons:4,activation:'linear'},{name:'Hidden',neurons:32,activation:'relu'},{name:'Output',neurons:3,activation:'softmax'}], params:{optimizer:'Adam',lr:0.01,epochs:2000,batch:16,loss:'Categorical CrossEntropy'}, split:{train:80,val:10}, dataset:V.generateIrisDataset() });
        break;
      case 'menu-tpl-autoencoder':
        applyTemplate({ layers: [{name:'Input',neurons:4,activation:'linear'},{name:'Encoder',neurons:8,activation:'relu'},{name:'Latent',neurons:3,activation:'relu'},{name:'Decoder',neurons:8,activation:'relu'},{name:'Output',neurons:4,activation:'sigmoid'}], params:{optimizer:'Adam',lr:0.005,epochs:10000,batch:16,loss:'MSE'}, split:{train:80,val:10}, dataset:V.generateAutoencoderDataset() });
        break;
      case 'menu-tpl-binary-classifier':
        applyTemplate({ layers: [{name:'Input',neurons:2,activation:'linear'},{name:'Hidden',neurons:8,activation:'relu'},{name:'Output',neurons:1,activation:'sigmoid'}], params:{optimizer:'Adam',lr:0.01,epochs:5000,batch:16,loss:'Binary CrossEntropy'}, split:{train:80,val:10}, dataset:V.generateXORDataset() });
        break;
      case 'menu-tpl-regression':
        applyTemplate({ layers: [{name:'Input',neurons:1,activation:'linear'},{name:'Hidden 1',neurons:32,activation:'relu'},{name:'Hidden 2',neurons:16,activation:'relu'},{name:'Output',neurons:1,activation:'linear'}], params:{optimizer:'Adam',lr:0.003,epochs:5000,batch:16,loss:'MSE'}, split:{train:80,val:10}, dataset:V.generateRegressionDataset() });
        break;
      case 'menu-tpl-dropout':
        applyTemplate({ layers: [{name:'Input',neurons:4,activation:'linear'},{name:'Hidden 1',neurons:16,activation:'relu',dropoutRate:0.3},{name:'Hidden 2',neurons:16,activation:'relu',dropoutRate:0.3},{name:'Output',neurons:3,activation:'softmax'}], params:{optimizer:'Adam',lr:0.01,epochs:3000,batch:16,loss:'Categorical CrossEntropy'}, split:{train:70,val:15}, dataset:V.generateIrisDataset() });
        break;
      case 'menu-tpl-batch-norm':
        applyTemplate({ layers: [{name:'Input',neurons:4,activation:'linear'},{name:'Hidden 1',neurons:16,activation:'relu',useBatchNorm:true},{name:'Hidden 2',neurons:16,activation:'relu',useBatchNorm:true},{name:'Output',neurons:3,activation:'softmax'}], params:{optimizer:'Adam',lr:0.01,epochs:2000,batch:16,loss:'Categorical CrossEntropy'}, split:{train:70,val:15}, dataset:V.generateIrisDataset() });
        break;
      case 'menu-tpl-custom':
        openCustomTemplatePrompt();
        break;
    }
  }

  function doNewNetwork() {
    V.saveState();
    V.network.getAllLayers().forEach(function(l) { V.network.deleteLayer(l.id); });
    V.selectedLayerIds.clear(); V.selectedNeuronIds.clear();
    V.notes = [];
    V.viewport.x = 0; V.viewport.y = 0; V.viewport.zoom = 1;
    document.getElementById('zoom-level').textContent = '100%';
    V.history.clear();
    V.render();
  }

  // --- applyTemplate ---
  function applyTemplate(config) {
    var layerDefs = config.layers || config;
    var doApply = function() {
      V.saveState();
      V.network.getAllLayers().forEach(function(l) { V.network.deleteLayer(l.id); });
      V.selectedLayerIds.clear(); V.selectedNeuronIds.clear();
      V.notes = [];
      V.neuronActivations.clear();

      var dbSection = document.getElementById('decision-boundary-section');
      var dbCanvas = document.getElementById('decision-boundary-canvas');
      if (dbSection) dbSection.style.display = 'none';
      if (dbCanvas) { dbCanvas.getContext('2d').clearRect(0, 0, dbCanvas.width, dbCanvas.height); }

      var colors = ['#0e639c','#2a7a3a','#6a3d99','#a35200','#8b0000','#4a4a8a','#1a6e5a','#b5862a'];
      var createdLayers = [];

      layerDefs.forEach(function(def, i) {
        var layer = V.network.createLayer({ name: def.name, type: 'dense', activation: def.activation || 'relu', dropoutRate: def.dropoutRate || 0, useBatchNorm: def.useBatchNorm || false, position: { x: i * 200, y: 0 }, style: { color: colors[i % colors.length] } });
        for (var n = 0; n < def.neurons; n++) V.network.createNeuron({ layerId: layer.id });
        V.layoutLayerNeurons(layer);
        createdLayers.push(layer);
      });

      for (var i = 0; i < createdLayers.length - 1; i++) {
        var fromNeurons = V.network.getNeuronsByLayer(createdLayers[i].id);
        var toNeurons = V.network.getNeuronsByLayer(createdLayers[i + 1].id);
        fromNeurons.forEach(function(fn) {
          toNeurons.forEach(function(tn) {
            V.network.createConnection({ fromNeuron: fn.id, toNeuron: tn.id, fromLayer: createdLayers[i].id, toLayer: createdLayers[i + 1].id });
          });
        });
      }

      V.autoLayout();
      V.viewport.x = 0; V.viewport.y = 0; V.viewport.zoom = 1;
      document.getElementById('zoom-level').textContent = '100%';
      V.history.clear();
      V.render();

      if (config.dataset) {
        var ds = config.dataset;
        V.dataset = { headers: ds.headers, rows: ds.rows, columns: [] };
        V.buildDataset();
        if (ds.roles) ds.roles.forEach(function(role, i) { if (V.dataset.columns[i]) V.dataset.columns[i].role = role; });
        if (ds.normalizations) ds.normalizations.forEach(function(norm, i) { if (V.dataset.columns[i]) V.dataset.columns[i].normalization = norm; });
        V.renderColumns();
        V.logOutput('Dataset loaded — ' + ds.rows.length + ' rows, ' + ds.headers.length + ' columns', 'info');
      }

      if (config.params) {
        var p = config.params;
        if (p.optimizer) document.getElementById('optimizer-select').value = p.optimizer;
        if (p.lr) { document.getElementById('lr-slider').value = p.lr; document.getElementById('lr-value').textContent = p.lr.toFixed(6); document.getElementById('lr-input').value = p.lr.toFixed(6); }
        if (p.epochs) { document.getElementById('epochs-slider').value = p.epochs; document.getElementById('epochs-value').textContent = p.epochs.toLocaleString(); document.getElementById('epochs-input').value = p.epochs; }
        if (p.batch) { document.getElementById('batch-slider').value = p.batch; document.getElementById('batch-value').textContent = p.batch; document.getElementById('batch-input').value = p.batch; }
        if (p.loss) document.getElementById('loss-select').value = p.loss;
      }

      if (config.split) {
        document.getElementById('split-train').value = config.split.train;
        document.getElementById('split-val').value = config.split.val;
        V.updateSplit();
      }

      var totalNeurons = createdLayers.reduce(function(sum, l) { return sum + V.network.getNeuronsByLayer(l.id).length; }, 0);
      V.logOutput('Template applied: ' + layerDefs.map(function(d) { return d.neurons; }).join(' → ') + ' (' + createdLayers.length + ' layers, ' + totalNeurons + ' neurons)', 'success');
      if (config.params) {
        V.logOutput('Training config: ' + config.params.optimizer + ', LR=' + config.params.lr + ', Epochs=' + config.params.epochs + ', Batch=' + config.params.batch + ', Loss=' + config.params.loss, 'info');
      }
    };

    if (V.network.getAllLayers().length > 0) {
      showConfirmModal('Apply Template', 'This will replace the current network. Continue?', doApply);
    } else {
      doApply();
    }
  }

  function openCustomTemplatePrompt() {
    var input = prompt('Enter layer sizes separated by commas.\nExample: 4, 16, 8, 3\n(First = input, last = output, middle = hidden with ReLU)');
    if (!input) return;
    var sizes = input.split(',').map(function(s) { return parseInt(s.trim()); }).filter(function(n) { return !isNaN(n) && n >= 1; });
    if (sizes.length < 2) { alert('Need at least 2 layers (input + output).'); return; }
    if (sizes.some(function(s) { return s > 256; })) { alert('Max 256 neurons per layer.'); return; }

    var layerDefs = sizes.map(function(n, i) {
      var name, activation;
      if (i === 0) { name = 'Input'; activation = 'linear'; }
      else if (i === sizes.length - 1) { name = 'Output'; activation = n > 1 ? 'softmax' : 'sigmoid'; }
      else { name = 'Hidden ' + i; activation = 'relu'; }
      return { name: name, neurons: n, activation: activation };
    });

    applyTemplate({ layers: layerDefs, params: { optimizer: 'Adam', lr: 0.01, epochs: 2000, batch: 16, loss: sizes[sizes.length - 1] > 1 ? 'Categorical CrossEntropy' : 'Binary CrossEntropy' }, split: { train: 80, val: 10 } });
  }

  // --- Init ---
  function init() {
    // Rename modal
    document.getElementById('rename-confirm').addEventListener('click', confirmRename);
    document.getElementById('rename-cancel').addEventListener('click', closeRenameModal);
    document.getElementById('rename-modal-close').addEventListener('click', closeRenameModal);
    renameModal.querySelector('.modal-overlay').addEventListener('click', closeRenameModal);
    renameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') confirmRename();
      if (e.key === 'Escape') closeRenameModal();
    });

    // Context toolbar
    ctxToolsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (ctxDropdown.style.display === 'none') { buildDropdownItems(); ctxDropdown.style.display = 'block'; }
      else { ctxDropdown.style.display = 'none'; }
    });

    document.addEventListener('mousedown', function(e) {
      if (ctxJustShown) return;
      if (ctxToolbar.style.display !== 'none' && !ctxToolbar.contains(e.target)) hideContextToolbar();
    });

    // Context menu close
    document.addEventListener('mousedown', function(e) {
      if (ctxMenu.style.display !== 'none' && !ctxMenu.contains(e.target)) hideContextMenu();
    });

    // Canvas right-click
    V.canvas.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      var rect = V.canvas.getBoundingClientRect();
      showContextMenu(e.clientX - rect.left, e.clientY - rect.top);
    });

    // Import JSON
    var importJsonInput = document.getElementById('import-json-input');
    importJsonInput.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        try {
          var data = JSON.parse(ev.target.result);
          V.network.getAllLayers().forEach(function(l) { V.network.deleteLayer(l.id); });
          V.selectedLayerIds.clear(); V.selectedNeuronIds.clear();
          (data.layers || []).forEach(function(ld) {
            var layer = V.network.createLayer({ id: ld.id, name: ld.name, type: ld.type, activation: ld.activation, position: ld.position, style: ld.style || {} });
            (ld.neurons || []).forEach(function(nd) { V.network.createNeuron({ id: nd.id, layerId: layer.id, bias: nd.bias || 0 }); });
            V.layoutLayerNeurons(layer);
          });
          (data.connections || []).forEach(function(cd) {
            V.network.createConnection({ fromNeuron: cd.fromNeuron, toNeuron: cd.toNeuron, fromLayer: cd.fromLayer, toLayer: cd.toLayer, weight: cd.weight || 0 });
          });
          V.render();
        } catch (err) { alert('Failed to import: ' + err.message); }
      };
      reader.readAsText(file);
      importJsonInput.value = '';
    });

    // Info modals close handlers
    ['shortcuts-modal', 'about-modal', 'learn-modal'].forEach(function(id) {
      var modal = document.getElementById(id);
      modal.querySelector('.modal-close').addEventListener('click', function() { modal.style.display = 'none'; });
      modal.querySelector('.modal-overlay').addEventListener('click', function() { modal.style.display = 'none'; });
    });

    // Learn modal navigation
    var learnModal = document.getElementById('learn-modal');
    learnModal.querySelectorAll('.learn-nav-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var active = learnModal.querySelector('.learn-nav-item.active');
        if (active) active.classList.remove('active');
        var activeTopic = learnModal.querySelector('.learn-topic.active');
        if (activeTopic) activeTopic.classList.remove('active');
        btn.classList.add('active');
        var topic = document.getElementById('learn-topic-' + btn.dataset.topic);
        if (topic) topic.classList.add('active');
        document.getElementById('learn-content').scrollTop = 0;
      });
    });

    // Menubar dropdown items
    document.querySelectorAll('.menu-dropdown-item').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var menuItems = document.querySelectorAll('.menubar .menu-item');
        menuItems.forEach(function(m) { m.classList.remove('active'); });
        if (btn.dataset.action) handleMenuAction(btn.dataset.action);
      });
    });
  }

  // --- Exports ---
  V.updatePropertiesPanel = updatePropertiesPanel;
  V.updateContextToolbarPosition = updateContextToolbarPosition;
  V.showContextToolbar = showContextToolbar;
  V.hideContextToolbar = hideContextToolbar;
  V.handleMenuAction = handleMenuAction;
  V.showConfirmModal = showConfirmModal;
  V.openRenameModal = openRenameModal;
  V.applyTemplate = applyTemplate;
  V.resetPropsKey = function() { _lastPropsKey = ''; };
  V.initUI = init;

})(window.VNNS);
