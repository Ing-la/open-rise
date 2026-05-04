# UI 设计文档

## 设计哲学

**CLI-First 反差美学** — 最先进的命令驱动交互逻辑，跑在最原始的草稿纸上。

OpenRise 不追求"好看"，追求**有质感**。它应该像一本用旧的实验手稿，炭笔涂抹的痕迹还在，随手翻开就能写。

> 拒绝一切"UI 规范"：没有侧边栏、没有导航栏、没有标准阴影、没有圆角过度的平滑感。

---

## 视觉规范

### 色彩（v3 — 炭笔素描定稿）

| 角色 | 色值 | 感觉 |
|------|------|------|
| **背景纸色** | `#F2F2EE` | 冷调素描纸白，微灰，偏冷 |
| **主题/描边** | `#2C2C2C` | 炭灰，铅笔线条，无彩色倾向 |
| **纸纹噪点** | `baseFrequency='0.65'` | 全局纸张颗粒，`mix-blend-mode: multiply`，不透明度 0.06 |
| **头像彩色** | 多样 | 马克笔风格高饱和色，仅用于头像标识 |

色彩演进：红墨水牛血红 (`#60100B`) → 炭笔灰 (`#2C2C2C`)，从暖调纸到冷调素描纸。

### 排版

| 用途 | 字体 | 说明 |
|------|------|------|
| **OpenRise 品牌** | Caveat (handwriting) | 手写体，大尺寸多层叠加模拟反复描画 |
| **命令/代码** | monospace / Courier Prime | 打字机字体，与手写体形成反差 |
| **中文 UI 文字** | 系统字体 | 依靠炭笔滤镜赋予质感 |

### SVG 滤镜系统

**`#tremble`** — 用于所有 SVG 描边元素（边框、图标、按钮、分割线）：
- `feDisplacementMap scale=1.8` + `baseFrequency=0.15 0.08` — 线条抖动
- `feTurbulence baseFrequency=1.2` + `feColorMatrix` — 颗粒噪点混合
- 效果：线条像铅笔画的，带轻微颗粒摩擦感

**`#charcoal`** — 仅用于 OpenRise 标题文字：
- 更高位移 (`scale=3`)，模糊后连续 alpha 衰减（`0.5` 倍乘，非硬裁剪）
- 效果：炭粉从笔迹中脱落，边缘像被橡皮擦过

---

## 状态图

```
                    ┌─────────────────┐
                    │    Home Page    │
                    │  (CommandCenter)│
                    └───┬──┬──┬──┬───┘
                        │  │  │  │
               ┌────────┘  │  │  └────────┐
               ▼           ▼  ▼           ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ /brain   │ │ /role    │ │ /chat    │
        │ BrainModal│ │RoleModal │ │ ChatView │
        │ (弹窗)   │ │(弹窗+头像)│ │ (页面)   │
        └──────────┘ └──────────┘ └──────────┘
                    ESC返回Home
```

三种命令，三种呈现形态：
- `/brain` → 模态弹窗，覆盖在首页之上
- `/role` → 模态弹窗，含头像选择器覆盖层
- `/chat` → 页面模式切换，Home 隐藏，Chat 展示

---

## 首页 (Home)

```
┌──────────────────────────────────────┐
│ ☰                     OpenRise    │ ← fixed top-0 h-12 flex items-center
│                                      │    (home/chat 共享)
│         ZZZZZZZZZZZZZZ               │ ← 炭笔大标题
│         OOOOOOOOOOOO                 │    3层偏移叠加
│         EEEEEEEEEEEE                 │    wiggle动画
│                                      │
│            > 输入 / 开始...           │ ← 命令输入框
│            ─────────────────          │    shaky-line
│                                      │
└──────────────────────────────────────┘
```

### 布局

| 元素 | 定位 | 样式 |
|------|------|------|
| 左上 `☰` | `fixed top-0 left-10` h-12 内 flex 居中 | `<path>` 三横线，`filter: tremble` |
| 右上 `OpenRise` | `fixed top-0 right-10` h-12 内 flex 居中 | `font-hand`, `filter: charcoal` |
| chat 模式名称 | absolute left-1/2 + translateX(-50% - 16px) | AvatarIcon(32px) + text-lg, whitespace-nowrap |
| 大 OpenRise 标题 | 页面居中 flex | 3 层 `<h1>` 叠加，`charcoal` 滤镜 |
| 命令输入 | `max-w-lg` 居中 | `>` 前缀透明 input + shaky-line |

### 交互

- 输入 `/brain` + Enter → 打开 BrainModal，清空输入
- 输入 `/role` + Enter → 打开 RoleModal，清空输入
- 输入 `/chat` + Enter → 切换到 ChatView 模式
- 输入框 focus → shaky-line 加深加粗
- 左上 `☰` → 功能菜单（待实现）

---

## 弹窗 (Modal)

### 通用结构

```
┌─ 手绘SVG边框（tremble滤镜）─────────┐
│                                       │
│  标题 (左)              [+](右)       │
│                                       │
│  ┌─ 内容区域 ──────────────────────┐  │
│  │  空状态: 引导文字居中           │  │
│  │  或                              │  │
│  │  表单: 字段列表                 │  │
│  └──────────────────────────────────┘  │
│                                       │
│               [取消]    [保存]        │
└───────────────────────────────────────┘
```

### 行为

- 打开：`opacity 0→1` + `scale 0.95→1`，200ms transition
- 关闭：Escape 键 / 点击遮罩 / 点击取消按钮 → 反向动画，200ms unmount
- 遮罩：半透明黑色 `rgba(0,0,0,0.3)`
- 背景：白色 `#FFFFFF`（与页面纸色对比，突出层级）

