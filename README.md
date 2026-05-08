# OpenRise

**A local-first AI agent orchestration lab.** Command-driven, privacy-first, built for the curious.

Inspired by CLI tools like `redis-cli` and the "talk to your docs" category, OpenRise is a sandbox where you bring your own API keys, create characters with soul, and have multi-turn conversations — all data stays on your machine.

---

## Features

- **Command-driven UI** — Type `/brain`, `/role`, `/chat` to control everything. No clicking through menus.
- **BYO model** — Connect any OpenAI-compatible API (DeepSeek, GLM, Kimi, Ollama, etc.). You own the keys, you own the data.
- **Characters with soul** — Each Role has a `soul` (personality) and `rule` (behavioral constraints). Full Markdown rendering for rich replies.
- **Persistent memory** — Long conversations are automatically compressed via LLM summarization. Old history is archived as Markdown files. No message lost.
- **Streaming responses** — SSE streaming via Electron IPC. See tokens arrive as they're generated.
- **Sketchbook aesthetic** — Hand-drawn SVG UI, charcoal-on-paper texture. Every pixel is deliberate.
- **100% local** — SQLite database, no cloud sync, no telemetry, no accounts.

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Initialize the database
npx prisma migrate dev --name init

# 3. Start developing (Next.js + Electron concurrently)
npm run dev
```

### Requirements

- Node.js 18+
- An API key for any OpenAI-compatible chat completion service

### First-time Setup

1. Run `npm run dev` — the app window opens
2. Type `/brain` to add your first API configuration (provider, endpoint, model, key)
3. Type `/role` to create a character and bind it to a brain
4. Type `/chat` and click a character to start talking

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Desktop shell | Electron |
| Frontend | Next.js (App Router, static export) |
| Styling | Tailwind CSS v4 |
| Backend | Node.js (Electron main process) |
| Database | SQLite + Prisma 5 |
| AI protocol | OpenAI-compatible Chat Completions API |

---

## Data Model

```
Brain ──1:N──> Role ──1:N──> Message
```

- **Brain** — API configuration (endpoint, model, API key)
- **Role** — A character with identity (`soul`, `rule`), avatar, and long-term memory (`summary`)
- **Message** — Raw conversation history (user & assistant turns)

---

## Commands

| Command | Action |
|---------|--------|
| `/brain` | Manage API provider configs (add/edit/test/delete) |
| `/role` | Create and manage characters with personality, rules, and avatars |
| `/chat` | Enter chat mode — select a character and start talking |

---

## Project Structure

```
openrise/
├── src/app/           ← Next.js frontend (pages, components)
├── main/
│   ├── main.js        ← Electron main process (window, IPC handlers)
│   ├── preload.js     ← IPC bridge (contextBridge)
│   └── db.js          ← Prisma client
├── prisma/
│   ├── schema.prisma  ← Data model
│   ├── migrations/    ← Migration history
│   └── archives/      ← Compressed conversation snapshots (Markdown)
├── shared/
│   └── ipc-contracts.js  ← Frontend/backend IPC contract definitions
└── docs/
    └── project/       ← Architecture, design, and strategy docs
```

---

## Design

OpenRise follows a **CLI-first contrast aesthetic**: the most advanced command-driven interaction, rendered on the roughest sketch paper.

- Background: `#F2F2EE` (cold sketch paper white)
- Ink: `#2C2C2C` (charcoal gray)
- SVG filters for hand-drawn tremble and charcoal grain texture
- Color used sparingly — only for avatar accents

---

## Development Notes

- `main/` uses CommonJS (Electron main process). Not mixed with frontend TypeScript.
- Changes in `main/` require restarting `npm run dev`.
- Frontend changes in `src/` support hot reload.
- Database path auto-switches: `prisma/dev.db` (dev) vs `userData/openrise.db` (production).
- No Next.js API routes — `output: 'export'` generates static files. All backend logic lives in Electron IPC handlers.

---

## License

MIT
