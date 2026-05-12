const prisma = require('../db');

module.exports = function (ipcMain) {
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
      brainType: role.brain.type,
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
    await prisma.role.update({
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
};
