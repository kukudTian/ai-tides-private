const { toAsciiSlug, sanitizeHtml } = require('./utils');

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
  const title = String((input && input.title) || '').trim();
  const sections = Array.isArray(input.sections)
    ? input.sections.map((s) => ({
        heading: String(s.heading || '').trim(),
        body: sanitizeHtml(String(s.body || '')),
      }))
    : [];
  if (input && input.html) {
    sections.push({ heading: '正文', body: sanitizeHtml(String(input.html)) });
  }
  const slug = input.slug ? toAsciiSlug(input.slug) : toAsciiSlug(title);
  const categorySlug = LEGACY_CATEGORY_SLUGS[(input && input.category)] || (input && input.category);
  const category = CATEGORIES.find((c) => c.slug === categorySlug || c.name === (input && input.category));
  let publishedAt = (input && (input.publishedAt || input.publishAt)) || now;
  const parsed = new Date(publishedAt);
  if (!Number.isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
  const status = String((input && input.status) || '').trim();
  const isFuture = !Number.isNaN(parsed.getTime()) && parsed.getTime() > new Date(now).getTime();
  const resolvedStatus =
    status === 'draft' || status === 'scheduled'
      ? status
      : status === 'published'
        ? 'published'
        : isFuture
          ? 'scheduled'
          : 'published';
  const resolvedCategory = category ? category.slug : 'ai-tools';
  const hotScore = Number((input && input.hotScore) || 0) || 0;
  return {
    id: (input && input.id) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    slug,
    title,
    subtitle: String((input && input.subtitle) || '').trim(),
    category: resolvedCategory,
    categoryName: category ? category.name : 'AI工具',
    kind: resolvedCategory === 'ai-news' ? 'news' : 'tool',
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    summary: String((input && input.summary) || '').trim(),
    sections,
    faq: Array.isArray(input.faq)
      ? input.faq.map((f) => ({ q: String(f.q || '').trim(), a: String(f.a || '').trim() }))
      : [],
    officialUrl: String((input && input.officialUrl) || '').trim(),
    recommendUrl: String((input && input.recommendUrl) || '').trim(),
    recommendNote: String((input && input.recommendNote) || '').trim(),
    sourceUrl: String((input && input.sourceUrl) || '').trim(),
    screenshots: Array.isArray(input.screenshots) ? input.screenshots.map(String) : [],
    cover: (input && input.cover) || { letter: (title.slice(0, 1) || 'A').toUpperCase(), color: '#e5484d' },
    hotScore,
    featured: Boolean(input && input.featured),
    status: resolvedStatus,
    publishedAt,
    createdAt: (input && input.createdAt) || now,
    updatedAt: now,
  };
}

function applyReferrals(posts, referrals) {
  const map = referrals || {};
  return posts.map((p) => {
    const url = String(map[p.slug] || p.recommendUrl || '').trim();
    const note = String(map[`${p.slug}:note`] || p.recommendNote || '').trim();
    return url ? { ...p, recommendUrl: url, recommendNote: note } : p;
  });
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
  const published = getPublished(posts);
  const sameCategory = published.filter((p) => p.category === post.category && p.slug !== post.slug);
  const sameTags = published.filter(
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
    ].join(' ').toLowerCase();
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

module.exports = {
  CATEGORIES,
  normalizePost,
  applyReferrals,
  getPublished,
  getScheduled,
  bySlug,
  relatedPosts,
  neighbors,
  searchPosts,
  allTags,
  categoryStats,
};
