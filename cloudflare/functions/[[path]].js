// AI 潮汐 Pages Function: dynamic SSR + admin + publish API on Cloudflare Pages + D1.
const db = require('./_lib/db');
const postsLib = require('./_lib/posts');
const auth = require('./_lib/auth');
const views = require('./_lib/views');
const utils = require('./_lib/utils');
const { sendEmail } = require('./_lib/email');
const seedPosts = require('./_data/seed-posts.json');
const referrals = require('./_data/referrals.json');

const LEGACY_CATEGORY_REDIRECTS = {
  'ai-chat': 'ai-tools',
  'ai-coding': 'ai-tools',
  'ai-agent': 'ai-tools',
  'ai-writing': 'ai-tools',
  'ai-image': 'ai-tools',
  'ai-video': 'ai-tools',
  'ai-office': 'ai-tools',
  'ai-model': 'ai-tools',
};

const STATIC_PATHS = [
  '/icons/',
  '/screenshots/',
  '/vendor/',
  '/favicon.svg',
  '/styles.css',
  '/app.js',
  '/admin.css',
];

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

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const database = env.DB;
    if (!database) {
      return utils.json(
        { ok: false, error: 'D1 数据库未绑定，请在 Cloudflare Pages 项目设置中绑定名为 DB 的 D1 数据库。' },
        500
      );
    }
    await db.ensureSchema(database);
    await db.publishDue(database);
    await db.seedIfNeeded(database, seedPosts);
    return await route(context, database);
  } catch (err) {
    console.error('ai-tides function error:', err);
    let pathname = '/';
    try {
      pathname = new URL(request.url).pathname;
    } catch {}
    if (pathname.startsWith('/api/')) {
      return utils.json({ ok: false, error: '服务器内部错误' }, 500);
    }
    const siteName = String(env.SITE_NAME || 'AI 潮汐');
    const body =
      '<main class="page-404"><h1>服务器开小差了</h1><p>请稍后再试。</p>' +
      '<a class="btn" href="/">返回首页</a></main>';
    return utils.html(
      views.renderTemplate('layout', {
        body,
        siteName,
        siteUrl: siteUrl(env, request),
        siteTagline: String(env.SITE_TAGLINE || '实时追踪 AI 热点，不错过每一个值得关注的新变化'),
        pageTitle: '服务器暂时不可用',
        pageDescription: '服务器暂时不可用，请稍后再试。',
        canonical: siteUrl(env, request),
        currentPath: pathname,
        categories: [],
        tags: [],
        year: new Date().getUTCFullYear(),
        adsenseClient: '',
        googleAnalyticsId: String(env.GOOGLE_ANALYTICS_ID || 'G-WXMJ6STTQV'),
        adsenseSlots: {},
      }),
      500,
      { 'cache-control': 'no-store' }
    );
  }
}

function siteUrl(env, request) {
  const raw = String(env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (raw) return raw;
  try {
    return new URL(request.url).origin;
  } catch {
    return 'https://ai-blog.cloud';
  }
}

function siteConfig(env, request) {
  return {
    siteUrl: siteUrl(env, request),
    siteName: String(env.SITE_NAME || 'AI 潮汐'),
    siteTagline: String(env.SITE_TAGLINE || '实时追踪 AI 热点，不错过每一个值得关注的新变化'),
    adsenseClient: String(env.ADSENSE_CLIENT || ''),
    googleAnalyticsId: String(env.GOOGLE_ANALYTICS_ID || 'G-WXMJ6STTQV'),
    adsenseSlots: parseJson(env.ADSENSE_SLOTS, {}),
    adsTxt:
      String(env.ADS_TXT || '').trim() ||
      [
        'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0',
        'microsoft.com, pub-0000000000000000, DIRECT, 000000000000',
      ].join('\n'),
  };
}

function parseJson(value, fallback) {
  if (typeof value === 'object' && value !== null) return value;
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toolSort(a, b) {
  const aRef = a.recommendUrl ? 1 : 0;
  const bRef = b.recommendUrl ? 1 : 0;
  if (aRef !== bRef) return bRef - aRef;
  if (Number(a.featured) !== Number(b.featured)) return Number(b.featured) - Number(a.featured);
  if ((b.hotScore || 0) !== (a.hotScore || 0)) return (b.hotScore || 0) - (a.hotScore || 0);
  return new Date(b.publishedAt) - new Date(a.publishedAt);
}

async function route(context, database) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.startsWith('/api/')) {
    return apiRoute(context, database, url);
  }

  if (path === '/admin' || path.startsWith('/admin/')) {
    return adminRoute(context, database, url);
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    const asset = await tryStaticAsset(env, request);
    if (asset) return asset;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return utils.json({ ok: false, error: '方法不允许' }, 405);
  }

  const config = siteConfig(env, request);
  const posts = await db.listPosts(database);
  const published = postsLib.getPublished(posts);
  const pathname = path.length > 1 ? path.replace(/\/+$/, '') : path;
  await maybeRecordPageVisit(context, database, url, path, pathname);

  if (path === '/' || path === '') {
    return renderHome(env, request, config, published);
  }

  if (pathname === '/search') {
    return renderSearch(env, request, config, published, url);
  }

  let match;
  if ((match = pathname.match(/^\/category\/([^/]+)$/))) {
    return renderCategory(env, request, config, posts, match[1]);
  }
  if ((match = pathname.match(/^\/tool\/([^/]+)$/))) {
    return renderTool(env, request, config, posts, match[1]);
  }
  if ((match = pathname.match(/^\/tag\/([^/]+)$/))) {
    return renderTag(env, request, config, posts, match[1]);
  }

  if (path === '/rss.xml') return renderRss(config, published);
  if (path === '/sitemap.xml') return renderSitemap(config, published);
  if (path === '/robots.txt') return renderRobots(config);
  if (path === '/ads.txt') return renderAds(config);
  if (path === '/search-index.json') return renderSearchIndex(config, published);
  if (pathname === '/partner') return renderPartner(env, request, config, published);
  if (
    pathname === '/about' ||
    pathname === '/contact' ||
    pathname === '/privacy' ||
    pathname === '/terms'
  ) {
    return renderInfo(env, request, config, published, pathname);
  }

  if (LEGACY_CATEGORY_REDIRECTS[pathname.slice('/category/'.length)]) {
    const target = LEGACY_CATEGORY_REDIRECTS[pathname.slice('/category/'.length)];
    return utils.redirect(`/category/${target}/`, 301);
  }

  return render404(env, request, config, published);
}

