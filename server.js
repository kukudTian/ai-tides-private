const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const store = require('./lib/store');
const { escapeXml, escapeHtml, headingId, stripHtml } = require('./lib/utils');
const sessionAuth = require('./lib/session-auth');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const SITE_NAME = process.env.SITE_NAME || 'AI 潮汐';
const SITE_TAGLINE = process.env.SITE_TAGLINE || '实时追踪 AI 热点，不错过每一个值得关注的新变化';
const ADSENSE_CLIENT = process.env.ADSENSE_CLIENT || '';
const GOOGLE_ANALYTICS_ID = process.env.GOOGLE_ANALYTICS_ID || 'G-WXMJ6STTQV';
const ADSENSE_SLOTS = (() => {
  try { return process.env.ADSENSE_SLOTS ? JSON.parse(process.env.ADSENSE_SLOTS) : {}; }
  catch { return {}; }
})();
  const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '1534838732@qq.com';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

let posts = store.rebuildIfNeeded();

function commonLocals(req) {
  return {
    siteUrl: SITE_URL,
    siteName: SITE_NAME,
    siteTagline: SITE_TAGLINE,
    pageTitle: '',
    pageDescription: '',
    canonical: SITE_URL,
    jsonLd: undefined,
    year: new Date().getFullYear(),
    categories: store.categoryStats(posts),
    tags: store.allTags(posts).slice(0, 16),
    adsenseClient: ADSENSE_CLIENT,
    googleAnalyticsId: GOOGLE_ANALYTICS_ID,
    adsenseSlots: ADSENSE_SLOTS,
    contactEmail: CONTACT_EMAIL,
    currentPath: req.path,
  };
}

async function renderPage(res, view, data = {}) {
  const body = await new Promise((resolve, reject) => {
    res.render(view, data, (err, html) => (err ? reject(err) : resolve(html)));
  });
  res.render('layout', { ...data, body });
}

function articleJsonLd(post) {
  const url = `${SITE_URL}/tool/${post.slug}/`;
  const faq = (post.faq || []).map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  }));
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: post.title,
        description: post.summary,
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
        url,
        author: { '@type': 'Organization', name: SITE_NAME },
        publisher: { '@type': 'Organization', name: SITE_NAME },
        mainEntityOfPage: url,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: post.categoryName, item: `${SITE_URL}/category/${post.category}/` },
          { '@type': 'ListItem', position: 3, name: post.title, item: url },
        ],
      },
      ...(faq.length ? [{ '@type': 'FAQPage', mainEntity: faq }] : []),
    ],
  };
}

function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

