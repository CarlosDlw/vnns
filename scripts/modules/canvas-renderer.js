(() => {
  window.VNNSModules = window.VNNSModules || {};

  window.VNNSModules.createCanvasRenderer = function createCanvasRenderer(deps) {
    const {
      canvas,
      ctx,
      network,
      viewport,
      getDropTargetLayerId,
      selectedLayerIds,
      selectedNeuronIds,
      isDraggingRef,
      dragTargetRef,
      isConnectingRef,
      connectFromRef,
      mouseWorldPosRef,
      neuronActivations,
      notesRef,
      ctxTargetRef,
      updateContextToolbarPosition,
      renderMinimap,
      updatePropertiesPanel
    } = deps;

    let dropTargetLayerId = null;
    let isDragging = false;
    let dragTarget = null;
    let isConnecting = false;
    let connectFrom = null;
    let mouseWorldPos = { x: 0, y: 0 };
    let notes = [];
    let ctxTarget = null;

    function syncRefs() {
      dropTargetLayerId = getDropTargetLayerId();
      isDragging = isDraggingRef();
      dragTarget = dragTargetRef();
      isConnecting = isConnectingRef();
      connectFrom = connectFromRef();
      mouseWorldPos = mouseWorldPosRef();
      notes = notesRef();
      ctxTarget = ctxTargetRef();
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
      syncRefs();
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
      syncRefs();
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
      syncRefs();
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
      syncRefs();
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
      syncRefs();
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



    return {
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
    };
  };
})();
