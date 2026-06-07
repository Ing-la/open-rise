const prisma = require('../db');
const fs = require('fs');
const path = require('path');
const { executeTool, TOOL_DEFINITIONS } = require('../tools');
const { compactSession, shouldCompact } = require('../memory/agent-compact');

const CAPABILITIES_PATH = path.join(__dirname, '..', 'agent-capabilities.json');

// Track active sessions for stop mechanism
const stoppedSessions = new Set();

// ── Session management ──

async function handleSessionCreate(params) {
  const { roleId, title } = params;
  const session = await prisma.agentSession.create({
    data: {
      roleId,
      title: title || '新会话',
      status: 'active',
    },
  });
  return { id: session.id };
}

async function handleSessionList(roleId) {
  const sessions = await prisma.agentSession.findMany({
    where: { roleId },
    orderBy: { updatedAt: 'desc' },
  });
  return sessions;
}

async function handleSessionDelete(sessionId) {
  await prisma.agentMessage.deleteMany({ where: { sessionId } });
  await prisma.agentSession.delete({ where: { id: sessionId } });
  return { success: true };
}

async function handleSessionRename(sessionId, title) {
  await prisma.agentSession.update({ where: { id: sessionId }, data: { title } });
  return { success: true };
}

async function handleSessionClear(sessionId) {
  await prisma.agentMessage.deleteMany({ where: { sessionId } });
  return { success: true };
}

// ── System prompt builder ──

function buildSystemPrompt(role) {
  const parts = [];

  if (role.soul) parts.push(`## 人格设定\n${role.soul}`);
  if (role.rule) parts.push(`## 行为规则\n${role.rule}`);

  parts.push(`## 工具使用指南

You are an AI agent that completes tasks by thinking and using tools. Follow this ReAct format:

1. **思考（Thought）**: Analyze the current situation and decide the next action
2. **工具调用（Tool Use）**: Call a tool when you need to read/write/edit files
3. **观察（Observation）**: Read the tool result and decide next steps
4. **最终回答（Final Answer）**: When the task is complete, provide a clear summary

You can use multiple tools in parallel (one response can contain multiple tool calls).
Always verify the results of your actions.
When the task is done, summarize what you accomplished.`);

  return parts.join('\n\n');
}

// ── Agent Loop ──