const TRAFFIC_PAGE_RE = /^\/(category|tool|tag)\//;

const BOT_UA_RE =
  /\b(?:bot|crawler|spider|scraper|scrape|harvest|monitor|preview|headless|healthcheck)\b|googlebot|bingbot|duckduckbot|baiduspider|bytespider|petalbot|sogou|yandex|semrushbot|ahrefsbot|mj12bot|dotbot|bingpreview|linkedinbot|twitterbot|facebookexternalhit|whatsapp|telegrambot|discordbot|slackbot|redditbot|skypeuripreview|pinterest|snapchat|amazonbot|gptbot|claudebot|perplexitybot|ccbot|cohere-ai|anthropic-ai|meta-externalagent|imagesiftbot|google-inspectiontool|cloudflare-healthchecks|uptimerobot|statuscake|pingdom|newrelic|freshping|site24x7|curl|wget|python-requests|go-http-client|node-fetch|okhttp|axios|http-client|phantomjs|selenium|playwright|puppeteer/i;

function isBotUserAgent(ua) {
  const value = String(ua || '').trim();
  if (!value) return true;
  return BOT_UA_RE.test(value);
}

async function maybeRecordPageVisit(context, database, url, path, pathname) {
  try {
    if (context.request.method !== 'GET') return;
    if (!database || !db.recordPageVisit) return;
    if (isBotUserAgent(context.request.headers.get('user-agent'))) return;
    const isPage =
      path === '/' ||
      pathname === '/search' ||
      pathname === '/partner' ||
      pathname === '/about' ||
      pathname === '/contact' ||
      pathname === '/privacy' ||
      pathname === '/terms' ||
      TRAFFIC_PAGE_RE.test(pathname);
    if (!isPage) return;
    const fp = await pageFingerprint(context);
    const date = beijingDateKey(new Date());
    await db.recordPageVisit(database, { date, fingerprint: fp });
    const slugMatch = /^\/tool\/([^/]+)$/.exec(pathname);
    if (slugMatch && db.recordPostView) {
      await db.recordPostView(database, { slug: decodeURIComponent(slugMatch[1]), date });
    }
  } catch (err) {
    // 流量统计不能影响页面正常渲染。
    console.error('page visit tracking error:', err);
    try {
      if (database && db.addWorkerLog) {
        await db.addWorkerLog(
          database,
          'error',
          '流量统计写入失败: ' + String((err && err.message) || err).slice(0, 200)
        );
      }
    } catch (_) {
      // 日志写入失败也忽略，保证渲染不受影响。
    }
  }
}

async function pageFingerprint(context) {
  const { request, env } = context;
  const ip =
    String(request.headers.get('cf-connecting-ip') || '') ||
    String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ua = String(request.headers.get('user-agent') || '');
  const salt = String(env.SITE_URL || 'https://ai-blog.cloud');
  const hex = await utils.sha256Hex(`${ip}|${ua}|${salt}`);
  return String(hex).slice(0, 24);
}