function publishApiKey(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function requireAuth(req, res) {
  const key = publishApiKey(req);
  if (!key || !sessionAuth.authenticateApiKey(key)) {
    res.status(401).json({ ok: false, error: '无效或缺失的发布密钥' });
    return false;
  }
  return true;
}

function postUrl(post) {
  return `${SITE_URL}/tool/${post.slug}/`;
}

function toolSort(a, b) {
  const aRef = a.recommendUrl ? 1 : 0;
  const bRef = b.recommendUrl ? 1 : 0;
  if (aRef !== bRef) return bRef - aRef;
  if (Number(a.featured) !== Number(b.featured)) return Number(b.featured) - Number(a.featured);
  if ((b.hotScore || 0) !== (a.hotScore || 0)) return (b.hotScore || 0) - (a.hotScore || 0);
  return new Date(b.publishedAt) - new Date(a.publishedAt);
}

app.get('/', async (req, res, next) => {
  try {
    const published = store.getPublished(posts);
    const newsPosts = published.filter((p) => p.kind === 'news').slice(0, 6);
    const allToolPosts = published.filter((p) => p.kind === 'tool').sort(toolSort);
    const toolPosts = allToolPosts.slice(0, 8);
    const featuredTools = allToolPosts.filter((p) => p.featured).slice(0, 4);
    const hotTools = allToolPosts.slice(0, 8);
    await renderPage(res, 'home', {
      ...commonLocals(req),
      pageTitle: `${SITE_NAME} - ${SITE_TAGLINE}`,
      pageDescription: '实时追踪值得关注的 AI 热点与工具：模型发布、Agent 生态、厂商动态，附官网与上手指南。',
      canonical: SITE_URL + '/',
      newsPosts,
      toolPosts,
      featuredTools,
      hotTools,
      totalCount: published.length,
      jsonLd: JSON.stringify(websiteJsonLd()).replace(/</g, '\\u003c'),
    });
  } catch (err) {
    next(err);
  }
});

app.get('/tool/:slug', async (req, res, next) => {
  try {
    const post = store.bySlug(posts, req.params.slug);
    if (!post) return res.status(404).render('layout', { ...commonLocals(req), body: '<main class="page-404"><h1>未找到该内容</h1><p>可能已经被删除或还没有收录。</p></main>' });
    const published = store.getPublished(posts);
    const related = store.relatedPosts(posts, post);
    const { prev, next: nextPost } = store.neighbors(posts, post);
    const latest = published.slice(0, 8);
    const toc = (post.sections || []).map((s, i) => ({ id: headingId(i), heading: s.heading }));
    await renderPage(res, 'tool', {
      ...commonLocals(req),
      pageTitle: `${post.title} - ${SITE_NAME}`,
      pageDescription: post.summary || stripHtml((post.sections || []).map((s) => s.body).join(' ')).slice(0, 160),
      canonical: postUrl(post),
      post,
      toc,
      related,
      latest,
      prev,
      next: nextPost,
      jsonLd: JSON.stringify(articleJsonLd(post)).replace(/</g, '\\u003c'),
    });
  } catch (err) {
    next(err);
  }
});

app.get('/category/:slug', async (req, res, next) => {
  try {
    const legacyRedirects = {
      'ai-chat': 'ai-tools',
      'ai-coding': 'ai-tools',
      'ai-agent': 'ai-tools',
      'ai-writing': 'ai-tools',
      'ai-image': 'ai-tools',
      'ai-video': 'ai-tools',
      'ai-office': 'ai-tools',
      'ai-model': 'ai-tools',
    };
    if (legacyRedirects[req.params.slug]) {
      return res.redirect(301, `/category/${legacyRedirects[req.params.slug]}/`);
    }
    const category = store.CATEGORIES.find((c) => c.slug === req.params.slug);
    if (!category) return res.status(404).render('layout', { ...commonLocals(req), body: '<main class="page-404"><h1>未找到该分类</h1></main>' });
    const items = store.getPublished(posts).filter((p) => p.category === category.slug);
    if (category.slug === 'ai-tools') items.sort(toolSort);
    await renderPage(res, 'list', {
      ...commonLocals(req),
      pageTitle: `${category.name} - ${SITE_NAME}`,
      pageDescription: `浏览 ${category.name} 分类下的最新 AI 资讯与工具内容。`,
      canonical: `${SITE_URL}/category/${category.slug}/`,
      title: category.name,
      subtitle: category.slug === 'ai-news'
        ? '模型发布、Agent 生态与厂商动态，帮你快速跟上 AI 新变化。'
        : '只收录真正值得用起来的 AI 产品，官网与上手路径一次讲清。',
      items,
      emptyText: category.slug === 'ai-news'
        ? '该分类暂时还没有资讯，稍后再来看看。'
        : '该分类暂时还没有工具，稍后再来看看。',
    });
  } catch (err) {
    next(err);
  }
});

app.get('/tag/:slug', async (req, res, next) => {
  try {
    const tag = store.allTags(posts).find((t) => t.name === req.params.slug || t.slug === req.params.slug);
    if (!tag) return res.status(404).render('layout', { ...commonLocals(req), body: '<main class="page-404"><h1>未找到该标签</h1></main>' });
    const items = store.getPublished(posts).filter((p) => (p.tags || []).includes(tag.name));
    await renderPage(res, 'list', {
      ...commonLocals(req),
      pageTitle: `标签：${tag.name} - ${SITE_NAME}`,
      pageDescription: `浏览标签 ${tag.name} 下的最新内容。`,
      canonical: `${SITE_URL}/tag/${tag.slug}/`,
      title: tag.name,
      subtitle: `共 ${items.length} 篇文章`,
      items,
      emptyText: '该标签下暂时没有内容。',
    });
  } catch (err) {
    next(err);
  }
});

app.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const items = store.searchPosts(posts, q);
    await renderPage(res, 'list', {
      ...commonLocals(req),
      pageTitle: q ? `搜索：${q} - ${SITE_NAME}` : `搜索 - ${SITE_NAME}`,
      pageDescription: q ? `搜索“${q}”的结果` : '搜索本站收录的 AI 工具。',
      canonical: q ? `${SITE_URL}/search/?q=${encodeURIComponent(q)}` : `${SITE_URL}/search/`,
      title: q ? `搜索“${q}”` : '搜索',
      subtitle: q ? `找到 ${items.length} 条结果` : '输入关键词查找 AI 工具',
      items,
      emptyText: q ? `没有找到与“${q}”相关的内容，换个关键词试试。` : '输入关键词开始搜索。',
    });
  } catch (err) {
    next(err);
  }
});

