const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const API_KEYS_FILE = path.join(DATA_DIR, 'api-keys.json');
const COOKIE_NAME = 'ai_tides_admin';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CSRF_TTL_MS = 10 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 64).toString('hex');
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

function loadAdmin() {
  return readJson(ADMIN_FILE, null);
}

function saveAdmin(admin) {
  writeJson(ADMIN_FILE, admin);
}

function loadApiKeys() {
  const data = readJson(API_KEYS_FILE, { keys: [] });
  if (!Array.isArray(data.keys)) data.keys = [];
  return data;
}

function saveApiKeys(data) {
  writeJson(API_KEYS_FILE, { keys: data.keys || [] });
}

function adminSecret(admin) {
  return admin && admin.sessionSecret ? admin.sessionSecret : '';
}

function sign(secret, value) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('base64url');
}

function isSecureRequest(req) {
  return Boolean(req && (req.secure || String(req.headers['x-forwarded-proto'] || '').startsWith('https')));
}

function hasAdmin() {
  const admin = loadAdmin();
  return Boolean(admin && admin.passwordHash && admin.salt);
}

function setupAdmin(password) {
  if (hasAdmin()) throw new Error('管理密码已经设置过，请直接登录');
  const clean = String(password || '');
  if (clean.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`密码至少需要 ${MIN_PASSWORD_LENGTH} 位`);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  const admin = {
    passwordHash: hashPassword(clean, salt),
    salt,
    sessionSecret: crypto.randomBytes(32).toString('base64url'),
    createdAt: now,
    updatedAt: now,
  };
  saveAdmin(admin);
  return admin;
}

function verifyAdminPassword(password) {
  const admin = loadAdmin();
  if (!admin || !admin.passwordHash || !admin.salt) return false;
  return safeEqual(hashPassword(String(password || ''), admin.salt), admin.passwordHash);
}

function changeAdminPassword(currentPassword, nextPassword) {
  if (!verifyAdminPassword(currentPassword)) throw new Error('当前密码不正确');
  const clean = String(nextPassword || '');
  if (clean.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`新密码至少需要 ${MIN_PASSWORD_LENGTH} 位`);
  }
  const admin = loadAdmin();
  const salt = crypto.randomBytes(16).toString('hex');
  admin.passwordHash = hashPassword(clean, salt);
  admin.salt = salt;
  admin.sessionSecret = crypto.randomBytes(32).toString('base64url');
  admin.updatedAt = new Date().toISOString();
  saveAdmin(admin);
  return true;
}

function createSession(req, res) {
  const admin = loadAdmin();
  const secret = adminSecret(admin);
  if (!secret) throw new Error('管理密码尚未初始化');
  const token = crypto.randomBytes(24).toString('base64url');
  const expires = Date.now() + SESSION_TTL_MS;
  const value = `${token}.${expires}`;
  const sig = sign(secret, value);
  res.cookie(COOKIE_NAME, `${value}.${sig}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax' });
}

function isAdminSession(req) {
  const raw = String((req.cookies && req.cookies[COOKIE_NAME]) || '');
  const parts = raw.split('.');
  if (parts.length !== 3) return false;
  const [token, expiresText, sig] = parts;
  const expires = Number(expiresText);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const admin = loadAdmin();
  const secret = adminSecret(admin);
  if (!secret) return false;
  return safeEqual(sign(secret, `${token}.${expiresText}`), sig);
}

function csrfToken(issuedAt) {
  const admin = loadAdmin();
  const secret = adminSecret(admin);
  if (!secret) return '';
  const timestamp = Number.isFinite(issuedAt) ? Math.floor(issuedAt) : Date.now();
  return `${timestamp}.${sign(secret, String(timestamp))}`;
}

function isCsrfValid(req, now) {
  const raw = String((req.body && req.body._csrf) || req.headers['x-csrf-token'] || '');
  const parts = raw.split('.');
  if (parts.length !== 2) return false;
  const issuedAt = Number(parts[0]);
  const current = Number.isFinite(now) ? now : Date.now();
  if (!Number.isFinite(issuedAt)) return false;
  if (current - issuedAt > CSRF_TTL_MS || issuedAt - current > 60000) return false;
  const admin = loadAdmin();
  const secret = adminSecret(admin);
  if (!secret) return false;
  return safeEqual(parts[1], sign(secret, String(issuedAt)));
}

function listApiKeys() {
  const data = loadApiKeys();
  return data.keys
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function createApiKey(name) {
  const cleanName = String(name || '').trim().slice(0, 40) || '小龙虾发布密钥';
  const key = `ait_${crypto.randomBytes(24).toString('base64url')}`;
  const record = {
    id: crypto.randomBytes(8).toString('hex'),
    name: cleanName,
    prefix: `${key.slice(0, 12)}...`,
    keyHash: hashApiKey(key),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revoked: false,
    revokedAt: null,
  };
  const data = loadApiKeys();
  data.keys.push(record);
  saveApiKeys(data);
  return { key, record };
}

function authenticateApiKey(key) {
  const clean = String(key || '').trim();
  if (!clean) return null;
  const hash = hashApiKey(clean);
  const data = loadApiKeys();
  const record = data.keys.find((k) => k.keyHash === hash && !k.revoked);
  if (!record) return null;
  record.lastUsedAt = new Date().toISOString();
  saveApiKeys(data);
  return { id: record.id, name: record.name };
}

function revokeApiKey(id) {
  const data = loadApiKeys();
  const record = data.keys.find((k) => k.id === id);
  if (!record) return false;
  record.revoked = true;
  record.revokedAt = new Date().toISOString();
  saveApiKeys(data);
  return true;
}

module.exports = {
  hasAdmin,
  setupAdmin,
  verifyAdminPassword,
  changeAdminPassword,
  createSession,
  clearSession,
  isAdminSession,
  csrfToken,
  isCsrfValid,
  listApiKeys,
  createApiKey,
  authenticateApiKey,
  revokeApiKey,
};
