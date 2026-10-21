#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PUBLIC_DIR = path.join(ROOT, 'public');

const siteUrl = process.env.SITE_URL || process.env.EXPORT_SITE_URL || 'http://localhost:3000';
process.env.SITE_URL = siteUrl.replace(/\/+$/, '');

const { app } = require('../server');
const store = require('../lib/store');
const { stripHtml, escapeHtml } = require('../lib/utils');

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

function cardHtml(p) {
  const kindClass = p.kind === 'news' ? ' tool-card--news' : '';
  const cover = p.cover && p.cover.url
    ? `<img class="tool-card-cover" src="${escapeHtml(p.cover.url)}" alt="" loading="lazy">`
    : `<span class="letter-tile" style="background-color: ${p.cover && p.cover.color ? escapeHtml(p.cover.color) : '#e5484d'}">${p.cover && p.cover.letter ? escapeHtml(p.cover.letter) : 'AI'}</span>`;
  const foot = p.kind === 'news'
    ? `<span><i data-lucide="calendar"></i>${escapeHtml(String(p.publishedAt || '').slice(0, 10))}</span>`
    : `<span><i data-lucide="box"></i>${escapeHtml(p.categoryName || '')}</span>`;
  return `<a class="tool-card${kindClass}" href="/tool/${encodeURIComponent(p.slug)}/">
  <div class="tool-card-top">
    ${cover}
    <span class="tool-card-category">${escapeHtml(p.categoryName || '')}</span>
  </div>
  <div class="tool-card-body">
    <h3>${escapeHtml(String(p.title || '').split(' - ')[0])}</h3>
    <p>${escapeHtml(p.summary || p.subtitle || '')}</p>
  </div>
  <div class="tool-card-foot">
    ${foot}
    <span class="tool-card-arrow"><i data-lucide="arrow-right"></i></span>
  </div>
</a>`;
}

function searchScript() {
  return `<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  var q = (params.get('q') || '').trim().toLowerCase();
  var grid = document.querySelector('.post-grid');
  var empty = document.querySelector('.empty-state');
  if (!q) {
    if (empty) empty.style.display = '';
    return;
  }
  fetch('/search-index.json').then(function (res) { return res.json(); }).then(function (items) {
    var list = items.filter(function (p) {
      return (p.searchText || '').toLowerCase().indexOf(q) >= 0;
    });
    var h1 = document.querySelector('.list-header h1');
    var sub = document.querySelector('.list-subtitle');
    if (h1) h1.textContent = '搜索“' + q + '”';
    if (sub) sub.textContent = '找到 ' + list.length + ' 条结果';
    if (empty) empty.style.display = list.length ? 'none' : '';
    if (grid) grid.innerHTML = list.map(function (p) { return cardHtml(p); }).join('');
    if (window.lucide) window.lucide.createIcons();
  });
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cardHtml(p) {
    var cover = p.coverUrl
      ? '<img class="tool-card-cover" src="' + esc(p.coverUrl) + '" alt="" loading="lazy">'
      : '<span class="letter-tile" style="background-color:' + esc(p.coverColor || '#e5484d') + '">' + esc(p.coverLetter || 'AI') + '</span>';
    var foot = p.kind === 'news'
      ? '<span><i data-lucide="calendar"></i>' + esc(String(p.publishedAt || '').slice(0, 10)) + '</span>'
      : '<span><i data-lucide="box"></i>' + esc(p.categoryName || '') + '</span>';
    return '<a class="tool-card' + (p.kind === 'news' ? ' tool-card--news' : '') + '" href="/tool/' + encodeURIComponent(p.slug) + '/">' +
      '<div class="tool-card-top">' + cover + '<span class="tool-card-category">' + esc(p.categoryName || '') + '</span></div>' +
      '<div class="tool-card-body"><h3>' + esc(String(p.title || '').split(' - ')[0]) + '</h3><p>' + esc(p.summary || p.subtitle || '') + '</p></div>' +
      '<div class="tool-card-foot">' + foot + '<span class="tool-card-arrow"><i data-lucide="arrow-right"></i></span></div></a>';
  }
})();
</script>`;
}

