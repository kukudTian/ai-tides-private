# “小龙虾”完整发布提示词

可直接复制的完整提示词在 `prompts/xiaolongxia-publish-prompt.txt`。把它粘贴到“小龙虾”的固定任务描述或新建技能里，并把文中两处占位替换成真实值：

- `https://你的域名` → 站点正式地址，例如 `https://news.example.com`
- API 密钥 → 完成 Cloudflare Pages 部署后打开 `/admin`，首次访问设置管理密码并登录，然后在“API 密钥”面板创建密钥；复制页面显示的完整 `ait_...` 字符串，把它填进“小龙虾”任务的环境变量，站点本身不需要改动。

## 最新提示词要点

- 发布节奏：每天北京时间 10:00 和 17:00 各发 1 篇，每次只发 1 篇；找不到合格选题就跳过，不硬写凑数。
- 发什么：优先写 AI 工具、模型、AI 厂商本身，包括新模型、新能力、API/价格调整、产品线变化；当天没有 AI 工具类选题时，才扩展为与 AI 明确相关的知名科技公司商业动态，与 AI 无关的不写。
- 搜索优化：知乎热榜按最高优先级放在第一步，每次运行必须先执行 `zhihu-cli hot --limit 40`，不允许跳过后再做其他搜索；然后再用 `zhihu-cli search` 补充 AI 关键词，最后才用搜索引擎和微信生态做交叉验证。知乎热榜实时更新、讨论度高，能最快反映今天用户真正关心的话题，补上搜索引擎索引延迟的选题。
- 微信公众号来源：第三步用微信搜一搜或搜狗微信搜索补候选，优先关注量子位、机器之心、新智元、APPSO、爱范儿、InfoQ、极客公园、硅星人、AI 前线等中文科技公众号；`mp.weixin.qq.com` 原文可打开就作为候选，无法打开正文时至少提取标题、摘要、公众号名称和发布时间，再用官方公告或其他媒体报道交叉核实。
- 语言风格：理性克制，像专业科技编辑，不用“震惊/重磅/最强”等夸张词，不写“标志着/赋能/颠覆/引领”，不写“本站/小编/每天发布”等内部运营表述；标题和开头直接写清“谁 + 做了什么 + 为什么值得关注”，每篇给读者明确“要不要试用、要不要换工具、要不要跟进”。
- 内容质量（AdSense 重点）：每篇 sections 改为 5-7 节、正文 1500-2600 字，围绕“事件背景 / 关键事实 / 为什么重要 / 对谁有影响 / 下一步怎么做 / 编辑补充”自由拟定；不只复述官方摘要，必须有编辑判断、具体影响和行动建议；faq 3-5 条，禁止空话套话和“请查看官网”式无效答案。
- 图标细节：AI 工具图标不是可选项。资讯封面、工具卡片、详情页统一使用真实品牌图标：优先取厂商官网 `<link rel="icon">`、`/favicon.ico`、`/apple-touch-icon.png`、页面实际 Logo；有专属标识就用专属标识，例如 DeepSeek Harness 用黑色鲨鱼 Logo、豆包用豆包图标，禁止生成或使用“单色背景 + 字母”占位图。涉及工具时必须同时校验 `officialUrl` 和 `cover`；图标必须是 HTTPS 直链且可直接访问、返回真实图片格式，失败后记录缺图原因并提醒人工补全，不能直接忽略。

## 在“小龙虾”里怎么配置

1. 新建一个定时任务或技能，触发器设为：
   - 每天 10:00，时区 `Asia/Shanghai`
   - 每天 17:00，时区 `Asia/Shanghai`
2. 把提示词全文粘贴到任务说明中。
3. 确认任务环境里有以下能力，提示词第 2 节会按需调用：
   - 网页搜索
   - 网页读取/抓取
   - 知乎 CLI（第一优先级热点源）
   - HTTP 请求
   - 定时任务
   - 文件记录（去重清单）
4. 先手动运行一次预览：让它只生成文章并检查 JSON，不调用发布 API；确认无误后再开启自动定时。
5. 提示词第 6 节是发布前自检清单：标题长度、摘要字数、章节结构、来源链接、发布时间和禁用词逐项通过后才允许发文；第 1 节也要求找不到合格选题时跳过本次，不硬写凑数。

## 知乎热点源怎么配

“小龙虾”环境里安装一次知乎 CLI，或者允许它通过 npx 调用：

```bash
npm install -g zhihu-cli

# 读取知乎实时热榜，推荐每轮至少执行一次
zhihu-cli hot --limit 40

# 补充搜索 AI 关键词
zhihu-cli search --query "AI 大模型" --type general --limit 10

# 搜索接口需要登录态时，先配置 Cookie
zhihu-cli login
```

如果不想全局安装，把命令写成 `npx --yes zhihu-cli hot --limit 40`。热榜读取不需要登录；搜索接口需要登录态时，先在服务器或“小龙虾”环境里执行 `zhihu-cli login` 或 `zhihu-cli set-cookie`。

