(() => {
  window.VNNSModules = window.VNNSModules || {};

  window.VNNSModules.createPredictUI = function createPredictUI(deps) {
    const getDataset = deps.getDataset;
    const getNetwork = deps.getNetwork;
    const getViewport = deps.getViewport;
    const getCtx = deps.getCtx;
    const getWasmBridge = deps.getWasmBridge;
    const getTrainingState = deps.getTrainingState;
    const getNeuronActivations = deps.getNeuronActivations;
    const logOutput = deps.logOutput;
    const syncWeightsFromBackend = deps.syncWeightsFromBackend;
    const computeActivations = deps.computeActivations;
    const applyActivationFn = deps.applyActivationFn;
    const getNeuronScreenPos = deps.getNeuronScreenPos;
    const render = deps.render;

    const predictInputsContainer = document.getElementById('predict-inputs');
    const predictOutputsContainer = document.getElementById('predict-outputs');
    const predictExpectedContainer = document.getElementById('predict-expected');
    const predictOutputSection = document.getElementById('predict-output-section');
    const predictExpectedSection = document.getElementById('predict-expected-section');
    const btnPredictRun = document.getElementById('btn-predict-run');
    const btnPredictSample = document.getElementById('btn-predict-sample');
    const predictAnimateCheckbox = document.getElementById('predict-animate');

    let predictInputFields = [];
    let predictSampleTargets = null;
    let fwdAnimState = null;

    function buildPredictInputs() {
      const trainingState = getTrainingState();
      const dataset = getDataset();
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
      return predictInputFields.map((f) => {
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
      const trainingState = getTrainingState();
      const dataset = getDataset();
      const pd = trainingState.preparedData;
      predictOutputSection.style.display = '';
      predictOutputsContainer.innerHTML = '';

      const maxVal = Math.max(...outputs.map((v) => Math.abs(v)), 0.001);
      const isSoftmax = outputs.length > 1 && outputs.every((v) => v >= 0 && v <= 1);
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
        valEl.textContent = isSoftmax ? `${(val * 100).toFixed(2)}%` : val.toFixed(6);
        header.appendChild(nameEl);
        header.appendChild(valEl);

        const barBg = document.createElement('div');
        barBg.className = 'predict-output-bar-bg';
        const bar = document.createElement('div');
        bar.className = 'predict-output-bar';
        if (i === maxIdx) bar.classList.add('highlight');
        const pct = isSoftmax ? (val * 100) : (Math.abs(val) / maxVal * 100);
        bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
        barBg.appendChild(bar);
        item.appendChild(header);
        item.appendChild(barBg);
        predictOutputsContainer.appendChild(item);
      });

      if (predictSampleTargets && predictSampleTargets.length > 0) {
        predictExpectedSection.style.display = '';
        predictExpectedContainer.innerHTML = '';
        const expectedMax = Math.max(...Array.from(predictSampleTargets).map((v) => Math.abs(v)), 0.001);
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
          valEl.textContent = isSoftmax ? `${(val * 100).toFixed(2)}%` : val.toFixed(6);
          header.appendChild(nameEl);
          header.appendChild(valEl);
          const barBg = document.createElement('div');
          barBg.className = 'predict-output-bar-bg';
          const bar = document.createElement('div');
          bar.className = 'predict-output-bar';
          if (i === expMaxIdx) bar.classList.add('highlight');
          const pct = isSoftmax ? (val * 100) : (Math.abs(val) / expectedMax * 100);
          bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
          barBg.appendChild(bar);
          item.appendChild(header);
          item.appendChild(barBg);
          predictExpectedContainer.appendChild(item);
        });

        if (isSoftmax && outputs.length > 1) {
          const predClass = outputs.indexOf(Math.max(...outputs));
          const expClass = Array.from(predictSampleTargets).indexOf(Math.max(...predictSampleTargets));
          const badge = document.createElement('div');
          badge.className = `predict-match-badge ${predClass === expClass ? 'correct' : 'wrong'}`;
          badge.innerHTML = predClass === expClass
            ? '<span class="codicon codicon-pass"></span> Correct'
            : '<span class="codicon codicon-error"></span> Mismatch';
          predictExpectedContainer.appendChild(badge);
        }
      } else {
        predictExpectedSection.style.display = 'none';
      }
    }

    function spawnParticlesForLayer(fromLayerIdx) {
      const network = getNetwork();
      const neuronActivations = getNeuronActivations();
      if (!fwdAnimState) return;
      const sortedLayers = fwdAnimState.sortedLayers;
      if (fromLayerIdx >= sortedLayers.length - 1) return;
      const fromLayer = sortedLayers[fromLayerIdx];
      const toLayer = sortedLayers[fromLayerIdx + 1];
      const fromNeurons = network.getNeuronsByLayer(fromLayer.id);
      const toNeurons = network.getNeuronsByLayer(toLayer.id);

      fwdAnimState.particles = [];
      fwdAnimState.progress = 0;
      fromNeurons.forEach((fn) => {
        toNeurons.forEach((tn) => {
          const conn = network.getAllConnections().find((c) => c.fromNeuron === fn.id && c.toNeuron === tn.id);
          if (!conn) return;
          const act = neuronActivations.get(fn.id) || 0;
          fwdAnimState.particles.push({ fromNeuron: fn, toNeuron: tn, weight: conn.weight || 0, fromAct: act });
        });
      });
    }

    function drawForwardPassParticles() {
      const viewport = getViewport();
      const ctx = getCtx();
      if (!ctx || !fwdAnimState || fwdAnimState.particles.length === 0) return;

      const t = fwdAnimState.progress;
      const r = 4 * viewport.zoom;
      fwdAnimState.particles.forEach((p) => {
        const p1 = getNeuronScreenPos(p.fromNeuron);
        const p2 = getNeuronScreenPos(p.toNeuron);
        const x = p1.x + (p2.x - p1.x) * t;
        const y = p1.y + (p2.y - p1.y) * t;
        const intensity = Math.abs(p.fromAct);
        const alpha = 0.3 + Math.min(intensity, 1) * 0.7;

        ctx.fillStyle = p.weight >= 0 ? `rgba(79, 193, 255, ${alpha})` : `rgba(255, 100, 100, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
        const grd = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.5);
        grd.addColorStop(0, p.weight >= 0 ? `rgba(79, 193, 255, ${alpha * 0.4})` : `rgba(255, 100, 100, ${alpha * 0.4})`);
        grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grd;
        ctx.fill();
      });
    }

    function tickForwardAnimation() {
      const network = getNetwork();
      const viewport = getViewport();
      const neuronActivations = getNeuronActivations();
      if (!fwdAnimState) return;
      fwdAnimState.progress += 0.025;

      if (fwdAnimState.progress >= 1) {
        const layerIdx = fwdAnimState.layerIdx + 1;
        const layer = fwdAnimState.sortedLayers[layerIdx];
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
          rawValues.forEach((r, i) => neuronActivations.set(r.neuron.id, exps[i] / sumExp));
        } else {
          rawValues.forEach((r) => neuronActivations.set(r.neuron.id, applyActivationFn(r.sum, activation)));
        }

        fwdAnimState.layerIdx++;
        if (fwdAnimState.layerIdx >= fwdAnimState.sortedLayers.length - 1) {
          fwdAnimState.particles = [];
          render();
          const cb = fwdAnimState.onComplete;
          const wasShowing = fwdAnimState.wasShowingActivations;
          fwdAnimState = null;
          if (!wasShowing) {
            setTimeout(() => {
              viewport.showActivations = wasShowing;
              render();
            }, 2000);
          }
          if (cb) cb();
          return;
        }
        spawnParticlesForLayer(fwdAnimState.layerIdx);
      }

      render();
      drawForwardPassParticles();
      fwdAnimState.animId = requestAnimationFrame(tickForwardAnimation);
    }

    function startForwardPassAnimation(inputValues, onComplete) {
      const network = getNetwork();
      const viewport = getViewport();
      const neuronActivations = getNeuronActivations();
      stopForwardPassAnimation();
      const sortedLayers = network.getAllLayers().sort((a, b) => a.position.x - b.position.x);
      if (sortedLayers.length < 2) {
        if (onComplete) onComplete();
        return;
      }
      const wasShowingActivations = viewport.showActivations;
      viewport.showActivations = true;
      neuronActivations.clear();
      const inputNeurons = network.getNeuronsByLayer(sortedLayers[0].id);
      inputNeurons.forEach((n, i) => {
        neuronActivations.set(n.id, inputValues && i < inputValues.length ? inputValues[i] : 0);
      });

      fwdAnimState = {
        sortedLayers,
        layerIdx: 0,
        particles: [],
        progress: 0,
        wasShowingActivations,
        onComplete
      };
      spawnParticlesForLayer(0);
      fwdAnimState.animId = requestAnimationFrame(tickForwardAnimation);
    }

    function stopForwardPassAnimation() {
      const viewport = getViewport();
      if (!fwdAnimState) return;
      if (fwdAnimState.animId) cancelAnimationFrame(fwdAnimState.animId);
      viewport.showActivations = fwdAnimState.wasShowingActivations;
      fwdAnimState = null;
    }

    if (btnPredictRun) {
      btnPredictRun.addEventListener('click', () => {
        const wasmBridge = getWasmBridge();
        const trainingState = getTrainingState();
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
          syncWeightsFromBackend();
          btnPredictRun.disabled = true;
          startForwardPassAnimation(normalized, () => {
            const result = wasmBridge.predict(normalized);
            if (result) {
              displayPredictOutputs(Array.from(result));
              logOutput(`Prediction: [${Array.from(result).map((v) => v.toFixed(4)).join(', ')}]`, 'info');
            }
            btnPredictRun.disabled = false;
          });
        } else {
          const result = wasmBridge.predict(normalized);
          if (result) {
            syncWeightsFromBackend();
            computeActivations(normalized);
            getViewport().showActivations = true;
            render();
            displayPredictOutputs(Array.from(result));
            logOutput(`Prediction: [${Array.from(result).map((v) => v.toFixed(4)).join(', ')}]`, 'info');
          } else {
            logOutput('Prediction failed.', 'error');
          }
        }
      });
    }

    if (btnPredictSample) {
      btnPredictSample.addEventListener('click', () => {
        const trainingState = getTrainingState();
        const dataset = getDataset();
        if (!trainingState.preparedData) {
          logOutput('No dataset prepared. Train a model first.', 'warn');
          return;
        }
        const pd = trainingState.preparedData;
        const rowIdx = Math.floor(Math.random() * dataset.rows.length);
        const row = dataset.rows[rowIdx];
        predictInputFields.forEach((f) => {
          f.el.value = parseFloat(row[f.colIdx]) || 0;
        });
        predictSampleTargets = new Float32Array(pd.targetCols.length);
        pd.targetCols.forEach((colIdx, i) => {
          predictSampleTargets[i] = parseFloat(row[colIdx]) || 0;
        });
        logOutput(`Loaded sample #${rowIdx + 1} from dataset`, 'info');
      });
    }

    return {
      buildPredictInputs,
      stopForwardPassAnimation
    };
  };
})();
