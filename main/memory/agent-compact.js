// Agent 三层记忆压缩（参照 learn-claude-code s06）
// Layer 1: micro_compact — 替换旧 tool_result 为占位符
// Layer 2: auto_compact — token 超阈值时 LLM 总结后压缩
// Layer 3: manual_compact — 用户主动触发（通过 /compact 命令）

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// ── Config ──
const MICRO_KEEP_RECENT = 5;     // micro_compact 保留的最近 tool_result 轮数
const TOKEN_THRESHOLD = 40000;   // auto_compact 触发阈值
const SUMMARY_MAX_TOKENS = 1024; // 压缩输出长度上限

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

// ── Layer 1: micro_compact ──

function microCompact(messages) {
  let toolResultCount = 0;

  // Walk backwards to find recent tool results
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'tool' && msg.content && msg.content.length > 100) {
      toolResultCount++;
      if (toolResultCount > MICRO_KEEP_RECENT) {
        // Find the corresponding tool call name from the assistant message
        const toolName = findToolCallName(messages, msg.tool_call_id);
        msg.content = `[Previous: used ${toolName || 'tool'}]`;
      }
    }
  }

  return messages;
}

function findToolCallName(messages, toolCallId) {
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id === toolCallId) return tc.function.name;
      }
    }
  }
  return null;
}

// ── Layer 2 & 3: auto_compact / manual_compact ──

async function autoCompact(messages, sessionId, roleName, brain) {
  if (!brain) return messages;

  // Save full transcript to disk
  const archiveDir = getArchiveDir();
  const timestamp = Date.now();
  const transcriptPath = path.join(archiveDir, `${roleName}-${sessionId}-${timestamp}.jsonl`);

  const transcriptLines = messages.map((m) => JSON.stringify(m));
  fs.writeFileSync(transcriptPath, transcriptLines.join('\n'), 'utf-8');

  // Ask LLM to summarize
  const summaryPrompt = `Summarize this agent conversation for continuity. Focus on:
1. What task was being performed
2. What was accomplished so far
3. Key decisions and findings
4. What remains to be done

Keep the summary concise (under ${SUMMARY_MAX_TOKENS} tokens) but preserve enough context to continue working.

Conversation:
${JSON.stringify(messages, null, 2).slice(0, 60000)}`;

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
          { role: 'system', content: 'You are a conversation summarizer. Produce a concise, information-dense summary.' },
          { role: 'user', content: summaryPrompt },
        ],
      }),
    });

    if (!response.ok) return messages;

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content;
    if (!summary) return messages;

    console.log(`[AgentCompact] Compressed session ${sessionId} → ${transcriptPath}`);

    return [
      { role: 'system', content: messages.find((m) => m.role === 'system')?.content || '' },
      { role: 'user', content: `[会话已压缩，以下为之前的摘要]\n\n${summary}\n\n请继续完成任务。` },
    ];
  } catch (err) {
    console.error('[AgentCompact] Compression failed:', err.message);
    return messages;
  }
}

// ── Check & compress ──

function shouldCompact(messages) {
  return estimateMessagesTokens(messages) > TOKEN_THRESHOLD;
}

module.exports = {
  microCompact,
  autoCompact,
  shouldCompact,
  estimateTokens,
  estimateMessagesTokens,
  MICRO_KEEP_RECENT,
  TOKEN_THRESHOLD,
};
