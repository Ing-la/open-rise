const { app, BrowserWindow, ipcMain, protocol, net, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const serve = require('electron-serve').default;
const prisma = require('./db');

const isDev = !app.isPackaged;
const loadURL = serve({ directory: 'out' });

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    loadURL(mainWindow);
  }
}

// ════════════════════════════════════════════════════
// IPC Handlers
// ════════════════════════════════════════════════════

// ── Brain ──

ipcMain.handle('brain:list', async () => {
  const brains = await prisma.brain.findMany({ orderBy: { createdAt: 'desc' } });
  return brains;
});

ipcMain.handle('brain:create', async (_event, params) => {
  const { name, vendor, endpoint, apiKey, website, model, type } = params;
  const brain = await prisma.brain.create({
    data: { name, provider: vendor, baseUrl: endpoint, apiKey, modelName: model, type: type || 'chat' },
  });
  return { id: brain.id };
});

ipcMain.handle('brain:delete', async (_event, id) => {
  const roles = await prisma.role.findMany({ where: { brainId: id }, select: { id: true } });
  const roleIds = roles.map((r) => r.id);

  await prisma.message.deleteMany({ where: { roleId: { in: roleIds } } });
  await prisma.role.deleteMany({ where: { brainId: id } });
  await prisma.brain.delete({ where: { id } });
  return { success: true };
});

ipcMain.handle('brain:get', async (_event, id) => {
  const brain = await prisma.brain.findUnique({ where: { id } });
  return { brain };
});

ipcMain.handle('brain:update', async (_event, id, params) => {
  const { name, vendor, endpoint, apiKey, website, model, type } = params;
  const brain = await prisma.brain.update({
    where: { id },
    data: { name, provider: vendor, baseUrl: endpoint, apiKey, modelName: model, type: type || 'chat' },
  });
  return { id: brain.id };
});

ipcMain.handle('brain:test', async (_event, id) => {
  const brain = await prisma.brain.findUnique({ where: { id } });
  if (!brain) return { success: false };
  try {
    const response = await fetch(`${brain.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${brain.apiKey}` },
    });
    return { success: response.ok };
  } catch {
    return { success: false };
  }
});

// ── Role ──

ipcMain.handle('role:list', async () => {
  const roles = await prisma.role.findMany({
    include: { brain: true },
    orderBy: { createdAt: 'desc' },
  });

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    avatar: role.avatar,
    brainId: role.brain.id,
    brainName: role.brain.name,
    soul: role.soul,
    rule: role.rule,
    createdAt: role.createdAt.toISOString(),
  }));
});

ipcMain.handle('role:create', async (_event, params) => {
  const { name, brainId, soul, rule, avatar } = params;
  const role = await prisma.role.create({
    data: { name, soul: soul ?? '', rule: rule ?? '', brainId, avatar: avatar ?? null },
  });
  return { id: role.id };
});

ipcMain.handle('role:update', async (_event, id, params) => {
  const { name, brainId, soul, rule, avatar } = params;
  const role = await prisma.role.update({
    where: { id },
    data: { name, soul, rule, brainId, avatar: avatar ?? null },
  });
  return { success: true };
});

ipcMain.handle('role:delete', async (_event, id) => {
  await prisma.message.deleteMany({ where: { roleId: id } });
  await prisma.role.delete({ where: { id } });
  return { success: true };
});

// ── Chat ──

ipcMain.handle('chat:list', async (_event, roleId) => {
  const messages = await prisma.message.findMany({
    where: { roleId },
    orderBy: { createdAt: 'asc' },
  });
  return messages;
});

// ── Model detection ──

function isImageModel(modelName) {
  const imageKeywords = [
    'flux', 'stable-diffusion', 'sdxl', 'dall-e',
    'black-forest-labs', 'stabilityai', 'deep-floyd',
    'pixart', 'latent-consistency', 'playground',
    'kandinsky', 'würstchen', 'cogview', 'glm', 'wanx',
    'taiyi', 'midjourney', 'qwen',
  ];
  const lower = modelName.toLowerCase();
  return imageKeywords.some(keyword => lower.includes(keyword));
}

// ── Low-level HTTPS POST helper ──

function rawHttps(urlStr, body, apiKey) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${apiKey}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

// ── Chat: 流式 ──

