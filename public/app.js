/* ------------------------------------------------------------------ */
/* KPI bar metrics — the hero summary strip                             */
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
  configStatus: { meta: false, google: false },
};

/* ------------------------------------------------------------------ */
/* Init                                                                 */
/* ------------------------------------------------------------------ */
async function init() {
  await Promise.all([loadMetaInfo(), loadConfigStatus()]);
  setupEventListeners();
  loadMetrics();
}

async function loadMetaInfo() {
  const res = await fetch('/api/meta-info');
  state.metaInfo = await res.json();
}

async function loadConfigStatus() {
  const res = await fetch('/api/config/status');
  state.configStatus = await res.json();
  updateStatusBadges();
}

function updateStatusBadges() {
  document.getElementById('badge-meta').classList.toggle('connected', state.configStatus.meta);
  document.getElementById('badge-google').classList.toggle('connected', state.configStatus.google);
}

/* ------------------------------------------------------------------ */
/* Load metrics                                                         */
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
      renderKpiBar(json.data);
      renderCards(json.data);
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
/* KPI bar rendering                                                    */
/* ------------------------------------------------------------------ */
function renderKpiBar(data) {
  const { METRICS } = state.metaInfo;
  const container = document.getElementById('kpi-container');

  const bar = document.createElement('div');
  bar.className = 'kpi-bar';

  for (const key of KPI_KEYS) {
    const m = METRICS[key];
    if (!m) continue;
    const value = data[key];
    const rating = getRating(m, value);
    const formatted = formatValue(m, value);
    const isNA = value == null;

    const statusClass = rating ? `status-${rating}` : (key === 'spend' ? 'status-neutral' : '');

    const item = document.createElement('div');
    item.className = `kpi-item ${statusClass}`;

    item.innerHTML = `
      <div class="kpi-label">${esc(m.label)}</div>
      <div class="kpi-value${isNA ? ' na' : ''}">${esc(formatted)}</div>
      ${rating ? `
        <div class="kpi-badge ${rating}">
          <span class="kpi-dot"></span>
          ${{ good: 'Good', ok: 'On track', poor: 'Needs attention' }[rating]}
        </div>` : ''}
    `;

    bar.appendChild(item);
  }

  container.replaceWith(bar);
  bar.id = 'kpi-container';
}

/* ------------------------------------------------------------------ */
/* Cards rendering                                                      */
/* ------------------------------------------------------------------ */
function renderCards(data) {
  const { METRICS, METRIC_ORDER } = state.metaInfo;
  const container = document.getElementById('cards-container');
  const grid = document.createElement('div');
  grid.className = 'metrics-grid';

  let delay = 0;
  for (const key of METRIC_ORDER) {
    const m = METRICS[key];
    if (!m) continue;
    const value = data[key];
    if (value === null && (key === 'reach' || key === 'frequency')) continue;

    const rating = getRating(m, value);
    const formatted = formatValue(m, value);
    const isNA = value == null;

    const card = document.createElement('div');
    card.className = 'metric-card';
    card.style.animationDelay = `${delay}ms`;
    delay += 25;

    card.innerHTML = `
      <div class="card-top">
        <div class="card-label">${esc(m.label)}</div>
        ${rating ? `
          <div class="card-badge ${rating}">
            <span class="card-badge-dot"></span>
            ${{ good: 'Good', ok: 'OK', poor: 'Poor' }[rating]}
          </div>` : ''}
      </div>
      <div class="card-value${isNA ? ' na' : ''}">${esc(formatted)}</div>
      <hr class="card-divider" />
      ${m.benchmark ? `<div class="card-benchmark">Avg: <b>${esc(m.benchmark)}</b></div>` : ''}
      <div class="card-context">${esc(m.context)}</div>
    `;

    grid.appendChild(card);
  }

  container.replaceWith(grid);
  grid.id = 'cards-container';
}

/* ------------------------------------------------------------------ */
/* Error / empty state                                                  */
/* ------------------------------------------------------------------ */
function showSkeletons() {
  // KPI bar skeleton
  const kpiEl = document.getElementById('kpi-container');
  const skeletonBar = document.createElement('div');
  skeletonBar.className = 'skeleton-bar';
  skeletonBar.id = 'kpi-container';
  kpiEl.replaceWith(skeletonBar);

  // Cards skeleton
  const cardsEl = document.getElementById('cards-container');
  const skeletonGrid = document.createElement('div');
  skeletonGrid.className = 'skeleton-grid';
  skeletonGrid.id = 'cards-container';
  skeletonGrid.innerHTML = Array(8).fill('<div class="skeleton-card"></div>').join('');
  cardsEl.replaceWith(skeletonGrid);
}

function showError(message) {
  const notConfigured = message?.includes('not configured');

  // Replace KPI bar with empty block
  const kpiEl = document.getElementById('kpi-container');
  const emptyBar = document.createElement('div');
  emptyBar.className = 'empty-state';
  emptyBar.id = 'kpi-container';
  emptyBar.innerHTML = `
    <div class="empty-icon">${notConfigured ? '🔑' : '⚠️'}</div>
    <div class="empty-title">${notConfigured ? 'Not configured' : 'Could not load data'}</div>
    <div class="empty-body">${esc(message)}</div>
    ${notConfigured ? '<button class="btn-primary" onclick="openSettings()">Open Settings</button>' : ''}
  `;
  kpiEl.replaceWith(emptyBar);

  // Clear cards
  const cardsEl = document.getElementById('cards-container');
  const emptyCards = document.createElement('div');
  emptyCards.id = 'cards-container';
  cardsEl.replaceWith(emptyCards);
}

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */
function openSettings() {
  loadSettingsForm();
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeSettings() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

async function loadSettingsForm() {
  const res = await fetch('/api/config');
  const config = await res.json();

  document.getElementById('meta-app-id').value       = config.meta.app_id ?? '';
  document.getElementById('meta-app-secret').value   = config.meta.app_secret ?? '';
  document.getElementById('meta-access-token').value = config.meta.access_token ?? '';
  document.getElementById('meta-account-id').value   = config.meta.ad_account_id ?? '';
  document.getElementById('google-dev-token').value  = config.google.developer_token ?? '';
  document.getElementById('google-client-id').value  = config.google.client_id ?? '';
  document.getElementById('google-client-secret').value = config.google.client_secret ?? '';
  document.getElementById('google-refresh-token').value = config.google.refresh_token ?? '';
  document.getElementById('google-customer-id').value   = config.google.customer_id ?? '';

  document.getElementById('dot-meta').classList.toggle('connected', state.configStatus.meta);
  document.getElementById('dot-google').classList.toggle('connected', state.configStatus.google);
}

async function saveSettings() {
  const config = {
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

  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (res.ok) {
    closeSettings();
    showToast('Credentials saved!', 'success');
    await loadConfigStatus();
    loadMetrics();
  } else {
    showToast('Failed to save.', 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Event listeners                                                      */
/* ------------------------------------------------------------------ */
function setupEventListeners() {
  document.getElementById('btn-refresh').addEventListener('click', loadMetrics);
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('modal-close').addEventListener('click', closeSettings);
  document.getElementById('btn-cancel-settings').addEventListener('click', closeSettings);
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeSettings();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSettings(); });

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
