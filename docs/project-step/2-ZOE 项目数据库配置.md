# 数据库配置与数据模型设计

### 技术选型

ZOE 采用 **SQLite + Prisma** 作为数据层：

- **SQLite**：单文件数据库，零配置免安装，随 Electron 应用打包。用户不需要安装任何数据库服务，数据库就是一个 `.db` 文件。这是本地桌面应用（VS Code、Slack、Signal）的行业标准选择。
- **Prisma**：TypeScript 优先的 ORM，自动生成类型定义，提供声明式迁移和智能提示，大幅提升数据库操作的开发体验。

---

## 第一步：安装 Prisma

Bash

```
npm install prisma --save-dev
npm install @prisma/client
```

`prisma` 是 CLI 工具（迁移、生成客户端），`@prisma/client` 是运行时库，用于在代码中操作数据库。

---

## 第二步：初始化 Prisma 并指定 SQLite

Bash

```
npx prisma init --datasource-provider sqlite
```

执行结果：

- 创建 `prisma/` 文件夹，内有 `schema.prisma` —— 数据模型定义文件
- 创建 `prisma.config.ts` —— Prisma v7 的配置文件，声明 Schema 路径、迁移目录和数据库连接串来源
- 创建 `.env` 文件，定义 `DATABASE_URL` 指向 SQLite 数据库文件路径

> **注：Prisma v7 的配置变化**
>
> 与 v6 及更早版本不同，Prisma v7 的数据库连接串不再写在 `schema.prisma` 中，而是由 `prisma.config.ts` 管理：
>
> - `schema.prisma` 中的 `datasource db` 块只声明数据库类型（`provider = "sqlite"`），不再包含 `url`
> - `prisma.config.ts` 通过 `process.env["DATABASE_URL"]` 读取 `.env` 中的连接串
>
> **关于 generator 选择：** Prisma v7 引入了新的 `prisma-client` 生成器，但它只输出 TypeScript 文件。Electron 主进程（`main/`）使用 CommonJS 模块，无法直接加载 `.ts` 文件。因此本项目中我们继续使用 `prisma-client-js` 生成器，它输出标准的 JavaScript，与 CJS 完全兼容。

---

## 第三步：定义数据模型（Schema）

打开 `prisma/schema.prisma`，替换为以下内容：

```
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
}

// 1. 大脑配置：存储 API Key 和模型选型
model Brain {
  id        String   @id @default(uuid())
  name      String   // 别名，如 "我的DeepSeek"
  provider  String   // openai, anthropic, deepseek 等
  modelName String   // 具体模型号，如 "deepseek-chat"
  apiKey    String
  baseUrl   String?  // 自定义中转地址
  createdAt DateTime @default(now())
  roles     Role[]
}

// 2. 角色模板：定义灵魂与规则
model Role {
  id          String       @id @default(uuid())
  name        String       // 角色名，如 "毒舌程序员"
  soul        String       // 性格描述
  rule        String       // 行为准则
  brain       Brain        @relation(fields: [brainId], references: [id])
  brainId     String
  individuals Individual[]

  @@index([brainId])
}

// 3. 个人实体：人才库中的真实个体
model Individual {
  id        String    @id @default(uuid())
  name      String    // 姓名，如 "张三"
  avatar    String?   // 头像路径或 Emoji
  role      Role      @relation(fields: [roleId], references: [id])
  roleId    String
  messages  Message[]
  createdAt DateTime  @default(now())

  @@index([roleId])
}

// 4. 记忆管理：存储对话历史
model Message {
  id           String   @id @default(uuid())
  content      String
  role         String   // user, assistant, system
  individual   Individual @relation(fields: [individualId], references: [id])
  individualId String
  createdAt    DateTime @default(now())

  @@index([individualId])
}
```

> **深度解析：三层解耦设计 (Brain → Role → Individual)**
>
> 传统聊天应用中，模型配置、角色性格、对话历史通常绑死在一起。ZOE 将它们拆为三层，每一层只关注一件事：


