# 🛠️ ZOE 项目架构与初始化指南

### 核心哲学：双星模型 (The Dual-Star Architecture)

在 ZOE 中，我们并没有把 AI 逻辑直接写在前端，而是采用了**前后端分离的桌面化架构**：

1. **渲染进程 (Next.js)：** 负责"美"，即 UI 交互、Agent 的聊天气泡、圆桌的可视化。

2. **主进程 (Electron Node.js)：** 负责"力"，即调用 LLM API、读写 SQLite 数据库、管理本地文件。

---

## 第一步：创建目录与初始化 Next.js

首先，我们创建一个项目根目录，并在其中安装 Next.js。

Bash

```
mkdir zoe
cd zoe
# 我们将前端代码放在 src 文件夹中，保持根目录整洁
npx create-next-app@latest .
```

> **⚠️ 重要：不要选择 "Use recommended defaults"**
> 
> Next.js 16 的推荐默认模板（`app-tw`）会跳过所有交互式选项，**不会**询问是否启用 `src/` 目录，
> 导致前端代码直接散落在根目录下。之后还要手动修复，平添麻烦。
>
> 正确做法：当出现 `Would you like to use the recommended Next.js defaults?` 时，**选 No**，
> 然后手动逐项选择。

在交互式配置中，请选择：

| 选项 | 选择 | 说明 |
|------|------|------|
| **TypeScript** | **Yes** | 强类型对复杂的 Agent 逻辑很有帮助 |
| **ESLint** | **Yes** | 代码规范检查 |
| **Tailwind CSS** | **Yes** | 样式框架 |
| **`src/` directory** | **Yes** | ⭐ **非常重要**，方便与 Electron 代码区分 |
| **App Router** | **Yes** | 当前主流路由方案 |
| **Import alias** | `@/*` | 路径别名 |

> **深度解析：为什么要用 `src/` 目录？**
>
> 在 ZOE 中，Electron 的后端代码放在根目录的 `main/` 下。如果把前端代码也放在根目录（`app/`、`pages/` 等），两个"宇宙"的文件就会混在一起。使用 `src/` 目录可以实现**代码物理隔离**，防止 Next.js 构建工具意外扫描到 Node.js 后端代码，同时让项目结构一目了然。

> **💡 如果不小心选了推荐默认（没有 `src/` 目录）：**
> 执行以下命令手动修复即可，无需重来：
> ```bash
> mkdir src
> mv app/ src/app/
> # 然后修改 tsconfig.json 中的路径映射：
> # "@/*": ["./*"]  →  "@/*": ["./src/*"]
> ```

---

## 第二步：引入 Electron 核心枢纽

安装 Electron 及其配套工具，让 Next.js 项目具备桌面化能力。

Bash

```
npm install --save-dev electron electron-builder concurrently wait-on
npm install electron-serve
```

> **深度解析：各依赖的作用**
>
> - **`electron`**: 桌面外壳。它将你的网页应用包装成一个原生桌面窗口，并提供调用系统 API（文件系统、菜单栏、托盘等）的能力。
>
> - **`concurrently`**: 同时开启两个"宇宙"。一个跑 Web Server (Next.js)，一个跑桌面外壳 (Electron)。没有它，你需要手动开两个终端窗口。
>
> - **`wait-on`**: 像一个哨兵。Next.js 启动需要时间，它会等到 `http://localhost:3000` 端口响应后再唤醒 Electron，避免窗口打开时是一片空白。
>
> - **`electron-builder`**: 打包工具。用于将你的应用打包成可分发的 `.exe` / `.app` / `.AppImage` 安装包。
>
> - **`electron-serve`**: 解决"路径难题"。在生产环境下，Electron 是从本地文件系统加载网页的，它能帮我们将 Next.js 的静态导出目录（`out`）伪装成一个内部服务器。

---

## 第三步：配置项目骨架

在根目录下创建 `main` 文件夹，存放 Electron 的"大脑"逻辑。

```
mkdir main
```

### 1. 编写主进程 (`main/main.js`)

这是 Electron 的入口，负责开启窗口和管理底层。它是应用的**心脏**，拥有最高权限。

JavaScript

