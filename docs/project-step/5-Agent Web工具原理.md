# Agent Web 工具原理

Agent 的 Web 工具解决的核心问题：**让 LLM 能够获取和理解互联网上的实时信息。**

这需要两种独立且互补的能力：

| 能力 | 解决什么问题 | 类比 |
|------|------------|------|
| **Search（搜索）** | 用户没给 URL，Agent 怎么知道去哪里找信息 | 查图书馆目录，找到想看的书在哪 |
| **Fetch（抓取）** | 有了 URL，怎么把网页内容变成 LLM 能理解的格式 | 把书从书架上拿下来，翻到指定页 |

两者缺一不可：没有 Search，Agent 只能等用户喂 URL；没有 Fetch，搜到的链接也读不了。

---

## 一、Search（搜索）

### 1.1 为什么 LLM 不能自己「想」出搜索结果？

LLM 的训练数据有截止日期，URL 会过期、网站会改版、实时事件训练数据里根本没有。LLM 无法预知「今天北京天气」或「Claude 最新价格」。

它也不能自己拼 URL 去请求搜索引擎：
- 搜索引擎反爬严格，直接请求 Google/Bing 的搜索 URL 会被拦截
- 搜索结果页的 HTML 非常重（广告、跟踪器、动态加载），token 消耗巨大且 LLM 难以解析
- 各搜索引擎返回结构差异极大，无法通用处理

因此需要一个专门的 **search 工具**：接收自然语言查询，返回结构化的搜索结果。

### 1.2 Search 工具的定义

```
输入:  search("2026年5月 北京天气")
输出:  [
         { title: "北京天气预报", snippet: "5月12日 晴 20-28°C...", url: "https://..." },
         { title: "北京气候特点", snippet: "...", url: "https://..." },
       ]
```

### 1.3 主流搜索 API

