/**
 * VNNS Dataset Manager
 * Upload/parse/generate, manual editor, preview, columns, stats, split, synthetic generators.
 */
(function(V) {
  'use strict';

  // --- Parsing ---
  function parseCSV(text) {
    var lines = text.trim().split('\n').map(function(l) { return l.split(',').map(function(c) { return c.trim(); }); });
    if (lines.length < 2) return;
    var headers = lines[0];
    var rows = lines.slice(1);
    V.dataset = { headers: headers, rows: rows, columns: [] };
    buildDataset();
  }

  function parseJSON(text) {
    var arr = JSON.parse(text);
    if (!Array.isArray(arr) || arr.length === 0) return;
    var headers = Object.keys(arr[0]);
    var rows = arr.map(function(r) { return headers.map(function(h) { return r[h]; }); });
    V.dataset = { headers: headers, rows: rows, columns: [] };
    buildDataset();
  }

  function buildDataset() {
    detectColumnTypes();
    renderPreview();
    renderColumns();
    renderStats();
    V.logOutput('Dataset loaded — ' + V.dataset.rows.length + ' rows, ' + V.dataset.headers.length + ' columns');
    V.invalidateBackendNetwork();
    document.getElementById('preview-section').style.display = '';
    document.getElementById('columns-section').style.display = '';
    document.getElementById('split-section').style.display = '';
    document.getElementById('stats-section').style.display = '';
  }

  function detectColumnTypes() {
    V.dataset.columns = V.dataset.headers.map(function(name, i) {
      var vals = V.dataset.rows.map(function(r) { return r[i]; });
      var numeric = vals.filter(function(v) { return !isNaN(v) && v !== ''; }).length;
      var unique = new Set(vals).size;
      var type = numeric > vals.length * 0.8 ? 'numeric' : 'categorical';
      return {
        name: name,
        type: type,
        role: i === V.dataset.headers.length - 1 ? 'target' : 'feature',
        normalization: 'none',
        unique: unique,
        missing: vals.filter(function(v) { return v === '' || v === null || v === undefined; }).length
      };
    });
  }

  function renderPreview() {
    var thead = document.getElementById('preview-head');
    var tbody = document.getElementById('preview-body');
    var maxRows = Math.min(V.dataset.rows.length, 15);
    thead.innerHTML = '<tr>' + V.dataset.headers.map(function(h) { return '<th>' + h + '</th>'; }).join('') + '</tr>';
    tbody.innerHTML = V.dataset.rows.slice(0, maxRows).map(function(r) {
      return '<tr>' + r.map(function(c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }).join('');
  }

  function renderColumns() {
    var list = document.getElementById('columns-list');
    list.innerHTML = V.dataset.columns.map(function(col, i) {
      return '<div class="column-item">' +
        '<div class="column-header">' +
          '<span class="column-name">' +
            '<span class="codicon codicon-' + (col.role === 'target' ? 'target' : 'symbol-field') + '"></span>' +
            col.name +
            '<span class="column-type ' + col.type + '">' + col.type + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="column-controls">' +
          '<label class="column-toggle"><input type="checkbox" ' + (col.role === 'feature' ? 'checked' : '') + ' data-idx="' + i + '" data-role="feature">Feature</label>' +
          '<label class="column-toggle"><input type="checkbox" ' + (col.role === 'target' ? 'checked' : '') + ' data-idx="' + i + '" data-role="target">Target</label>' +
          '<select class="column-select" data-idx="' + i + '" data-setting="normalization">' +
            '<option value="none"' + (col.normalization === 'none' ? ' selected' : '') + '>No norm</option>' +
            '<option value="minmax"' + (col.normalization === 'minmax' ? ' selected' : '') + '>MinMax</option>' +
            '<option value="standard"' + (col.normalization === 'standard' ? ' selected' : '') + '>Standard</option>' +
          '</select>' +
        '</div>' +
      '</div>';
    }).join('');

    list.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      cb.addEventListener('change', function(e) {
        var idx = parseInt(e.target.dataset.idx);
        var role = e.target.dataset.role;
        if (e.target.checked) {
          if (role === 'target') {
            list.querySelectorAll('input[data-role="target"]').forEach(function(c) { if (parseInt(c.dataset.idx) !== idx) c.checked = false; });
            V.dataset.columns.forEach(function(c, j) { if (j !== idx) c.role = 'feature'; });
          }
          V.dataset.columns[idx].role = role;
          if (role === 'target') list.querySelector('input[data-idx="' + idx + '"][data-role="feature"]').checked = false;
          else list.querySelector('input[data-idx="' + idx + '"][data-role="target"]').checked = false;
        }
        V.invalidateBackendNetwork();
      });
    });

    list.querySelectorAll('.column-select').forEach(function(sel) {
      sel.addEventListener('change', function(e) {
        V.dataset.columns[parseInt(e.target.dataset.idx)].normalization = e.target.value;
        V.invalidateBackendNetwork();
      });
    });
  }

  function renderStats() {
    var grid = document.getElementById('stats-grid');
    var totalMissing = V.dataset.columns.reduce(function(s, c) { return s + c.missing; }, 0);
    var html = '<div class="stat-item"><span class="stat-label">Rows</span><span class="stat-value">' + V.dataset.rows.length.toLocaleString() + '</span></div>' +
      '<div class="stat-item"><span class="stat-label">Columns</span><span class="stat-value">' + V.dataset.headers.length + '</span></div>' +
      '<div class="stat-item"><span class="stat-label">Missing values</span><span class="stat-value">' + totalMissing + '</span></div>';

    V.dataset.columns.forEach(function(col) {
      var vals = V.dataset.rows.map(function(r) { return r[V.dataset.headers.indexOf(col.name)]; }).filter(function(v) { return v !== '' && !isNaN(v); }).map(Number);
      if (vals.length > 0 && col.type === 'numeric') {
        var mean = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
        var std = Math.sqrt(vals.reduce(function(s, v) { return s + Math.pow(v - mean, 2); }, 0) / vals.length);
        var min = Math.min.apply(null, vals);
        var max = Math.max.apply(null, vals);
        html += '<div class="stat-item" style="padding-top:8px;border-top:1px solid #3c3c3c;margin-top:4px"><span class="stat-label" style="color:#cccccc;font-weight:600">' + col.name + '</span></div>';
        html += '<div class="stat-item"><span class="stat-label">Mean</span><span class="stat-value">' + mean.toFixed(4) + '</span></div>';
        html += '<div class="stat-item"><span class="stat-label">Std</span><span class="stat-value">' + std.toFixed(4) + '</span></div>';
        html += '<div class="stat-item"><span class="stat-label">Min</span><span class="stat-value">' + min.toFixed(4) + '</span></div>';
        html += '<div class="stat-item"><span class="stat-label">Max</span><span class="stat-value">' + max.toFixed(4) + '</span></div>';
      } else {
        html += '<div class="stat-item" style="padding-top:8px;border-top:1px solid #3c3c3c;margin-top:4px"><span class="stat-label" style="color:#cccccc;font-weight:600">' + col.name + '</span><span class="stat-value">' + col.unique + ' unique</span></div>';
      }
    });
    grid.innerHTML = html;
  }

  // --- Split ---
  function updateSplit() {
    var splitTrain = document.getElementById('split-train');
    var splitVal = document.getElementById('split-val');
    var train = parseInt(splitTrain.value);
    var val = parseInt(splitVal.value);
    var test = 100 - train - val;
    if (test < 0) {
      splitVal.value = 100 - train;
      updateSplit();
      return;
    }
    document.getElementById('split-train-value').textContent = train + '%';
    document.getElementById('split-val-value').textContent = val + '%';
    document.getElementById('split-test-value').textContent = test + '%';
  }

  // --- Synthetic Dataset Generators ---
  function createSeededRandom(seed) {
    return function() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
  }

  function addNoise(value, noise, rand) {
    return value + (rand() - 0.5) * noise * 2;
  }

  function toPointRow(x1, x2, y) {
    return { x1: +x1.toFixed(4), x2: +x2.toFixed(4), y: y };
  }

  function generateMoonsDataset(sampleCount, noise) {
    sampleCount = sampleCount || 240;
    noise = noise || 0.08;
    var rand = createSeededRandom(101);
    var rows = [];
    var half = Math.floor(sampleCount / 2);
    for (var i = 0; i < sampleCount; i++) {
      var angle = Math.PI * (i % half) / Math.max(half - 1, 1);
      if (i < half) {
        rows.push(toPointRow(addNoise(Math.cos(angle), noise, rand), addNoise(Math.sin(angle), noise, rand), 0));
      } else {
        rows.push(toPointRow(addNoise(1 - Math.cos(angle), noise, rand), addNoise(-Math.sin(angle) + 0.5, noise, rand), 1));
      }
    }
    return rows;
  }

  function generateCirclesDataset(sampleCount, noise) {
    sampleCount = sampleCount || 240;
    noise = noise || 0.08;
    var rand = createSeededRandom(202);
    var rows = [];
    var half = Math.floor(sampleCount / 2);
    for (var i = 0; i < sampleCount; i++) {
      var angle = (Math.PI * 2 * (i % half)) / Math.max(half, 1);
      var radius = i < half ? 1 : 0.45;
      var label = i < half ? 0 : 1;
      rows.push(toPointRow(addNoise(Math.cos(angle) * radius, noise, rand), addNoise(Math.sin(angle) * radius, noise, rand), label));
    }
    return rows;
  }

  function generateSpiralDataset(sampleCount, noise) {
    sampleCount = sampleCount || 240;
    noise = noise || 0.08;
    var rand = createSeededRandom(303);
    var rows = [];
    var half = Math.floor(sampleCount / 2);
    for (var i = 0; i < sampleCount; i++) {
      var t = (i % half) / Math.max(half - 1, 1);
      var angle = t * Math.PI * 4;
      var radius = 0.2 + t * 1.8;
      var phase = i < half ? 0 : Math.PI;
      rows.push(toPointRow(addNoise(Math.cos(angle + phase) * radius, noise, rand), addNoise(Math.sin(angle + phase) * radius, noise, rand), i < half ? 0 : 1));
    }
    return rows;
  }

  function generateGaussianBlobsDataset(sampleCount, noise, clusterCount) {
    sampleCount = sampleCount || 240;
    noise = noise || 0.08;
    clusterCount = clusterCount || 4;
    var rand = createSeededRandom(404);
    var rows = [];
    var centers = [];
    for (var c = 0; c < clusterCount; c++) {
      var angle = (Math.PI * 2 * c) / clusterCount;
      centers.push({ x: Math.cos(angle) * 1.8, y: Math.sin(angle) * 1.8 });
    }
    for (var i = 0; i < sampleCount; i++) {
      var label = i % clusterCount;
      var center = centers[label];
      rows.push(toPointRow(addNoise(center.x, noise * 1.6, rand), addNoise(center.y, noise * 1.6, rand), label));
    }
    return rows;
  }

  function generateCheckerboardDataset(sampleCount, noise) {
    sampleCount = sampleCount || 240;
    noise = noise || 0.08;
    var rand = createSeededRandom(505);
    var rows = [];
    for (var i = 0; i < sampleCount; i++) {
      var rawX = rand() * 4 - 2;
      var rawY = rand() * 4 - 2;
      var label = (Math.floor(rawX) + Math.floor(rawY)) % 2 === 0 ? 0 : 1;
      rows.push(toPointRow(addNoise(rawX, noise, rand), addNoise(rawY, noise, rand), label));
    }
    return rows;
  }

  function generateXORDataset() {
    var rng = function(seed) { return function() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; };
    var r = rng(77);
    var canonical = [[0,0,0],[0,1,1],[1,0,1],[1,1,0]];
    var rows = canonical.map(function(c) { return c.map(String); });
    for (var i = 0; i < 96; i++) {
      var base = canonical[i % 4];
      var noise = 0.15;
      rows.push([
        Math.max(0, Math.min(1, base[0] + (r() - 0.5) * noise)).toFixed(3),
        Math.max(0, Math.min(1, base[1] + (r() - 0.5) * noise)).toFixed(3),
        String(base[2])
      ]);
    }
    return { headers: ['x1', 'x2', 'y'], rows: rows, roles: ['feature', 'feature', 'target'], normalizations: ['none', 'none', 'none'] };
  }

  function generateIrisDataset() {
    var rng = function(seed) { return function() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; };
    var r = rng(42);
    var rows = [];
    for (var i = 0; i < 50; i++) {
      rows.push([(4.6 + r() * 1.2).toFixed(1), (3.0 + r() * 0.8).toFixed(1), (1.0 + r() * 0.9).toFixed(1), (0.1 + r() * 0.4).toFixed(1), '1', '0', '0']);
    }
    for (var j = 0; j < 50; j++) {
      rows.push([(4.9 + r() * 2.1).toFixed(1), (2.0 + r() * 0.8).toFixed(1), (3.0 + r() * 1.8).toFixed(1), (1.0 + r() * 0.6).toFixed(1), '0', '1', '0']);
    }
    for (var k = 0; k < 50; k++) {
      rows.push([(5.6 + r() * 2.0).toFixed(1), (2.5 + r() * 0.9).toFixed(1), (4.5 + r() * 1.8).toFixed(1), (1.5 + r() * 1.0).toFixed(1), '0', '0', '1']);
    }
    return { headers: ['sepal_len', 'sepal_wid', 'petal_len', 'petal_wid', 'setosa', 'versicolor', 'virginica'], rows: rows, roles: ['feature', 'feature', 'feature', 'feature', 'target', 'target', 'target'], normalizations: ['minmax', 'minmax', 'minmax', 'minmax', 'none', 'none', 'none'] };
  }

  function generateRegressionDataset() {
    var rng = function(seed) { return function() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; };
    var r = rng(55);
    var rows = [];
    for (var i = 0; i < 200; i++) {
      var x = -3 + (i / 199) * 6;
      var noise = (r() - 0.5) * 0.3;
      var y = Math.sin(x) * 2 + noise;
      rows.push([x.toFixed(3), y.toFixed(3)]);
    }
    return { headers: ['x', 'y'], rows: rows, roles: ['feature', 'target'], normalizations: ['minmax', 'none'] };
  }

  function generateAutoencoderDataset() {
    var rng = function(seed) { return function() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; };
    var r = rng(99);
    var rows = [];
    var centers = [
      [0.2, 0.8, 0.1, 0.9], [0.8, 0.2, 0.9, 0.1], [0.5, 0.5, 0.5, 0.5], [0.1, 0.1, 0.9, 0.9],
      [0.9, 0.9, 0.1, 0.1], [0.3, 0.6, 0.7, 0.4], [0.7, 0.3, 0.3, 0.7], [0.1, 0.9, 0.5, 0.2]
    ];
    for (var c = 0; c < centers.length; c++) {
      for (var i = 0; i < 25; i++) {
        var vals = centers[c].map(function(v) { return Math.max(0, Math.min(1, v + (r() - 0.5) * 0.15)); });
        var row = vals.map(function(v) { return v.toFixed(3); });
        rows.push([].concat(row, row));
      }
    }
    return { headers: ['f1', 'f2', 'f3', 'f4', 't1', 't2', 't3', 't4'], rows: rows, roles: ['feature', 'feature', 'feature', 'feature', 'target', 'target', 'target', 'target'], normalizations: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'] };
  }

  // --- Manual Dataset Editor ---
  var deHeaders = [];
  var deRows = [];
  var deColRoles = [];

  function deUpdateInfo() {
    document.getElementById('de-info').textContent = deHeaders.length + ' cols × ' + deRows.length + ' rows';
  }

  function deRenderTable() {
    var deHead = document.getElementById('de-head');
    var deBody = document.getElementById('de-body');
    var deRoles = document.getElementById('de-roles');

    deHead.innerHTML = '<tr><th class="de-row-num">#</th>' +
      deHeaders.map(function(h, i) { return '<th><input type="text" value="' + h + '" data-col="' + i + '" placeholder="col_' + i + '" class="de-header-input"></th>'; }).join('') + '</tr>';

    deBody.innerHTML = deRows.map(function(row, r) {
      return '<tr><td class="de-row-num">' + (r + 1) + '</td>' +
        row.map(function(val, c) { return '<td><input type="text" value="' + val + '" data-row="' + r + '" data-col="' + c + '" placeholder="0" class="de-cell-input"></td>'; }).join('') + '</tr>';
    }).join('');

    deRoles.innerHTML = deHeaders.map(function(h, i) {
      return '<div class="de-role-item"><span class="de-col-name" title="' + h + '">' + (h || 'col_' + i) + '</span>' +
        '<select data-col="' + i + '" class="de-role-select">' +
          '<option value="feature"' + (deColRoles[i] === 'feature' ? ' selected' : '') + '>Feature</option>' +
          '<option value="target"' + (deColRoles[i] === 'target' ? ' selected' : '') + '>Target</option>' +
        '</select></div>';
    }).join('');

    deUpdateInfo();
  }

  function openDatasetEditor() {
    if (V.dataset.headers.length > 0) {
      deHeaders = [].concat(V.dataset.headers);
      deRows = V.dataset.rows.map(function(r) { return [].concat(r); });
      deColRoles = V.dataset.columns.length > 0
        ? V.dataset.columns.map(function(c) { return c.role || 'feature'; })
        : deHeaders.map(function(_, i) { return i === deHeaders.length - 1 ? 'target' : 'feature'; });
    } else {
      deHeaders = ['x1', 'x2', 'y'];
      deRows = [new Array(3).fill('')];
      deColRoles = ['feature', 'feature', 'target'];
    }
    deRenderTable();
    document.getElementById('dataset-editor-modal').style.display = 'flex';
  }

  function closeDatasetEditor() {
    document.getElementById('dataset-editor-modal').style.display = 'none';
  }

  // --- Init ---
  function init() {
    var fileInput = document.getElementById('file-input');
    document.getElementById('btn-upload').addEventListener('click', function() { fileInput.click(); });

    fileInput.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        var text = ev.target.result;
        if (file.name.endsWith('.csv')) parseCSV(text);
        else if (file.name.endsWith('.json')) parseJSON(text);
      };
      reader.readAsText(file);
    });

    document.getElementById('btn-paste').addEventListener('click', function() {
      var data = prompt('Paste CSV or JSON data:');
      if (!data) return;
      try { JSON.parse(data); parseJSON(data); } catch (_) { parseCSV(data); }
    });

    var urlGroup = document.getElementById('url-group');
    document.getElementById('btn-url').addEventListener('click', function() {
      urlGroup.style.display = urlGroup.style.display === 'none' ? 'flex' : 'none';
    });

    document.getElementById('fetch-url-btn').addEventListener('click', function() {
      var url = document.getElementById('data-url').value.trim();
      if (!url) return;
      fetch(url).then(function(res) { return res.text(); }).then(function(text) {
        if (url.endsWith('.csv')) parseCSV(text);
        else parseJSON(text);
      }).catch(function(err) { alert('Failed to fetch data: ' + err.message); });
    });

    // Synthetic modal
    var synModal = document.getElementById('synthetic-modal');
    var synType = document.getElementById('synthetic-type');
    var synCount = document.getElementById('synthetic-count');
    var synNoise = document.getElementById('synthetic-noise');
    var synClusters = document.getElementById('synthetic-clusters');

    synType.addEventListener('change', function() {
      document.getElementById('synthetic-clusters-section').style.display = synType.value === 'blobs' ? '' : 'none';
    });

    document.getElementById('btn-generate').addEventListener('click', function() { synModal.style.display = 'flex'; });

    document.getElementById('synthetic-confirm').addEventListener('click', function() {
      var kind = synType.value;
      var rawCount = parseInt(synCount.value, 10);
      var rawNoise = parseFloat(synNoise.value);

      if (isNaN(rawCount) || rawCount < 10 || rawCount > 10000) {
        synCount.style.outline = '1px solid #f48771';
        V.logOutput('Sample count must be between 10 and 10,000', 'error');
        return;
      }
      synCount.style.outline = '';

      if (isNaN(rawNoise) || rawNoise < 0 || rawNoise > 1) {
        synNoise.style.outline = '1px solid #f48771';
        V.logOutput('Noise level must be between 0 and 1', 'error');
        return;
      }
      synNoise.style.outline = '';

      var data;
      if (kind === 'blobs') {
        var rawClusters = parseInt(synClusters.value, 10);
        if (isNaN(rawClusters) || rawClusters < 2 || rawClusters > 20) {
          synClusters.style.outline = '1px solid #f48771';
          V.logOutput('Clusters must be between 2 and 20', 'error');
          return;
        }
        synClusters.style.outline = '';
        data = generateGaussianBlobsDataset(rawCount, rawNoise, rawClusters);
      } else {
        var generators = { moons: generateMoonsDataset, circles: generateCirclesDataset, spiral: generateSpiralDataset, checkerboard: generateCheckerboardDataset };
        data = generators[kind](rawCount, rawNoise);
      }

      parseJSON(JSON.stringify(data));
      V.logOutput('Generated ' + kind + ' dataset — ' + data.length + ' samples', 'success');
      synModal.style.display = 'none';
    });

    document.getElementById('synthetic-cancel').addEventListener('click', function() { synModal.style.display = 'none'; });
    document.getElementById('synthetic-modal-close').addEventListener('click', function() { synModal.style.display = 'none'; });
    synModal.querySelector('.modal-overlay').addEventListener('click', function() { synModal.style.display = 'none'; });

    // Split
    document.getElementById('split-train').addEventListener('input', updateSplit);
    document.getElementById('split-val').addEventListener('input', updateSplit);

    // Manual editor
    var deModal = document.getElementById('dataset-editor-modal');
    var deHead = document.getElementById('de-head');
    var deBody = document.getElementById('de-body');
    var deRolesEl = document.getElementById('de-roles');

    document.getElementById('btn-manual').addEventListener('click', openDatasetEditor);
    document.getElementById('dataset-editor-close').addEventListener('click', closeDatasetEditor);
    deModal.querySelector('.modal-overlay').addEventListener('click', closeDatasetEditor);
    document.getElementById('de-cancel').addEventListener('click', closeDatasetEditor);

    deHead.addEventListener('input', function(e) {
      if (e.target.classList.contains('de-header-input')) {
        var col = parseInt(e.target.dataset.col);
        deHeaders[col] = e.target.value;
        var roleLabel = deRolesEl.querySelectorAll('.de-col-name')[col];
        if (roleLabel) roleLabel.textContent = e.target.value || 'col_' + col;
      }
    });

    deBody.addEventListener('input', function(e) {
      if (e.target.classList.contains('de-cell-input')) {
        deRows[parseInt(e.target.dataset.row)][parseInt(e.target.dataset.col)] = e.target.value;
      }
    });

    deRolesEl.addEventListener('change', function(e) {
      if (e.target.classList.contains('de-role-select')) {
        deColRoles[parseInt(e.target.dataset.col)] = e.target.value;
      }
    });

    deModal.addEventListener('keydown', function(e) {
      if (e.key === 'Tab' && e.target.classList.contains('de-cell-input')) {
        e.preventDefault();
        var r = parseInt(e.target.dataset.row);
        var c = parseInt(e.target.dataset.col);
        var nextR = r, nextC = c;
        if (e.shiftKey) { nextC--; if (nextC < 0) { nextC = deHeaders.length - 1; nextR--; } }
        else { nextC++; if (nextC >= deHeaders.length) { nextC = 0; nextR++; } }
        if (nextR >= 0 && nextR < deRows.length) {
          var nextInput = deBody.querySelector('input[data-row="' + nextR + '"][data-col="' + nextC + '"]');
          if (nextInput) { nextInput.focus(); nextInput.select(); }
        } else if (nextR >= deRows.length && !e.shiftKey) {
          deRows.push(new Array(deHeaders.length).fill(''));
          deRenderTable();
          var newInput = deBody.querySelector('input[data-row="' + nextR + '"][data-col="0"]');
          if (newInput) { newInput.focus(); newInput.select(); }
        }
      }
    });

    document.getElementById('de-add-col').addEventListener('click', function() {
      deHeaders.push('col_' + deHeaders.length);
      deColRoles.push('feature');
      deRows.forEach(function(row) { row.push(''); });
      deRenderTable();
    });

    document.getElementById('de-add-row').addEventListener('click', function() {
      deRows.push(new Array(deHeaders.length).fill(''));
      deRenderTable();
      var newInput = deBody.querySelector('input[data-row="' + (deRows.length - 1) + '"][data-col="0"]');
      if (newInput) newInput.focus();
    });

    document.getElementById('de-del-col').addEventListener('click', function() {
      if (deHeaders.length === 0) return;
      deHeaders.pop(); deColRoles.pop();
      deRows.forEach(function(row) { row.pop(); });
      deRenderTable();
    });

    document.getElementById('de-del-row').addEventListener('click', function() {
      if (deRows.length === 0) return;
      deRows.pop();
      deRenderTable();
    });

    document.getElementById('de-apply').addEventListener('click', function() {
      var headers = deHeaders.map(function(h, i) { return h.trim() || ('col_' + i); });
      var rows = deRows.filter(function(row) { return row.some(function(v) { return v !== ''; }); });
      if (headers.length === 0) { alert('Add at least one column.'); return; }
      if (rows.length === 0) { alert('Add at least one data row.'); return; }

      V.dataset = { headers: headers, rows: rows.map(function(r) { return [].concat(r); }), columns: [] };
      buildDataset();
      deColRoles.forEach(function(role, i) {
        if (V.dataset.columns[i]) V.dataset.columns[i].role = role;
      });
      renderColumns();
      closeDatasetEditor();
      V.logOutput('Manual dataset applied — ' + rows.length + ' rows, ' + headers.length + ' columns');
    });

    // Confirm modal
    document.getElementById('output-clear').addEventListener('click', function() {
      document.getElementById('output-log').innerHTML = '';
    });
  }

  // --- Exports ---
  V.parseCSV = parseCSV;
  V.parseJSON = parseJSON;
  V.buildDataset = buildDataset;
  V.renderColumns = renderColumns;
  V.updateSplit = updateSplit;
  V.initDataset = init;

  // Generators (used by templates)
  V.generateXORDataset = generateXORDataset;
  V.generateIrisDataset = generateIrisDataset;
  V.generateRegressionDataset = generateRegressionDataset;
  V.generateAutoencoderDataset = generateAutoencoderDataset;
  V.generateMoonsDataset = generateMoonsDataset;
  V.generateCirclesDataset = generateCirclesDataset;
  V.generateSpiralDataset = generateSpiralDataset;
  V.generateGaussianBlobsDataset = generateGaussianBlobsDataset;
  V.generateCheckerboardDataset = generateCheckerboardDataset;

})(window.VNNS);