function beijingDateKey(date) {
  const d = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

async function tryStaticAsset(env, request) {
  if (!env.ASSETS) return null;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (!STATIC_PATHS.some((prefix) => url.pathname.startsWith(prefix))) return null;
  const asset = await env.ASSETS.fetch(request);
  if (asset && asset.status !== 404) return asset;
  return null;
}

async function commonLocals(env, request, config, published, pathname) {
  const posts = published || (await db.listPosts(databaseFromEnv(env)));
  const tags = postsLib.allTags(posts);
  const categories = postsLib.categoryStats(posts);
  return {
    siteUrl: config.siteUrl,
    siteName: config.siteName,
    siteTagline: config.siteTagline,
    pageTitle: '',
    pageDescription: '',
    canonical: config.siteUrl + '/',
    jsonLd: undefined,
    year: new Date().getUTCFullYear(),
    categories,
    tags,
    adsenseClient: config.adsenseClient,
    googleAnalyticsId: config.googleAnalyticsId,
    adsenseSlots: config.adsenseSlots,
    contactEmail: String(env.CONTACT_EMAIL || '1534838732@qq.com'),
    currentPath: pathname || '/',
  };
}

function databaseFromEnv(env) {
  return env && env.DB ? env.DB : null;
}

function renderPage(env, request, config, locals, status = 200) {
  const view = locals.view || 'home';
  const body = views.renderTemplate(view, locals);
  const html = views.renderTemplate('layout', { ...locals, body });
  return utils.html(html, status, { 'cache-control': 'public, max-age=60' });
}

async function renderHome(env, request, config, published) {
  const newsPosts = published.filter((p) => p.kind === 'news').slice(0, 6);
  const allToolPosts = published.filter((p) => p.kind === 'tool').sort(toolSort);
  const toolPosts = allToolPosts.slice(0, 8);
  const featuredTools = allToolPosts.filter((p) => p.featured).slice(0, 4);
  const hotTools = allToolPosts.slice(0, 8);
  const locals = await commonLocals(env, request, config, published, '/');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: config.siteName,
    url: config.siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${config.siteUrl}/search/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
  return renderPage(env, request, config, {
    ...locals,
    view: 'home',
    pageTitle: `${config.siteName} - ${config.siteTagline}`,
    pageDescription: '实时追踪值得关注的 AI 热点与工具：模型发布、Agent 生态、厂商动态，附官网与上手指南。',
    canonical: config.siteUrl + '/',
    newsPosts,
    toolPosts,
    featuredTools,
    hotTools,
    totalCount: published.length,
    jsonLd: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
  });
}

async function renderPartner(env, request, config, published) {
  const locals = await commonLocals(env, request, config, published, '/partner/');
  return renderPage(env, request, config, {
    ...locals,
    view: 'partner',
    pageTitle: `收录与合作 - ${config.siteName}`,
    pageDescription: '提交你的 AI 工具或中转站，获取独立页面、分类曝光与官网直达入口。',
    canonical: `${config.siteUrl}/partner/`,
    currentPath: '/partner/',
  });
}

async function renderInfo(env, request, config, published, path) {
  const conf = INFO_PAGES[path];
  if (!conf) return render404(env, request, config, published);
  const locals = await commonLocals(env, request, config, published, `${path}/`);
  return renderPage(env, request, config, {
    ...locals,
    view: 'info',
    pageTitle: `${conf.title} - ${config.siteName}`,
    pageDescription: conf.lead,
    canonical: `${config.siteUrl}${path}/`,
    currentPath: `${path}/`,
    eyebrow: conf.eyebrow,
    title: conf.title,
    lead: conf.lead,
    content: conf.content,
  });
}

async function renderCategory(env, request, config, posts, slug) {
  if (LEGACY_CATEGORY_REDIRECTS[slug]) {
    return utils.redirect(`/category/${LEGACY_CATEGORY_REDIRECTS[slug]}/`, 301);
  }
  const category = postsLib.CATEGORIES.find((c) => c.slug === slug);
  if (!category) return render404(env, request, config, postsLib.getPublished(posts));
  const published = postsLib.getPublished(posts);
  const items = published.filter((p) => p.category === category.slug);
  if (category.slug === 'ai-tools') items.sort(toolSort);
  const locals = await commonLocals(env, request, config, published, `/category/${category.slug}`);
  return renderPage(env, request, config, {
    ...locals,
    view: 'list',
    pageTitle: `${category.name} - ${config.siteName}`,
    pageDescription: `浏览 ${category.name} 分类下的最新 AI 资讯与工具内容。`,
    canonical: `${config.siteUrl}/category/${category.slug}/`,
    currentPath: `/category/${category.slug}/`,
    title: category.name,
    subtitle:
      category.slug === 'ai-news'
        ? '模型发布、Agent 生态与厂商动态，帮你快速跟上 AI 新变化。'
        : '只收录真正值得用起来的 AI 产品，官网与上手路径一次讲清。',
    items,
    emptyText:
      category.slug === 'ai-news'
        ? '该分类暂时还没有资讯，稍后再来看看。'
        : '该分类暂时还没有工具，稍后再来看看。',
  });
}

async function renderTool(env, request, config, posts, slug) {
  const post = postsLib.bySlug(posts, slug);
  if (!post) return render404(env, request, config, postsLib.getPublished(posts));
  const published = postsLib.getPublished(posts);
  const related = postsLib.relatedPosts(posts, post);
  const { prev, next } = postsLib.neighbors(posts, post);
  const latest = published.slice(0, 8);
  const toc = (post.sections || []).map((s, i) => ({ id: `sec-${i + 1}`, heading: s.heading }));
  const url = `${config.siteUrl}/tool/${post.slug}/`;
  const faq = (post.faq || []).map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  }));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: post.title,
        description: post.summary,
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
        url,
        author: { '@type': 'Organization', name: config.siteName },
        publisher: { '@type': 'Organization', name: config.siteName },
        mainEntityOfPage: url,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: config.siteUrl },
          {
            '@type': 'ListItem',
            position: 2,
            name: post.categoryName,
            item: `${config.siteUrl}/category/${post.category}/`,
          },
          { '@type': 'ListItem', position: 3, name: post.title, item: url },
        ],
      },
      ...(faq.length ? [{ '@type': 'FAQPage', mainEntity: faq }] : []),
    ],
  };
  const locals = await commonLocals(env, request, config, published, `/tool/${post.slug}/`);
  return renderPage(env, request, config, {
    ...locals,
    view: 'tool',
    pageTitle: `${post.title} - ${config.siteName}`,
    pageDescription:
      post.summary ||
      utils.stripHtml((post.sections || []).map((s) => s.body).join(' ')).slice(0, 160),
    canonical: url,
    jsonLd: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
    post,
    toc,
    related,
    latest,
    prev,
    next,
  });
}

async function renderTag(env, request, config, posts, rawTag) {
  let decoded = rawTag;
  try {
    decoded = decodeURIComponent(rawTag);
  } catch {}
  const published = postsLib.getPublished(posts);
  const tag = postsLib.allTags(posts).find(
    (t) => t.name === decoded || t.name === rawTag || t.slug === rawTag || t.slug === decoded
  );
  if (!tag) return render404(env, request, config, published);
  const items = published.filter((p) => (p.tags || []).includes(tag.name));
  const locals = await commonLocals(env, request, config, published, `/tag/${tag.slug}`);
  return renderPage(env, request, config, {
    ...locals,
    view: 'list',
    pageTitle: `标签：${tag.name} - ${config.siteName}`,
    pageDescription: `浏览标签 ${tag.name} 下的最新内容。`,
    canonical: `${config.siteUrl}/tag/${tag.slug}/`,
    currentPath: `/tag/${tag.slug}/`,
    title: tag.name,
    subtitle: `共 ${items.length} 篇文章`,
    items,
    emptyText: '该标签下暂时没有内容。',
  });
}

