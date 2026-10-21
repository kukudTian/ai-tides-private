const { toAsciiSlug } = require('./utils');
const { normalizePost } = require('./posts');
const toolEnrichments = require('../_data/tool-enrichments');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    category_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    summary TEXT NOT NULL DEFAULT '',
    sections TEXT NOT NULL DEFAULT '[]',
    faq TEXT NOT NULL DEFAULT '[]',
    official_url TEXT NOT NULL DEFAULT '',
    recommend_url TEXT NOT NULL DEFAULT '',
    recommend_note TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    screenshots TEXT NOT NULL DEFAULT '[]',
    cover TEXT NOT NULL DEFAULT '{}',
    hot_score INTEGER NOT NULL DEFAULT 0,
    featured INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',
    published_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, published_at)`,
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL DEFAULT '',
    salt TEXT NOT NULL DEFAULT '',
    session_secret TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    key_hash TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    revoked INTEGER NOT NULL DEFAULT 0,
    revoked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS worker_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'info',
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS partner_submissions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    desc TEXT NOT NULL DEFAULT '',
    price_note INTEGER NOT NULL DEFAULT 0,
    email_status TEXT NOT NULL DEFAULT 'pending',
    status TEXT NOT NULL DEFAULT 'unread',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS traffic_visits (
    visit_date TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    pageviews INTEGER NOT NULL DEFAULT 0,
    last_seen TEXT NOT NULL,
    PRIMARY KEY (visit_date, fingerprint)
  )`,
  `CREATE TABLE IF NOT EXISTS traffic_post_views (
    post_slug TEXT NOT NULL,
    visit_date TEXT NOT NULL,
    pageviews INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (post_slug, visit_date)
  )`,
];

async function ensureSchema(db) {
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  await ensurePartnerStatusColumn(db);
}

async function ensurePartnerStatusColumn(db) {
  // 为已存在的旧表补上 status 列（CREATE TABLE IF NOT EXISTS 不会修改旧表）。
  try {
    const { results } = await db.prepare('PRAGMA table_info(partner_submissions)').all();
    const hasStatus = (results || []).some((c) => c.name === 'status');
    if (!hasStatus) {
      await db
        .prepare("ALTER TABLE partner_submissions ADD COLUMN status TEXT NOT NULL DEFAULT 'unread'")
        .run();
    }
  } catch (err) {
    // 列可能已被并发创建，忽略重复添加错误。
  }
}

async function getMeta(db, key) {
  const row = await db.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

async function setMeta(db, key, value) {
  await db
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, String(value))
    .run();
}

function rowToPost(row) {
  if (!row) return null;
  const parse = (value, fallback) => {
    try {
      return JSON.parse(value || '');
    } catch {
      return fallback;
    }
  };
  const post = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle || '',
    category: row.category,
    categoryName: row.category_name || (row.category === 'ai-news' ? 'AI资讯' : 'AI工具'),
    kind: row.kind || (row.category === 'ai-news' ? 'news' : 'tool'),
    tags: parse(row.tags, []),
    summary: row.summary || '',
    sections: parse(row.sections, []),
    faq: parse(row.faq, []),
    officialUrl: row.official_url || '',
    recommendUrl: row.recommend_url || '',
    recommendNote: row.recommend_note || '',
    sourceUrl: row.source_url || '',
    screenshots: parse(row.screenshots, []),
    cover: parse(row.cover, { letter: 'AI', color: '#e5484d' }),
    hotScore: Number(row.hot_score) || 0,
    featured: Boolean(Number(row.featured)),
    status: row.status || 'published',
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  const enrichment = post.kind === 'tool' && toolEnrichments[post.slug];
  if (enrichment) {
    post.sections = [...(post.sections || []), ...(enrichment.sections || [])];
    post.faq = [...(post.faq || []), ...(enrichment.faq || [])];
  }
  return post;
}

async function listPosts(db) {
  const { results } = await db.prepare('SELECT * FROM posts').all();
  return (results || []).map(rowToPost);
}

async function getPost(db, slug) {
  const row = await db.prepare('SELECT * FROM posts WHERE slug = ?').bind(String(slug)).first();
  return rowToPost(row);
}

