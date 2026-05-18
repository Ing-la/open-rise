# Agent 功能

## 设计原则

- **Agent ≠ Chat** — Chat 是 "user → LLM → text" 的单轮/多轮对话；Agent 是 "user → LLM → tool_use → observe → think → act → done" 的自主执行闭环
- **默认干净，按需深入** — UI 默认只展示最终结果，ReAct 思考过程可折叠展开
- **记忆隔离** — 同一角色在 Chat 和 Agent 中的消息历史完全独立，压缩策略各自不同
- **渐进增强** — v1 只做 Agent Loop + 展示层 + 基础文件工具，后续迭代逐步添加工具和能力

---

## 架构总览

```
┌────────────────────────────────────────────────────────────┐
│                    AgentView（前端）                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  最终结果区域（默认显示）                              │  │
│  │  "已帮你完成重构："                                   │  │
│  │  - 读取了 src/utils.ts                               │  │
│  │  - 更新了相关逻辑                                     │  │
│  │                                                      │  │
│  │  [查看完整思考过程] ← 可折叠                          │  │
│  │  ┌─ ReAct Trace ─────────────────────────────────┐  │  │
│  │  │ 🤔 思考... 🛠 工具调用... ← tool_result       │  │  │
│  │  │ ...                                           │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌─ 输入框 ─────────────────────────────────────────────┐  │
│  │  > 输入 / 命令 或直接输入任务...                      │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
                          │
                    IPC Bridge
                          │
┌────────────────────────────────────────────────────────────┐
│                    Agent Loop（主进程）                      │
│                                                           │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────────┐   │
│  │  Brain   │──>│  Agent   │──>│    Tool Dispatch      │   │
│  │ (LLM)    │   │  Loop    │   │  ┌──────────────────┐ │   │
│  └──────────┘   └──────────┘   │  │ read_file        │ │   │
│       ↑                        │  │ write_file       │ │   │
│       │                        │  │ edit_file        │ │   │
│       └──── tool_result ───────┘  │ web_fetch        │ │   │
│                                   │ web_search       │ │   │
│                                   │ generate_image   │ │   │
│                                   └──────────────────┘ │   │
│                                   ┌──────────────────────┐ │   │
│                                   │ AgentMemory           │ │   │
│                                   │ (三层压缩，独立于Chat)  │ │   │
│                                   └──────────────────────┘ │   │
└────────────────────────────────────────────────────────────┘
```

---

## 命令与导航

### `/agent` 命令 — 交互流程

```
首页 → 输入 /agent
    │
    ▼
┌────────────────────────────────────────┐
│  选角色（模态弹窗/列表）                │
│  只显示绑定了 type="chat" 大脑的角色     │
│  ┌──────────────────────────────────┐  │
│  │ [Avatar] 助手A · DeepSeek       │  │
│  │ [Avatar] 码农B · Claude         │  │
│  │ ...                             │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
    │ 选择一个角色
    ▼
┌────────────────────────────────────────┐
│  Agent 界面（session 级）              │
│  ┌──────┬───────────────────────────┐ │
│  │会话列表│ 会话对话区域              │ │
│  │ [+ 新]│                          │ │
│  │       │  之前的结果/对话历史       │ │
│  │会话 1 │                          │ │
│  │会话 2 │                          │ │
│  │会话 3 │  输入框                   │ │
│  └──────┴───────────────────────────┘ │
└────────────────────────────────────────┘
```

**关键区别：Chat 是角色级对话，Agent 是 session 级对话。**

| 项目 | Chat | Agent |
|------|------|-------|
| 入口 | `/chat` 直接进 | `/agent` → 选角色 → 选/建 session |
| 左侧列表 | 角色列表 | **session 列表**（按创建时间倒序） |
| 对话单位 | 角色整个生命周期 | 单个 session（独立任务） |
| 新建 | 选择角色即进入 | 点「+ 新」创建新 session |
| 筛选 | 全部角色 | 仅 `type="chat"` 大脑的角色 |

### Agent 输入框内命令

在 Agent 输入框中，以 `/` 开头的行被解析为本地命令，不发送给 LLM：

| 命令 | 功能 |
|------|------|
| `/trust` | 查看信任路径列表 |
| `/trust add <path>` | 添加信任路径 |
| `/tool` | 列出当前可用的工具（含多模态能力动态注册的工具） |
| `/help` | 显示 Agent 模式帮助 |

实现：提交前拦截 `str.startsWith('/')`，匹配命令表执行本地逻辑。支持 Tab 键自动补全命令。

---

## Agent Loop（事件驱动，非阻塞）

