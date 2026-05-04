const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');
const dns  = require('dns').promises;

const USERS_FILE = path.join(
  process.env.VERCEL ? '/tmp/.ad-tracker' : path.join(os.homedir(), '.ad-tracker'),
  'users.json'
);

const KV_KEY = 'adtracker:users';

function getKV() {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  try {
    const { Redis } = require('@upstash/redis');
    return new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } catch { return null; }
}

async function loadUsers() {
  // 1. Upstash Redis — persistent, multi-user
  const kv = getKV();
  if (kv) {
    try { return (await kv.get(KV_KEY)) || {}; } catch { return {}; }
  }
  // 2. Env-var fallback — single admin user (backward compat)
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD_HASH) {
    const email = process.env.ADMIN_EMAIL.toLowerCase().trim();
    return {
      [email]: {
        id: 'admin',
        name: process.env.ADMIN_NAME || 'Admin',
        email,
        passwordHash: process.env.ADMIN_PASSWORD_HASH,
      }
    };
  }
  // 3. Local file — dev
  try {
    if (!fs.existsSync(USERS_FILE)) return {};
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch { return {}; }
}

async function saveUsers(users) {
  const kv = getKV();
  if (kv) {
    await kv.set(KV_KEY, users);
    return;
  }
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key  = await new Promise((res, rej) =>
    crypto.scrypt(password, salt, 64, (err, k) => err ? rej(err) : res(k))
  );
  return `${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const key = await new Promise((res, rej) =>
    crypto.scrypt(password, salt, 64, (err, k) => err ? rej(err) : res(k))
  );
  const a = Buffer.from(key.toString('hex'));
  const b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function checkEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, reason: 'Invalid email format' };
  }
  const domain = email.split('@')[1];
  try {
    const records = await dns.resolveMx(domain);
    if (records?.length > 0) return { valid: true };
    return { valid: false, reason: 'This domain cannot receive email' };
  } catch {
    return { valid: false, reason: 'Email domain not found' };
  }
}

async function register({ name, email, password }) {
  const users = await loadUsers();
  const key   = email.toLowerCase().trim();

  if (users[key]) throw new Error('An account with this email already exists');

  const check = await checkEmail(key);
  if (!check.valid) throw new Error(check.reason);

  const passwordHash = await hashPassword(password);
  const id = crypto.randomBytes(16).toString('hex');

  users[key] = {
    id,
    name: name.trim(),
    email: key,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  await saveUsers(users);
  return { id, name: name.trim(), email: key, passwordHash };
}

async function login({ email, password }) {
  const users = await loadUsers();
  const key   = email.toLowerCase().trim();
  const user  = users[key];
  if (!user) throw new Error('Invalid email or password');
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error('Invalid email or password');
  return { id: user.id, name: user.name, email: user.email };
}

module.exports = { register, login, checkEmail, loadUsers };