### 大脑配置 (BrainModal)

| 状态 | 内容 |
|------|------|
| 空状态（无数据） | "尚未配置大脑" + 右上 `+` 按钮 |
| 列表 | 每张卡片显示名称 + 供应商/模型，右侧三个操作按钮：编辑（铅笔图标，点击预填表单）、测试（闪电图标，点击调用 API /models，绿色圆点/红色圆点标识结果）、删除（X 图标）|
| 表单 | 顶部"← 已有 N 个大脑"（可切换查看列表） |
| 表单 - 预设 | DeepSeek / 智谱GLM / 百炼 / Kimi 快捷按钮 |
| 字段 | 大脑名称、供应商、请求地址、API Key、官网、模型名 |
| 编辑模式 | 点击编辑按钮后表单项预填已有数据，标题变为"编辑大脑"，保存调用 update 接口 |

### 人物配置 (RoleModal)

| 状态 | 内容 |
|------|------|
| 空状态（无数据） | "尚未配置人物" + 右上 `+` 按钮 |
| 列表 | 每张卡片显示头像 + 名称 + 关联大脑名称，右侧两个操作按钮：编辑（铅笔图标，点击预填表单）、删除（X 图标） |
| 表单 | 头像选择按钮（8个情绪SVG，含动画）、名字、大脑选择、Soul、Rule |
| 头像选择器 | 3×3 涂鸦风情绪 SVG 网格（猫/幽灵/皇冠/机器人/亢奋/懒惰/冷酷/可爱），点击即选即关闭 |
| 编辑模式 | 点击编辑按钮后所有字段（包括头像）预填已有数据，标题变为"编辑人物" |

---

## 聊天模式 (ChatView)

- 全屏页面模式，不是弹窗，顶部栏与首页共享（≡ + 名称居中 + OpenRise）
- 侧边栏（flex push 布局，256px↔0 transition）：chat 模式下显示人物列表，点击切换对话
- 站立列（左，w-28）：门 + 站立人物列表（AvatarIcon 48px + 名字），侧边栏打开时隐藏
  - 点击门 → 人物 translateY 缩进门里/从门里下来，错峰延迟
- 居中 OpenRise 水印 + "开始和 {name} 对话"
- AI 回复支持 Markdown 渲染（react-markdown + remark-gfm），等宽字体+"#2C2C2C"
- 底部输入区：auto-grow textarea（1-7 行来回弹性）+ 手绘边框
- ESC 返回首页
- 输入框不解析命令，纯文本发送

---

## 组件树

```
HomePage
└── SvgFilters           — SVG <defs>: #tremble, #charcoal
    └── PageShell        — 页面骨架（mode 切换 home/chat，状态管理）
        ├── 顶部栏       — fixed top-0 h-12, flex items-center, px-10
        │   ├── ≡         — 侧边栏开关
        │   ├── 名称      — absolute 居中 + AvatarIcon + 名字
        │   └── OpenRise       — home: 静态文字 / chat: 返回按钮
        ├── 侧边栏       — flex shrink-0 width 过渡, pt-20
        │   └── 人物列表  — chat 模式, AvatarIcon + 名字 + brainName
        ├── Home Mode     — 条件渲染
        │   ├── 大 OpenRise 标题 (3层charcoal)
        │   └── CommandCenter
        │       ├── 命令输入框
        │       ├── BrainModal
        │       └── RoleModal
        └── Chat Mode     — 条件渲染
            └── ChatView
                ├── 站立列 (左, w-28)
                │   ├── 门 (SVG, toggle)
                │   └── 人物 (AvatarIcon 48px + 名字)
                ├── 中央区
                │   ├── OpenRise 水印 / 空状态
                │   └── 消息列表
                └── 输入区 (textarea + 手绘边框)
```

### 文件结构

| 文件 | 职责 |
|------|------|
| `src/app/page.tsx` | 根页，SvgFilters + PageShell |
| `src/app/layout.tsx` | 根布局，加载 Caveat + Courier Prime 字体 |
| `src/app/globals.css` | 主题色、纸纹噪点、shaky-line、wiggle 动画、scrollbar |
| `components/SvgFilters.tsx` | SVG 滤镜定义（`#tremble` + `#charcoal`） |
| `components/PageShell.tsx` | 页面骨架，mode 切换（home/chat），顶部栏+侧边栏 |
| `components/CommandCenter.tsx` | 命令输入框 + 命令路由 |
| `components/BrainModal.tsx` | 大脑配置弹窗（CRUD） |
| `components/RoleModal.tsx` | 人物配置弹窗（含头像选择器） |
| `components/ChatView.tsx` | 聊天界面（站立列 + 消息区 + 输入区） |
| `components/AvatarIcon.tsx` | 8 个涂鸦风情绪 SVG 头像 + CSS 动画 + AVATARS 常量 |

---

## 当前进度

- [x] 设计文档 v3（炭笔素描定稿）
- [x] 首页实现（PageShell + CommandCenter）
- [x] BrainModal 配置弹窗（数据持久化）
- [x] RoleModal 配置弹窗 + 头像选择器
- [x] ChatView 聊天界面
- [ ] 功能菜单面板（☰ 按钮展开）
- [ ] 聊天消息流式展示
- [x] 头像动画（眨眼/浮动/弹跳/摇摆/下垂/点头/天线发光）
- [ ] 圆桌会议 UI