Agent 的核心循环，实现于 `main/handlers/agent.js`。

采用**事件驱动架构**，避免同步循环阻塞主进程：

### IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `agent:send` | 渲染→主进程 | `ipcMain.on`，启动 Agent Loop |
| `agent:progress` | 主进程→渲染 | 实时推送当前状态（"正在读取文件..."或"使用工具: generate_image"） |
| `agent:trace` | 主进程→渲染 | 实时推送单步 ReAct 记录 |
| `agent:done` | 主进程→渲染 | 携带完整 result（含自动追加的图片链接）通知结束 |
| `agent:error` | 主进程→渲染 | 异常通知 |
| `agent:stop` | 渲染→主进程 | 用户主动中止 |
| `agent:session-create` | 渲染→主进程 | 创建新 session |
| `agent:session-list` | 渲染→主进程 | 列 session |
| `agent:session-delete` | 渲染→主进程 | 删 session |
| `agent:session-messages` | 渲染→主进程 | 加载 session 消息历史 |
| `agent:trust-add` | 渲染→主进程 | 添加信任路径 |
| `agent:trust-list` | 渲染→主进程 | 列信任路径 |
| `agent:capabilities-load` | 渲染→主进程 | 读取 agent-capabilities.json |
| `agent:capabilities-save` | 渲染→主进程 | 写入 agent-capabilities.json |
| `agent:tool-list` | 渲染→主进程 | 获取用户可读的工具列表 |

### 通信流程

```
前端                          主进程
 │                              │
 ├─ agent:send {sessionId,      │
 │    roleId, content} ──────────→  开始 Agent Loop
 │                              │
 │  ← agent:progress "正在读取"  │  每步状态更新
 │  ← agent:trace {type, ...}   │  实时推 ReAct 步骤
 │  ← agent:trace {type, ...}   │
 │  ← agent:progress "正在分析"  │
 │  ← agent:trace {type, ...}   │
 │  ← agent:done  {sessionId,   │  loop 结束
 │       result, trace[]}       │
 │                              │
 │  ┄ 或用户点中止 ┄            │
 ├─ agent:stop ──────────────────→  中断 loop
```

### Loop 逻辑

```
用户输入（含 sessionId）
    │
    ▼
1. 生成新的 sessionId（如不存在）
2. 从 DB 加载该 session 的历史消息
3. 拼 system prompt = soul + rule + 工具定义 + ReAct 格式说明
4. 追加 user message
    │
    ▼  (循环开始)
5. 调用 LLM（非流式，每次完整返回）
6. 解析 response
    │
    ├── stop_reason === "tool_use" ──→
    │   执行工具（结果截断 MAX_TOOL_RESULT_CHARS）
    │   → 追加 tool_result
    │   → agent:trace {type: "thought"|"tool_use"|"tool_result", ...}
    │   → agent:progress "当前步骤描述"
    │   → 保存到 AgentMessage（含 sessionId）
    │   → 回到步骤 5
    │
    └── stop_reason === "stop" / "end_turn" ──→
       → agent:done {sessionId, result, trace[]}
```

关键设计决策：

| 决策 | 选择 | 理由 |
|------|------|------|
| 通信模式 | **事件驱动**（send/on） | 防止主进程阻塞，前端可实时显示进度和停止 |
| tool_use 格式 | **OpenAI tool_calls** | 目标模型 DeepSeek v4 级别，tool calling 能力强 |
| 实时推送 | 每步 `agent:trace` | 前端可逐步骤渲染，用户能看到 agent "正在工作" |
| 中止机制 | `agent:stop` 标记 | Agent 系统 prompt 包含停止指令，下次 LLM 调用前检查 |

### Preload 桥接

```javascript
agent: {
  send: (params) => ipcRenderer.send('agent:send', params),
  stop: () => ipcRenderer.send('agent:stop'),
  onProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('agent:progress', h);
    return () => ipcRenderer.removeListener('agent:progress', h);
  },
  onTrace: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('agent:trace', h);
    return () => ipcRenderer.removeListener('agent:trace', h);
  },
  onDone: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('agent:done', h);
    return () => ipcRenderer.removeListener('agent:done', h);
  },
  onError: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('agent:error', h);
    return () => ipcRenderer.removeListener('agent:error', h);
  },
},
```

---

## 数据模型

### AgentMessage 表（独立于 Chat 的 Message）

Agent 以 **session** 为单位管理消息。每次 `agent:send` 创建一个 session（或复用已有），同一轮 agent loop 中所有消息共享一个 `sessionId`。

