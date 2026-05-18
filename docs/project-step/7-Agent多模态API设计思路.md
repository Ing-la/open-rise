# Agent 多模态 API 设计思路

Agent 当前只有文本对话能力（LLM 思考 + 文件/Web 工具）。要让它能画图、看图，需要一个可扩展的多模态能力接入方案。

---

## 一、设计演进

### 1.1 最初思路：Role 绑定多模态大脑

```
Role
  ├── brainId ──────→ Brain (type="chat")    ← 思考大脑（必要）
  └── drawBrainId ──→ Brain (type="image")   ← 新增字段
```

**问题**：每加一个能力改一次 schema，角色与大脑耦合太重。

### 1.2 能力列表方案

```
Role
  ├── brainId ──────→ Brain (type="chat")
  └── capabilities ─→ [{type: "image", brainId: "..."}]
```

**问题**：仍需改 schema，且角色绑定大脑的"多对一"关系不自然。

### 1.3 最终方案（当前）

**核心思路变更**：多模态能力不绑定角色，而是由 Agent 全局配置。角色只负责提供大脑配置，Agent 负责编排工具。

```
角色层（不变）：一个角色一个大脑，保持简单
  Role ──→ Brain (chat / image / vision / 任意组合)

Agent 层（新增配置面板）：
  Agent 多模态配置 ──→ 选择"画家1号"提供 image 能力
                      ──→ 选择"小兔子"提供 vision 能力
                      ──→ ...
```

---

## 二、BrainModal：类型选择改为三按钮多选

### 2.1 现状

两个按钮挤在输入框右侧，单选的 toggle：

```
[deepseek-chat             ] [对话] [文生图]
```

### 2.2 改动

改为三个英文按钮，支持多选：

```
[deepseek-chat             ] [chat] [image] [vision]
```

| 状态 | 视觉 |
|------|------|
| 未选中 | 描边 + 半透明文字 |
| 选中 | 填充黑色 + 白色文字 |
| 多选 | 可同时选中多个（如 chat + vision） |

### 2.3 交互逻辑

- 点击切换选中/取消选中，不互斥
- 默认只选中 chat（兼容旧数据）
- **交由用户判断**：用户自行了解模型能力，选择对应标签
- 存储格式：type 字段改为逗号分隔字符串，如 `"chat,vision"`、`"image"`

### 2.4 为什么是用户自己选

LLM 模型的能力边界是动态的——同一个模型可能更新后支持 vision，也可能新出的模型是纯 image。没有可靠的自动检测方式。用户配置时自然知道自己填的是什么模型，直接把判断权交给用户。

---

## 三、Role：不变

一个角色只关联一个大脑配置，不做任何修改。

```
model Role {
  ...
  brainId   String    // 大脑配置（唯一关联）
  ...
}
```

角色列表页不需要改动，编辑页也不需要。

---

## 四、Agent 配置面板

### 4.1 入口

在 Agent 界面左侧侧边栏（session 列表下方）加一个按钮：

```
┌──────────────────┐
│  会话列表          │
│  ┌──────────────┐│
│  │ 重构工具函数   ││
│  │ 编写文档-A    ││
│  │ 整理项目结构   ││
│  └──────────────┘│
│                   │
│  [+ 新会话]       │
│                   │
│  ─────────────    │
│  [🔧 小帮手]      │  ← 新增：打开多模态配置
└──────────────────┘
```

### 4.2 配置弹窗

点击「小帮手」弹出配置窗口：

```
┌──────────────────────────────────────┐
│  🔧 小帮手                          │
│                                      │
│  为 Agent 选择多模态工具和能力角色     │
│                                      │
│  ── 能力列表 ──                      │
│                                      │
│  image   [不启用          ▼]         │
│          ────────────────            │
│          不启用                      │
│          画家1号 · Flux             │
│          画家2号 · SD               │
│                                      │
│  vision  [不启用          ▼]         │
│          ────────────────            │
│          不启用                      │
│          小兔子 · GPT-4o            │
│                                      │
│  [ 保存 ]                            │
└──────────────────────────────────────┘
```

交互说明：
- **左侧**：能力类型（image / vision / 未来更多）
- **右侧**：下拉选择提供该能力的角色，选项为「不启用」+ 所有「大脑标签包含该类型」的角色
- **保存后全局生效**：所有 Agent session 共享此配置，不随 session 切换改变

### 4.3 配置存储

配置以 JSON 格式持久化到用户数据目录：

```json
{
  "image": { "roleId": "画家1号的uuid", "brainId": "对应brain的uuid" },
  "vision": { "roleId": "小兔子的uuid", "brainId": "对应brain的uuid" }
}
```

存 roleId + brainId 的原因：
- roleId：在 UI 显示角色名、头像
- brainId：工具执行时加载 Brain 的 apiKey、modelName、baseUrl

存储位置：Electron 的 `app.getPath('userData')` 目录（跨平台兼容）或 `main/` 下的 JSON 文件。

### 4.4 能力类型与大脑的匹配逻辑

下拉列表只显示「大脑标签包含该能力类型」的角色：

| 能力类型 | 匹配条件 | 示例 |
|---------|---------|------|
| `image` | `brain.type` 包含 `"image"` | 画家1号（brain type="image"） |
| `vision` | `brain.type` 包含 `"vision"` | 小兔子（brain type="chat,vision"） |

一个角色的大脑是多模态（如 type="chat,vision"）则同时出现在 chat 思考和 vision 能力中，用户可自由选择。

### 4.5 在 Agent 中生效

Agent loop 加载时读取全局配置：

```
Agent 启动 →
  读取多模态配置
  → 如果有 image 配置 → 追加 generate_image 工具定义
  → 如果有 vision 配置 → 追加 read_image 工具定义
  → 将完整工具列表传给 LLM
```

---

## 五、工具实现

### 5.1 generate_image（画图）

```
User: "帮我画一只猫"
  → LLM 调用 generate_image({ prompt: "a cute cat" })
  → 工具读取全局配置中找到角色的大脑信息
  → 根据 brain.modelName 匹配供应商
  → 调用对应的文生图 API
  → 保存图片到本地，返回本地 URL
  → 前端 <img> 渲染
```

### 5.2 read_image（视觉识别，未来）

```
User: "这张图里有什么？"
  → LLM 调用 read_image({ path: "...", question: "..." })
  → 工具读取配置中的多模态 LLM 大脑
  → 调用 chat/completions 接口，传图片 base64
  → 返回识别结果
```

### 5.3 工具定义

```javascript
// 动态构建，根据全局配置决定是否添加
{
  name: 'generate_image',
  description: '根据提示词生成图片',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '图片内容描述' },
      size: { type: 'string', enum: ['1024x1024', ...] },
    },
    required: ['prompt'],
  },
}
```

---

## 六、未来扩展

| 能力类型 | 工具 | 需要什么 | 实现复杂度 |
|---------|------|---------|-----------|
| `image` | `generate_image` | 文生图 API | 低 |
| `vision` | `read_image` | 多模态 LLM | 中 |
| `audio` | `generate_audio` | TTS API | 中 |
| `stt` | `transcribe_audio` | STT API | 中 |

新增能力只需：
1. BrainModal 加一个按钮标签
2. 配置面板加一行
3. 实现对应的工具 handler
