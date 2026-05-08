# 桌面软件开发中的数据隔离与 Prisma 实践

> 本文档记录桌面应用（Electron）与 Web 应用在数据处理上的核心差异，以及 Prisma 在桌面项目中的实践经验和坑点。

---

## 一、数据隔离：为什么测试数据不会跑到用户电脑上？

在 Web 开发中，你部署的是"运行环境"；而在桌面软件中，你分发的是"安装包（代码 + 资源）"，**不包含本地数据库文件**。数据隔离由三道防线保障。

---

### 1.1 第一道防线：`.gitignore`（物理隔离）

开发目录中的 `prisma/dev.db` 是一个真实的数据库文件。如果把它提交到 Git，每次运行测试产生的实验数据都会进入版本控制。

**最佳实践：** 在 `.gitignore` 中添加数据库文件规则：

```
# 数据库文件（每个开发者在本地独立生成）
*.db
prisma/dev.db
prisma/dev.db-journal

# 环境变量（可能包含 API Key）
.env
```

这样，GitHub 仓库里只有 `schema.prisma`（数据库蓝图），没有你的实验数据。

---

### 1.2 第二道防线：打包策略（electron-builder）

执行 `npm run build` 生成安装包时：

- **代码打包：** Next.js 静态文件（`out/`）和 Electron 代码（`main/`）被压缩进安装包
- **资源过滤：** `electron-builder` 默认只包含程序运行必需的文件，`prisma/dev.db` **不会被打包**
- **结果：** 用户下载安装后，软件目录下是**空的，没有数据库**

---

### 1.3 第三道防线：首次运行的"冷启动"逻辑

当用户第一次打开 ZOE 时，程序执行以下逻辑：

1. **路径探测：** 主进程检查用户数据目录下是否存在 `zoe.db`
   - Windows: `C:\Users\<用户名>\AppData\Roaming\ZOE\zoe.db`
   - macOS: `~/Library/Application Support/ZOE/zoe.db`
   - Linux: `~/.config/ZOE/zoe.db`

2. **自动初始化：**
   - **新用户：** 自动创建空的 `zoe.db`，执行 Prisma Migration 建表
   - **老用户：** 直接读取现有数据

3. **结果：** 每个用户的数据库都在他们自己的电脑上**从零生成**

> **注意：** 生产环境需要将 `prisma/migrations/` 目录打包进安装包，并在首次运行时通过 `npx prisma migrate deploy` 应用迁移。详见下文"生产环境迁移策略"。

---

### 1.4 ZOE 的具体实现

`main/db.js` 中的路径判断正是这套逻辑的落地：

```javascript
const isDev = !app.isPackaged;

const dbPath = isDev
  ? path.join(__dirname, '..', 'prisma', 'dev.db')  // 开发：项目本地
  : path.join(app.getPath('userData'), 'zoe.db');    // 生产：用户数据目录
```

- **开发时：** 读写项目下的 `dev.db`，包含测试数据
- **发布后：** 用户目录下没有 `prisma/dev.db`，Electron 指引程序到用户数据文件夹，Prisma 在那里新建空白数据库

---

### 1.5 Web vs 桌面应用的"数据观"

| 维度 | Web 应用 | 桌面应用（ZOE） |
|------|----------|-----------------|
| **数据位置** | **中心化：** 所有用户共用服务器上的数据库 | **去中心化：** 每个用户拥有自己本地的数据库文件 |
| **部署内容** | **环境镜像：** 包含代码、配置、连接云端数据库的密钥 | **二进制包：** 只包含逻辑和资源，数据在本地按需生成 |
| **实验数据处理** | 通过环境变量隔离（Dev/Prod DB） | **物理抛弃：** `.gitignore` 丢弃本地库，代码在客户端自建库 |

**一句话：** 你的实验数据永远留在 `dev.db` 里，从未离开你的硬盘。你发给用户的只是"建房子的图纸（Schema）"，用户自己在他们家盖房子。

---

## 二、Prisma 在桌面应用中的实践

### 2.1 Prisma 是什么？

Prisma 是一个 **ORM（Object-Relational Mapping）**，可以理解为"数据库翻译官"。它做了三件事：

1. **蓝图定义（Schema）：** 在 `schema.prisma` 里声明数据模型
2. **代码生成（Client）：** 根据 Schema 生成类型安全的客户端代码
3. **迁移同步（Migration）：** 将 Schema 变成真实的数据库表

传统方式手写 SQL：

```sql
SELECT * FROM Individual WHERE id = 'xyz';
```

字符串写错了编译器不会报错，运行时才崩溃。Prisma 的写法：

```typescript
const ind = await prisma.individual.findUnique({ where: { id: 'xyz' } });
// ind.name, ind.roleId 等字段有完整 TypeScript 类型提示
```

---

### 2.2 为什么在桌面应用中选择 Prisma？

对于 ZOE 这种涉及多实体关系（Brain → Role → Individual → Message）的项目，Prisma 的优势：

