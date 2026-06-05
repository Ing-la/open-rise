# OpenRise

本地优先的 AI 智能体编排实验室。命令行与 GUI 双模驱动，隐私优先，为极客打造。

Bring Your Own Model — 自带 API Key，所有数据存储在本地，没有云同步，没有遥测，没有账号。

---

## 功能特性

- **双模交互** — 输入 `/brain`、`/role`、`/chat`、`/agent`、`/debate` 或点击按钮，控制一切
- **辩论赛沙盒** — 选 8 个辩手 + 1 个裁判，9 种裁判人格随机抽 3 个，LLM 编排五阶段辩论，手动步进控制
- **Agent 自主执行** — LLM ReAct 循环，自动思考→调用工具→观察结果→完成任务，支持 30 步深度迭代
- **工具系统** — 读写文件、编辑代码、网页抓取、互联网搜索、文生图、图片视觉理解，Agent 按需调用
- **多模态能力配置** — 为 Agent 配置独立的画图大脑和视觉大脑，能力与对话角色解耦
- **自带模型** — 兼容任何 OpenAI 格式的 API（DeepSeek、智谱 GLM、百炼、Kimi、Ollama 本地模型等）
- **有灵魂的角色** — 每个角色拥有 `soul`（人格设定）和 `rule`（行为规则），回复支持完整 Markdown 渲染
- **长期记忆** — Chat 自动压缩归档为 Markdown；Agent 采用 jsonl 归档 + compactSession 持久化压缩
- **流式输出** — 通过 Electron IPC + SSE 实现逐 token 实时展示
- **手绘风格 UI** — SVG 手绘线条 + 炭笔素描纸纹理
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