async function renderSearch(env, request, config, published, url) {
  const q = String(url.searchParams.get('q') || '').trim();
  const items = postsLib.searchPosts(published, q);
  const locals = await commonLocals(env, request, config, published, '/search/');
  return renderPage(env, request, config, {
    ...locals,
    view: 'list',
    pageTitle: q ? `搜索：${q} - ${config.siteName}` : `搜索 - ${config.siteName}`,
    pageDescription: q ? `搜索“${q}”的结果` : '搜索本站收录的 AI 工具。',
    canonical: q
      ? `${config.siteUrl}/search/?q=${encodeURIComponent(q)}`
      : `${config.siteUrl}/search/`,
    currentPath: '/search/',
    q,
    title: q ? `搜索“${q}”` : '搜索',
    subtitle: q ? `找到 ${items.length} 条结果` : '输入关键词查找 AI 工具',
    items,
    emptyText: q
      ? `没有找到与“${q}”相关的内容，换个关键词试试。`
      : '输入关键词开始搜索。',
  });
}

function renderRss(config, published) {
  const items = published
    .slice(0, 50)
    .map((p) => {
      const text = utils.stripHtml((p.sections || []).map((s) => s.body).join(' '));
      const url = `${config.siteUrl}/tool/${p.slug}/`;
      return `    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${utils.escapeXml(url)}</link>
      <guid isPermaLink="true">${utils.escapeXml(url)}</guid>
      <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[${p.summary || text.slice(0, 300)}]]></description>
    </item>`;
    })
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${utils.escapeXml(config.siteName)}</title>
    <link>${utils.escapeXml(config.siteUrl)}</link>
    <description>${utils.escapeXml(config.siteTagline)}</description>
    <language>zh-cn</language>
${items}
  </channel>
</rss>`;
  return utils.text(xml, 200, 'application/rss+xml; charset=utf-8', {
    'cache-control': 'public, max-age=900',
  });
}

function renderSitemap(config, published) {
  const today = new Date().toISOString().slice(0, 10);
  const urlset = [
    { loc: config.siteUrl + '/', lastmod: today },
    { loc: `${config.siteUrl}/partner/`, lastmod: today },
    { loc: `${config.siteUrl}/about/`, lastmod: today },
    { loc: `${config.siteUrl}/contact/`, lastmod: today },
    { loc: `${config.siteUrl}/privacy/`, lastmod: today },
    { loc: `${config.siteUrl}/terms/`, lastmod: today },
    ...postsLib.CATEGORIES.filter((c) => published.some((p) => p.category === c.slug)).map((c) => ({
      loc: `${config.siteUrl}/category/${c.slug}/`,
      lastmod: today,
    })),
    ...published.map((p) => ({
      loc: `${config.siteUrl}/tool/${p.slug}/`,
      lastmod: (p.updatedAt || p.publishedAt).slice(0, 10),
    })),
  ]
    .map(
      (u) =>
        `  <url>\n    <loc>${utils.escapeXml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlset}\n</urlset>`;
  return utils.text(xml, 200, 'application/xml; charset=utf-8', {
    'cache-control': 'public, max-age=3600',
  });
}

function renderRobots(config) {
  const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/

Sitemap: ${config.siteUrl}/sitemap.xml
`;
  return utils.text(body, 200, 'text/plain; charset=utf-8', {
    'cache-control': 'public, max-age=3600',
  });
}

function renderAds(config) {
  return utils.text(config.adsTxt, 200, 'text/plain; charset=utf-8', {
    'cache-control': 'public, max-age=3600',
  });
}

function renderSearchIndex(config, published) {
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
      ...(p.sections || []).map((s) => `${s.heading} ${utils.stripHtml(s.body)}`),
    ].join(' '),
  }));
  return utils.text(JSON.stringify(index), 200, 'application/json; charset=utf-8', {
    'cache-control': 'public, max-age=900',
  });
}

async function render404(env, request, config, published) {
  const locals = await commonLocals(env, request, config, published, '/');
  const body =
    '<main class="page-404"><h1>404</h1><p>页面不存在。</p><a class="btn" href="/">返回首页</a></main>';
  const pageHtml = views.renderTemplate('layout', { ...locals, body });
  return utils.html(pageHtml, 404, { 'cache-control': 'no-store' });
}

async function apiRoute(context, database, url) {
  const { request, env } = context;
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/health' && method === 'GET') {
    const posts = await db.listPosts(database);
    return utils.json({
      ok: true,
      posts: posts.length,
      published: postsLib.getPublished(posts).length,
      scheduled: postsLib.getScheduled(posts).length,
    });
  }

  if (path === '/api/cron/publish' && method === 'POST') {
    const secret = String(env.CRON_SECRET || '').trim();
    const key = bearerKey(request);
    if (secret && key !== secret) {
      return utils.json({ ok: false, error: 'cron 密钥不正确' }, 401);
    }
    const result = await db.publishDue(database);
    return utils.json({ ok: true, ...result });
  }

  if (path === '/api/posts' && method === 'GET') {
    const posts = await db.listPosts(database);
    const published = postsLib.getPublished(posts);
    const limit = Math.min(Number(url.searchParams.get('limit')) || published.length, 100);
    const items = published.slice(0, limit).map((p) => apiPostItem(configFromEnv(env), p));
    return utils.json({ ok: true, count: items.length, items });
  }

  if (path === '/api/posts' && method === 'POST') {
    return createPost(context, database);
  }

  if (path === '/api/posts/batch' && method === 'POST') {
    return batchPosts(context, database);
  }

  if (path === '/api/hooks/xiaolongxia' && method === 'POST') {
    return createPost(context, database);
  }

  if (path === '/api/partner-submissions' && method === 'POST') {
    return submitPartnerSubmission(context, database);
  }

  if (path === '/api/partner-submissions' && method === 'GET') {
    return listPartnerSubmissionsApi(context, database);
  }

  let match;
  if ((match = path.match(/^\/api\/posts\/([^/]+)\/?$/)) && method === 'DELETE') {
    return deletePost(context, database, match[1]);
  }
  if ((match = path.match(/^\/api\/partner-submissions\/([^/]+)\/?$/))) {
    if (method === 'PATCH' || method === 'POST') {
      return updatePartnerSubmissionStatusApi(context, database, match[1]);
    }
  }

  return utils.json({ ok: false, error: '接口不存在' }, 404);
}