```
const { app, BrowserWindow } = require('electron');
const path = require('path');
const serve = require('electron-serve').default;

const isDev = !app.isPackaged;
const loadURL = serve({ directory: 'out' }); // 指向 Next.js 导出目录

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // 保持安全，禁用直接调用 Node
      contextIsolation: true, // 开启隔离
    },
  });

  if (isDev) {
    // 开发模式加载 Next.js 的本地服务器
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools(); // 自动打开开发者工具
  } else {
    // 生产模式加载静态文件
    loadURL(mainWindow);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

> **深度解析：环境自适应逻辑**
>
> `main.js` 的核心设计是 `isDev` 判断，它决定了 Electron 从哪里加载页面：
>
> | 逻辑节点 | 开发模式 (isDev = true) | 生产模式 (isDev = false) |
> |---|---|---|
> | **信号来源** | 本地网络端口 (`localhost:3000`) | 本地文件系统 (`out/index.html`) |
> | **热更新** | 支持 HMR，即改即显 | 静态加载，无法修改 |
> | **调试工具** | 自动打开 DevTools | 默认关闭 |
> | **资源加载器** | 直接通过 URL 加载 | 使用 `electron-serve` 封装路径 |
>
> 这样设计的好处是：开发时享受 Next.js 的热更新体验，打包后又能脱离服务器独立运行。

### 2. 编写预加载脚本 (`main/preload.js`)

这是"隐形框架"的桥梁，用来安全地把后端能力暴露给前端。它是**海关**，是唯一允许在前端和后端之间"走私"信息的通道。

JavaScript

```
const { contextBridge, ipcRenderer } = require('electron');

// 暴露给前端的 API
contextBridge.exposeInMainWorld('zoeAPI', {
  // 比如：发送消息给主进程进行 API 调用
  invokeLLM: (data) => ipcRenderer.invoke('llm-call', data),
  // 比如：读取本地人才库文件
  loadTalents: () => ipcRenderer.invoke('get-talents'),
});
```

> **深度解析：安全隔离策略**
>
> `contextBridge.exposeInMainWorld` 就像在前端窗口 (`window`) 对象上开了一个安全的后门（`window.zoeAPI`），只暴露我们允许的函数。配合 `contextIsolation: true`，前端代码无法直接访问 Node.js 的 `fs`、`child_process` 等模块，只能通过 `invokeLLM` 和 `loadTalents` 等受限的关口与后端通信。这遵循了最小权限原则，有效防止恶意脚本通过渲染进程入侵系统。

---

## 第四步：配置 `package.json`

修改根目录下的 `package.json`，让 npm 知道如何同时运行这两个家伙。

JSON

```
{
  "name": "zoe",
  "version": "0.1.0",
  "main": "main/main.js", // 指定 Electron 入口
  "scripts": {
    "next:dev": "next dev",
    "next:build": "next build",
    "next:lint": "next lint",
    "electron:dev": "wait-on http://localhost:3000 && electron .",
    "dev": "concurrently \"npm run next:dev\" \"npm run electron:dev\"",
    "build": "next build && electron-builder"
  }
}
```

> **深度解析：各脚本的作用**
>
> - **`next:dev`**: 启动 Next.js 开发服务器，监听 `src/` 目录的热更新。
> - **`next:build`**: 构建 Next.js 项目，生成 `out/` 目录用于生产环境。
> - **`next:lint`**: 运行 ESLint 检查代码质量。
> - **`electron:dev`**: 先用 `wait-on` 等待 Next.js 端口就绪，再启动 Electron 窗口加载页面。
> - **`dev`**: 通过 `concurrently` 同时运行前端服务和 Electron 窗口，实现"一键启动"。
> - **`build`**: 先构建前端静态文件，再用 `electron-builder` 打包成桌面安装包。

---

## 第五步：适配 Next.js 为静态导出

因为 Electron 是在本地运行的，Next.js 必须配置为 **Static Export** 模式，才能在不依赖云端服务器的情况下打包运行。

打开 `next.config.ts`：

TypeScript

```
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',    // 开启静态导出
  images: {
    unoptimized: true, // 静态导出必须禁用 Next.js 的图片优化
  },
};

