# “小龙虾”自动发文接入说明

## 内容分工

本站只有两个分类，机器人按不同节奏推送。“小龙虾”只能发布 `ai-news`；`ai-tools` 由人工维护，发布接口会拒绝工具类内容。

| 分类 | 内容 | 频率 | 更新方式 |
| --- | --- | --- | --- |
| `ai-news` | 模型发布、Agent 生态、厂商动态 | 每天 2 篇 | “小龙虾”自动发布，页面显示发布日期 |
| `ai-tools` | 热门 AI 工具与中转站收录 | 按热点补充 | 人工维护，不显示日期，可放推荐链接 |

## API 密钥从哪里来

发布接口不使用平台发来的校验码，也不需要你在终端生成令牌。密钥在部署后的 `/admin` 后台创建：

1. 打开 `https://你的域名/admin`，首次访问先设置管理密码并登录。
2. 在“API 密钥”面板输入名称并创建密钥，页面会完整显示一次 `ait_...`。
3. 立即复制这串密钥，把它填到“小龙虾”任务的环境变量或固定任务说明中。

后台登录使用你设置的密码；发布接口使用后台创建的 API 密钥。二者互不混淆，密钥随时可以在后台吊销并重新创建。Cloudflare 部署后不需要改任何站点环境变量就能调用发布接口。

## 接口

### 单篇发布

```http
POST https://你的域名/api/posts
Authorization: Bearer 你在 /admin 后台创建的 API 密钥
Content-Type: application/json
```

资讯示例：

```json
{
  "title": "示例 AI 资讯 - 厂商发布新模型",
  "slug": "example-ai-news",
  "category": "ai-news",
  "tags": ["大模型", "行业动态"],
  "summary": "一句话摘要，会用于搜索结果和卡片。",
  "cover": { "url": "https://example.com/favicon.ico", "alt": "厂商名" },
  "sourceUrl": "https://example.com/news/xxx",
  "sections": [
    { "heading": "事件背景", "body": "<p>介绍事件发生的原因与节点。</p>" },
    { "heading": "关键进展", "body": "<p>说明官方公告内容，并附 <a href=\"https://example.com/news/xxx\">原文链接</a>。</p>" },
    { "heading": "行业影响", "body": "<p>对开发者、用户或市场的影响。</p>" },
    { "heading": "下一步关注", "body": "<p>值得继续观察的变量。</p>" }
  ],
  "faq": [
    { "q": "对行业有什么影响？", "a": "回答。" }
  ],
  "hotScore": 95,
  "publishedAt": "2026-08-16T09:00:00+08:00"
}
```

发布接口只接受 `category: ai-news`。传 `ai-tools` 或其他分类会返回 400。

工具的 `officialUrl`（官网）和 `recommendUrl`（你的带参链接或中转站链接）会一起展示在工具详情页。固定渠道链接写在 `data/referrals.json` 里，键名用工具 slug，重新打包部署后生效：

```json
{
  "siliconflow": "https://cloud.siliconflow.cn/i/1TkUUVFU",
  "opencode": "https://opencode.ai/go?ref=5MDMN0M505"
}
```

### 定时发布

把 `publishedAt` 设为未来时间即可自动进入定时队列，也可以显式传 `"status": "scheduled"`：

```json
{
  "title": "明天发布的资讯",
  "slug": "tomorrow-news",
  "category": "ai-news",
  "tags": ["行业动态"],
  "sourceUrl": "https://example.com",
  "sections": [{ "heading": "事件背景", "body": "<p>内容</p>" }],
  "status": "scheduled",
  "publishedAt": "2026-08-17T09:00:00+08:00"
}
```

站点的 Pages Function 每次被访问时会自动把到期的定时文章标记为已发布。如果同一个 slug 已存在，会覆盖更新，方便机器人修正内容后重推。

### 批量推送

适合“小龙虾”每天把两篇资讯一起提交：

```http
POST https://你的域名/api/posts/batch
Authorization: Bearer 你在 /admin 后台创建的 API 密钥
Content-Type: application/json
```