async function countPosts(db) {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM posts').first();
  return Number((row && row.count) || 0);
}

async function upsertPost(db, input, now = new Date().toISOString()) {
  const slug = toAsciiSlug((input && (input.slug || input.title)) || '');
  const existing = slug ? await getPost(db, slug) : null;
  const mergedInput = { ...(input || {}) };
  if (existing) {
    ['cover', 'screenshots', 'officialUrl', 'recommendUrl', 'recommendNote', 'sourceUrl', 'subtitle', 'summary', 'tags', 'faq', 'hotScore', 'featured'].forEach((key) => {
      if (mergedInput[key] === undefined) mergedInput[key] = existing[key];
    });
  }
  const post = normalizePost(mergedInput, now);
  if (existing) {
    post.id = existing.id;
    post.createdAt = existing.createdAt;
  }
  const row = [
    post.id,
    post.slug,
    post.title,
    post.subtitle,
    post.category,
    post.categoryName,
    post.kind,
    JSON.stringify(post.tags || []),
    post.summary,
    JSON.stringify(post.sections || []),
    JSON.stringify(post.faq || []),
    post.officialUrl,
    post.recommendUrl,
    post.recommendNote,
    post.sourceUrl,
    JSON.stringify(post.screenshots || []),
    JSON.stringify(post.cover || {}),
    Number(post.hotScore) || 0,
    post.featured ? 1 : 0,
    post.status,
    post.publishedAt,
    post.createdAt,
    post.updatedAt,
  ];
  const sql = `INSERT INTO posts (
    id, slug, title, subtitle, category, category_name, kind, tags, summary, sections,
    faq, official_url, recommend_url, recommend_note, source_url, screenshots, cover, hot_score, featured,
    status, published_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(slug) DO UPDATE SET
    id = excluded.id,
    title = excluded.title,
    subtitle = excluded.subtitle,
    category = excluded.category,
    category_name = excluded.category_name,
    kind = excluded.kind,
    tags = excluded.tags,
    summary = excluded.summary,
    sections = excluded.sections,
    faq = excluded.faq,
    official_url = excluded.official_url,
    recommend_url = excluded.recommend_url,
    recommend_note = excluded.recommend_note,
    source_url = excluded.source_url,
    screenshots = excluded.screenshots,
    cover = excluded.cover,
    hot_score = excluded.hot_score,
    featured = excluded.featured,
    status = excluded.status,
    published_at = excluded.published_at,
    updated_at = excluded.updated_at`;
  await db.prepare(sql).bind(...row).run();
  return post;
}

async function deletePost(db, slug) {
  const result = await db.prepare('DELETE FROM posts WHERE slug = ?').bind(String(slug)).run();
  return Boolean(result.meta && result.meta.changes);
}

async function publishDue(db, now = new Date().toISOString()) {
  const due = await db
    .prepare("SELECT slug, title FROM posts WHERE status = 'scheduled' AND published_at <= ?")
    .bind(now)
    .all();
  const items = due.results || [];
  if (!items.length) return { changed: 0, items: [] };
  await db
    .prepare("UPDATE posts SET status = 'published', updated_at = ? WHERE status = 'scheduled' AND published_at <= ?")
    .bind(now, now)
    .run();
  for (const item of items) {
    await addWorkerLog(db, 'published', `定时发布完成：${item.title}`, now);
  }
  return { changed: items.length, items };
}

async function seedIfNeeded(db, seedPosts, now = new Date().toISOString()) {
  const seeded = await getMeta(db, 'seeded');
  if (seeded) return false;
  const count = await countPosts(db);
  if (count === 0 && Array.isArray(seedPosts) && seedPosts.length) {
    for (const item of seedPosts) {
      await upsertPost(db, item, now);
    }
  }
  await setMeta(db, 'seeded', '1');
  return true;
}

async function getAdmin(db) {
  const row = await db.prepare('SELECT * FROM admin WHERE id = 1').first();
  return row || null;
}