# 4. 启动开发环境
npm run dev
```

### 首次使用

1. 运行 `npm run dev`，Electron 窗口自动打开
2. 输入 `/brain`，添加你的第一个 API 配置（供应商、地址、模型、密钥）
3. 输入 `/role`，创建人物，绑定到刚才配置的大脑
4. 输入 `/chat`，点击人物开始对话
5. 输入 `/agent`，选择角色进入 Agent 模式，Agent 自动读写文件、搜索网页、生成图片
6. 输入 `/debate`，配置 8 个辩手 + 1 个裁判大脑，开始辩论赛

> Agent 文件操作需要添加信任路径：在 Agent 输入框输入 `/trust add <path>` 授权访问目录。

---

## 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 桌面壳 | Electron 41 | 跨平台桌面应用 |
| 前端 | Next.js 16 (App Router, 静态导出) | React 19 |
| 样式 | Tailwind CSS v4 | 原子化 CSS |
| 后端 | Node.js (Electron 主进程) | IPC 通信、API 转发 |
| 数据库 | SQLite + Prisma 5 | 轻量本地存储 |
| AI 协议 | OpenAI Chat Completions API | 流式/非流式兼容 |

---

## 数据模型

### Chat / Agent

```
Brain ──1:N──> Role ──1:N──> Message
Role ──1:N──> AgentSession ──1:N──> AgentMessage
```

| 模型 | 说明 | 关键字段 |
|------|------|----------|
| **Brain** | API 配置 | `provider`、`baseUrl`、`apiKey`、`modelName`、`type`（chat/image/vision） |
| **Role** | 人物 | `soul`（人格）、`rule`（规则）、`avatar`（头像）、`summary`（长期记忆） |
| **Message** | 对话记录 | `sender`（user/assistant）、`content` |
| **AgentSession** | 任务会话 | `title`、`summary`（压缩摘要）、`compactedAt` |
| **AgentMessage** | Agent 消息 | `role`（user/assistant/tool_call/tool_result）、`toolName`、`toolId` |

Agent 消息比 Chat 多三种角色：`tool_call`（思考+工具调用参数）、`tool_result`（工具返回结果），以 session 为组织单位独立管理。

### 辩论赛

```
Debate ──1:N──> DebatePosition
Debate ──1:N──> DebateMessage
Debate ──1:N──> DebateScore
Debate ──1:1──> DebateResult
```

| 模型 | 说明 | 关键字段 |
|------|------|----------|
| **Debate** | 辩论场次 | `proTopic`、`conTopic`、`judgePersonas`、`status`（ongoing/completed） |
| **DebatePosition** | 辩位配置 | `roleId`、`side`（pro/con/judge）、`position`（1-4） |
| **DebateMessage** | 每轮发言 | `side`、`position`、`round`（阶段）、`charCount` |
| **DebateScore** | 裁判评分 | `judgePersonaId`、`scoreContent/Logic/Expression/Rebuttal`、`weightedTotal` |
| **DebateResult** | 胜负结果 | `winner`、`bestPro/bestCon/overallBest`、`proTotalScore/conTotalScore` |

---

## 命令系统

| 命令 | 功能 |
|------|------|
| `/brain` | 管理大脑配置（增删改查、测试连接） |
| `/role` | 管理人物（创建/编辑，绑定大脑，选择头像） |
| `/chat` | 进入聊天模式 |
| `/agent` | 进入 Agent 模式（选择角色 → 新建/选择 session → 下达任务） |
| `/debate` | 进入辩论赛模式（配置辩手和裁判 → 手动步进控制五阶段辩论） |

Agent 输入框内命令：

| 命令 | 功能 |
|------|------|
| `/tool` | 查看当前可用工具列表 |
| `/trust` | 查看信任路径 |
| `/trust add <path>` | 添加信任路径（Agent 文件操作需要） |
| `/help` | 显示帮助 |

---

## 辩论赛（特色功能）

采用标准辩论赛格式，LLM 编排驱动，手动步进控制。

**五阶段流程**：立论陈词 → 驳论 → 对辩（多轮） → 自由辩论（多轮） → 总结陈词 → 裁判评判

**裁判系统**：
- 内置 9 种裁判人格（严谨学者、修辞大师、战术分析师、事实核查官等），各有独立权重矩阵
- 每场随机抽 3 个，独立 LLM 调用评分
- 程序按人格权重计算加权总分，聚合判定胜负 + 最佳辩手
- 每位裁判点击一次独立执行，前端逐个渲染

**对辩/自由辩论**：
- 字数预算制（对辩 300 字/方，自由辩论 800 字/方）
- 每次发言前执行一轮战术分析（LLM 预调用），分析结果注入主 prompt
- 自由辩论三辩 50% 权重随机选人
- 一方耗尽另一方继续，直到双方都耗尽

---

## 项目结构

```
openrise/
├── src/app/               ← 前端页面和组件
│   └── components/
│       ├── ChatView.tsx           ← 聊天界面
│       ├── AgentView.tsx          ← Agent 界面（消息 + 可折叠 ReAct Trace）
│       ├── DebateView.tsx         ← 辩论赛主界面（三栏布局 + 步进控制）
│       ├── DebateSetupModal.tsx   ← 辩论设置弹窗
│       ├── PageShell.tsx          ← 页面外壳（顶部栏、侧边栏、命令路由）
│       ├── CommandCenter.tsx      ← 首页命令中心
│       ├── BrainModal.tsx         ← 大脑配置弹窗
│       ├── RoleModal.tsx          ← 人物配置弹窗
│       ├── AvatarIcon.tsx         ← 手绘 SVG 头像
│       └── SvgFilters.tsx         ← 炭笔/抖动 SVG 滤镜
├── main/                  ← Electron 主进程
│   ├── main.js            ← 窗口管理、自定义协议
│   ├── preload.js         ← IPC 桥接
│   ├── db.js              ← Prisma 客户端
│   ├── handlers/          ← IPC handler（按功能拆分）
│   │   ├── brain.js / role.js / chat.js
│   │   ├── agent.js       ← Agent Loop + Session 管理
│   │   ├── debate.js      ← 辩论编排（状态机 + 步进 + 评分聚合）
│   │   └── image.js / file.js
│   ├── tools/             ← Agent 工具集
│   │   ├── index.js       ← 工具注册表
│   │   ├── safe-path.js   ← 信任路径校验
│   │   ├── read.js / write.js / edit.js
│   │   ├── web_fetch.js / web_search.js
│   │   ├── draw.js        ← 文生图
│   │   └── vision.js      ← 图片视觉理解
│   ├── memory/
│   │   └── agent-compact.js ← jsonl 归档 + compactSession
│   └── agent-capabilities.json ← 多模态能力配置
├── prisma/
│   ├── schema.prisma      ← 数据模型定义
│   ├── migrations/        ← 数据库迁移历史
│   ├── archives/          ← Chat 压缩归档（Markdown）
│   ├── agent-archives/    ← Agent 压缩归档（.jsonl）
│   └── images/            ← 生成图片
├── shared/
│   └── ipc-contracts.js   ← 前后端通信合约定义
└── docs/project/          ← 设计文档
```

---

## Agent 工具系统

| 工具 | 功能 | 依赖 |
|------|------|------|
| `read_file` | 读取本地文件 | 信任路径 |
| `write_file` | 写入/覆盖文件 | 信任路径 |
| `edit_file` | 精确修改文件（搜索+替换） | 信任路径 |
| `web_fetch` | 抓取网页内容并转为 Markdown | 网络 |
| `web_search` | 互联网搜索 | 网络 + `SEARCH_API_KEY` 环境变量 |
| `generate_image` | 文生图 | image 能力配置 |
| `vision` | 图片理解（识别截图/照片/图表） | vision 能力配置 |

> 文生图和视觉理解需要额外配置：在「小帮手」中为 Agent 绑定对应 type 的大脑（`image` / `vision`）。

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
4. **前端** — 压缩后的 session 顶部显示「对话已压缩」提示 + 归档路径

### 辩论赛

辩论数据存在专用的 Debate 表系中，不走压缩逻辑。完整历史可通过 Prisma 按辩题/角色/时间搜索。

---

## UI 设计风格

**CLI-First 反差美学** — 最原始的手绘质感，承载最前沿的 AI 交互。

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
- Agent 归档位置：`prisma/agent-archives/`（开发）/ `userData/agent-archives/`（生产）
- Next.js 16 存在 API 差异，编写代码前先查阅 `node_modules/next/dist/docs/` 中的相关指南

---

## License

MIT
