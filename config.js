const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.ad-tracker');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  meta: { app_id: '', app_secret: '', access_token: '', ad_account_id: '' },
  google: { developer_token: '', client_id: '', client_secret: '', refresh_token: '', customer_id: '' },
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return structuredClone(DEFAULT_CONFIG);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function isMetaConfigured(config) {
  const m = config?.meta ?? {};
  return !!(m.app_id && m.access_token && m.ad_account_id);
}

function isGoogleConfigured(config) {
  const g = config?.google ?? {};
  return !!(g.developer_token && g.client_id && g.refresh_token && g.customer_id);
}

module.exports = { loadConfig, saveConfig, isMetaConfigured, isGoogleConfigured };
