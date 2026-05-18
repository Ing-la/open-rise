const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openriseAPI', {
  // ── File ──
  file: {
    saveImage: (appImgUrl) => ipcRenderer.invoke('file:save-dialog', appImgUrl),
  },
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
    sendStream: (params) => ipcRenderer.send('chat:send-stream', params),
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
    list: (roleId) => ipcRenderer.invoke('chat:list', roleId),
  },
  // ── Agent ──
  agent: {
    // Session management
    createSession: (params) => ipcRenderer.invoke('agent:session-create', params),
    listSessions:  (roleId)  => ipcRenderer.invoke('agent:session-list', roleId),
    deleteSession: (id)      => ipcRenderer.invoke('agent:session-delete', id),
    listMessages:  (id)      => ipcRenderer.invoke('agent:session-messages', id),

    // Agent loop
    send:     (params) => ipcRenderer.send('agent:send', params),
    stop:     (id)     => ipcRenderer.send('agent:stop', id),

    // Event listeners (return cleanup functions)
    onProgress: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:progress', h);
      return () => ipcRenderer.removeListener('agent:progress', h);
    },
    onTrace: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:trace', h);
      return () => ipcRenderer.removeListener('agent:trace', h);
    },
    onDone: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:done', h);
      return () => ipcRenderer.removeListener('agent:done', h);
    },
    onError: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:error', h);
      return () => ipcRenderer.removeListener('agent:error', h);
    },

    // Trusted paths
    trustAdd:  (path)  => ipcRenderer.invoke('agent:trust-add', path),
    trustList: ()      => ipcRenderer.invoke('agent:trust-list'),

    // Multi-modal capabilities
    capabilitiesLoad: ()      => ipcRenderer.invoke('agent:capabilities-load'),
    capabilitiesSave: (cfg)   => ipcRenderer.invoke('agent:capabilities-save', cfg),

    // Tool list
    toolList: () => ipcRenderer.invoke('agent:tool-list'),
  },
});
