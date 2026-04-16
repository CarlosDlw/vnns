/**
 * VNNS Canvas Renderer
 * Grid, layers, neurons, connections, minimap, tooltip, hit testing, render loop.
 */
(function(V) {
  'use strict';

  // --- Hit Testing ---
  function hitTestLayer(mx, my) {
    var layers = V.network.getAllLayers();
    for (var i = layers.length - 1; i >= 0; i--) {
      var r = V.getLayerScreenRect(layers[i]);
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return layers[i];
    }
    return null;
  }

  function hitTestNeuron(mx, my, excludeId) {
    var neurons = V.network.getAllNeurons();
    for (var i = neurons.length - 1; i >= 0; i--) {
      if (excludeId && neurons[i].id === excludeId) continue;
      var pos = V.getNeuronScreenPos(neurons[i]);
      var r = V.NEURON_RADIUS * V.viewport.zoom;
      var dx = mx - pos.x;
      var dy = my - pos.y;
      if (dx * dx + dy * dy <= r * r) return neurons[i];
    }
    return null;
  }

  function hitTestConnection(mx, my, threshold) {
    threshold = threshold || 5;
    var connections = V.network.getAllConnections();
    var closest = null;
    var closestDist = threshold;
    for (var i = 0; i < connections.length; i++) {
      var conn = connections[i];
      var from = V.network.getNeuron(conn.fromNeuron);
      var to = V.network.getNeuron(conn.toNeuron);
      if (!from || !to) continue;
      var p1 = V.getNeuronScreenPos(from);
      var p2 = V.getNeuronScreenPos(to);
      var dx = p2.x - p1.x;
      var dy = p2.y - p1.y;
      var lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;
      var t = ((mx - p1.x) * dx + (my - p1.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      var px = p1.x + t * dx;
      var py = p1.y + t * dy;
      var dist = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
      if (dist < closestDist) {
        closestDist = dist;
        closest = conn;
      }
    }
    return closest;
  }

  // --- Drawing Helpers ---
  function traceConnectionCurve(context, p1, p2) {
    var dx = p2.x - p1.x;
    var direction = dx >= 0 ? 1 : -1;
    var handle = Math.min(180, Math.max(36, Math.abs(dx) * 0.45));
    context.moveTo(p1.x, p1.y);
    context.bezierCurveTo(p1.x + handle * direction, p1.y, p2.x - handle * direction, p2.y, p2.x, p2.y);
  }

  function drawGrid() {
    var viewport = V.viewport;
    var ctx = V.ctx;
    var canvas = V.canvas;
    if (!viewport.showGrid) return;
    var rect = canvas.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;
    var gs = viewport.gridSize * viewport.zoom;
    if (gs < 6) return;

    var offsetX = (viewport.x + w / 2) % gs;
    var offsetY = (viewport.y + h / 2) % gs;

    ctx.strokeStyle = V.isLightTheme()
      ? (viewport.zoom > 1.5 ? 'rgba(0,0,0,0.07)' : 'rgba(0,0,0,0.04)')
      : (viewport.zoom > 1.5 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)');
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = offsetX; x < w; x += gs) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
    }
    for (var y = offsetY; y < h; y += gs) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
    }
    ctx.stroke();

    if (viewport.zoom > 0.8) {
      var bigGs = gs * 5;
      var bigOffsetX = (viewport.x + w / 2) % bigGs;
      var bigOffsetY = (viewport.y + h / 2) % bigGs;
      ctx.strokeStyle = V.isLightTheme() ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      for (var bx = bigOffsetX; bx < w; bx += bigGs) {
        ctx.moveTo(Math.round(bx) + 0.5, 0);
        ctx.lineTo(Math.round(bx) + 0.5, h);
      }
      for (var by = bigOffsetY; by < h; by += bigGs) {
        ctx.moveTo(0, Math.round(by) + 0.5);
        ctx.lineTo(w, Math.round(by) + 0.5);
      }
      ctx.stroke();
    }
  }

  function drawLayerBox(layer, color, isSelected) {
    var ctx = V.ctx;
    var viewport = V.viewport;
    var r = V.getLayerScreenRect(layer);
    var light = V.isLightTheme();
    var isDrop = layer.id === V.dropTargetLayerId;

    ctx.fillStyle = isDrop ? 'rgba(79, 193, 255, 0.15)' :
      isSelected ? (light ? 'rgba(37, 99, 235, 0.12)' : 'rgba(79, 193, 255, 0.08)') :
      light ? 'rgba(255, 255, 255, 0.7)' : 'rgba(30, 30, 30, 0.6)';
    ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.strokeStyle = isDrop ? '#00bfff' :
      isSelected ? (light ? '#2563eb' : '#4fc1ff') : color;
    ctx.lineWidth = isDrop ? 3 : (isSelected ? 2 : 1);
    ctx.setLineDash([]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);

    if (viewport.zoom > 0.3) {
      ctx.fillStyle = light ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255,255,255,0.6)';
      ctx.font = Math.max(8, 10 * viewport.zoom) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(layer.name, r.cx, r.y + 4);

      var neurons = V.network.getNeuronsByLayer(layer.id);
      var act = (layer.activation || 'linear').replace(/relu/i, 'ReLU').replace(/sigmoid/i, 'σ').replace(/tanh/i, 'tanh').replace(/softmax/i, 'SM').replace(/leakyrelu/i, 'LReLU').replace(/linear/i, 'Lin').replace(/elu/i, 'ELU').replace(/gelu/i, 'GELU').replace(/swish/i, 'Swish');
      var badgeText = neurons.length + 'n · ' + act;
      if (layer.useBatchNorm) badgeText += ' · BN';
      if (layer.dropoutRate > 0) badgeText += ' · D' + Math.round(layer.dropoutRate * 100) + '%';
      var badgeFontSize = Math.max(7, 8 * viewport.zoom);
      ctx.font = badgeFontSize + 'px -apple-system, sans-serif';
      ctx.fillStyle = light ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255,255,255,0.35)';
      ctx.textBaseline = 'bottom';
      ctx.fillText(badgeText, r.cx, r.y + r.h - 3);
    } else if (viewport.zoom < 0.25) {
      var neurons2 = V.network.getNeuronsByLayer(layer.id);
      var fontSize = Math.max(10, 14 * viewport.zoom / 0.25);
      ctx.fillStyle = light ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255,255,255,0.85)';
      ctx.font = 'bold ' + fontSize + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(layer.name, r.cx, r.cy - fontSize * 0.5);
      ctx.font = (fontSize * 0.8) + 'px -apple-system, sans-serif';
      ctx.fillStyle = light ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255,255,255,0.5)';
      ctx.fillText(neurons2.length + ' neurons', r.cx, r.cy + fontSize * 0.5);
    }
  }

  function drawLayerArrows() {
    var ctx = V.ctx;
    var viewport = V.viewport;
    var layers = V.network.getAllLayers();
    if (layers.length < 2) return;
    var sorted = [].concat(layers).sort(function(a, b) { return a.position.x - b.position.x; });
    var connections = V.network.getAllConnections();
    var pairCounts = {};
    connections.forEach(function(conn) {
      var key = conn.fromLayer + '→' + conn.toLayer;
      pairCounts[key] = (pairCounts[key] || 0) + 1;
    });

    for (var i = 0; i < sorted.length; i++) {
      for (var j = i + 1; j < sorted.length; j++) {
        var key = sorted[i].id + '→' + sorted[j].id;
        var keyRev = sorted[j].id + '→' + sorted[i].id;
        var count = (pairCounts[key] || 0) + (pairCounts[keyRev] || 0);
        if (count === 0) continue;

        var r1 = V.getLayerScreenRect(sorted[i]);
        var r2 = V.getLayerScreenRect(sorted[j]);
        var startX = r1.x + r1.w;
        var startY = r1.cy;
        var endX = r2.x;
        var endY = r2.cy;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = 'rgba(79, 193, 255, 0.4)';
        ctx.lineWidth = Math.max(2, 4 * viewport.zoom / 0.25);
        ctx.stroke();

        var angle = Math.atan2(endY - startY, endX - startX);
        var headLen = Math.max(6, 10 * viewport.zoom / 0.25);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headLen * Math.cos(angle - 0.4), endY - headLen * Math.sin(angle - 0.4));
        ctx.lineTo(endX - headLen * Math.cos(angle + 0.4), endY - headLen * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = 'rgba(79, 193, 255, 0.5)';
        ctx.fill();

        var midX = (startX + endX) / 2;
        var midY = (startY + endY) / 2;
        var fontSize2 = Math.max(8, 11 * viewport.zoom / 0.25);
        ctx.font = fontSize2 + 'px -apple-system, sans-serif';
        ctx.fillStyle = V.isLightTheme() ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('' + count, midX, midY - 3);
      }
    }
  }

  function drawLayers() {
    var layers = V.network.getAllLayers();
    layers.forEach(function(layer, li) {
      var color = layer.style.color || V.LAYER_COLORS[li % V.LAYER_COLORS.length];
      var isSelected = V.selectedLayerIds.has(layer.id);
      drawLayerBox(layer, color, isSelected);
    });
    if (V.viewport.zoom < 0.25) drawLayerArrows();
  }

  // Dropout visual mask — regenerates periodically during training
  var _dropoutMaskCache = {};
  var _dropoutMaskTime = 0;
  var DROPOUT_MASK_INTERVAL = 500; // ms

  function isNeuronDropped(neuronId, layerId, dropoutRate) {
    var now = Date.now();
    if (now - _dropoutMaskTime > DROPOUT_MASK_INTERVAL) {
      _dropoutMaskCache = {};
      _dropoutMaskTime = now;
    }
    if (_dropoutMaskCache[neuronId] !== undefined) return _dropoutMaskCache[neuronId];
    var dropped = Math.random() < dropoutRate;
    _dropoutMaskCache[neuronId] = dropped;
    return dropped;
  }

  function drawNeurons() {
    var viewport = V.viewport;
    var ctx = V.ctx;
    if (viewport.zoom < 0.25) return;

    var neurons = V.network.getAllNeurons();
    var layers = V.network.getAllLayers();
    var isCollapsed = viewport.zoom < 0.5;
    var isTraining = V.trainingState && V.trainingState.running && !V.trainingState.paused;

    neurons.forEach(function(neuron) {
      var pos = V.getNeuronScreenPos(neuron);
      var layerIdx = layers.findIndex(function(l) { return l.id === neuron.layerId; });
      var layer = layers[layerIdx];
      var color = (layer && layer.style.color) || V.LAYER_COLORS[layerIdx % V.LAYER_COLORS.length];
      var r = V.NEURON_RADIUS * viewport.zoom;
      var isSelected = V.selectedNeuronIds.has(neuron.id);
      var isDraggingThis = V.isDragging && V.dragTarget && V.dragTarget.id === neuron.id;

      if (isCollapsed) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#4fc1ff' : color;
        ctx.fill();
        return;
      }

      var fillColor = isSelected ? '#4fc1ff' : color;
      var glowColor = null;
      if (viewport.showActivations && V.neuronActivations.has(neuron.id) && !isSelected) {
        var act = V.neuronActivations.get(neuron.id);
        var norm = act >= 0 && act <= 1 ? act : 1 / (1 + Math.exp(-act));
        var r255 = Math.round(40 + norm * 215);
        var g255 = Math.round(40 + norm * 200);
        var b255 = Math.round(60 - norm * 30);
        fillColor = 'rgb(' + r255 + ', ' + g255 + ', ' + b255 + ')';
        if (norm > 0.5) {
          glowColor = 'rgba(' + r255 + ', ' + g255 + ', ' + b255 + ', ' + (0.3 + norm * 0.4) + ')';
        }
      }

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
      ctx.strokeStyle = isSelected ? (V.isLightTheme() ? '#1d4ed8' : '#ffffff') : (V.isLightTheme() ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)');
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
        var labelColor = V.isLightTheme() ? '#0f172a' : '#ffffff';
        if (viewport.showActivations && V.neuronActivations.has(neuron.id) && !isSelected) {
          var act2 = V.neuronActivations.get(neuron.id);
          var norm2 = act2 >= 0 && act2 <= 1 ? act2 : 1 / (1 + Math.exp(-act2));
          var lr = Math.round(40 + norm2 * 215);
          var lg = Math.round(40 + norm2 * 200);
          var lb = Math.round(60 - norm2 * 30);
          var lum = (0.299 * lr + 0.587 * lg + 0.114 * lb) / 255;
          labelColor = lum > 0.5 ? '#0f172a' : '#ffffff';
        }
        ctx.fillStyle = labelColor;
        ctx.font = Math.max(8, 9 * viewport.zoom) + 'px Consolas, Monaco, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var idx = V.network.getNeuronsByLayer(neuron.layerId).findIndex(function(n) { return n.id === neuron.id; });
        ctx.fillText('N' + idx, pos.x, pos.y);
      }

      // Dropout visual overlay
      if (isTraining && layer && layer.dropoutRate > 0 && !isCollapsed) {
        if (isNeuronDropped(neuron.id, neuron.layerId, layer.dropoutRate)) {
          // Dim overlay
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.fillStyle = V.isLightTheme() ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)';
          ctx.fill();
          // X mark
          var xr = r * 0.55;
          ctx.beginPath();
          ctx.moveTo(pos.x - xr, pos.y - xr);
          ctx.lineTo(pos.x + xr, pos.y + xr);
          ctx.moveTo(pos.x + xr, pos.y - xr);
          ctx.lineTo(pos.x - xr, pos.y + xr);
          ctx.strokeStyle = '#ff4444';
          ctx.lineWidth = Math.max(1.5, 2 * viewport.zoom);
          ctx.stroke();
        }
      }
    });
  }

  function drawConnections() {
    var viewport = V.viewport;
    var ctx = V.ctx;
    if (viewport.zoom < 0.25) return;

    var connections = V.network.getAllConnections();
    var showWeights = viewport.showWeights;
    var isCollapsed = viewport.zoom < 0.5;

    var maxAbsWeight = 0;
    if (showWeights) {
      connections.forEach(function(conn) {
        var abs = Math.abs(conn.weight || 0);
        if (abs > maxAbsWeight) maxAbsWeight = abs;
      });
      if (maxAbsWeight === 0) maxAbsWeight = 1;
    }

    connections.forEach(function(conn) {
      var from = V.network.getNeuron(conn.fromNeuron);
      var to = V.network.getNeuron(conn.toNeuron);
      if (!from || !to) return;

      var p1 = V.getNeuronScreenPos(from);
      var p2 = V.getNeuronScreenPos(to);

      ctx.beginPath();
      traceConnectionCurve(ctx, p1, p2);
      var isSelected = V.selectedNeuronIds.has(conn.fromNeuron) ||
        V.selectedNeuronIds.has(conn.toNeuron) ||
        (V.selectedLayerIds.has(conn.fromLayer) && V.selectedLayerIds.has(conn.toLayer));

      if (showWeights && !isSelected && !isCollapsed) {
        var w = conn.weight || 0;
        var wNorm = Math.abs(w) / maxAbsWeight;
        var alpha = 0.15 + wNorm * 0.75;
        var thickness = (0.5 + wNorm * 3.5) * viewport.zoom;
        ctx.strokeStyle = w >= 0
          ? 'rgba(79, 193, 255, ' + alpha + ')'
          : 'rgba(255, 100, 100, ' + alpha + ')';
        ctx.lineWidth = thickness;
      } else {
        var baseAlpha = isCollapsed ? 0.1 : 0.25;
        ctx.strokeStyle = isSelected ? '#4fc1ff' : 'rgba(79, 193, 255, ' + baseAlpha + ')';
        ctx.lineWidth = (isSelected ? 2 : (isCollapsed ? 0.5 : 1)) * viewport.zoom;
      }
      ctx.stroke();
    });

    if (V.isConnecting && V.connectFrom) {
      var fromN = V.network.getNeuron(V.connectFrom);
      if (fromN) {
        var p1c = V.getNeuronScreenPos(fromN);
        var p2c = V.worldToScreen(V.mouseWorldPos.x, V.mouseWorldPos.y);
        ctx.beginPath();
        traceConnectionCurve(ctx, p1c, p2c);
        var toNeuron = hitTestNeuron(p2c.x, p2c.y);
        ctx.strokeStyle = toNeuron ? 'rgba(255, 100, 100, 0.8)' : 'rgba(79, 193, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function drawNotes() {
    var ctx = V.ctx;
    V.notes.forEach(function(note) {
      var pos = V.worldToScreen(note.x, note.y);
      var fontSize = Math.max(9, 13 * V.viewport.zoom);
      ctx.font = fontSize + 'px -apple-system, sans-serif';
      ctx.fillStyle = V.isLightTheme() ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.5)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(note.text, pos.x, pos.y);
    });
  }

  // --- Tooltip ---
  function updateTooltip() {
    var tooltipEl = document.getElementById('canvas-tooltip');
    if (V.isDragging || V.isPanning || V.isConnecting) {
      tooltipEl.style.display = 'none';
      return;
    }

    var html = '';

    if (V.hoverNeuronId) {
      var neuron = V.network.getNeuron(V.hoverNeuronId);
      if (neuron) {
        var layer = V.network.getLayer(neuron.layerId);
        var layerNeurons = V.network.getNeuronsByLayer(neuron.layerId);
        var idx = layerNeurons.findIndex(function(n) { return n.id === neuron.id; });
        var inConns = V.network.getAllConnections().filter(function(c) { return c.toNeuron === neuron.id; });
        var outConns = V.network.getAllConnections().filter(function(c) { return c.fromNeuron === neuron.id; });
        var act = neuron.activation || (layer ? layer.activation : 'linear') || 'linear';
        var activation = V.neuronActivations.get(neuron.id);

        html = '<div class="tt-title">Neuron N' + idx + '</div>';
        html += '<div class="tt-row"><span class="tt-label">Layer</span><span class="tt-value">' + (layer ? layer.name : '—') + '</span></div>';
        html += '<div class="tt-row"><span class="tt-label">Activation</span><span class="tt-value">' + act + '</span></div>';
        html += '<div class="tt-row"><span class="tt-label">Bias</span><span class="tt-value">' + (neuron.bias || 0).toFixed(4) + '</span></div>';
        html += '<div class="tt-row"><span class="tt-label">In / Out</span><span class="tt-value">' + inConns.length + ' / ' + outConns.length + '</span></div>';
        if (activation !== undefined) {
          html += '<div class="tt-row"><span class="tt-label">Value</span><span class="tt-value">' + activation.toFixed(4) + '</span></div>';
        }
      }
    } else if (V.hoverLayerId) {
      var layerH = V.network.getLayer(V.hoverLayerId);
      if (layerH) {
        var neuronsH = V.network.getNeuronsByLayer(layerH.id);
        html = '<div class="tt-title">' + layerH.name + '</div>';
        html += '<div class="tt-row"><span class="tt-label">Neurons</span><span class="tt-value">' + neuronsH.length + '</span></div>';
        html += '<div class="tt-row"><span class="tt-label">Activation</span><span class="tt-value">' + (layerH.activation || 'linear') + '</span></div>';
        html += '<div class="tt-row"><span class="tt-label">Bias</span><span class="tt-value">' + (layerH.useBias !== false ? 'Yes' : 'No') + '</span></div>';
        html += '<div class="tt-row"><span class="tt-label">Init</span><span class="tt-value">' + (layerH.weightInit || 'xavier') + '</span></div>';
      }
    } else if (V.hoverConnection) {
      var w = V.hoverConnection.weight || 0;
      var cls = w >= 0 ? 'positive' : 'negative';
      var fromNc = V.network.getNeuron(V.hoverConnection.fromNeuron);
      var toNc = V.network.getNeuron(V.hoverConnection.toNeuron);
      var fromLayer = fromNc ? V.network.getLayer(fromNc.layerId) : null;
      var toLayer = toNc ? V.network.getLayer(toNc.layerId) : null;
      html = '<div class="tt-title">Connection</div>';
      html += '<div class="tt-row"><span class="tt-label">Weight</span><span class="tt-value ' + cls + '">' + w.toFixed(6) + '</span></div>';
      if (fromLayer && toLayer) {
        html += '<div class="tt-row"><span class="tt-label">From</span><span class="tt-value">' + fromLayer.name + '</span></div>';
        html += '<div class="tt-row"><span class="tt-label">To</span><span class="tt-value">' + toLayer.name + '</span></div>';
      }
    }

    if (!html) {
      tooltipEl.style.display = 'none';
      return;
    }

    tooltipEl.innerHTML = html;
    tooltipEl.style.display = 'block';

    var canvasRect = V.canvas.getBoundingClientRect();
    var tx = V.tooltipMouseX - canvasRect.left + 14;
    var ty = V.tooltipMouseY - canvasRect.top + 14;
    var tw = tooltipEl.offsetWidth;
    var th = tooltipEl.offsetHeight;
    if (tx + tw > canvasRect.width - 8) tx = tx - tw - 28;
    if (ty + th > canvasRect.height - 8) ty = ty - th - 28;
    tooltipEl.style.left = tx + 'px';
    tooltipEl.style.top = ty + 'px';
  }

  // --- Minimap ---
  function getWorldBounds() {
    var layers = V.network.getAllLayers();
    if (layers.length === 0) return { minX: -200, maxX: 200, minY: -200, maxY: 200 };

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    layers.forEach(function(layer) {
      var ns = V.network.getNeuronsByLayer(layer.id);
      var worldH = Math.max(ns.length * V.NEURON_GAP + 40, V.LAYER_HEIGHT);
      var halfW = V.LAYER_WIDTH / 2;
      var halfH = worldH / 2;
      minX = Math.min(minX, layer.position.x - halfW);
      maxX = Math.max(maxX, layer.position.x + halfW);
      minY = Math.min(minY, layer.position.y - halfH);
      maxY = Math.max(maxY, layer.position.y + halfH);
    });

    var padX = (maxX - minX) * 0.15 + 60;
    var padY = (maxY - minY) * 0.15 + 60;
    return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
  }

  function renderMinimap() {
    var minimapCanvas = document.getElementById('minimap-canvas');
    var minimapCtx = minimapCanvas.getContext('2d');
    var minimapContainer = document.getElementById('minimap-container');
    if (minimapContainer.style.display === 'none') return;

    var cRect = minimapContainer.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    minimapCanvas.width = cRect.width * dpr;
    minimapCanvas.height = cRect.height * dpr;
    minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var mw = cRect.width;
    var mh = cRect.height;

    minimapCtx.clearRect(0, 0, mw, mh);

    var bounds = getWorldBounds();
    var bw = bounds.maxX - bounds.minX;
    var bh = bounds.maxY - bounds.minY;
    var scale = Math.min(mw / bw, mh / bh);
    var offX = (mw - bw * scale) / 2;
    var offY = (mh - bh * scale) / 2;

    function worldToMini(wx, wy) {
      return {
        x: (wx - bounds.minX) * scale + offX,
        y: (wy - bounds.minY) * scale + offY
      };
    }

    // Connections
    var connections = V.network.getAllConnections();
    minimapCtx.strokeStyle = 'rgba(79, 193, 255, 0.2)';
    minimapCtx.lineWidth = 0.5;
    connections.forEach(function(conn) {
      var from = V.network.getNeuron(conn.fromNeuron);
      var to = V.network.getNeuron(conn.toNeuron);
      if (!from || !to) return;
      var p1 = worldToMini(from.position.x, from.position.y);
      var p2 = worldToMini(to.position.x, to.position.y);
      minimapCtx.beginPath();
      traceConnectionCurve(minimapCtx, p1, p2);
      minimapCtx.stroke();
    });

    // Layers
    var layers = V.network.getAllLayers();
    layers.forEach(function(layer, li) {
      var color = layer.style.color || V.LAYER_COLORS[li % V.LAYER_COLORS.length];
      var ns = V.network.getNeuronsByLayer(layer.id);
      var worldH = Math.max(ns.length * V.NEURON_GAP + 40, V.LAYER_HEIGHT);
      var w = V.LAYER_WIDTH * scale;
      var h = worldH * scale;
      var pos = worldToMini(layer.position.x, layer.position.y);
      minimapCtx.fillStyle = color + '40';
      minimapCtx.fillRect(pos.x - w / 2, pos.y - h / 2, w, h);
      minimapCtx.strokeStyle = color;
      minimapCtx.lineWidth = 1;
      minimapCtx.strokeRect(pos.x - w / 2, pos.y - h / 2, w, h);
    });

    // Neurons
    var neurons = V.network.getAllNeurons();
    neurons.forEach(function(neuron) {
      var li = layers.findIndex(function(l) { return l.id === neuron.layerId; });
      var layer = layers[li];
      var color = (layer && layer.style.color) || V.LAYER_COLORS[li % V.LAYER_COLORS.length];
      var pos = worldToMini(neuron.position.x, neuron.position.y);
      var r = Math.max(1.5, V.NEURON_RADIUS * scale);
      minimapCtx.beginPath();
      minimapCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      minimapCtx.fillStyle = color;
      minimapCtx.fill();
    });

    // Viewport rect
    var canvasRect = V.canvas.getBoundingClientRect();
    var topLeft = V.screenToWorld(0, 0);
    var bottomRight = V.screenToWorld(canvasRect.width, canvasRect.height);
    var vpTL = worldToMini(topLeft.x, topLeft.y);
    var vpBR = worldToMini(bottomRight.x, bottomRight.y);
    var vpW = vpBR.x - vpTL.x;
    var vpH = vpBR.y - vpTL.y;

    minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    minimapCtx.lineWidth = 1.5;
    minimapCtx.strokeRect(vpTL.x, vpTL.y, vpW, vpH);
    minimapCtx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    minimapCtx.fillRect(vpTL.x, vpTL.y, vpW, vpH);

    minimapCanvas._transform = { bounds: bounds, scale: scale, offX: offX, offY: offY };
  }

  // --- Main Render ---
  function render() {
    var rect = V.canvas.getBoundingClientRect();
    V.ctx.clearRect(0, 0, rect.width, rect.height);
    drawGrid();
    drawConnections();
    drawLayers();
    drawNeurons();
    drawNotes();
    if (V.ctxTarget) V.updateContextToolbarPosition();
    renderMinimap();
    V.updatePropertiesPanel();
  }

  // --- Exports ---
  V.render = render;
  V.hitTestLayer = hitTestLayer;
  V.hitTestNeuron = hitTestNeuron;
  V.hitTestConnection = hitTestConnection;
  V.traceConnectionCurve = traceConnectionCurve;
  V.updateTooltip = updateTooltip;
  V.getWorldBounds = getWorldBounds;

  // Stub overrides (set in ui-panels.js)
  V.updateContextToolbarPosition = V.updateContextToolbarPosition || function() {};
  V.updatePropertiesPanel = V.updatePropertiesPanel || function() {};

})(window.VNNS);
