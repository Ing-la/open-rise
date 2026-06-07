require('dotenv').config();

const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
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
require('./handlers/debate')(ipcMain);

// ── App lifecycle ──

app.whenReady().then(async () => {
  protocol.handle('app-img', (request) => {
    const url = request.url.replace('app-img:', 'file:');
    return net.fetch(url);
  });

  // ── Production: initialize database tables on first launch ──
  if (app.isPackaged) {
    try {
      const prisma = require('./db');
      const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.sql');
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      for (const stmt of sql.split(';')) {
        const trimmed = stmt.trim();
        if (!trimmed || trimmed.startsWith('--')) continue;
        try {
          await prisma.$executeRawUnsafe(trimmed + ';');
        } catch (e) {
          if (!e.message?.includes('already exists')) throw e;
        }
      }
      console.log('[DB] Database tables initialized successfully');
    } catch (e) {
      // ENOENT = schema.sql not packaged (dev build), ignore
      if (e.code !== 'ENOENT') {
        console.error('[DB] Failed to initialize database:', e);
      }
    }
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
