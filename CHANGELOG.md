# Changelog

## v0.1.0 (2026-06-07)

### 功能特性

- **双模交互** — CLI 命令（`/brain`、`/role`、`/chat`、`/agent`、`/debate`）+ GUI 按钮双模驱动
- **角色对话** — 创建有灵魂的角色（soul + rule），Markdown 渲染，流式输出
- **Agent 自主执行** — ReAct 循环，支持 30 步深度迭代，自动调用工具完成任务
- **辩论赛沙盒** — 8 辩手 + 3 裁判，LLM 编排五阶段辩论，手动步进控制
- **工具系统** — 读写文件、网页抓取、互联网搜索、文生图、图片视觉理解
- **多模态能力配置** — Agent 可独立绑定画图/视觉大脑
- **记忆管理** — Chat 自动压缩归档为 Markdown；Agent jsonl 归档 + compactSession 持久化压缩
- **手绘风格 UI** — SVG 炭笔滤镜 + 素描纸纹理
- **100% 本地** — SQLite 存储，无云同步无遥测

### 技术栈

- Electron 41 + Next.js 16（静态导出）+ React 19 + Tailwind v4
- Prisma 5 + SQLite
- OpenAI 兼容 API（DeepSeek、GLM、Ollama 等）

### 发布注意

- 首次启动自动从 `schema.sql` 建表，无需用户手动运行 Prisma
- 支持 Windows（NSIS）、macOS（DMG）、Linux（AppImage）
