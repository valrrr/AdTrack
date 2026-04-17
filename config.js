const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

const CONFIG_DIR = process.env.VERCEL
  ? '/tmp/.ad-tracker'
  : path.join(os.homedir(), '.ad-tracker');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const emptyMeta = () => ({ app_id: '', app_secret: '', access_token: '', ad_account_id: '' });
const emptyGoogle = () => ({ developer_token: '', client_id: '', client_secret: '', refresh_token: '', customer_id: '' });

function defaultConfig() {
  const id = `account_${Date.now()}`;
  return {
    activeAccount: id,
    accounts: {
      [id]: { name: 'My Account', meta: emptyMeta(), google: emptyGoogle() },
    },
  };
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) {
    const cfg = defaultConfig();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    return cfg;
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

  // Migrate old single-account format
  if (!raw.accounts) {
    const id = `account_${Date.now()}`;
    const migrated = {
      activeAccount: id,
      accounts: {
        [id]: {
          name: 'My Account',
          meta: raw.meta ?? emptyMeta(),
          google: raw.google ?? emptyGoogle(),
        },
      },
    };
    saveConfig(migrated);
    return migrated;
  }

  return raw;
}

function saveConfig(config) {
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

function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const config = loadConfig();
  if (!config.sessionSecret) {
    config.sessionSecret = crypto.randomBytes(32).toString('hex');
    saveConfig(config);
  }
  return config.sessionSecret;
}

module.exports = {
  loadConfig, saveConfig, getActiveAccount,
  isMetaConfigured, isGoogleConfigured,
  emptyMeta, emptyGoogle, getSessionSecret,
};