const INFO_PAGES = {
  '/about': {
    eyebrow: '关于我们',
    title: '关于 AI 潮汐',
    lead: 'AI 潮汐是一个聚焦 AI 资讯与工具的站点：持续跟进模型、Agent 与厂商的重要变化，并收录真正值得用起来的 AI 产品。',
    content: `
<section class="section-block section-block--first">
  <h2>关于本站</h2>
  <p>AI 潮汐持续收录值得用的 AI 工具，并跟进 AI 行业的实时热点。工具库覆盖对话助手、模型平台、生图生视频、编程与 Agent 等方向，每篇都附官网直达与上手路径；资讯则关注模型发布、厂商动态与机会型变化。</p>
  <p>收录的产品以官方信息和公开资料为准，展示顺序独立判断，不随商业合作改变。我们筛选噪声，只留下值得关注的变化，帮你更快看懂 AI 世界正在发生什么。</p>
</section>
<section class="section-block">
  <h2>内容标准</h2>
  <ul>
    <li>来源优先：资讯和工具页尽量锚定官方公告、官方文档或公开信息，并保留原始链接供读者核对。</li>
    <li>原创解读：每篇文章都会补充事件背景、行业影响、适用场景和行动建议，而不是简单转载官方摘要。</li>
    <li>及时纠错：发现信息偏差可通过 <a href="/contact/">联系我们</a> 提交，核对后会更新文章并保留来源。</li>
    <li>AI 辅助透明：部分内容使用 AI 辅助整理，编辑负责核对关键事实、结构与可读性。</li>
  </ul>
</section>
<section class="section-block">
  <h2>为什么关注我们</h2>
  <ul>
    <li>热点速递：模型与行业动态持续更新。</li>
    <li>精选优先：过滤噪音，只留值得关注的变化。</li>
    <li>上手可用：工具附官网与真实使用路径。</li>
    <li>可验证：每篇资讯和工具都保留官网、原文或来源入口。</li>
  </ul>
</section>
<section class="section-block">
  <h2>联系我们</h2>
  <ul class="plain-list">
    <li>合作与收录：到 <a href="/partner/">收录与合作</a> 页面提交。</li>
    <li>邮箱：<a href="mailto:contact@ai-blog.cloud">contact@ai-blog.cloud</a></li>
  </ul>
  <p>我们会在收到信息后尽快回复。涉及付费的合作都会先确认方案再加入。</p>
</section>
<section class="section-block">
  <h2>隐私政策</h2>
  <p>本站主要提供公开内容浏览，不要求注册或登录。仅在您主动填写收录申请、联系表单时，我们会收到您提供的名称、联系方式与产品信息，用于处理申请与回复。</p>
  <p>本站在获得 Google / Microsoft 广告授权后可能展示广告，广告服务商会使用 Cookie 或类似技术来提供与您相关的广告。您可以在浏览器设置中管理相关偏好。</p>
  <p>提交的信息仅用于收录审核、回复与合作确认，不会出售或用于无关推广。您可以随时通过 <a href="/contact/">联系我们</a> 要求查看、更正或删除已提交的个人信息。</p>
</section>
<section class="section-block">
  <h2>服务条款</h2>
  <p>本站收录的工具与资讯仅供参考，信息以官方发布为准。我们尽量保证准确性，但不承诺内容绝对无误，不对因依赖本站信息产生的损失负责。</p>
  <p>产品页与文章中的外部链接来自第三方网站，访问与使用风险由第三方承担。本站原创内容版权归本站所有；第三方商标、图标与截图归其各自权利人所有，仅用于介绍与展示。</p>
</section>`,
  },
  '/contact': {
    eyebrow: '联系我们',
    title: '联系我们',
    lead: '有合作、收录或功能建议，欢迎通过以下方式与我们沟通。',
    content: `
<section class="section-block section-block--first">
  <h2>联系方式</h2>
  <ul class="plain-list">
    <li>邮箱：contact@ai-blog.cloud</li>
    <li>合作收录：到 <a href="/partner/">收录与合作</a> 页面提交。</li>
  </ul>
  <p>我们会在收到信息后尽快回复。涉及付费的合作都会先确认方案再加入，请您留意甄别。</p>
</section>
<section class="section-block">
  <h2>纠错与建议</h2>
  <p>如果你发现文章中的事实、价格、链接或产品信息有误，请把页面链接和正确信息发送到 <a href="mailto:contact@ai-blog.cloud">contact@ai-blog.cloud</a>，我们会核对来源并尽快修订。</p>
</section>`,
  },
  '/privacy': {
    eyebrow: '隐私政策',
    title: '隐私政策',
    lead: '我们尽量少收集数据，并清楚说明用途。请在使用本站前阅读本政策。',
    content: `
<section class="section-block section-block--first">
  <h2>我们收集什么</h2>
  <p>本站主要提供公开内容浏览，不要求注册或登录。仅在您主动填写收录申请、联系表单时，我们会收到您提供的名称、联系方式与产品信息，用于处理申请与回复。</p>
</section>
<section class="section-block">
  <h2>访问统计</h2>
  <p>本站会记录去标识化的页面访问统计，例如访问日期、来源类型和页面浏览情况，用于了解内容质量并改进站点。我们不会将这类统计用于识别个人身份。</p>
  <p>本站使用 Google Analytics 了解页面访问情况，它可能通过 Cookie 或类似技术收集访问数据。你可以通过浏览器设置管理相关偏好。</p>
</section>
<section class="section-block">
  <h2>第三方服务</h2>
  <p>本站在获得 Google / Microsoft 广告授权后可能展示广告，广告服务商会使用 Cookie 或类似技术来提供与您相关的广告。您可以在浏览器设置中管理相关偏好。</p>
</section>
<section class="section-block">
  <h2>数据用途与安全</h2>
  <p>提交的信息仅用于收录审核、回复与合作确认，不会出售或用于无关推广。我们采取合理措施保护这些信息，但任何网络传输都无法保证绝对安全。</p>
</section>
<section class="section-block">
  <h2>您的权利</h2>
  <p>您可以随时通过 <a href="/contact/">联系我们</a> 要求查看、更正或删除您提交的个人信息。</p>
</section>`,
  },
  '/terms': {
    eyebrow: '服务条款',
    title: '服务条款',
    lead: '使用本站即表示您同意以下条款，请在使用前阅读。',
    content: `
<section class="section-block section-block--first">
  <h2>内容与免责声明</h2>
  <p>本站收录的工具与资讯仅供参考，信息以官方发布为准。我们尽量保证准确性，但不承诺内容绝对无误，不对因依赖本站信息产生的损失负责。</p>
</section>
<section class="section-block">
  <h2>外部链接</h2>
  <p>产品页与文章中的外部链接来自第三方网站，访问与使用风险由第三方承担。</p>
</section>
<section class="section-block">
  <h2>知识产权</h2>
  <p>本站原创内容版权归本站所有；第三方商标、图标与截图归其各自权利人所有，仅用于介绍与展示。</p>
</section>
<section class="section-block">
  <h2>条款变更</h2>
  <p>我们可能不定期更新本条款，变更后会在本页生效。继续使用本站即视为接受更新后的条款。</p>
</section>`,
  },
};

