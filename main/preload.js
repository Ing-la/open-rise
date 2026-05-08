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
    // 流式发送：发出后后端通过 onChunk/onDone/onError 推送
    sendStream: (params) => ipcRenderer.send('chat:send-stream', params),
    // 以下三个返回取消监听的函数
    onChunk: (cb) => {
      const handler = (_e, d) => cb(d);
      ipcRenderer.on('chat:chunk', handler);
      return () => ipcRenderer.removeListener('chat:chunk', handler);
    },
    onDone: (cb) => {
      const handler = () => cb();
      ipcRenderer.on('chat:done', handler);
      return () => ipcRenderer.removeListener('chat:done', handler);
    },
    onError: (cb) => {
      const handler = (_e, d) => cb(d);
      ipcRenderer.on('chat:error', handler);
      return () => ipcRenderer.removeListener('chat:error', handler);
    },
    // 非流式查询（切换角色时加载历史）
    list: (roleId) => ipcRenderer.invoke('chat:list', roleId),
  },
});