async function runAgentLoop(event, sessionId, roleId, content) {
  let step = 0;
  const trace = [];
  let lastImageResult = null;
  const MAX_LOOP_ITERATIONS = 30;

  // Load session, role, brain
  const session = await prisma.agentSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error('Session not found');

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { brain: true },
  });
  if (!role || !role.brain) throw new Error('Role or brain not found');

  const brain = role.brain;

  // Build messages array
  const systemPrompt = buildSystemPrompt(role);

  // Load previous messages in this session
  const history = await prisma.agentMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });

  const messages = [];
  messages.push({ role: 'system', content: systemPrompt });

  // If session has been compressed before, prepend summary as context
  if (session.summary && history.length === 0) {
    messages.push({
      role: 'user',
      content: `[以下为之前会话的压缩摘要]\n\n${session.summary}\n\n请继续完成任务。`,
    });
  }

  for (const msg of history) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      if (msg.type === 'tool_call') {
        // Saved as JSON: { thought, reasoning_content, tool_calls: [{ id, name, args }] }
        const parsed = JSON.parse(msg.content);
        const reconstructed = {
          role: 'assistant',
          content: parsed.thought || null,
          ...(parsed.reasoning_content ? { reasoning_content: parsed.reasoning_content } : {}),
          tool_calls: parsed.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.args },
          })),
        };
        messages.push(reconstructed);
      } else {
        messages.push({ role: 'assistant', content: msg.content });
      }
    } else if (msg.role === 'tool_result') {
      messages.push({
        role: 'tool',
        tool_call_id: msg.toolId,
        content: msg.content,
      });
    }
  }

  // Remove orphaned tool_calls — assistant(tool_calls) without a following tool response.
  // These happen when a previous run was interrupted right after saving the tool_call,
  // leaving no matching tool_result in the database.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant' && m.tool_calls) {
      const next = messages[i + 1];
      if (!next || next.role !== 'tool') {
        messages.splice(i, 1);
      }
    }
  }

  // Add current user message
  messages.push({ role: 'user', content });

  // Save user message to DB
  await prisma.agentMessage.create({
    data: { sessionId, role: 'user', content, type: 'text' },
  });

  // Auto-title: use first 30 chars of user message
  if (history.length === 0) {
    const title = content.length > 30 ? content.slice(0, 30) + '...' : content;
    await prisma.agentSession.update({
      where: { id: sessionId },
      data: { title },
    });
  }

  event.sender.send('agent:progress', { sessionId, status: 'thinking', message: '正在思考...' });

  // ── Loop ──
  for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
    // Check stop signal
    if (stoppedSessions.has(sessionId)) {
      stoppedSessions.delete(sessionId);
      event.sender.send('agent:done', { sessionId, result: '(已中止)', trace });
      return;
    }

    // Memory compaction: archive to .jsonl + summarize + clean DB
    if (shouldCompact(messages)) {
      event.sender.send('agent:progress', { sessionId, status: 'compacting', message: '正在压缩记忆...' });
      const summary = await compactSession(sessionId);
      if (summary) {
        // Replace messages with system prompt + summary context for continued work
        messages.length = 0;
        messages.push({ role: 'system', content: buildSystemPrompt(role) });
        messages.push({
          role: 'user',
          content: `[对话已压缩，以下为摘要]\n\n${summary}\n\n请继续完成任务。`,
        });
      }
      event.sender.send('agent:progress', { sessionId, status: 'thinking', message: '继续工作...' });
    }

    // Build tool list (base + capabilities for this role)
    const tools = [...TOOL_DEFINITIONS];
    const caps = loadCapabilities();
    const roleCaps = caps[roleId] || {};
    if (roleCaps.image?.brainId) {
      tools.push({
        type: 'function',
        function: {
          name: 'generate_image',
          description: 'Generate an image based on a text prompt. Use this when the user asks you to draw, paint, create, or generate an image. The tool returns a markdown image link. You MUST include this link directly in your final response to show the image to the user.',
          parameters: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'Description of the image to generate (use English for best results)' },
              size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'], description: 'Image size, default 1024x1024' },
            },
            required: ['prompt'],
          },
        },
      });
    }
    if (roleCaps.vision?.brainId) {
      tools.push({
        type: 'function',
        function: {
          name: 'analyze_image',
          description: 'Analyze an image using AI vision. Use this when you need to examine, describe, or answer questions about an image file. Supports local file paths and app-img:// URLs.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to the image file (local path or app-img:// URL)' },
              prompt: { type: 'string', description: 'Question or instruction about the image (e.g. "What is shown in this image?", "Read the text in this image")' },
            },
            required: ['path', 'prompt'],
          },
        },
      });
    }

    // Call LLM
    const response = await fetch(`${brain.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brain.apiKey}`,
      },
      body: JSON.stringify({
        model: brain.modelName,
        messages,
        tools,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('Empty response from LLM');

    const msg = choice.message;

    // Extract thought text
    const thoughtContent = msg.content || '';
    if (thoughtContent) {
      step++;
      trace.push({ step, type: 'thought', content: thoughtContent });
      event.sender.send('agent:trace', { sessionId, step, type: 'thought', content: thoughtContent });
    }

    // Check for tool calls
    const toolCalls = msg.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      // No tool calls → done
      // Auto-append image markdown if generate_image was called but LLM didn't include it
      let finalResult = thoughtContent;
      if (lastImageResult && lastImageResult.startsWith('![') && !finalResult.includes('app-img://')) {
        finalResult += '\n\n' + lastImageResult;
      }
      // Save assistant message
      await prisma.agentMessage.create({
        data: { sessionId, role: 'assistant', content: finalResult, type: 'text' },
      });
      stoppedSessions.delete(sessionId);
      event.sender.send('agent:done', { sessionId, result: finalResult, trace });
      return;
    }

    // Append assistant message with tool calls to messages array
    const assistantMsg = {
      role: 'assistant',
      content: thoughtContent || null,
      ...(msg.reasoning_content ? { reasoning_content: msg.reasoning_content } : {}),
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    };
    messages.push(assistantMsg);

    // Save assistant message (all tool_calls + reasoning_content in one message)
    await prisma.agentMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: JSON.stringify({
          thought: thoughtContent,
          reasoning_content: msg.reasoning_content || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            args: tc.function.arguments,
          })),
        }),
        type: 'tool_call',
      },
    });

    // Execute each tool call
    for (const tc of toolCalls) {
      if (stoppedSessions.has(sessionId)) break;

      const toolName = tc.function.name;
      let toolArgs;
      try {
        toolArgs = JSON.parse(tc.function.arguments);
      } catch {
        toolArgs = {};
      }

      step++;
      const traceEntry = { step, type: 'tool_use', name: toolName, input: toolArgs };

      event.sender.send('agent:progress', {
        sessionId,
        status: 'tool',
        message: `使用工具: ${toolName}`,
      });

      let result;
      try {
        result = await executeTool(toolName, toolArgs, { roleId, imageBrainId: roleCaps.image?.brainId, visionBrainId: roleCaps.vision?.brainId });
        if (toolName === 'generate_image') lastImageResult = result;
        traceEntry.output = result.length > 200 ? result.slice(0, 200) + '...' : result;
      } catch (err) {
        result = `Error: ${err.message}`;
        traceEntry.output = result;
      }

      trace.push(traceEntry);
      event.sender.send('agent:trace', {
        sessionId,
        step,
        type: 'tool_result',
        name: toolName,
        input: toolArgs,
        output: traceEntry.output,
      });

      // Save tool result to DB
      await prisma.agentMessage.create({
        data: {
          sessionId,
          role: 'tool_result',
          content: result,
          type: 'tool_result',
          toolName,
          toolId: tc.id,
        },
      });

      // Append to messages for next LLM call
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  // Max iterations reached without finishing
  stoppedSessions.delete(sessionId);
  await prisma.agentMessage.create({
    data: { sessionId, role: 'assistant', content: '(已达到最大迭代次数，任务可能未完成)', type: 'text' },
  });
  event.sender.send('agent:done', {
    sessionId,
    result: '(已达到最大迭代次数，任务可能未完成)',
    trace,
  });
}