app.get(['/partner', '/partner/'], async (req, res, next) => {
  try {
    const locals = commonLocals(req);
    await renderPage(res, 'partner', {
      ...locals,
      pageTitle: `收录与合作 - ${SITE_NAME}`,
      pageDescription: '提交你的 AI 工具或中转站，获取独立页面、分类曝光与官网直达入口。',
      canonical: `${SITE_URL}/partner/`,
      currentPath: '/partner/',
    });
  } catch (err) {
    next(err);
  }
});

app.get(['/about/', '/contact/', '/privacy/', '/terms/'], async (req, res, next) => {
  try {
    const conf = INFO_PAGES[req.path.replace(/\/+$/, '')];
    if (!conf) return next();
    const locals = commonLocals(req);
    await renderPage(res, 'info', {
      ...locals,
      pageTitle: `${conf.title} - ${SITE_NAME}`,
      pageDescription: conf.lead,
      canonical: `${SITE_URL}${req.path.replace(/\/+$/, '')}/`,
      currentPath: req.path.replace(/\/+$/, '') + '/',
      eyebrow: conf.eyebrow,
      title: conf.title,
      lead: conf.lead,
      content: conf.content,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/rss.xml', (req, res) => {
  const items = store.getPublished(posts)
    .slice(0, 50)
    .map((p) => {
      const text = stripHtml((p.sections || []).map((s) => s.body).join(' '));
      return `    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${escapeXml(postUrl(p))}</link>
      <guid isPermaLink="true">${escapeXml(postUrl(p))}</guid>
      <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[${p.summary || text.slice(0, 300)}]]></description>
    </item>`;
    })
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>${escapeXml(SITE_TAGLINE)}</description>
    <language>zh-cn</language>
${items}
  </channel>
</rss>`;
  res.type('application/rss+xml').send(xml);
});

app.get('/sitemap.xml', (req, res) => {
  const urlset = [
    { loc: SITE_URL + '/', lastmod: new Date().toISOString().slice(0, 10) },
    { loc: `${SITE_URL}/partner/`, lastmod: new Date().toISOString().slice(0, 10) },
    { loc: `${SITE_URL}/about/`, lastmod: new Date().toISOString().slice(0, 10) },
    { loc: `${SITE_URL}/contact/`, lastmod: new Date().toISOString().slice(0, 10) },
    { loc: `${SITE_URL}/privacy/`, lastmod: new Date().toISOString().slice(0, 10) },
    { loc: `${SITE_URL}/terms/`, lastmod: new Date().toISOString().slice(0, 10) },
    ...store.CATEGORIES.filter((c) => store.getPublished(posts).some((p) => p.category === c.slug))
      .map((c) => ({ loc: `${SITE_URL}/category/${c.slug}/`, lastmod: new Date().toISOString().slice(0, 10) })),
    ...store.getPublished(posts).map((p) => ({
      loc: postUrl(p),
      lastmod: (p.updatedAt || p.publishedAt).slice(0, 10),
    })),
  ]
    .map((u) => `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlset}\n</urlset>`;
  res.type('application/xml').send(xml);
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

app.get('/ads.txt', (req, res) => {
  const lines = process.env.ADS_TXT || [
    'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0',
    'microsoft.com, pub-0000000000000000, DIRECT, 000000000000',
  ].join('\n');
  res.type('text/plain').send(lines);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, posts: posts.length, published: store.getPublished(posts).length, scheduled: store.getScheduled(posts).length });
});

app.get('/api/posts', (req, res) => {
  const published = store.getPublished(posts);
  const limit = Math.min(Number(req.query.limit) || published.length, 100);
  const items = published.slice(0, limit).map((p) => ({
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    kind: p.kind || (p.category === 'ai-news' ? 'news' : 'tool'),
    category: p.category,
    categoryName: p.categoryName,
    tags: p.tags,
    officialUrl: p.officialUrl,
    recommendUrl: p.recommendUrl,
    sourceUrl: p.sourceUrl,
    publishedAt: p.publishedAt,
    url: postUrl(p),
  }));
  res.json({ ok: true, count: items.length, items });
});

function newsInputError(body) {
  if (!body || typeof body !== 'object') return '请求体必须是 JSON 对象';
  if (!String(body.title || '').trim()) return '缺少 title';
  if (!Array.isArray(body.sections) && !String(body.html || '').trim()) return '缺少 sections 或 html';
  const category = String(body.category || '').trim().toLowerCase();
  if (category !== 'ai-news' && category !== 'ai资讯') {
    return '发布接口只接受 AI资讯（category: ai-news），AI工具由人工维护';
  }
  return null;
}

function newsBody(input) {
  const body = input && typeof input === 'object' ? { ...input } : input;
  if (body && !String(body.category || '').trim()) body.category = 'ai-news';
  return body;
}

function handleCreatePost(req, res) {
  if (!requireAuth(req, res)) return;
  const body = newsBody(req.body && req.body.post ? req.body.post : req.body);
  const error = newsInputError(body);
  if (error) return res.status(400).json({ ok: false, error });
  const post = store.upsertPost(posts, body);
  res.status(201).json({ ok: true, slug: post.slug, url: postUrl(post), status: post.status });
}

app.post('/api/posts', handleCreatePost);
app.post('/api/hooks/xiaolongxia', handleCreatePost);

app.post('/api/posts/batch', (req, res) => {
  if (!requireAuth(req, res)) return;
  const items = Array.isArray(req.body) ? req.body : Array.isArray(req.body && req.body.posts) ? req.body.posts : null;
  if (!items || !items.length) {
    return res.status(400).json({ ok: false, error: '请求体必须是 post 数组' });
  }
  const created = [];
  const errors = [];
  items.forEach((item, index) => {
    try {
      const normalized = newsBody(item);
      const error = newsInputError(normalized);
      if (error) throw new Error(error);
      const post = store.upsertPost(posts, normalized);
      created.push({ index, slug: post.slug, status: post.status });
    } catch (err) {
      errors.push({ index, error: err.message });
    }
  });
  res.json({ ok: true, created, errors });
});

app.delete('/api/posts/:slug', (req, res) => {
  if (!requireAuth(req, res)) return;
  const index = posts.findIndex((p) => p.slug === req.params.slug);
  if (index < 0) return res.status(404).json({ ok: false, error: '未找到该文章' });
  const [removed] = posts.splice(index, 1);
  if (removed.category !== 'ai-news') {
    posts.splice(index, 0, removed);
    return res.status(403).json({ ok: false, error: '接口只能删除 AI资讯，AI工具由人工维护' });
  }
  store.savePosts(posts);
  res.json({ ok: true, removed: removed.slug });
});

function formatAdminDate(iso) {
  const d = new Date(iso || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  if (Number.isNaN(d.getTime())) return String(iso || '');
  const t = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

function linkifyLogText(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(
    /(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>'
  );
}

function workerLogEntries(maxLines = 30) {
  const logFile = path.join(__dirname, 'logs', 'xiaolongxia.log');
  let raw = '';
  try {
    raw = fs.readFileSync(logFile, 'utf8');
  } catch {
    return [];
  }
  const lines = raw.split(/\r?\n/).filter(Boolean).slice(-maxLines);
  return lines.map((line) => {
    const match = line.match(/^\[(.+?)\] (.*)$/);
    const text = match ? match[2] : line;
    const time = match && !Number.isNaN(new Date(match[1]).getTime()) ? formatAdminDate(match[1]) : '';
    let kind = 'info';
    if (/WARN/.test(text)) kind = 'warn';
    else if (/ERROR|失败/.test(text)) kind = 'error';
    else if (/已发布/.test(text)) kind = 'published';
    return { time, text, html: linkifyLogText(text), kind };
  });
}

function sourceLabel(post) {
  const url = post.kind === 'news' ? post.sourceUrl : post.officialUrl;
  if (!url) return '';
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function renderAdmin(res, view, data = {}) {
  return res.render(view, {
    siteName: SITE_NAME,
    siteUrl: SITE_URL,
    adminError: '',
    adminNotice: '',
    ...data,
  });
}

function dashboardLocals(req, extra = {}) {
  const published = store.getPublished(posts);
  const scheduled = store.getScheduled(posts);
  const newsPosts = published.filter((p) => p.kind === 'news');
  const toolPosts = published.filter((p) => p.kind === 'tool');
  const apiKeys = sessionAuth.listApiKeys().map((k) => ({
    ...k,
    createdAtText: formatAdminDate(k.createdAt),
    lastUsedAtText: k.lastUsedAt ? formatAdminDate(k.lastUsedAt) : '从未使用',
    revokedAtText: k.revokedAt ? formatAdminDate(k.revokedAt) : '',
  }));
  return {
    page: 'dashboard',
    csrf: sessionAuth.csrfToken(Date.now()),
    stats: {
      publishedNews: newsPosts.length,
      scheduled: scheduled.length,
      tools: toolPosts.length,
    },
    workerLog: workerLogEntries(30),
    newsPosts: newsPosts.map((p) => ({
      post: p,
      publishedAt: formatAdminDate(p.publishedAt),
      updatedAt: formatAdminDate(p.updatedAt),
      source: sourceLabel(p),
    })),
    scheduledPosts: scheduled
      .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt))
      .map((p) => ({
        post: p,
        publishedAt: formatAdminDate(p.publishedAt),
        updatedAt: formatAdminDate(p.updatedAt),
        source: sourceLabel(p),
      })),
    toolPosts: toolPosts.map((p) => ({
      post: p,
      updatedAt: formatAdminDate(p.updatedAt),
      source: sourceLabel(p),
    })),
    apiKeys,
    newKey: null,
    ...extra,
  };
}

function adminGuard(req, res) {
  if (!sessionAuth.isAdminSession(req)) {
    if (req.accepts('html')) {
      res.redirect('/admin/login');
      return false;
    }
    res.status(401).json({ ok: false, error: '管理会话已失效' });
    return false;
  }
  if (!sessionAuth.isCsrfValid(req)) {
    if (req.accepts('html')) {
      renderAdmin(res, 'admin', dashboardLocals(req, { adminError: '表单校验未通过，请刷新页面后重试' }));
      return false;
    }
    res.status(403).json({ ok: false, error: 'CSRF 校验未通过' });
    return false;
  }
  return true;
}

app.get('/admin', (req, res) => {
  if (!sessionAuth.isAdminSession(req)) return res.redirect('/admin/login');
  return renderAdmin(res, 'admin', dashboardLocals(req));
});

app.get('/admin/login', (req, res) => {
  if (sessionAuth.isAdminSession(req)) return res.redirect('/admin');
  return renderAdmin(res, 'admin', {
    page: 'login',
    needsSetup: !sessionAuth.hasAdmin(),
  });
});

app.post('/admin/login', (req, res) => {
  const password = String(req.body.password || '');
  if (!sessionAuth.hasAdmin()) {
    const confirm = String(req.body.confirm || '');
    if (password.length < 8) {
      return renderAdmin(res, 'admin', {
        page: 'login',
        needsSetup: true,
        adminError: '密码至少需要 8 位',
      });
    }
    if (password !== confirm) {
      return renderAdmin(res, 'admin', {
        page: 'login',
        needsSetup: true,
        adminError: '两次输入的密码不一致',
      });
    }
    try {
      sessionAuth.setupAdmin(password);
    } catch (err) {
      return renderAdmin(res, 'admin', { page: 'login', needsSetup: true, adminError: err.message });
    }
    sessionAuth.createSession(req, res);
    return res.redirect('/admin');
  }
  if (!sessionAuth.verifyAdminPassword(password)) {
    return renderAdmin(res, 'admin', {
      page: 'login',
      needsSetup: false,
      adminError: '密码不正确，请重新输入',
    });
  }
  sessionAuth.createSession(req, res);
  return res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  sessionAuth.clearSession(res);
  return res.redirect('/admin/login');
});

app.post('/admin/password', (req, res) => {
  if (!adminGuard(req, res)) return;
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.nextPassword || '');
  const confirm = String(req.body.confirmPassword || '');
  if (next.length < 8) {
    return renderAdmin(res, 'admin', dashboardLocals(req, { adminError: '新密码至少需要 8 位' }));
  }
  if (next !== confirm) {
    return renderAdmin(res, 'admin', dashboardLocals(req, { adminError: '两次输入的新密码不一致' }));
  }
  try {
    sessionAuth.changeAdminPassword(current, next);
  } catch (err) {
    return renderAdmin(res, 'admin', dashboardLocals(req, { adminError: err.message }));
  }
  sessionAuth.clearSession(res);
  return res.redirect('/admin/login');
});

app.post('/admin/api-keys', (req, res) => {
  if (!adminGuard(req, res)) return;
  const name = String(req.body.name || '').trim();
  const result = sessionAuth.createApiKey(name);
  return renderAdmin(res, 'admin', dashboardLocals(req, {
    adminNotice: '密钥已创建，请立即复制保存；关闭本页面后服务器不会再显示完整密钥。',
    newKey: { name: result.record.name, key: result.key },
  }));
});

app.post('/admin/api-keys/:id/revoke', (req, res) => {
  if (!adminGuard(req, res)) return;
  const ok = sessionAuth.revokeApiKey(req.params.id);
  return renderAdmin(res, 'admin', dashboardLocals(req, {
    adminNotice: ok ? '密钥已吊销，小龙虾再用这个密钥发布会被拒绝。' : '未找到该密钥。',
  }));
});

app.post('/admin/posts/:slug/delete', (req, res) => {
  if (!adminGuard(req, res)) return;
  const index = posts.findIndex((p) => p.slug === req.params.slug);
  if (index < 0) {
    if (req.accepts('html')) return res.redirect('/admin');
    return res.status(404).json({ ok: false, error: '未找到该文章' });
  }
  const [removed] = posts.splice(index, 1);
  if (removed.category !== 'ai-news') {
    posts.splice(index, 0, removed);
    if (req.accepts('html')) return res.redirect('/admin');
    return res.status(403).json({ ok: false, error: '只能删除 AI 资讯，AI 工具由人工维护' });
  }
  store.savePosts(posts);
  if (req.accepts('html')) return res.redirect('/admin');
  return res.json({ ok: true, removed: removed.slug });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: '接口不存在' });
  }
  res.status(404).render('layout', { ...commonLocals(req), body: '<main class="page-404"><h1>404</h1><p>页面不存在。</p><a class="btn" href="/">返回首页</a></main>' });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ ok: false, error: '服务器内部错误' });
  }
  res.status(500).render('layout', { ...commonLocals(req), body: '<main class="page-404"><h1>服务器开小差了</h1><p>请稍后再试。</p></main>' });
});

setInterval(() => {
  const changed = store.publishDue(posts);
  if (changed) console.log(`[scheduler] published due posts at ${new Date().toISOString()}`);
}, 60 * 1000);

function start(port) {
  const server = app.listen(port, () => {
    console.log(`${SITE_NAME} running at http://localhost:${port}`);
    console.log(`Admin: ${SITE_URL}/admin`);
    console.log(`Publish API: POST ${SITE_URL}/api/posts (Authorization: Bearer <API key>)`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < PORT + 10) {
      console.log(`port ${port} busy, trying ${port + 1}`);
      start(port + 1);
    } else {
      throw err;
    }
  });
}

if (require.main === module) {
  start(PORT);
}

module.exports = { app, start, PORT };
