const express = require('express');
const path = require('path');
const {
  loadConfig, saveConfig, getActiveAccount,
  isMetaConfigured, isGoogleConfigured,
  emptyMeta, emptyGoogle,
} = require('./config');
const { combineMetrics, METRICS, METRIC_ORDER, getRating, formatValue } = require('./benchmarks');
const MetaProvider = require('./providers/meta');
const GoogleProvider = require('./providers/google');
const { analyzeMetrics } = require('./ai');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------------------
// Accounts
// -------------------------------------------------------------------------

app.get('/api/accounts', (req, res) => {
  const config = loadConfig();
  const accounts = Object.entries(config.accounts).map(([id, acc]) => ({
    id,
    name: acc.name,
    active: id === config.activeAccount,
    meta: isMetaConfigured(acc),
    google: isGoogleConfigured(acc),
  }));
  res.json({ accounts, activeId: config.activeAccount });
});

app.post('/api/accounts', (req, res) => {
  const config = loadConfig();
  const id = `account_${Date.now()}`;
  config.accounts[id] = {
    name: (req.body.name || 'New Account').trim(),
    meta: req.body.meta ?? emptyMeta(),
    google: req.body.google ?? emptyGoogle(),
  };
  saveConfig(config);
  res.json({ ok: true, id });
});

app.put('/api/accounts/:id', (req, res) => {
  const config = loadConfig();
  const acc = config.accounts[req.params.id];
  if (!acc) return res.status(404).json({ ok: false, error: 'Account not found' });

  const incoming = req.body;
  const mask = (inVal, existingVal) => (inVal === '••••••••' ? existingVal : inVal);

  config.accounts[req.params.id] = {
    name: (incoming.name || acc.name).trim(),
    meta: {
      app_id:        incoming.meta.app_id        ?? acc.meta.app_id,
      app_secret:    mask(incoming.meta.app_secret,    acc.meta.app_secret),
      access_token:  mask(incoming.meta.access_token,  acc.meta.access_token),
      ad_account_id: incoming.meta.ad_account_id ?? acc.meta.ad_account_id,
    },
    google: {
      developer_token: incoming.google.developer_token ?? acc.google.developer_token,
      client_id:       incoming.google.client_id       ?? acc.google.client_id,
      client_secret:   mask(incoming.google.client_secret,  acc.google.client_secret),
      refresh_token:   mask(incoming.google.refresh_token,  acc.google.refresh_token),
      customer_id:     incoming.google.customer_id     ?? acc.google.customer_id,
    },
  };

  saveConfig(config);
  res.json({ ok: true });
});

app.delete('/api/accounts/:id', (req, res) => {
  const config = loadConfig();
  if (Object.keys(config.accounts).length <= 1)
    return res.status(400).json({ ok: false, error: 'Cannot delete the last account' });
  delete config.accounts[req.params.id];
  if (config.activeAccount === req.params.id)
    config.activeAccount = Object.keys(config.accounts)[0];
  saveConfig(config);
  res.json({ ok: true });
});

app.post('/api/accounts/:id/activate', (req, res) => {
  const config = loadConfig();
  if (!config.accounts[req.params.id])
    return res.status(404).json({ ok: false, error: 'Account not found' });
  config.activeAccount = req.params.id;
  saveConfig(config);
  res.json({ ok: true });
});

// Per-account masked config (for editing any account, not just active)
app.get('/api/accounts/:id/config', (req, res) => {
  const config = loadConfig();
  const acc = config.accounts[req.params.id];
  if (!acc) return res.status(404).json({ ok: false, error: 'Account not found' });
  res.json({
    id: req.params.id,
    name: acc.name,
    meta: {
      ...acc.meta,
      app_secret:   acc.meta?.app_secret   ? '••••••••' : '',
      access_token: acc.meta?.access_token ? '••••••••' : '',
    },
    google: {
      ...acc.google,
      client_secret: acc.google?.client_secret ? '••••••••' : '',
      refresh_token: acc.google?.refresh_token  ? '••••••••' : '',
    },
  });
});

// -------------------------------------------------------------------------
// Active account config (for settings form)
// -------------------------------------------------------------------------

app.get('/api/config', (req, res) => {
  const config = loadConfig();
  const id = config.activeAccount;
  const acc = config.accounts[id] ?? {};
  res.json({
    id,
    name: acc.name ?? '',
    meta: {
      ...acc.meta,
      app_secret:   acc.meta?.app_secret   ? '••••••••' : '',
      access_token: acc.meta?.access_token ? '••••••••' : '',
    },
    google: {
      ...acc.google,
      client_secret: acc.google?.client_secret ? '••••••••' : '',
      refresh_token: acc.google?.refresh_token  ? '••••••••' : '',
    },
  });
});

