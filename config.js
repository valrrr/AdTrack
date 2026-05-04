const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

const CONFIG_DIR  = process.env.VERCEL ? '/tmp/.ad-tracker' : path.join(os.homedir(), '.ad-tracker');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const KV_KEY      = 'ad-tracker:config';

const emptyMeta      = () => ({ app_id: '', app_secret: '', access_token: '', ad_account_id: '' });
const emptyGoogle    = () => ({ developer_token: '', client_id: '', client_secret: '', refresh_token: '', customer_id: '' });
const emptyTiktok    = () => ({ access_token: '', advertiser_id: '' });
const emptyPinterest = () => ({ access_token: '', ad_account_id: '' });

function defaultConfig() {
  const id = `account_${Date.now()}`;
  return {
    activeAccount: id,
    accounts: {
      [id]: { name: 'My Account', meta: emptyMeta(), google: emptyGoogle(), tiktok: emptyTiktok(), pinterest: emptyPinterest() },
    },
  };
}

let _kv;
function getKV() {
  if (_kv !== undefined) return _kv;
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL   || process.env.STORAGE_UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.STORAGE_UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { _kv = null; return null; }
  try { const { Redis } = require('@upstash/redis'); _kv = new Redis({ url, token }); return _kv; }
  catch { _kv = null; return null; }
}

function migrate(raw) {
  // Remove session secret if previously stored here
  delete raw.sessionSecret;

  // Migrate old single-account format
  if (!raw.accounts) {
    const id = `account_${Date.now()}`;
    raw = {
      activeAccount: id,
      accounts: {
        [id]: { name: 'My Account', meta: raw.meta ?? emptyMeta(), google: raw.google ?? emptyGoogle(), tiktok: emptyTiktok(), pinterest: emptyPinterest() },
      },
    };
    return { cfg: raw, dirty: true };
  }

  // Add tiktok/pinterest to existing accounts if missing
  let dirty = false;
  for (const acc of Object.values(raw.accounts)) {
    if (!acc.tiktok)    { acc.tiktok    = emptyTiktok();    dirty = true; }
    if (!acc.pinterest) { acc.pinterest = emptyPinterest(); dirty = true; }
  }
  return { cfg: raw, dirty };
}

async function loadConfig() {
  const kv = getKV();

  if (kv) {
    try {
      const stored = await kv.get(KV_KEY);
      if (stored) {
        const { cfg, dirty } = migrate(stored);
        if (dirty) await kv.set(KV_KEY, cfg);
        return cfg;
      }
    } catch (e) {
      console.error('[config] Redis load error:', e.message);
    }
  }

  // File fallback (local dev or if Redis unavailable)
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) {
    const cfg = defaultConfig();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    if (kv) try { await kv.set(KV_KEY, cfg); } catch {}
    return cfg;
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const { cfg, dirty } = migrate(raw);
  if (dirty) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    if (kv) try { await kv.set(KV_KEY, cfg); } catch {}
  }
  return cfg;
}

async function saveConfig(config) {
  const kv = getKV();
  if (kv) {
    try { await kv.set(KV_KEY, config); return; }
    catch (e) { console.error('[config] Redis save error:', e.message); }
  }
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getActiveAccount(config) {
  return config.accounts[config.activeAccount] ?? Object.values(config.accounts)[0];
}

function isMetaConfigured(account) {
  const m = account?.meta ?? {};
  return !!(m.app_id && m.access_token && m.ad_account_id);
}

function isGoogleConfigured(account) {
  const g = account?.google ?? {};
  return !!(g.developer_token && g.client_id && g.refresh_token && g.customer_id);
}

function isTiktokConfigured(account) {
  const t = account?.tiktok ?? {};
  return !!(t.access_token && t.advertiser_id);
}

function isPinterestConfigured(account) {
  const p = account?.pinterest ?? {};
  return !!(p.access_token && p.ad_account_id);
}

let _devSecret;
function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.VERCEL) throw new Error('SESSION_SECRET environment variable must be set');
  if (!_devSecret) _devSecret = crypto.randomBytes(32).toString('hex');
  return _devSecret;
}

module.exports = {
  loadConfig, saveConfig, getActiveAccount,
  isMetaConfigured, isGoogleConfigured, isTiktokConfigured, isPinterestConfigured,
  emptyMeta, emptyGoogle, emptyTiktok, emptyPinterest, getSessionSecret,
};
