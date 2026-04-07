(() => {
  window.VNNSModules = window.VNNSModules || {};

  window.VNNSModules.createDatasetUI = function createDatasetUI(deps) {
    const getDataset = deps.getDataset;
    const setDataset = deps.setDataset;
    const logOutput = deps.logOutput;
    const invalidateBackendNetwork = deps.invalidateBackendNetwork;

    const fileInput = document.getElementById('file-input');
    const btnUpload = document.getElementById('btn-upload');
    const btnPaste = document.getElementById('btn-paste');
    const btnUrl = document.getElementById('btn-url');
    const btnGenerate = document.getElementById('btn-generate');
    const urlGroup = document.getElementById('url-group');
    const fetchUrlBtn = document.getElementById('fetch-url-btn');
    const dataUrlInput = document.getElementById('data-url');

    function parseCSV(text) {
      const lines = text.trim().split('\n').map((l) => l.split(',').map((c) => c.trim()));
      if (lines.length < 2) return;
      const headers = lines[0];
      const rows = lines.slice(1);
      setDataset({ headers, rows, columns: [] });
      buildDataset();
    }

    function parseJSON(text) {
      const arr = JSON.parse(text);
      if (!Array.isArray(arr) || arr.length === 0) return;
      const headers = Object.keys(arr[0]);
      const rows = arr.map((r) => headers.map((h) => r[h]));
      setDataset({ headers, rows, columns: [] });
      buildDataset();
    }

    function detectColumnTypes() {
      const dataset = getDataset();
      dataset.columns = dataset.headers.map((name, i) => {
        const vals = dataset.rows.map((r) => r[i]);
        const numeric = vals.filter((v) => !isNaN(v) && v !== '').length;
        const unique = new Set(vals).size;
        const type = numeric > vals.length * 0.8 ? 'numeric' : 'categorical';
        return {
          name,
          type,
          role: i === dataset.headers.length - 1 ? 'target' : 'feature',
          normalization: 'none',
          unique,
          missing: vals.filter((v) => v === '' || v === null || v === undefined).length
        };
      });
    }

    function renderPreview() {
      const dataset = getDataset();
      const thead = document.getElementById('preview-head');
      const tbody = document.getElementById('preview-body');
      const maxRows = Math.min(dataset.rows.length, 15);
      thead.innerHTML = `<tr>${dataset.headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
      tbody.innerHTML = dataset.rows.slice(0, maxRows).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
    }

    function renderColumns() {
      const dataset = getDataset();
      const list = document.getElementById('columns-list');
      list.innerHTML = dataset.columns.map((col, i) => `
        <div class="column-item">
          <div class="column-header">
            <span class="column-name">
              <span class="codicon codicon-${col.role === 'target' ? 'target' : 'symbol-field'}"></span>
              ${col.name}
              <span class="column-type ${col.type}">${col.type}</span>
            </span>
          </div>
          <div class="column-controls">
            <label class="column-toggle">
              <input type="checkbox" ${col.role === 'feature' ? 'checked' : ''} data-idx="${i}" data-role="feature">
              Feature
            </label>
            <label class="column-toggle">
              <input type="checkbox" ${col.role === 'target' ? 'checked' : ''} data-idx="${i}" data-role="target">
              Target
            </label>
            <select class="column-select" data-idx="${i}" data-setting="normalization">
              <option value="none" ${col.normalization === 'none' ? 'selected' : ''}>No norm</option>
              <option value="minmax" ${col.normalization === 'minmax' ? 'selected' : ''}>MinMax</option>
              <option value="standard" ${col.normalization === 'standard' ? 'selected' : ''}>Standard</option>
            </select>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          const role = e.target.dataset.role;
          if (e.target.checked) {
            if (role === 'target') {
              list.querySelectorAll('input[data-role="target"]').forEach((c) => {
                if (parseInt(c.dataset.idx) !== idx) c.checked = false;
              });
              dataset.columns.forEach((c, j) => {
                if (j !== idx) c.role = 'feature';
              });
            }
            dataset.columns[idx].role = role;
            if (role === 'target') {
              list.querySelector(`input[data-idx="${idx}"][data-role="feature"]`).checked = false;
            } else {
              list.querySelector(`input[data-idx="${idx}"][data-role="target"]`).checked = false;
            }
          }
          invalidateBackendNetwork();
        });
      });

      list.querySelectorAll('.column-select').forEach((sel) => {
        sel.addEventListener('change', (e) => {
          dataset.columns[parseInt(e.target.dataset.idx)].normalization = e.target.value;
          invalidateBackendNetwork();
        });
      });
    }

    function renderStats() {
      const dataset = getDataset();
      const grid = document.getElementById('stats-grid');
      const totalMissing = dataset.columns.reduce((s, c) => s + c.missing, 0);
      let html = `
        <div class="stat-item"><span class="stat-label">Rows</span><span class="stat-value">${dataset.rows.length.toLocaleString()}</span></div>
        <div class="stat-item"><span class="stat-label">Columns</span><span class="stat-value">${dataset.headers.length}</span></div>
        <div class="stat-item"><span class="stat-label">Missing values</span><span class="stat-value">${totalMissing}</span></div>
      `;

      dataset.columns.forEach((col) => {
        const vals = dataset.rows
          .map((r) => r[dataset.headers.indexOf(col.name)])
          .filter((v) => v !== '' && !isNaN(v))
          .map(Number);
        if (vals.length > 0 && col.type === 'numeric') {
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          html += `
            <div class="stat-item" style="padding-top:8px;border-top:1px solid #3c3c3c;margin-top:4px">
              <span class="stat-label" style="color:#cccccc;font-weight:600">${col.name}</span>
            </div>
            <div class="stat-item"><span class="stat-label">Mean</span><span class="stat-value">${mean.toFixed(4)}</span></div>
            <div class="stat-item"><span class="stat-label">Std</span><span class="stat-value">${std.toFixed(4)}</span></div>
            <div class="stat-item"><span class="stat-label">Min</span><span class="stat-value">${min.toFixed(4)}</span></div>
            <div class="stat-item"><span class="stat-label">Max</span><span class="stat-value">${max.toFixed(4)}</span></div>
          `;
        } else {
          html += `
            <div class="stat-item" style="padding-top:8px;border-top:1px solid #3c3c3c;margin-top:4px">
              <span class="stat-label" style="color:#cccccc;font-weight:600">${col.name}</span>
              <span class="stat-value">${col.unique} unique</span>
            </div>
          `;
        }
      });
      grid.innerHTML = html;
    }

    function buildDataset() {
      const dataset = getDataset();
      detectColumnTypes();
      renderPreview();
      renderColumns();
      renderStats();
      logOutput(`Dataset loaded - ${dataset.rows.length} rows, ${dataset.headers.length} columns`);
      invalidateBackendNetwork();
      document.getElementById('preview-section').style.display = '';
      document.getElementById('columns-section').style.display = '';
      document.getElementById('split-section').style.display = '';
      document.getElementById('stats-section').style.display = '';
    }

    const deModal = document.getElementById('dataset-editor-modal');
    const deHead = document.getElementById('de-head');
    const deBody = document.getElementById('de-body');
    const deRoles = document.getElementById('de-roles');
    const deInfo = document.getElementById('de-info');
    let deHeaders = [];
    let deRows = [];
    let deColRoles = [];

    function deUpdateInfo() {
      deInfo.textContent = `${deHeaders.length} cols x ${deRows.length} rows`;
    }

    function deRenderTable() {
      deHead.innerHTML = '<tr><th class="de-row-num">#</th>' +
        deHeaders.map((h, i) => `<th><input type="text" value="${h}" data-col="${i}" placeholder="col_${i}" class="de-header-input"></th>`).join('') + '</tr>';

      deBody.innerHTML = deRows.map((row, r) => '<tr><td class="de-row-num">' + (r + 1) + '</td>' +
        row.map((val, c) => `<td><input type="text" value="${val}" data-row="${r}" data-col="${c}" placeholder="0" class="de-cell-input"></td>`).join('') + '</tr>').join('');

      deRoles.innerHTML = deHeaders.map((h, i) => `
        <div class="de-role-item">
          <span class="de-col-name" title="${h}">${h || `col_${i}`}</span>
          <select data-col="${i}" class="de-role-select">
            <option value="feature" ${deColRoles[i] === 'feature' ? 'selected' : ''}>Feature</option>
            <option value="target" ${deColRoles[i] === 'target' ? 'selected' : ''}>Target</option>
          </select>
        </div>
      `).join('');
      deUpdateInfo();
    }

    function openDatasetEditor() {
      const dataset = getDataset();
      if (dataset.headers.length > 0) {
        deHeaders = [...dataset.headers];
        deRows = dataset.rows.map((r) => [...r]);
        deColRoles = dataset.columns.length > 0
          ? dataset.columns.map((c) => c.role || 'feature')
          : deHeaders.map((_, i) => i === deHeaders.length - 1 ? 'target' : 'feature');
      } else {
        deHeaders = ['x1', 'x2', 'y'];
        deRows = [new Array(3).fill('')];
        deColRoles = ['feature', 'feature', 'target'];
      }
      deRenderTable();
      deModal.style.display = 'flex';
    }

    function closeDatasetEditor() {
      deModal.style.display = 'none';
    }

    function updateSplit() {
      const splitTrain = document.getElementById('split-train');
      const splitVal = document.getElementById('split-val');
      const splitTrainVal = document.getElementById('split-train-value');
      const splitValVal = document.getElementById('split-val-value');
      const splitTestVal = document.getElementById('split-test-value');
      const train = parseInt(splitTrain.value);
      const val = parseInt(splitVal.value);
      const test = 100 - train - val;
      if (test < 0) {
        splitVal.value = 100 - train;
        updateSplit();
        return;
      }
      splitTrainVal.textContent = `${train}%`;
      splitValVal.textContent = `${val}%`;
      splitTestVal.textContent = `${test}%`;
    }

    function applyTemplateDataset(templateDataset) {
      setDataset({ headers: templateDataset.headers, rows: templateDataset.rows, columns: [] });
      buildDataset();

      const dataset = getDataset();
      if (templateDataset.roles) {
        templateDataset.roles.forEach((role, i) => {
          if (dataset.columns[i]) dataset.columns[i].role = role;
        });
      }
      if (templateDataset.normalizations) {
        templateDataset.normalizations.forEach((norm, i) => {
          if (dataset.columns[i]) dataset.columns[i].normalization = norm;
        });
      }
      renderColumns();
      logOutput(`Dataset loaded - ${templateDataset.rows.length} rows, ${templateDataset.headers.length} columns`, 'info');
    }

    if (btnUpload) btnUpload.addEventListener('click', () => fileInput.click());

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target.result;
          if (file.name.endsWith('.csv')) parseCSV(text);
          else if (file.name.endsWith('.json')) parseJSON(text);
        };
        reader.readAsText(file);
      });
    }

    if (btnPaste) {
      btnPaste.addEventListener('click', () => {
        const data = prompt('Paste CSV or JSON data:');
        if (!data) return;
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) parseJSON(data);
          else parseCSV(data);
        } catch {
          parseCSV(data);
        }
      });
    }

    if (btnUrl) {
      btnUrl.addEventListener('click', () => {
        urlGroup.style.display = urlGroup.style.display === 'none' ? 'flex' : 'none';
      });
    }

    if (fetchUrlBtn) {
      fetchUrlBtn.addEventListener('click', async () => {
        const url = dataUrlInput.value.trim();
        if (!url) return;
        try {
          const res = await fetch(url);
          const text = await res.text();
          if (url.endsWith('.csv')) parseCSV(text);
          else parseJSON(text);
        } catch (err) {
          alert(`Failed to fetch data: ${err.message}`);
        }
      });
    }

    if (btnGenerate) {
      btnGenerate.addEventListener('click', () => {
        const rows = 200;
        const data = [];
        for (let i = 0; i < rows; i++) {
          const x1 = Math.random() * 10;
          const x2 = Math.random() * 5;
          const x3 = Math.random() * 2;
          const y = (x1 * 0.5 + x2 * 0.3 + x3 * 0.2 + Math.random() * 0.5) > 4 ? 1 : 0;
          data.push({ x1: +x1.toFixed(4), x2: +x2.toFixed(4), x3: +x3.toFixed(4), y });
        }
        parseJSON(JSON.stringify(data));
      });
    }

    deHead.addEventListener('input', (e) => {
      if (!e.target.classList.contains('de-header-input')) return;
      const col = parseInt(e.target.dataset.col);
      deHeaders[col] = e.target.value;
      const roleLabel = deRoles.querySelectorAll('.de-col-name')[col];
      if (roleLabel) roleLabel.textContent = e.target.value || `col_${col}`;
    });

    deBody.addEventListener('input', (e) => {
      if (!e.target.classList.contains('de-cell-input')) return;
      const r = parseInt(e.target.dataset.row);
      const c = parseInt(e.target.dataset.col);
      deRows[r][c] = e.target.value;
    });

    deRoles.addEventListener('change', (e) => {
      if (!e.target.classList.contains('de-role-select')) return;
      deColRoles[parseInt(e.target.dataset.col)] = e.target.value;
    });

    deModal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !e.target.classList.contains('de-cell-input')) return;
      e.preventDefault();
      const r = parseInt(e.target.dataset.row);
      const c = parseInt(e.target.dataset.col);
      let nextR = r;
      let nextC = c;
      if (e.shiftKey) {
        nextC--;
        if (nextC < 0) { nextC = deHeaders.length - 1; nextR--; }
      } else {
        nextC++;
        if (nextC >= deHeaders.length) { nextC = 0; nextR++; }
      }
      if (nextR >= 0 && nextR < deRows.length) {
        const nextInput = deBody.querySelector(`input[data-row="${nextR}"][data-col="${nextC}"]`);
        if (nextInput) { nextInput.focus(); nextInput.select(); }
      } else if (nextR >= deRows.length && !e.shiftKey) {
        deRows.push(new Array(deHeaders.length).fill(''));
        deRenderTable();
        const newInput = deBody.querySelector(`input[data-row="${nextR}"][data-col="0"]`);
        if (newInput) { newInput.focus(); newInput.select(); }
      }
    });

    document.getElementById('de-add-col').addEventListener('click', () => {
      deHeaders.push(`col_${deHeaders.length}`);
      deColRoles.push('feature');
      deRows.forEach((row) => row.push(''));
      deRenderTable();
    });

    document.getElementById('de-add-row').addEventListener('click', () => {
      deRows.push(new Array(deHeaders.length).fill(''));
      deRenderTable();
      const newInput = deBody.querySelector(`input[data-row="${deRows.length - 1}"][data-col="0"]`);
      if (newInput) newInput.focus();
    });

    document.getElementById('de-del-col').addEventListener('click', () => {
      if (deHeaders.length === 0) return;
      deHeaders.pop();
      deColRoles.pop();
      deRows.forEach((row) => row.pop());
      deRenderTable();
    });

    document.getElementById('de-del-row').addEventListener('click', () => {
      if (deRows.length === 0) return;
      deRows.pop();
      deRenderTable();
    });

    document.getElementById('btn-manual').addEventListener('click', openDatasetEditor);
    document.getElementById('dataset-editor-close').addEventListener('click', closeDatasetEditor);
    deModal.querySelector('.modal-overlay').addEventListener('click', closeDatasetEditor);
    document.getElementById('de-cancel').addEventListener('click', closeDatasetEditor);

    document.getElementById('de-apply').addEventListener('click', () => {
      const headers = deHeaders.map((h, i) => h.trim() || `col_${i}`);
      const rows = deRows.filter((row) => row.some((v) => v !== ''));
      if (headers.length === 0) { alert('Add at least one column.'); return; }
      if (rows.length === 0) { alert('Add at least one data row.'); return; }

      setDataset({ headers, rows: rows.map((r) => [...r]), columns: [] });
      buildDataset();
      const dataset = getDataset();
      deColRoles.forEach((role, i) => {
        if (dataset.columns[i]) dataset.columns[i].role = role;
      });
      renderColumns();
      closeDatasetEditor();
      logOutput(`Manual dataset applied - ${rows.length} rows, ${headers.length} columns`);
    });

    const splitTrain = document.getElementById('split-train');
    const splitVal = document.getElementById('split-val');
    if (splitTrain) splitTrain.addEventListener('input', updateSplit);
    if (splitVal) splitVal.addEventListener('input', updateSplit);

    return {
      parseCSV,
      parseJSON,
      buildDataset,
      renderColumns,
      updateSplit,
      applyTemplateDataset
    };
  };
})();