// -------------------------------------------------------------------------
// Config status for active account
// -------------------------------------------------------------------------

app.get('/api/config/status', (req, res) => {
  const config = loadConfig();
  const acc = getActiveAccount(config);
  res.json({ meta: isMetaConfigured(acc), google: isGoogleConfigured(acc) });
});

// -------------------------------------------------------------------------
// Metrics
// -------------------------------------------------------------------------

app.get('/api/metrics', async (req, res) => {
  const { platform = 'meta', dateRange = 'last_7d' } = req.query;
  const config = loadConfig();
  const acc = getActiveAccount(config);

  // Wrap account in shape providers expect
  const providerConfig = { meta: acc.meta, google: acc.google };

  try {
    let data = null;

    if (platform === 'meta') {
      if (!isMetaConfigured(acc)) return res.json({ ok: false, error: 'Meta not configured for this account' });
      data = await new MetaProvider(providerConfig).getInsights(dateRange);

    } else if (platform === 'google') {
      if (!isGoogleConfigured(acc)) return res.json({ ok: false, error: 'Google not configured for this account' });
      data = await new GoogleProvider(providerConfig).getInsights(dateRange);

    } else if (platform === 'combined') {
      const [mr, gr] = await Promise.allSettled([
        isMetaConfigured(acc)   ? new MetaProvider(providerConfig).getInsights(dateRange)   : Promise.resolve(null),
        isGoogleConfigured(acc) ? new GoogleProvider(providerConfig).getInsights(dateRange) : Promise.resolve(null),
      ]);
      const metaData   = mr.status === 'fulfilled' ? mr.value : null;
      const googleData = gr.status === 'fulfilled' ? gr.value : null;
      data = combineMetrics(metaData, googleData);
      const warnings = [
        mr.status === 'rejected' ? 'Meta: ' + mr.reason?.message : null,
        gr.status === 'rejected' ? 'Google: ' + gr.reason?.message : null,
      ].filter(Boolean);
      if (!data) return res.json({ ok: false, error: warnings.join(' | ') || 'No platforms configured' });
      return res.json({ ok: true, data, warnings: warnings.length ? warnings : undefined });
    }

    res.json({ ok: true, data });
  } catch (err) {
    console.error(`[${platform}] error:`, err.message);
    res.json({ ok: false, error: err.response?.data?.error?.message ?? err.message });
  }
});

// -------------------------------------------------------------------------
// Misc
// -------------------------------------------------------------------------

app.get('/api/meta-info', (req, res) => res.json({ METRICS, METRIC_ORDER }));

// -------------------------------------------------------------------------
// Niche / AI
// -------------------------------------------------------------------------

app.get('/api/niche', (req, res) => {
  const config = loadConfig();
  const id = config.activeAccount;
  const acc = config.accounts[id] ?? {};
  res.json({ niche: acc.niche ?? null, objective: acc.objective ?? null, aov: acc.aov ?? null });
});

app.post('/api/niche', (req, res) => {
  const config = loadConfig();
  const id = config.activeAccount;
  const acc = config.accounts[id];
  if (!acc) return res.status(404).json({ ok: false, error: 'Account not found' });
  if (req.body.niche     !== undefined) acc.niche     = req.body.niche;
  if (req.body.objective !== undefined) acc.objective = req.body.objective;
  if (req.body.aov       !== undefined) acc.aov       = req.body.aov;
  saveConfig(config);
  res.json({ ok: true });
});

app.post('/api/analyze', async (req, res) => {
  const config = loadConfig();
  const acc = getActiveAccount(config);

  if (!acc.niche) return res.status(400).json({ ok: false, error: 'Niche not configured' });

  const { metrics, platform, dateRange } = req.body;
  if (!metrics) return res.status(400).json({ ok: false, error: 'No metrics provided' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const chunk of analyzeMetrics({
      metrics,
      niche:     acc.niche,
      objective: acc.objective ?? 'Sales & Conversions',
      aov:       acc.aov ?? null,
      platform:  platform ?? 'meta',
      dateRange: dateRange ?? 'last_7d',
    })) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
  } catch (err) {
    console.error('[analyze] error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

app.get('/setup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'setup.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ad Tracker running at http://localhost:${PORT}`));