| 层级      | 名称         | 类比  | 职责                                         |
| ------- | ---------- | --- | ------------------------------------------ |
| **算力层** | Brain      | 发动机 | 管理 API 连接、模型选型（DeepSeek / GPT / Ollama）    |
| **灵魂层** | Role       | 模具  | 定义 AI 的"人格"——性格描述 + 行为准则（一段 System Prompt） |
| **实体层** | Individual | 产品  | 从 Role 模板实例化出的具体个体，拥有独立的对话记忆               |

>
> 举个例子：你配置了一个 "Brain-A"（DeepSeek API），创建了一个 "毒舌程序员" Role，然后从这个 Role 实例化出"张三"和"李四"。张三和李四共享"毒舌程序员"的 System Prompt，但他们的对话历史（Message）是物理隔离的，互不干扰。
>
> 如果以后想换模型，只需要修改 Brain 的配置，Role 和 Individual 都无需改动。

> **深度解析：为什么要加索引？**
>
> Schema 中 `@@index` 标记为外键字段（`brainId`、`roleId`、`individualId`）添加了数据库索引。SQLite 在小数据量下有没有索引差别不大，但随着对话积累，Message 表可能达到数万条记录。按 `individualId` 查询历史消息时，索引可以将查询时间从全表扫描（线性）降至索引查找（对数），这是一个低成本高收益的优化。

---

## 第四步：同步数据库并生成 Prisma 客户端

Bash

```
npx prisma migrate dev --name init_zoe
```

这条命令做了三件事：

1. 将 `schema.prisma` 与当前数据库对比，生成迁移 SQL 文件到 `prisma/migrations/`
2. 执行迁移，创建 `prisma/dev.db`（SQLite 数据库文件）
3. **自动调用 `prisma generate`**，在 `node_modules/@prisma/client` 下生成类型安全的客户端代码（JavaScript，兼容 CommonJS）

执行成功后，数据库中会创建 `Brain`、`Role`、`Individual`、`Message` 四张表，并自动建立外键关联。

> **关于 `npx prisma generate`**
>
> `migrate dev` 已经自动调用了 `generate`，所以**通常情况下你不需要再单独跑一次**。但以下场景需要手动跑 `npx prisma generate`：
>
> 1. **改了 schema 但不需要跑 migration**（比如开发阶段调整字段试结构，用 `prisma db push` 时）
> 2. **删除了 `node_modules` 重新安装依赖后**——`@prisma/client` 包还在，但生成的客户端代码丢了
> 3. **切换到新分支**，分支上有不同的 schema 版本
>
> 手动生成命令：

```bash
npx prisma generate
```

>
> 建议在项目 README 或初始化脚本中将此命令纳入"拉取代码后首次运行"的流程中。

---

## 第五步：在 Electron 主进程中接入数据库

在 `main/` 目录下创建 `db.js`，负责初始化 Prisma 客户端并处理数据库文件路径。

JavaScript

```
// main/db.js
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const { app } = require('electron');

const isDev = !app.isPackaged;

// 关键：数据库文件路径随环境切换
// 开发时：使用项目目录下的 prisma/dev.db
// 生产时：使用用户数据目录下的 zoe.db（用户有写入权限）
const dbPath = isDev
  ? path.join(__dirname, '../prisma/dev.db')
  : path.join(app.getPath('userData'), 'zoe.db');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${dbPath}`,
    },
  },
});