async function setAdmin(db, admin) {
  if (!admin) return;
  await db
    .prepare(`INSERT INTO admin (id, password_hash, salt, session_secret, created_at, updated_at)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        password_hash = excluded.password_hash,
        salt = excluded.salt,
        session_secret = excluded.session_secret,
        updated_at = excluded.updated_at`)
    .bind(
      admin.passwordHash,
      admin.salt,
      admin.sessionSecret,
      admin.createdAt || new Date().toISOString(),
      admin.updatedAt || new Date().toISOString()
    )
    .run();
}

async function listApiKeys(db) {
  const { results } = await db.prepare('SELECT * FROM api_keys').all();
  return (results || [])
    .map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      keyHash: r.key_hash,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
      revoked: Boolean(Number(r.revoked)),
      revokedAt: r.revoked_at,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function insertApiKey(db, record) {
  await db
    .prepare('INSERT INTO api_keys (id, name, prefix, key_hash, created_at, last_used_at, revoked, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(record.id, record.name, record.prefix, record.keyHash, record.createdAt, null, 0, null)
    .run();
}

async function findByKeyHash(db, hash) {
  const row = await db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').bind(hash).first();
  return row || null;
}

async function touchApiKey(db, id, now = new Date().toISOString()) {
  await db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(now, id).run();
}

async function revokeApiKey(db, id, now = new Date().toISOString()) {
  const result = await db
    .prepare('UPDATE api_keys SET revoked = 1, revoked_at = ? WHERE id = ? AND revoked = 0')
    .bind(now, id)
    .run();
  return Boolean(result.meta && result.meta.changes);
}

async function addWorkerLog(db, kind, text, now = new Date().toISOString()) {
  await db
    .prepare('INSERT INTO worker_logs (kind, text, created_at) VALUES (?, ?, ?)')
    .bind(String(kind || 'info'), String(text || ''), now)
    .run();
}

async function listWorkerLogs(db, limit = 30) {
  const { results } = await db
    .prepare('SELECT * FROM worker_logs ORDER BY id DESC LIMIT ?')
    .bind(Number(limit) || 30)
    .all();
  return (results || []).map((r) => ({
    id: r.id,
    kind: r.kind || 'info',
    text: r.text || '',
    createdAt: r.created_at || '',
  }));
}

async function insertPartnerSubmission(db, record) {
  await db
    .prepare(
      `INSERT INTO partner_submissions (
        id, name, "type", url, contact, email, desc, price_note, email_status, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      record.id,
      record.name,
      record.type,
      record.url,
      record.contact,
      record.email,
      record.desc,
      record.priceNote ? 1 : 0,
      record.emailStatus || 'pending',
      record.status || 'unread',
      record.createdAt
    )
    .run();
}

async function markSubmissionEmail(db, id, status) {
  await db
    .prepare('UPDATE partner_submissions SET email_status = ? WHERE id = ?')
    .bind(String(status || 'sent'), String(id))
    .run();
}

async function updateSubmissionStatus(db, id, status) {
  const allowed = ['unread', 'read', 'online', 'rejected'];
  const next = allowed.includes(String(status)) ? String(status) : '';
  if (!next) return false;
  const result = await db
    .prepare('UPDATE partner_submissions SET status = ? WHERE id = ?')
    .bind(next, String(id))
    .run();
  return Boolean(result.meta && result.meta.changes);
}

async function listPartnerSubmissions(db, limit = 50) {
  const { results } = await db
    .prepare('SELECT * FROM partner_submissions ORDER BY created_at DESC LIMIT ?')
    .bind(Number(limit) || 50)
    .all();
  return (results || []).map((r) => ({
    id: r.id,
    name: r.name || '',
    type: r.type || '',
    url: r.url || '',
    contact: r.contact || '',
    email: r.email || '',
    desc: r.desc || '',
    priceNote: Boolean(Number(r.price_note)),
    emailStatus: r.email_status || 'pending',
    status: r.status || 'unread',
    createdAt: r.created_at || '',
  }));
}

async function countPartnerSubmissions(db) {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM partner_submissions').first();
  return Number((row && row.count) || 0);
}

async function recordPageVisit(db, { date, fingerprint, now = new Date().toISOString() }) {
  const result = await db
    .prepare(
      `INSERT INTO traffic_visits (visit_date, fingerprint, pageviews, last_seen)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(visit_date, fingerprint) DO UPDATE SET
         pageviews = pageviews + 1,
         last_seen = excluded.last_seen`
    )
    .bind(String(date), String(fingerprint), now)
    .run();
  return Boolean(result && result.meta);
}

async function getTrafficStats(db, options = {}) {
  const from = options.from || null;
  const to = options.to || null;
  const { clause, params } = dateRangeClause(from, to);
  const totalRow = await db
    .prepare(
      `SELECT COALESCE(SUM(pageviews), 0) AS pageviews,
              COUNT(DISTINCT fingerprint) AS visitors
       FROM traffic_visits ${clause}`
    )
    .bind(...params)
    .first();
  const dailyResult = await db
    .prepare(
      `SELECT visit_date,
              COALESCE(SUM(pageviews), 0) AS pageviews,
              COUNT(DISTINCT fingerprint) AS visitors
       FROM traffic_visits ${clause}
       GROUP BY visit_date
       ORDER BY visit_date ASC`
    )
    .bind(...params)
    .all();
  const weeklyResult = await db
    .prepare(
      `SELECT strftime('%Y-%W', visit_date) AS week_key,
              MIN(visit_date) AS week_start,
              MAX(visit_date) AS week_end,
              COALESCE(SUM(pageviews), 0) AS pageviews,
              COUNT(DISTINCT fingerprint) AS visitors
       FROM traffic_visits ${clause}
       GROUP BY week_key
       ORDER BY week_key ASC`
    )
    .bind(...params)
    .all();
  const today = dayKey(new Date());
  const weekKeyRow = await db
    .prepare("SELECT strftime('%Y-%W', ?) AS week_key")
    .bind(today)
    .first();
  const currentWeekKey = (weekKeyRow && weekKeyRow.week_key) || '';
  const weekRow = await db
    .prepare(
      `SELECT COALESCE(SUM(pageviews), 0) AS pageviews,
              COUNT(DISTINCT fingerprint) AS visitors
       FROM traffic_visits
       WHERE strftime('%Y-%W', visit_date) = ?`
    )
    .bind(currentWeekKey)
    .first();
  const allTimeRow = await db
    .prepare(
      `SELECT COALESCE(SUM(pageviews), 0) AS pageviews,
              COUNT(DISTINCT fingerprint) AS visitors
       FROM traffic_visits`
    )
    .first();
  const todayRow = await db
    .prepare(
      `SELECT COALESCE(SUM(pageviews), 0) AS pageviews,
              COUNT(DISTINCT fingerprint) AS visitors
       FROM traffic_visits WHERE visit_date = ?`
    )
    .bind(today)
    .first();
  const rows = dailyResult.results || [];
  const rangeStart = from || (rows.length ? rows[0].visit_date : today);
  const rangeEnd = to || (rows.length ? rows[rows.length - 1].visit_date : today);
  const daily = fillDailyGaps(rows, rangeStart, rangeEnd);
  const weekly = (weeklyResult.results || []).map((r) => ({
    key: r.week_key,
    label: weekLabel(r.week_key),
    start: r.week_start,
    end: r.week_end,
    pageviews: Number(r.pageviews) || 0,
    visitors: Number(r.visitors) || 0,
  }));
  return {
    totalPageviews: Number((totalRow && totalRow.pageviews) || 0),
    totalVisitors: Number((totalRow && totalRow.visitors) || 0),
    rangeLabel: `${rangeStart} ~ ${rangeEnd}`,
    rangeStart,
    rangeEnd,
    todayPageviews: Number((todayRow && todayRow.pageviews) || 0),
    todayVisitors: Number((todayRow && todayRow.visitors) || 0),
    weekPageviews: Number((weekRow && weekRow.pageviews) || 0),
    weekVisitors: Number((weekRow && weekRow.visitors) || 0),
    allTimePageviews: Number((allTimeRow && allTimeRow.pageviews) || 0),
    allTimeVisitors: Number((allTimeRow && allTimeRow.visitors) || 0),
    daily,
    weekly,
  };
}

function dateRangeClause(from, to) {
  const parts = [];
  const params = [];
  if (from) {
    parts.push('visit_date >= ?');
    params.push(String(from));
  }
  if (to) {
    parts.push('visit_date <= ?');
    params.push(String(to));
  }
  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

function dayKey(date) {
  const d = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function weekLabel(weekKey) {
  const parts = String(weekKey || '').split('-');
  if (parts.length < 2) return '本周';
  return `${parts[0]} 第 ${Number(parts[1]) || 0} 周`;
}

function fillDailyGaps(rows, start, end) {
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endTime = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return (rows || []).map((row) => ({
      date: row.visit_date,
      pageviews: Number(row.pageviews) || 0,
      visitors: Number(row.visitors) || 0,
    }));
  }
  const dayDiff = Math.round((endTime - startTime) / 86400000);
  if (dayDiff > 45) {
    return (rows || []).map((row) => ({
      date: row.visit_date,
      pageviews: Number(row.pageviews) || 0,
      visitors: Number(row.visitors) || 0,
    }));
  }
  const byDate = {};
  for (const row of rows || []) byDate[row.visit_date] = row;
  const out = [];
  for (let i = 0; i <= dayDiff; i += 1) {
    const date = new Date(startTime + i * 86400000).toISOString().slice(0, 10);
    const row = byDate[date];
    out.push({
      date,
      pageviews: Number((row && row.pageviews) || 0),
      visitors: Number((row && row.visitors) || 0),
    });
  }
  return out;
}

async function recordPostView(db, { slug, date, now = new Date().toISOString() }) {
  const result = await db
    .prepare(
      `INSERT INTO traffic_post_views (post_slug, visit_date, pageviews)
       VALUES (?, ?, 1)
       ON CONFLICT(post_slug, visit_date) DO UPDATE SET
         pageviews = pageviews + 1`
    )
    .bind(String(slug), String(date))
    .run();
  return Boolean(result && result.meta);
}

async function getPostViewStats(db, options = {}) {
  const { clause, params } = dateRangeClause(options.from || null, options.to || null);
  const rangeResult = await db
    .prepare(
      `SELECT post_slug,
              COALESCE(SUM(pageviews), 0) AS pageviews,
              COUNT(DISTINCT visit_date) AS active_days
       FROM traffic_post_views ${clause}
       GROUP BY post_slug
       ORDER BY pageviews DESC`
    )
    .bind(...params)
    .all();
  const totalResult = await db
    .prepare(
      `SELECT post_slug, COALESCE(SUM(pageviews), 0) AS pageviews
       FROM traffic_post_views
       GROUP BY post_slug`
    )
    .all();
  const dailyResult = await db
    .prepare(
      `SELECT post_slug, visit_date, pageviews
       FROM traffic_post_views ${clause}
       ORDER BY post_slug ASC, visit_date ASC`
    )
    .bind(...params)
    .all();
  const range = {};
  const total = {};
  const daily = [];
  for (const row of rangeResult.results || []) {
    range[row.post_slug] = Number(row.pageviews) || 0;
  }
  for (const row of totalResult.results || []) {
    total[row.post_slug] = Number(row.pageviews) || 0;
  }
  for (const row of dailyResult.results || []) {
    daily.push({
      slug: row.post_slug,
      date: row.visit_date,
      pageviews: Number(row.pageviews) || 0,
    });
  }
  return { range, total, daily };
}

async function resetTrafficData(db) {
  await db.batch([
    db.prepare('DELETE FROM traffic_visits'),
    db.prepare('DELETE FROM traffic_post_views'),
  ]);
  return true;
}

module.exports = {
  ensureSchema,
  getMeta,
  setMeta,
  listPosts,
  getPost,
  countPosts,
  upsertPost,
  deletePost,
  publishDue,
  seedIfNeeded,
  getAdmin,
  setAdmin,
  listApiKeys,
  insertApiKey,
  findByKeyHash,
  touchApiKey,
  revokeApiKey,
  addWorkerLog,
  listWorkerLogs,
  insertPartnerSubmission,
  markSubmissionEmail,
  listPartnerSubmissions,
  countPartnerSubmissions,
  updateSubmissionStatus,
  recordPageVisit,
  recordPostView,
  getTrafficStats,
  getPostViewStats,
  resetTrafficData,
};