| 优势 | 说明 |
|------|------|
| **类型安全** | 输入 `prisma.individual.` 自动提示 `.name`、`.soul`、`.roleId`，无需记表名、不怕拼写错误 |
| **可视化** | 看一眼 `schema.prisma` 就知道系统结构，无需打开数据库管理工具 |
| **版本控制** | 每次 Schema 变更生成迁移文件，相当于给数据库结构做了 Git |
| **迁移复用** | 开发环境用 `migrate dev`，生产环境用 `migrate deploy`，同一套迁移文件 |

---

### 2.3 替代方案对比

| 方案 | 特点 | 适用场景 |
|------|------|----------|
| **Prisma** | 类型安全 + 迁移系统 + 自动生成客户端，但有 ~15MB Rust 引擎二进制 | 需要类型安全、团队协作、频繁迭代 Schema 的项目 |
| **Drizzle ORM** | 轻量级、TypeScript 优先、无引擎二进制、对 Electron 友好 | 厌烦 Prisma 打包体积和兼容性问题时的首选替代 |
| **better-sqlite3** | 纯原生、写 SQL，速度极快 | 对 SQL 极度熟悉、不受框架束缚的硬核开发者 |
| **Sequelize / TypeORM** | 老牌 ORM | 略显臃肿，在现代 AI 应用开发中逐渐失宠 |

---

### 2.4 版本选择：Prisma 7.x vs 5.x

#### 为什么最初装了 7.x？

执行 `npm install @prisma/client` 时未指定版本，npm 默认拉取最新 Stable。在追求"用最新工具"的习惯下容易遇到兼容性问题。

#### 7.x 的关键变化

| 变化 | 说明 | 影响 |
|------|------|------|
| 生成器重命名 | `prisma-client-js` → `prisma-client` | `prisma-client` 只输出 TS 文件，CJS 无法直接加载；需用回 `prisma-client-js` 输出 JS |
| 配置外移 | `datasource.url` 从 Schema 移到 `prisma.config.ts` | 增加一层配置管理，但功能无变化 |
| 构造参数移除 | `PrismaClient({ datasources })` 不再支持，强制 driver adapter | driver adapter 依赖 `better-sqlite3` 等原生模块，在 Electron 中编译不兼容 |

#### 本项目的实际经历

```
Prisma 7.x 安装 → datasources 参数失效 → 安装 better-sqlite3 适配
→ better-sqlite3 在 Electron 中编译失败 → 降级 Prisma 5.22.0
→ 恢复传统 datasources 直连 → 稳定运行
```

**结论：** 如果 7.x 在 Electron 打包或 IPC 通信中卡住，果断降级到 5.x / 6.x。**工程的第一原则是"跑通"，而不是"追新"。**

---

### 2.5 生产环境迁移策略

桌面应用在生产环境中的数据库初始化与 Web 应用不同，需要特殊处理。

#### 核心思路

将迁移目录 `prisma/migrations/` 作为资源文件打包进应用，首次启动时执行 `migrate deploy`。

#### 实现步骤

1. **在 `electron-builder` 配置中包含迁移文件：**

```json
"build": {
  "extraResources": [
    {
      "from": "prisma/migrations",
      "to": "migrations",
      "filter": ["**/*"]
    }
  ]
}
```

2. **在 `main/db.js` 中接入生产迁移：**

生产环境中，Prisma 引擎路径和迁移文件路径都需要从 `process.resourcesPath` 读取（打包后的资源目录），而不是开发时的项目目录。具体配置将在打包阶段落地。

> **开发 vs 生产迁移命令对照：**


| 环境  | 命令                          | 作用                                  |
| --- | --------------------------- | ----------------------------------- |
| 开发  | `npx prisma migrate dev`    | 根据 Schema 生成迁移文件 + 应用到本地数据库 + 生成客户端 |
| 生产  | `npx prisma migrate deploy` | 仅执行未应用的迁移文件（不生成新迁移）                 |
| 通用  | `npx prisma generate`       | 仅生成客户端代码（不产生迁移）                     |

---

### 2.6 打包注意事项

Prisma 依赖一个 Rust 编译的原生二进制文件（query-engine），在 Electron 中打包时需要：

1. **确认引擎平台：** Prisma 会下载当前平台的引擎二进制。打包时需确保目标平台与开发平台一致（或配置交叉编译）
2. **引擎路径配置：** 打包后引擎文件在 `extraResources` 中，需要在 `PrismaClient` 初始化时通过 `prismaEngine` 等环境变量指定路径
3. **体积影响：** query-engine 约 15MB，会增大安装包体积

---

## 三、总结

| 主题 | 要点 |
|------|------|
| **数据隔离** | `.gitignore` 阻止提交 → `electron-builder` 阻止打包 → 冷启动在用户设备上从零创建 |
| **Prisma 定位** | 类型安全 ORM，提升开发效率，但也带来打包复杂度和二进制依赖 |
| **版本建议** | Electron 项目优先使用 Prisma 5.x，避开 7.x 的 driver adapter 问题 |
| **迁移策略** | 开发用 `migrate dev`，生产用 `migrate deploy`，迁移文件需打包进安装包 |
| **替代方案** | 如果 Prisma 的打包问题影响交付，Drizzle ORM 是最直接的轻量替代 |
