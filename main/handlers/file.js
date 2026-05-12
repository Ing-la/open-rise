const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');

module.exports = function (ipcMain) {
  ipcMain.handle('file:save-dialog', async (_event, appImgUrl) => {
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
};
