const express = require('express');
const path = require('path');
const { loadConfig, saveConfig, isMetaConfigured, isGoogleConfigured } = require('./config');
const { combineMetrics, METRICS, METRIC_ORDER, getRating, formatValue } = require('./benchmarks');
const MetaProvider = require('./providers/meta');
const GoogleProvider = require('./providers/google');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Config endpoints ---

app.get('/api/config/status', (req, res) => {
  const config = loadConfig();
  res.json({
    meta: isMetaConfigured(config),
    google: isGoogleConfigured(config),
  });
});

app.get('/api/config', (req, res) => {
  const config = loadConfig();
  // Mask secrets in response
  const safe = {
    meta: { ...config.meta, app_secret: config.meta.app_secret ? '••••••••' : '' },
    google: {
      ...config.google,
      client_secret: config.google.client_secret ? '••••••••' : '',
      refresh_token: config.google.refresh_token ? '••••••••' : '',
    },
  };
  res.json(safe);
});

app.post('/api/config', (req, res) => {
  const incoming = req.body;
  const existing = loadConfig();

  // If a masked value comes back, keep the original
  const merged = {
    meta: {
      app_id: incoming.meta.app_id ?? existing.meta.app_id,
      app_secret: incoming.meta.app_secret === '••••••••' ? existing.meta.app_secret : incoming.meta.app_secret,
      access_token: incoming.meta.access_token ?? existing.meta.access_token,
      ad_account_id: incoming.meta.ad_account_id ?? existing.meta.ad_account_id,
    },
    google: {
      developer_token: incoming.google.developer_token ?? existing.google.developer_token,
      client_id: incoming.google.client_id ?? existing.google.client_id,
      client_secret: incoming.google.client_secret === '••••••••' ? existing.google.client_secret : incoming.google.client_secret,
      refresh_token: incoming.google.refresh_token === '••••••••' ? existing.google.refresh_token : incoming.google.refresh_token,
      customer_id: incoming.google.customer_id ?? existing.google.customer_id,
    },
  };

  saveConfig(merged);
  res.json({ ok: true });
});

// --- Metrics endpoint ---

app.get('/api/metrics', async (req, res) => {
  const { platform = 'meta', dateRange = 'last_7d' } = req.query;
  const config = loadConfig();

  try {
    let data = null;

    if (platform === 'meta') {
      if (!isMetaConfigured(config)) return res.json({ ok: false, error: 'Meta not configured' });
      data = await new MetaProvider(config).getInsights(dateRange);

    } else if (platform === 'google') {
      if (!isGoogleConfigured(config)) return res.json({ ok: false, error: 'Google not configured' });
      data = await new GoogleProvider(config).getInsights(dateRange);

    } else if (platform === 'combined') {
      const [metaResult, googleResult] = await Promise.allSettled([
        isMetaConfigured(config) ? new MetaProvider(config).getInsights(dateRange) : Promise.resolve(null),
        isGoogleConfigured(config) ? new GoogleProvider(config).getInsights(dateRange) : Promise.resolve(null),
      ]);
      const metaData = metaResult.status === 'fulfilled' ? metaResult.value : null;
      const googleData = googleResult.status === 'fulfilled' ? googleResult.value : null;
      data = combineMetrics(metaData, googleData);

      const errors = [];
      if (metaResult.status === 'rejected') errors.push('Meta: ' + metaResult.reason?.message);
      if (googleResult.status === 'rejected') errors.push('Google: ' + googleResult.reason?.message);
      if (!data) return res.json({ ok: false, error: errors.join(' | ') || 'No platforms configured' });
      return res.json({ ok: true, data, warnings: errors.length ? errors : undefined });
    }

    res.json({ ok: true, data });
  } catch (err) {
    console.error(`[${platform}] API error:`, err.message);
    res.json({ ok: false, error: err.response?.data?.error?.message ?? err.message });
  }
});

// --- Setup guide ---
app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'setup.html'));
});

// --- Metadata for the frontend ---

app.get('/api/meta-info', (req, res) => {
  res.json({ METRICS, METRIC_ORDER });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Ad Tracker running at http://localhost:${PORT}`);
});