module.exports = prisma;
```

> **深度解析：为什么数据库路径要动态处理？**
>
> 在开发环境中，数据库文件放在项目 `prisma/` 目录下，直接可见，方便调试。
>
> 在生产环境中，Electron 应用是被打包成 `.exe` / `.app` 安装到用户电脑的，应用目录是只读的。必须把数据库文件放在 `app.getPath('userData')` 返回的用户数据目录下（Windows 上是 `%APPDATA%/zoe/`，macOS 上是 `~/Library/Application Support/zoe/`），用户才有读写权限。这也是所有 Electron 应用（VS Code、Slack 等）的标准做法。

---

## 补充

### Prisma 引擎打包注意事项

Prisma 客户端依赖一个 Rust 编译的原生二进制文件（query-engine）。使用 `electron-builder` 打包时，需要确保这个引擎被正确包含：

在 `package.json` 中添加：

```json
"build": {
  "extraResources": [
    {
      "from": "node_modules/@prisma/client/",
      "to": "prisma-client",
      "filter": ["**/*query-engine*", "**/*.so", "**/*.dylib", "**/*.dll"]
    }
  ]
}
```

并在 `main/db.js` 中通过 `process.resourcesPath` 指定引擎路径，否则生产环境启动时会因找不到引擎而崩溃。具体配置将在后续打包阶段详细展开。

# 🏗️ ZOE 基础设施完成：开启业务开发阶段

至此，**ZOE** 的底层架构已全部打通。你已经完成了从 UI 框架（Next.js）到系统外壳（Electron），再到持久化基因（Prisma/SQLite）的完整建设。

---

## 1. 当前工程状态总览

目前的项目已经处于“通电”状态，具体进度如下：

- **表现层 (Renderer)**：基于 **Next.js 16.2.4** 的前端环境已就绪，且已将 `app/` 移入 `src/` 以实现代码隔离。
    
- **系统层 (Main)**：**Electron** 主进程与预加载脚本（Preload）骨架搭建完毕，支持安全隔离的 IPC 通信。
    
- **数据层 (Database)**：**Prisma v7** 配合 **SQLite** 已完成初始化。三层模型（Brain → Role → Individual）的数据库迁移已成功执行，生成了 `dev.db` 实体文件。
    
- **启动流 (Scripts)**：通过 `npm run dev` 实现了前端服务启动与 Electron 窗口拉起的自动化串联。
    

---

## 2. 理解 `npm run dev`：前端热更新 vs. 后端静态加载

在接下来的开发中，你会发现一个物理事实：**修改前端代码界面即变，但修改后端逻辑则需重启。**

### 前端：热更新 (HMR) 的魅力

当你修改 `src/` 目录下的组件或样式时，Electron 窗口会像浏览器一样实时刷新。

- **原理**：`npm run dev` 启动了 Next.js 的开发服务器（默认端口 3000）。Electron 窗口本质上是一个加载了 `http://localhost:3000` 的浏览器。Next.js 的热更新机制（Hot Module Replacement）会通过 WebSocket 将代码补丁推送到窗口，实现不刷新页面的状态更新。
    

### 后端：为什么不支持“热更新”？

当你修改 `main/` 目录下的代码（如 `main.js` 或 `db.js`）时，系统不会自动生效。

- **原理**：Electron 的**主进程（Main Process）**是直接运行在操作系统级的 Node.js 环境中的。一旦启动，它就完成了对系统 API、数据库连接池和 IPC 监听器的初始化。
    
- **物理局限**：主进程负责窗口的创建和底层资源的锁定。如果“热重载”主进程，意味着必须销毁当前的进程环境并重新分配系统资源，这通常会导致窗口崩溃或数据库连接异常。
    
- **事实**：目前 ZOE 的配置中，修改主进程逻辑后，必须关闭窗口并重新执行 `npm run dev` 以重新编译并加载后端逻辑。
    

---

## 3. 开发建议：高效协作流

为了平衡这种“半自动”的开发体验，建议遵循以下习惯：

- **UI 优先**：如果只是调整界面布局、写 CSS 样式，保持 `npm run dev` 运行即可，享受极致的热更新速度。
    
- **接口调试**：当你修改了 `main/db.js` 中的数据库查询逻辑，或者在 `preload.js` 中暴露了新的 API 接口，请务必 **Ctrl+C 重启** 终端任务。
    
- **类型检查**：由于使用了 Prisma，每次修改数据库字段后，除了重启后端，记得运行 `npx prisma generate` 以同步前端的类型提示。
    

---

> **阶段总结**：你已经搭建好了实验室的所有硬件，并接通了电源。接下来，我们要开始编写第一条“神经信号”——实现 **Brain 配置界面**，让 ZOE 能够连接到云端的 LLM 算力。


