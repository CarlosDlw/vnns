/**
 * VNNS Predict Panel
 * Predict inputs, decision boundary, forward pass animation.
 */
(function(V) {
  'use strict';

  var predictInputFields = [];
  var predictSampleTargets = null;
  var fwdAnimState = null;

  var decisionBoundaryColors = ['#4fc1ff', '#89d185', '#f48771', '#cca700', '#c586c0', '#ce9178'];

  function buildPredictInputs() {
    predictInputFields = [];
    predictSampleTargets = null;
    document.getElementById('predict-output-section').style.display = 'none';
    document.getElementById('predict-expected-section').style.display = 'none';

    if (!V.trainingState.preparedData) {
      document.getElementById('predict-inputs').innerHTML = '<div class="predict-empty"><span class="codicon codicon-info"></span><span>Train a model first</span></div>';
      return;
    }

    var pd = V.trainingState.preparedData;
    var container = document.getElementById('predict-inputs');
    container.innerHTML = '';

    pd.featureCols.forEach(function(colIdx, i) {
      var col = V.dataset.columns[colIdx];
      var row = document.createElement('div');
      row.className = 'predict-input-row';

      var label = document.createElement('span');
      label.className = 'predict-input-label';
      label.textContent = col ? col.name : 'Feature ' + i;
      label.title = col ? col.name : 'Feature ' + i;

      var input = document.createElement('input');
      input.type = 'number';
      input.className = 'predict-input-field';
      input.step = 'any';
      input.value = '0';
      input.placeholder = '0';

      row.appendChild(label);
      row.appendChild(input);
      container.appendChild(row);

      predictInputFields.push({ el: input, colIdx: colIdx, stat: pd.featureStats[i] });
    });

    renderDecisionBoundary();
  }

  function normalizePredictValue(value, stat) {
    if (stat.norm === 'minmax') {
      var range = stat.max - stat.min;
      return range > 0 ? (value - stat.min) / range : 0;
    }
    if (stat.norm === 'standard') {
      return (value - stat.mean) / stat.std;
    }
    return value;
  }

  function normalizeInputForPredict() {
    return predictInputFields.map(function(f) {
      return normalizePredictValue(parseFloat(f.el.value) || 0, f.stat);
    });
  }

  function setDecisionBoundaryState() {
    var section = document.getElementById('decision-boundary-section');
    var canvas = document.getElementById('decision-boundary-canvas');
    section.style.display = 'none';
    if (canvas) canvas.width = canvas.width;
  }

  function getPredictionClass(outputs) {
    if (!outputs || outputs.length === 0) return 0;
    if (outputs.length === 1) return outputs[0] >= 0.5 ? 1 : 0;
    return outputs.indexOf(Math.max.apply(null, outputs));
  }

  function getTargetClassFromRow(row, targetCols) {
    if (!targetCols || targetCols.length === 0) return 0;
    if (targetCols.length === 1) return (parseFloat(row[targetCols[0]]) || 0) >= 0.5 ? 1 : 0;
    var bestIdx = 0;
    var bestValue = -Infinity;
    targetCols.forEach(function(colIdx, index) {
      var value = parseFloat(row[colIdx]) || 0;
      if (value > bestValue) { bestValue = value; bestIdx = index; }
    });
    return bestIdx;
  }

  function renderDecisionBoundary() {
    var dbCanvas = document.getElementById('decision-boundary-canvas');
    var dbSection = document.getElementById('decision-boundary-section');
    var dbNote = document.getElementById('decision-boundary-note');
    if (!dbCanvas || !dbSection) return;

    if (!V.trainingState.preparedData || !V.dataset || V.dataset.rows.length === 0) {
      setDecisionBoundaryState();
      return;
    }

    var pd = V.trainingState.preparedData;
    if (pd.featureCols.length !== 2) {
      setDecisionBoundaryState();
      return;
    }

    if (!V.wasmBridge.ready) {
      setDecisionBoundaryState();
      return;
    }

    dbSection.style.display = '';
    dbNote.textContent = '';

    var dpr = window.devicePixelRatio || 1;
    var width = Math.max(200, dbCanvas.clientWidth || 220);
    var height = Math.max(200, dbCanvas.clientHeight || 220);
    dbCanvas.width = width * dpr;
    dbCanvas.height = height * dpr;
    var plotCtx = dbCanvas.getContext('2d');
    plotCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var featureX = pd.featureStats[0];
    var featureY = pd.featureStats[1];
    var xPad = Math.max(0.25, (featureX.max - featureX.min) * 0.12);
    var yPad = Math.max(0.25, (featureY.max - featureY.min) * 0.12);
    var xMin = featureX.min - xPad;
    var xMax = featureX.max + xPad;
    var yMin = featureY.min - yPad;
    var yMax = featureY.max + yPad;

    var toCanvasX = function(v) { return ((v - xMin) / Math.max(xMax - xMin, 0.001)) * width; };
    var toCanvasY = function(v) { return height - ((v - yMin) / Math.max(yMax - yMin, 0.001)) * height; };

    plotCtx.clearRect(0, 0, width, height);
    plotCtx.fillStyle = '#11161c';
    plotCtx.fillRect(0, 0, width, height);

    var cellSize = 5;
    for (var px = 0; px < width; px += cellSize) {
      for (var py = 0; py < height; py += cellSize) {
        var rawX = xMin + (px / width) * (xMax - xMin);
        var rawY = yMin + ((height - py) / height) * (yMax - yMin);
        var outputs = V.wasmBridge.predict([
          normalizePredictValue(rawX, featureX),
          normalizePredictValue(rawY, featureY)
        ]);
        if (!outputs || outputs.length === 0) continue;
        var classIndex = getPredictionClass(Array.from(outputs));
        plotCtx.fillStyle = decisionBoundaryColors[classIndex % decisionBoundaryColors.length] + '44';
        plotCtx.fillRect(px, py, cellSize, cellSize);
      }
    }

    var stride = Math.max(1, Math.ceil(V.dataset.rows.length / 400));
    for (var i = 0; i < V.dataset.rows.length; i += stride) {
      var row = V.dataset.rows[i];
      var rx = parseFloat(row[pd.featureCols[0]]);
      var ry = parseFloat(row[pd.featureCols[1]]);
      if (!Number.isFinite(rx) || !Number.isFinite(ry)) continue;
      var ci = getTargetClassFromRow(row, pd.targetCols);
      plotCtx.beginPath();
      plotCtx.arc(toCanvasX(rx), toCanvasY(ry), 3.2, 0, Math.PI * 2);
      plotCtx.fillStyle = decisionBoundaryColors[ci % decisionBoundaryColors.length];
      plotCtx.fill();
      plotCtx.lineWidth = 1;
      plotCtx.strokeStyle = '#ffffff';
      plotCtx.stroke();
    }

    plotCtx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    plotCtx.lineWidth = 1;
    plotCtx.strokeRect(0.5, 0.5, width - 1, height - 1);

    plotCtx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    plotCtx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    plotCtx.textAlign = 'left';
    plotCtx.fillText((V.dataset.columns[pd.featureCols[0]] || {}).name || 'x1', 8, height - 8);
    plotCtx.textAlign = 'right';
    plotCtx.fillText((V.dataset.columns[pd.featureCols[1]] || {}).name || 'x2', width - 8, 16);

    dbNote.textContent = '';
  }

  function displayPredictOutputs(outputs) {
    var pd = V.trainingState.preparedData;
    var section = document.getElementById('predict-output-section');
    var container = document.getElementById('predict-outputs');
    section.style.display = '';
    container.innerHTML = '';

    var maxVal = Math.max.apply(null, outputs.map(function(v) { return Math.abs(v); }).concat([0.001]));
    var isSoftmax = outputs.length > 1 && outputs.every(function(v) { return v >= 0 && v <= 1; });
    var maxIdx = outputs.indexOf(Math.max.apply(null, outputs));

    outputs.forEach(function(val, i) {
      var col = pd.targetCols[i] !== undefined ? V.dataset.columns[pd.targetCols[i]] : null;
      var name = col ? col.name : 'Output ' + i;

      var item = document.createElement('div');
      item.className = 'predict-output-item';
      var header = document.createElement('div');
      header.className = 'predict-output-header';
      var nameEl = document.createElement('span');
      nameEl.className = 'predict-output-name';
      nameEl.textContent = name;
      var valEl = document.createElement('span');
      valEl.className = 'predict-output-val';
      valEl.textContent = isSoftmax ? (val * 100).toFixed(2) + '%' : val.toFixed(6);
      header.appendChild(nameEl);
      header.appendChild(valEl);

      var barBg = document.createElement('div');
      barBg.className = 'predict-output-bar-bg';
      var bar = document.createElement('div');
      bar.className = 'predict-output-bar';
      if (i === maxIdx) bar.classList.add('highlight');
      var pct = isSoftmax ? (val * 100) : (Math.abs(val) / maxVal * 100);
      bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
      barBg.appendChild(bar);

      item.appendChild(header);
      item.appendChild(barBg);
      container.appendChild(item);
    });

    // Expected outputs
    var expectedSection = document.getElementById('predict-expected-section');
    var expectedContainer = document.getElementById('predict-expected');

    if (predictSampleTargets && predictSampleTargets.length > 0) {
      expectedSection.style.display = '';
      expectedContainer.innerHTML = '';
      var expectedMax = Math.max.apply(null, Array.from(predictSampleTargets).map(function(v) { return Math.abs(v); }).concat([0.001]));
      var expMaxIdx = Array.from(predictSampleTargets).indexOf(Math.max.apply(null, predictSampleTargets));

      predictSampleTargets.forEach(function(val, i) {
        var col = pd.targetCols[i] !== undefined ? V.dataset.columns[pd.targetCols[i]] : null;
        var name = col ? col.name : 'Output ' + i;
        var item = document.createElement('div');
        item.className = 'predict-output-item';
        var header = document.createElement('div');
        header.className = 'predict-output-header';
        var nameEl = document.createElement('span');
        nameEl.className = 'predict-output-name';
        nameEl.textContent = name;
        var valEl = document.createElement('span');
        valEl.className = 'predict-output-val';
        valEl.textContent = isSoftmax ? (val * 100).toFixed(2) + '%' : val.toFixed(6);
        header.appendChild(nameEl);
        header.appendChild(valEl);
        var barBg = document.createElement('div');
        barBg.className = 'predict-output-bar-bg';
        var bar = document.createElement('div');
        bar.className = 'predict-output-bar';
        if (i === expMaxIdx) bar.classList.add('highlight');
        var pct = isSoftmax ? (val * 100) : (Math.abs(val) / expectedMax * 100);
        bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
        barBg.appendChild(bar);
        item.appendChild(header);
        item.appendChild(barBg);
        expectedContainer.appendChild(item);
      });

      if (isSoftmax && outputs.length > 1) {
        var predClass = outputs.indexOf(Math.max.apply(null, outputs));
        var expClass = Array.from(predictSampleTargets).indexOf(Math.max.apply(null, predictSampleTargets));
        var badge = document.createElement('div');
        badge.className = 'predict-match-badge ' + (predClass === expClass ? 'correct' : 'wrong');
        badge.innerHTML = predClass === expClass
          ? '<span class="codicon codicon-pass"></span> Correct'
          : '<span class="codicon codicon-error"></span> Mismatch';
        expectedContainer.appendChild(badge);
      }
    } else {
      expectedSection.style.display = 'none';
    }
  }

  // --- Forward Pass Animation ---
  function startForwardPassAnimation(inputValues, onComplete) {
    stopForwardPassAnimation();

    var sortedLayers = V.network.getAllLayers().sort(function(a, b) { return a.position.x - b.position.x; });
    if (sortedLayers.length < 2) { if (onComplete) onComplete(); return; }

    var wasShowingActivations = V.viewport.showActivations;
    V.viewport.showActivations = true;
    V.neuronActivations.clear();

    var inputNeurons = V.network.getNeuronsByLayer(sortedLayers[0].id);
    inputNeurons.forEach(function(n, i) {
      V.neuronActivations.set(n.id, inputValues && i < inputValues.length ? inputValues[i] : 0);
    });

    fwdAnimState = {
      sortedLayers: sortedLayers,
      layerIdx: 0,
      particles: [],
      progress: 0,
      wasShowingActivations: wasShowingActivations,
      onComplete: onComplete
    };

    spawnParticlesForLayer(0);
    fwdAnimState.animId = requestAnimationFrame(tickForwardAnimation);
  }

  function spawnParticlesForLayer(fromLayerIdx) {
    if (!fwdAnimState) return;
    var sortedLayers = fwdAnimState.sortedLayers;
    if (fromLayerIdx >= sortedLayers.length - 1) return;

    var fromLayer = sortedLayers[fromLayerIdx];
    var toLayer = sortedLayers[fromLayerIdx + 1];
    var fromNeurons = V.network.getNeuronsByLayer(fromLayer.id);
    var toNeurons = V.network.getNeuronsByLayer(toLayer.id);

    fwdAnimState.particles = [];
    fwdAnimState.progress = 0;

    fromNeurons.forEach(function(fn) {
      toNeurons.forEach(function(tn) {
        var conn = V.network.getAllConnections().find(function(c) {
          return c.fromNeuron === fn.id && c.toNeuron === tn.id;
        });
        if (conn) {
          fwdAnimState.particles.push({
            fromNeuron: fn,
            toNeuron: tn,
            weight: conn.weight || 0,
            fromAct: V.neuronActivations.get(fn.id) || 0
          });
        }
      });
    });
  }

  function tickForwardAnimation() {
    if (!fwdAnimState) return;
    fwdAnimState.progress += 0.025;

    if (fwdAnimState.progress >= 1) {
      var layerIdx = fwdAnimState.layerIdx + 1;
      var layer = fwdAnimState.sortedLayers[layerIdx];
      var toNeurons = V.network.getNeuronsByLayer(layer.id);
      var activation = layer.activation || 'relu';
      var rawValues = [];

      toNeurons.forEach(function(toN) {
        var sum = toN.bias || 0;
        var conns = V.network.getAllConnections().filter(function(c) { return c.toNeuron === toN.id; });
        conns.forEach(function(c) {
          sum += (V.neuronActivations.get(c.fromNeuron) || 0) * (c.weight || 0);
        });
        rawValues.push({ neuron: toN, sum: sum });
      });

      if (activation.toLowerCase() === 'softmax') {
        var maxVal = Math.max.apply(null, rawValues.map(function(r) { return r.sum; }));
        var exps = rawValues.map(function(r) { return Math.exp(r.sum - maxVal); });
        var sumExp = exps.reduce(function(a, b) { return a + b; }, 0);
        rawValues.forEach(function(r, i) {
          V.neuronActivations.set(r.neuron.id, exps[i] / sumExp);
        });
      } else {
        rawValues.forEach(function(r) {
          V.neuronActivations.set(r.neuron.id, V.applyActivationFn(r.sum, activation));
        });
      }

      fwdAnimState.layerIdx++;

      if (fwdAnimState.layerIdx >= fwdAnimState.sortedLayers.length - 1) {
        fwdAnimState.particles = [];
        V.render();
        var cb = fwdAnimState.onComplete;
        var wasShowing = fwdAnimState.wasShowingActivations;
        fwdAnimState = null;
        if (!wasShowing) {
          setTimeout(function() { V.viewport.showActivations = wasShowing; V.render(); }, 2000);
        }
        if (cb) cb();
        return;
      }

      spawnParticlesForLayer(fwdAnimState.layerIdx);
    }

    V.render();
    drawForwardPassParticles();
    fwdAnimState.animId = requestAnimationFrame(tickForwardAnimation);
  }

  function bezierPoint(p1, p2, t) {
    var dx = p2.x - p1.x;
    var direction = dx >= 0 ? 1 : -1;
    var handle = Math.min(180, Math.max(36, Math.abs(dx) * 0.45));
    var cp1x = p1.x + handle * direction, cp1y = p1.y;
    var cp2x = p2.x - handle * direction, cp2y = p2.y;
    var u = 1 - t;
    return {
      x: u*u*u*p1.x + 3*u*u*t*cp1x + 3*u*t*t*cp2x + t*t*t*p2.x,
      y: u*u*u*p1.y + 3*u*u*t*cp1y + 3*u*t*t*cp2y + t*t*t*p2.y
    };
  }

  function drawForwardPassParticles() {
    if (!fwdAnimState || fwdAnimState.particles.length === 0) return;
    var ctx = V.ctx;
    var t = fwdAnimState.progress;
    var r = 4 * V.viewport.zoom;

    fwdAnimState.particles.forEach(function(p) {
      var p1 = V.getNeuronScreenPos(p.fromNeuron);
      var p2 = V.getNeuronScreenPos(p.toNeuron);
      var pt = bezierPoint(p1, p2, t);
      var intensity = Math.abs(p.fromAct);
      var alpha = 0.3 + Math.min(intensity, 1) * 0.7;

      ctx.fillStyle = p.weight >= 0
        ? 'rgba(79, 193, 255, ' + alpha + ')'
        : 'rgba(255, 100, 100, ' + alpha + ')';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r * 2.5, 0, Math.PI * 2);
      var grd = ctx.createRadialGradient(pt.x, pt.y, r * 0.5, pt.x, pt.y, r * 2.5);
      grd.addColorStop(0, p.weight >= 0
        ? 'rgba(79, 193, 255, ' + (alpha * 0.4) + ')'
        : 'rgba(255, 100, 100, ' + (alpha * 0.4) + ')');
      grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grd;
      ctx.fill();
    });
  }

  function stopForwardPassAnimation() {
    if (fwdAnimState) {
      if (fwdAnimState.animId) cancelAnimationFrame(fwdAnimState.animId);
      V.viewport.showActivations = fwdAnimState.wasShowingActivations;
      fwdAnimState = null;
    }
  }

  // --- Init ---
  function init() {
    document.getElementById('btn-predict-run').addEventListener('click', function() {
      if (!V.wasmBridge.ready || V.wasmBridge.netId < 0) {
        V.logOutput('No trained network available. Train a model first.', 'warn');
        return;
      }
      if (predictInputFields.length === 0) {
        V.logOutput('No input fields. Switch to Predict panel after training.', 'warn');
        return;
      }

      var normalized = normalizeInputForPredict();
      var animate = document.getElementById('predict-animate').checked;

      if (animate) {
        V.syncWeightsFromBackend();
        document.getElementById('btn-predict-run').disabled = true;
        startForwardPassAnimation(normalized, function() {
          var result = V.wasmBridge.predict(normalized);
          if (result) {
            displayPredictOutputs(Array.from(result));
            renderDecisionBoundary();
            V.logOutput('Prediction: [' + Array.from(result).map(function(v) { return v.toFixed(4); }).join(', ') + ']', 'info');
          }
          document.getElementById('btn-predict-run').disabled = false;
        });
      } else {
        var result = V.wasmBridge.predict(normalized);
        if (result) {
          V.syncWeightsFromBackend();
          V.computeActivations(normalized);
          V.viewport.showActivations = true;
          V.render();
          displayPredictOutputs(Array.from(result));
          renderDecisionBoundary();
          V.logOutput('Prediction: [' + Array.from(result).map(function(v) { return v.toFixed(4); }).join(', ') + ']', 'info');
        } else {
          V.logOutput('Prediction failed.', 'error');
        }
      }
    });

    document.getElementById('btn-predict-sample').addEventListener('click', function() {
      if (!V.trainingState.preparedData) {
        V.logOutput('No dataset prepared. Train a model first.', 'warn');
        return;
      }
      var pd = V.trainingState.preparedData;
      var rowIdx = Math.floor(Math.random() * V.dataset.rows.length);
      var row = V.dataset.rows[rowIdx];

      predictInputFields.forEach(function(f) {
        f.el.value = parseFloat(row[f.colIdx]) || 0;
      });

      predictSampleTargets = new Float32Array(pd.targetCols.length);
      pd.targetCols.forEach(function(colIdx, i) {
        predictSampleTargets[i] = parseFloat(row[colIdx]) || 0;
      });

      V.logOutput('Loaded sample #' + (rowIdx + 1) + ' from dataset', 'info');
    });

    document.querySelector('.activity-icon[data-view="predict"]').addEventListener('click', buildPredictInputs);
  }

  // --- Exports ---
  V.buildPredictInputs = buildPredictInputs;
  V.renderDecisionBoundary = renderDecisionBoundary;
  V.initPredict = init;

})(window.VNNS);
