const prisma = require('../db');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { isImageModel, rawHttps } = require('./image');

// ── Compression config ──
const COMPRESS_CHAR_THRESHOLD = 20000;
const SUMMARY_MAX_TOKENS = 2048;
const SHORT_TERM_KEEP = 10;

function getArchiveDir() {
  const dir = !app.isPackaged
    ? path.join(__dirname, '..', '..', 'prisma', 'archives')
    : path.join(app.getPath('userData'), 'archives');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function formatArchiveMarkdown(role, messages) {
  const lines = [
    '# Conversation Archive', '',
    `## Role: ${role.name}`,
    `## Date: ${new Date().toISOString()}`,
    `## Summary: ${role.summary || '(none)'}`, '',
    '---', '',
  ];
  messages.forEach((m, i) => {
    lines.push(`### ${i + 1} [${m.sender}]`, '', m.content, '', '---', '');
  });
  return lines.join('\n');
}

async function compressMessages(role, messages) {
  const { brain, soul, rule, summary } = role;
  if (!brain) return summary || '';

  const messagesText = messages.map((m) =>
    `[${m.sender}]: ${m.content}`
  ).join('\n\n');

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
            content: 'You are a conversation summarizer. Produce a concise summary preserving key facts, decisions, preferences, and user context. Output ONLY the summary, no preamble.',
          },
          {
            role: 'user',
            content: `Previous summary: ${summary || '(none)'}\n\nCharacter personality: ${soul}\nCharacter rules: ${rule}\n\nConversation to summarize:\n${messagesText}\n\nConcise summary:`,
          },
        ],
      }),
    });

    if (!response.ok) return summary || '';
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    return (content ?? summary) || '';
  } catch {
    return summary || '';
  }
}

async function checkAndCompress(roleId) {
  const count = await prisma.message.count({ where: { roleId } });
  if (count <= SHORT_TERM_KEEP) return;

  const allMessages = await prisma.message.findMany({
    where: { roleId },
    orderBy: { createdAt: 'asc' },
  });

  const toArchive = allMessages.slice(0, -SHORT_TERM_KEEP);
  if (toArchive.length === 0) return;

  const totalChars = toArchive.reduce((sum, m) => sum + m.content.length, 0);
  if (totalChars <= COMPRESS_CHAR_THRESHOLD) return;

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { brain: true },
  });
  if (!role) return;

  const newSummary = await compressMessages(role, toArchive);

  const archiveDir = getArchiveDir();
  const timestamp = Date.now();
  const safeName = role.name.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
  const archivePath = path.join(archiveDir, `${safeName}-${timestamp}.md`);
  const markdown = formatArchiveMarkdown(role, toArchive);
  fs.writeFileSync(archivePath, markdown, 'utf-8');

  await prisma.role.update({
    where: { id: roleId },
    data: { summary: newSummary },
  });

  const archiveIds = toArchive.map((m) => m.id);
  await prisma.message.deleteMany({
    where: { id: { in: archiveIds } },
  });

  console.log(`Compressed ${toArchive.length} messages for role "${role.name}" → ${archivePath}`);
}

// ── Image generation helpers ──

