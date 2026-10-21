# AI 潮汐 Cloudflare Pages 包

这是单一部署包，不包含任何云服务器依赖。目录结构：

```text
ai-tides-cloudflare/
  dist/                 静态页面与资源
  functions/            Pages Functions：前台 SSR、/admin、/api、定时发布
  wrangler.toml         Pages 配置 + D1 绑定
  docs/                 部署、小龙虾接入、SEO 说明
  prompts/              “小龙虾”发布提示词
  data/                 人工维护的工具与推荐链接
```

数据存在 Cloudflare D1，页面和 API 都由 Cloudflare Pages Functions 提供，不需要重启、不需要常驻进程。

## 第一次安装

### 1. 创建 D1 数据库

```powershell
npx -y wrangler d1 create ai-tides
```

命令会输出一个 `database_id`，把它填进 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "ai-tides"
database_id = "粘贴你的数据库ID"
```

### 2. 部署

在本目录（`dist` 和 `functions` 的同级目录）运行：

```powershell
npx -y wrangler pages deploy dist --project-name aiblog
```

如果项目还不存在，Wrangler 会提示创建；已有项目则直接覆盖静态资源和 Functions。部署后访问 `https://<项目名>.pages.dev` 或已绑定的自定义域名。

### 3. 设置站点变量

在 Cloudflare Pages 项目设置的 Variables 中添加：

```text
SITE_URL = https://你的域名
SITE_NAME = AI 潮汐
SITE_TAGLINE = 实时追踪 AI 热点，不错过每一个值得关注的新变化
```

`wrangler.toml` 中已带默认值，但正式域名请以项目环境变量为准，否则 canonical、sitemap 和 RSS 可能指向旧地址。

### 4. 打开后台设置密码

访问 `https://你的域名/admin`。首次打开会显示“设置管理密码”，设置后自动登录；在“API 密钥”面板创建一把 `ait_...` 密钥，把完整字符串交给“小龙虾”任务。不需要先在本地生成 token，也不存在平台校验码。

如果 `/admin` 返回 404，说明本次部署没有带上 Functions：

- 确认部署命令在 `dist` 与 `functions` 的同级目录执行
- 确认 Pages 项目绑定了一个名为 `DB` 的 D1 数据库
- 确认域名 DNS 指向当前 Pages 项目
- 确认 `functions/[[path]].js` 及 `_lib`、`_data`、`_templates.js` 都随包上传

### 5. 配置 Google AdSense（广告）

前台页面由 Pages Functions 渲染，会从运行时环境读取广告配置。请在 Cloudflare Pages
项目设置 → Settings → Variables 中把这些值作为「加密变量（Secret）」添加（不要放进
`wrangler.toml` 的 `[vars]`，否则会与 secret 重名导致部署报错）：

```text
ADSENSE_CLIENT = ca-pub-4951997546216729
ADS_TXT = google.com, pub-4951997546216729, DIRECT, f08c47fec0942fa0
```

命令行方式（在项目目录执行）：

```powershell
"ca-pub-4951997546216729" | npx -y wrangler pages secret put ADSENSE_CLIENT --project-name aiblog
"google.com, pub-4951997546216729, DIRECT, f08c47fec0942fa0" | npx -y wrangler pages secret put ADS_TXT --project-name aiblog
```

配置后所有页面的 `<head>` 都会自动带上 AdSense 脚本，`/ads.txt` 会返回对应的直连行。
目前采用 AdSense 自动广告；若要在特定位置放手动广告单元，需在 AdSense 后台创建广告单元，
把对应的 slot ID 填进 `ADSENSE_SLOTS` 后再部署。

## 本地预览

```powershell
npx -y wrangler pages dev dist --d1 DB --local --port 8787
```

功能与线上一致：前台页面、`/admin` 首次设置密码、创建 API 密钥、定时队列、RSS/sitemap 都会在本地生效。首次运行自动建表并写入种子数据。

## 发布接口

```http
POST /api/posts
Authorization: Bearer 后台创建的完整 ait_... 密钥
Content-Type: application/json
```

只接受 `category: ai-news`。可以用 `/api/posts/batch` 一次推两篇，也可以传未来 `publishedAt` 自动进定时队列；需要显式草稿时再传 `"status": "scheduled"`。发布后前台、`/rss.xml`、`/sitemap.xml` 会立即反映新内容。

## 收录申请表单与邮件推送

用户在前台 `/partner/` 提交“合作收录”表单后，资料会：

1. 完整保存到 Cloudflare D1（`partner_submissions` 表），任何情况下都不会丢。
2. 显示在 `/admin` 后台的“合作收录申请”面板，可直接查看产品名、联系方式、官网与说明。
3. 若配置了邮件 API，会同步推送到 `CONTACT_EMAIL`（默认 `1534838732@qq.com`）。

Cloudflare Pages 无法直接发送 SMTP，需要在项目设置中添加一个邮件服务变量。推荐免费的 Resend：

- 到 https://resend.com 注册并创建 API Key
- 在 Cloudflare Pages 项目设置 → Variables 添加：
  - `RESEND_API_KEY` = 你的 Resend API Key
  - `EMAIL_FROM` = 发件地址（Resend 免费域名用 `onboarding@resend.dev`，或你的已认证域名）
- 保存后重新部署即可。未配置时申请仍会进后台，不会丢失。

也可用 Mailgun（`MAILGUN_API_KEY` + `MAILGUN_DOMAIN`）。注意：QQ / 网易等国内邮箱对境外邮件服务商的拦截较严，邮件可能进垃圾箱或延迟到达；后台“合作收录申请”面板是始终可靠的查看方式。

## 重新打包

改完文章数据、推荐链接、提示词或前端代码后，回到项目根目录：

```powershell
& .\scripts\package.ps1 -SiteUrl "https://你的域名"
```

输出 `outputs/AI-Tides-Cloudflare-Pages.zip`，解压替换本目录内容后重复第 2 步部署。
