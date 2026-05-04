const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openriseAPI', {
  // ── Brain ──
  brain: {
    list:   ()           => ipcRenderer.invoke('brain:list'),
    create: (params)     => ipcRenderer.invoke('brain:create', params),
    update: (id, params) => ipcRenderer.invoke('brain:update', id, params),
    delete: (id)         => ipcRenderer.invoke('brain:delete', id),
    get:    (id)         => ipcRenderer.invoke('brain:get', id),
    test:   (id)         => ipcRenderer.invoke('brain:test', id),
  },
  // ── Role ──
  role: {
    list:   ()           => ipcRenderer.invoke('role:list'),
    create: (params)     => ipcRenderer.invoke('role:create', params),
    update: (id, params) => ipcRenderer.invoke('role:update', id, params),
    delete: (id)         => ipcRenderer.invoke('role:delete', id),
  },
  // ── Chat ──
  chat: {
    send: (params) => ipcRenderer.invoke('chat:send', params),
    list: (roleId) => ipcRenderer.invoke('chat:list', roleId),
  },
  // ── Memory ──
  memory: {
    read:   (roleId, title) => ipcRenderer.invoke('memory:read', roleId, title),
    update: (roleId, content) => ipcRenderer.invoke('memory:update', roleId, content),
    clear:  (roleId) => ipcRenderer.invoke('memory:clear', roleId),
  },
});
