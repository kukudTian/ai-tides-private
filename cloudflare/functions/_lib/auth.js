const {
  randomHex,
  randomToken,
  constantTimeEqual,
  sha256Hex,
  pbkdf2Hex,
  parseCookies,
} = require('./utils');
const db = require('./db');

const COOKIE_NAME = 'ai_tides_admin';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CSRF_TTL_MS = 10 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

async function hmacSign(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(value)));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isSecureRequest(request) {
  const proto = String(request.headers.get('x-forwarded-proto') || '');
  if (proto.startsWith('https')) return true;
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

async function hasAdmin(database) {
  const admin = await db.getAdmin(database);
  return Boolean(admin && admin.password_hash && admin.salt);
}

async function setupAdmin(database, password, now = new Date().toISOString()) {
  if (await hasAdmin(database)) throw new Error('管理密码已经设置过，请直接登录');
  const clean = String(password || '');
  if (clean.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`密码至少需要 ${MIN_PASSWORD_LENGTH} 位`);
  }
  const salt = randomHex(16);
  const passwordHash = await pbkdf2Hex(clean, salt);
  const admin = {
    passwordHash,
    salt,
    sessionSecret: randomToken(32),
    createdAt: now,
    updatedAt: now,
  };
  await db.setAdmin(database, admin);
  return admin;
}

async function verifyAdminPassword(database, password) {
  const admin = await db.getAdmin(database);
  if (!admin || !admin.password_hash || !admin.salt) return false;
  const hash = await pbkdf2Hex(String(password || ''), admin.salt);
  return constantTimeEqual(hash, admin.password_hash);
}

async function changeAdminPassword(database, currentPassword, nextPassword, now = new Date().toISOString()) {
  if (!(await verifyAdminPassword(database, currentPassword))) throw new Error('当前密码不正确');
  const clean = String(nextPassword || '');
  if (clean.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`新密码至少需要 ${MIN_PASSWORD_LENGTH} 位`);
  }
  const admin = await db.getAdmin(database);
  const salt = randomHex(16);
  const passwordHash = await pbkdf2Hex(clean, salt);
  await db.setAdmin(database, {
    ...admin,
    passwordHash,
    salt,
    sessionSecret: randomToken(32),
    updatedAt: now,
  });
  return true;
}

async function createSessionCookie(database, request, nowMs = Date.now()) {
  const admin = await db.getAdmin(database);
  if (!admin || !admin.session_secret) throw new Error('管理密码尚未初始化');
  const token = randomToken(24);
  const expires = nowMs + SESSION_TTL_MS;
  const value = `${token}.${expires}`;
  const sig = await hmacSign(admin.session_secret, value);
  const secure = isSecureRequest(request) ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(`${value}.${sig}`)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

async function isAdminSession(database, request, nowMs = Date.now()) {
  const cookies = parseCookies(request.headers.get('cookie'));
  const raw = String(cookies[COOKIE_NAME] || '');
  const parts = raw.split('.');
  if (parts.length !== 3) return false;
  const [token, expiresText, sig] = parts;
  const expires = Number(expiresText);
  if (!Number.isFinite(expires) || expires < nowMs) return false;
  const admin = await db.getAdmin(database);
  if (!admin || !admin.session_secret) return false;
  const expected = await hmacSign(admin.session_secret, `${token}.${expiresText}`);
  return constantTimeEqual(expected, sig);
}

async function csrfToken(database, nowMs = Date.now()) {
  const admin = await db.getAdmin(database);
  if (!admin || !admin.session_secret) return '';
  const timestamp = Math.floor(nowMs);
  const sig = await hmacSign(admin.session_secret, String(timestamp));
  return `${timestamp}.${sig}`;
}

async function isCsrfValid(database, request, nowMs = Date.now(), body = {}) {
  const raw = String(
    (body && body._csrf) ||
    request.headers.get('x-csrf-token') ||
    request.headers.get('csrf-token') ||
    ''
  );
  const parts = raw.split('.');
  if (parts.length !== 2) return false;
  const issuedAt = Number(parts[0]);
  const current = Number.isFinite(nowMs) ? nowMs : Date.now();
  if (!Number.isFinite(issuedAt)) return false;
  if (current - issuedAt > CSRF_TTL_MS || issuedAt - current > 60000) return false;
  const admin = await db.getAdmin(database);
  if (!admin || !admin.session_secret) return false;
  const expected = await hmacSign(admin.session_secret, String(issuedAt));
  return constantTimeEqual(parts[1], expected);
}

async function createApiKey(database, name, now = new Date().toISOString()) {
  const cleanName = String(name || '').trim().slice(0, 40) || '小龙虾发布密钥';
  const key = `ait_${randomToken(32)}`;
  const record = {
    id: randomHex(8),
    name: cleanName,
    prefix: `${key.slice(0, 12)}...`,
    keyHash: await sha256Hex(key),
    createdAt: now,
    lastUsedAt: null,
    revoked: false,
    revokedAt: null,
  };
  await db.insertApiKey(database, record);
  return { key, record };
}

async function authenticateApiKey(database, key, now = new Date().toISOString()) {
  const clean = String(key || '').trim();
  if (!clean) return null;
  const hash = await sha256Hex(clean);
  const row = await db.findByKeyHash(database, hash);
  if (!row || Number(row.revoked)) return null;
  const id = row.id;
  await db.touchApiKey(database, id, now);
  return { id, name: row.name };
}

async function revokeApiKey(database, id, now = new Date().toISOString()) {
  return db.revokeApiKey(database, id, now);
}

async function listApiKeys(database) {
  const rows = await db.listApiKeys(database);
  return rows.map((r) => ({
    ...r,
    createdAtText: formatDateTime(r.createdAt),
    lastUsedAtText: r.lastUsedAt ? formatDateTime(r.lastUsedAt) : '从未使用',
    revokedAtText: r.revokedAt ? formatDateTime(r.revokedAt) : '',
  }));
}

function formatDateTime(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return String(iso || '');
  const t = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

module.exports = {
  COOKIE_NAME,
  MIN_PASSWORD_LENGTH,
  hasAdmin,
  setupAdmin,
  verifyAdminPassword,
  changeAdminPassword,
  createSessionCookie,
  clearSessionCookie,
  isAdminSession,
  csrfToken,
  isCsrfValid,
  createApiKey,
  authenticateApiKey,
  revokeApiKey,
  listApiKeys,
};