ipcMain.on('chat:send-stream', async (event, params) => {
  const { roleId, content } = params;

  // 1. Find role with brain + summary
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { brain: true },
  });
  if (!role) {
    event.sender.send('chat:error', { error: 'Role not found' });
    return;
  }

  const { brain } = role;

  // 2. Save user message
  await prisma.message.create({
    data: { content, sender: 'user', roleId },
  });

  // 2b. Image model → call images API
  const isImage = brain.type === 'image' || isImageModel(brain.modelName);
  if (isImage) {
    try {
      const isDashScope = brain.baseUrl.includes('dashscope');
      let raw;

      if (isDashScope) {
        // ── DashScope proprietary format ──
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
        // ── OpenAI compatible format ──
        const bodyRaw = JSON.stringify({
          model: brain.modelName,
          prompt: content,
          size: '1024x1024',
        });
        raw = await rawHttps(`${brain.baseUrl}/images/generations`, bodyRaw, brain.apiKey);
      }

      if (!(raw.statusCode >= 200 && raw.statusCode < 300)) {
        event.sender.send('chat:error', { error: `API error ${raw.statusCode}: ${raw.body}` });
        return;
      }

      const data = JSON.parse(raw.body);

      // DashScope puts status inside the body
      if (isDashScope && data.status_code && data.status_code !== 200) {
        event.sender.send('chat:error', { error: `DashScope error: ${data.code || data.status_code} ${data.message || ''}` });
        return;
      }

      let imageUrl, imageB64;

      if (isDashScope) {
        // { output: { choices: [{ message: { content: [{ image: "url" }] } }] } }
        const content = data.output?.choices?.[0]?.message?.content;
        imageUrl = Array.isArray(content) ? content[0]?.image : null;
      } else {
        imageUrl = data.data?.[0]?.url;
        imageB64 = data.data?.[0]?.b64_json;
      }

      if (!imageUrl && !imageB64) {
        event.sender.send('chat:error', { error: 'No image data in response' });
        return;
      }

      const imageDir = !app.isPackaged
        ? path.join(__dirname, '..', 'prisma', 'images', roleId)
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

      const appImgUrl = `app-img:///${imagePath.replace(/\\/g, '/')}`;

      await prisma.message.create({
        data: { content: appImgUrl, sender: 'assistant', roleId, type: 'image' },
      });

      // For image models, skip compression
      event.sender.send('chat:done', { roleId });
    } catch (err) {
      event.sender.send('chat:error', { error: String(err) });
    }
    return;
  }

  // 3. Fetch all messages
  const history = await prisma.message.findMany({
    where: { roleId },
    orderBy: { createdAt: 'asc' },
  });

  // 4. Build messages array for API (soul + rule + summary)
  const systemParts = [role.soul, role.rule, role.summary].filter(Boolean);
  const systemPrompt = systemParts.join('\n\n');
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  for (const msg of history) {
    messages.push({ role: msg.sender, content: msg.content });
  }

  // 5. Call API with streaming
  try {
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
        } catch { /* skip malformed SSE line */ }
      }
    }

    // 6. Save full reply
    await prisma.message.create({
      data: { content: fullReply, sender: 'assistant', roleId },
    });

    // 7. Async compression
    checkAndCompress(roleId).catch((err) => console.error('Compression failed:', err));

    // 8. Done
    event.sender.send('chat:done', { roleId });
  } catch (err) {
    event.sender.send('chat:error', { error: String(err) });
  }
});

// ── Compression ──

const COMPRESS_CHAR_THRESHOLD = 20000; // chars — 短期记忆超此阈值触发压缩
const SUMMARY_MAX_TOKENS = 2048;       // summary 输出长度上限
const SHORT_TERM_KEEP = 10;           // 压缩后保留的最新消息条数

function getArchiveDir() {
  const dir = !app.isPackaged
    ? path.join(__dirname, '..', 'prisma', 'archives')
    : path.join(app.getPath('userData'), 'archives');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function formatArchiveMarkdown(role, messages) {
  const lines = ['# Conversation Archive', '', `## Role: ${role.name}`, `## Date: ${new Date().toISOString()}`, `## Summary: ${role.summary || '(none)'}`, '', '---', ''];
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
}

async function checkAndCompress(roleId) {
  const count = await prisma.message.count({ where: { roleId } });
  if (count <= SHORT_TERM_KEEP) return; // Keep at least N as short-term

  const allMessages = await prisma.message.findMany({
    where: { roleId },
    orderBy: { createdAt: 'asc' },
  });

  // Keep the most recent N, compress everything older
  const toArchive = allMessages.slice(0, -SHORT_TERM_KEEP);
  if (toArchive.length === 0) return;

  const totalChars = toArchive.reduce((sum, m) => sum + m.content.length, 0);
  if (totalChars <= COMPRESS_CHAR_THRESHOLD) return;

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { brain: true },
  });
  if (!role) return;

  // Call LLM to produce new summary
  const newSummary = await compressMessages(role, toArchive);

  // Archive to markdown file
  const archiveDir = getArchiveDir();
  const timestamp = Date.now();
  const safeName = role.name.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
  const archivePath = path.join(archiveDir, `${safeName}-${timestamp}.md`);
  const markdown = formatArchiveMarkdown(role, toArchive);
  fs.writeFileSync(archivePath, markdown, 'utf-8');

  // Update summary
  await prisma.role.update({
    where: { id: roleId },
    data: { summary: newSummary },
  });

  // Delete archived messages
  const archiveIds = toArchive.map((m) => m.id);
  await prisma.message.deleteMany({
    where: { id: { in: archiveIds } },
  });

  console.log(`Compressed ${toArchive.length} messages for role "${role.name}" → ${archivePath}`);
}

// ════════════════════════════════════════════════════
// Custom protocol for serving local images
// ════════════════════════════════════════════════════

// ── Image save dialog ──

ipcMain.handle('file:save-dialog', async (_event, appImgUrl) => {
  // Convert app-img:/// back to absolute path
  const filePath = appImgUrl.replace(/^app-img:\/\/\//, '');
  const defaultName = path.basename(filePath);

  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  });

  if (result.canceled || !result.filePath) return { success: false };

  try {
    fs.copyFileSync(filePath, result.filePath);
    return { success: true, savedPath: result.filePath };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

protocol.registerSchemesAsPrivileged([
  { scheme: 'app-img', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } },
]);

app.whenReady().then(() => {
  protocol.handle('app-img', (request) => {
    const url = request.url.replace('app-img:', 'file:');
    return net.fetch(url);
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
