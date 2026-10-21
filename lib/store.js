const fs = require('fs');
const path = require('path');
const { readJson, writeJson, toAsciiSlug, stripHtml, sanitizeHtml } = require('./utils');
const seedPosts = require('../data/seed');
const toolEnrichments = require('../cloudflare/functions/_data/tool-enrichments');

const DATA_DIR = path.join(__dirname, '..', 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const REFERRALS_FILE = path.join(DATA_DIR, 'referrals.json');
const CATEGORIES = [
  { slug: 'ai-tools', name: 'AI工具', kind: 'tool' },
  { slug: 'ai-news', name: 'AI资讯', kind: 'news' },
];

const LEGACY_CATEGORY_SLUGS = {
  'ai-chat': 'ai-tools',
  'ai-coding': 'ai-tools',
  'ai-agent': 'ai-tools',
  'ai-writing': 'ai-tools',
  'ai-image': 'ai-tools',
  'ai-video': 'ai-tools',
  'ai-office': 'ai-tools',
  'ai-model': 'ai-tools',
};

function normalizePost(input, now = new Date().toISOString()) {
  const id = input.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = String(input.title || '').trim();
  const sections = Array.isArray(input.sections)
    ? input.sections.map((s) => ({
        heading: String(s.heading || '').trim(),
        body: sanitizeHtml(String(s.body || '')),
      }))
    : [];

  if (input.html) {
    sections.push({ heading: '正文', body: sanitizeHtml(String(input.html)) });
  }

  const slug = input.slug ? toAsciiSlug(input.slug) : toAsciiSlug(title);
  const categorySlug = LEGACY_CATEGORY_SLUGS[input.category] || input.category;
  const category = CATEGORIES.find((c) => c.slug === categorySlug || c.name === input.category);
  const status = input.status === 'scheduled' || input.status === 'draft' ? input.status : 'published';
  const publishedAt = input.publishedAt || input.publishAt || now;
  const resolvedCategory = category ? category.slug : 'ai-tools';

  return {
    id,
    slug,
    title,
    subtitle: String(input.subtitle || '').trim(),
    category: resolvedCategory,
    categoryName: category ? category.name : 'AI工具',
    kind: resolvedCategory === 'ai-news' ? 'news' : 'tool',
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    summary: String(input.summary || '').trim(),
    sections,
    faq: Array.isArray(input.faq)
      ? input.faq.map((f) => ({ q: String(f.q || '').trim(), a: String(f.a || '').trim() }))
      : [],
    officialUrl: String(input.officialUrl || '').trim(),
    recommendUrl: String(input.recommendUrl || '').trim(),
    recommendNote: String(input.recommendNote || '').trim(),
    sourceUrl: String(input.sourceUrl || '').trim(),
    screenshots: Array.isArray(input.screenshots) ? input.screenshots.map(String) : [],
    cover: input.cover || { letter: (title.slice(0, 1) || 'A').toUpperCase(), color: '#e5484d' },
    hotScore: Number(input.hotScore) || 0,
    featured: Boolean(input.featured),
    status,
    publishedAt,
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

function loadPosts() {
  const existing = readJson(POSTS_FILE, null);
  let posts = existing;
  const seeded = !Array.isArray(posts) || !posts.length;
  if (seeded) {
    posts = seedPosts.map((p, i) =>
      normalizePost({ ...p, hotScore: (p.hotScore || 90) - i }, new Date(p.publishedAt || Date.now()).toISOString())
    );
  }
  const referrals = readJson(REFERRALS_FILE, {}) || {};
  let changed = false;
  posts.forEach((p) => {
    const url = String(referrals[p.slug] || '').trim();
    if (url) {
      p.recommendUrl = url;
      changed = true;
    }
  });
  if (changed || seeded) writeJson(POSTS_FILE, posts);
  return posts.map((p) => {
    const enrichment = p.kind === 'tool' && toolEnrichments[p.slug];
    if (!enrichment) return p;
    return {
      ...p,
      sections: [...(p.sections || []), ...(enrichment.sections || [])],
      faq: [...(p.faq || []), ...(enrichment.faq || [])],
    };
  });
}

function savePosts(posts) {
  writeJson(POSTS_FILE, posts);
}

function getPublished(posts) {
  return posts
    .filter((p) => p.status === 'published')
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function getScheduled(posts) {
  return posts.filter((p) => p.status === 'scheduled');
}

function bySlug(posts, slug) {
  return posts.find((p) => p.slug === slug);
}

function relatedPosts(posts, post, limit = 6) {
  const sameCategory = getPublished(posts).filter(
    (p) => p.category === post.category && p.slug !== post.slug
  );
  const sameTags = getPublished(posts).filter(
    (p) => p.slug !== post.slug && p.tags.some((t) => post.tags.includes(t))
  );
  const merged = [...sameCategory, ...sameTags].filter(
    (p, i, arr) => arr.findIndex((x) => x.slug === p.slug) === i
  );
  return merged.slice(0, limit);
}

function neighbors(posts, post) {
  const published = getPublished(posts);
  const index = published.findIndex((p) => p.slug === post.slug);
  return {
    prev: published[index + 1] || null,
    next: published[index - 1] || null,
  };
}

function searchPosts(posts, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return getPublished(posts).filter((p) => {
    const haystack = [
      p.title,
      p.subtitle,
      p.summary,
      p.categoryName,
      ...(p.tags || []),
      ...(p.sections || []).map((s) => `${s.heading} ${s.body}`),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

function allTags(posts) {
  const counts = {};
  getPublished(posts).forEach((p) => {
    (p.tags || []).forEach((t) => {
      counts[t] = (counts[t] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .map(([name, count]) => ({ name, slug: encodeURIComponent(name), count }))
    .sort((a, b) => b.count - a.count);
}

function categoryStats(posts) {
  const published = getPublished(posts);
  return CATEGORIES.map((c) => ({
    ...c,
    count: published.filter((p) => p.category === c.slug).length,
  })).filter((c) => c.count > 0);
}

function upsertPost(posts, input) {
  const existingIndex = posts.findIndex((p) => p.slug === toAsciiSlug(input.slug || input.title));
  const now = new Date().toISOString();
  const mergedInput = { ...input };
  if (existingIndex >= 0) {
    const existing = posts[existingIndex];
    ['cover', 'screenshots', 'officialUrl', 'recommendUrl', 'recommendNote', 'sourceUrl', 'subtitle', 'summary', 'tags', 'faq', 'hotScore', 'featured'].forEach((key) => {
      if (mergedInput[key] === undefined) mergedInput[key] = existing[key];
    });
  }
  const post = normalizePost(mergedInput, now);
  if (existingIndex >= 0) {
    posts[existingIndex] = { ...posts[existingIndex], ...post, id: posts[existingIndex].id, createdAt: posts[existingIndex].createdAt };
  } else {
    posts.push(post);
  }
  savePosts(posts);
  return post;
}

function publishDue(posts) {
  const now = new Date().toISOString();
  let changed = false;
  posts.forEach((p) => {
    if (p.status === 'scheduled' && p.publishedAt <= now) {
      p.status = 'published';
      p.updatedAt = now;
      changed = true;
    }
  });
  if (changed) savePosts(posts);
  return changed;
}

function rebuildIfNeeded() {
  const posts = loadPosts();
  publishDue(posts);
  return posts;
}

if (require.main === module && process.argv.includes('--seed-only')) {
  loadPosts();
  console.log(`Seeded ${seedPosts.length} posts into ${POSTS_FILE}`);
}

module.exports = {
  CATEGORIES,
  POSTS_FILE,
  loadPosts,
  savePosts,
  getPublished,
  getScheduled,
  bySlug,
  relatedPosts,
  neighbors,
  searchPosts,
  allTags,
  categoryStats,
  upsertPost,
  publishDue,
  rebuildIfNeeded,
  normalizePost,
};
