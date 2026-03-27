/* ------------------------------------------------------------------ */
/* KPI bar metrics                                                      */
/* ------------------------------------------------------------------ */
const KPI_KEYS = ['spend', 'roas', 'conversions', 'conversion_rate', 'cpa', 'ctr'];

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */
const state = {
  platform: 'meta',
  dateRange: 'last_7d',
  loading: false,
  metaInfo: null,
  accounts: [],
  activeAccountId: null,
  // modal state
  editingAccountId: null,  // null = new account
  // AI state
  niche: null,
  objective: null,
  aov: null,
  analyzing: false,
  lastMetrics: null,
  lastAnalysis: '',
  aiPanelOpen: false,
};

/* ------------------------------------------------------------------ */
/* Init                                                                 */
/* ------------------------------------------------------------------ */
async function init() {
  await Promise.all([loadMetaInfo(), loadAccounts(), loadNiche()]);
  setupEventListeners();
  loadMetrics();
}

async function loadMetaInfo() {
  const res = await fetch('/api/meta-info');
  state.metaInfo = await res.json();
}

/* ------------------------------------------------------------------ */
/* Accounts                                                             */
/* ------------------------------------------------------------------ */
async function loadAccounts() {
  const res = await fetch('/api/accounts');
  const data = await res.json();
  state.accounts = data.accounts;
  state.activeAccountId = data.activeId;
  renderAccountSwitcher();
  updateStatusBadges();
}

function renderAccountSwitcher() {
  const active = state.accounts.find(a => a.active) ?? state.accounts[0];
  if (!active) return;

  // Update button
  document.getElementById('account-avatar').textContent = active.name.charAt(0).toUpperCase();
  document.getElementById('account-name').textContent = active.name;

  // Render list
  const list = document.getElementById('account-list');
  list.innerHTML = '';

  for (const acc of state.accounts) {
    const platforms = [acc.meta && 'Meta', acc.google && 'Google'].filter(Boolean).join(' · ') || 'No platforms configured';

    const row = document.createElement('div');
    row.className = 'account-row' + (acc.active ? ' active-row' : '');
    row.dataset.id = acc.id;
    row.innerHTML = `
      <div class="account-row-check">
        ${acc.active ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>
      <div class="account-row-avatar">${acc.name.charAt(0).toUpperCase()}</div>
      <div class="account-row-info">
        <div class="account-row-name">${esc(acc.name)}</div>
        <div class="account-row-platforms">${esc(platforms)}</div>
      </div>
      <div class="account-row-actions">
        <button class="row-action-btn edit-btn" data-id="${acc.id}" title="Edit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        ${state.accounts.length > 1 ? `
        <button class="row-action-btn delete-btn delete" data-id="${acc.id}" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>` : ''}
      </div>
    `;

    // Click row to switch (not on action buttons)
    row.addEventListener('click', (e) => {
      if (e.target.closest('.account-row-actions')) return;
      if (!acc.active) switchAccount(acc.id);
      else closeAccountDropdown();
    });

    list.appendChild(row);
  }

  // Wire action buttons
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAccountDropdown();
      openSettings(btn.dataset.id);
    });
  });
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteAccount(btn.dataset.id);
    });
  });
}

function updateStatusBadges() {
  const active = state.accounts.find(a => a.active);
  document.getElementById('badge-meta').classList.toggle('connected', active?.meta ?? false);
  document.getElementById('badge-google').classList.toggle('connected', active?.google ?? false);
}

async function switchAccount(id) {
  await fetch(`/api/accounts/${id}/activate`, { method: 'POST' });
  closeAccountDropdown();
  // Reset per-account AI state
  state.lastMetrics = null;
  state.lastAnalysis = '';
  await Promise.all([loadAccounts(), loadNiche()]);
  loadMetrics();
}

