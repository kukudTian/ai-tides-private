const HN_TOP_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM_URL = 'https://hacker-news.firebaseio.com/v0/item/';
const HN_ALGOLIA_URL = 'https://hn.algolia.com/api/v1/search_by_date';
const { exec } = require('child_process');

const FETCH_TIMEOUT_MS = 12000;
const AI_KEYWORDS = [
  ' ai', 'ai ', 'llm', 'gpt', 'claude', 'openai', 'anthropic', 'deepseek', 'gemini',
  'gemma', 'llama', 'mistral', 'qwen', 'doubao', 'kimi', 'grok', ' xai', 'chatbot',
  'machine learning', 'neural', 'transformer', 'agent', 'copilot', ' model', 'hugging face',
  'pytorch', 'tensorflow', 'diffusion', 'multimodal', 'generative', 'inference', 'sora',
  'midjourney', 'stable diffusion', 'computer vision', 'foundation model', 'open source model',
];

async function fetchJson(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'AI-Tides-Bot/0.1' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function fetchText(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      accept: 'text/html',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(title) {
  return String(title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function isAiRelevant(topic) {
  const text = `${topic.title || ''} ${topic.summary || ''}`.toLowerCase();
  return AI_KEYWORDS.some((kw) => text.includes(kw));
}

async function hnTopStories(limit = 20) {
  try {
    const ids = (await fetchJson(HN_TOP_URL)).slice(0, limit);
    const items = [];
    for (const id of ids) {
      try {
        const item = await fetchJson(`${HN_ITEM_URL}${id}.json`);
        if (item && item.title && item.url) {
          const topic = {
            id: String(id),
            title: cleanTitle(item.title),
            url: String(item.url),
            summary: stripHtml(item.text).slice(0, 240),
            source: 'Hacker News',
          };
          if (isAiRelevant(topic)) items.push(topic);
        }
      } catch {
        // 单条失败不影响整批抓取
      }
    }
    return items;
  } catch {
    // Firebase API 在部分网络不可用，改用 Algolia 的 front_page 接口
    const data = await fetchJson(`${HN_ALGOLIA_URL}?tags=front_page&hitsPerPage=${limit}`);
    return (data.hits || [])
      .filter((h) => h.title && h.url)
      .map((h) => ({
        id: String(h.objectID || ''),
        title: cleanTitle(h.title),
        url: String(h.url),
        summary: stripHtml(h.story_text).slice(0, 240),
        source: 'Hacker News',
      }))
      .filter(isAiRelevant);
  }
}

async function hnAlgolia(query, hits = 15) {
  const url = `${HN_ALGOLIA_URL}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${hits}`;
  const data = await fetchJson(url);
  return (data.hits || [])
    .filter((h) => h.title && h.url)
    .map((h) => ({
      id: String(h.objectID || ''),
      title: cleanTitle(h.title),
      url: String(h.url),
      summary: stripHtml(h.story_text).slice(0, 240),
      source: `Hacker News / ${query}`,
    }))
    .filter(isAiRelevant);
}

async function githubTrending(limit = 15) {
  const html = await fetchText('https://github.com/trending?since=daily', 15000);
  const blocks = html.match(/<article class="Box-row">[\s\S]*?<\/article>/g) || [];
  const items = [];
  for (const block of blocks.slice(0, limit)) {
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^"#?]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const [owner, repo] = stripHtml(titleMatch[2])
      .replace(/\s+/g, ' ')
      .trim()
      .split(' / ')
      .map((s) => s.trim());
    if (!owner || !repo) continue;
    const h2End = block.indexOf('</h2>');
    const afterH2 = h2End >= 0 ? block.slice(h2End) : block;
    const descMatch = afterH2.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const summary = descMatch ? stripHtml(descMatch[1]).slice(0, 240) : '';
    const item = {
      id: `${owner}/${repo}`,
      title: `${owner}/${repo}${summary ? `：${summary}` : ' 登顶 GitHub Trending'}`.slice(0, 120),
      url: `https://github.com/${owner}/${repo}`,
      summary,
      source: 'GitHub Trending',
    };
    if (isAiRelevant(item)) items.push(item);
  }
  return items;
}

function runZhihuCli(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const binary = process.env.ZHIHU_CLI_BIN || 'npx';
    const command = `${binary} --yes zhihu-cli --format json ${args.join(' ')}`;
    exec(command, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`zhihu-cli 调用失败: ${err.message}${stderr ? `：${String(stderr).trim().slice(0, 300)}` : ''}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseErr) {
        reject(new Error(`zhihu-cli 输出解析失败: ${parseErr.message}`));
      }
    });
  });
}

function topicFromZhihuItem(item, source) {
  if (!item || typeof item !== 'object') return null;
  const question = item.question || item.target || {};
  const title = String(item.title || question.title || '');
  const excerpt = String(item.excerpt || item.description || question.excerpt || question.description || '');
  const id = String(item.questionId || item.id || question.id || '');
  const url = String(item.url || question.url || (id ? `https://www.zhihu.com/question/${id}` : ''));
  if (!title || !url) return null;
  return {
    id,
    title: cleanTitle(title),
    url,
    summary: stripHtml(excerpt).slice(0, 240),
    source,
  };
}

async function zhihuHot(limit = 40) {
  const data = await runZhihuCli(['hot', '--limit', String(limit)]);
  const items = Array.isArray(data && data.data) ? data.data : [];
  return items
    .map((item) => topicFromZhihuItem(item, '知乎热榜'))
    .filter(Boolean)
    .filter(isAiRelevant)
    .slice(0, limit);
}

async function zhihuSearch(query, limit = 10) {
  const data = await runZhihuCli([
    'search',
    '--query', query,
    '--type', 'general',
    '--limit', String(limit),
  ]);
  const items = Array.isArray(data && data.data) ? data.data : [];
  return items
    .map((item) => topicFromZhihuItem(item, `知乎搜索 / ${query}`))
    .filter(Boolean)
    .filter(isAiRelevant)
    .slice(0, limit);
}

function curatedTopics() {
  return [
    {
      title: 'DeepSeek 官方动态：开放平台与开源项目更新',
      url: 'https://api-docs.deepseek.com/',
      summary: 'DeepSeek 官方开放平台持续更新模型版本、API 能力与开源 Harness 等工程组件。',
      source: 'DeepSeek 官方',
    },
    {
      title: 'OpenAI 官方动态：新产品与开发者平台更新',
      url: 'https://openai.com/news/',
      summary: 'OpenAI 新闻页聚合模型发布、产品升级与开发者生态的最新公告。',
      source: 'OpenAI 官方',
    },
    {
      title: 'Anthropic 官方动态：Claude 产品与安全研究更新',
      url: 'https://www.anthropic.com/news',
      summary: 'Anthropic 官方新闻页聚合 Claude 能力升级、研究进展与企业合作动态。',
      source: 'Anthropic 官方',
    },
    {
      title: 'Google AI 官方动态：Gemini 与开发者工具更新',
      url: 'https://blog.google/technology/ai/',
      summary: 'Google 官方 AI 博客聚合 Gemini、Gemma 与 AI 开发者工具的最新进展。',
      source: 'Google AI 官方',
    },
    {
      title: '阿里云百炼官方动态：大模型服务平台更新',
      url: 'https://help.aliyun.com/zh/model-studio/',
      summary: '阿里云百炼是面向开发者的模型服务平台，官方文档持续更新模型与工具能力。',
      source: '阿里云百炼',
    },
    {
      title: '火山引擎豆包官方动态：大模型与智能体更新',
      url: 'https://www.volcengine.com/product/doubao',
      summary: '火山引擎豆包官方产品页聚合模型能力、应用场景与开发者接入信息。',
      source: '火山引擎豆包',
    },
    {
      title: 'Hugging Face 官方动态：开源模型与社区更新',
      url: 'https://huggingface.co/blog',
      summary: 'Hugging Face 官方博客聚合开源模型、工具链与 AI 社区的最新进展。',
      source: 'Hugging Face',
    },
    {
      title: 'Meta AI 官方动态：开源模型与多模态研究更新',
      url: 'https://ai.meta.com/blog/',
      summary: 'Meta AI 官方博客聚合 Llama 系列、多模态模型与基础研究的最新动态。',
      source: 'Meta AI 官方',
    },
  ];
}

function dedupe(topics) {
  const seen = new Set();
  return topics.filter((t) => {
    if (!t.url || seen.has(t.url)) return false;
    seen.add(t.url);
    return true;
  });
}

async function fetchHotTopics(options = {}) {
  const limit = Number(options.limit) || 40;
  const requested = Array.isArray(options.sources) && options.sources.length
    ? options.sources
    : ['zhihu-hot', 'hn-top', 'hn-ai', 'hn-llm', 'github-trending'];
  const buckets = [];
  const failures = [];

  if (requested.includes('zhihu-hot')) {
    try {
      buckets.push(await zhihuHot(40));
    } catch (err) {
      failures.push(`zhihu-hot: ${err.message}`);
    }
  }
  if (requested.includes('zhihu-search')) {
    for (const query of ['AI 大模型', 'AI 工具', 'Agent AI']) {
      try {
        buckets.push(await zhihuSearch(query, 10));
      } catch (err) {
        failures.push(`zhihu-search(${query}): ${err.message}`);
      }
    }
  }
  if (requested.includes('hn-top')) {
    try {
      buckets.push(await hnTopStories(20));
    } catch (err) {
      failures.push(`hn-top: ${err.message}`);
    }
  }
  if (requested.includes('hn-ai')) {
    try {
      buckets.push(await hnAlgolia('AI', 15));
    } catch (err) {
      failures.push(`hn-ai: ${err.message}`);
    }
  }
  if (requested.includes('hn-llm')) {
    try {
      buckets.push(await hnAlgolia('LLM', 15));
    } catch (err) {
      failures.push(`hn-llm: ${err.message}`);
    }
  }
  if (requested.includes('github-trending')) {
    try {
      buckets.push(await githubTrending(15));
    } catch (err) {
      failures.push(`github-trending: ${err.message}`);
    }
  }

  const topics = dedupe(buckets.flat()).slice(0, limit);
  return {
    topics: topics.length ? topics : curatedTopics(),
    failures,
    usedFallback: topics.length === 0,
  };
}

module.exports = {
  fetchHotTopics,
  curatedTopics,
  githubTrending,
  zhihuHot,
  zhihuSearch,
};
