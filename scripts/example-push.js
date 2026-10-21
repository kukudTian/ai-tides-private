#!/usr/bin/env node

const SITE = process.env.SITE_URL || 'http://localhost:3000';
const API_KEY = process.env.XIAOLONGXIA_API_KEY || '';

async function push() {
  const payload = {
    title: '示例 AI 资讯 - 自动化机器人推文',
    slug: 'example-ai-news',
    category: 'ai-news',
    tags: ['AI资讯', '自动化'],
    summary: '这是通过发布 API 推送的示例资讯，用来验证“小龙虾”接入链路。',
    sourceUrl: 'https://example.com/news/example-ai',
    sections: [
      { heading: '事件背景', body: '<p>这是一篇由脚本调用发布 API 创建的文章，用来验证资讯自动发文链路。</p>' },
      { heading: '关键进展', body: '<ul><li>支持定时发布</li><li>支持批量推送</li><li>自动生成 SEO 页面</li></ul>' },
      { heading: '下一步关注', body: '<p>把脚本里的 payload 换成机器人生成的资讯结构，每天定时调用即可。</p>' },
    ],
    faq: [
      { q: '这个接口安全吗？', a: '接口使用 API 密钥鉴权，密钥在 /admin 后台创建后填入 XIAOLONGXIA_API_KEY。' },
      { q: '可以定时发文吗？', a: '可以，设置 status=scheduled 和未来的 publishAt 即可。' },
    ],
    hotScore: 90,
  };

  if (!API_KEY) {
    console.error('缺少 XIAOLONGXIA_API_KEY。请先在 /admin 后台创建 API 密钥，再设置环境变量 XIAOLONGXIA_API_KEY=ait_...');
    process.exit(1);
  }

  const res = await fetch(`${SITE}/api/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log(res.status, JSON.stringify(data, null, 2));
}

push().catch((err) => {
  console.error(err);
  process.exit(1);
});
