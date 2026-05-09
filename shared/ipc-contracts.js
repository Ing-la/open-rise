// ============================================================
// IPC Contracts — 前后端通信合约
//
// 用法：
//   前端 → preload.js → ipcRenderer.invoke(channel, params)
//   后端 → ipcMain.handle(channel, handler)
//
// 双方都读这个文件，不存在不同步。
// 通道名是硬编码字符串，不要在别处写死。
// ============================================================

const IPC = {
  // ── 大脑 (Brain) ─────────────────────────────────────────
  BRAIN: {
    LIST:   { channel: 'brain:list',   params: {}, returns: { brains: [] } },
    CREATE: { channel: 'brain:create', params: { name: '', vendor: '', endpoint: '', apiKey: '', website: '', model: '', type: 'chat' }, returns: { id: '' } },
    DELETE: { channel: 'brain:delete', params: { id: '' }, returns: { success: true } },
    GET:    { channel: 'brain:get',    params: { id: '' }, returns: { brain: null } },
    UPDATE: { channel: 'brain:update', params: { id: '', name: '', vendor: '', endpoint: '', apiKey: '', website: '', model: '', type: 'chat' }, returns: { id: '' } },
    TEST:   { channel: 'brain:test',   params: { id: '' }, returns: { success: true } },
  },

  // ── 角色 (Role) ─────────────────────────────────────────
  ROLE: {
    LIST:   { channel: 'role:list',   params: {}, returns: { roles: [] } },
    CREATE: { channel: 'role:create', params: { name: '', brainId: '', soul: '', rule: '', avatar: null }, returns: { id: '' } },
    UPDATE: { channel: 'role:update', params: { id: '', name: '', brainId: '', soul: '', rule: '', avatar: null }, returns: { success: true } },
    DELETE: { channel: 'role:delete', params: { id: '' }, returns: { success: true } },
  },

  // ── 对话 (Chat) ─────────────────────────────────────────
  CHAT: {
    LIST:       { channel: 'chat:list',        params: { roleId: '' }, returns: { messages: [] } },
    SEND_STREAM:{ channel: 'chat:send-stream',  params: { roleId: '', content: '' }, note: 'ipcMain.on → 无返回值，通过 chat:chunk/done/error 事件推送' },
    CHUNK:      { channel: 'chat:chunk',        note: '推送到渲染进程: { content: string }' },
    DONE:       { channel: 'chat:done',         note: '推送到渲染进程: { roleId: string }' },
    ERROR:      { channel: 'chat:error',        note: '推送到渲染进程: { error: string }' },
  },

  // ── 文件 (File) ─────────────────────────────────────────
  FILE: {
    SAVE_DIALOG: { channel: 'file:save-dialog', params: { appImgUrl: '' }, returns: { success: true, savedPath: '' } },
  },

};

// ============================================================
// Preload API 映射
// ============================================================
const PRELOAD_API = {
  file: {
    saveImage: 'file:save-dialog',
  },
  brain: {
    list:   'brain:list',
    create: 'brain:create',
    update: 'brain:update',
    delete: 'brain:delete',
    get:    'brain:get',
    test:   'brain:test',
  },
  role: {
    list:   'role:list',
    create: 'role:create',
    update: 'role:update',
    delete: 'role:delete',
  },
  chat: {
    sendStream: 'chat:send-stream',
    onChunk: 'chat:chunk',   // 事件监听
    onDone:  'chat:done',    // 事件监听
    onError: 'chat:error',   // 事件监听
    list: 'chat:list',
  },
};