```prisma
model AgentSession {
  id        String   @id @default(uuid())
  roleId    String
  title     String   // 自动摘要或用户命名，如 "重构 utils.ts"
  status    String   @default("active") // "active" | "archived"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages  AgentMessage[]

  @@index([roleId])
}

model AgentMessage {
  id        String   @id @default(uuid())
  sessionId String
  role      String   // "user" | "assistant" | "tool_use" | "tool_result"
  content   String   // 文本内容或 tool 调用/结果的 JSON 序列化
  type      String   @default("text") // "text" | "tool_call" | "tool_result"
  toolName  String?  // tool_use 的工具名
  toolId    String?  // tool_use_id，用于匹配 tool_use/tool_result
  createdAt DateTime @default(now())

  @@index([sessionId])
}
```

### 与 Chat 的对比

| 维度 | Chat (Message 表) | Agent (AgentMessage + AgentSession 表) |
|------|-------------------|--------------------------------------|
| 组织单位 | 角色级（roleId） | **Session 级**（sessionId） |
| 消息角色 | `user` / `assistant` | `user` / `assistant` / `tool_use` / `tool_result` |
| 压缩策略 | 20000 chars 阈值 + summary | 三层压缩（micro → auto → manual） |
| 存储内容 | 纯文本 | 文本 + 工具调用/结果 |
| 生命周期 | 永久保存 | 按 session 独立管理，可归档 |

---

## 工具系统

### 工具注册

参照 s02 的 dispatch map 模式：

```javascript
// main/tools/index.js
const TOOL_HANDLERS = {
  'read_file':  require('./read'),
  'write_file': require('./write'),
  'edit_file':  require('./edit'),
  'web_fetch':  require('./web_fetch'),
  'web_search': require('./web_search'),
};

async function executeTool(name, args) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  return await handler(args);
}
```

executeTool 为 async 函数，统一处理同步工具（文件操作）和异步工具（Web 操作）。

### 工具列表

| 工具 | 参数 | 功能 | 类型 |
|------|------|------|------|
| `read_file` | `path`, `limit?` | 读取文件内容，可选行数限制 | 同步 |
| `write_file` | `path`, `content` | 写入文件（覆盖，自动创建父目录） | 同步 |
| `edit_file` | `path`, `old_text`, `new_text` | 编辑文件（精确替换首次匹配） | 同步 |
| `web_fetch` | `url` | 获取 URL 的正文内容，转为 Markdown | 异步 |
| `web_search` | `query`, `count?` | 搜索互联网实时信息，返回结果列表 | 异步 |
| `generate_image` | `prompt`, `size?` | 文生图。基于 agent-capabilities.json 中配置的画图大脑，支持 DashScope 和标准 OpenAI 兼容 API。返回 `app-img://` 本地路径的 markdown 图片链接。 | 异步 |

**web_fetch 详解：**
- 基于 `@mozilla/readability`（Firefox 阅读模式内核）提取正文
- `turndown` 将清洗后的 HTML 转为 Markdown
- `linkedom` 提供 Node.js DOM 环境（轻量替代 jsdom）
- 处理流程：URL 验证 → HTTP GET（15s 超时）→ 内容类型识别 → Readability 提取 → Turndown 转换 → 结构化输出
- 无法处理依赖 JavaScript 渲染的页面（SPA），返回清晰提示

**web_search 详解：**
- 基于 Tavily REST API（专为 Agent 设计的搜索服务）
- 零 npm 依赖：Node 内置 `fetch` 调用 `POST /search`
- 认证：`Authorization: Bearer` header
- 输出：AI 综合摘要 + 结构化结果列表（标题 + 内容摘要 + URL）
- API key 通过 `.env` 的 `TAVILY_API_KEY` 配置

### 工具结果截断

每个工具的结果限制在 `MAX_TOOL_RESULT_CHARS = 10000` 字符内，超出部分截断并在末尾追加 `...(truncated)`。

### 多模态能力动态注册

文件工具（`read_file`/`write_file`/`edit_file`）始终可用；`web_fetch`/`web_search` 始终可用；`generate_image` 需要先在 Agent 侧边栏「小帮手」（`AgentCapabilitiesModal`）中配置画图大脑后才向 LLM 注册。

实现机制：

```
agent-capabilities.json        AgentCapabilitiesModal
┌─────────────────────┐        ┌──────────────────┐
│ {                   │        │  类型: image      │
│   "image": {        │  ──→  │  角色: 画师·XX    │
│     "roleId": "...",│        │  大脑: 通义万相    │
│     "brainId": "..."│        └──────────────────┘
│   }                 │
│ }                   │        agent.js 加载配置
└─────────────────────┘        ↓
                     ┌─────────────────────────┐
                     │ TOOL_DEFINITIONS 基础工具 │
                     │ + caps.image?.brainId ?  │
                     │   generate_image         │
                     └─────────────────────────┘
```

