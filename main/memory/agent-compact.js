// Agent 记忆压缩
// 触发条件：messages token 估算超过阈值
// 执行流程：
//   1. 将 DB 中该 session 的全部消息追加到 session 级 .jsonl 归档
//   2. 调用 LLM 生成压缩摘要
//   3. 从 DB 删除已归档的消息
//   4. 更新 AgentSession.summary + compactedAt
//   5. 返回新的 messages 数组（system + summary + 增量消息）
//
// 归档路径：prisma/agent-archives/{roleName}-{sessionId}.jsonl
// 使用 append 模式，一个 session 一个文件，多次压缩内容逐行追加

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const prisma = require('../db');

// ── Config ──
const TOKEN_THRESHOLD = 40000;   // auto_compact 触发阈值
const SUMMARY_MAX_TOKENS = 1024;

// Rough estimate: ~4 chars per token
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function estimateMessagesTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content);
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        total += estimateTokens(tc.function.name);
        total += estimateTokens(tc.function.arguments);
      }
    }
  }
  return total;
}

// ── Archive path ──

function getArchiveDir() {
  const dir = !app.isPackaged
    ? path.join(__dirname, '..', '..', 'prisma', 'agent-archives')
    : path.join(app.getPath('userData'), 'agent-archives');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getArchivePath(sessionId, roleName) {
  const safeName = (roleName || 'unknown').replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
  return path.join(getArchiveDir(), `${safeName}-${sessionId}.jsonl`);
}

// ── Core: compactSession ──
// 1. Archive all DB messages to .jsonl (append-mode)
// 2. Ask LLM for summary
// 3. Delete archived messages from DB
// 4. Update AgentSession.summary + compactedAt
// 5. Return summary string (or null if nothing to compact)

async function compactSession(sessionId) {
  // Load all archived messages from DB
  const allMessages = await prisma.agentMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });

  if (allMessages.length === 0) return null;

  // Load session + role + brain
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) return null;

  const role = await prisma.role.findUnique({
    where: { id: session.roleId },
    include: { brain: true },
  });
  if (!role || !role.brain) return null;

  // 1. Archive to .jsonl (append mode)
  const archivePath = getArchivePath(sessionId, role.name);
  const lines = allMessages.map((m) => JSON.stringify(m));
  fs.appendFileSync(archivePath, lines.join('\n') + '\n', 'utf-8');
  console.log(`[AgentCompact] Archived ${allMessages.length} messages → ${archivePath}`);

  // 2. Build summary from LLM
  // Format messages for summarization: reconstruct into human-readable form
  const formattedLines = [];
  for (const m of allMessages) {
    if (m.role === 'user') {
      formattedLines.push(`[User]: ${m.content}`);
    } else if (m.role === 'assistant' && m.type === 'tool_call') {
      try {
        const parsed = JSON.parse(m.content);
        formattedLines.push(`[Assistant Thought]: ${parsed.thought || '(thinking)'}`);
        if (parsed.tool_calls) {
          for (const tc of parsed.tool_calls) {
            formattedLines.push(`[Tool Call]: ${tc.name}(${tc.args})`);
          }
        }
      } catch {
        formattedLines.push(`[Assistant]: ${m.content}`);
      }
    } else if (m.role === 'assistant' && m.type === 'text') {
      formattedLines.push(`[Assistant]: ${m.content}`);
    } else if (m.role === 'tool_result') {
      const preview = m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content;
      formattedLines.push(`[Tool Result (${m.toolName || 'unknown'})]: ${preview}`);
    }
  }

  const summary = await askSummary(role, session.summary || undefined, formattedLines.join('\n'));
  if (!summary) {
    console.log(`[AgentCompact] Summarization failed, skipping compaction for session ${sessionId}`);
    return null;
  }

  // 3. Delete archived messages from DB (only after successful summarization)
  const ids = allMessages.map((m) => m.id);
  await prisma.agentMessage.deleteMany({
    where: { id: { in: ids } },
  });

  // 4. Update session
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: {
      summary,
      compactedAt: new Date(),
    },
  });

  console.log(`[AgentCompact] Compressed session ${sessionId}, ${allMessages.length} messages archived to .jsonl, summary saved`);
  return summary;
}

// ── Summarize ──

async function askSummary(role, previousSummary, formattedConversation) {
  const { brain, soul, rule } = role;

  try {
    const response = await fetch(`${brain.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brain.apiKey}`,
      },
      body: JSON.stringify({
        model: brain.modelName,
        max_tokens: SUMMARY_MAX_TOKENS,
        messages: [
          {
            role: 'system',
            content: 'You are a conversation summarizer. Produce a concise, information-dense summary of what happened in this agent session. Focus on: task goal, what was accomplished, key decisions/findings, what remains to be done. Output ONLY the summary, no preamble.',
          },
          {
            role: 'user',
            content: [
              previousSummary ? `Previous summary: ${previousSummary}` : null,
              `Role personality: ${soul || '(none)'}`,
              `Role rules: ${rule || '(none)'}`,
              '',
              'Conversation to summarize:',
              formattedConversation,
            ].filter(Boolean).join('\n'),
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

// ── Check threshold ──

function shouldCompact(messages) {
  return estimateMessagesTokens(messages) > TOKEN_THRESHOLD;
}

module.exports = {
  compactSession,
  shouldCompact,
  getArchiveDir,
  estimateTokens,
  estimateMessagesTokens,
  TOKEN_THRESHOLD,
};
