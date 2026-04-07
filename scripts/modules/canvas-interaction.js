(() => {
  window.VNNSModules = window.VNNSModules || {};

  window.VNNSModules.createCanvasInteraction = function createCanvasInteraction(deps) {
    const {
      canvas,
      network,
      viewport,
      neuronActivations,
      selectedLayerIds,
      selectedNeuronIds,
      refs,
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
    } = deps;

    // --- Tooltip ---
    const tooltipEl = document.getElementById('canvas-tooltip');

    function updateTooltip() {
      if (refs.isDragging || refs.isPanning || refs.isConnecting) {
        tooltipEl.style.display = 'none';
        return;
      }

      let html = '';

      if (refs.hoverNeuronId) {
        const neuron = network.getNeuron(refs.hoverNeuronId);
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
      } else if (refs.hoverLayerId) {
        const layer = network.getLayer(refs.hoverLayerId);
        if (layer) {
          const neurons = network.getNeuronsByLayer(layer.id);
          html = `<div class="tt-title">${layer.name}</div>`;
          html += `<div class="tt-row"><span class="tt-label">Neurons</span><span class="tt-value">${neurons.length}</span></div>`;
          html += `<div class="tt-row"><span class="tt-label">Activation</span><span class="tt-value">${layer.activation || 'linear'}</span></div>`;
          html += `<div class="tt-row"><span class="tt-label">Bias</span><span class="tt-value">${layer.useBias !== false ? 'Yes' : 'No'}</span></div>`;
          html += `<div class="tt-row"><span class="tt-label">Init</span><span class="tt-value">${layer.weightInit || 'xavier'}</span></div>`;
        }
      } else if (refs.hoverConnection) {
        const w = refs.hoverConnection.weight || 0;
        const cls = w >= 0 ? 'positive' : 'negative';
        const fromN = network.getNeuron(refs.hoverConnection.fromNeuron);
        const toN = network.getNeuron(refs.hoverConnection.toNeuron);
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
      let tx = refs.tooltipMouseX - canvasRect.left + 14;
      let ty = refs.tooltipMouseY - canvasRect.top + 14;
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
      refs.hoverNeuronId = null;
      refs.hoverLayerId = null;
      refs.hoverConnection = null;
      tooltipEl.style.display = 'none';
    });

    canvas.addEventListener('mousedown', (e) => {
      tooltipEl.style.display = 'none';
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        refs.isPanning = true;
        refs.panStart = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
        canvas.classList.add('panning');
        e.preventDefault();
        return;
      }

      if (e.button === 0) {
        const neuron = hitTestNeuron(mx, my);
        
        if (refs.isConnecting && refs.connectFrom) {
          if (neuron && neuron.id !== refs.connectFrom) {
            const fromNeuron = network.getNeuron(refs.connectFrom);
            if (fromNeuron.layerId !== neuron.layerId) {
              saveState();
              network.createConnection({
                fromNeuron: refs.connectFrom,
                toNeuron: neuron.id,
                fromLayer: fromNeuron.layerId,
                toLayer: neuron.layerId
              });
            }
          }
          refs.isConnecting = false;
          refs.connectFrom = null;
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
          refs.isDragging = true;
          refs.dragMoved = false;
          refs.dragTarget = { type: 'neuron', id: neuron.id, originalLayerId: neuron.layerId };
          refs.dragOffset = { x: neuron.position.x - screenToWorld(mx, my).x, y: neuron.position.y - screenToWorld(mx, my).y };
          render();
          return;
        }

        const layer = hitTestLayer(mx, my);
        if (layer) {
          selectedNeuronIds.clear();
          selectedLayerIds.clear();
          selectedLayerIds.add(layer.id);
          refs.isDragging = true;
          refs.dragMoved = false;
          refs.dragTarget = { type: 'layer', id: layer.id };
          refs.dragOffset = { x: layer.position.x - screenToWorld(mx, my).x, y: layer.position.y - screenToWorld(mx, my).y };
          render();
          return;
        }

        selectedNeuronIds.clear();
        selectedLayerIds.clear();
        hideContextToolbar();
        refs.isPanning = true;
        refs.panStart = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
        canvas.classList.add('panning');
        render();
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      refs.mouseWorldPos = screenToWorld(mx, my);

      refs.hoverNeuronId = null;
      refs.hoverLayerId = null;
      refs.hoverConnection = null;
      refs.tooltipMouseX = e.clientX;
      refs.tooltipMouseY = e.clientY;
      const neuron = hitTestNeuron(mx, my);
      if (neuron) {
        refs.hoverNeuronId = neuron.id;
      } else {
        const layer = hitTestLayer(mx, my);
        if (layer) {
          refs.hoverLayerId = layer.id;
        } else {
          refs.hoverConnection = hitTestConnection(mx, my, 6);
        }
      }
      updateTooltip();

      if (refs.isConnecting) {
        render();
        return;
      }

      if (refs.isDragging && refs.dragTarget) {
        refs.dragMoved = true;
        const world = screenToWorld(mx, my);
        
        if (refs.dragTarget.type === 'neuron') {
          refs.dropTargetLayerId = null;
          
          const hoveredNeuron = hitTestNeuron(mx, my, refs.dragTarget.id);
          if (!hoveredNeuron) {
            const hoveredLayer = hitTestLayer(mx, my);
            if (hoveredLayer && hoveredLayer.id !== refs.dragTarget.originalLayerId) {
              refs.dropTargetLayerId = hoveredLayer.id;
            }
          }

          const n = network.getNeuron(refs.dragTarget.id);
          if (n) {
            n.position.x = world.x + refs.dragOffset.x;
            n.position.y = world.y + refs.dragOffset.y;
          }
        }
        else if (refs.dragTarget.type === 'layer') {
          const layer = network.getLayer(refs.dragTarget.id);
          if (layer) {
            layer.position.x = world.x + refs.dragOffset.x;
            layer.position.y = world.y + refs.dragOffset.y;
            layoutLayerNeurons(layer);
          }
        }
        
        render();
        return;
      }

      if (refs.isPanning) {
        viewport.x = e.clientX - refs.panStart.x;
        viewport.y = e.clientY - refs.panStart.y;
        render();
      }
    });

    window.addEventListener('mouseup', () => {
      if (refs.isDragging && refs.dragTarget && refs.dragTarget.type === 'neuron' && refs.dropTargetLayerId) {
        const neuron = network.getNeuron(refs.dragTarget.id);
        if (neuron && neuron.layerId !== refs.dropTargetLayerId) {
          saveState();
          network.updateNeuron(refs.dragTarget.id, { layerId: refs.dropTargetLayerId });

          // Remove connections that became same-layer after move
          const conns = network.getConnectionsByNeuron(refs.dragTarget.id);
          conns.forEach(conn => {
            const from = network.getNeuron(conn.fromNeuron);
            const to = network.getNeuron(conn.toNeuron);
            if (from && to && from.layerId === to.layerId) {
              network.deleteConnection(conn.id);
            }
          });
          
          const oldLayer = network.getLayer(refs.dragTarget.originalLayerId);
          const newLayer = network.getLayer(refs.dropTargetLayerId);
          if (oldLayer) layoutLayerNeurons(oldLayer);
          if (newLayer) layoutLayerNeurons(newLayer);
        }
        refs.dropTargetLayerId = null;
        render();
      } else if (refs.isDragging && refs.dragTarget && refs.dragTarget.type === 'neuron') {
        const oldLayer = network.getLayer(refs.dragTarget.originalLayerId);
        if (oldLayer) layoutLayerNeurons(oldLayer);
        render();
      }

      if (refs.isDragging && refs.dragTarget && refs.dragTarget.type === 'layer') {
        const layer = network.getLayer(refs.dragTarget.id);
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

      if (refs.isDragging) {
        // Show context toolbar if it was a click (not a drag)
        if (!refs.dragMoved && refs.dragTarget) {
          showContextToolbar(refs.dragTarget);
        }
        if (refs.dragMoved) _lastPropsKey = '';
        refs.isDragging = false;
        refs.dragTarget = null;
        refs.dragMoved = false;
      }
      if (refs.isPanning) {
        refs.isPanning = false;
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



    return {
      renderMinimap,
      updatePropertiesPanel,
      minimapContainer,
      setMinimapVisible: (v) => { minimapVisible = v; },
      getMinimapVisible: () => minimapVisible
    };
  };
})();