async function listPartnerSubmissionsApi(context, database) {
  const apiKey = await requireApiAuth(database, context.request);
  if (!apiKey) return utils.json({ ok: false, error: '无效或缺失的发布密钥' }, 401);
  const limit = Math.min(Number(new URL(context.request.url).searchParams.get('limit')) || 100, 200);
  const items = await db.listPartnerSubmissions(database, limit);
  return utils.json({
    ok: true,
    count: items.length,
    items: items.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      url: s.url,
      contact: s.contact,
      email: s.email,
      desc: s.desc,
      priceNote: s.priceNote,
      emailStatus: s.emailStatus,
      status: s.status,
      createdAt: s.createdAt,
    })),
  });
}

async function updatePartnerSubmissionStatusApi(context, database, id) {
  const apiKey = await requireApiAuth(database, context.request);
  if (!apiKey) return utils.json({ ok: false, error: '无效或缺失的发布密钥' }, 401);
  const body = await readBody(context.request);
  const status = String(body.status || '').trim();
  const ok = await db.updateSubmissionStatus(database, id, status);
  if (!ok) {
    return utils.json({ ok: false, error: '未找到该申请，或状态值无效' }, 400);
  }
  return utils.json({ ok: true, id, status });
}

async function submitPartnerSubmission(context, database) {
  const { request, env } = context;
  const body = await readBody(request);

  if (String(body.website_confirmation || '').trim()) {
    return utils.json({ ok: true, saved: false, message: '提交已记录' }, 200);
  }

  const name = String(body.name || '').trim().slice(0, 80);
  const type = String(body.type || '').trim().slice(0, 60);
  const url = String(body.url || '').trim().slice(0, 300);
  const contact = String(body.contact || '').trim().slice(0, 80);
  const email = String(body.email || '').trim().slice(0, 120);
  const desc = String(body.desc || '').trim().slice(0, 5000);

  const missing = [];
  if (!name) missing.push('产品/站点名称');
  if (!url) missing.push('官网或产品页地址');
  if (!contact) missing.push('联系人/微信');
  if (!desc) missing.push('服务能力与合作说明');
  if (missing.length) {
    return utils.json({ ok: false, error: `请填写：${missing.join('、')}` }, 400);
  }

  if (url && !/^https?:\/\//i.test(url)) {
    return utils.json({ ok: false, error: '官网地址需要以 http(s):// 开头' }, 400);
  }

  const now = new Date().toISOString();
  const record = {
    id: utils.randomHex(8),
    name,
    type,
    url,
    contact,
    email,
    desc,
    priceNote: body.price_note === '1' || body.price_note === 1 || body.price_note === true,
    emailStatus: 'pending',
    status: 'unread',
    createdAt: now,
  };
  await db.insertPartnerSubmission(database, record);

  const to = String(env.CONTACT_EMAIL || '1534838732@qq.com').trim();
  const lines = [
    `产品 / 站点：${name}`,
    `官网地址：${url}`,
    `合作类型：${type || '未选择'}`,
    `联系人 / 微信：${contact}`,
    `联系邮箱：${email || '未填写'}`,
    `收费 / 需注册使用：${record.priceNote ? '是' : '否'}`,
    '',
    '服务能力与合作说明：',
    desc,
    '',
    '（该申请由 AI 潮汐网站 /partner/ 表单提交）',
  ].join('\n');
  const result = await sendEmail(env, {
    to,
    subject: `【收录申请】${name}`,
    text: lines,
  });

  if (result.ok) {
    await db.markSubmissionEmail(database, record.id, 'sent');
    await db.addWorkerLog(
      database,
      'info',
      `收录申请已发到站长邮箱：${name}（${result.provider}）`
    );
    return utils.json({ ok: true, saved: true, email: 'sent', id: record.id }, 201);
  }

  await db.markSubmissionEmail(database, record.id, result.provider ? 'failed' : 'pending');
  await db.addWorkerLog(
    database,
    'info',
    `收到收录申请：${name}（${result.reason || '未配置邮件服务'}，已存后台）`
  );
  return utils.json(
    {
      ok: true,
      saved: true,
      email: result.provider ? 'failed' : 'stored',
      id: record.id,
      notice:
        result.provider
          ? '资料已保存，但邮件发送暂不可用，站长将从后台查看。'
          : '资料已保存到后台，站长会尽快查看。',
    },
    201
  );
}

function configFromEnv(env) {
  return {
    siteUrl: String(env.SITE_URL || 'https://ai-blog.cloud').replace(/\/+$/, ''),
  };
}

function apiPostItem(config, p) {
  return {
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
    url: `${config.siteUrl}/tool/${p.slug}/`,
  };
}