// ── Capabilities ──

function migrateCapabilities() {
  try {
    const raw = JSON.parse(fs.readFileSync(CAPABILITIES_PATH, 'utf-8'));
    if (raw.image || raw.vision) {
      const migrated = {};
      for (const capType of ['image', 'vision']) {
        const entry = raw[capType];
        if (entry && entry.roleId && entry.brainId) {
          const roleId = entry.roleId;
          if (!migrated[roleId]) migrated[roleId] = {};
          migrated[roleId][capType] = { brainId: entry.brainId };
        }
      }
      if (Object.keys(migrated).length > 0) {
        fs.writeFileSync(CAPABILITIES_PATH, JSON.stringify(migrated, null, 2));
      }
    }
  } catch {}
}

function loadCapabilities() {
  try {
    return JSON.parse(fs.readFileSync(CAPABILITIES_PATH, 'utf-8')) || {};
  } catch {
    return {};
  }
}

// ── Registration ──

module.exports = function (ipcMain) {
  // Run one-time migration of legacy capability format on startup
  migrateCapabilities();
  // Session management
  ipcMain.handle('agent:session-create', async (_event, params) => {
    return handleSessionCreate(params);
  });

  ipcMain.handle('agent:session-list', async (_event, roleId) => {
    return handleSessionList(roleId);
  });

  ipcMain.handle('agent:session-delete', async (_event, sessionId) => {
    return handleSessionDelete(sessionId);
  });

  ipcMain.handle('agent:session-rename', async (_event, params) => {
    return handleSessionRename(params.sessionId, params.title);
  });

  ipcMain.handle('agent:session-clear', async (_event, sessionId) => {
    return handleSessionClear(sessionId);
  });

  // Load displayable messages for a session (user + assistant text + tool_call for trace display)
  ipcMain.handle('agent:session-messages', async (_event, sessionId) => {
    const messages = await prisma.agentMessage.findMany({
      where: { sessionId, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'asc' },
    });
    return messages;
  });

  // Agent loop
  ipcMain.on('agent:send', async (event, params) => {
    const { sessionId, roleId, content } = params;

    try {
      await runAgentLoop(event, sessionId, roleId, content);
    } catch (err) {
      console.error('Agent error:', err);
      stoppedSessions.delete(sessionId);
      event.sender.send('agent:error', { sessionId, error: String(err) });
    }
  });

  // Stop agent
  ipcMain.on('agent:stop', (_event, sessionId) => {
    if (sessionId) {
      stoppedSessions.add(sessionId);
    }
  });

  // Add/remove trusted paths
  ipcMain.handle('agent:trust-add', async (_event, filePath) => {
    const { saveTrustedPaths, loadTrustedPaths } = require('../tools/safe-path');
    const paths = loadTrustedPaths();
    const resolved = require('path').resolve(filePath);
    if (!paths.includes(resolved)) {
      paths.push(resolved);
      saveTrustedPaths(paths);
    }
    return { success: true, paths };
  });

  ipcMain.handle('agent:trust-list', async () => {
    const { loadTrustedPaths } = require('../tools/safe-path');
    return { paths: loadTrustedPaths() };
  });

  // Multi-modal capabilities
  ipcMain.handle('agent:capabilities-load', async () => {
    return loadCapabilities();
  });

  // Session compact info (summary + archive path)
  ipcMain.handle('agent:session-compact-info', async (_event, sessionId) => {
    const session = await prisma.agentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || !session.summary) return null;

    const role = await prisma.role.findUnique({ where: { id: session.roleId } });
    const safeName = (role?.name || 'unknown').replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
    const { getArchiveDir } = require('../memory/agent-compact');
    const archivePath = require('path').join(getArchiveDir(), `${safeName}-${sessionId}.jsonl`);

    return {
      summary: session.summary,
      compactedAt: session.compactedAt,
      archivePath,
    };
  });

  ipcMain.handle('agent:capabilities-save', async (_event, config) => {
    fs.writeFileSync(CAPABILITIES_PATH, JSON.stringify(config, null, 2));
    return { success: true };
  });

  // Dynamic tool list (base tools + capabilities, user-facing display)
  const TOOL_DISPLAY = {
    read_file:      { name: 'read_file',      description: '读取文件',           params: ['path（必需）, limit（可选）'] },
    write_file:     { name: 'write_file',     description: '写入文件（覆盖）',    params: ['path（必需）, content（必需）'] },
    edit_file:      { name: 'edit_file',      description: '替换文本',           params: ['path（必需）, old_text（必需）, new_text（必需）'] },
    web_fetch:      { name: 'web_fetch',      description: '获取网页正文',        params: ['url（必需）'] },
    web_search:     { name: 'web_search',     description: '搜索互联网',          params: ['query（必需）, count（可选）'] },
    generate_image: { name: 'generate_image', description: '文生图',             params: ['prompt（必需）, size（可选）'] },
    analyze_image:  { name: 'analyze_image',  description: '图像识别分析',       params: ['path（必需）, prompt（必需）'] },
  };

  ipcMain.handle('agent:tool-list', async (_event, roleId) => {
    const caps = loadCapabilities();
    const list = TOOL_DEFINITIONS.map((t) => TOOL_DISPLAY[t.function.name]).filter(Boolean);
    const roleCaps = roleId ? (caps[roleId] || {}) : {};
    if (roleCaps.image?.brainId) {
      list.push(TOOL_DISPLAY.generate_image);
    }
    if (roleCaps.vision?.brainId) {
      list.push(TOOL_DISPLAY.analyze_image);
    }
    return list;
  });
};