- `agent.js` 的 `runAgentLoop` 每次 LLM 调用前调用 `loadCapabilities()` 加载配置
- 只有 `caps.image?.brainId` 存在时，`generate_image` 的 tool definition 才被推入 tools 数组
- `main/tools/index.js` 的 `TOOL_HANDLERS` 始终包含 `generate_image` 的实现，但 LLM 只有看到 tool definition 才会调用
- `draw.js` 根据 `agent-capabilities.json` 中的 `brainId` 查询 Prisma 获取大脑配置，调用对应 API（DashScope 或标准兼容 API）

### 信任路径管理

ZOE 是固定目录的 Electron 应用，不像 Claude Code 那样在项目根目录启动。采用**可配置的信任路径列表**模式：

```javascript
// main/trusted-paths.json
[
  "E:\\Claude-code\\zoe",
  "D:\\Projects\\my-web-app",
  "C:\\Users\\hello\\Documents\\notes"
]
```

所有文件工具只允许操作信任路径内的文件：

```javascript
// main/tools/safe-path.js
function isPathTrusted(targetPath) {
  const resolved = path.resolve(targetPath);
  return trustedPaths.some(trusted =>
    resolved.startsWith(path.resolve(trusted))
  );
}
```

信任路径存储在独立的 `main/trusted-paths.json` 文件中，可通过两种方式管理：

| 方式 | 说明 |
|------|------|
| **Agent 输入框 `/trust add <path>`** | 运行时添加信任路径 |
| **直接编辑 JSON** | 手动管理，适合批量操作 |

---

## 记忆管理（AgentMemory）

独立于 Chat 的压缩策略，参照 s06 三层模型：

### Layer 1: micro_compact（每次 LLM 调用前静默执行）

将超过 N 轮之前的 tool_result 替换为占位符 `[Previous: used {tool_name}]`，减少 token 消耗。

### Layer 2: auto_compact（token 超过阈值时触发）

- 将完整消息转录保存到 `prisma/agent-archives/{roleId}/{timestamp}.jsonl`
- 调用 LLM 总结对话要点
- 替换为压缩后的摘要

### Layer 3: manual_compact（`/compact` 命令触发）

同 auto_compact，但由用户主动触发。

| 参数 | 值 | 说明 |
|------|----|------|
| `MICRO_KEEP_RECENT` | 5 轮 | micro_compact 保留的最近 tool_result 轮数 |
| `TOKEN_THRESHOLD` | 40000 | auto_compact 触发阈值 |
| `SUMMARY_MAX_TOKENS` | 1024 | 压缩输出长度上限 |

---

## UI 设计

### AgentView 组件

Agent 模式的界面与 ChatView 共享 PageShell 骨架，但内容区域和侧边栏逻辑不同：

- **左侧侧边栏**：显示当前角色的 session 列表（而非角色列表），顶部有「+ 新建会话」按钮
- **对话区域**：当前 session 的消息历史，用户消息 + agent 最终结果 + 可折叠 ReAct Trace
- **顶层入口**：页面左上角显示当前角色名，点击可返回角色选择