提示词要求每次运行第一步就是 `zhihu-cli hot --limit 40`，这是选题的最高优先级，先于搜索引擎和微信搜索：

```bash
# 每次运行最先执行，读取知乎实时热榜
npx --yes zhihu-cli hot --limit 40

# 再用 AI 关键词补候选
npx --yes zhihu-cli search --query "AI 大模型"
npx --yes zhihu-cli search --query "AI 工具"
npx --yes zhihu-cli search --query "Agent"
```

## 微信公众号来源怎么配

无需额外安装工具，用普通网页搜索/抓取即可：

1. 微信搜一搜：在微信内搜索“AI 大模型、OpenAI、DeepSeek、豆包、Agent、AI 编程工具”。
2. 搜狗微信搜索：`https://weixin.sogou.com`，同一批关键词。
3. 优先关注：量子位、机器之心、新智元、APPSO、爱范儿、InfoQ、极客公园、硅星人、AI 前线。
4. 公众号原文链接通常是 `mp.weixin.qq.com`；可以打开正文时作为候选并记录作者与发布日期，打不开时至少记录标题、摘要、公众号名称和发布时间，再用官方公告或其他媒体交叉核实。

## AI 工具图标怎么配

提示词里把真实图标设成了发布必做项，不只是资讯封面，工具卡片和详情页也统一执行：

1. 先取官网 `<link rel="icon">` 或 `/favicon.ico`。
2. 再试 `/apple-touch-icon.png`、`/android-chrome-192x192.png` 或页面实际使用的 Logo 文件。
3. 有专属品牌标识时使用专属标识，例如 DeepSeek Harness 用黑色鲨鱼 Logo、豆包用豆包图标，不能退回首字母。
4. 检查图标是 HTTPS 直链、可直接访问、返回 png/svg/ico/webp，不用 base64、临时截图或第三方错误页。
5. 涉及 AI 工具时同时补齐 `officialUrl`（官网）和 `cover` 两个字段；获取失败要记录原因并提醒人工补全，不能直接忽略。

## 内置 worker 的等价方案

如果你不想用“小龙虾”的提示词编排，也可以直接用项目自带的自动发文脚本，它在本地电脑或其他常驻环境完成同样的“抓热点 → 模型生成 → 发布”，Cloudflare Pages 站点本身不依赖它：

```bash
npm run bot:daemon
```

此时 `.env` 配置：

```dotenv
XIAOLONGXIA_TIMES=10:00,17:00
XIAOLONGXIA_MAX_PER_RUN=1
XIAOLONGXIA_TIMEZONE=Asia/Shanghai
OPENAI_COMPATIBLE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MODEL_API_KEY=sk-你的模型Key
MODEL_NAME=qwen-plus
XIAOLONGXIA_API_KEY=后台创建的完整 ait_... 密钥
SITE_URL=https://你的域名
```

内置 worker 的默认抓取源已包含知乎热榜、Hacker News 和 GitHub Trending；如果希望它更像提示词里那样覆盖厂商官方博客和中文商业动态，可以后续扩展 `scripts/lib/topic-sources.js`。需要临时指定热点源时执行：

```bash
node scripts/xiaolongxia-worker.js --push --sources=zhihu-hot,hn-ai,github-trending
```

## 两套方案怎么选

| 对比项 | “小龙虾”提示词方案 | 内置 worker 方案 |
| --- | --- | --- |
| 发布节奏 | 小龙虾定时任务 10:00 / 17:00 | `XIAOLONGXIA_TIMES=10:00,17:00` |
| 每次篇数 | 提示词写明每次 1 篇 | `XIAOLONGXIA_MAX_PER_RUN=1` |
| 搜索范围 | 提示词内两轮搜索，范围更广 | 代码固定 HN / GitHub Trending |
| 调用工具 | 网页搜索、抓取、HTTP、定时、日志 | 内置抓取与模型接口 |
| 维护成本 | 改提示词即可 | 需要改代码 |

推荐先用“小龙虾”提示词方案，跑一周后看选题质量和发文成功率；如果某个环节不稳定，再切回内置 worker 或两者结合。

## 常见问题

### 小龙虾没有网页搜索工具怎么办？

把提示词第 3 节的“第一轮搜索”改成抓取官方 RSS 或页面：

- `https://openai.com/news/`
- `https://www.anthropic.com/news`
- `https://blog.google/technology/ai/`
- `https://huggingface.co/blog`
- `https://github.com/trending?since=daily`

要求小龙虾逐个打开页面，只保留标题或链接里出现 AI 关键词的内容。

### 怎么确认真的发布了？

发布后用浏览器打开 `https://你的域名/admin`，用首次访问时设置的管理密码登录，查看“自动发文记录”和“已发布 AI 资讯”列表。

### 发布失败最常见的原因？

- 站点还没启动或域名解析没生效
- `XIAOLONGXIA_API_KEY` 与 `/admin` 后台创建的完整密钥不一致，或密钥已经在后台被吊销
- `category` 不是 `ai-news`
- 标题或 sourceUrl 与已有文章重复

提示词第 5 节已经包含这些失败分支的处理规则。
