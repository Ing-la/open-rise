const prisma = require('../db');

module.exports = function (ipcMain) {
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
};
