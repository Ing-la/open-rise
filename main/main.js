require('dotenv').config();

const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const serve = require('electron-serve').default;

const isDev = !app.isPackaged;
const loadURL = serve({ directory: 'out' });

// ── Register privileged schemes ──
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-img', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } },
]);

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

// ── Register all IPC handlers ──
require('./handlers/brain')(ipcMain);
require('./handlers/role')(ipcMain);
require('./handlers/chat')(ipcMain);
require('./handlers/file')(ipcMain);
require('./handlers/agent')(ipcMain);

// ── App lifecycle ──

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
