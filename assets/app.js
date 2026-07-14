(function(){
  const SESSION_KEY = 'manus_api_explorer_session';

  const endpointEl = document.getElementById('endpoint');
  const clientEl = document.getElementById('client');
  const instanceEl = document.getElementById('instance');
  const usernameEl = document.getElementById('username');
  const passwordEl = document.getElementById('password');
  const btnTogglePw = document.getElementById('btnTogglePw');
  const baseUrlEl = document.getElementById('baseUrl');
  const authStatus = document.getElementById('authStatus');

  // const schemaUrlEl = document.getElementById('schemaUrl'); // removed - element doesn't exist

  const schemaStatus = document.getElementById('schemaStatus');
  const opFilterEl = document.getElementById('opFilter');
  const schemaResourceEl = document.getElementById('schemaResource');
  const btnLoadResource = document.getElementById('btnLoadResource');
  if (btnLoadResource) btnLoadResource.style.display = 'none';
  const schemaJsonEl = document.getElementById('schemaJson');

  const opListEl = document.getElementById('opList');

  const opTitleEl = document.getElementById('opTitle');
  const opDescEl = document.getElementById('opDesc');
  const paramArea = document.getElementById('paramArea');
  const btnSend = document.getElementById('btnSend');
  const btnCopyUrl = document.getElementById('btnCopyUrl');
  const btnDownloadResponse = document.getElementById('btnDownloadResponse');
  const btnCopyResponse = document.getElementById('btnCopyResponse');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const requestUrlEl = document.getElementById('requestUrl');
  const requestUrlDisplayEl = document.getElementById('requestUrlDisplay');
  const requestUrlQueryEl = document.getElementById('requestUrlQuery');
  const requestVersionEl = document.getElementById('requestVersion');
  const requestVersionHintEl = document.getElementById('requestVersionHint');
  const authPreviewWrapEl = document.getElementById('authPreviewWrap');
  const requestHeadersPreviewEl = document.getElementById('requestHeadersPreview');
  const tokenPreviewEl = document.getElementById('tokenPreview');
  const tokenExpiryInfoEl = document.getElementById('tokenExpiryInfo');
  const previewLimitEl = document.getElementById('previewLimit');
  const reqStatus = document.getElementById('reqStatus');

  const respMetaEl = document.getElementById('respMeta');
  const respSummaryEl = document.getElementById('respSummary');
  const respJsonEl = document.getElementById('respJson');
  const respTableEl = document.getElementById('respTable');
  const respTabs = document.getElementById('respTabs');
  const _rememberedNodeIdByInstance = Object.create(null);

  function migrateLegacySession(){
    try{
      const legacy = sessionStorage.getItem(SESSION_KEY);
      if (legacy && !localStorage.getItem(SESSION_KEY)){
        localStorage.setItem(SESSION_KEY, legacy);
      }
    }catch(e){}
  }

  function readSession(){
    try{
      migrateLegacySession();
      return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
    }catch(e){
      return null;
    }
  }

  function saveSession(x){
    try{
      if (x === null){
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        localStorage.setItem(SESSION_KEY, JSON.stringify(x||null));
      }
    }catch(e){}
  }

  function currentAuthScope(){
    // Tie auth to the *exact* base path (endpoint + client + instance)
    return buildBasePath();
  }

  function ensureSessionMatchesScope(){
    const s = readSession();
    if (!s || !s.token) return true; // nothing to validate

    const scopeNow = currentAuthScope();
    const scopeThen = String(s.scope_basePath || '');

    // If user changes endpoint/client/instance, invalidate the token
    if (scopeThen && scopeNow && scopeThen !== scopeNow){
      saveSession(null);
      setAuthStatus('Client/instance changed. Please log in again.', 'warn');
      return false;
    }
    return true;
  }

  // ✅ NEW: central wrapper to always save scope with the token
  function saveAuthSession(token, tokenResp, expiresAt){
    saveSession({
      token: token,
      token_response: tokenResp,
      expires_at_ms: expiresAt,
      scope_basePath: currentAuthScope()
    });
  }

  function normalizeSegment(s){ return (s||'').trim().replace(/^\/+|\/+$/g,'') }

function todayISO(){
  // Local date in YYYY-MM-DD (avoid UTC day shift)
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

  // FIX: Prevent duplicate /{client}/{instance} when endpoint already ends with them.
  function buildBasePath(){
    const origin = String(endpointEl.value||'').trim().replace(/\/+$/,'');
    const client = normalizeSegment(clientEl.value);
    const instance = normalizeSegment(instanceEl.value);

    if (!origin) return '';
    if (!client) return origin; // allow viewing base host before client entered
    if (!instance) return origin + '/' + client;
    return origin + '/' + client + '/' + instance;
  }

  function pathJoin(base, p){
    return base.replace(/\/+$/,'') + (p ? '/' + String(p).replace(/^\/+/, '') : '');
  }
  function setAuthStatus(msg, level){ authStatus.textContent = msg||''; authStatus.className='status '+(level==='ok'?'ok':level==='warn'?'warn':level==='danger'?'danger':'') }
  function setSchemaStatus(msg, level){ schemaStatus.textContent = msg||''; schemaStatus.className='status '+(level==='ok'?'ok':level==='warn'?'warn':level==='danger'?'danger':'') }
  function setReqStatus(msg, level){ reqStatus.textContent = msg||''; reqStatus.className='status '+(level==='ok'?'ok':level==='warn'?'warn':level==='danger'?'danger':'') }

  function computeExpiryMs(tokenResp){
    if (!tokenResp) return null;
    const ei = tokenResp.expires_in;
    if (typeof ei === 'number' && isFinite(ei)) return Date.now() + ei*1000;
    if (typeof ei === 'string' && ei.trim() !== '' && !isNaN(Number(ei))) return Date.now() + Number(ei)*1000;
    return null;
  }


  function isVersionedResourcePath(path){
    const p = String(path || '').toLowerCase();
    return p.includes('/employee/contract') || p.endsWith('/employee/contract') || p.includes('/contract') || p.endsWith('/contract');
  }

  function getSelectedApiVersion(){
    return String((requestVersionEl && requestVersionEl.value) || '1');
  }

  function buildAcceptHeaderForPath(path){
    const version = getSelectedApiVersion();
    if (isVersionedResourcePath(path) && version === '2') return 'application/json; version=2';
    return 'application/json';
  }

  function buildRequestHeaders(path, extra){
    const headers = Object.assign({ Accept: buildAcceptHeaderForPath(path) }, extra || {});
    return headers;
  }

  function formatUtcDateTime(ms){
    if (!ms || !isFinite(ms)) return '';
    const d = new Date(ms);
    const pad = n => String(n).padStart(2,'0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function updateAuthPreviewVisibility(){
    if (!authPreviewWrapEl) return;
    const s = readSession();
    const hasToken = !!(s && s.token);
    const hasDraftValues = [endpointEl, clientEl, instanceEl, usernameEl, passwordEl].some(function(el){
      if (!el || el.disabled) return false;
      return !!String(el.value || '').trim();
    });
    authPreviewWrapEl.classList.toggle('is-hidden', !(hasToken || hasDraftValues));
  }

  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function maskPreviewValue(value){
    const s = String(value == null ? '' : value);
    if (!s) return s;
    return s.slice(0, 3) + '...';
  }

  function maskTokenResponseForPreview(obj){
    if (!obj || typeof obj !== 'object') return obj;
    let clone;
    try {
      clone = JSON.parse(JSON.stringify(obj));
    } catch (e) {
      return obj;
    }
    ['access_token','token','accessToken','id_token','refresh_token'].forEach(function(key){
      if (clone[key] != null && clone[key] !== '') clone[key] = maskPreviewValue(clone[key]);
    });
    return clone;
  }

  function shouldMaskQueryParam(key){
    const k = String(key || '').toLowerCase();
    return ['token','access_token','id_token','refresh_token','authorization','auth','apikey','api_key'].includes(k);
  }

  function updateTokenPreview(){
    const base = buildBasePath();
    const tokenUrl = base ? (base + '/app/token') : '/app/token';
    const body = new URLSearchParams();
    body.set('grant_type', 'password');
    body.set('username', String(usernameEl.value || ''));
    body.set('password', passwordEl.value ? '********' : '');
    const s = readSession();
    const tr = s && s.token_response ? s.token_response : null;
    const maskedTokenResponse = tr ? maskTokenResponseForPreview(tr) : null;
    tokenPreviewEl.innerHTML =
      '<div class="req-line">' +
        '<span class="method">POST</span>' +
        '<span class="url">' + escapeHtml(tokenUrl) + '</span>' +
      '</div>' +
      '<div class="req-box">' +
        '<div class="req-title">Headers</div>' +
        '<pre>Content-Type: application/x-www-form-urlencoded</pre>' +
      '</div>' +
      '<div class="req-box">' +
        '<div class="req-title">Body</div>' +
        '<pre>' + escapeHtml(body.toString()) + '</pre>' +
      '</div>' +
      '<div class="req-box">' +
        '<div class="req-title">Token Response</div>' +
        '<pre>' + escapeHtml(maskedTokenResponse ? JSON.stringify(maskedTokenResponse, null, 2) : 'Authenticate to see token response preview.') + '</pre>' +
      '</div>';

    const raw = tr && tr.expires_in !== undefined ? String(tr.expires_in) : '';
    if (raw) {
      const seconds = Number(raw);
      const days = isFinite(seconds) ? (seconds / 86400) : NaN;
      const expiryText = s && s.expires_at_ms ? formatUtcDateTime(s.expires_at_ms) : '';
      tokenExpiryInfoEl.textContent = 'expires_in raw value: ' + raw + ' seconds' +
        (isFinite(days) ? ' (' + days.toFixed(2) + ' days)' : '') + '. This represents how long the bearer token remains valid after it was issued.' +
        (expiryText ? ' Calculated expiry moment: ' + expiryText + '.' : '');
    } else {
      tokenExpiryInfoEl.textContent = 'Token expiration will be shown here after authentication.';
    }
    updateAuthPreviewVisibility();
  }

  function updateRequestVersionUi(){
    const applicable = !!(selectedOp && isVersionedResourcePath(selectedOp.path));
    requestVersionEl.disabled = !applicable;
    if (!applicable) requestVersionEl.value = '1';
    requestVersionHintEl.textContent = '';
    requestVersionHintEl.style.display = 'none';
  }

  function updateRequestHeadersPreview(){
    if (!selectedOp) {
      requestHeadersPreviewEl.textContent = 'No operation selected.';
      updateRequestVersionUi();
      return;
    }
    updateRequestVersionUi();
    const hdrs = buildRequestHeaders(selectedOp.path);
    try {
      const auth = getAuthHeader();
      Object.assign(hdrs, auth);
    } catch (e) {}
    const lines = Object.entries(hdrs).map(([k,v]) => k + ': ' + (String(k).toLowerCase() === 'authorization' ? 'Bearer ' + maskPreviewValue(String(v).replace(/^Bearer\s+/i, '')) : v));
    requestHeadersPreviewEl.textContent = lines.join('\n');
  }

  function getAuthHeader(){
    if (!ensureSessionMatchesScope()) throw new Error('Not authenticated');

    const s = readSession();
    if (!s || !s.token) throw new Error('Not authenticated');

    // ✅ FIXED: clear session on expiry
    if (s.expires_at_ms && s.expires_at_ms <= Date.now()){
      saveSession(null);
      throw new Error('Token expired; please log in again');
    }

    return { Authorization: 'Bearer ' + s.token };
  }

  async function fetchJsonWithAuth(url){
    try{
      const headers = buildRequestHeaders(url, getAuthHeader());
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    }catch(e){
      const r2 = await fetch(url, { headers: buildRequestHeaders(url) });
      if (!r2.ok) throw new Error('HTTP ' + r2.status);
      return await r2.json();
    }
  }

  async function apiSend(method, url){
    const headers = buildRequestHeaders(url, getAuthHeader());
    const t0 = performance.now();
    const resp = await fetch(url, { method, headers });
    const t1 = performance.now();
    const text = await resp.text();
    const ms = Math.round(t1 - t0);
    let json = null; let parseErr = null;
    if (text){ try{ json = JSON.parse(text); }catch(e){ parseErr = e; } }
    return { ok: resp.ok, status: resp.status, statusText: resp.statusText, ms, text, json, parseErr };
  }

  function safeStringify(obj, maxChars){
    try{
      const s = JSON.stringify(obj, null, 2);
      if (maxChars && s.length > maxChars) return s.slice(0, maxChars) + "\n… (truncated)";
      return s;
    }catch(e){ return String(obj) }
  }
  function humanBytes(n){ if (!isFinite(n) || n < 0) return ''; const units=['B','KB','MB','GB']; let u=0,x=n; while(x>=1024&&u<units.length-1){x/=1024;u++} return Math.round(x*10)/10 + ' ' + units[u] }
  function estimateSizeBytes(obj){ try{ return new Blob([JSON.stringify(obj)]).size }catch(e){ return NaN } }
  async function copyToClipboard(text){ try{ await navigator.clipboard.writeText(text); return true }catch(e){ const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); return true } }
  function downloadJson(data, filename){ const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename || 'response.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

  // ----- Helpers: nodeId / employeeId picker -----
  const pickerOverlay = document.getElementById('pickerOverlay');
  const pickerTitleEl = document.getElementById('pickerTitle');
  const pickerHintEl = document.getElementById('pickerHint');
  const pickerSearchEl = document.getElementById('pickerSearch');
  const pickerListEl = document.getElementById('pickerList');
  const pickerMetaEl = document.getElementById('pickerMeta');
  const pickerCloseTop = document.getElementById('pickerCloseTop');
  const pickerCloseBottom = document.getElementById('pickerCloseBottom');

  let pickerCurrent = null; // { type, targetInput, items }
  function showPicker(show){
    pickerOverlay.style.display = show ? 'flex' : 'none';
    pickerOverlay.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show){
      pickerCurrent = null;
      pickerListEl.innerHTML = '';
      pickerMetaEl.textContent = '';
      pickerSearchEl.value = '';
    } else {
      setTimeout(()=>pickerSearchEl.focus(), 0);
    }
  }
  pickerCloseTop.addEventListener('click', ()=>showPicker(false));
  pickerCloseBottom.addEventListener('click', ()=>showPicker(false));
  pickerOverlay.addEventListener('click', (e)=>{ if (e.target === pickerOverlay) showPicker(false); });
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && pickerOverlay.style.display === 'flex') showPicker(false); });

  function pickLabel(item, type){
    if (!item || typeof item !== 'object') return String(item);

    if (type === 'nodeId'){
      const indent = item.depth ? '\u00A0\u00A0'.repeat(item.depth) + '└ ' : '';
      const code = item.code ? item.code + ' — ' : '';
      const name = item.name || '';
      const id = item.nodeId || item.id || '';
      return indent + code + name + (id ? ' (' + id + ')' : '');
    }

    if (type === 'employeeId'){
      const nm = item.name || item.fullName || item.displayName || '';
      const nr = item.employeeNumber || item.number || item.code || '';
      return (nr ? nr + ' — ' : '') + nm + (item.id ? ' ('+item.id+')' : '');
    }
    return (item.id ? item.id : JSON.stringify(item));
  }

  function renderPickerItems(){
    const q = String(pickerSearchEl.value||'').trim().toLowerCase();
    const items = (pickerCurrent && pickerCurrent.items) ? pickerCurrent.items : [];
    const filtered = !q ? items : items.filter(it => {
      const s = pickLabel(it, pickerCurrent.type).toLowerCase();
      return s.includes(q);
    });

    const maxShow = 200;
    const show = filtered.slice(0, maxShow);

    // Build table
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Pick','Label'].forEach(h => { const th=document.createElement('th'); th.textContent=h; trh.appendChild(th); });
    thead.appendChild(trh); table.appendChild(thead);
    const tbody = document.createElement('tbody');

    for (const it of show){
      const tr=document.createElement('tr');
      const tdPick=document.createElement('td');
      const btn=document.createElement('button'); btn.className='btn'; btn.type='button'; btn.textContent='Use';
      btn.addEventListener('click', ()=>{
        const id = (it && typeof it === 'object') ? (it.nodeId || it.id || it.employeeId) : String(it);
        if (pickerCurrent && pickerCurrent.targetInput && id){
          pickerCurrent.targetInput.value = String(id);
          pickerCurrent.targetInput.dispatchEvent(new Event('input', { bubbles:true }));
        }
        showPicker(false);
      });
      tdPick.appendChild(btn);
      const tdLabel=document.createElement('td'); tdLabel.textContent = pickLabel(it, pickerCurrent.type);
      tr.appendChild(tdPick); tr.appendChild(tdLabel);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    pickerListEl.innerHTML='';
    pickerListEl.appendChild(table);

    pickerMetaEl.textContent = 'Showing ' + show.length + ' of ' + filtered.length + ' matches (loaded: ' + items.length + ').';
  }
  pickerSearchEl.addEventListener('input', renderPickerItems);

  async function fetchHelperList(type){
    const base = buildBasePath();
    if (!base) throw new Error('Base path is empty.');

    if (type === 'nodeId'){
      const url = base + '/api/user/node-tree';
      return await fetchJsonWithAuth(url);
    }

    if (type === 'employeeId'){
      // Try employee-compact first, fallback to employee
      const tries = [
        base + '/api/node/employee-compact/',
        base + '/api/node/employee/'
      ];
      let lastErr = null;
      for (const u of tries){
        try{
          return await fetchJsonWithAuth(u);
        }catch(e){
          lastErr = e;
        }
      }
      throw lastErr || new Error('Employee helper failed.');
    }

    throw new Error('Unknown picker type: ' + type);
  }

  async function openPicker(type, targetInput){
    try{
      pickerTitleEl.textContent = (type === 'nodeId') ? 'Pick nodeId' : (type === 'employeeId') ? 'Pick employeeId' : 'Pick';
      pickerHintEl.textContent = (type === 'nodeId')
        ? 'Loads /api/user/node-tree and lets you pick a nodeId.'
        : 'Loads a lightweight employee list (tries employee-compact then employee) and lets you pick an id.';
      pickerListEl.innerHTML = '<div class="small" style="padding:10px">Loading…</div>';
      pickerMetaEl.textContent = '';
      showPicker(true);
      const data = await fetchHelperList(type);

      // Normalize to array
      let items = [];
      if (type === 'nodeId'){
        // API returns a root object with nested items
        items = flattenNodeTree(data);
      } else {
        // existing behavior for other pickers
        items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : (data && Array.isArray(data.data) ? data.data : []));
      }

      pickerCurrent = { type, targetInput, items };
      renderPickerItems();
    }catch(e){
      pickerListEl.innerHTML = '<div class="status danger" style="margin:10px">Picker failed: ' + escapeHtml(String(e && e.message ? e.message : e)) + '</div>';
      pickerMetaEl.textContent = '';
    }
  }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  function flattenNodeTree(root){
    const out = [];
    const stack = [{ node: root, depth: 0 }];

    while (stack.length){
      const { node, depth } = stack.pop();
      if (!node || typeof node !== 'object') continue;

      // The API uses nodeId (not id)
      const nodeId = node.nodeId || node.id;
      if (nodeId){
        out.push({
          nodeId: nodeId,
          code: node.code || '',
          name: node.name || '',
          level: node.level,
          accessible: node.accessible,
          depth: depth
        });
      }

      const kids = Array.isArray(node.items) ? node.items : [];
      // push reversed so first items stay first visually
      for (let i = kids.length - 1; i >= 0; i--){
        stack.push({ node: kids[i], depth: depth + 1 });
      }
    }

    return out;
  }

  async function preloadTopNodeLabelInto(inputEl){
    try{
      const base = buildBasePath();
      if (!base) return;

      // only if authenticated
      try{ getAuthHeader(); }catch(_){ return; }

      inputEl.dataset.nodePickerLoading = '1';

      const url = base + '/api/user/node-tree';
      const root = await fetchJsonWithAuth(url);

      const label = (root && root.name)
        ? ((root.code ? root.code + ' — ' : '') + root.name)
        : '';

      if (label){
        inputEl.dataset.nodePickerRootLabel = label;
        inputEl.placeholder = 'Click to pick nodeId (root: ' + label + ')';
      } else {
        inputEl.placeholder = 'Click to pick nodeId';
      }

      inputEl.dataset.nodePickerLoading = '0';
    }catch(_){
      inputEl.dataset.nodePickerLoading = '0';
    }
  }

  // Helper to build hierarchical tree from paths
  function buildPathTree(operations) {
    const items = [];

    for (const op of operations) {
      let path = op.path;
      // Remove /api/ prefix OR /schema/ prefix (they're mutually exclusive)
      path = path.replace(/^\/api\//, '').replace(/^\/schema\//, '');
      // Split by / and filter out empty strings and trailing slashes
      const parts = path.split('/').filter(p => p && p.trim());

      items.push({
        op: op,
        parts: parts,
        sortKey: parts.join('/').toLowerCase()
      });
    }

    // Sort by the full path
    items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    return items;
  }

  let ops = [];
  let selectedOp = null;
  let lastResponse = null;
  let lastResponseMeta = null;
  let currentOps = [];
  let _renderingOpList = false; // guard: prevents renderOpList → selectOperation → renderOpList loop

  function linkDocsToOps(pathBase, links){
    const out = [];
    (links||[]).forEach((link, idx)=>{
      const title = link.title || link.rel || ('link-' + idx);
      const href = (link.href && (link.href.template || link.href)) || '';
      const template = String(href || '').replace(/\/+$/,'');
      const path = (template && template !== '/') ? (pathBase.replace(/\/+$/,'') + (template.startsWith('/') ? template : '/' + template)) : pathBase;

      const vars = (link.href && link.href.vars) ? link.href.vars : {};
      const pathParams = Object.keys(vars).map(name=>{
        const v = vars[name] || {};
        return { name, in:'path', required:true, schema:{ type: v.type || v.format || 'string' }, description: v.description || '' };
      });

      let queryParams = [];
      if (link.schema && link.schema.properties && typeof link.schema.properties === 'object'){
        queryParams = Object.keys(link.schema.properties).map(k=>{
          const s = link.schema.properties[k];
          return { name:k, in:'query', required:false, schema:s, description: (s && s.description) ? s.description : '' };
        });
      }

      out.push({ id: 'GET ' + path + '#' + idx, method:'GET', path, title, summary:title, parameters:[...pathParams, ...queryParams] });
    });
    return out;
  }

  function renderOpList(){
    const q = String(opFilterEl.value || '').trim().toLowerCase();
    opListEl.innerHTML = '';

    // Filter first
    const filtered = !q
      ? ops
      : ops.filter(o => (o.path + ' ' + (o.summary || '')).toLowerCase().includes(q));

    // Keep current list accessible globally (for auto-select helper, etc.)
    window.currentOps = filtered;

    if (!filtered.length){
      const d = document.createElement('div');
      d.className = 'small';
      d.style.padding = '10px';
      d.textContent = 'No operations match the filter.';
      opListEl.appendChild(d);
      return;
    }

    // Build sorted items with hierarchy info
    const items = buildPathTree(filtered);

    for (const item of items){
      const o = item.op;
      const parts = item.parts;

      if (!parts || parts.length === 0) continue;

      const level = Math.max(0, parts.length - 1);              // Indent based on depth
      const displayPath = parts[parts.length - 1] || 'unknown';  // Show only last segment
      const isGet = (o.method || '').toUpperCase() === 'GET';

      const div = document.createElement('div');
      div.className = 'op' + (selectedOp && selectedOp === o ? ' active' : '');

      // Apply indentation
      const indentPx = 8 + (level * 20);
      div.style.paddingLeft = indentPx + 'px';

      div.addEventListener('click', () => selectOperation(o));

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = o.method;

      // Color code the method badge (keeping your behavior)
      if (o.method === 'POST') badge.style.background = '#dcfce7';
      else if (o.method === 'PUT') badge.style.background = '#fef3c7';
      else if (o.method === 'PATCH') badge.style.background = '#e0e7ff';
      else if (o.method === 'DELETE') badge.style.background = '#fee2e2';

      const top = document.createElement('div');
      top.className = 'top';

      const path = document.createElement('div');
      path.className = 'path';
      path.textContent = displayPath;

      // subtle indicator for hierarchy
      if (level > 0) path.style.opacity = '0.85';

      top.appendChild(badge);
      top.appendChild(path);

      const sum = document.createElement('div');
      sum.className = 'sum';
      sum.textContent = o.summary || '';

      div.appendChild(top);
      div.appendChild(sum);
      opListEl.appendChild(div);
    }

    // Do not auto-select an operation. The user must click the GET operation they want.
  }

  function autoSelectFirstGetOrFirstOp() {
    if (!window.currentOps || !window.currentOps.length) return;

    let op = window.currentOps.find(o => (o.method || '').toLowerCase() === 'get');
    if (!op) op = window.currentOps[0];

    if (op) selectOperation(op);
  }

  function setActiveTab(name){
    const tabs = respTabs.querySelectorAll('.tab');
    tabs.forEach(t=>t.classList.toggle('active', t.dataset.tab===name));
    respSummaryEl.style.display = (name==='summary') ? '' : 'none';
    respJsonEl.style.display = (name==='json') ? '' : 'none';
    respTableEl.style.display = (name==='table') ? '' : 'none';

    // keep copy/export buttons in sync when switching tabs
    if (typeof updateResponseCopyExportState === 'function') updateResponseCopyExportState();
  }

  function isPlainObject(v){
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function flattenRow(obj, maxDepth = 2, prefix = '', out = {}){
    if (!isPlainObject(obj)) return out;

    for (const [key, value] of Object.entries(obj)){
      const col = prefix ? (prefix + '.' + key) : key;

      if (value == null){
        out[col] = '';
        continue;
      }

      if (Array.isArray(value)){
        if (!value.length){
          out[col] = '';
        } else if (maxDepth > 0 && value.every(isPlainObject)){
          out[col] = '[' + value.length + ']';

          const first = value[0];
          for (const [childKey, childVal] of Object.entries(first)){
            const childCol = col + '[0].' + childKey;

            if (childVal == null){
              out[childCol] = '';
            } else if (typeof childVal !== 'object'){
              out[childCol] = childVal;
            } else if (Array.isArray(childVal)){
              out[childCol] = '[' + childVal.length + ']';
            } else if (maxDepth > 1){
              flattenRow(childVal, maxDepth - 1, childCol, out);
            } else {
              out[childCol] = '{...}';
            }
          }
        } else {
          out[col] = '[' + value.length + ']';
        }
        continue;
      }

      if (isPlainObject(value)){
        if (maxDepth > 0){
          flattenRow(value, maxDepth - 1, col, out);
        } else {
          out[col] = '{...}';
        }
        continue;
      }

      out[col] = value;
    }

    return out;
  }

  function inferColumns(items, maxDepth = 2){
    const cols = new Set();

    for (let i = 0; i < items.length; i++){
      const flat = flattenRow(items[i], maxDepth);
      for (const key of Object.keys(flat)) cols.add(key);
    }

    return Array.from(cols);
  }

  function getColumnLeafName(col){
    return String(col || '')
      .replace(/\[\d+\]/g, '')
      .split('.')
      .pop()
      .toLowerCase();
  }

  function isConvertedMeasureColumn(col){
    const leaf = getColumnLeafName(col);
    return leaf === 'duration' || leaf === 'amount';
  }

  function toFiniteNumber(v){
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v === 'string'){
      const trimmed = v.trim();
      if (!trimmed) return NaN;
      const n = Number(trimmed.replace(',', '.'));
      return isFinite(n) ? n : NaN;
    }
    return NaN;
  }

  function formatDecimal2(n){
    return isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : '';
  }

  function formatCell(v, col){
    if (v === null || v === undefined) return '';
    if (isConvertedMeasureColumn(col)){
      const n = toFiniteNumber(v);
      if (isFinite(n)) return formatDecimal2(n / 60);
    }
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return '[' + v.length + ']';
    if (typeof v === 'object') return '{...}';
    return String(v);
  }

  function objectMapToRows(obj, keyName = '_key'){
    return Object.entries(obj || {}).map(([k, v]) => {
      if (isPlainObject(v)) return { [keyName]: k, ...v };
      return { [keyName]: k, value: v };
    });
  }

  function getTableCandidates(data){
    const candidates = [];

    if (Array.isArray(data) && data.length && data.some(isPlainObject)){
      candidates.push({ name: 'root', rows: data.filter(isPlainObject) });
      return candidates;
    }

    if (!isPlainObject(data)) return candidates;

    for (const [key, value] of Object.entries(data)){
      if (Array.isArray(value) && value.length && value.some(isPlainObject)){
        candidates.push({ name: key, rows: value.filter(isPlainObject) });
        continue;
      }

      if (isPlainObject(value)){
        const vals = Object.values(value);
        if (vals.length && vals.every(v => v == null || isPlainObject(v) || typeof v !== 'object')){
          candidates.push({ name: key, rows: objectMapToRows(value) });
        }
      }
    }

    return candidates;
  }

  function makeCell(text, raw){
    const td = document.createElement('td');
    td.textContent = text;
    td.title = raw !== undefined && raw !== text ? (text + ' (raw: ' + raw + ')') : text;
    return td;
  }

  function buildTable(rows, cols){
    const table = document.createElement('table');
    table.className = 'responseTable';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    for (const c of cols){
      const th = document.createElement('th');
      th.textContent = c;
      th.title = c;
      trh.appendChild(th);
    }

    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of rows){
      const tr = document.createElement('tr');
      for (const c of cols){
        const raw = row[c];
        tr.appendChild(makeCell(formatCell(raw, c), raw == null ? '' : String(raw)));
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    return table;
  }

  function createColumnSelector(allCols, selectedCols, onChange){
    const wrap = document.createElement('div');
    wrap.className = 'tableControls';

    const details = document.createElement('details');
    details.className = 'columnSelector';

    const summary = document.createElement('summary');
    summary.style.cursor = 'pointer';
    summary.style.userSelect = 'none';
    details.appendChild(summary);

    const actions = document.createElement('div');
    actions.className = 'columnSelectorActions';

    function miniBtn(label, fn){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn mini';
      btn.textContent = label;
      btn.addEventListener('click', fn);
      return btn;
    }

    const filter = document.createElement('input');
    filter.type = 'text';
    filter.placeholder = 'Filter columns...';
    filter.className = 'columnFilter';

    const list = document.createElement('div');
    list.className = 'columnSelectorList';

    function updateSummary(){
      summary.textContent = 'Columns (' + selectedCols.size + '/' + allCols.length + ')';
    }

    function renderChecks(){
      updateSummary();
      list.innerHTML = '';
      const q = String(filter.value || '').trim().toLowerCase();
      const visibleCols = q ? allCols.filter(col => col.toLowerCase().includes(q)) : allCols;

      for (const col of visibleCols){
        const label = document.createElement('label');
        label.className = 'columnOption';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selectedCols.has(col);
        cb.addEventListener('change', () => {
          if (cb.checked) selectedCols.add(col);
          else selectedCols.delete(col);

          if (!selectedCols.size && allCols.length){
            selectedCols.add(allCols[0]);
          }

          renderChecks();
          onChange(Array.from(selectedCols));
        });

        const span = document.createElement('span');
        span.textContent = col;
        span.title = col;

        label.appendChild(cb);
        label.appendChild(span);
        list.appendChild(label);
      }

      if (!visibleCols.length){
        const empty = document.createElement('div');
        empty.className = 'hint';
        empty.textContent = 'No columns match the filter.';
        list.appendChild(empty);
      }
    }

    actions.appendChild(miniBtn('All', () => {
      allCols.forEach(c => selectedCols.add(c));
      renderChecks();
      onChange(Array.from(selectedCols));
    }));

    actions.appendChild(miniBtn('None', () => {
      selectedCols.clear();
      if (allCols.length) selectedCols.add(allCols[0]);
      renderChecks();
      onChange(Array.from(selectedCols));
    }));

    actions.appendChild(miniBtn('Reset', () => {
      selectedCols.clear();
      allCols.forEach(c => selectedCols.add(c));
      filter.value = '';
      renderChecks();
      onChange(Array.from(selectedCols));
    }));

    filter.addEventListener('input', renderChecks);

    details.appendChild(actions);
    details.appendChild(filter);
    details.appendChild(list);
    wrap.appendChild(details);

    renderChecks();
    return wrap;
  }

  function normalizeFilterValue(s){
    return String(s == null ? '' : s).trim().replace(/^['"]|['"]$/g, '');
  }

  function rowMatchesFilter(row, filter){
    const raw = row[filter.col];
    const target = normalizeFilterValue(filter.value);
    const op = filter.op || 'contains';
    const cellText = String(raw == null ? '' : raw);
    const cellLower = cellText.toLowerCase();
    const targetLower = target.toLowerCase();
    const cellNum = toFiniteNumber(raw);
    const targetNum = toFiniteNumber(target);

    if (op === 'empty') return cellText.trim() === '';
    if (op === 'notEmpty') return cellText.trim() !== '';
    if (op === '=') return cellLower === targetLower;
    if (op === '!=') return cellLower !== targetLower;
    if (op === 'contains') return cellLower.includes(targetLower);
    if (op === 'notContains') return !cellLower.includes(targetLower);

    if (!isFinite(cellNum) || !isFinite(targetNum)) return false;
    if (op === '>') return cellNum > targetNum;
    if (op === '>=') return cellNum >= targetNum;
    if (op === '<') return cellNum < targetNum;
    if (op === '<=') return cellNum <= targetNum;
    return true;
  }

  function applyRowFilters(rows, filters, mode){
    const active = (filters || []).filter(f =>
      f &&
      f.col &&
      (
        f.op === 'empty' ||
        f.op === 'notEmpty' ||
        String(f.value || '').trim() !== ''
      )
    );

    if (!active.length) return rows;

    const filterMode = String(mode || 'ALL').toUpperCase();

    return rows.filter(row => {
      if (filterMode === 'ANY'){
        return active.some(f => rowMatchesFilter(row, f));
      }

      return active.every(f => rowMatchesFilter(row, f));
    });
  }

  function createRowFilterControls(allCols, filters, onChange, onModeChange){
    const wrap = document.createElement('details');
    wrap.className = 'rowFilterBox';

    const summary = document.createElement('summary');
    wrap.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'rowFilterBody';
    wrap.appendChild(body);

    let filterMode = 'ALL';

    function updateSummary(){
      const active = filters.filter(f => f && f.col && (f.op === 'empty' || f.op === 'notEmpty' || String(f.value || '').trim() !== '')).length;
      summary.textContent =
      'Row filters (' + active + ') • ' +
      (filterMode === 'ANY' ? 'OR' : 'AND');
    }

    function miniBtn(label, fn){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn mini';
      btn.textContent = label;
      btn.addEventListener('click', fn);
      return btn;
    }

    function render(){
      updateSummary();
      body.innerHTML = '';

      const modeWrap = document.createElement('div');
      modeWrap.style.marginBottom = '10px';

      const modeLabel = document.createElement('label');
      modeLabel.textContent = 'Match mode';

      const modeSel = document.createElement('select');

      [['ALL', 'ALL (AND)'], ['ANY', 'ANY (OR)']].forEach(([v,t]) => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = t;
        modeSel.appendChild(opt);
      });

      modeSel.value = filterMode;

      modeSel.addEventListener('change', () => {
        filterMode = modeSel.value;
        updateSummary();

        if (typeof onModeChange === 'function'){
          onModeChange(filterMode);
        }
      });

      modeWrap.appendChild(modeLabel);
      modeWrap.appendChild(modeSel);
      body.appendChild(modeWrap);

      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Example: registerId = 1722. Use ALL (AND) or ANY (OR).';
      body.appendChild(hint);

      const rowsWrap = document.createElement('div');
      rowsWrap.className = 'rowFilterRows';
      body.appendChild(rowsWrap);

      filters.forEach((filter, idx) => {
        const row = document.createElement('div');
        row.className = 'rowFilterRow';

        const colSel = document.createElement('select');
        colSel.title = 'Column';
        for (const col of allCols){
          const opt = document.createElement('option');
          opt.value = col;
          opt.textContent = col;
          colSel.appendChild(opt);
        }
        colSel.value = filter.col || allCols[0] || '';
        colSel.addEventListener('change', () => {
          filter.col = colSel.value;
          onChange();
          render();
        });

        const opSel = document.createElement('select');
        opSel.title = 'Operator';
        [
          ['contains', 'contains'],
          ['=', '='],
          ['!=', '!='],
          ['notContains', 'not contains'],
          ['>', '>'],
          ['>=', '>='],
          ['<', '<'],
          ['<=', '<='],
          ['empty', 'is empty'],
          ['notEmpty', 'not empty']
        ].forEach(([value, label]) => {
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = label;
          opSel.appendChild(opt);
        });
        opSel.value = filter.op || 'contains';
        opSel.addEventListener('change', () => {
          filter.op = opSel.value;
          onChange();
          render();
        });

        const val = document.createElement('input');
        val.type = 'text';
        val.placeholder = 'value';
        val.value = filter.value || '';
        val.disabled = filter.op === 'empty' || filter.op === 'notEmpty';
        val.addEventListener('input', () => {
          filter.value = val.value;
          onChange();
        });

        const remove = miniBtn('Remove', () => {
          filters.splice(idx, 1);
          onChange();
          render();
        });

        row.appendChild(colSel);
        row.appendChild(opSel);
        row.appendChild(val);
        row.appendChild(remove);
        rowsWrap.appendChild(row);
      });

      const actions = document.createElement('div');
      actions.className = 'rowFilterActions';
      actions.appendChild(miniBtn('Add filter', () => {
        filters.push({ col: allCols[0] || '', op: '=', value: '' });
        render();
        onChange();
      }));
      actions.appendChild(miniBtn('Clear filters', () => {
        filters.splice(0, filters.length);
        render();
        onChange();
      }));
      body.appendChild(actions);
    }

    render();
    return wrap;
  }

  function calculateMeasureSums(rows, cols){
    const result = [];
    for (const col of cols){
      if (!isConvertedMeasureColumn(col)) continue;
      let rawTotal = 0;
      let count = 0;
      for (const row of rows){
        const n = toFiniteNumber(row[col]);
        if (isFinite(n)){
          rawTotal += n;
          count++;
        }
      }
      if (count){
        result.push({ col, count, rawTotal, convertedTotal: rawTotal / 60 });
      }
    }
    return result;
  }

  function createSumBar(filteredRows, totalRows, cols){
    const bar = document.createElement('div');
    bar.className = 'tableSummaryBar';

    const rowInfo = document.createElement('span');
    rowInfo.textContent = 'Rows: ' + filteredRows.length + ' of ' + totalRows;
    bar.appendChild(rowInfo);

    const sums = calculateMeasureSums(filteredRows, cols);
    for (const s of sums){
      const pill = document.createElement('span');
      pill.className = 'sumPill';
      pill.title = s.col + ' raw sum: ' + s.rawTotal + '. Displayed total is raw sum / 60.';
      pill.textContent = 'Σ ' + s.col + ': ' + formatDecimal2(s.convertedTotal) + ' (raw ' + s.rawTotal + ')';
      bar.appendChild(pill);
    }

    if (!sums.length){
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = 'No duration/amount columns to sum.';
      bar.appendChild(hint);
    }

    return bar;
  }

  function renderTablePreview(container, sourceRows, lim){
    container.innerHTML = '';

    if (!sourceRows || !sourceRows.length){
      const d = document.createElement('div');
      d.className = 'hint';
      d.textContent = 'No rows available for table preview.';
      container.appendChild(d);
      return;
    }

    const previewRows = sourceRows.slice(0, lim);
    const flatRows = previewRows.map(it => flattenRow(it, 2));
    const allCols = inferColumns(previewRows, 2);

    if (!allCols.length){
      const d = document.createElement('div');
      d.className = 'hint';
      d.textContent = 'No columns available for table preview.';
      container.appendChild(d);
      return;
    }

    const selectedCols = new Set(allCols);
    const filters = [];
    let filterMode = 'ALL';

    const topControls = document.createElement('div');
    topControls.className = 'tableTopControls';

    const mount = document.createElement('div');
    mount.className = 'tableMount';

    function redraw(cols){
      const visibleCols = cols && cols.length ? cols : Array.from(selectedCols);
      const filteredRows = applyRowFilters(flatRows, filters, filterMode);
      mount.innerHTML = '';
      mount.appendChild(createSumBar(filteredRows, flatRows.length, allCols));
      mount.appendChild(buildTable(filteredRows, visibleCols));
      updateResponseCopyExportState();
    }

    const selector = createColumnSelector(allCols, selectedCols, redraw);
    const filterControls = createRowFilterControls(
      allCols,
      filters,
      () => redraw(Array.from(selectedCols)),
      value => {
        filterMode = value;
        redraw(Array.from(selectedCols));
      }
    );

    topControls.appendChild(selector);
    topControls.appendChild(filterControls);
    container.appendChild(topControls);
    container.appendChild(mount);
    redraw(allCols);
  }

  function updateResponseCopyExportState(){
    btnDownloadResponse.disabled = !(lastResponse !== null && lastResponse !== undefined);
    btnCopyResponse.disabled = true;

    const activeTabEl = respTabs.querySelector('.tab.active');
    const tabName = activeTabEl ? activeTabEl.dataset.tab : 'summary';
    let visibleText = '';

    if (tabName === 'json'){
      visibleText = String(respJsonEl.textContent || '').trim();
    } else if (tabName === 'table'){
      visibleText = tableToMarkdown(respTableEl).trim();
    } else {
      visibleText = summaryToText(respSummaryEl).trim();
    }

    if (visibleText){
      const bytes = new Blob([visibleText]).size;
      btnCopyResponse.disabled = bytes > 1024 * 1024;
    }

    if (btnExportCsv){
      const hasTable = !!respTableEl.querySelector('table');
      btnExportCsv.style.display = (tabName === 'table') ? '' : 'none';
      btnExportCsv.disabled = !(tabName === 'table' && hasTable);
    }
  }

  function clearResponse(){
    lastResponse = null;
    lastResponseMeta = null;

    respMetaEl.textContent = '(none)';
    respSummaryEl.innerHTML = '';
    respJsonEl.textContent = '';
    respTableEl.innerHTML = '';

    btnDownloadResponse.disabled = true;
    btnCopyResponse.disabled = true;
  }

  function renderResponse(meta, data){
    lastResponseMeta = meta;
    lastResponse = data;

    const sizeHuman = humanBytes(estimateSizeBytes(data));
    const isArray = Array.isArray(data);
    const lim = Math.min(Number(previewLimitEl.value || 10), 1000);
    const items = isArray ? data.slice(0, lim) : data;

    let metaText = meta.status + ' ' + meta.statusText + ' • ' + meta.ms + ' ms';
    if (sizeHuman) metaText += ' • ~' + sizeHuman;

    if (isArray) {
      const total = data.length;
      const shown = items.length;
      metaText += ' • Preview: showing ' + shown + ' of ' + total + ' (limit ' + lim + ')';
      if (total > lim) metaText += ' [TRUNCATED]';
    } else {
      metaText += ' • Preview limit ' + lim + ' item(s)';
    }

    respMetaEl.textContent = metaText;

    let html = '';
    html += '<div class="status ' + (meta.ok ? 'ok' : 'danger') + '">';
    html += (meta.ok ? 'Request succeeded' : 'Request failed') + '.</div>';
    html += '<div class="small" style="margin-top:8px;">URL: <span class="mono">' +
            escapeHtml(meta.url) + '</span></div>';

    if (isArray) {
      const total = data.length;
      const shown = items.length;

      html += '<div class="hint" style="margin-top:6px;">' +
        'Preview limit: ' + lim + ' item(s). ' +
        'Showing ' + shown + ' of ' + total + ' from the response.' +
        '</div>';

      if (total > lim) {
        html += '<div class="status warn" style="margin-top:6px;">' +
          'Response truncated: only the first ' + lim +
          ' records are rendered here. Use “Download JSON” to get the full set.' +
          '</div>';
      }
    } else {
      html += '<div class="hint" style="margin-top:6px;">' +
        'Preview limit is only applied to array responses.' +
        '</div>';
    }

    if (meta.parseErr){
      html += '<div class="status warn">Response was not valid JSON (raw preview)</div>';
      const txt = meta.text || '';
      const previewTxt = txt.length > 5000
        ? (txt.slice(0,5000) + '\n… (truncated)')
        : txt;
      respSummaryEl.innerHTML = html +
        '<pre style="white-space:pre-wrap;background:#fff;border:1px solid var(--border);border-radius:12px;padding:10px;max-height:420px;overflow:auto;">' +
        escapeHtml(previewTxt) + '</pre>';
      respJsonEl.textContent = previewTxt;
      respTableEl.innerHTML = '';
      updateResponseCopyExportState();
      return;
    }

    respSummaryEl.innerHTML = html;
    respJsonEl.textContent = safeStringify(items, 250000);
    respTableEl.innerHTML = '';

    if (isArray && items.length && items.some(isPlainObject)) {
      renderTablePreview(respTableEl, items.filter(isPlainObject), lim);
    }
    else if (!isArray && data && typeof data === 'object') {
      const candidates = getTableCandidates(data);

      if (candidates.length){
        const pickerWrap = document.createElement('div');
        pickerWrap.className = 'datasetPicker';

        const lbl = document.createElement('label');
        lbl.textContent = 'Dataset';
        pickerWrap.appendChild(lbl);

        const sel = document.createElement('select');
        sel.style.width = 'auto';

        candidates.forEach((c, idx) => {
          const opt = document.createElement('option');
          opt.value = String(idx);
          opt.textContent = c.name + ' (' + c.rows.length + ')';
          sel.appendChild(opt);
        });

        const mount = document.createElement('div');

        function renderCandidate(index){
          renderTablePreview(mount, candidates[index].rows, lim);
        }

        sel.addEventListener('change', () => renderCandidate(Number(sel.value)));

        pickerWrap.appendChild(sel);
        respTableEl.appendChild(pickerWrap);
        respTableEl.appendChild(mount);
        renderCandidate(0);
      } else {
        const entries = Object.entries(data);

        if (entries.length && entries.every(([, value]) => value == null || typeof value !== 'object')) {
          const rows = entries
            .sort((a, b) => {
              const na = Number(a[0]);
              const nb = Number(b[0]);
              const aNum = !Number.isNaN(na);
              const bNum = !Number.isNaN(nb);
              if (aNum && bNum) return na - nb;
              return String(a[0]).localeCompare(String(b[0]));
            })
            .map(([key, value]) => ({ Key: key, Value: value }));

          renderTablePreview(respTableEl, rows, lim);
        } else {
          const d = document.createElement('div');
          d.className = 'hint';
          d.textContent = 'No tabular collection found in this object.';
          respTableEl.appendChild(d);
        }
      }
    }
    else {
      const d = document.createElement('div');
      d.className = 'hint';
      d.textContent = 'Table preview available for arrays of objects or objects containing table-like collections.';
      respTableEl.appendChild(d);
    }

    updateResponseCopyExportState();
  }

  function gatherParamValues(){
    const inputs = paramArea.querySelectorAll('[data-param-name]');
    const vals = { path:{}, query:{} };
    for (const el of inputs){
      const name = el.dataset.paramName;
      const where = el.dataset.paramIn;
      const required = el.dataset.required === '1';
      let raw = '';
      if (el.type === 'checkbox'){
        raw = el.checked ? 'true' : '';
      } else {
        raw = (el.value !== undefined ? String(el.value) : '').trim();
      }
      if (where === 'path'){
        if (!raw && required) return { error: 'Missing required path parameter: ' + name };
        if (raw) vals.path[name] = raw;
      } else if (where === 'query'){
        if (raw !== '') vals.query[name] = raw;
      }
    }

    if (selectedOp && selectedOp._customQueryEditor && selectedOp._customQueryEditor.isConnected){
      const rows = selectedOp._customQueryEditor.querySelectorAll('div');
      for (const r of rows){
        const ins = r.querySelectorAll('input');
        if (ins.length >= 2){
          const k = String(ins[0].value||'').trim();
          const v = String(ins[1].value||'').trim();
          if (k) vals.query[k] = v;
        }
      }
    }
    return { values: vals };
  }

  function buildUrlForOp(op){
    const base = buildBasePath();
    if (!base) return { error: 'Base path is empty. Fill endpoint + client.' };
    const got = gatherParamValues();
    if (got.error) return { error: got.error };
    const vals = got.values;

    let p = op.path || '';
    p = p.replace(/\{([^}]+)\}/g, (m, key)=>{
      const v = vals.path[key];
      return v !== undefined ? encodeURIComponent(v) : m;
    });

    const qs = new URLSearchParams();
    for (const k of Object.keys(vals.query||{})) qs.set(k, vals.query[k]);

    const url = pathJoin(base, p);
    const full = qs.toString() ? (url + (url.includes('?') ? '&' : '?') + qs.toString()) : url;
    return { url: full };
  }

  function renderRequestUrlPreview(url){
    if (!requestUrlDisplayEl || !requestUrlQueryEl) return;

    const raw = String(url || '');
    if (!raw){
      requestUrlDisplayEl.textContent = '';
      requestUrlQueryEl.innerHTML = '<div class="request-query-empty">No request URL yet.</div>';
      return;
    }

    const qIndex = raw.indexOf('?');
    const query = qIndex >= 0 ? raw.slice(qIndex + 1) : '';

    requestUrlDisplayEl.textContent = raw;

    if (!query){
      requestUrlQueryEl.innerHTML = '<div class="request-query-empty">No query parameters applied.</div>';
      return;
    }

    const params = new URLSearchParams(query);
    const chips = [];
    for (const [key, value] of params.entries()){
      const displayValue = shouldMaskQueryParam(key) ? maskPreviewValue(value) : value;
      chips.push(
        '<span class="request-query-chip">' +
          '<span class="request-query-key">' + escapeHtml(key) + '</span>' +
          '<span class="request-query-eq">=</span>' +
          '<span class="request-query-val">' + escapeHtml(displayValue) + '</span>' +
        '</span>'
      );
    }
    requestUrlQueryEl.innerHTML = chips.join('');
  }

  function updateRequestUrl(){
    if (!selectedOp){ requestUrlEl.value=''; renderRequestUrlPreview(''); btnSend.disabled=true; btnCopyUrl.disabled=true; updateRequestHeadersPreview(); return; }
    const isGet = (selectedOp.method || '').toUpperCase() === 'GET';
    if (!isGet){
      // Non-GET: show the URL for reference but disable Send
      const built = buildUrlForOp(selectedOp);
      requestUrlEl.value = built.error ? '' : built.url;
      renderRequestUrlPreview(requestUrlEl.value);
      btnSend.disabled = true;
      btnCopyUrl.disabled = !!built.error;
      setReqStatus(selectedOp.method + ' — schema reference only, sending not supported.', 'warn');
      updateRequestHeadersPreview();
      return;
    }
    const built = buildUrlForOp(selectedOp);
    if (built.error){ requestUrlEl.value=''; renderRequestUrlPreview(''); btnSend.disabled=true; btnCopyUrl.disabled=true; setReqStatus(built.error,'warn'); updateRequestHeadersPreview(); return; }
    requestUrlEl.value = built.url;
    renderRequestUrlPreview(built.url);
    btnSend.disabled=false; btnCopyUrl.disabled=false;
    setReqStatus('Ready.','');
    updateRequestHeadersPreview();
  }

  let _paramFormGeneration = 0; // incremented each time renderParamsForm is called; cancels stale async nodeId loads

function normalizeEmployeeCompact(data){
  const arr =
    Array.isArray(data) ? data :
    (data && Array.isArray(data.items)) ? data.items :
    (data && Array.isArray(data.data)) ? data.data :
    [];

  return arr.map(it => ({
    registerId: String(it.registerId || it.register || it.employeeNumber || '').trim(),
    employeeId: String(it.employeeId || it.id || '').trim()
  })).filter(it => it.employeeId);
}

async function fetchEmployeeCompactList(nodeId, dateIso){
  const base = buildBasePath();
  if (!base) throw new Error('Base path is empty.');
  if (!nodeId) throw new Error('nodeId is empty.');

  const datePart = String(dateIso || todayISO()).trim();
  const url =
    base +
    '/api/node/' +
    encodeURIComponent(nodeId) +
    '/employee-compact/' +
    encodeURIComponent(datePart);

  console.log('fetchEmployeeCompactList:', url);
  return await fetchJsonWithAuth(url);
}

function normalizeSalaryGroupList(data){
  const arr =
    Array.isArray(data) ? data :
    (data && Array.isArray(data.items)) ? data.items :
    (data && Array.isArray(data.data)) ? data.data :
    [];

  return arr.map(it => ({
    id: String(it.id ?? it.salaryGroupId ?? '').trim(),
    code: String(it.code ?? it.salaryGroupCode ?? '').trim(),
    name: String(it.name ?? it.description ?? it.salaryGroupName ?? '').trim(),
    isActive: Boolean(it.isActive)
  })).filter(it => it.id !== '');
}

function normalizeSalaryPeriodList(data){
  const arr =
    Array.isArray(data) ? data :
    (data && Array.isArray(data.items)) ? data.items :
    (data && Array.isArray(data.data)) ? data.data :
    [];

  return arr.map(it => ({
    id: String(it.id ?? it.salaryPeriodId ?? '').trim(),
    name: String(it.name ?? '').trim(),
    fromDate: String(it.fromDate ?? it.startDate ?? '').trim(),
    toDate: String(it.toDate ?? it.endDate ?? '').trim(),
    year: String(it.year ?? '').trim(),
    group: String(it.group ?? '').trim()
  })).filter(it => it.id !== '');
}

function normalizeSalarySetList(data){
  const arr =
    Array.isArray(data) ? data :
    (data && Array.isArray(data.items)) ? data.items :
    (data && Array.isArray(data.data)) ? data.data :
    [];

  return arr.map(it => ({
    id: String(it.id ?? it.setId ?? it.salarySetId ?? '').trim(),
    code: String(it.code ?? it.salarySetCode ?? '').trim(),
    name: String(it.name ?? it.description ?? it.salarySetName ?? '').trim(),
    // some responses use "default", some use "isActive"; prefer explicit truthy default
    isActive: (typeof it.isActive !== 'undefined') ? Boolean(it.isActive)
             : (typeof it.default !== 'undefined') ? Boolean(it.default)
             : true
  })).filter(it => it.id !== '');
}

async function fetchSalaryGroupList(nodeId){
  const base = buildBasePath();
  if (!base) throw new Error('Base path is empty.');
  if (!nodeId) throw new Error('nodeId is empty.');

  const url =
    base +
    '/api/node/' +
    encodeURIComponent(nodeId) +
    '/salary-group/';

  console.log('fetchSalaryGroupList:', url);
  return await fetchJsonWithAuth(url);
}

async function fetchSalarySetList(nodeId){
  const base = buildBasePath();
  if (!base) throw new Error('Base path is empty.');
  if (!nodeId) throw new Error('nodeId is empty.');

  const url =
    base +
    '/api/node/' +
    encodeURIComponent(nodeId) +
    '/salary-set/';

  console.log('fetchSalarySetList:', url);
  return await fetchJsonWithAuth(url);
}

async function fetchSalaryPeriodList(nodeId, salaryGroupId, year){
  const base = buildBasePath();

  if (!base) throw new Error('Base path empty');
  if (!nodeId) throw new Error('nodeId empty');
  if (!salaryGroupId) throw new Error('salaryGroupId empty');
  if (!year) throw new Error('year empty');

  const url =
    base +
    '/api/node/' +
    encodeURIComponent(nodeId) +
    '/salary-period/' +
    encodeURIComponent(salaryGroupId) +
    '/' +
    encodeURIComponent(year) +
    '/';

  console.log('fetchSalaryPeriodList:', url);

  return await fetchJsonWithAuth(url);
}

function currentYear(){
  return String(new Date().getFullYear());
}

function renderParamsForm(op){
  const myGeneration = ++_paramFormGeneration;

  if (selectedOp && selectedOp._customQueryEditor){
    selectedOp._customQueryEditor = null;
  }
  if (op && op._customQueryEditor){
    op._customQueryEditor = null;
  }

  if (!op){
    updateRequestUrl();
    return;
  }

  const params = op.parameters || [];
  const pathParams = params.filter(p => p.in === 'path');
  const queryParams = params.filter(p => p.in === 'query');

  function isSalaryDataResource(){
    const path = String(op.path || '').toLowerCase();
    const opId = String(op.operationId || '').toLowerCase();
    return path.includes('salary-data') || opId.includes('salary-data');
  }

  function triggerSalaryPeriodReload(){
    const salaryPeriodSel = paramArea.querySelector('[data-salary-period-select="1"]');
    if (salaryPeriodSel && typeof salaryPeriodSel._reloadSalaryPeriods === 'function'){
      salaryPeriodSel._reloadSalaryPeriods();
    }
  }

  function triggerDependentReloads(){
    const empSel = paramArea.querySelector('[data-employee-select="1"]');
    if (empSel && typeof empSel._reloadEmployees === 'function'){
      empSel._reloadEmployees();
    }

    const salaryGroupSel = paramArea.querySelector('[data-salary-group-select="1"]');
    if (salaryGroupSel && typeof salaryGroupSel._reloadSalaryGroups === 'function'){
      salaryGroupSel._reloadSalaryGroups();
    }

    const salarySetSel = paramArea.querySelector('[data-salary-set-select="1"]');
    if (salarySetSel && typeof salarySetSel._reloadSalarySets === 'function'){
      salarySetSel._reloadSalarySets();
    }

    triggerSalaryPeriodReload();
  }

  function getParamEl(name){
    return paramArea.querySelector('[data-param-name="' + name + '"]');
  }

    function setParamValue(name, value){
    const el = getParamEl(name);
    if (!el) return;

    const newValue = String(value ?? '');

    if (el.value === newValue){
      rememberSpecialParamValue(name, newValue);
      return;
    }

    el.value = newValue;
    rememberSpecialParamValue(name, newValue);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function makeInput(p){
    const wrap = document.createElement('div');
    wrap.style.marginTop = '10px';

    const lbl = document.createElement('label');
    lbl.textContent = p.name + ' (' + p.in + ')' + (p.required ? ' *' : '');
    wrap.appendChild(lbl);

    const schema = (p.schema && typeof p.schema === 'object') ? p.schema : {};
    const isBoolean =
      (String(schema.type || '').toLowerCase() === 'boolean') ||
      (String(p.type || '').toLowerCase() === 'boolean');

    let input;

    if (isBoolean && p.in === 'query'){
      input = document.createElement('input');
      input.type = 'checkbox';
      input.style.width = '20px';
      input.style.height = '20px';
      input.addEventListener('change', updateRequestUrl);
    } else {
      input = document.createElement('input');

      const typ = String((schema.type || p.type || '')).toLowerCase();
      const fmt = String((schema.format || p.format || '')).toLowerCase();

      const isDate =
        fmt === 'date' ||
        typ === 'date' ||
        /\bdate\b/i.test(p.name) ||
        /(from|to|start|end)date/i.test(p.name);

      if (p.name === 'year'){
        input.type = 'number';
        input.step = '1';
        input.value = currentYear();
        input.addEventListener('change', () => {
          updateRequestUrl();
          triggerSalaryPeriodReload();
        });
        input.addEventListener('input', () => {
          updateRequestUrl();
          triggerSalaryPeriodReload();
        });
      } else if (isDate){
        input.type = 'date';
        input.value = p.required ? todayISO() : '';
        input.addEventListener('change', updateRequestUrl);
        input.addEventListener('input', updateRequestUrl);
      } else {
        input.type = 'text';
        input.addEventListener('input', updateRequestUrl);
        input.addEventListener('change', updateRequestUrl);
      }
    }

    input.dataset.paramName = p.name;
    input.dataset.paramIn = p.in;
    input.dataset.required = p.required ? '1' : '0';
    input.placeholder = p.description || (p.required ? 'required' : '');

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    row.appendChild(input);
    wrap.appendChild(row);

    if (p.description){
      const d = document.createElement('div');
      d.className = 'hint';
      d.textContent = p.description;
      wrap.appendChild(d);
    }

    // nodeId dropdown
    if (p.in === 'path' && p.name === 'nodeId'){
      const sel = document.createElement('select');

      sel.dataset.paramName = input.dataset.paramName;
      sel.dataset.paramIn = input.dataset.paramIn;
      sel.dataset.required = input.dataset.required;

      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '-- select nodeId --';
      sel.appendChild(ph);

      row.replaceChild(sel, input);

      const filterInput = document.createElement('input');
      filterInput.type = 'text';
      filterInput.placeholder = 'Filter by node code or description...';
      filterInput.style.marginBottom = '6px';
      wrap.insertBefore(filterInput, row);

      let nodeItems = [];

      function renderNodeOptions(term){
        const currentValue = sel.value;
        const q = String(term || '').trim().toLowerCase();

        sel.innerHTML = '';

        const firstOpt = document.createElement('option');
        firstOpt.value = '';
        firstOpt.textContent = '-- select nodeId --';
        sel.appendChild(firstOpt);

        const filtered = !q
          ? nodeItems
          : nodeItems.filter(it => {
              const searchText = [it.nodeCode, it.nodeName, it.nodeId].join(' ').toLowerCase();
              return searchText.includes(q);
            });

        for (const it of filtered){
          const indent = '\u00A0\u00A0\u00A0'.repeat(it.depth || 0);
          const parts = [];
          if (it.nodeCode) parts.push('[' + it.nodeCode + ']');
          if (it.nodeName) parts.push(it.nodeName);
          parts.push(it.nodeId);

          const opt = document.createElement('option');
          opt.value = it.nodeId;
          opt.textContent = indent + parts.join(' - ');
          sel.appendChild(opt);
        }

        if ([...sel.options].some(o => o.value === currentValue)){
          sel.value = currentValue;
        }
      }

      filterInput.addEventListener('input', () => renderNodeOptions(filterInput.value));

            sel.addEventListener('change', () => {
        rememberSpecialParamValue('nodeId', sel.value);
        updateRequestUrl();
        triggerDependentReloads();
      });

      (async ()=>{
        try{
          sel.disabled = true;

          const root = await fetchHelperList('nodeId');
          if (myGeneration !== _paramFormGeneration) return;

          const items = flattenNodeTree(root);

          nodeItems = (items || [])
            .filter(n => n.accessible)
            .map(it => ({
              nodeId: String(it.nodeId || '').trim(),
              nodeCode: String(it.nodeCode || it.code || '').trim(),
              nodeName: String(it.nodeName || it.name || '').trim(),
              depth: it.depth || 0
            }))
            .filter(it => it.nodeId);

                    renderNodeOptions(filterInput.value);

          const rememberedNodeId = getRememberedSpecialParamValue('nodeId');
          if (rememberedNodeId && [...sel.options].some(o => o.value === rememberedNodeId)){
            sel.value = rememberedNodeId;
          } else if (sel.dataset.required === '1' && sel.options.length > 1 && !sel.value){
            sel.selectedIndex = 1;
          }

          rememberSpecialParamValue('nodeId', sel.value);
          updateRequestUrl();
          triggerDependentReloads();
        } catch(e){
          if (myGeneration !== _paramFormGeneration) return;
          console.error('Failed to load node tree:', e);

          sel.innerHTML = '';
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = '(failed to load nodes)';
          sel.appendChild(opt);
        } finally {
          sel.disabled = false;
        }
      })();
    }

    // employeeId
    if (p.name === 'employeeId'){
      const dateWrap = document.createElement('div');
      dateWrap.style.marginTop = '6px';

      const dateLabel = document.createElement('label');
      dateLabel.textContent = 'Employee list date';

      const employeeDateInput = document.createElement('input');
      employeeDateInput.type = 'date';
      employeeDateInput.value = todayISO();

      dateWrap.appendChild(dateLabel);
      dateWrap.appendChild(employeeDateInput);
      wrap.insertBefore(dateWrap, row);

      const employeeOptsWrap = document.createElement('div');
      employeeOptsWrap.style.display = 'flex';
      employeeOptsWrap.style.gap = '12px';
      employeeOptsWrap.style.marginTop = '6px';
      employeeOptsWrap.style.flexWrap = 'wrap';

      const includeTempWrap = document.createElement('label');
      includeTempWrap.style.display = 'flex';
      includeTempWrap.style.alignItems = 'center';
      includeTempWrap.style.gap = '6px';

      const includeTempInput = document.createElement('input');
      includeTempInput.type = 'checkbox';
      includeTempWrap.appendChild(includeTempInput);
      includeTempWrap.appendChild(document.createTextNode('includeTemp'));

      const includeVisibleWrap = document.createElement('label');
      includeVisibleWrap.style.display = 'flex';
      includeVisibleWrap.style.alignItems = 'center';
      includeVisibleWrap.style.gap = '6px';

      const includeVisibleInput = document.createElement('input');
      includeVisibleInput.type = 'checkbox';
      includeVisibleWrap.appendChild(includeVisibleInput);
      includeVisibleWrap.appendChild(document.createTextNode('includeVisible'));

      employeeOptsWrap.appendChild(includeTempWrap);
      employeeOptsWrap.appendChild(includeVisibleWrap);
      wrap.insertBefore(employeeOptsWrap, row);

      const filterInput = document.createElement('input');
      filterInput.type = 'text';
      filterInput.placeholder = 'Filter by registerId or employeeId...';
      filterInput.style.marginBottom = '6px';
      wrap.insertBefore(filterInput, row);

      const sel = document.createElement('select');
      sel.dataset.paramName = input.dataset.paramName;
      sel.dataset.paramIn = input.dataset.paramIn;
      sel.dataset.required = input.dataset.required;
      sel.dataset.employeeSelect = '1';

      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '-- select employeeId --';
      sel.appendChild(ph);

      row.replaceChild(sel, input);

      sel.addEventListener('change', updateRequestUrl);

      let employeeItems = [];

      function renderEmployeeOptions(term){
        const currentValue = sel.value;
        const q = String(term || '').trim().toLowerCase();

        sel.innerHTML = '';

        const firstOpt = document.createElement('option');
        firstOpt.value = '';
        firstOpt.textContent = '-- select employeeId --';
        sel.appendChild(firstOpt);

        const filtered = !q
          ? employeeItems
          : employeeItems.filter(it => {
              const searchText = [it.registerId, it.employeeId].join(' ').toLowerCase();
              return searchText.includes(q);
            });

        if (!filtered.length){
          firstOpt.textContent = employeeItems.length ? 'No matches' : 'No employees';
          return;
        }

        for (const it of filtered){
          const opt = document.createElement('option');
          opt.value = it.employeeId;
          opt.textContent = (it.registerId ? (it.registerId + ' - ') : '') + it.employeeId;
          sel.appendChild(opt);
        }

        if ([...sel.options].some(o => o.value === currentValue)){
          sel.value = currentValue;
        }
      }

      filterInput.addEventListener('input', () => renderEmployeeOptions(filterInput.value));

      async function reloadEmployees(){
        try{
          const nodeEl = getParamEl('nodeId');
          const nodeId = nodeEl ? String(nodeEl.value || '').trim() : '';
          const dateIso = String(employeeDateInput.value || todayISO()).trim();

          sel.disabled = true;
          sel.innerHTML = '';
          sel.appendChild(ph);
          employeeItems = [];

          if (!nodeId){
            ph.textContent = '-- select nodeId first --';
            return;
          }

          ph.textContent = 'Loading employees...';

          const data = await fetchEmployeeCompactList(nodeId, dateIso, {
            includeTemp: includeTempInput.checked,
            includeVisible: includeVisibleInput.checked
          });

          if (myGeneration !== _paramFormGeneration) return;

          const items = normalizeEmployeeCompact(data);

          employeeItems = items.map(it => ({
            registerId: String(it.registerId || '').trim(),
            employeeId: String(it.employeeId || '').trim()
          }));

          renderEmployeeOptions(filterInput.value);

          if (sel.dataset.required === '1' && sel.options.length > 1 && !sel.value){
            sel.selectedIndex = 1;
            updateRequestUrl();
          }
        } catch(e){
          if (myGeneration !== _paramFormGeneration) return;
          console.error('Failed to load employees:', e);

          sel.innerHTML = '';
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = '(failed to load employees)';
          sel.appendChild(opt);
        } finally {
          sel.disabled = false;
        }
      }

      sel._reloadEmployees = reloadEmployees;

      employeeDateInput.addEventListener('change', reloadEmployees);
      employeeDateInput.addEventListener('input', reloadEmployees);
      includeTempInput.addEventListener('change', reloadEmployees);
      includeVisibleInput.addEventListener('change', reloadEmployees);

      setTimeout(reloadEmployees, 0);
    }

    // salaryGroupId
    if (p.name === 'salaryGroupId'){
      const filterInput = document.createElement('input');
      filterInput.type = 'text';
      filterInput.placeholder = 'Filter by salary group code or description...';
      filterInput.style.marginBottom = '6px';
      wrap.insertBefore(filterInput, row);

      const sel = document.createElement('select');
      sel.dataset.paramName = input.dataset.paramName;
      sel.dataset.paramIn = input.dataset.paramIn;
      sel.dataset.required = input.dataset.required;
      sel.dataset.salaryGroupSelect = '1';

      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '-- select salaryGroupId --';
      sel.appendChild(ph);

      row.replaceChild(sel, input);

      sel.addEventListener('change', () => {
        updateRequestUrl();
        triggerSalaryPeriodReload();
      });

      let salaryGroupItems = [];

      function renderSalaryGroupOptions(term){
        const currentValue = sel.value;
        const q = String(term || '').trim().toLowerCase();

        sel.innerHTML = '';

        const firstOpt = document.createElement('option');
        firstOpt.value = '';
        firstOpt.textContent = '-- select salaryGroupId --';
        sel.appendChild(firstOpt);

        const filtered = !q
          ? salaryGroupItems
          : salaryGroupItems.filter(it => {
              const searchText = [it.code, it.name, it.id].join(' ').toLowerCase();
              return searchText.includes(q);
            });

        if (!filtered.length){
          firstOpt.textContent = salaryGroupItems.length ? 'No matches' : 'No salary groups';
          return;
        }

        for (const it of filtered){
          const parts = [];
          if (it.code) parts.push('[' + it.code + ']');
          if (it.name) parts.push(it.name);
          parts.push(it.id);

          const opt = document.createElement('option');
          opt.value = it.id;
          opt.textContent = parts.join(' - ');
          sel.appendChild(opt);
        }

        if ([...sel.options].some(o => o.value === currentValue)){
          sel.value = currentValue;
        }
      }

      filterInput.addEventListener('input', () => renderSalaryGroupOptions(filterInput.value));

      async function reloadSalaryGroups(){
        try{
          const nodeEl = getParamEl('nodeId');
          const nodeId = nodeEl ? String(nodeEl.value || '').trim() : '';

          sel.disabled = true;
          sel.innerHTML = '';
          sel.appendChild(ph);
          salaryGroupItems = [];

          if (!nodeId){
            ph.textContent = '-- select nodeId first --';
            return;
          }

          ph.textContent = 'Loading salary groups...';

          const data = await fetchSalaryGroupList(nodeId);
          if (myGeneration !== _paramFormGeneration) return;

          salaryGroupItems = normalizeSalaryGroupList(data);
          if (!salaryGroupItems.some(it => String(it.id) === '0')){
            salaryGroupItems.unshift({
              id: '0',
              code: '0',
              name: 'Default',
              isActive: true
            });
          }
          salaryGroupItems = salaryGroupItems.filter(it => it.isActive);

          renderSalaryGroupOptions(filterInput.value);

          if (sel.dataset.required === '1' && sel.options.length > 1 && !sel.value){
            sel.selectedIndex = 1;
            updateRequestUrl();
            triggerSalaryPeriodReload();
          }
        } catch(e){
          if (myGeneration !== _paramFormGeneration) return;
          console.error('Failed to load salary groups:', e);

          sel.innerHTML = '';
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = '(failed to load salary groups)';
          sel.appendChild(opt);
        } finally {
          sel.disabled = false;
        }
      }

      sel._reloadSalaryGroups = reloadSalaryGroups;
      setTimeout(reloadSalaryGroups, 0);
    }

    // setId
    if (p.name === 'setId'){
      const filterInput = document.createElement('input');
      filterInput.type = 'text';
      filterInput.placeholder = 'Filter by salary set name...';
      filterInput.style.marginBottom = '6px';
      wrap.insertBefore(filterInput, row);

      const sel = document.createElement('select');
      sel.dataset.paramName = input.dataset.paramName;
      sel.dataset.paramIn = input.dataset.paramIn;
      sel.dataset.required = input.dataset.required;
      sel.dataset.salarySetSelect = '1';

      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '-- select setId --';
      sel.appendChild(ph);

      row.replaceChild(sel, input);

      sel.addEventListener('change', updateRequestUrl);

      let salarySetItems = [];

      function renderSalarySetOptions(term){
        const currentValue = sel.value;
        const q = String(term || '').trim().toLowerCase();

        sel.innerHTML = '';

        const firstOpt = document.createElement('option');
        firstOpt.value = '';
        firstOpt.textContent = '-- select setId --';
        sel.appendChild(firstOpt);

        const filtered = !q
          ? salarySetItems
          : salarySetItems.filter(it => {
              const searchText = [it.code, it.name, it.id].join(' ').toLowerCase();
              return searchText.includes(q);
            });

        if (!filtered.length){
          firstOpt.textContent = salarySetItems.length ? 'No matches' : 'No salary sets';
          return;
        }

        for (const it of filtered){
          const parts = [];
          if (it.code) parts.push('[' + it.code + ']');
          if (it.name) parts.push(it.name);
          parts.push(it.id);

          const opt = document.createElement('option');
          opt.value = it.id;
          opt.textContent = parts.join(' - ');
          sel.appendChild(opt);
        }

        if ([...sel.options].some(o => o.value === currentValue)){
          sel.value = currentValue;
        }
      }

      filterInput.addEventListener('input', () => renderSalarySetOptions(filterInput.value));

      async function reloadSalarySets(){
        try{
          const nodeEl = getParamEl('nodeId');
          const nodeId = nodeEl ? String(nodeEl.value || '').trim() : '';

          sel.disabled = true;
          sel.innerHTML = '';
          sel.appendChild(ph);
          salarySetItems = [];

          if (!nodeId){
            ph.textContent = '-- select nodeId first --';
            return;
          }

          ph.textContent = 'Loading salary sets...';

          const data = await fetchSalarySetList(nodeId);
          if (myGeneration !== _paramFormGeneration) return;

          salarySetItems = normalizeSalarySetList(data);

          renderSalarySetOptions(filterInput.value);

          if (sel.dataset.required === '1' && sel.options.length > 1 && !sel.value){
            sel.selectedIndex = 1;
            updateRequestUrl();
          }
        } catch(e){
          if (myGeneration !== _paramFormGeneration) return;
          console.error('Failed to load salary sets:', e);

          sel.innerHTML = '';
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = '(failed to load salary sets)';
          sel.appendChild(opt);
        } finally {
          sel.disabled = false;
        }
      }

      sel._reloadSalarySets = reloadSalarySets;
      setTimeout(reloadSalarySets, 0);
    }

        // salaryPeriodId
    if (p.name === 'salaryPeriodId'){
      // special case for salary-data resource:
      // helper salaryGroupId dropdown + year -> load real salaryPeriodId list
      if (isSalaryDataResource()){
        const helperWrap = document.createElement('div');
        helperWrap.style.display = 'flex';
        helperWrap.style.gap = '12px';
        helperWrap.style.marginTop = '6px';
        helperWrap.style.flexWrap = 'wrap';

        const salaryGroupWrap = document.createElement('div');
        salaryGroupWrap.style.minWidth = '220px';

        const salaryGroupLabel = document.createElement('label');
        salaryGroupLabel.textContent = 'salaryGroupId helper';

        const salaryGroupHelperSel = document.createElement('select');

        const helperPh = document.createElement('option');
        helperPh.value = '';
        helperPh.textContent = '-- select salary group --';
        salaryGroupHelperSel.appendChild(helperPh);

        salaryGroupWrap.appendChild(salaryGroupLabel);
        salaryGroupWrap.appendChild(salaryGroupHelperSel);

        const yearWrap = document.createElement('div');
        yearWrap.style.minWidth = '140px';

        const yearLabel = document.createElement('label');
        yearLabel.textContent = 'year';

        const yearInput = document.createElement('input');
        yearInput.type = 'number';
        yearInput.step = '1';
        yearInput.value = currentYear();

        yearWrap.appendChild(yearLabel);
        yearWrap.appendChild(yearInput);

        helperWrap.appendChild(salaryGroupWrap);
        helperWrap.appendChild(yearWrap);
        wrap.insertBefore(helperWrap, row);

        const filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.placeholder = 'Filter salary periods...';
        filterInput.style.marginBottom = '6px';
        wrap.insertBefore(filterInput, row);

        const sel = document.createElement('select');
        sel.dataset.paramName = input.dataset.paramName;
        sel.dataset.paramIn = input.dataset.paramIn;
        sel.dataset.required = input.dataset.required;
        sel.dataset.salaryPeriodSelect = '1';

        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = '-- select salaryPeriodId --';
        sel.appendChild(ph);

        row.replaceChild(sel, input);

        let salaryGroupItems = [];
        let salaryPeriodItems = [];

        function renderSalaryGroupHelperOptions(){
          const currentValue = salaryGroupHelperSel.value;

          salaryGroupHelperSel.innerHTML = '';

          const firstOpt = document.createElement('option');
          firstOpt.value = '';
          firstOpt.textContent = '-- select salary group --';
          salaryGroupHelperSel.appendChild(firstOpt);

          if (!salaryGroupItems.length){
            firstOpt.textContent = 'No salary groups';
            return;
          }

          for (const it of salaryGroupItems){
            const parts = [];
            if (it.code) parts.push(it.code);
            if (it.name) parts.push(it.name);
            parts.push(it.id);

            const opt = document.createElement('option');
            opt.value = it.id;
            opt.textContent = parts.join(' - ');
            salaryGroupHelperSel.appendChild(opt);
          }

          if ([...salaryGroupHelperSel.options].some(o => o.value === currentValue)){
            salaryGroupHelperSel.value = currentValue;
          } else if (salaryGroupHelperSel.options.length > 1){
            salaryGroupHelperSel.selectedIndex = 1;
          }
        }

        function renderSalaryPeriodOptions(term){
          const currentValue = sel.value;
          const q = String(term || '').trim().toLowerCase();

          sel.innerHTML = '';

          const firstOpt = document.createElement('option');
          firstOpt.value = '';
          firstOpt.textContent = '-- select salaryPeriodId --';
          sel.appendChild(firstOpt);

          const filtered = !q
            ? salaryPeriodItems
            : salaryPeriodItems.filter(it => {
                const searchText = [
                  it.name,
                  it.year,
                  it.group,
                  it.fromDate,
                  it.toDate,
                  it.id
                ].join(' ').toLowerCase();

                return searchText.includes(q);
              });

          if (!filtered.length){
            firstOpt.textContent = salaryPeriodItems.length ? 'No matches' : 'No salary periods';
            return;
          }

          for (const it of filtered){
            const parts = [];
            if (it.name) parts.push(it.name);
            if (it.fromDate || it.toDate) parts.push(it.fromDate + ' → ' + it.toDate);
            if (it.year) parts.push('Year ' + it.year);
            if (it.group !== '') parts.push('Group ' + it.group);
            parts.push(it.id);

            const opt = document.createElement('option');
            opt.value = it.id;
            opt.textContent = parts.join(' - ');
            sel.appendChild(opt);
          }

          if ([...sel.options].some(o => o.value === currentValue)){
            sel.value = currentValue;
          } else if (sel.dataset.required === '1' && sel.options.length > 1){
            sel.selectedIndex = 1;
          }
        }

        filterInput.addEventListener('input', () => renderSalaryPeriodOptions(filterInput.value));

        async function reloadSalaryPeriods(){
          try{
            const nodeEl = getParamEl('nodeId');
            const nodeId = nodeEl ? String(nodeEl.value || '').trim() : '';
            const year = String(yearInput.value || currentYear()).trim();

            sel.disabled = true;
            salaryGroupHelperSel.disabled = true;

            salaryGroupItems = [];
            salaryPeriodItems = [];

            salaryGroupHelperSel.innerHTML = '';
            const helperLoadingOpt = document.createElement('option');
            helperLoadingOpt.value = '';
            helperLoadingOpt.textContent = '-- select salary group --';
            salaryGroupHelperSel.appendChild(helperLoadingOpt);

            sel.innerHTML = '';
            sel.appendChild(ph);

            if (!nodeId){
              helperLoadingOpt.textContent = '-- select nodeId first --';
              ph.textContent = '-- select nodeId first --';
              setParamValue('salaryGroupId', '');
              updateRequestUrl();
              return;
            }

            if (!year){
              helperLoadingOpt.textContent = '-- fill year first --';
              ph.textContent = '-- fill year first --';
              setParamValue('salaryGroupId', '');
              updateRequestUrl();
              return;
            }

            helperLoadingOpt.textContent = 'Loading salary groups...';
            ph.textContent = '-- select salary group first --';

            const groupData = await fetchSalaryGroupList(nodeId);
            if (myGeneration !== _paramFormGeneration) return;

            salaryGroupItems = normalizeSalaryGroupList(groupData);
            renderSalaryGroupHelperOptions();

            const salaryGroupId = String(salaryGroupHelperSel.value || '').trim();

            if (!salaryGroupId){
              ph.textContent = '-- select salary group first --';
              setParamValue('salaryGroupId', '');
              updateRequestUrl();
              return;
            }

            setParamValue('salaryGroupId', salaryGroupId);
            ph.textContent = 'Loading salary periods...';

            const periodData = await fetchSalaryPeriodList(nodeId, salaryGroupId, year);
            if (myGeneration !== _paramFormGeneration) return;

            salaryPeriodItems = normalizeSalaryPeriodList(periodData);
            renderSalaryPeriodOptions(filterInput.value);

            updateRequestUrl();
          } catch(e){
            if (myGeneration !== _paramFormGeneration) return;
            console.error('Failed to load salary periods:', e);

            salaryGroupHelperSel.innerHTML = '';
            const helperErr = document.createElement('option');
            helperErr.value = '';
            helperErr.textContent = '(failed to load salary groups)';
            salaryGroupHelperSel.appendChild(helperErr);

            sel.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '(failed to load salary periods)';
            sel.appendChild(opt);
          } finally {
            sel.disabled = false;
            salaryGroupHelperSel.disabled = false;
          }
        }

        async function reloadSalaryPeriodsForSelectedGroup(){
          try{
            const nodeEl = getParamEl('nodeId');
            const nodeId = nodeEl ? String(nodeEl.value || '').trim() : '';
            const salaryGroupId = String(salaryGroupHelperSel.value || '').trim();
            const year = String(yearInput.value || currentYear()).trim();

            sel.disabled = true;
            sel.innerHTML = '';
            sel.appendChild(ph);
            salaryPeriodItems = [];

            if (!nodeId){
              ph.textContent = '-- select nodeId first --';
              setParamValue('salaryGroupId', '');
              updateRequestUrl();
              return;
            }

            if (!salaryGroupId){
              ph.textContent = '-- select salary group first --';
              setParamValue('salaryGroupId', '');
              updateRequestUrl();
              return;
            }

            if (!year){
              ph.textContent = '-- fill year first --';
              setParamValue('salaryGroupId', salaryGroupId);
              updateRequestUrl();
              return;
            }

            setParamValue('salaryGroupId', salaryGroupId);
            ph.textContent = 'Loading salary periods...';

            const data = await fetchSalaryPeriodList(nodeId, salaryGroupId, year);
            if (myGeneration !== _paramFormGeneration) return;

            salaryPeriodItems = normalizeSalaryPeriodList(data);
            renderSalaryPeriodOptions(filterInput.value);

            updateRequestUrl();
          } catch(e){
            if (myGeneration !== _paramFormGeneration) return;
            console.error('Failed to load salary periods:', e);

            sel.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '(failed to load salary periods)';
            sel.appendChild(opt);
          } finally {
            sel.disabled = false;
          }
        }

        salaryGroupHelperSel.addEventListener('change', reloadSalaryPeriodsForSelectedGroup);
        yearInput.addEventListener('change', reloadSalaryPeriodsForSelectedGroup);
        yearInput.addEventListener('input', reloadSalaryPeriodsForSelectedGroup);

        sel.addEventListener('change', updateRequestUrl);

        sel._reloadSalaryPeriods = reloadSalaryPeriods;
        setTimeout(reloadSalaryPeriods, 0);
      } else {
        // normal salaryPeriodId list
        const helperWrap = document.createElement('div');
        helperWrap.style.display = 'flex';
        helperWrap.style.gap = '12px';
        helperWrap.style.marginTop = '6px';
        helperWrap.style.flexWrap = 'wrap';

        const salaryGroupWrap = document.createElement('div');
        salaryGroupWrap.style.minWidth = '140px';

        const salaryGroupLabel = document.createElement('label');
        salaryGroupLabel.textContent = 'salaryGroupId';

        const salaryGroupInput = document.createElement('input');
        salaryGroupInput.type = 'number';
        salaryGroupInput.step = '1';
        salaryGroupInput.value = '0';

        salaryGroupWrap.appendChild(salaryGroupLabel);
        salaryGroupWrap.appendChild(salaryGroupInput);

        const yearWrap = document.createElement('div');
        yearWrap.style.minWidth = '140px';

        const yearLabel = document.createElement('label');
        yearLabel.textContent = 'year';

        const yearInput = document.createElement('input');
        yearInput.type = 'number';
        yearInput.step = '1';
        yearInput.value = currentYear();

        yearWrap.appendChild(yearLabel);
        yearWrap.appendChild(yearInput);

        helperWrap.appendChild(salaryGroupWrap);
        helperWrap.appendChild(yearWrap);
        wrap.insertBefore(helperWrap, row);

        const filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.placeholder = 'Filter salary periods...';
        filterInput.style.marginBottom = '6px';
        wrap.insertBefore(filterInput, row);

        const sel = document.createElement('select');

        sel.dataset.paramName = input.dataset.paramName;
        sel.dataset.paramIn = input.dataset.paramIn;
        sel.dataset.required = input.dataset.required;
        sel.dataset.salaryPeriodSelect = '1';

        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = '-- select salaryPeriodId --';
        sel.appendChild(ph);

        row.replaceChild(sel, input);

        sel.addEventListener('change', updateRequestUrl);

        let salaryPeriodItems = [];

        function renderSalaryPeriodOptions(term){
          const currentValue = sel.value;
          const q = String(term || '').trim().toLowerCase();

          sel.innerHTML = '';

          const firstOpt = document.createElement('option');
          firstOpt.value = '';
          firstOpt.textContent = '-- select salaryPeriodId --';
          sel.appendChild(firstOpt);

          const filtered = !q
            ? salaryPeriodItems
            : salaryPeriodItems.filter(it => {
                const searchText = [
                  it.name,
                  it.year,
                  it.group,
                  it.fromDate,
                  it.toDate,
                  it.id
                ].join(' ').toLowerCase();

                return searchText.includes(q);
              });

          if (!filtered.length){
            firstOpt.textContent = salaryPeriodItems.length ? 'No matches' : 'No salary periods';
            return;
          }

          for (const it of filtered){
            const parts = [];
            if (it.name) parts.push(it.name);
            if (it.fromDate || it.toDate) parts.push(it.fromDate + ' → ' + it.toDate);
            if (it.year) parts.push('Year ' + it.year);
            if (it.group !== '') parts.push('Group ' + it.group);
            parts.push(it.id);

            const opt = document.createElement('option');
            opt.value = it.id;
            opt.textContent = parts.join(' - ');
            sel.appendChild(opt);
          }

          if ([...sel.options].some(o => o.value === currentValue)){
            sel.value = currentValue;
          }
        }

        filterInput.addEventListener('input', () => renderSalaryPeriodOptions(filterInput.value));

        async function reloadSalaryPeriods(){
          try{
            const nodeEl = getParamEl('nodeId');
            const nodeId = nodeEl ? String(nodeEl.value || '').trim() : '';
            const salaryGroupId = String(salaryGroupInput.value || '0').trim();
            const year = String(yearInput.value || currentYear()).trim();

            sel.disabled = true;
            sel.innerHTML = '';
            sel.appendChild(ph);
            salaryPeriodItems = [];

            if (!nodeId){
              ph.textContent = '-- select nodeId first --';
              return;
            }

            if (!salaryGroupId || !year){
              ph.textContent = '-- fill salaryGroupId and year first --';
              return;
            }

            ph.textContent = 'Loading salary periods...';

            const data = await fetchSalaryPeriodList(nodeId, salaryGroupId, year);
            if (myGeneration !== _paramFormGeneration) return;

            salaryPeriodItems = normalizeSalaryPeriodList(data);
            renderSalaryPeriodOptions(filterInput.value);

            if (sel.dataset.required === '1' && sel.options.length > 1 && !sel.value){
              sel.selectedIndex = 1;
              updateRequestUrl();
            }
          } catch(e){
            if (myGeneration !== _paramFormGeneration) return;
            console.error('Failed to load salary periods:', e);

            sel.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '(failed to load salary periods)';
            sel.appendChild(opt);
          } finally {
            sel.disabled = false;
          }
        }

        sel._reloadSalaryPeriods = reloadSalaryPeriods;

        salaryGroupInput.addEventListener('change', reloadSalaryPeriods);
        salaryGroupInput.addEventListener('input', reloadSalaryPeriods);
        yearInput.addEventListener('change', reloadSalaryPeriods);
        yearInput.addEventListener('input', reloadSalaryPeriods);

        setTimeout(reloadSalaryPeriods, 0);
      }
    }

    return wrap;
  }
  
  
  
  
  
  

  if (pathParams.length || queryParams.length){
    const sec = document.createElement('div');
    sec.className = 'row';
    sec.style.alignItems = 'flex-start';
    sec.style.gap = '14px';
    sec.style.marginTop = '8px';

    if (pathParams.length){
      const col = document.createElement('div');
      col.style.flex = '1';
      col.style.minWidth = '260px';

      const h = document.createElement('div');
      h.className = 'small';
      h.textContent = 'Path parameters';
      col.appendChild(h);

      for (const p of pathParams){
        col.appendChild(makeInput(p));
      }

      sec.appendChild(col);
    }

    if (queryParams.length){
      const col = document.createElement('div');
      col.style.flex = '1';
      col.style.minWidth = '260px';

      const h = document.createElement('div');
      h.className = 'small';
      h.textContent = 'Query parameters';
      col.appendChild(h);

      for (const p of queryParams){
        col.appendChild(makeInput(p));
      }

      sec.appendChild(col);
    }

    paramArea.appendChild(sec);
  }

  if (queryParams.length === 0){
    const custom = document.createElement('div');
    custom.style.marginTop = '10px';

    const label = document.createElement('div');
    label.className = 'small';
    label.textContent = 'Custom query parameters';
    custom.appendChild(label);

    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gap = '8px';
    custom.appendChild(list);

    function addRow(){
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';

      const k = document.createElement('input');
      k.type = 'text';
      k.placeholder = 'name';

      const v = document.createElement('input');
      v.type = 'text';
      v.placeholder = 'value';

      const rem = document.createElement('button');
      rem.className = 'btn';
      rem.type = 'button';
      rem.textContent = 'Remove';
      rem.addEventListener('click', () => {
        row.remove();
        updateRequestUrl();
      });

      k.addEventListener('input', updateRequestUrl);
      v.addEventListener('input', updateRequestUrl);

      row.appendChild(k);
      row.appendChild(v);
      row.appendChild(rem);
      list.appendChild(row);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.type = 'button';
    addBtn.textContent = 'Add query param';
    addBtn.addEventListener('click', addRow);

    custom.appendChild(addBtn);
    op._customQueryEditor = list;
    addRow();
    paramArea.appendChild(custom);
  }

  updateRequestUrl();
}

  async function selectOperation(op){
    selectedOp = op;
    // Collapse resource panel when user picks an operation via click (not auto-select on load)
    if (typeof afterOperationSelected === 'function' && !_renderingOpList){
      afterOperationSelected(op);
    }
    _renderingOpList = true;
    renderOpList();
    _renderingOpList = false;
    opTitleEl.textContent = op.method + ' ' + op.path;
    opDescEl.textContent = op.summary || '';

    // Always reset right side immediately on switch
    clearResponse();
    paramArea.innerHTML = '';
    requestUrlEl.value = '';
    renderRequestUrlPreview('');
    setReqStatus('Ready.','');

    if (!op._linkOps && op.path && op.path.startsWith('/schema')){
      setSchemaStatus('Fetching schema for ' + op.path + ' ...','');
      try{
        const base = buildBasePath();
        if (!base) throw new Error('Base path empty; fill endpoint + client.');
        const fullUrl = pathJoin(base, op.path);
        const doc = await fetchJsonWithAuth(fullUrl);
        if (Array.isArray(doc.links) && doc.links.length){
          op._linkOps = linkDocsToOps(op.path, doc.links);
        } else {
          op._linkOps = [op];
        }
        setSchemaStatus('Schema for ' + op.path + ' loaded (' + (op._linkOps||[]).length + ' links).','ok');
      }catch(e){
        setSchemaStatus('Failed to fetch path schema: ' + String(e && e.message ? e.message : e),'warn');
        op._linkOps = [op];
      }
    }

    if (op._linkOps && op._linkOps.length > 1){
      paramArea.innerHTML = '';
      const chooser = document.createElement('div'); chooser.className='card'; chooser.style.padding='8px';
      const h = document.createElement('div'); h.className='small'; h.textContent='Select operation variant'; chooser.appendChild(h);
      op._linkOps.forEach(lo=>{
        const b = document.createElement('button'); b.className='btn'; b.style.display='block'; b.style.width='100%'; b.style.marginTop='8px';
        b.textContent = lo.method + ' ' + (lo.title || lo.path);
        b.addEventListener('click', ()=>{ selectedOp = lo; renderOpList(); renderParamsForm(lo); });
        chooser.appendChild(b);
      });
      paramArea.appendChild(chooser);

      // Make it obvious we're waiting for a variant
      requestUrlEl.value = '';
    renderRequestUrlPreview('');
      setReqStatus('Select an operation variant.','warn');

      btnSend.disabled = true;
      btnCopyUrl.disabled = true;
    updateTokenPreview();
  updateAuthPreviewVisibility();
    updateRequestHeadersPreview();
      btnDownloadResponse.disabled = true;
      btnCopyResponse.disabled = true;

      return;
    }

    if (op._linkOps && op._linkOps.length === 1){
      selectedOp = op._linkOps[0];
      renderOpList();
      renderParamsForm(selectedOp);
      return;
    }

    renderParamsForm(op);
  }

  // ---------- Hardcoded schema resources (deprecated /api/dev/schema) ----------
  const SCHEMA_RESOURCES = [
    "/schema/node/cost-schedule",
    "/schema/node/employee/schedule-availability",
    "/schema/node/presence-info",
    "/schema/node/hourcode",
    "/schema/node/contract",
    "/schema/node/task",
    "/schema/node/turnover",
    "/schema/node/employee/confirmation-date",
    "/schema/node/employee/initial-balance",
    "/schema/node/extra-opening",
    "/schema/node/hours",
    "/schema/node/realized-hours",
    "/schema/user/message",
    "/schema/node/employee-compact",
    "/schema/nationality",
    "/schema/node/vacation-status",
    "/schema/node/realization-view",
    "/schema/kaba/clock",
    "/schema/node/employee/vacation",
    "/schema/node/holiday",
    "/schema/custom/node/realization-spread",
    "/schema/node/card-management",
    "/schema/turnoverimport",
    "/schema/node/agency",
    "/schema/node/employee",
    "/schema/node/hourcode-group",
    "/schema/node/employee/department",
    "/schema/node/yearly-vacation",
    "/schema/node/employee/break",
    "/schema/node/employee/task",
    "/schema/node/employee/vacation-request",
    "/schema/node/employee/operation",
    "/schema/node/employee/realized-hours",
    "/schema/node/employee/contract",
    "/schema/node/salary-year",
    "/schema/node/employee/presence-info",
    "/schema/node/employee/absence",
    "/schema/node/confirmation",
    "/schema/node/budget",
    "/schema/node/cost-realization",
    "/schema/node/schedule-search",
    "/schema/node/salary-period",
    "/schema/node/schedule-definition",
    "/schema/node/clock",
    "/schema/node/extra-budget",
    "/schema/node/compensation-realization",
    "/schema/culture",
    "/schema/node/schedule-agreement",
    "/schema/node/week-view",
    "/schema/node/salary-group",    
    "/schema/node/schedule-summary",
    "/schema/node/opening-hours",
    "/schema/node/employee/addendum",
    "/schema/node/employee/properties",
    "/schema/node/employee-type",
    "/schema/node/temp-employee",
    "/schema/node/schedule-job",
    "/schema/node/function",
    "/schema/node/absence",
    "/schema/node/salary-data",
    "/schema/node/employee/schedule",
    "/schema/node/vacation",
    "/schema/node/employee/summary-hours",
    "/schema/temper/event",
    "/schema/node/employee/vacation-status",
    "/schema/import",
    "/schema/node/budget/entry-prognosis",
    "/schema/node/property",
    "/schema/node/appointment",
    "/schema/node/salary-set",
    "/schema/node/balance",
    "/schema/department",
    "/schema/node/department",
    "/schema/node",
    "/schema/node/visibility-tree",
    "/schema/node/account-types",
    "/schema/node/employee/hours",
    "/schema/node/vacation-request",
    "/schema/node/vacation-request/agreement",
    "/schema/node/employee/shift",
    "/schema/node/basic-schedule-type",
    "/schema/node/employee/schedule-basic",
    "/schema/node/shift",
    "/schema/node/employee/agreement",
    "/schema/node/employee/agreement-date",
    "/schema/node/agreement",
    "/schema/node/agreement/current",
    "/schema/user/own",
    "/schema/user/me",
    "/schema/user/node-tree",
    "/schema/user/list",
    "/schema/node/employee/illness",
    "/schema/node/illness",
	"/schema/node/illnesscase",
    "/schema/node/employee/balance",
    "/schema/node/employee/balance-operation",
    "/schema/country",
    "/schema/node/country",
    "/schema/node/schedule",
    "/schema/node/available-employee",
    "/schema/node/schedule-hours"
  ];

  function initSchemaResourceDropdown(){
    schemaResourceEl.innerHTML = '';
	//HELPER
	function getDisplayParts(schemaPath) {
  const parts = String(schemaPath || '')
    .replace(/^\/schema\//, '')
    .replace(/^schema\//, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);

  if (parts[0] === 'node' && parts[1] === 'employee' && parts.length > 2) {
    return ['employee', ...parts.slice(2)];
  }

  if (parts[0] === 'node' && parts[1] === 'agreement' && parts.length > 2) {
    return ['agreement', ...parts.slice(2)];
  }

  return parts;
}  
    // Build tree: group by first segment after "schema/"
    const tree = {};
    for (const full of SCHEMA_RESOURCES) {
    const parts = getDisplayParts(full);
      if (!parts.length) continue;

      const root = parts[0]; // e.g. "node", "kaba", "user"
      if (!tree[root]) tree[root] = [];
      tree[root].push({ full, parts });
    }

    const rootOrder = ['node', 'employee', 'agreement', 'department'];

const roots = Object.keys(tree).sort((a, b) => {
  const ai = rootOrder.indexOf(a);
  const bi = rootOrder.indexOf(b);

  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }

  return a.localeCompare(b);
});

    for (const root of roots) {
      const group = document.createElement('optgroup');
      group.label = root;

      const items = tree[root].sort((a, b) => {
        const maxLen = Math.max(a.parts.length, b.parts.length);
        for (let i = 1; i < maxLen; i++) {
          const av = a.parts[i] || '';
          const bv = b.parts[i] || '';
          const cmp = av.localeCompare(bv);
          if (cmp !== 0) return cmp;
        }
        return 0;
      });


for (const item of items) {
  const opt = document.createElement('option');
  opt.value = item.full;

  const depth = item.parts.length - 1;
  const label = item.parts[depth];

  const prefix = depth
    ? '\u00A0\u00A0'.repeat(depth) + '└ '
    : '';

  // ✅ Detect if this item has children
  const hasChildren = items.some(other => {
    if (other === item) return false;
    if (other.parts.length <= item.parts.length) return false;
    return item.parts.every((part, i) => other.parts[i] === part);
  });

  const icon = hasChildren ? '📁 ' : '';
  opt.textContent = prefix + icon + label;

  if (hasChildren) {
    opt.style.fontWeight = '800';
  }

  group.appendChild(opt);
}

      schemaResourceEl.appendChild(group);
    }
  }

  function normSlashes(s){ return String(s||'').replace(/\/{2,}/g,'/'); }

  function buildApiPath(baseUri, template){
    const a = String(baseUri||'').replace(/^\/+/, '');
    const t = String(template||'').trim();
    const joined = '/' + a.replace(/\/+$/,'') + '/' + t.replace(/^\/+/, '');
    return normSlashes(joined);
  }

  function schemaLinkToParams(link){
    const out = [];
    const href = link && link.href ? link.href : null;
    const vars = href && href.vars ? href.vars : null;
    const required = new Set((href && Array.isArray(href.required) ? href.required : []));
    if (vars && typeof vars === 'object'){
      for (const [name, def] of Object.entries(vars)){
        out.push({
          name,
          in: 'path',
          required: required.has(name),
          description: (def && def.description) ? String(def.description) : '',
          type: (def && def.type) ? String(def.type) : 'string',
          format: def && def.format ? String(def.format) : ''
        });
      }
    }

    const qprops = link && link.schema && link.schema.properties ? link.schema.properties : null;
    if (qprops && typeof qprops === 'object'){
      for (const [name, def] of Object.entries(qprops)){
        const typ = def && def.type ? String(def.type) : 'string';
        out.push({
          name,
          in: 'query',
          required: false,
          description: (def && def.description) ? String(def.description) : '',
          type: typ,
          format: def && def.format ? String(def.format) : ''
        });
      }
    }
    return out;
  }

  let currentSchemaDoc = null;

  function getResolvedSchemaUrl(){
    const schemaPath = String(schemaResourceEl.value || '').trim();
    if (!schemaPath) return '';
    return buildLiveSchemaUrl(schemaPath);
  }

  async function copyTextToClipboard(text){
    const value = String(text || '');
    if (!value) throw new Error('Nothing to copy.');
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) throw new Error('Copy failed.');
  }



  function isLiveEndpoint(endpoint){
    const ep = String(endpoint || '');
    return ep.includes('server.manus.plus') && !ep.includes('server-test') && !ep.includes('server-demo');
  }

  function buildSchemaBasePath(){
    const endpoint = String(endpointEl.value || '').trim().replace(/\/+$/,'');
    const client = normalizeSegment(clientEl.value);
    const instance = normalizeSegment(instanceEl.value);

    if (!endpoint) return '';
    if (!client) return endpoint;

    if (isLiveEndpoint(endpoint)) return endpoint + '/' + client;

    if (!instance) return endpoint + '/' + client;
    return endpoint + '/' + client + '/' + instance;
  }

  function buildLiveSchemaUrl(schemaPath){
    const base = buildSchemaBasePath();
    if (!base) return '';
    return base.replace(/\/+$/,'') + String(schemaPath || '');
  }

  function localSchemaCandidates(schemaPath){
    const clean = String(schemaPath || '').replace(/^\/+/, '').replace(/\/+$/,'');
    const parts = clean.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || 'schema';
    const withoutSchema = parts[0] === 'schema' ? parts.slice(1) : parts;
    const dashed = withoutSchema.join('-');
    const underscored = withoutSchema.join('_');
    const out = [
      './schemas/' + underscored + '.json',
      './schemas/' + dashed + '.json',
      './schemas/' + last + '.json'
    ];
    return Array.from(new Set(out));
  }

  function markSelectedSchemaLocalFallback(){
    const selected = schemaResourceEl.options[schemaResourceEl.selectedIndex];
    if (!selected) return;
    if (!selected.textContent.startsWith('**')) selected.textContent = '**' + selected.textContent + '**';
  }

  async function fetchLocalSchema(schemaPath){
    const candidates = localSchemaCandidates(schemaPath);
    let lastErr = null;
    for (const url of candidates){
      try{
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok){
          lastErr = new Error(url + ' HTTP ' + resp.status);
          continue;
        }
        console.log('LOCAL SCHEMA URL:', url);
        return await resp.json();
      }catch(e){
        lastErr = e;
      }
    }
    throw new Error('Local fallback schema not found. Tried: ' + candidates.join(', ') + (lastErr ? ' — ' + (lastErr.message || lastErr) : ''));
  }

  async function loadResourceSchema(){
    try{
      setSchemaStatus('Loading schema…','');

      const schemaPath = String(schemaResourceEl.value || '').trim();
      if (!schemaPath) throw new Error('No schema resource selected.');

      const liveUrl = buildLiveSchemaUrl(schemaPath);
      if (!liveUrl) throw new Error('Schema URL is empty. Fill endpoint + client' + (isLiveEndpoint(endpointEl.value) ? '.' : ' + instance.'));

      console.log('LIVE SCHEMA URL:', liveUrl);

      let doc = null;
      let usedLocalFallback = false;

      try{
        const headers = Object.assign({'Accept':'application/json'}, (function(){ try{ return getAuthHeader(); }catch(e){ return {}; } })());
        const resp = await fetch(liveUrl, { headers });
        const text = await resp.text();
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText + (text ? ' — ' + text.slice(0,300) : ''));
        try{ doc = text ? JSON.parse(text) : null; }
        catch(e){ throw new Error('Live schema response not JSON (first 200 chars): ' + (text || '').slice(0,200)); }
      }catch(liveErr){
        console.warn('Live schema failed; trying local fallback:', liveErr);
        usedLocalFallback = true;
        doc = await fetchLocalSchema(schemaPath);
      }

      if (!doc || typeof doc !== 'object') throw new Error('Schema document is empty.');
      if (!doc.baseUri || !Array.isArray(doc.links)) throw new Error('Schema document missing baseUri/links.');

      if (usedLocalFallback) markSelectedSchemaLocalFallback();

      currentSchemaDoc = doc;
      schemaJsonEl.textContent = safeStringify(doc, 250000);

      ops = (doc.links || []).map((lnk, i) => {
        const href = lnk && lnk.href ? lnk.href : {};
        const template = href && href.template ? href.template : '';
        const apiPath = buildApiPath(doc.baseUri, template);
        const method = (lnk && lnk.method ? String(lnk.method).toUpperCase() : 'GET');
        return {
          id: String(i),
          method: method,
          path: apiPath,
          summary: lnk && lnk.title ? String(lnk.title) : (lnk && lnk.rel ? String(lnk.rel) : 'operation'),
          parameters: schemaLinkToParams(lnk),
          _link: lnk
        };
      }).filter(op => op.path && op.path.includes('/api/'));

      setSchemaStatus('Loaded: ' + schemaPath + ' → ' + ops.length + ' operation(s).' + (usedLocalFallback ? ' Used local fallback.' : ' Used live schema.'),'ok');

      clearResponse();
      selectedOp = null;
      renderOpList();
    }catch(e){
      setSchemaStatus(String(e && e.message ? e.message : e),'danger');
      ops = []; selectedOp = null; opListEl.innerHTML='';
      schemaJsonEl.textContent = '';
    }
  }

  // buttons
  btnTogglePw.addEventListener('click', function(){
    const show = passwordEl.type === 'password';
    passwordEl.type = show ? 'text' : 'password';
    this.textContent = show ? '🙈' : '👁';
    passwordEl.focus();
  });

  document.getElementById('btnLogin').addEventListener('click', async ()=>{
    try{
      setAuthStatus('Logging in...','');
      const base = buildBasePath();
      if (!base) throw new Error('Base URL empty.');
      const tokenUrl = base + '/app/token';

      const credentials = { username: String(usernameEl.value||''), password: String(passwordEl.value||'') };

      const params = new URLSearchParams();
      params.set('grant_type','password');
      params.set('username',credentials.username);
      params.set('password',credentials.password);

      let resp = await fetch(tokenUrl, {
        method:'POST',
        headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},
        body: params.toString()
      }).catch(err => {
        throw new Error('Network error: ' + (err.message || 'Failed to connect. Check CORS settings or run from a web server.'));
      });

      let text = await resp.text();
      let tokenResp = null;
      try{ tokenResp = text ? JSON.parse(text) : null }catch(e){ tokenResp = null }

      if (!resp.ok) throw new Error(text || ('HTTP ' + resp.status));

      const token = (tokenResp && (tokenResp.access_token || tokenResp.token || tokenResp.accessToken)) || null;
      if (!token) throw new Error('No access_token found in token response: ' + (tokenResp ? JSON.stringify(tokenResp) : text || '(empty)'));

      const expiresAt = computeExpiryMs(tokenResp);

      saveAuthSession(token, tokenResp, expiresAt);

      setAuthStatus('Authenticated.','ok');
      updateTokenPreview();
      updateRequestHeadersPreview();

      if (schemaResourceEl.options.length > 0 && !schemaResourceEl.value) {
        schemaResourceEl.selectedIndex = 0;
      }
      afterLoginSuccess();
      setSchemaStatus('Authenticated. Choose a schema resource to load it.', 'ok');

    }catch(e){
      setAuthStatus(String(e && e.message ? e.message : e),'danger');
      updateTokenPreview();
    }
  });

  document.getElementById('btnLogout').addEventListener('click', ()=>{
    saveSession(null);
    setAuthStatus('Logged out.','');
    updateTokenPreview();
    updateRequestHeadersPreview();
    ops = [];
    selectedOp = null;
    opListEl.innerHTML = '';
    paramArea.innerHTML = '';
    requestUrlEl.value = '';
    renderRequestUrlPreview('');
    clearResponse();
    setSchemaStatus('Log in to load schema.', '');
    setReqStatus('Ready.', '');
    opTitleEl.textContent = '(none)';
    opDescEl.textContent = '';
    btnSend.disabled = true;
    btnCopyUrl.disabled = true;
    // Reset accordion state
    const lp = document.getElementById('panelLogin');
    const rp = document.getElementById('panelResource');
    const rqp = document.getElementById('panelRequest');
    lp.classList.remove('done');
    lp.classList.add('open');
    rp.classList.remove('done', 'open');
    if (rqp) { rqp.classList.remove('done', 'open'); document.getElementById('panelRequestSummary').textContent = 'Select an operation first'; }
    document.getElementById('panelLoginSummary').textContent = '';
    document.getElementById('panelResourceSummary').textContent = 'Log in first';
    document.getElementById('baseUrlPill').style.display = 'none';
  });

  document.getElementById('btnCopySchemaJson').addEventListener('click', async ()=>{
    try{
      if (!currentSchemaDoc) throw new Error('Load a schema first.');
      await copyTextToClipboard(schemaJsonEl.textContent || safeStringify(currentSchemaDoc, 250000));
      setSchemaStatus('Schema JSON copied to clipboard.','ok');
    }catch(e){
      setSchemaStatus(String(e && e.message ? e.message : e),'warn');
    }
  });

  document.getElementById('btnCopySchemaUrl').addEventListener('click', async ()=>{
    try{
      const url = getResolvedSchemaUrl();
      if (!url) throw new Error('Fill endpoint/client and select a schema resource first.');
      await copyTextToClipboard(url);
      setSchemaStatus('Schema URL copied to clipboard.','ok');
    }catch(e){
      setSchemaStatus(String(e && e.message ? e.message : e),'warn');
    }
  });

  opFilterEl.addEventListener('input', renderOpList);

  // init — deferred so DOM is fully ready and base URL is resolved before schema auto-loads
  document.addEventListener('DOMContentLoaded', function(){
    updateBaseUrl();

    const s = readSession();
    setAuthStatus((s && s.token) ? 'Authenticated (session found).' : 'Not authenticated.', (s && s.token) ? 'ok' : '');
    setReqStatus('Ready.','');
    updateTokenPreview();
    updateRequestHeadersPreview();

    // 1) Initialize schema dropdown
    initSchemaResourceDropdown();

    // 2) Select first resource, but do not load it automatically.
    if (schemaResourceEl.options.length > 0) {
      schemaResourceEl.selectedIndex = 0;

      if (s && s.token && s.scope_basePath === currentAuthScope()) {
        afterLoginSuccess();
        setSchemaStatus('Authenticated. Choose a schema resource to load it.', 'ok');
      } else {
        setSchemaStatus('Not authenticated. Log in, then choose a schema resource.', 'warn');
      }
    }
  });

  // 3) Still support the manual button
  btnLoadResource.addEventListener('click', loadResourceSchema);

  // 4) Changing schema automatically loads the selected schema.
  schemaResourceEl.addEventListener('change', () => {
    if (!schemaResourceEl.value) return;

    ops = [];
    selectedOp = null;
    opListEl.innerHTML = '';
    paramArea.innerHTML = '';
    requestUrlEl.value = '';
    renderRequestUrlPreview('');
    clearResponse();

    const session = readSession();
    if (session && session.token && session.scope_basePath === currentAuthScope()) {
      loadResourceSchema();
    } else {
      setSchemaStatus('Schema selected. Log in to load it.', 'warn');
    }
  });

  btnCopyUrl.addEventListener('click', async ()=>{
    if (!requestUrlEl.value) return;
    await copyToClipboard(requestUrlEl.value);
    setReqStatus('URL copied to clipboard.','ok');
    setTimeout(()=>setReqStatus('Ready.',''),1200);
  });

  function tableToMarkdown(container){
    const table = container.querySelector('table');
    if (!table) return '';

    const esc = (s) => String(s ?? '')
      .replace(/\r?\n/g, '<br>')
      .replace(/\|/g, '\\|')
      .trim();

    // headers
    let headers = Array.from(table.querySelectorAll('thead th')).map(th => esc(th.innerText));
    if (!headers.length){
      const firstRow = table.querySelector('tr');
      if (firstRow) headers = Array.from(firstRow.querySelectorAll('th,td')).map(td => esc(td.innerText));
    }
    if (!headers.length) return '';

    // body rows
    const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    const rows = bodyRows.map(tr =>
      Array.from(tr.querySelectorAll('td,th')).map(td => esc(td.innerText))
    );

    // normalize row length to header length
    const colCount = headers.length;
    const normRow = (r) => {
      const out = r.slice(0, colCount);
      while (out.length < colCount) out.push('');
      return out;
    };

    const headerLine = `| ${headers.join(' | ')} |`;
    const sepLine    = `| ${headers.map(()=>'---').join(' | ')} |`;
    const rowLines   = rows.map(r => `| ${normRow(r).join(' | ')} |`);

    return [headerLine, sepLine, ...rowLines].join('\n');
  }

  function summaryToText(container){
    if (!container) return '';
    return container.innerText.trim();
  }

  btnDownloadResponse.addEventListener('click', ()=>{
    if (lastResponse === null || lastResponse === undefined) return;

    const base = sanitizeFilename(getResourceBaseName());
    downloadJson(lastResponse, base + '.json');
  });

  btnExportCsv.addEventListener('click', ()=>{
    const csv = tableToCSVExport(respTableEl);
    if (!csv) return;

    const base = sanitizeFilename(getResourceBaseName());
    downloadTextFile(csv, base + '.csv', 'text/csv;charset=utf-8');
  });

  // ---------- Localization / formatting helpers ----------
  const BROWSER_LOCALE = navigator.language || 'nl-NL';

  const nfAlways2 = new Intl.NumberFormat(BROWSER_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  // Always use semicolon for CSV
  const CSV_DELIM = ';';

  function formatForCsv(val){
    const num = Number(val);
    if (!isFinite(num)) return String(val ?? '');
    return nfAlways2.format(num);
  }

  function tableToCSVExport(container){
    const table = container.querySelector('table');
    if (!table) return '';

    const rows = Array.from(table.querySelectorAll('tr'));
    const lines = [`sep=${CSV_DELIM}`];

    for (const row of rows){
      const cells = Array.from(row.querySelectorAll('th,td'));
      const vals = cells.map(c => {
        let s = (c.innerText || '').trim();

        const numCandidate = s.replace(/\s+/g,'').replace(',', '.');
        if (numCandidate !== '' && isFinite(Number(numCandidate))){
          s = formatForCsv(numCandidate);
        }

        const escaped = String(s).replace(/"/g,'""');
        const needsQuotes =
          escaped.includes('"') ||
          escaped.includes(CSV_DELIM) ||
          escaped.includes('\n');
        return needsQuotes ? `"${escaped}"` : escaped;
      });

      lines.push(vals.join(CSV_DELIM));
    }

    return lines.join('\n');
  }

  function downloadTextFile(text, filename, mime){
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // -------- Filename helpers --------
  function sanitizeFilename(name){
    return String(name || 'response')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'response';
  }

  function getResourceBaseName(){
    // Prefer selected operation path
    if (selectedOp && selectedOp.path){
      const p = String(selectedOp.path).replace(/\/+$/,'');
      const last = p.split('/').filter(Boolean).slice(-1)[0];
      if (last) return last;
    }

    // Fallback to selected schema resource
    if (schemaResourceEl && schemaResourceEl.value){
      const p = String(schemaResourceEl.value).replace(/\/+$/,'');
      const last = p.split('/').filter(Boolean).slice(-1)[0];
      if (last) return last;
    }

    return 'response';
  }

  // ------------------ Copy button (simplified) ------------------
  btnCopyResponse.addEventListener('click', async () => {
    const activeTabEl = respTabs.querySelector('.tab.active');
    if (!activeTabEl) return;
    const tabName = activeTabEl.dataset.tab;

    let textToCopy = '';

    if (tabName === 'json') {
      textToCopy = String(respJsonEl.textContent || '').trim();
    } else if (tabName === 'table') {
      textToCopy = (typeof tableToMarkdown === 'function')
        ? String(tableToMarkdown(respTableEl) || '').trim()
        : '';
    } else { // summary
      textToCopy = summaryToText(respSummaryEl);
    }

    if (!textToCopy) return;

    const bytes = new Blob([textToCopy]).size;
    if (bytes > 1024 * 1024) {
      setReqStatus('Copy disabled: visible content is > 1MB. Use Download JSON.', 'warn');
      return;
    }

    try {
      await copyToClipboard(textToCopy);
    } catch (e) {
      setReqStatus('Copy failed: ' + String(e && e.message ? e.message : e), 'danger');
      return;
    }

    if (tabName === 'json') setReqStatus('Copied JSON to clipboard.', 'ok');
    else if (tabName === 'table') setReqStatus('Copied table as Markdown to clipboard.', 'ok');
    else setReqStatus('Copied summary to clipboard.', 'ok');

    setTimeout(() => setReqStatus('Ready.', ''), 1200);
  });


  function isFieldUsable(el){
    if (!el) return false;
    if (el.disabled) return false;
    if (el.type === 'hidden') return false;
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
    return true;
  }

  function getConnectFieldOrder(){
    return [endpointEl, clientEl, instanceEl, usernameEl, passwordEl].filter(isFieldUsable);
  }

  function getFieldWrap(el){
    if (!el) return null;
    return el.closest('div');
  }

  function clearActiveFieldPath(){
    document.querySelectorAll('.field-active').forEach(el => el.classList.remove('field-active'));
  }

  function setActiveFieldPath(el){
    clearActiveFieldPath();
    const wrap = getFieldWrap(el);
    if (wrap) wrap.classList.add('field-active');
  }

  function focusNextConnectField(currentEl){
    const fields = getConnectFieldOrder();
    const idx = fields.indexOf(currentEl);
    const next = idx >= 0 ? fields[idx + 1] : null;
    if (next) {
      next.focus();
      if (typeof next.select === 'function' && next.tagName === 'INPUT') next.select();
      return true;
    }
    return false;
  }

  function enableEnterNavigation(){
    [endpointEl, clientEl, instanceEl, usernameEl, passwordEl].forEach(el => {
      if (!el) return;
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (!focusNextConnectField(el)) btnLogin.click();
      });
      el.addEventListener('focus', () => setActiveFieldPath(el));
      el.addEventListener('click', () => setActiveFieldPath(el));
    });
    if (btnLogin) {
      btnLogin.addEventListener('focus', clearActiveFieldPath);
      btnLogin.addEventListener('click', clearActiveFieldPath);
    }
    if (btnLogout) {
      btnLogout.addEventListener('focus', clearActiveFieldPath);
    }
    const first = getConnectFieldOrder()[0];
    if (document.activeElement === document.body && first) setActiveFieldPath(first);
  }

  btnSend.addEventListener('click', async ()=>{
    if (!selectedOp) return;
    // Collapse all panels so response has full focus
    ['panelLogin','panelResource','panelRequest'].forEach(id => {
      const p = document.getElementById(id);
      if (p) p.classList.remove('open');
    });
    try{
      setReqStatus('Sending request...','');
      clearResponse();
      const built = buildUrlForOp(selectedOp);
      if (built.error) throw new Error(built.error);
      const result = await apiSend('GET', built.url);

const meta = {
  ok: result.ok,
  status: result.status,
  statusText: result.statusText,
  ms: result.ms,
  url: built.url,
  parseErr: result.parseErr,
  text: result.text
};

let statusMsg;

if (result.ok) {
  statusMsg = 'Request completed.';
} else {
  let apiMessage = '';

  if (result.json && typeof result.json === 'object') {
    if (result.json.message) apiMessage = result.json.message;
    else if (result.json.error) apiMessage = result.json.error;
    else if (result.json.detail) apiMessage = result.json.detail;
  }

  statusMsg = apiMessage
    ? `Error ${result.status} — ${apiMessage}`
    : `Error: HTTP ${result.status}${result.statusText ? ' ' + result.statusText : ''}`;
}

setReqStatus(statusMsg, result.ok ? 'ok' : 'danger');

// Always show response body if it exists
let bodyToRender;

if (result.parseErr) {
  bodyToRender = result.text || '';
} else if (result.json !== null) {
  bodyToRender = result.json;
} else {
  bodyToRender = result.text || '';
}

renderResponse(meta, bodyToRender);

// Always switch to JSON tab when there is a body
setActiveTab(bodyToRender ? 'json' : 'summary');
    }catch(e){
      setReqStatus(String(e && e.message ? e.message : e),'danger');
    }
  });

  respTabs.addEventListener('click', ev=>{
    const t = ev.target.closest('.tab');
    if (!t) return;
    setActiveTab(t.dataset.tab);
  });

  previewLimitEl.addEventListener('change', ()=>{
    if (lastResponseMeta && lastResponse !== null && lastResponse !== undefined){
      renderResponse(lastResponseMeta, lastResponse);
    }
  });

  function updateBaseUrl(){
    const base = buildBasePath();
    baseUrlEl.textContent = base || '(fill endpoint + client)';
    updateRequestUrl();
  }

  requestVersionEl.addEventListener('change', updateRequestUrl);
  [endpointEl, clientEl, instanceEl, usernameEl, passwordEl].forEach(el => {
    el.addEventListener('input', updateTokenPreview);
    el.addEventListener('change', updateTokenPreview);
  });
  
  function getInstanceRememberKey(){
  const client = typeof clientEl !== 'undefined' && clientEl ? String(clientEl.value || '').trim() : '';
  const instance = typeof instanceEl !== 'undefined' && instanceEl ? String(instanceEl.value || '').trim() : '';
  const baseUrl = typeof baseUrlEl !== 'undefined' && baseUrlEl ? String(baseUrlEl.value || '').trim() : '';
  return [client, instance, baseUrl].join(' | ');
}

function rememberSpecialParamValue(name, value){
  if (name !== 'nodeId') return;

  const key = getInstanceRememberKey();
  if (!key) return;

  _rememberedNodeIdByInstance[key] = String(value || '').trim();
}

function getRememberedSpecialParamValue(name){
  if (name !== 'nodeId') return '';

  const key = getInstanceRememberKey();
  if (!key) return '';

  return _rememberedNodeIdByInstance[key] || '';
}

  // Called whenever endpoint/client/instance changes — clears all stale state
  function resetScope(){
    ensureSessionMatchesScope(); // invalidates token if scope changed
    // Reset schema + operations
    ops = [];
    selectedOp = null;
    opListEl.innerHTML = '';
    paramArea.innerHTML = '';
    requestUrlEl.value = '';
    clearResponse();
    setSchemaStatus('Scope changed. Log in again to load schema.', 'warn');
    setReqStatus('Ready.', '');
    opTitleEl.textContent = '(none)';
    opDescEl.textContent = '';
    btnSend.disabled = true;
    btnCopyUrl.disabled = true;
    // Reset accordion panels back to login step
    const lp = document.getElementById('panelLogin');
    const rp = document.getElementById('panelResource');
    const rqp = document.getElementById('panelRequest');
    if (lp) { lp.classList.remove('done'); lp.classList.add('open'); document.getElementById('panelLoginSummary').textContent = ''; }
    if (rp) { rp.classList.remove('done', 'open'); document.getElementById('panelResourceSummary').textContent = 'Log in first'; }
    if (rqp) { rqp.classList.remove('done', 'open'); document.getElementById('panelRequestSummary').textContent = 'Select an operation first'; }
    const pill = document.getElementById('baseUrlPill');
    if (pill) pill.style.display = 'none';
  }

  function updateInstanceLabel(){
    const ep = String(endpointEl.value || '');
    const isTestDemo = ep.includes('server-test') || ep.includes('server-demo');
    const reqEl = document.getElementById('instanceRequired');
    const optEl = document.getElementById('instanceOptional');
    if (reqEl) reqEl.style.display = isTestDemo ? '' : 'none';
    if (optEl) optEl.style.display = isTestDemo ? 'none' : '';
    if (!isTestDemo){
      instanceEl.value = '';
      instanceEl.disabled = true;
      instanceEl.style.background = '#f0f0f0';
      instanceEl.style.color = '#aaa';
    } else {
      instanceEl.disabled = false;
      instanceEl.style.background = '';
      instanceEl.style.color = '';
    }
  }

  endpointEl.addEventListener('change', ()=>{
    updateBaseUrl();
    resetScope();
    updateInstanceLabel();
  });

  updateInstanceLabel(); // run on load
  enableEnterNavigation();

  clientEl.addEventListener('input', ()=>{
    updateBaseUrl();
    resetScope();
  });
  instanceEl.addEventListener('input', ()=>{
    updateBaseUrl();
    resetScope();
  });

  // ── Accordion panels ──
  function togglePanel(panelEl){
    panelEl.classList.toggle('open');
  }

  document.getElementById('panelLoginHeader').addEventListener('click', ()=>{
    togglePanel(document.getElementById('panelLogin'));
  });
  document.getElementById('panelResourceHeader').addEventListener('click', ()=>{
    togglePanel(document.getElementById('panelResource'));
  });
  document.getElementById('panelRequestHeader').addEventListener('click', ()=>{
    togglePanel(document.getElementById('panelRequest'));
  });

  // After successful login: keep step 1 and 2 as-is; only update summaries/state.
  // Panels should collapse only when an operation is selected or Send is clicked.
  function afterLoginSuccess(){
    const loginPanel = document.getElementById('panelLogin');
    const resourcePanel = document.getElementById('panelResource');
    const summary = document.getElementById('panelLoginSummary');

    if (loginPanel) {
      loginPanel.classList.add('done');
      loginPanel.classList.add('open');
    }

    const ep = endpointEl.options[endpointEl.selectedIndex];
    const epLabel = ep ? ep.textContent.trim() : '';
    summary.textContent = (clientEl.value ? clientEl.value : '') + (instanceEl.value ? '/' + instanceEl.value : '') + (epLabel ? ' · ' + epLabel : '');

    if (resourcePanel) {
      resourcePanel.classList.remove('done');
      // do not auto-open here
    }
    document.getElementById('panelResourceSummary').textContent = 'Authenticated — choose a resource';

    // Show base URL pill in header
    document.getElementById('baseUrlPill').style.display = '';
  }

  // After operation is selected: mark step 2 done, collapse it
  function afterOperationSelected(op){
    const resourcePanel = document.getElementById('panelResource');
    resourcePanel.classList.add('done');
    resourcePanel.classList.remove('open');
    document.getElementById('panelResourceSummary').textContent = (op.method || '') + ' ' + (op.path || '');

    // Open step 3
    const requestPanel = document.getElementById('panelRequest');
    requestPanel.classList.add('open');
    document.getElementById('panelRequestSummary').textContent = (op.method || '') + ' ' + (op.path || '');
  }

  // Watch for login success  
  btnLogin.addEventListener('click', ()=>{
    setTimeout(()=>{
      const s = readSession();
      if (s && s.token){
        afterLoginSuccess();
      }
    }, 900);
  });


  // ── Webhook subscription tool ──
  const CENTRAL_HOOK_EVENT_URL = 'https://api.manus.plus/central/hook/event/';
  const CENTRAL_HOOK_SUBSCRIPTION_URL = 'https://api.manus.plus/central/hook/subscription/';
  const KNOWN_SUBSCRIPTIONS_KEY = 'manus_hook_known_subscription_ids';
  // Replace this placeholder after publishing the GitHub release package.
  const WEBHOOK_LISTENER_DOWNLOAD_URL = './downloads/manus-webhook-listener.zip';

  const toolTabExplorer = document.getElementById('toolTabExplorer');
  const toolTabSubscription = document.getElementById('toolTabSubscription');
  const subscriptionView = document.getElementById('subscriptionView');
  const subscriptionPublisherEl = document.getElementById('subscriptionPublisher');
  const subscriptionEventEl = document.getElementById('subscriptionEvent');
  const subscriptionEventFilterEl = document.getElementById('subscriptionEventFilter');
  const subscriptionSubscriberEl = document.getElementById('subscriptionSubscriber');
  const subscriptionTokenStatusEl = document.getElementById('subscriptionTokenStatus');
  const subscriptionRequestPreviewEl = document.getElementById('subscriptionRequestPreview');
  const subscriptionResponseEl = document.getElementById('subscriptionResponse');
  const subscriptionCreateStatusEl = document.getElementById('subscriptionCreateStatus');
  const btnCreateSubscription = document.getElementById('btnCreateSubscription');
  const btnReloadHookEvents = document.getElementById('btnReloadHookEvents');
  const knownSubscriptionIdEl = document.getElementById('knownSubscriptionId');
  const btnAddKnownSubscription = document.getElementById('btnAddKnownSubscription');
  const btnRefreshKnownSubscriptions = document.getElementById('btnRefreshKnownSubscriptions');
  const knownSubscriptionStatusEl = document.getElementById('knownSubscriptionStatus');
  const knownSubscriptionListEl = document.getElementById('knownSubscriptionList');
  const listenerDownloadLinkEl = document.getElementById('listenerDownloadLink');
  const listenerSetupStatusEl = document.getElementById('listenerSetupStatus');

  let hookEventItems = [];
  let hookEventsLoaded = false;

  function setSubscriptionStatus(el, message, level){
    if (!el) return;
    el.textContent = message || '';
    el.className = 'status ' + (level === 'ok' ? 'ok' : level === 'warn' ? 'warn' : level === 'danger' ? 'danger' : '');
  }

  function configureListenerDownload(){
    if (!listenerDownloadLinkEl || !listenerSetupStatusEl) return;
    if (WEBHOOK_LISTENER_DOWNLOAD_URL){
      listenerDownloadLinkEl.href = WEBHOOK_LISTENER_DOWNLOAD_URL;
      listenerDownloadLinkEl.removeAttribute('aria-disabled');
      listenerSetupStatusEl.textContent = 'Listener package download is configured.';
      listenerSetupStatusEl.className = 'status ok';
    } else {
      listenerDownloadLinkEl.href = '#';
      listenerDownloadLinkEl.setAttribute('aria-disabled', 'true');
      listenerSetupStatusEl.textContent = 'Download URL not configured. Set WEBHOOK_LISTENER_DOWNLOAD_URL in app.js after publishing the GitHub release.';
      listenerSetupStatusEl.className = 'status warn';
    }
  }

  function setToolMode(mode){
    const subscriptionMode = mode === 'subscription';
    document.querySelectorAll('.explorer-only').forEach(el => { el.hidden = subscriptionMode; });
    if (subscriptionView) subscriptionView.hidden = !subscriptionMode;
    if (toolTabExplorer){
      toolTabExplorer.classList.toggle('active', !subscriptionMode);
      toolTabExplorer.setAttribute('aria-selected', subscriptionMode ? 'false' : 'true');
    }
    if (toolTabSubscription){
      toolTabSubscription.classList.toggle('active', subscriptionMode);
      toolTabSubscription.setAttribute('aria-selected', subscriptionMode ? 'true' : 'false');
    }
    if (subscriptionMode){
      updateSubscriptionUi();
      if (!hookEventsLoaded) loadHookEvents();
      renderKnownSubscriptions();
    }
  }

  function getValidSubscriptionSession(){
    // Reuse the explorer's existing scope and expiry checks without changing storage behavior.
    getAuthHeader();
    const session = readSession();
    if (!session || !session.token) throw new Error('Authenticate to the Manus instance first.');
    return session;
  }

  function buildHookPublisher(){
    const base = buildBasePath();
    return base ? base.replace(/\/+$/, '') + '/api/hook' : '';
  }

  function normalizeSubscriberUrl(value){
    const raw = String(value || '').trim().replace(/\/+$/, '');
    if (!raw) throw new Error('Enter the public ngrok subscriber URL.');
    let parsed;
    try { parsed = new URL(raw); } catch (_) { throw new Error('Subscriber must be a valid absolute URL.'); }
    if (parsed.protocol !== 'https:') throw new Error('Subscriber must use HTTPS.');
    return raw;
  }

  function maskTokenForSubscription(token){
    const value = String(token || '');
    if (!value) return '';
    return value.slice(0, 8) + '...' + (value.length > 12 ? value.slice(-4) : '');
  }

  function buildSubscriptionPayload(requireComplete){
    const publisher = buildHookPublisher();
    let session = null;
    try { session = getValidSubscriptionSession(); } catch (e) { if (requireComplete) throw e; }
    const eventName = String(subscriptionEventEl ? subscriptionEventEl.value : '').trim();
    let subscriber = String(subscriptionSubscriberEl ? subscriptionSubscriberEl.value : '').trim();

    if (requireComplete){
      if (!publisher) throw new Error('Fill endpoint, client and instance first.');
      if (!eventName) throw new Error('Select an event.');
      subscriber = normalizeSubscriberUrl(subscriber);
    }

    return {
      publisher,
      token: session ? session.token : '',
      event: eventName,
      subscriber
    };
  }

  function updateSubscriptionUi(){
    if (!subscriptionPublisherEl) return;
    const publisher = buildHookPublisher();
    subscriptionPublisherEl.value = publisher;

    let validSession = null;
    let tokenMessage = 'Not authenticated';
    try {
      validSession = getValidSubscriptionSession();
      tokenMessage = 'Available · ' + maskTokenForSubscription(validSession.token);
      subscriptionTokenStatusEl.className = 'pill';
    } catch (e) {
      tokenMessage = String(e && e.message ? e.message : e);
      subscriptionTokenStatusEl.className = 'pill';
    }
    subscriptionTokenStatusEl.textContent = tokenMessage;

    const draft = buildSubscriptionPayload(false);
    const preview = Object.assign({}, draft, {
      token: draft.token ? maskTokenForSubscription(draft.token) : ''
    });
    subscriptionRequestPreviewEl.textContent = JSON.stringify({
      method: 'POST',
      url: CENTRAL_HOOK_SUBSCRIPTION_URL,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: preview
    }, null, 2);

    btnCreateSubscription.disabled = !(
      validSession && publisher && draft.event && String(draft.subscriber || '').trim()
    );
  }

  function normalizeHookEvents(data){
    const source = Array.isArray(data) ? data :
      (data && Array.isArray(data.items)) ? data.items :
      (data && Array.isArray(data.data)) ? data.data : [];
    const names = source.map(item => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      return String(item.event || item.name || item.code || item.id || '').trim();
    }).filter(Boolean);
    return Array.from(new Set(names)).sort((a,b) => a.localeCompare(b));
  }

  function renderHookEventOptions(){
    if (!subscriptionEventEl) return;
    const current = subscriptionEventEl.value;
    const q = String(subscriptionEventFilterEl.value || '').trim().toLowerCase();
    const filtered = q ? hookEventItems.filter(x => x.toLowerCase().includes(q)) : hookEventItems;
    subscriptionEventEl.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = filtered.length ? '-- select event --' : (hookEventItems.length ? 'No matching events' : 'No events returned');
    subscriptionEventEl.appendChild(placeholder);
    filtered.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      subscriptionEventEl.appendChild(option);
    });
    if ([...subscriptionEventEl.options].some(o => o.value === current)) subscriptionEventEl.value = current;
    subscriptionEventEl.disabled = !hookEventItems.length;
    updateSubscriptionUi();
  }

  async function readCentralResponse(response){
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
    return { text, body };
  }

  async function loadHookEvents(){
    if (!subscriptionEventEl) return;
    subscriptionEventEl.disabled = true;
    subscriptionEventEl.innerHTML = '<option value="">Loading events...</option>';
    setSubscriptionStatus(subscriptionCreateStatusEl, 'Loading available hook events...', '');
    try {
      const response = await fetch(CENTRAL_HOOK_EVENT_URL, { headers: { Accept: 'application/json' } });
      const result = await readCentralResponse(response);
      if (!response.ok) throw new Error('Unable to load events: HTTP ' + response.status + (result.text ? ' — ' + result.text : ''));
      hookEventItems = normalizeHookEvents(result.body);
      hookEventsLoaded = true;
      renderHookEventOptions();
      setSubscriptionStatus(subscriptionCreateStatusEl, 'Loaded ' + hookEventItems.length + ' event(s).', 'ok');
    } catch (e) {
      hookEventsLoaded = false;
      hookEventItems = [];
      subscriptionEventEl.innerHTML = '<option value="">Failed to load events</option>';
      setSubscriptionStatus(subscriptionCreateStatusEl, String(e && e.message ? e.message : e), 'danger');
    }
  }

  function extractSubscriptionId(body){
    if (body == null) return '';
    if (typeof body === 'string'){
      const trimmed = body.trim().replace(/^['"]|['"]$/g, '');
      return trimmed && trimmed.length < 300 ? trimmed : '';
    }
    if (typeof body !== 'object') return '';
    const directKeys = ['subscriptionId', 'subscription_id', 'id'];
    for (const key of directKeys){
      if (body[key] != null && String(body[key]).trim()) return String(body[key]).trim();
    }
    for (const key of ['subscription', 'data', 'result']){
      const nested = extractSubscriptionId(body[key]);
      if (nested) return nested;
    }
    return '';
  }

  function readKnownSubscriptionIds(){
    try {
      const value = JSON.parse(localStorage.getItem(KNOWN_SUBSCRIPTIONS_KEY) || '[]');
      return Array.isArray(value) ? value.map(x => String(x || '').trim()).filter(Boolean) : [];
    } catch (_) { return []; }
  }

  function writeKnownSubscriptionIds(ids){
    const unique = Array.from(new Set((ids || []).map(x => String(x || '').trim()).filter(Boolean)));
    localStorage.setItem(KNOWN_SUBSCRIPTIONS_KEY, JSON.stringify(unique));
    return unique;
  }

  function rememberSubscriptionId(id){
    const clean = String(id || '').trim();
    if (!clean) return readKnownSubscriptionIds();
    return writeKnownSubscriptionIds([...readKnownSubscriptionIds(), clean]);
  }

  function forgetSubscriptionId(id){
    const clean = String(id || '').trim();
    return writeKnownSubscriptionIds(readKnownSubscriptionIds().filter(x => x !== clean));
  }

  async function getSubscriptionById(id){
    const clean = String(id || '').trim();
    if (!clean) throw new Error('Enter a subscription ID.');
    const url = CENTRAL_HOOK_SUBSCRIPTION_URL + encodeURIComponent(clean);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const result = await readCentralResponse(response);
    if (!response.ok) throw new Error('Unable to load subscription ' + clean + ': HTTP ' + response.status + (result.text ? ' — ' + result.text : ''));
    return result.body;
  }

  function pickSubscriptionField(obj, keys){
    if (!obj || typeof obj !== 'object') return '';
    for (const key of keys){
      if (obj[key] != null && String(obj[key]).trim() !== '') return String(obj[key]);
    }
    return '';
  }

  function renderKnownSubscriptionItem(id, result){
    const item = document.createElement('div');
    item.className = 'known-subscription-item';
    const head = document.createElement('div');
    head.className = 'known-subscription-head';
    const idEl = document.createElement('div');
    idEl.className = 'known-subscription-id';
    idEl.textContent = id;
    const actions = document.createElement('div');
    actions.className = 'known-subscription-actions';
    const refresh = document.createElement('button');
    refresh.className = 'btn'; refresh.type = 'button'; refresh.textContent = 'Refresh';
    refresh.addEventListener('click', async () => { await renderKnownSubscriptions(id); });
    const forget = document.createElement('button');
    forget.className = 'btn'; forget.type = 'button'; forget.textContent = 'Forget locally';
    forget.addEventListener('click', () => { forgetSubscriptionId(id); renderKnownSubscriptions(); });
    actions.append(refresh, forget);
    head.append(idEl, actions);
    item.appendChild(head);

    if (!result.ok){
      const status = document.createElement('div');
      status.className = 'status danger';
      status.textContent = result.error;
      item.appendChild(status);
      return item;
    }

    const data = result.data;
    const summary = document.createElement('dl');
    summary.className = 'known-subscription-summary';
    const fields = [
      ['Event', pickSubscriptionField(data, ['event', 'eventName'])],
      ['Publisher', pickSubscriptionField(data, ['publisher'])],
      ['Subscriber', pickSubscriptionField(data, ['subscriber'])],
      ['Status', pickSubscriptionField(data, ['status', 'state'])]
    ].filter(([,value]) => value);
    fields.forEach(([label,value]) => {
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      summary.append(dt, dd);
    });
    if (fields.length) item.appendChild(summary);
    const details = document.createElement('details');
    const detailsSummary = document.createElement('summary');
    detailsSummary.textContent = 'Raw response';
    const pre = document.createElement('pre');
    pre.className = 'known-subscription-json';
    pre.textContent = JSON.stringify(data, null, 2);
    details.append(detailsSummary, pre);
    item.appendChild(details);
    return item;
  }

  async function renderKnownSubscriptions(focusId){
    if (!knownSubscriptionListEl) return;
    const ids = readKnownSubscriptionIds();
    knownSubscriptionListEl.innerHTML = '';
    if (!ids.length){
      setSubscriptionStatus(knownSubscriptionStatusEl, 'No subscription IDs are known to this browser.', '');
      return;
    }
    setSubscriptionStatus(knownSubscriptionStatusEl, 'Loading ' + ids.length + ' known subscription(s)...', '');
    const results = await Promise.all(ids.map(async id => {
      try { return { id, ok: true, data: await getSubscriptionById(id) }; }
      catch (e) { return { id, ok: false, error: String(e && e.message ? e.message : e) }; }
    }));
    results.forEach(result => knownSubscriptionListEl.appendChild(renderKnownSubscriptionItem(result.id, result)));
    const okCount = results.filter(x => x.ok).length;
    setSubscriptionStatus(knownSubscriptionStatusEl, 'Loaded ' + okCount + ' of ' + ids.length + ' known subscription(s).', okCount === ids.length ? 'ok' : 'warn');
    if (focusId){
      const match = [...knownSubscriptionListEl.querySelectorAll('.known-subscription-id')].find(el => el.textContent === focusId);
      if (match) match.closest('.known-subscription-item').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  async function createHookSubscription(){
    try {
      btnCreateSubscription.disabled = true;
      setSubscriptionStatus(subscriptionCreateStatusEl, 'Creating subscription...', '');
      const payload = buildSubscriptionPayload(true);
      const response = await fetch(CENTRAL_HOOK_SUBSCRIPTION_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await readCentralResponse(response);
      subscriptionResponseEl.textContent = typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2);
      if (!response.ok) throw new Error('Subscription failed: HTTP ' + response.status + (result.text ? ' — ' + result.text : ''));
      const subscriptionId = extractSubscriptionId(result.body);
      if (subscriptionId){
        rememberSubscriptionId(subscriptionId);
        setSubscriptionStatus(subscriptionCreateStatusEl, 'Subscription created. ID: ' + subscriptionId, 'ok');
        await renderKnownSubscriptions(subscriptionId);
      } else {
        setSubscriptionStatus(subscriptionCreateStatusEl, 'Subscription created, but no subscription ID could be identified in the response.', 'warn');
      }
    } catch (e) {
      setSubscriptionStatus(subscriptionCreateStatusEl, String(e && e.message ? e.message : e), 'danger');
    } finally {
      updateSubscriptionUi();
    }
  }

  async function addKnownSubscription(){
    const id = String(knownSubscriptionIdEl.value || '').trim();
    if (!id){
      setSubscriptionStatus(knownSubscriptionStatusEl, 'Enter a subscription ID.', 'warn');
      return;
    }
    btnAddKnownSubscription.disabled = true;
    setSubscriptionStatus(knownSubscriptionStatusEl, 'Loading subscription ' + id + '...', '');
    try {
      await getSubscriptionById(id);
      rememberSubscriptionId(id);
      knownSubscriptionIdEl.value = '';
      await renderKnownSubscriptions(id);
    } catch (e) {
      setSubscriptionStatus(knownSubscriptionStatusEl, String(e && e.message ? e.message : e), 'danger');
    } finally {
      btnAddKnownSubscription.disabled = false;
    }
  }

  if (toolTabExplorer) toolTabExplorer.addEventListener('click', () => setToolMode('explorer'));
  if (toolTabSubscription) toolTabSubscription.addEventListener('click', () => setToolMode('subscription'));
  if (subscriptionEventEl) subscriptionEventEl.addEventListener('change', updateSubscriptionUi);
  if (subscriptionEventFilterEl) subscriptionEventFilterEl.addEventListener('input', renderHookEventOptions);
  if (subscriptionSubscriberEl) subscriptionSubscriberEl.addEventListener('input', updateSubscriptionUi);
  if (btnReloadHookEvents) btnReloadHookEvents.addEventListener('click', loadHookEvents);
  if (btnCreateSubscription) btnCreateSubscription.addEventListener('click', createHookSubscription);
  if (btnAddKnownSubscription) btnAddKnownSubscription.addEventListener('click', addKnownSubscription);
  if (btnRefreshKnownSubscriptions) btnRefreshKnownSubscriptions.addEventListener('click', () => renderKnownSubscriptions());
  if (knownSubscriptionIdEl) knownSubscriptionIdEl.addEventListener('keydown', event => {
    if (event.key === 'Enter'){ event.preventDefault(); addKnownSubscription(); }
  });

  // Keep the subscription preview synchronized with the unchanged explorer login scope.
  [endpointEl, clientEl, instanceEl, usernameEl, passwordEl].forEach(el => {
    if (!el) return;
    el.addEventListener('input', updateSubscriptionUi);
    el.addEventListener('change', updateSubscriptionUi);
  });
  if (btnLogin) btnLogin.addEventListener('click', () => setTimeout(updateSubscriptionUi, 950));
  if (btnLogout) btnLogout.addEventListener('click', updateSubscriptionUi);

  configureListenerDownload();
  setToolMode('explorer');

})();
