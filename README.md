# OpenRise

**OpenRise** — 一个本地优先的智能体编排实验室，命令驱动的极客沙盒。

基于 Electron + Next.js 构建，数据存储在本地 SQLite 中，所有 API 调用在客户端完成。

---

## 技术栈

| 维度 | 选型 |
|------|------|
| 外壳容器 | Electron |
| 前端框架 | Next.js (App Router, Static Export) |
| 样式方案 | Tailwind CSS v4 |
| 本地后端 | Node.js (Electron Main Process) |
| 数据库 | SQLite + Prisma |
| AI SDK | OpenAI 兼容 API (Chat Completions) |

## 快速开始

```bash
# 安装依赖
npm install

# 初始化数据库
npx prisma migrate dev --name init

# 启动开发环境（同时启动 Next.js + Electron）
npm run dev
```

## 项目结构

```
openrise/
├── src/
│   └── app/          ← Next.js 前端（页面、组件）
├── main/
│   ├── main.js       ← Electron 主进程（窗口管理、IPC handler）
│   ├── db.js         ← Prisma 数据库客户端
│   └── preload.js    ← 预加载脚本（IPC 桥接）
├── prisma/
│   ├── schema.prisma ← 数据模型定义
│   └── migrations/   ← 数据库迁移历史
├── shared/
│   └── ipc-contracts.js  ← 前后端通信合约定义
└── docs/
    └── project/      ← 项目文档（架构、UI 设计、数据模型等）
```

## 数据模型

```
Brain ──1:N──> Role ──1:N──> Individual ──1:N──> Message
```

- **Brain** — API 配置（供应商、模型、密钥）
- **Role** — 角色模板（soul/rule）
- **Individual** — 对话实体，绑定 Role 和 Brain
- **Message** — 对话历史

## 命令系统

| 命令 | 功能 |
|------|------|
| `/brain` | 配置大脑（API Key、模型） |
| `/role` | 创建/管理人物 |
| `/chat` | 进入对话模式 |

## 开发说明

- 电子主进程 (`main/`) 使用 CommonJS，不与前端 TypeScript 混用
- 修改 `main/` 下的代码需要重启 `npm run dev`
- 修改 `src/` 下的前端代码支持热更新
- 数据库路径自动切换：开发时用 `prisma/dev.db`，生产时用用户数据目录