```json
[
  { "title": "资讯 A", "slug": "news-a", "category": "ai-news", "tags": [], "sections": [{ "heading": "事件背景", "body": "<p>A</p>" }] },
  { "title": "资讯 B", "slug": "news-b", "category": "ai-news", "tags": [], "sections": [{ "heading": "事件背景", "body": "<p>B</p>" }] }
]
```

### 调用示例

```bash
curl -X POST https://你的域名/api/posts \
  -H "Authorization: Bearer 你在 /admin 后台创建的 API 密钥" \
  -H "Content-Type: application/json" \
  -d '{"title":"Demo AI 资讯","slug":"demo-ai-news","category":"ai-news","tags":["AI"],"sections":[{"heading":"事件背景","body":"<p>demo</p>"}]}'
```

## 在“小龙虾”里配置

1. 部署站点并打开 `/admin`，首次访问设置管理密码，创建 API 密钥。
2. 新建定时任务，触发器设为每天 10:00、17:00，时区 `Asia/Shanghai`。
3. 把 `prompts/xiaolongxia-publish-prompt.txt` 全文粘贴到任务说明中，替换其中的域名和 API 密钥。
4. 先手动运行一次预览，只生成文章并检查 JSON；确认无误后再开启定时。
5. 发布成功后可以直接打开 `/admin` 查看已发布列表、定时队列、API 密钥状态和操作记录。

发布前可先调用 `GET /api/posts?limit=100` 检查标题和 `sourceUrl` 是否重复，避免重复发文。

## 内置 worker（可选）

项目里保留了一份本地自动发文脚本（`scripts/xiaolongxia-worker.js`），用于在本地或其他环境抓热点、调用国内云厂商模型生成并发布。它不是站点运行所必需的，站点本身完全跑在 Cloudflare Pages + D1 上。

```bash
npm run bot:preview   # 只预览本次会发的文章，不写入
npm run bot:push      # 抓取、生成并立即发布
npm run bot:template  # 没配模型 Key 时用模板发布一篇，仅测试链路
```

worker 需要在自己的环境变量里配置：

```dotenv
SITE_URL=https://你的域名
XIAOLONGXIA_API_KEY=后台创建的完整 ait_... 密钥
OPENAI_COMPATIBLE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MODEL_API_KEY=sk-你的模型Key
MODEL_NAME=qwen-plus
XIAOLONGXIA_TIMES=10:00,17:00
XIAOLONGXIA_MAX_PER_RUN=1
XIAOLONGXIA_TIMEZONE=Asia/Shanghai
```

这些变量只被 worker 脚本读取，不影响 Cloudflare 部署。worker 只允许发布 `ai-news`，每次抓取会先做标题/链接去重；资讯封面会尽量下载来源站点真实图标，下载失败才使用本地默认图。

## 后台查看发文结果

管理后台位于 `/admin`，管理员和小龙虾任务都可以查看，不需要开放注册。使用首次访问时设置的管理密码登录，后台包含：

- 已发布 AI 资讯列表：标题、发布时间、来源，可打开前台详情页
- 定时发布队列：显示 `status: scheduled` 的文章与计划发布时间
- AI 工具收录：只读展示，工具内容仍由人工维护
- API 密钥：创建、吊销、最近使用时间
- 自动发文日志：最近 30 条发布、定时、删除记录

`GET /api/health` 可以查看当前已发布与定时数量。删除误发资讯只能在后台操作，删除时校验会话 Cookie 与 CSRF。

## 安全注意

- API 密钥只放在“小龙虾”任务的私有环境里，不要写进前端代码或公开仓库。
- 密钥在后台吊销后应立即更新“小龙虾”任务里的密钥，否则发布接口会拒绝旧密钥。
- 发布 API 返回的文章内容按原样渲染，机器人不要携带 `<script>`、`<iframe>` 等代码。
- 每天固定量级发文更容易通过广告平台审核；不要用机器搬运他人的原创文章。
- 资讯要保留 `sourceUrl`，方便读者溯源，也有利于广告与搜索审核。
