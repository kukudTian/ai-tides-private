# AI 潮汐

一个跑在 Cloudflare Pages + D1 上的 AI 资讯与 AI 工具站：`AI资讯` 由“小龙虾”等自动化机器人每日定时写入，`AI工具` 只收录热门、有推荐价值的产品。访客无需注册或登录，发布只由后台创建的 API 密钥驱动。

## 项目是什么

`AI 潮汐` 是一个用于收集、筛选、整理和展示 AI 资讯与 AI 工具的内容站。它解决的问题是：你有一个 AI 内容源或工作流后，希望有一个可部署、可复用、可自动化更新的静态站点，不需要自己每天手动发文章，也不需要维护一份单独的机器人账号或云端服务器。

## 分类设计

- `AI资讯`：模型发布、Agent 生态、厂商动态，是自动发文的核心。
- `AI工具`：豆包、DeepSeek、即梦、LiblibAI、硅基流动、OpenCode 等热门工具与靠谱中转站，工具详情页展示官方链接和推荐链接。

聊天助手、编程助手、智能体、绘图、视频生成等不单独拆分类目，全部归入 `AI工具`。工具卡片不显示日期，资讯卡片显示发布日期。所有工具与资讯封面均使用官方品牌图标，不使用单色字母占位图。

## 一键打包

项目是“静态页面 + Pages Functions + D1”的单包结构，不依赖任何云服务器、PM2 或 systemd。

```powershell
& .\scripts\package.ps1 -SiteUrl "https://ai-blog.cloud"
```

脚本会依次执行模板预编译、种子数据生成、静态导出，然后把 `dist`、`functions`、`wrangler.toml`、文档和提示词收进 `release/ai-tides-cloudflare/`，并输出一个 `outputs/AI-Tides-Cloudflare-Pages.zip`。之后把该目录部署到 Cloudflare Pages 即可。

## 首次打开管理后台

部署完成后访问 `https://你的域名/admin`，第一次进入会看到“设置管理密码”表单。设置密码并登录后，在“API 密钥”面板创建一把 `ait_...` 密钥；页面只会完整显示一次，请立即复制并交给“小龙虾”任务使用。不需要在本地或终端生成任何校验码，也不存在平台发放的 token。

后台可以查看：已发布资讯、定时队列、AI 工具收录、API 密钥状态和自动发文记录，也可以删除误发的资讯。后台不开放用户注册，`robots.txt` 已禁止收录 `/admin/`。

## 发布 API

机器人把文章推送到：

```text
POST /api/posts
POST /api/hooks/xiaolongxia
POST /api/posts/batch
```

请求头：

```text
Authorization: Bearer 你在 /admin 后台创建的 API 密钥
Content-Type: application/json
```

发布接口只接受 `category: ai-news`，AI工具由人工维护。把 `publishedAt` 设为未来时间会自动进入定时队列（也可显式传 `"status": "scheduled"`），Function 收到请求时自动处理到期文章。

每日两篇资讯示例：

```json
{
  "title": "示例 AI 资讯 - 厂商发布新模型",
  "slug": "example-ai-news",
  "category": "ai-news",
  "tags": ["大模型", "行业动态"],
  "summary": "详情页描述与搜索摘要",
  "cover": { "url": "https://example.com/favicon.ico", "alt": "厂商名" },
  "sourceUrl": "https://example.com/news",
  "sections": [
    { "heading": "事件背景", "body": "<p>正文内容</p>" },
    { "heading": "关键进展", "body": "<ul><li>进展一</li></ul>" }
  ],
  "faq": [
    { "q": "对行业有什么影响？", "a": "回答。" }
  ],
  "hotScore": 95,
  "publishedAt": "2026-08-16T10:00:00+08:00"
}
```

## 推荐链接配置

工具详情页的“推荐入口”读取 `data/referrals.json`，打包前会自动合并进 `cloudflare/functions/_data/referrals.json`：

```json
{
  "siliconflow": "https://cloud.siliconflow.cn/i/1TkUUVFU",
  "opencode": "https://opencode.ai/go?ref=5MDMN0M505"
}
```

修改后重新运行打包脚本并部署即可。工具类内容只在这里人工维护，发布 API 不接受工具分类。

## 本地预览

```powershell
npm install
npx -y wrangler pages dev dist --d1 DB --local --port 8787
```

打开 `http://localhost:8787`，可验证 `/admin` 首次设置密码、创建 API 密钥和本地发布链路。首次运行会在本地 D1 中自动建表并写入种子数据。

## SEO 已内置

- 每个资讯/工具页有独立 URL、title、description、canonical
- 自动生成 `sitemap.xml`、`rss.xml`、`robots.txt`
- 详情页内置 `Article`、`BreadcrumbList`、`FAQPage` 结构化数据
- 资讯采用事件背景/关键进展/行业影响模板；工具采用是什么/功能/场景/定价/上手模板
- 同分类、同标签、相关推荐、热门榜互相内链
- 分类页与标签页自动生成，旧 AI 子分类 301 到 `AI工具`

## 部署

详细步骤见 [docs/deployment.md](./docs/deployment.md) 和本包内 `cloudflare/README-cloudflare.md`。数据全部存在 Cloudflare D1，前端不需要任何用户登录，页面由 Cloudflare 全球网络提供。

## 广告位

不配置 AdSense 或 Microsoft Ads 时，前台不显示任何广告占位；配置 `ADSENSE_CLIENT`、`ADSENSE_SLOTS` 后页面会渲染真实广告代码，`ads.txt` 也会同步切换。