function headersFile() {
  return `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/icons/*
  Cache-Control: public, max-age=86400, immutable

/screenshots/*
  Cache-Control: public, max-age=86400, immutable

/vendor/*
  Cache-Control: public, max-age=604800, immutable

/styles.css
  Cache-Control: public, max-age=3600

/app.js
  Cache-Control: public, max-age=3600

/search-index.json
  Cache-Control: public, max-age=900

/sitemap.xml
  Cache-Control: public, max-age=3600

/rss.xml
  Cache-Control: public, max-age=900
`;
}

function routesFile() {
  return `{
  "version": 1,
  "include": ["/*"],
  "exclude": [
    "/icons/*",
    "/screenshots/*",
    "/vendor/*",
    "/favicon.svg",
    "/styles.css",
    "/app.js"
  ]
}
`;
}

function redirectsFile() {
  return [
    '/search /search/ 301',
    '/category/ai-chat* /category/ai-tools/ 301',
    '/category/ai-coding* /category/ai-tools/ 301',
    '/category/ai-agent* /category/ai-tools/ 301',
    '/category/ai-writing* /category/ai-tools/ 301',
    '/category/ai-image* /category/ai-tools/ 301',
    '/category/ai-video* /category/ai-tools/ 301',
    '/category/ai-office* /category/ai-tools/ 301',
    '/category/ai-model* /category/ai-tools/ 301',
  ].join('\n') + '\n';
}

async function main() {
  const resolved = path.resolve(DIST);
  if (!resolved.startsWith(path.resolve(ROOT) + path.sep)) {
    throw new Error(`dist 路径异常: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });

  fs.cpSync(PUBLIC_DIR, resolved, { recursive: true });

  const posts = store.loadPosts();
  const published = store.getPublished(posts);
  const tags = store.allTags(posts);

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const routes = [
    ['/', 'index.html'],
    ['/category/ai-news/', 'category/ai-news/index.html'],
    ['/category/ai-tools/', 'category/ai-tools/index.html'],
    ['/partner/', 'partner/index.html'],
    ['/about/', 'about/index.html'],
    ['/contact/', 'contact/index.html'],
    ['/privacy/', 'privacy/index.html'],
    ['/terms/', 'terms/index.html'],
    ...tags.map((t) => [`/tag/${t.slug}/`, `tag/${t.slug}/index.html`]),
    ...published.map((p) => [`/tool/${p.slug}/`, `tool/${p.slug}/index.html`]),
  ];

  for (const [route, file] of routes) {
    write(path.join(resolved, file), await fetchText(base + route));
    console.log(`exported ${route}`);
  }

  const textRoutes = [
    ['/rss.xml', 'rss.xml'],
    ['/sitemap.xml', 'sitemap.xml'],
    ['/robots.txt', 'robots.txt'],
    ['/ads.txt', 'ads.txt'],
  ];
  for (const [route, file] of textRoutes) {
    write(path.join(resolved, file), await fetchText(base + route));
    console.log(`exported ${route}`);
  }

  const searchHtml = await fetchText(base + '/search');
  const withSearch = searchHtml.replace('</body>', `${searchScript()}\n</body>`);
  write(path.join(resolved, 'search', 'index.html'), withSearch);
  console.log('exported /search');

  const index = published.map((p) => ({
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    summary: p.summary,
    category: p.category,
    categoryName: p.categoryName,
    kind: p.kind,
    tags: p.tags || [],
    coverUrl: p.cover && p.cover.url ? p.cover.url : '',
    coverLetter: p.cover && p.cover.letter ? p.cover.letter : 'AI',
    coverColor: p.cover && p.cover.color ? p.cover.color : '#e5484d',
    publishedAt: p.publishedAt,
    url: `/tool/${p.slug}/`,
    searchText: [
      p.title,
      p.subtitle,
      p.summary,
      p.categoryName,
      ...(p.tags || []),
      ...(p.sections || []).map((s) => `${s.heading} ${stripHtml(s.body)}`),
    ].join(' '),
  }));
  write(path.join(resolved, 'search-index.json'), JSON.stringify(index));
  write(path.join(resolved, '_headers'), headersFile());
  write(path.join(resolved, '_routes.json'), routesFile());
  write(path.join(resolved, '_redirects'), redirectsFile());

  server.close();
  console.log(`export complete -> ${resolved}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