async function deleteAccount(id) {
  const acc = state.accounts.find(a => a.id === id);
  if (!confirm(`Delete "${acc?.name}"? This cannot be undone.`)) return;
  const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.ok) return showToast(data.error, 'error');
  await loadAccounts();
  if (id === state.activeAccountId) loadMetrics();
  showToast('Account deleted');
}

/* ------------------------------------------------------------------ */
/* Account dropdown toggle                                              */
/* ------------------------------------------------------------------ */
function toggleAccountDropdown() {
  const sw = document.getElementById('account-switcher');
  const dd = document.getElementById('account-dropdown');
  const isOpen = !dd.classList.contains('hidden');
  if (isOpen) closeAccountDropdown();
  else { dd.classList.remove('hidden'); sw.classList.add('open'); }
}

function closeAccountDropdown() {
  document.getElementById('account-dropdown').classList.add('hidden');
  document.getElementById('account-switcher').classList.remove('open');
}

/* ------------------------------------------------------------------ */
/* Metrics                                                              */
/* ------------------------------------------------------------------ */
async function loadMetrics() {
  if (state.loading) return;
  state.loading = true;
  document.getElementById('btn-refresh').classList.add('spinning');
  showSkeletons();

  try {
    const res = await fetch(`/api/metrics?platform=${state.platform}&dateRange=${state.dateRange}`);
    const json = await res.json();
    if (!json.ok) {
      showError(json.error);
    } else {
      state.lastMetrics = json.data;
      renderKpiBar(json.data);
      renderCards(json.data);
      renderAIPanel(); // enable Analyze button now that we have data
      if (json.warnings?.length) json.warnings.forEach(w => showToast(w, 'error'));
    }
  } catch (err) {
    showError('Failed to reach server: ' + err.message);
  } finally {
    state.loading = false;
    document.getElementById('btn-refresh').classList.remove('spinning');
    document.getElementById('last-updated').textContent =
      'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

/* ------------------------------------------------------------------ */
/* KPI bar                                                              */
/* ------------------------------------------------------------------ */
function renderKpiBar(data) {
  const { METRICS } = state.metaInfo;
  const bar = document.createElement('div');
  bar.className = 'kpi-bar';
  bar.id = 'kpi-container';

  for (const key of KPI_KEYS) {
    const m = METRICS[key];
    if (!m) continue;
    const value = data[key];
    const rating = getRating(m, value);
    const formatted = formatValue(m, value);
    const statusClass = rating ? `status-${rating}` : (key === 'spend' ? 'status-neutral' : '');

    const item = document.createElement('div');
    item.className = `kpi-item ${statusClass}`;
    item.innerHTML = `
      <div class="kpi-label">${esc(m.label)}</div>
      <div class="kpi-value${value == null ? ' na' : ''}">${esc(formatted)}</div>
      ${rating ? `<div class="kpi-badge ${rating}"><span class="kpi-dot"></span>${{ good: 'Good', ok: 'On track', poor: 'Needs attention' }[rating]}</div>` : ''}
    `;
    bar.appendChild(item);
  }

  document.getElementById('kpi-container').replaceWith(bar);
}

/* ------------------------------------------------------------------ */
/* Cards                                                                */
/* ------------------------------------------------------------------ */
function renderCards(data) {
  const { METRICS, METRIC_ORDER } = state.metaInfo;
  const grid = document.createElement('div');
  grid.className = 'metrics-grid';
  grid.id = 'cards-container';

  let delay = 0;
  for (const key of METRIC_ORDER) {
    const m = METRICS[key];
    if (!m) continue;
    const value = data[key];
    if (value === null && (key === 'reach' || key === 'frequency')) continue;

    const rating = getRating(m, value);
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.style.animationDelay = `${delay}ms`;
    delay += 25;
    card.innerHTML = `
      <div class="card-top">
        <div class="card-label">${esc(m.label)}</div>
        ${rating ? `<div class="card-badge ${rating}"><span class="card-badge-dot"></span>${{ good: 'Good', ok: 'OK', poor: 'Poor' }[rating]}</div>` : ''}
      </div>
      <div class="card-value${value == null ? ' na' : ''}">${esc(formatValue(m, value))}</div>
      <hr class="card-divider" />
      ${m.benchmark ? `<div class="card-benchmark">Avg: <b>${esc(m.benchmark)}</b></div>` : ''}
      <div class="card-context">${esc(m.context)}</div>
    `;
    grid.appendChild(card);
  }

  document.getElementById('cards-container').replaceWith(grid);
}

/* ------------------------------------------------------------------ */
/* Skeletons / error                                                    */
/* ------------------------------------------------------------------ */
function showSkeletons() {
  const kpi = document.createElement('div');
  kpi.className = 'skeleton-bar'; kpi.id = 'kpi-container';
  document.getElementById('kpi-container').replaceWith(kpi);

  const g = document.createElement('div');
  g.className = 'skeleton-grid'; g.id = 'cards-container';
  g.innerHTML = Array(8).fill('<div class="skeleton-card"></div>').join('');
  document.getElementById('cards-container').replaceWith(g);
}

function showError(message) {
  const nc = message?.includes('not configured');
  const empty = document.createElement('div');
  empty.className = 'empty-state'; empty.id = 'kpi-container';
  empty.innerHTML = `
    <div class="empty-icon">${nc ? '🔑' : '⚠️'}</div>
    <div class="empty-title">${nc ? 'Not configured' : 'Could not load data'}</div>
    <div class="empty-body">${esc(message)}</div>
    ${nc ? '<button class="btn-primary" onclick="openSettings(null)">Open Settings</button>' : ''}
  `;
  document.getElementById('kpi-container').replaceWith(empty);
  const g = document.createElement('div'); g.id = 'cards-container';
  document.getElementById('cards-container').replaceWith(g);
}

/* ------------------------------------------------------------------ */
/* Settings modal                                                       */
/* ------------------------------------------------------------------ */
async function openSettings(accountId) {
  // accountId = null → new account, string → edit existing
  state.editingAccountId = accountId;

  const isNew = accountId === null;
  document.getElementById('modal-title').textContent = isNew ? 'Add Account' : 'Edit Account';
  document.getElementById('btn-delete-account').classList.toggle('hidden', isNew || state.accounts.length <= 1);
  document.getElementById('btn-save-settings').textContent = isNew ? 'Create Account' : 'Save';

  if (isNew) {
    // Blank form
    document.getElementById('account-name-input').value = '';
    clearCredentialFields();
    document.getElementById('dot-meta').classList.remove('connected');
    document.getElementById('dot-google').classList.remove('connected');
  } else {
    // Fetch masked config for this account
    const res = await fetch(`/api/config`); // returns active account; for non-active we read from accounts list
    // To edit any account (not just active), we fetch accounts list and find it
    const accRes = await fetch('/api/accounts');
    const { accounts } = await accRes.json();
    const acc = accounts.find(a => a.id === accountId);

    // For credentials we need to call a per-account endpoint — fetch it by temporarily using the stored data
    // We'll use a dedicated endpoint
    const cfgRes = await fetch(`/api/accounts/${accountId}/config`);
    let cfg;
    if (cfgRes.ok) {
      cfg = await cfgRes.json();
    } else {
      // Fallback: just show blank credentials, user can re-enter
      cfg = { name: acc?.name ?? '', meta: {}, google: {} };
    }

    document.getElementById('account-name-input').value = cfg.name ?? '';
    document.getElementById('meta-app-id').value        = cfg.meta.app_id ?? '';
    document.getElementById('meta-app-secret').value    = cfg.meta.app_secret ?? '';
    document.getElementById('meta-access-token').value  = cfg.meta.access_token ?? '';
    document.getElementById('meta-account-id').value    = cfg.meta.ad_account_id ?? '';
    document.getElementById('google-dev-token').value   = cfg.google.developer_token ?? '';
    document.getElementById('google-client-id').value   = cfg.google.client_id ?? '';
    document.getElementById('google-client-secret').value = cfg.google.client_secret ?? '';
    document.getElementById('google-refresh-token').value = cfg.google.refresh_token ?? '';
    document.getElementById('google-customer-id').value   = cfg.google.customer_id ?? '';

    document.getElementById('dot-meta').classList.toggle('connected', acc?.meta ?? false);
    document.getElementById('dot-google').classList.toggle('connected', acc?.google ?? false);
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function clearCredentialFields() {
  ['meta-app-id','meta-app-secret','meta-access-token','meta-account-id',
   'google-dev-token','google-client-id','google-client-secret','google-refresh-token','google-customer-id']
    .forEach(id => { document.getElementById(id).value = ''; });
}

function closeSettings() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

async function saveSettings() {
  const body = {
    name:   document.getElementById('account-name-input').value.trim() || 'My Account',
    meta: {
      app_id:        document.getElementById('meta-app-id').value.trim(),
      app_secret:    document.getElementById('meta-app-secret').value.trim(),
      access_token:  document.getElementById('meta-access-token').value.trim(),
      ad_account_id: document.getElementById('meta-account-id').value.trim(),
    },
    google: {
      developer_token: document.getElementById('google-dev-token').value.trim(),
      client_id:       document.getElementById('google-client-id').value.trim(),
      client_secret:   document.getElementById('google-client-secret').value.trim(),
      refresh_token:   document.getElementById('google-refresh-token').value.trim(),
      customer_id:     document.getElementById('google-customer-id').value.trim(),
    },
  };

  const isNew = state.editingAccountId === null;
  const url    = isNew ? '/api/accounts' : `/api/accounts/${state.editingAccountId}`;
  const method = isNew ? 'POST' : 'PUT';

  const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();

  if (!data.ok && res.status !== 200 && res.status !== 201) {
    showToast('Failed to save.', 'error'); return;
  }

  closeSettings();
  showToast(isNew ? 'Account created!' : 'Saved!', 'success');

  // If new account, activate it
  if (isNew && data.id) {
    await fetch(`/api/accounts/${data.id}/activate`, { method: 'POST' });
  }

  await loadAccounts();
  loadMetrics();
}

/* ------------------------------------------------------------------ */
/* AI Insights                                                          */
/* ------------------------------------------------------------------ */
async function loadNiche() {
  const res = await fetch('/api/niche');
  const data = await res.json();
  state.niche     = data.niche;
  state.objective = data.objective;
  state.aov       = data.aov;
  renderAIPanel();
}

function renderAIPanel() {
  const panel   = document.getElementById('ai-panel');
  const actions = document.getElementById('ai-panel-actions');
  const body    = document.getElementById('ai-panel-body');
  if (!panel || !actions || !body) return;

  // Keep panel visible once we've interacted with it
  if (!state.aiPanelOpen) return;

  if (state.analyzing) return; // don't interrupt ongoing stream

  panel.classList.remove('hidden');

  if (!state.niche) {
    actions.innerHTML = `<button class="btn-ai-configure" id="btn-configure-niche">Set up niche</button>`;
    body.innerHTML = `
      <div class="ai-teaser">
        <div class="ai-teaser-icon">✨</div>
        <div class="ai-teaser-text">
          <strong>Get AI-powered insights for your niche</strong>
          <p>Tell us about your business so AI can explain whether your metrics are good for your industry, highlight what to improve, and suggest campaigns tailored to your niche.</p>
        </div>
      </div>`;
    document.getElementById('btn-configure-niche')?.addEventListener('click', openNicheModal);
    return;
  }

  // Niche is set — render header actions
  const canAnalyze = !!state.lastMetrics;
  actions.innerHTML = `
    <div class="ai-niche-tag">${esc(state.niche)} · ${esc(state.objective || 'Conversions')}</div>
    <button class="btn-ai-edit" id="btn-edit-niche">Edit</button>
    <button class="btn-analyze" id="btn-analyze-now" ${canAnalyze ? '' : 'disabled'}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      Analyze
    </button>`;

  document.getElementById('btn-edit-niche')?.addEventListener('click', openNicheModal);
  document.getElementById('btn-analyze-now')?.addEventListener('click', analyzeWithAI);

  // Only update body if no existing analysis is displayed
  if (!state.lastAnalysis && !body.querySelector('.ai-result, .ai-stream-area')) {
    body.innerHTML = canAnalyze
      ? `<div class="ai-ready-prompt">Click <strong>Analyze</strong> to get personalized insights for your ${esc(state.niche)} business.</div>`
      : `<div class="ai-ready-prompt">Load metrics first, then click <strong>Analyze</strong> to get niche-specific insights.</div>`;
  }
}

function openNicheModal() {
  document.getElementById('niche-input').value     = state.niche     ?? '';
  document.getElementById('objective-input').value = state.objective ?? 'Sales & Conversions';
  document.getElementById('aov-input').value       = state.aov       ?? '';
  document.getElementById('niche-modal-overlay').classList.remove('hidden');
}

function closeNicheModal() {
  document.getElementById('niche-modal-overlay').classList.add('hidden');
}

async function saveNiche() {
  const niche     = document.getElementById('niche-input').value.trim();
  const objective = document.getElementById('objective-input').value;
  const aovRaw    = document.getElementById('aov-input').value;
  const aov       = aovRaw ? parseFloat(aovRaw) : null;

  if (!niche) {
    document.getElementById('niche-input').focus();
    showToast('Please enter your niche.', 'error');
    return;
  }

  await fetch('/api/niche', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ niche, objective, aov }),
  });

  state.niche     = niche;
  state.objective = objective;
  state.aov       = aov;
  // Reset prior analysis when niche changes
  state.lastAnalysis = '';
  document.getElementById('ai-panel-body').innerHTML = '';

  closeNicheModal();
  renderAIPanel();

  // Auto-analyze if metrics are already loaded
  if (state.lastMetrics) analyzeWithAI();
}

async function analyzeWithAI() {
  if (!state.lastMetrics || state.analyzing) return;

  state.analyzing    = true;
  state.lastAnalysis = '';

  const body    = document.getElementById('ai-panel-body');
  const actions = document.getElementById('ai-panel-actions');

  // Analyzing state in header
  actions.innerHTML = `
    <div class="ai-niche-tag">${esc(state.niche)} · ${esc(state.objective || 'Conversions')}</div>
    <button class="btn-analyze analyzing" disabled>
      <svg class="spin-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      Analyzing…
    </button>`;

  body.innerHTML = `<div class="ai-stream-area" id="ai-stream-area"><div class="ai-stream-text"><span class="ai-cursor"></span></div></div>`;
  const streamArea = document.getElementById('ai-stream-area');

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metrics:   state.lastMetrics,
        platform:  state.platform,
        dateRange: state.dateRange,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || 'Analysis failed');
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') break;
        try {
          const { text, error } = JSON.parse(payload);
          if (error) throw new Error(error);
          if (text) {
            state.lastAnalysis += text;
            streamArea.innerHTML = `<div class="ai-stream-text">${esc(state.lastAnalysis)}<span class="ai-cursor"></span></div>`;
            streamArea.scrollTop = streamArea.scrollHeight;
          }
        } catch (e) { /* partial JSON line — skip */ }
      }
    }

    // Render final markdown
    if (window.marked && state.lastAnalysis) {
      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      body.innerHTML = `
        <div class="ai-result">${window.marked.parse(state.lastAnalysis)}</div>
        <div class="ai-result-footer">
          <button class="btn-reanalyze" id="btn-reanalyze">Re-analyze</button>
          <span class="ai-result-ts">Generated at ${ts}</span>
        </div>`;
      document.getElementById('btn-reanalyze')?.addEventListener('click', () => {
        state.lastAnalysis = '';
        analyzeWithAI();
      });
    }
  } catch (err) {
    body.innerHTML = `<div class="ai-error">Analysis failed: ${esc(err.message)}</div>`;
    state.lastAnalysis = '';
  } finally {
    state.analyzing = false;
    // Restore header actions
    const canAnalyze = !!state.lastMetrics;
    actions.innerHTML = `
      <div class="ai-niche-tag">${esc(state.niche)} · ${esc(state.objective || 'Conversions')}</div>
      <button class="btn-ai-edit" id="btn-edit-niche">Edit</button>
      <button class="btn-analyze" id="btn-analyze-now" ${canAnalyze ? '' : 'disabled'}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        Analyze
      </button>`;
    document.getElementById('btn-edit-niche')?.addEventListener('click', openNicheModal);
    document.getElementById('btn-analyze-now')?.addEventListener('click', analyzeWithAI);
  }
}

