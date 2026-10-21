# Cloudflare Pages + D1 部署说明

## 架构

```text
用户浏览器
   ↓
Cloudflare Pages + Pages Functions（全球边缘）
   ↓
Cloudflare D1（文章、API 密钥、后台会话、定时队列）
   ↑
“小龙虾”定时任务（通过 API 密钥调用 /api/posts 发布 AI资讯）
```

整个站点没有云服务器、没有 PM2、没有 systemd。前端不需要任何用户登录，后台 `/admin` 和发布 API 都由同一套 Pages Functions 提供。

## 一、准备项目

在项目根目录生成单包：

```powershell
& .\scripts\package.ps1 -SiteUrl "https://你的域名"
```

脚本会输出 `outputs/AI-Tides-Cloudflare-Pages.zip`，并同步生成 `release/ai-tides-cloudflare/`。部署时直接使用这个目录，其中 `dist/` 和 `functions/` 必须在同级。

## 二、创建 D1 数据库

```powershell
npx -y wrangler d1 create ai-tides
```

把输出里的 `database_id` 填到 `release/ai-tides-cloudflare/wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "ai-tides"
database_id = "你的数据库ID"
```

也可以在 Cloudflare 控制台 D1 页面创建，并把数据库绑定到 Pages 项目的 `DB` 名称。首次请求站点时 Functions 会自动建表并写入种子数据，不需要手工执行迁移。

## 三、部署到 Cloudflare Pages

在 `release/ai-tides-cloudflare` 目录执行（确保当前目录同时能看到 `dist` 和 `functions`）：

```powershell
npx -y wrangler pages deploy dist --project-name aiblog
```

如果项目是第一次创建，Wrangler 会给出项目名；已有项目则更新到生产部署。部署完成后，在 Pages 项目设置里检查：

- 绑定：D1 数据库绑定名必须是 `DB`
- Variables：`SITE_URL=https://你的域名`
- Domains：`你的域名` 已添加到当前项目

自定义域名解析成功后，访问首页确认正常，再打开 `https://你的域名/admin`。

## 四、首次设置后台密码

1. 打开 `/admin`，第一次访问会出现“设置管理密码”表单。
2. 设置至少 8 位密码并确认，页面自动登录。
3. 在“API 密钥”面板创建一把密钥，页面只完整显示一次，立即复制 `ait_...`。
4. 把密钥填到“小龙虾”任务的环境变量或固定任务说明中，发布接口用 `Authorization: Bearer <密钥>` 鉴权。

后台和 API 都使用同一个 D1 数据库，不需要重启服务、不需要在终端生成校验码。

## 五、定时发布

本站不依赖站点自身的定时器。需要定时时在“小龙虾”侧配置每天 10:00、17:00 触发，让它调用发布 API：

```http
POST https://你的域名/api/posts/batch
Authorization: Bearer ait_你的完整密钥
Content-Type: application/json

[ { ...资讯A... }, { ...资讯B... } ]
```

也可以在文章里传未来 `publishedAt` 和 `"status": "scheduled"`，每次 Function 被访问时都会自动把到期的定时文章标记为已发布。Cloudflare 控制台 Cron Triggers 不适用于 Pages，如需纯平台定时触发，可用 Cloudflare Workers Cron 定期请求 `POST /api/cron/publish` 并带 `CRON_SECRET`。

## 六、常见问题

### 首页能打开，但 `/admin` 404

本次部署只上传了静态文件，Functions 没有生效。请从 `release/ai-tides-cloudflare`（`dist` 与 `functions` 同级）重新运行 `wrangler pages deploy dist --project-name aiblog`，并确认 Functions 目录中包含 `[[path]].js`、`_lib/`、`_data/`、`_templates.js`。

### `/admin` 500 或提示 D1 未绑定

Pages 项目缺少 `DB` D1 绑定。在控制台 Project Settings > Bindings 中添加 D1 数据库并命名为 `DB`，重新部署一次。

### 后台登录后空白

清除浏览器对该域名的缓存和 Cookie，重新访问 `/admin`；如果刚改过密码，先走 `/admin/logout` 再登录。

### 域名解析生效但页面是旧的

Pages 部署通常几十秒内生效。如果仍看到旧内容，回到项目部署列表把最新部署设为 Production，或等待 DNS/边缘缓存刷新。

### 文章发布后在 RSS 中看不到

发布接口返回 `ok: true` 后再打开 `https://你的域名/rss.xml`。RSS 由 Functions 动态生成，数据库写入后立即可用。
