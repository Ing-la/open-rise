const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
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
  const { name, vendor, endpoint, apiKey, website, model } = params;
  const brain = await prisma.brain.create({
    data: { name, provider: vendor, baseUrl: endpoint, apiKey, modelName: model },
  });
  return { id: brain.id };
});

ipcMain.handle('brain:delete', async (_event, id) => {
  const roles = await prisma.role.findMany({ where: { brainId: id }, select: { id: true } });
  const roleIds = roles.map((r) => r.id);

  await prisma.message.deleteMany({ where: { roleId: { in: roleIds } } });
  await prisma.memory.deleteMany({ where: { roleId: { in: roleIds } } });
  await prisma.role.deleteMany({ where: { brainId: id } });
  await prisma.brain.delete({ where: { id } });
  return { success: true };
});

ipcMain.handle('brain:get', async (_event, id) => {
  const brain = await prisma.brain.findUnique({ where: { id } });
  return { brain };
});

ipcMain.handle('brain:update', async (_event, id, params) => {
  const { name, vendor, endpoint, apiKey, website, model } = params;
  const brain = await prisma.brain.update({
    where: { id },
    data: { name, provider: vendor, baseUrl: endpoint, apiKey, modelName: model },
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
  await prisma.memory.deleteMany({ where: { roleId: id } });
  await prisma.role.delete({ where: { id } });
  return { success: true };
});

// ── Chat ──

ipcMain.handle('chat:list', async (_event, roleId) => {
  const messages = await prisma.message.findMany({
    where: { roleId },
    orderBy: { createdAt: 'asc' },
    take: 30,
  });
  return messages;
});

ipcMain.handle('chat:send', async (_event, params) => {
  const { roleId, content } = params;

  // 1. Find role with brain
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { brain: true },
  });
  if (!role) return { error: 'Role not found' };

  const { brain } = role;

  // 2. Save user message
  await prisma.message.create({
    data: { content, sender: 'user', roleId },
  });

  // 3. Fetch recent history (last 30 messages)
  const history = await prisma.message.findMany({
    where: { roleId },
    orderBy: { createdAt: 'asc' },
    take: 30,
  });

  // 4. Build messages array for API
  const systemPrompt = [role.soul, role.rule].filter(Boolean).join('\n\n');
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  for (const msg of history) {
    messages.push({ role: msg.sender, content: msg.content });
  }

  // 5. Call OpenAI-compatible API
  const response = await fetch(`${brain.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${brain.apiKey}`,
    },
    body: JSON.stringify({
      model: brain.modelName,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { error: `API error ${response.status}: ${errorText}` };
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content ?? '';

  // 6. Save assistant reply
  await prisma.message.create({
    data: { content: reply, sender: 'assistant', roleId },
  });

  return { reply };
});

// ── Memory ──

ipcMain.handle('memory:read', async (_event, roleId, title) => {
  const memory = await prisma.memory.findUnique({ where: { roleId } });
  if (!memory) return { content: '' };

  // Extract section by ## title from markdown
  const lines = memory.content.split('\n');
  let inSection = false;
  let section = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (inSection) break;
      if (line.includes(title)) {
        inSection = true;
        continue;
      }
    }
    if (inSection) section.push(line);
  }
  return { content: section.join('\n').trim() };
});

ipcMain.handle('memory:update', async (_event, roleId, content) => {
  await prisma.memory.upsert({
    where: { roleId },
    create: { roleId, content },
    update: { content },
  });
  return { success: true };
});

ipcMain.handle('memory:clear', async (_event, roleId) => {
  await prisma.memory.deleteMany({ where: { roleId } });
  return { success: true };
});

// ════════════════════════════════════════════════════

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