| 服务 | 免费额度 | 说明 |
|------|---------|------|
| [Tavily](https://tavily.com) | 每月 1000 次 | 专为 Agent 设计，返回结构化结果 + 摘要，最推荐 |
| [SerpAPI](https://serpapi.com) | 每月 100 次 | 爬 Google 搜索结果，返回 JSON |
| Bing Search API | 每月 1000 次（Azure 免费层） | Microsoft 官方，稳定可靠 |
| [Brave Search API](https://brave.com/search/api/) | 每月 2000 次 | 独立引擎，隐私友好 |
| [Google Custom Search](https://developers.google.com/custom-search) | 每日 100 次 | Google 官方，但结果质量有时不如预期 |

Tavily 是目前最契合 Agent 场景的方案：它本身就是为 Agent 设计的，返回的不仅是链接列表，还包括每个结果的摘要内容，Agent 有时不需要 Fetch 就能回答问题。

### 1.4 Search 的典型工作流程

```
用户: "查一下最近的 AI 新闻"

Agent 判断 → 需要实时信息 → 调用 search("AI 行业新闻 2026")

  search 返回:
    ┌─ 1. "OpenAI 发布新模型" https://... (摘要...)
    ├─ 2. "Google 更新 Gemini"  https://...
    ├─ 3. "Claude 新增功能"     https://...
    └─ 4. ...

Agent 评估 → 结果 1 和 3 最相关

  → 调用 fetch("https://...") 读详情
  → 调用 fetch("https://...") 读详情

  → 综合搜索结果摘要 + 抓取到的详细内容 → 回答用户
```

**关键点：** Search 和 Fetch 是配合使用的。Search 提供"在哪"，Fetch 提供"是什么"。如果搜索结果的摘要已经够用，甚至可以跳过 Fetch 步骤。

---

## 二、Fetch（抓取与加工）

有了 URL 后，需要把网页内容变成 LLM 能高效理解的格式。从简单到复杂，有以下几个层级：

### 2.1 原始 HTML（Raw Fetch）

```
URL → HTTP GET → HTML → 直接扔给 LLM
```

| 优点 | 缺点 |
|------|------|
| 实现极简，几行代码 | 原始 HTML 充满噪音（导航、广告、脚本），LLM 难以阅读 |
| 无额外依赖 | Token 浪费严重，一个新闻页可能从 5KB 膨胀到 200KB+ |

**适用场景：** JSON API 端点、纯文本接口。

### 2.2 HTML 清洗 + 转 Markdown（Readability + Turndown）

```
URL → HTTP GET → HTML → Readability 提取正文
  → Turndown 转 Markdown → LLM
```

这是目前最主流、性价比最高的方案。

#### Readability 和 Turndown 是两个独立库

| 库 | 职责 | 来源 |
|----|------|------|
| `@mozilla/readability` | 提取文章正文，去掉导航/广告/侧边栏 | Mozilla（Firefox 阅读模式的内核） |
| `turndown` | 把清洗后的 HTML 转为 Markdown | 社区 |

#### 跨语言实现

各语言有各自独立的实现，不是跨语言调用，而是重新实现了相同算法：

| 功能 | JavaScript | Python | Go | Rust |
|------|-----------|--------|-----|------|
| HTML → Markdown | Turndown | markdownify, html2text | go-turndown | html2md |
| 正文提取 | @mozilla/readability | readability-lxml, newspaper4k | go-readability | readability |

| 优点 | 缺点 |
|------|------|
| LLM 友好，token 消耗低 | 仍无法执行 JavaScript |
| 对文章类页面提取准确度高 | SPA 和动态加载页面拿不到内容 |
| 业界成熟，Mozilla 背书 | 复杂布局（表格、多栏）可能丢失信息 |

**适用场景：** 技术文档、新闻文章、博客、Wiki 等绝大多数文本类网页。

### 2.3 无头浏览器渲染（Headless Browser）

```
URL → Playwright 启动 Chromium → 执行 JS 渲染
  → 通过 DOM API 提取纯文本 → LLM
```

#### 常见误解

- **需要外部服务？** 不需要。Playwright 是开源库，`npm install playwright` 后本地启动 Chromium，不依赖任何外部 API。免费、国内直连、无需科学上网
- **需要多模态 LLM？** 不需要。无头浏览器可以通过 DOM API 提取纯文本（`document.body.innerText`），不截图就不需要视觉能力
- **与 Browserless 的区别：** Browserless 是托管的浏览器池服务（收费）；Playwright/Puppeteer 是本地库（免费）；Browser Use 是基于 Playwright 的 Agent 交互框架

| 优点 | 缺点 |
|------|------|
| 完整渲染任何网页，包括 SPA | 资源消耗大（每个实例 100-300MB 内存） |
| 可执行交互（点击、翻页、填表单） | 启动慢（2-5 秒） |
| 不依赖任何外部服务 | 需额外下载 Chromium（~300MB） |

**适用场景：** 需 JS 渲染的页面、SPA、需登录或交互的网页。

#### 基础代码示例

```javascript
const { chromium } = require('playwright');

async function fetchPage(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  const content = await page.evaluate(() => document.body.innerText);
  await browser.close();
  return content.slice(0, 10000);
}
```

#### Browser Use 模式 — 无头浏览器的进阶

[Browser Use](https://github.com/browser-use/browser-use) 是目前最成熟的 Agent 浏览器交互框架：

1. 框架维护一个「可交互元素」的简化 DOM 树（只保留按钮、输入框、链接等可操作元素）
2. Agent 输出操作指令（`click(元素ID)`、`input(元素ID, "文本")`、`scroll(down)`）
3. 每步后截图回传，Agent 根据新状态决策下一步

```
Agent 任务: "在 Google 搜索 Claude 价格"

  第1步:
    LLM: click(搜索框)
    浏览器执行点击 → 截图 → 回 LLM

  第2步:
    LLM: input(搜索框, "Claude 价格")
    浏览器输入 → 截图 → 回 LLM

  第3步:
    LLM: click(搜索按钮)
    ...
```

但这种模式成本高、速度慢，只在需要复杂网页交互时才值得使用。

### 2.4 截图 + 视觉理解（Vision-based）

```
Playwright 截图 → base64 → 多模态 LLM → LLM 理解内容
```

| 优点 | 缺点 |
|------|------|
| 所见即所得，无信息丢失 | 成本高（视觉 token 比文本贵数倍） |
| 能理解布局、颜色、图片 | 无法获取精确文本（如代码） |
| 无需解析 DOM | 依赖 LLM 的视觉能力 |

**代表产品：** Anthropic Computer Use、OpenAI Operator。

### 2.5 四种 Fetch 方案对比

| 方案 | 实现成本 | JS 渲染 | 信息完整度 | 推荐场景 |
|------|---------|---------|-----------|---------|
| Raw HTML | 极低 | 不支持 | 差 | JSON API |
| Readability + Markdown | 低 | 不支持 | 好 | 文档/文章/博客 |
| 无头浏览器 | 高 | 支持 | 好 | SPA/交互 |
| 截图+视觉 | 高 | 支持 | 最好 | 视觉布局理解 |

---

## 三、Search + Fetch 的完整协作流程

```
用户提问
  │
  ▼
Agent 判断是否需要联网信息
  │
  ├─ 不需要 → 直接用模型知识回答
  │
  └─ 需要 
       │
       ▼
    调用 search(query)
       │
       ▼
    获取搜索结果列表 [{title, snippet, url}, ...]
       │
       ▼
    Agent 判断哪些结果值得读全文
       │
       ├─ 摘要已够用 → 直接综合回答
       │
       └─ 需要详情 
             │
             ▼
           调用 fetch(url) 逐一读取
             │
             ▼
           Readability + Turndown → Markdown
             │
             ▼
           Agent 综合所有信息 → 回答
```

---

## 四、Claude Code 的参考实现

Claude Code 内置了 Web 工具组合，可以作为参考架构：

| 工具 | 对应概念 | 工作原理 |
|------|---------|---------|
| **WebSearch** | Search | 接收自然语言查询 → 调用搜索 API → 返回格式化结果（标题+摘要+来源链接） |
| **WebFetch** | Fetch（Readability + Markdown） | 接收 URL → HTTP GET → Readability 提取 → Turndown 转 Markdown → 返回纯净内容 |

**不包含：** 无头浏览器（Playwright）、截图视觉理解。Claude Code 不处理需要 JS 渲染的页面。

配合流程：
```
用户提问 → Claude 判断是否需要搜索
  → 是 → 调用 WebSearch(query) → 获取搜索结果
    → 对关键结果调用 WebFetch(url) 读取详情
    → 综合回答
  → 否 → 直接用知识回答
```

---

## 五、Zoe Agent 的 Web 工具实现

基于上述原理，Zoe Agent 已实现两个 Web 工具：`web_search` 和 `web_fetch`。

### 5.1 实现总览

| 工具 | 方案 | 关键依赖 | 外部服务 |
|------|------|---------|---------|
| `web_search` | Tavily REST API（HTTP POST + JSON） | 无（内置 `fetch`） | Tavily（需 API key） |
| `web_fetch` | Readability + Turndown + linkedom | `@mozilla/readability`, `turndown`, `linkedom` | 无 |

### 5.2 Search：Tavily

选用 Tavily 作为搜索服务商，核心考量：

- **为 Agent 而生**：Tavily 返回的结构化结果中自带 `content`（摘要）和 `answer`（AI 综合摘要），Agent 有时无需额外 Fetch 即可回答问题
- **免费额度**：每月 1000 次，个人使用完全足够
- **接口简单**：单一 `POST /search` 端点，标准 REST API，无需 SDK

配置方式：在 `.env` 中设置 `TAVILY_API_KEY`，`dotenv` 在 `main.js` 入口统一加载。

```
POST https://api.tavily.com/search
Authorization: Bearer tvly-xxx
Content-Type: application/json

{
  "query": "2026年AI行业新闻",
  "search_depth": "basic",
  "max_results": 5,
  "include_answer": "basic"
}
```

Tavily 的响应包含三部分：
- `answer`：AI 生成的综合摘要，可直接用于回答
- `results[]`：搜索结果列表，每条含 `title`、`url`、`content`、`score`
- `response_time`：请求耗时

Zoe Agent 将 `answer` 作为搜索摘要展示，`results` 逐条格式化后返回给 LLM。LLM 可据此决定是否需要进一步调用 `web_fetch` 读取详情。

### 5.3 Fetch：Readability + Turndown + linkedom

实现路径采用方案 2（HTML 清洗 + 转 Markdown），不引入无头浏览器。

在跨语言实现中，Zoe 使用 JavaScript 生态：

| 功能 | 依赖 | 选择理由 |
|------|------|---------|
| 正文提取 | `@mozilla/readability` | Mozilla 官方库，Firefox 阅读模式内核，零依赖 |
| HTML → Markdown | `turndown` | 社区主流，零依赖 |
| Node.js DOM 环境 | `linkedom` | 替代 jsdom（~35 子依赖），linkedom 仅 ~11 子依赖 |

**为什么选择 linkedom 而非 jsdom：**

Readability 是浏览器库，假设 `document` 全局存在，在 Node.js 中需要提供一个 DOM 环境。jsdom 是最广为人知的选择，但它的依赖树庞大（约 35 个包）。linkedom 是专为这种场景设计的轻量替代，API 兼容 Readability，依赖仅约 11 个包，体积和安装时间都大幅减少。

```
URL → HTTP GET → HTML → linkedom 解析 DOM → Readability 提取正文
  → Turndown 转 Markdown → LLM
```

处理流程：
1. 验证 URL 格式和协议（仅 http/https）
2. `fetch` 发起 HTTP GET，设置 15s 超时
3. 检查 Content-Type，非 HTML 内容直接返回纯文本（截断 5000 字符）
4. linkedom 解析 HTML 为 DOM
5. Readability 提取文章正文（标题、作者、日期、正文 HTML）
6. Turndown 将正文 HTML 转换为 Markdown（ATX 标题、fenced 代码块）
7. 组装输出：标题 → 元信息 → Markdown 正文

无法提取正文时（如 SPA 页面、非文章类页面），返回清晰提示。

### 5.4 技术选型总结

| 决策 | 选择 | 替代方案 | 理由 |
|------|------|---------|------|
| 搜索服务 | Tavily | SerpAPI, Brave, Bing | 专为 Agent 设计，免费额度充足 |
| 搜索 SDK | 不用 SDK，直接 REST | `@tavily/core` npm 包 | 少一层依赖，接口简单无需封装 |
| DOM 环境 | linkedom | jsdom, happy-dom | 轻量（~11 vs ~35 包），满足 Readability 需求 |
| Fetch 深度 | 方案 2（Readability + Markdown） | 方案 3（无头浏览器） | 当前覆盖绝大多数场景，方案 3 按需后期接入 |
| 认证方式 | `Authorization: Bearer` header | Body 传 api_key | REST 标准做法 |
| 环境变量 | dotenv + .env | 系统环境变量 | 与 Node.js 生态一致，方便开发 |