async function generateImage(event, brain, roleId, content) {
  const isDashScope = brain.baseUrl.includes('dashscope');
  let raw;

  if (isDashScope) {
    const bodyRaw = JSON.stringify({
      model: brain.modelName,
      input: {
        messages: [{ role: 'user', content: [{ text: content }] }],
      },
      parameters: { size: '1024*1024', n: 1 },
    });
    const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
    raw = await rawHttps(url, bodyRaw, brain.apiKey);
  } else {
    const bodyRaw = JSON.stringify({
      model: brain.modelName,
      prompt: content,
      size: '1024x1024',
    });
    raw = await rawHttps(`${brain.baseUrl}/images/generations`, bodyRaw, brain.apiKey);
  }

  if (!(raw.statusCode >= 200 && raw.statusCode < 300)) {
    throw new Error(`API error ${raw.statusCode}: ${raw.body}`);
  }

  const data = JSON.parse(raw.body);

  if (isDashScope && data.status_code && data.status_code !== 200) {
    throw new Error(`DashScope error: ${data.code || data.status_code} ${data.message || ''}`);
  }

  let imageUrl, imageB64;

  if (isDashScope) {
    const content = data.output?.choices?.[0]?.message?.content;
    imageUrl = Array.isArray(content) ? content[0]?.image : null;
  } else {
    imageUrl = data.data?.[0]?.url;
    imageB64 = data.data?.[0]?.b64_json;
  }

  if (!imageUrl && !imageB64) throw new Error('No image data in response');

  const imageDir = !app.isPackaged
    ? path.join(__dirname, '..', '..', 'prisma', 'images', roleId)
    : path.join(app.getPath('userData'), 'images', roleId);
  fs.mkdirSync(imageDir, { recursive: true });

  const timestamp = Date.now();
  const imagePath = path.join(imageDir, `${timestamp}.png`);

  if (imageUrl) {
    const imgResponse = await fetch(imageUrl);
    const buffer = Buffer.from(await imgResponse.arrayBuffer());
    fs.writeFileSync(imagePath, buffer);
  } else if (imageB64) {
    const buffer = Buffer.from(imageB64, 'base64');
    fs.writeFileSync(imagePath, buffer);
  }

  return `app-img:///${imagePath.replace(/\\/g, '/')}`;
}

// ── Text chat streaming ──

async function streamChatResponse(event, brain, role, messages, roleId) {
  const response = await fetch(`${brain.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${brain.apiKey}`,
    },
    body: JSON.stringify({
      model: brain.modelName,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    event.sender.send('chat:error', { error: `API error ${response.status}: ${errorText}` });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullReply = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter((l) => l.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullReply += delta;
          event.sender.send('chat:chunk', { content: delta });
        }
      } catch { /* skip malformed SSE */ }
    }
  }

  await prisma.message.create({
    data: { content: fullReply, sender: 'assistant', roleId },
  });

  checkAndCompress(roleId).catch((err) => console.error('Compression failed:', err));

  event.sender.send('chat:done', { roleId });
}

// ── Registration ──

module.exports = function (ipcMain) {
  ipcMain.handle('chat:list', async (_event, roleId) => {
    const messages = await prisma.message.findMany({
      where: { roleId },
      orderBy: { createdAt: 'asc' },
    });
    return messages;
  });

  ipcMain.on('chat:send-stream', async (event, params) => {
    const { roleId, content } = params;

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: { brain: true },
    });
    if (!role) {
      event.sender.send('chat:error', { error: 'Role not found' });
      return;
    }

    const { brain } = role;

    // Save user message
    await prisma.message.create({
      data: { content, sender: 'user', roleId },
    });

    // Image model branch
    const isImage = brain.type === 'image' || isImageModel(brain.modelName);
    if (isImage) {
      try {
        const appImgUrl = await generateImage(event, brain, roleId, content);
        await prisma.message.create({
          data: { content: appImgUrl, sender: 'assistant', roleId, type: 'image' },
        });
        event.sender.send('chat:done', { roleId });
      } catch (err) {
        event.sender.send('chat:error', { error: String(err) });
      }
      return;
    }

    // Build messages for API
    const systemParts = [role.soul, role.rule, role.summary].filter(Boolean);
    const systemPrompt = systemParts.join('\n\n');
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    const history = await prisma.message.findMany({
      where: { roleId },
      orderBy: { createdAt: 'asc' },
    });
    for (const msg of history) {
      messages.push({ role: msg.sender, content: msg.content });
    }

    // Stream
    try {
      await streamChatResponse(event, brain, role, messages, roleId);
    } catch (err) {
      event.sender.send('chat:error', { error: String(err) });
    }
  });
};