export default nextConfig;
```

> **深度解析：为什么需要 Static Export？**
>
> 开启 `output: 'export'` 后，执行 `next build` 会生成一个 `out` 文件夹。Electron 将像读取本地文件夹里的照片一样加载你的 React 应用，而不再依赖云端服务器。
>
> 在生产环境下（`npm run build`），流程是：
> 1. `next build` 将前端导出为纯静态文件到 `out/` 目录
> 2. `electron-builder` 将这些文件和 Electron 外壳打包成一个 `.exe` 或 `.app` 安装包
> 3. 用户安装后，Electron 直接加载本地文件，无需网络连接

---

## 第六步：项目结构总览

完成上述步骤后，你的项目结构应该是这样的：

```
zoe/
├── src/
│   └── app/                ← Next.js 前端代码（页面、组件）
├── main/
│   ├── main.js             ← Electron 主进程入口
│   └── preload.js          ← 预加载脚本（安全桥梁）
├── public/                 ← 静态资源
├── docs/                   ← 项目文档
├── package.json            ← 项目配置（含 Electron 入口和 scripts）
├── next.config.ts          ← Next.js 配置（静态导出模式）
├── tsconfig.json           ← TypeScript 配置（@/* → ./src/*）
├── eslint.config.mjs       ← ESLint 配置
├── postcss.config.mjs      ← PostCSS 配置（Tailwind）
└── node_modules/           ← 依赖包
```

---

## 第七步：一键启动与开发验证

### 启动命令

执行以下命令即可同时启动 Next.js 前端服务和 Electron 桌面窗口：

Bash

```
npm run dev
```

### 启动序列详解

当你在终端输入 `npm run dev`，系统内部会发生以下连锁反应：

#### 1. 迸发阶段 (Concurrently Launch)

`concurrently` 通过多线程能力，同时唤醒两条指令：

- **线程 A：** 执行 `next dev`。开始扫描 `src/` 目录，构建内存中的组件树，准备热更新服务。
- **线程 B：** 执行 `wait-on`。它进入一个高频轮询状态，不断尝试握手 `http://localhost:3000`。

#### 2. 等待与握手 (The Sentry Gate)

此时，Electron 进程尚未启动。`wait-on` 确保了"渲染环境"先于"宿主环境"准备就绪。这是解决 Electron + Web 框架集成中"竞态条件"（Race Condition）的工程级标准解法。

#### 3. 宿主觉醒 (Electron Invocation)

一旦 `wait-on` 监测到端口开启，线程 B 立即执行 `electron .`。

- Electron 加载根目录的 `package.json`，读取 `"main": "main/main.js"` 字段。
- 主进程启动，调用 `createWindow()` 函数。

#### 4. 环境注入与安全隔离 (Security Handshake)

在窗口创建的瞬间，`main.js` 会加载 `preload.js`：

- **Preload 注入：** 它在渲染进程的全局对象中注入 `window.zoeAPI`。
- **隔离策略：** `contextIsolation: true` 确保了前端无法直接访问 Node.js 的 `fs` 或 `child_process` 模块，只能通过 `invokeLLM` 等受限的关口进行通信。

#### 5. 信号捕获 (Final Rendering)

窗口最终执行 `mainWindow.loadURL('http://localhost:3000')`。此时，Next.js 渲染的界面正式出现在原生窗口中，启动序列完成。

### 核心疑问解答

#### 它是把前端打包进窗口吗？

**在开发模式下，不是打包，而是"链接"。**

- `next dev` 会在本地 `3000` 端口开启一个开发服务器。
- Electron 窗口通过 `mainWindow.loadURL('http://localhost:3000')` 直接访问这个本地服务器。
- **只有在生产环境（`npm run build`）下**，它才会先执行 `next build` 将前端导出为静态文件（`out` 目录），然后由 `electron-builder` 将这些文件和 Electron 外壳打包成一个 `.exe` 或 `.app` 安装包。

#### 支持前端热更新吗？

**完全支持。** 由于 Electron 窗口在开发时实质上是一个"魔改版的 Chrome 浏览器"，它加载的是 `localhost:3000`。当你修改 `src/` 下的前端代码时，Next.js 的热更新机制（HMR）会像在浏览器中一样，直接刷新 Electron 窗口内的内容。你无需重启项目就能看到界面变化。

_注意：如果你修改的是 `main/` 目录下的后端代码，则需要手动重启 `npm run dev`。_

---

## 补充

> **注：以下内容为开发过程中的重要注意事项，与上述步骤无直接前后关系，可根据需要查阅。**

### 端口冲突

如果你的 3000 端口被其他项目占用，`npm run dev` 将卡在 `wait-on` 阶段。建议在 `.env` 中锁定端口或在启动脚本中动态检测。

### Preload 的局限性

`preload.js` 中只能使用基本的 Node.js 模块（如 `path`）和 Electron 的 `ipcRenderer`。复杂的 Agent 业务逻辑（如调用 LLM API）应写在 `main.js` 中，通过 `ipcMain.handle` 响应前端请求。
