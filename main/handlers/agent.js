const prisma = require('../db');
const { executeTool, TOOL_DEFINITIONS } = require('../tools');
const { microCompact, autoCompact, shouldCompact } = require('../memory/agent-compact');

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

    // Memory compaction
    microCompact(messages);
    if (shouldCompact(messages)) {
      event.sender.send('agent:progress', { sessionId, status: 'compacting', message: '正在压缩记忆...' });
      messages = await autoCompact(messages, sessionId, role.name, brain);
      event.sender.send('agent:progress', { sessionId, status: 'thinking', message: '继续工作...' });
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
        tools: TOOL_DEFINITIONS,
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
      // Save assistant message
      await prisma.agentMessage.create({
        data: { sessionId, role: 'assistant', content: thoughtContent, type: 'text' },
      });
      event.sender.send('agent:done', { sessionId, result: thoughtContent, trace });
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
        result = await executeTool(toolName, toolArgs);
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
  await prisma.agentMessage.create({
    data: { sessionId, role: 'assistant', content: '(已达到最大迭代次数，任务可能未完成)', type: 'text' },
  });
  event.sender.send('agent:done', {
    sessionId,
    result: '(已达到最大迭代次数，任务可能未完成)',
    trace,
  });
}

// ── Registration ──

module.exports = function (ipcMain) {
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

  // Load displayable messages for a session (user + final assistant text)
  ipcMain.handle('agent:session-messages', async (_event, sessionId) => {
    const messages = await prisma.agentMessage.findMany({
      where: { sessionId, role: { in: ['user', 'assistant'] }, type: 'text' },
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
};