function bearerKey(request) {
  const header = String(request.headers.get('authorization') || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function requireApiAuth(database, request) {
  const key = bearerKey(request);
  if (!key) return null;
  return auth.authenticateApiKey(database, key);
}

async function readBody(request) {
  let text = '';
  try {
    text = await request.text();
  } catch {
    return {};
  }
  const type = String(request.headers.get('content-type') || '');
  if (type.includes('application/x-www-form-urlencoded')) {
    const out = {};
    const params = new URLSearchParams(text);
    for (const [key, value] of params.entries()) out[key] = value;
    return out;
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function newsInputError(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '请求体必须是 JSON 对象';
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

async function createPost(context, database) {
  const { request } = context;
  const apiKey = await requireApiAuth(database, request);
  if (!apiKey) return utils.json({ ok: false, error: '无效或缺失的发布密钥' }, 401);
  const raw = await readBody(request);
  const body = newsBody(raw && raw.post ? raw.post : raw);
  const error = newsInputError(body);
  if (error) return utils.json({ ok: false, error }, 400);
  const post = await db.upsertPost(database, body);
  await db.addWorkerLog(
    database,
    post.status === 'scheduled' ? 'scheduled' : 'published',
    `${post.status === 'scheduled' ? '定时队列新增' : '已发布'}：${post.title}`
  );
  return utils.json(
    {
      ok: true,
      slug: post.slug,
      url: `${siteUrlFromContext(context)}/tool/${post.slug}/`,
      status: post.status,
    },
    201
  );
}

function siteUrlFromContext(context) {
  return siteUrl(context.env, context.request);
}

async function batchPosts(context, database) {
  const { request } = context;
  const apiKey = await requireApiAuth(database, request);
  if (!apiKey) return utils.json({ ok: false, error: '无效或缺失的发布密钥' }, 401);
  const raw = await readBody(request);
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray(raw && raw.posts)
      ? raw.posts
      : null;
  if (!items || !items.length) {
    return utils.json({ ok: false, error: '请求体必须是 post 数组' }, 400);
  }
  const created = [];
  const errors = [];
  for (let index = 0; index < items.length; index += 1) {
    try {
      const normalized = newsBody(items[index]);
      const error = newsInputError(normalized);
      if (error) throw new Error(error);
      const post = await db.upsertPost(database, normalized);
      await db.addWorkerLog(
        database,
        post.status === 'scheduled' ? 'scheduled' : 'published',
        `${post.status === 'scheduled' ? '定时队列新增' : '已发布'}：${post.title}`
      );
      created.push({ index, slug: post.slug, status: post.status });
    } catch (err) {
      errors.push({ index, error: err.message });
    }
  }
  return utils.json({ ok: true, created, errors });
}

async function deletePost(context, database, slug) {
  const { request } = context;
  const apiKey = await requireApiAuth(database, request);
  if (!apiKey) return utils.json({ ok: false, error: '无效或缺失的发布密钥' }, 401);
  const post = await db.getPost(database, slug);
  if (!post) return utils.json({ ok: false, error: '未找到该文章' }, 404);
  if (post.category !== 'ai-news') {
    return utils.json({ ok: false, error: '接口只能删除 AI资讯，AI工具由人工维护' }, 403);
  }
  await db.deletePost(database, slug);
  await db.addWorkerLog(database, 'info', `已删除资讯：${post.title}`);
  return utils.json({ ok: true, removed: post.slug });
}

async function adminRoute(context, database, url) {
  const { request } = context;
  const path = url.pathname;
  const method = request.method;

  if (path === '/admin' || path === '/admin/') {
    if (method === 'GET') return adminDashboard(database, context);
    return utils.json({ ok: false, error: '方法不允许' }, 405);
  }

  if (path === '/admin/login' || path === '/admin/login/') {
    return adminLogin(database, context);
  }

  if (path === '/admin/logout' || path === '/admin/logout/') {
    if (method !== 'POST') return utils.json({ ok: false, error: '方法不允许' }, 405);
    return new Response(null, {
      status: 302,
      headers: {
        location: '/admin/login',
        'set-cookie': auth.clearSessionCookie(),
        'cache-control': 'no-store',
      },
    });
  }

  if (method !== 'POST') return utils.json({ ok: false, error: '方法不允许' }, 405);

  if (path === '/admin/traffic/reset' || path === '/admin/traffic/reset/') {
    return resetTrafficAdmin(database, context);
  }

  if (path === '/admin/password' || path === '/admin/password/') {
    return changePassword(database, context);
  }

  if (path === '/admin/api-keys' || path === '/admin/api-keys/') {
    return createApiKey(database, context);
  }

  let match;
  if ((match = path.match(/^\/admin\/api-keys\/([^/]+)\/revoke\/?$/))) {
    return revokeApiKey(database, context, match[1]);
  }
  if ((match = path.match(/^\/admin\/posts\/([^/]+)\/delete\/?$/))) {
    return deleteAdminPost(database, context, match[1]);
  }
  if ((match = path.match(/^\/admin\/submissions\/([^/]+)\/status\/?$/))) {
    return adminUpdateSubmissionStatus(database, context, match[1]);
  }

  return renderAdminPage(database, context, {
    page: 'dashboard',
    adminError: '后台地址不存在',
  }, 404);
}

async function adminSessionOk(database, context) {
  return auth.isAdminSession(database, context.request);
}

async function adminDashboard(database, context) {
  if (!(await adminSessionOk(database, context))) {
    return utils.redirect('/admin/login');
  }
  const url = new URL(context.request.url);
  const page = currentAdminSection(url);
  const range = adminTrafficRange(url);
  const locals = await dashboardLocals(database, context, { page, range });
  return renderAdminPage(database, context, locals);
}

const ADMIN_SECTIONS = ['traffic', 'posts', 'tools', 'submissions', 'keys'];

function currentAdminSection(url) {
  const value = String((url && url.searchParams.get('p')) || '').trim();
  return ADMIN_SECTIONS.includes(value) ? value : 'traffic';
}

function adminDateParam(value) {
  const cleaned = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : null;
}

function adminTrafficRange(url) {
  const today = beijingDateKey(new Date());
  const from = adminDateParam(url && url.searchParams.get('start'));
  const to = adminDateParam(url && url.searchParams.get('end')) || today;
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}

async function adminLogin(database, context) {
  const { request } = context;
  if (await adminSessionOk(database, context)) return utils.redirect('/admin');
  const needsSetup = !(await auth.hasAdmin(database));
  if (request.method === 'POST') {
    const body = await readBody(request);
    const password = String(body.password || '');
    if (needsSetup) {
      const confirm = String(body.confirm || '');
      if (password.length < 8) {
        return renderAdminPage(database, context, {
          page: 'login',
          needsSetup: true,
          adminError: '密码至少需要 8 位',
        });
      }
      if (password !== confirm) {
        return renderAdminPage(database, context, {
          page: 'login',
          needsSetup: true,
          adminError: '两次输入的密码不一致',
        });
      }
      try {
        await auth.setupAdmin(database, password);
      } catch (err) {
        return renderAdminPage(database, context, {
          page: 'login',
          needsSetup: true,
          adminError: err.message,
        });
      }
    } else if (!(await auth.verifyAdminPassword(database, password))) {
      return renderAdminPage(database, context, {
        page: 'login',
        needsSetup: false,
        adminError: '密码不正确，请重新输入',
      });
    }
    const cookie = await auth.createSessionCookie(database, request);
    return new Response(null, {
      status: 302,
      headers: { location: '/admin', 'set-cookie': cookie, 'cache-control': 'no-store' },
    });
  }
  return renderAdminPage(database, context, { page: 'login', needsSetup });
}

async function resetTrafficAdmin(database, context) {
  const body = await readBody(context.request);
  const guard = await adminGuard(database, context, body);
  if (!guard.ok) return guard.response;
  await db.resetTrafficData(database);
  await db.addWorkerLog(database, 'info', '后台已清空流量统计，重新开始计数');
  const locals = await dashboardLocals(database, context, {
    page: 'traffic',
    range: adminTrafficRange(new URL(context.request.url)),
  });
  return renderAdminPage(database, context, {
    ...locals,
    adminNotice: '历史流量数据已清空，现在开始只统计新的真实访问。',
  });
}

async function changePassword(database, context) {
  const { request } = context;
  const body = await readBody(request);
  const guard = await adminGuard(database, context, body);
  if (!guard.ok) return guard.response;
  const current = String(body.currentPassword || '');
  const next = String(body.nextPassword || '');
  const confirm = String(body.confirmPassword || '');
  if (next.length < 8) {
    return renderAdminPage(database, context, {
      ...(await dashboardLocals(database, context, { page: 'keys' })),
      adminError: '新密码至少需要 8 位',
    });
  }
  if (next !== confirm) {
    return renderAdminPage(database, context, {
      ...(await dashboardLocals(database, context, { page: 'keys' })),
      adminError: '两次输入的新密码不一致',
    });
  }
  try {
    await auth.changeAdminPassword(database, current, next);
  } catch (err) {
    return renderAdminPage(database, context, {
      ...(await dashboardLocals(database, context, { page: 'keys' })),
      adminError: err.message,
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: '/admin/login',
      'set-cookie': auth.clearSessionCookie(),
      'cache-control': 'no-store',
    },
  });
}

async function createApiKey(database, context) {
  const body = await readBody(context.request);
  const guard = await adminGuard(database, context, body);
  if (!guard.ok) return guard.response;
  const name = String(body.name || '').trim();
  const result = await auth.createApiKey(database, name);
  return renderAdminPage(database, context, {
    ...(await dashboardLocals(database, context, { page: 'keys' })),
    adminNotice: '密钥已创建，请立即复制保存；关闭本页面后不会再显示完整密钥。',
    newKey: { name: result.record.name, key: result.key },
  });
}

async function revokeApiKey(database, context, id) {
  const body = await readBody(context.request);
  const guard = await adminGuard(database, context, body);
  if (!guard.ok) return guard.response;
  const ok = await auth.revokeApiKey(database, id);
  return renderAdminPage(database, context, {
    ...(await dashboardLocals(database, context, { page: 'keys' })),
    adminNotice: ok ? '密钥已吊销，小龙虾再用这个密钥发布会被拒绝。' : '未找到该密钥。',
  });
}

async function deleteAdminPost(database, context, slug) {
  const body = await readBody(context.request);
  const guard = await adminGuard(database, context, body);
  if (!guard.ok) return guard.response;
  const post = await db.getPost(database, slug);
  if (!post || post.category !== 'ai-news') {
    return renderAdminPage(database, context, {
      ...(await dashboardLocals(database, context, { page: 'posts' })),
      adminError: '只能删除 AI 资讯，AI 工具由人工维护',
    });
  }
  await db.deletePost(database, slug);
  await db.addWorkerLog(database, 'info', `后台删除资讯：${post.title}`);
  return utils.redirect('/admin?p=posts');
}

async function adminUpdateSubmissionStatus(database, context, id) {
  const body = await readBody(context.request);
  const guard = await adminGuard(database, context, body);
  if (!guard.ok) return guard.response;
  const status = String(body.status || '').trim();
  const ok = await db.updateSubmissionStatus(database, id, status);
  const extra = { ...(await dashboardLocals(database, context, { page: 'submissions' })) };
  if (!ok) {
    extra.adminError = '未找到该申请，或状态值无效';
    return renderAdminPage(database, context, extra, 400);
  }
  extra.adminNotice = '申请状态已更新';
  return renderAdminPage(database, context, extra);
}

async function adminGuard(database, context, body) {
  if (!(await adminSessionOk(database, context))) {
    return { ok: false, response: utils.redirect('/admin/login') };
  }
  if (!(await auth.isCsrfValid(database, context.request, Date.now(), body || {}))) {
    return {
      ok: false,
      response: renderAdminPage(database, context, {
        ...(await dashboardLocals(database, context)),
        adminError: '表单校验未通过，请刷新页面后重试',
      }, 403),
    };
  }
  return { ok: true };
}

async function dashboardLocals(database, context, options = {}) {
  const url = new URL(context.request.url);
  const page = options.page || currentAdminSection(url);
  const range = options.range || adminTrafficRange(url);
  const posts = await db.listPosts(database);
  const published = postsLib.getPublished(posts);
  const scheduled = postsLib.getScheduled(posts);
  const newsPosts = published.filter((p) => p.kind === 'news');
  const toolPosts = published.filter((p) => p.kind === 'tool');
  const apiKeys = await auth.listApiKeys(database);
  const logs = await db.listWorkerLogs(database, 30);
  const submissions = await db.listPartnerSubmissions(database, 50);
  const traffic = await db.getTrafficStats(database, range);
  const postViews = await db.getPostViewStats(database, range);
  const workerLog = logs.map((row) => ({
    time: utils.formatDateTime(row.createdAt),
    html: linkifyLogText(row.text),
    kind: row.kind || 'info',
  }));
  const partnerSubmissions = submissions.map((s) => ({
    ...s,
    createdAtText: utils.formatDateTime(s.createdAt),
  }));
  const submissionStats = {
    unread: submissions.filter((s) => s.status === 'unread').length,
    read: submissions.filter((s) => s.status === 'read').length,
    online: submissions.filter((s) => s.status === 'online').length,
    rejected: submissions.filter((s) => s.status === 'rejected').length,
  };
  const sectionMeta = {
    traffic: {
      title: '网站流量',
      lead: '按日期查看全站流量、周走势与每篇文章的浏览量，数据以后台统计口径为准。',
    },
    posts: {
      title: '发帖历史',
      lead: '查看小龙虾已发布和定时排队的 AI 资讯，以及每篇文章的区间与累计浏览。',
    },
    tools: {
      title: 'AI 工具收录',
      lead: '管理已收录工具、官网与推荐入口，附工具页流量表现。',
    },
    submissions: {
      title: '合作收录',
      lead: '处理前台提交的收录申请，跟进邮件推送与上线状态。',
    },
    keys: {
      title: '密钥管理',
      lead: '创建和管理小龙虾发布密钥，并维护后台登录密码。',
    },
  };
  return {
    page,
    sectionTitle: (sectionMeta[page] || sectionMeta.traffic).title,
    sectionLead: (sectionMeta[page] || sectionMeta.traffic).lead,
    csrf: await auth.csrfToken(database, Date.now()),
    stats: {
      publishedNews: newsPosts.length,
      scheduled: scheduled.length,
      tools: toolPosts.length,
      submissions: submissions.length,
    },
    traffic,
    trafficRange: {
      from: range.from || '',
      to: range.to || '',
      today: beijingDateKey(new Date()),
    },
    workerLog,
    partnerSubmissions,
    submissionStats,
    newsPosts: withPostViews(
      newsPosts.map((p) => ({
        post: p,
        publishedAt: utils.formatDateTime(p.publishedAt),
        updatedAt: utils.formatDateTime(p.updatedAt),
        source: sourceLabel(p),
      })),
      postViews
    ),
    scheduledPosts: scheduled
      .concat([])
      .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt))
      .map((p) => ({
        post: p,
        publishedAt: utils.formatDateTime(p.publishedAt),
        updatedAt: utils.formatDateTime(p.updatedAt),
        source: sourceLabel(p),
      })),
    toolPosts: withPostViews(
      toolPosts.map((p) => ({
        post: p,
        updatedAt: utils.formatDateTime(p.updatedAt),
        source: sourceLabel(p),
      })),
      postViews
    ),
    apiKeys,
    newKey: null,
  };
}

function withPostViews(rows, stats) {
  const dailyBySlug = {};
  for (const item of stats.daily || []) {
    if (!dailyBySlug[item.slug]) dailyBySlug[item.slug] = [];
    dailyBySlug[item.slug].push({ date: item.date, pageviews: item.pageviews });
  }
  return rows.map((row) => {
    const slug = row.post.slug;
    const daily = dailyBySlug[slug] || [];
    const viewsByDate = {};
    for (const day of daily) viewsByDate[day.date] = day.pageviews;
    return {
      ...row,
      views: stats.total[slug] || 0,
      rangeViews: stats.range[slug] || 0,
      daily,
      viewsByDate,
    };
  });
}

function sourceLabel(post) {
  const url = post.kind === 'news' ? post.sourceUrl : post.officialUrl;
  if (!url) return '';
  return String(url).replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function linkifyLogText(text) {
  const escaped = utils.escapeHtml(String(text || ''));
  return escaped.replace(
    /(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>'
  );
}

function renderAdminPage(database, context, data = {}, status = 200) {
  const config = siteConfig(context.env, context.request);
  const locals = {
    siteName: config.siteName,
    siteUrl: config.siteUrl,
    adminError: '',
    adminNotice: '',
    ...data,
  };
  return utils.html(views.renderTemplate('admin', locals), status, {
    'cache-control': 'no-store',
  });
}