```
┌──────────────────────────────────────────────────┐
│  ☰  助手A · DeepSeek                OpenRise     │ ← 顶部栏
├──────┬───────────────────────────────────────────┤
│会话列表│                                           │
│ [+ 新]│  ┌─ 用户 ─────────────────────────────┐  │
│       │  │ 帮我重构一下 src/utils.ts...          │  │
│ 重构工│  └─────────────────────────────────────┘  │
│ 具函数│  ┌─ Agent ────────────────────────────┐  │
│       │  │  已完成重构：                        │  │
│ 编写文│  │  - 提取了 X 函数到独立模块            │  │
│ 件-A  │  │  - 更新了类型定义                    │  │
│       │  │  - 添加了错误处理                    │  │
│ 整理项│  │                                     │  │
│ 目结构│  │  ─────────────────────────────      │  │
│       │  │  [▶ 查看思考过程 (5 步)]            │  │
│       │  │  ┌─ ReAct Trace ────────────────┐  │  │
│       │  │  │ 🤔 正在读取源文件...          │  │  │
│       │  │  │ 🛠  read_file src/utils.ts    │  │  │
│       │  │  │     ← 返回 234 行             │  │  │
│       │  │  │ 🤔 分析完成，开始重构...      │  │  │
│       │  │  │ 🛠  edit_file ...            │  │  │
│       │  │  └──────────────────────────────┘  │  │
│       │  └─────────────────────────────────────┘  │
│       │                                           │
│       │  ┌─ 输入框 ─────────────────────────────┐ │
│       │  │  > 输入 / 命令或直接描述任务...      │ │
│       │  └──────────────────────────────────────┘ │
└──────┴───────────────────────────────────────────┘

### 角色选择弹窗

选角色弹窗与 RoleModal 类似，但做了简化：

- 只列出 `brain.type === "chat"` 的角色
- 每项显示：头像 + 角色名 + 关联大脑名
- 选中后关闭弹窗，进入该角色的 Agent 界面
- 顶层点击角色名可再次打开此弹窗切换角色

### ReActTrace 组件

可折叠面板，显示 agent 的完整思考-工具调用链：

| 元素 | 视觉 |
|------|------|
| 思考（thought） | `🤔` 前缀，灰色文字 |
| 工具调用（tool_use） | `🛠` 前缀，等宽字体显示工具名+参数 |
| 工具结果（tool_result） | `←` 前缀，截断至 200 字符，可点击展开全文 |
| 步骤计数 | 右侧小字显示 `3/5` |

---

## 文件结构变更

### 新增/修改文件

```
main/
├── main.js                          ← 修改：瘦身，只留 Electron 生命周期
├── preload.js                       ← 修改：新增 agent IPC 桥接
├── db.js                            ← 不变
├── trusted-paths.json               ← 新增：信任路径列表
├── agent-capabilities.json          ← 新增：多模态能力配置（image 等）
├── handlers/                        ← 新增：从 main.js 拆分
│   ├── brain.js                     ← 拆分
│   ├── role.js                      ← 拆分
│   ├── chat.js                      ← 拆分（含记忆压缩）
│   ├── image.js                     ← 拆分
│   └── agent.js                     ← 新增：Agent Loop + IPC handler
├── tools/                           ← 新增：Agent 工具集
│   ├── index.js                     ← 工具注册表（dispatch map）
│   ├── safe-path.js                 ← 信任路径校验
│   ├── read.js                      ← read_file
│   ├── write.js                     ← write_file
│   ├── edit.js                      ← edit_file
│   ├── web_fetch.js                 ← web_fetch（Readability + Turndown + linkedom）
│   ├── web_search.js                ← web_search（Tavily REST API）
│   └── draw.js                      ← 新增：generate_image（多模态能力，读 agent-capabilities.json）
└── memory/                          ← 新增：记忆管理
    ├── chat-compact.js              ← 拆分自 chat 的记忆压缩
    └── agent-compact.js             ← 新增：Agent 三层压缩

src/app/components/
├── AgentView.tsx                    ← 新增：Agent 模式主界面
├── AgentSessionList.tsx             ← 新增：session 侧边栏列表
├── AgentRolePicker.tsx             ← 新增：角色选择弹窗
├── AgentCapabilitiesModal.tsx       ← 新增：多模态能力配置弹窗（小帮手）
├── ReActTrace.tsx                   ← 新增：可折叠 ReAct 展示
├── ChatView.tsx                     ← 修改：图片渲染逻辑
├── PageShell.tsx                    ← 修改：新增 mode === 'agent'
└── CommandCenter.tsx                ← 修改：新增 /agent 命令路由

src/lib/
└── api.ts                           ← 修改：新增 agent IPC 方法

shared/
└── ipc-contracts.js                 ← 修改：新增 agent 通道

prisma/
├── schema.prisma                    ← 修改：新增 AgentSession + AgentMessage 模型
├── agent-archives/                  ← 新增：Agent 记忆压缩归档
└── migrations/                      ← 新增迁移
```

---

## 实现顺序

| 阶段 | 内容 | 依赖 |
|------|------|------|
| **Phase 1: 后端拆分** | 将 main.js 拆分为 handlers/ 目录，功能不变 | 无 |
| **Phase 2: 数据模型** | prisma 新增 AgentMessage 表，生成迁移 | Phase 1 |
| **Phase 3: Agent Loop** | agent.js 实现核心循环 + tools/ 三个工具 | Phase 1, 2 |
| **Phase 4: 记忆管理** | agent-compact.js 三层压缩 | Phase 3 |
| **Phase 5: UI** | AgentView + ReActTrace + 命令路由 | Phase 3 |
| **Phase 6: 集成测试** | IPC 联调，边界情况处理 | Phase 4, 5 |
