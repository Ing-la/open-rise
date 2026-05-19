# OpenRise

本地优先的 AI 智能体编排实验室。命令驱动，隐私优先，为极客打造。

Bring Your Own Model — 自带 API Key，所有数据存储在本地，没有云同步，没有遥测，没有账号。

---

## 功能特性

- **命令驱动交互** — 输入 `/brain`、`/role`、`/chat`、`/agent` 控制一切，无需点菜单
- **Agent 自主执行** — LLM ReAct 循环，自动思考→调用工具→观察结果→完成任务，支持 30 步深度迭代
- **工具系统** — 读写文件、编辑代码、网页抓取、互联网搜索、文生图，Agent 按需调用
- **多模态能力配置** — 为 Agent 配置独立的画图大脑（如通义万相），能力与对话角色解耦
- **自带模型** — 兼容任何 OpenAI 格式的 API（DeepSeek、智谱 GLM、百炼、Kimi、Ollama 本地模型等）
- **有灵魂的角色** — 每个角色拥有 `soul`（人格设定）和 `rule`（行为规则），回复支持完整 Markdown 渲染
- **长期记忆** — Chat 长对话自动通过 LLM 压缩归档为 Markdown；Agent 采用 jsonl 归档 + compactSession 持久化压缩
- **流式输出** — 通过 Electron IPC + SSE 实现逐 token 实时展示
- **手绘风格 UI** — SVG 手绘线条 + 炭笔素描纸纹理，每个像素都是故意的
- **100% 本地** — SQLite 数据库，数据完全由你控制

---

## 快速开始

### 环境要求

- Node.js 18+
- 任意 OpenAI 兼容的 API Key

### 安装与启动

```bash
# 1. 克隆仓库
git clone https://github.com/Ing-la/open-rise.git
cd open-rise

# 2. 安装依赖
npm install

# 3. 初始化数据库（创建 SQLite 表结构）
npx prisma migrate dev --name init

# 4. 启动开发环境（同时启动 Next.js 前端 + Electron 窗口）
npm run dev
```

### 首次使用

1. 运行 `npm run dev`，Electron 窗口自动打开
2. 在输入框中输入 `/brain`，添加你的第一个 API 配置（供应商、地址、模型、密钥）
3. 输入 `/role`，创建一个人物，绑定到刚才配置的大脑
4. 输入 `/chat`，点击人物开始对话
5. 输入 `/agent`，选择角色进入 Agent 模式，Agent 会自动读写文件、搜索网页、生成图片

> Agent 文件操作需要添加信任路径：在 Agent 输入框输入 `/trust add <path>` 授权访问目录。

---

## 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 桌面壳 | Electron | 跨平台桌面应用 |
| 前端 | Next.js (App Router, 静态导出) | React 框架 |
| 样式 | Tailwind CSS v4 | 原子化 CSS |
| 后端 | Node.js (Electron 主进程) | IPC 通信、API 转发 |
| 数据库 | SQLite + Prisma 5 | 轻量本地存储 |
| AI 协议 | OpenAI Chat Completions API | 流式/非流式兼容 |

---

## 数据模型

### Chat

```
Brain ──1:N──> Role ──1:N──> Message
```

| 模型 | 说明 | 关键字段 |
|------|------|----------|
| **Brain** | API 配置 | `provider`（供应商）、`baseUrl`（端点）、`apiKey`（密钥）、`modelName`（模型名）、`type`（chat/image/vision） |
| **Role** | 人物 | `soul`（人格）、`rule`（规则）、`avatar`（头像）、`summary`（长期记忆） |
| **Message** | 对话记录 | `sender`（user/assistant）、`content`（消息内容） |

### Agent

```
Role ──1:N──> AgentSession ──1:N──> AgentMessage
```

| 模型 | 说明 | 关键字段 |
|------|------|----------|
| **AgentSession** | 任务会话 | `title`（自动标题）、`summary`（压缩摘要）、`compactedAt`（压缩时间） |
| **AgentMessage** | 消息记录 | `role`（user/assistant/tool_result）、`type`（text/tool_call/tool_result）、`toolName`、`toolId` |

Agent 消息比 Chat 多三种角色：`tool_call`（思考+工具调用参数）、`tool_result`（工具返回结果），以 session 为组织单位独立管理。

---

## 命令系统

| 命令 | 功能 |
|------|------|
| `/brain` | 管理大脑配置（增删改查、测试连接） |
| `/role` | 管理人物（创建/编辑，绑定大脑，选择头像） |
| `/chat` | 进入聊天模式 |
| `/agent` | 进入 Agent 模式（选择角色 → 新建/选择 session → 下达任务） |

Agent 输入框内命令：

| 命令 | 功能 |
|------|------|
| `/tool` | 查看当前可用工具列表 |
| `/trust` | 查看信任路径 |
| `/trust add <path>` | 添加信任路径（Agent 文件操作需要） |
| `/help` | 显示帮助 |

---

## 项目结构