/* ------------------------------------------------------------------ */
/* Event listeners                                                      */
/* ------------------------------------------------------------------ */
function setupEventListeners() {
  document.getElementById('btn-refresh').addEventListener('click', loadMetrics);
  document.getElementById('btn-ai').addEventListener('click', () => {
    state.aiPanelOpen = true;
    renderAIPanel();
    document.getElementById('ai-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('btn-ai').classList.add('active');
  });
  document.getElementById('btn-settings').addEventListener('click', () => openSettings(state.activeAccountId));
  document.getElementById('account-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleAccountDropdown(); });
  document.getElementById('add-account-btn').addEventListener('click', () => { closeAccountDropdown(); openSettings(null); });
  document.getElementById('modal-close').addEventListener('click', closeSettings);
  document.getElementById('btn-cancel-settings').addEventListener('click', closeSettings);
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('btn-delete-account').addEventListener('click', () => {
    closeSettings();
    deleteAccount(state.editingAccountId);
  });

  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeSettings();
  });
  document.getElementById('niche-modal-close').addEventListener('click', closeNicheModal);
  document.getElementById('btn-cancel-niche').addEventListener('click', closeNicheModal);
  document.getElementById('btn-save-niche').addEventListener('click', saveNiche);
  document.getElementById('niche-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('niche-modal-overlay')) closeNicheModal();
  });
  document.getElementById('niche-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveNiche();
  });
  document.addEventListener('click', (e) => {
    if (!document.getElementById('account-switcher').contains(e.target)) closeAccountDropdown();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSettings(); closeAccountDropdown(); closeNicheModal(); }
  });

  document.getElementById('platform-tabs').querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('platform-tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      state.platform = btn.dataset.platform;
      loadMetrics();
    });
  });

  document.getElementById('date-tabs').querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('date-tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      state.dateRange = btn.dataset.range;
      loadMetrics();
    });
  });
}

/* ------------------------------------------------------------------ */
/* Utilities                                                            */
/* ------------------------------------------------------------------ */
function getRating(m, value) {
  if (!m.hasRating || value == null) return null;
  const { green, yellow } = m.thresholds;
  if (!m.inverted) {
    if (value >= green) return 'good';
    if (value >= yellow) return 'ok';
    return 'poor';
  } else {
    if (value <= green) return 'good';
    if (value <= yellow) return 'ok';
    return 'poor';
  }
}

function formatValue(m, value) {
  if (value == null) return 'N/A';
  const fmt = m.format;
  if (fmt === 'currency')   return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (fmt === 'percent')    return value.toFixed(2) + '%';
  if (fmt === 'multiplier') return value.toFixed(2) + 'x';
  if (value >= 1_000_000)   return (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1_000)       return (value / 1_000).toFixed(1) + 'K';
  return Math.round(value).toLocaleString('en-US');
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

init();
