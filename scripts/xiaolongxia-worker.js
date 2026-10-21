#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fetchHotTopics } = require('./lib/topic-sources');

const ROOT = path.join(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'xiaolongxia.log');
const STATE_FILE = path.join(LOG_DIR, 'seen-topics.json');
const ICON_DIR = path.join(ROOT, 'public', 'icons', 'news');

const SITE = (process.env.SITE_URL || process.env.XIAOLONGXIA_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const API_KEY = process.env.XIAOLONGXIA_API_KEY || '';
const MODEL_KEY = process.env.MODEL_API_KEY || '';
const MODEL_BASE = (process.env.OPENAI_COMPATIBLE_BASE_URL || '').replace(/\/+$/, '');
const MODEL_NAME = process.env.MODEL_NAME || 'qwen-plus';
const TIMES = String(process.env.XIAOLONGXIA_TIMES || '10:00,17:00')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);
const TIMEZONE = process.env.XIAOLONGXIA_TIMEZONE || 'Asia/Shanghai';
const DEFAULT_LIMIT = Math.max(1, Number(process.env.XIAOLONGXIA_MAX_PER_RUN) || 1);

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
  } catch {
    // 日志写入失败不阻塞发文
  }
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { urls: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function slugify(text, url) {
  const base = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'ai-news';
  const hash = crypto.createHash('sha1').update(String(url || text || '')).digest('hex').slice(0, 8);
  return `${base}-${hash}`;
}

function hotScoreFor(url) {
  const hash = crypto.createHash('sha1').update(String(url || '')).digest('hex');
  const n = parseInt(hash.slice(0, 8), 16);
  return 72 + (n % 25);
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArgs(argv) {
  const opts = {
    preview: false,
    push: false,
    daemon: false,
    allowTemplate: false,
    force: false,
    icons: true,
    limit: DEFAULT_LIMIT,
    sources: [],
  };
  for (const arg of argv) {
    if (arg === '--preview') opts.preview = true;
    else if (arg === '--push') opts.push = true;
    else if (arg === '--daemon') opts.daemon = true;
    else if (arg === '--allow-template') opts.allowTemplate = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--no-icons') opts.icons = false;
    else if (arg.startsWith('--limit=')) opts.limit = Math.max(1, Number(arg.slice(8)) || 1);
    else if (arg.startsWith('--sources=')) opts.sources = arg.slice(10).split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`AI 潮汐“小龙虾”自动发文 worker

用法:
  node scripts/xiaolongxia-worker.js --preview          抓取热点并预览文章 JSON，不发文
  node scripts/xiaolongxia-worker.js --push             抓取热点并用模型生成后发布
  node scripts/xiaolongxia-worker.js --daemon           常驻运行，按 XIAOLONGXIA_TIMES 定时发布

参数:
  --preview            只打印生成的 payload
  --push               实际调用发布 API
  --daemon             常驻定时执行
  --allow-template     没有模型 Key 时允许用模板生成（仅测试用）
  --no-icons           跳过站点图标下载
  --limit=N            每次最多生成 N 篇
  --sources=hn-top,hn-ai,hn-llm,github-trending,zhihu-hot,zhihu-search  指定热点源
  --force              忽略本地去重记录，强制重新生成

环境变量:
  SITE_URL              发布目标，默认 http://localhost:3000
  XIAOLONGXIA_API_KEY   /admin 后台创建的 API 密钥（完整 ait_... 字符串）
  MODEL_API_KEY         国内云厂商模型 Key
  OPENAI_COMPATIBLE_BASE_URL  模型接口地址
  MODEL_NAME            模型名
  XIAOLONGXIA_TIMES     每日发布时间，默认 10:00,17:00
  XIAOLONGXIA_MAX_PER_RUN   每次发布篇数，默认 1
  XIAOLONGXIA_TIMEZONE  时区，默认 Asia/Shanghai
  ZHIHU_CLI_BIN         知乎 CLI 命令，默认 npx（会自动安装 zhihu-cli）
`);
}

async function fetchExisting() {
  try {
    const res = await fetch(`${SITE}/api/posts?limit=100`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      slugs: new Set(data.items.map((p) => p.slug)),
      titles: new Set(data.items.map((p) => p.title)),
      urls: new Set(data.items.map((p) => p.sourceUrl).filter(Boolean)),
    };
  } catch (err) {
    log('WARN 获取已发布文章失败，跳过站内去重:', err.message);
    return { slugs: new Set(), titles: new Set(), urls: new Set() };
  }
}

function pickTopics(topics, existing, state, limit, force) {
  const picked = [];
  for (const topic of topics) {
    if (picked.length >= limit) break;
    if (!topic.url) continue;
    if (!force && state.urls.includes(topic.url)) continue;
    if (existing.urls.has(topic.url) || existing.titles.has(topic.title)) continue;
    picked.push(topic);
  }
  return picked;
}

function defaultCover() {
  return { url: '/icons/news-default.svg', alt: 'AI 资讯' };
}

function looksLikeImage(buffer, contentType, ext) {
  const type = String(contentType || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  const head = buffer.slice(0, 12);
  if (ext === 'svg' || type.includes('svg')) {
    return buffer.slice(0, 1024).toString('utf8').toLowerCase().includes('<svg');
  }
  if (buffer.length >= 4 && head[0] === 0x00 && head[1] === 0x00 && head[2] === 0x01 && head[3] === 0x00) return true;
  if (buffer.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true;
  if (buffer.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true;
  if (buffer.length >= 4 && head.toString('latin1').startsWith('GIF8')) return true;
  if (buffer.length >= 12 && head.toString('latin1').slice(0, 4) === 'RIFF' && buffer.slice(8, 12).toString('latin1') === 'WEBP') return true;
  return false;
}

async function downloadFavicon(topic) {
  let origin = '';
  try {
    origin = new URL(topic.url).origin;
  } catch {
    return defaultCover();
  }
  const host = String(origin).replace(/^https?:\/\//, '');
  const hash = crypto.createHash('sha1').update(topic.url).digest('hex').slice(0, 16);
  const candidates = [
    { url: `${origin}/favicon.ico`, ext: 'ico' },
    { url: `https://favicon.im/${host}`, ext: 'png' },
    { url: `https://favicone.com/${host}`, ext: 'ico' },
    { url: `https://icons.duckduckgo.com/ip3/${host}.ico`, ext: 'ico' },
    { url: `https://www.google.com/s2/favicons?domain=${host}&sz=128`, ext: 'png' },
  ];
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate.url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
          accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 200) continue;
      const contentType = String(res.headers.get('content-type') || '');
      const ext = contentType.includes('svg') ? 'svg' : contentType.includes('png') ? 'png' : candidate.ext;
      if (!looksLikeImage(buffer, contentType, ext)) continue;
      const filename = `${hash}.${ext}`;
      fs.mkdirSync(ICON_DIR, { recursive: true });
      fs.writeFileSync(path.join(ICON_DIR, filename), buffer);
      return { url: `/icons/news/${filename}`, alt: topic.source || 'AI 资讯' };
    } catch {
      // 继续尝试下一个图标源
    }
  }
  return defaultCover();
}

function templateArticle(topic, now) {
  const rawSummary = stripTags(topic.summary);
  const summary = (rawSummary || `来自 ${topic.source || '公开热点'} 的热点：${stripTags(topic.title)}`).slice(0, 160);
  return {
    title: stripTags(topic.title).slice(0, 60),
    slug: slugify(stripTags(topic.title), topic.url),
    category: 'ai-news',
    subtitle: `${topic.source || 'AI 资讯'} 热点追踪`,
    tags: ['AI资讯', topic.source || '热点'],
    summary,
    sourceUrl: topic.url,
    sections: [
      { heading: '事件背景', body: `<p>${summary}</p>` },
      { heading: '关键事实', body: `<ul><li>该动态来自 ${topic.source || '公开来源'}，原始链接为 <a href="${topic.url}" rel="nofollow noopener">${topic.url}</a>。</li><li>关注官方公告中的能力说明、开放范围、上线时间和价格变化。</li><li>社区讨论可作为补充视角，但不能替代一手来源。</li></ul>` },
      { heading: '为什么重要', body: '<p>这类动态通常会改变用户接下来怎么选模型、怎么用工具，或影响团队的开发与采购决策。判断重要性的标准不是热度，而是它是否改变了可用方案、成本结构或工作流程。</p>' },
      { heading: '对谁有影响', body: '<p>普通用户可以关注产品界面和免费能力是否变化；开发者需要看 API、定价、上下文窗口和兼容性；团队则需要评估迁移成本、数据权限和供应商风险。</p>' },
      { heading: '下一步怎么做', body: '<p>先回到官方页面核对公告原文，确认正式上线时间与适用区域；再根据自身场景做小范围试用，记录成本和效果；重要决策应结合官方文档与后续版本更新，不要只凭单一转载判断。</p>' },
      { heading: '编辑补充', body: '<p>本条目为热点速报，关键参数和入口以官方最新发布为准。建议收藏原始链接，等待厂商补充细节后再做长期结论。</p>' },
    ],
    faq: [
      { q: '这条动态的来源可靠吗？', a: `本文来源为 ${topic.source || '公开来源'}，正文已保留原始链接供读者核对。` },
      { q: '普通用户需要马上行动吗？', a: '多数情况下不需要，建议先看官方公告确认上线时间和适用地区，再决定是否试用。' },
      { q: '开发者应该关注什么？', a: '关注 API 接入方式、定价、上下文参数、兼容性和数据权限，并做小范围验证。' },
    ],
    hotScore: hotScoreFor(topic.url),
    publishedAt: now,
  };
}

function modelPrompt(topic, now) {
  return `你是 AI 潮汐网站的资深 AI 科技编辑，负责把热点线索写成有编辑判断、可验证、能让读者直接行动的原创中文资讯。

写作要求：
1. title 不超过 45 个汉字，不使用夸张词，不制造误导性悬念。
2. slug 只包含小写字母、数字和连字符，基于标题生成。
3. summary 是 60-120 字的一句话摘要，必须包含“发生了什么 + 为什么值得关注 + 谁需要行动”。
4. sections 包含 5-7 节，heading 根据内容自由拟定，可参考“事件背景”“关键事实”“为什么重要”“对谁有影响”“下一步怎么做”“编辑补充”，但不要全部照搬模板标题。
5. 每节 body 使用 HTML 段落或列表，正文总字数控制在 1500-2600 字；优先写具体影响、适用场景、验证方法、风险和行动建议，禁止空话套话。
6. 不能只复述线索摘要，必须补充编辑视角：这件事改变了什么、谁需要采取行动、如何验证信息、有什么机会或风险。
7. 涉及事实、价格、日期、参数时必须有线索或公开来源支持；无法确认的信息用“根据公开信息”“以官方说明为准”等表述。
8. faq 包含 3-5 条，问题要贴近真实读者，答案要具体，不要写“请查看官网”这种无效答案。
9. hotScore 为 72-96 的整数。
10. sourceUrl 必须原样等于线索里的 url。
11. category 固定为 ai-news，publishedAt 使用给定值。
12. 只输出一个 JSON 对象，不要 Markdown 代码块，不要额外解释。

字段：title, slug, subtitle, summary, tags, category, sourceUrl, sections, faq, hotScore, publishedAt

线索：
${JSON.stringify({ title: topic.title, url: topic.url, summary: topic.summary, source: topic.source }, null, 2)}

当前发布时间：${now}`;
}

async function callModel(prompt) {
  const url = `${MODEL_BASE}/chat/completions`;
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${MODEL_KEY}`,
  };
  const body = {
    model: MODEL_NAME,
    messages: [
      { role: 'system', content: '你负责为 AI 潮汐网站撰写高质量中文 AI 资讯，只输出合法 JSON。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 2500,
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(120000),
    });
    if (res.ok) {
      const data = await res.json();
      return String(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '');
    }
    if (res.status === 400) {
      const res2 = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
      if (!res2.ok) throw new Error(`HTTP ${res2.status} ${await res2.text()}`);
      const data = await res2.json();
      return String(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '');
    }
    throw new Error(`HTTP ${res.status} ${await res.text()}`);
  } catch (err) {
    throw new Error(`模型调用失败: ${err.message}`);
  }
}

function parseJson(text) {
  const trimmed = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型输出不是 JSON 对象');
  return JSON.parse(trimmed.slice(start, end + 1));
}

function validatePayload(payload, topic, now) {
  if (!payload || typeof payload !== 'object') throw new Error('模型返回为空');
  if (!String(payload.title || '').trim()) throw new Error('缺少 title');
  if (!String(payload.slug || '').trim()) throw new Error('缺少 slug');
  if (!String(payload.summary || '').trim()) throw new Error('缺少 summary');
  if (!Array.isArray(payload.sections) || payload.sections.length < 3) throw new Error('sections 少于 3 节');
  if (!Array.isArray(payload.faq) || !payload.faq.length) throw new Error('缺少 faq');
  if (!String(payload.sourceUrl || '')) throw new Error('缺少 sourceUrl');
  return {
    ...payload,
    category: 'ai-news',
    sourceUrl: topic.url,
    slug: slugify(payload.slug, topic.url),
    sections: payload.sections.map((s) => ({ heading: String(s.heading || '').slice(0, 40), body: String(s.body || '') })),
    faq: payload.faq.map((f) => ({ q: String(f.q || '').slice(0, 80), a: String(f.a || '') })),
    tags: Array.isArray(payload.tags) ? payload.tags.slice(0, 8) : ['AI资讯'],
    hotScore: Math.min(96, Math.max(60, Number(payload.hotScore) || hotScoreFor(topic.url))),
    publishedAt: now,
  };
}

async function generateArticle(topic, index, opts) {
  const now = new Date().toISOString();
  const hasModel = Boolean(MODEL_KEY && MODEL_BASE);
  if (!hasModel && !opts.allowTemplate) {
    throw new Error('未配置 MODEL_API_KEY / OPENAI_COMPATIBLE_BASE_URL，测试可用 --allow-template');
  }

  let payload = null;
  if (hasModel) {
    try {
      const content = await callModel(modelPrompt(topic, now));
      payload = validatePayload(parseJson(content), topic, now);
    } catch (err) {
      if (!opts.allowTemplate) throw err;
      log(`WARN 模型生成失败，退回模板（${index + 1}）:`, err.message);
    }
  }
  if (!payload) payload = templateArticle(topic, now);

  if (opts.icons) {
    const cover = await downloadFavicon(topic);
    payload.cover = cover;
  } else {
    payload.cover = defaultCover();
  }
  return payload;
}

async function pushArticle(payload) {
  const res = await fetch(`${SITE}/api/posts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = { raw: await res.text() };
  }
  if (!res.ok) throw new Error(`发布失败 ${res.status}: ${data.error || JSON.stringify(data)}`);
  return data;
}

async function runOnce(opts) {
  log('开始抓取热点...');
  const result = await fetchHotTopics({ sources: opts.sources, limit: 60 });
  result.failures.forEach((f) => log('WARN 热点源失败:', f));
  if (result.usedFallback) log('WARN 网络热点源均不可用，使用官方页面备用列表');
  log(`抓取到 ${result.topics.length} 条候选，重复来源将去重`);

  const existing = await fetchExisting();
  const state = loadState();
  const picked = pickTopics(result.topics, existing, state, opts.limit, opts.force);
  log(`去重后待生成 ${picked.length} 篇`);

  const payloads = [];
  for (let i = 0; i < picked.length; i += 1) {
    const topic = picked[i];
    try {
      const payload = await generateArticle(topic, i, opts);
      payloads.push(payload);
      if (opts.preview) {
        log(`预览 ${i + 1}/${picked.length}: ${payload.title}`);
        continue;
      }
      const pushed = await pushArticle(payload);
      if (!state.urls.includes(topic.url)) state.urls.push(topic.url);
      const target = pushed.url || `/news/${payload.slug}/`;
      log(`已发布: ${payload.title} -> ${/^https?:\/\//.test(target) ? target : `${SITE}${target}`} (${pushed.status})`);
    } catch (err) {
      log(`ERROR 第 ${i + 1} 篇生成或发布失败:`, err.message);
    }
  }

  saveState(state);
  if (opts.preview) console.log(JSON.stringify(payloads, null, 2));
  log(`本次完成 ${payloads.length} 篇`);
  return payloads.length;
}

function wallParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number((parts.find((p) => p.type === type) || {}).value || 0);
  return {
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
    ms: date.getMilliseconds(),
  };
}

function nextDelayMs() {
  const now = wallParts(new Date());
  const nowMinutes = now.hour * 60 + now.minute;
  const targets = TIMES
    .map((t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + (Number.isNaN(m) ? 0 : m);
    })
    .sort((a, b) => a - b);
  let target = targets.find((t) => t > nowMinutes);
  if (target === undefined) target = (targets[0] || 0) + 1440;
  const diffMs = (target - nowMinutes) * 60000 - (now.second * 1000 + now.ms);
  return Math.max(1000, diffMs);
}

function daemon(opts) {
  log(`daemon 启动: 站点=${SITE} 模型=${MODEL_NAME} 时间=${TIMES.join(',')} 时区=${TIMEZONE}`);
  const runScheduled = async () => {
    try {
      await runOnce(opts);
    } catch (err) {
      log('ERROR 定时任务失败:', err.message);
    }
    const delay = nextDelayMs();
    log(`下一次运行约 ${new Date(Date.now() + delay).toISOString()}`);
    setTimeout(runScheduled, delay);
  };
  const delay = nextDelayMs();
  log(`下一次运行约 ${new Date(Date.now() + delay).toISOString()}`);
  setTimeout(runScheduled, delay);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const action = opts.daemon ? (opts.preview ? 'preview' : 'push') : opts.push ? 'push' : 'preview';
  if (action === 'push' && !API_KEY) {
    log('FATAL 未配置 XIAOLONGXIA_API_KEY。请先访问 /admin 后台创建 API 密钥，再把完整 ait_... 字符串填入环境变量');
    process.exit(1);
  }
  log(`模式: ${action} | 目标: ${SITE} | 每次最多: ${opts.limit} 篇`);
  if (opts.daemon) {
    daemon(opts);
    return;
  }
  const count = await runOnce(opts);
  if (action === 'push' && count === 0) process.exitCode = 2;
}

process.on('SIGINT', () => {
  log('收到 SIGINT，worker 退出');
  process.exit(0);
});
process.on('SIGTERM', () => {
  log('收到 SIGTERM，worker 退出');
  process.exit(0);
});

main().catch((err) => {
  log('FATAL', err.stack || err.message);
  process.exit(1);
});