```
openrise/
├── src/app/               ← 前端页面和组件
│   └── components/
│       ├── ChatView.tsx         ← 聊天界面
│       ├── AgentView.tsx        ← Agent 界面（消息 + 可折叠 ReAct Trace）
│       ├── AgentSessionList.tsx ← Agent 会话侧边栏
│       ├── AgentRolePicker.tsx  ← Agent 角色选择弹窗
│       ├── AgentCapabilitiesModal.tsx ← 多模态能力配置
│       ├── ReActTrace.tsx       ← 可折叠思考过程面板
│       ├── PageShell.tsx        ← 页面外壳（顶部栏、侧边栏、命令路由）
│       ├── BrainModal.tsx       ← 大脑配置弹窗
│       ├── RoleModal.tsx        ← 人物配置弹窗
│       ├── AvatarIcon.tsx       ← 手绘 SVG 头像
│       └── SvgFilters.tsx       ← 炭笔/抖动 SVG 滤镜
├── main/                  ← Electron 主进程
│   ├── main.js            ← 窗口管理、自定义协议
│   ├── preload.js         ← IPC 桥接
│   ├── db.js              ← Prisma 客户端
│   ├── handlers/          ← IPC handler（按功能拆分）
│   │   ├── brain.js / role.js / chat.js / image.js
│   │   └── agent.js       ← Agent Loop + Session 管理
│   ├── tools/             ← Agent 工具集
│   │   ├── index.js       ← 工具注册表
│   │   ├── safe-path.js   ← 信任路径校验
│   │   ├── read_file.js / write_file.js / edit_file.js
│   │   ├── web_fetch.js / web_search.js
│   │   └── draw.js        ← generate_image 文生图
│   ├── memory/
│   │   └── agent-compact.js ← jsonl 归档 + compactSession 压缩
│   └── agent-capabilities.json ← 多模态能力配置
├── prisma/
│   ├── schema.prisma      ← 数据模型定义（含 AgentSession + AgentMessage）
│   ├── migrations/        ← 数据库迁移历史
│   ├── archives/          ← Chat 压缩归档（Markdown）
│   ├── agent-archives/    ← Agent 压缩归档（.jsonl，按 session 独立文件）
│   └── images/            ← 生成图片
├── shared/
│   └── ipc-contracts.js   ← 前后端通信合约定义
└── docs/project/          ← 架构、UI、数据模型、记忆策略文档
```

---

## 记忆管理

### Chat（对话模式）

**summary 字段 + 字符阈值压缩 + Markdown 归档：**

1. **短期记忆** — Message 表中的全部消息，每次对话送入 LLM 上下文
2. **长期记忆** — Role.summary 字段，始终拼入 system prompt
3. **自动压缩** — 总字符超过 20000 chars + 消息超过 10 条时触发，保留最新 10 条，其余压缩为新的 summary
4. **历史归档** — 压缩的原始对话写入 `prisma/archives/` 目录的 Markdown 文件

### Agent（自主执行模式）

**jsonl 归档 + compactSession + DB 清理：**

1. **运行期** — 全部消息（含 tool_call / tool_result）存入 DB，发给 LLM
2. **自动压缩** — 上下文超过 40,000 token 时触发 `compactSession()`
   - 所有消息 append 到 `prisma/agent-archives/{roleName}-{sessionId}.jsonl`
   - LLM 生成压缩摘要，写入 `AgentSession.summary`
   - 从 DB 删除已归档消息
3. **跨重启** — 有 summary 且 DB 空时直接喂摘要给 LLM，不重复压缩
4. **前端** — 压缩后的 session 顶部显示「对话已压缩」提示 + 归档路径；未压缩的消息完整显示可展开的思考过程

---

## UI 设计风格

**CLI-First 反差美学** — 最先进的命令驱动交互，跑在最原始的草稿纸上。

- 背景色 `#F2F2EE` — 冷调素描纸白
- 主题色 `#2C2C2C` — 炭灰铅笔线条
- SVG `feTurbulence` + `feDisplacementMap` 滤镜模拟炭笔颗粒感和手绘抖动
- 彩色仅用于头像（马克笔式 accent）
- 无侧边栏、无导航栏、无标准阴影

---

## 开发说明

- `main/` 目录使用 CommonJS（Electron 主进程要求），不与前端 TypeScript 混用
- 修改 `main/` 下的代码后需要重启 `npm run dev`
- 修改 `src/` 下的前端代码支持热更新
- 数据库路径自动切换：开发时 `prisma/dev.db`，生产时 `userData/openrise.db`
- 不使用 Next.js API 路由（`output: 'export'` 静态导出），所有后端逻辑通过 Electron IPC 实现
- Agent 文生图需要额外配置：侧边栏「小帮手」中为 image 能力绑定一个 `type` 包含 `image` 的大脑
- Agent 记忆归档位置：`prisma/agent-archives/{roleName}-{sessionId}.jsonl`（开发）/ `userData/agent-archives/`（生产）

---

## License

MIT
