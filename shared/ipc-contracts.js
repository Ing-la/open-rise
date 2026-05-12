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
    SEND_STREAM:{ channel: 'chat:send-stream',  params: { roleId: '', content: '' }, note: 'ipcMain.on → 通过 chat:chunk/done/error 推送' },
    CHUNK:      { channel: 'chat:chunk',        note: '推送: { content: string }' },
    DONE:       { channel: 'chat:done',         note: '推送: { roleId: string }' },
    ERROR:      { channel: 'chat:error',        note: '推送: { error: string }' },
  },

  // ── 文件 (File) ─────────────────────────────────────────
  FILE: {
    SAVE_DIALOG: { channel: 'file:save-dialog', params: { appImgUrl: '' }, returns: { success: true, savedPath: '' } },
  },

  // ── Agent ────────────────────────────────────────────────
  AGENT: {
    SESSION_CREATE: { channel: 'agent:session-create', params: { roleId: '', title: '' }, returns: { id: '' } },
    SESSION_LIST:   { channel: 'agent:session-list',   params: { roleId: '' }, returns: { sessions: [] } },
    SESSION_DELETE: { channel: 'agent:session-delete', params: { sessionId: '' }, returns: { success: true } },
    SESSION_MESSAGES: { channel: 'agent:session-messages', params: { sessionId: '' }, returns: { messages: [] } },

    SEND: { channel: 'agent:send', params: { sessionId: '', roleId: '', content: '' }, note: 'ipcMain.on → 通过 agent:progress/trace/done/error 推送' },
    STOP: { channel: 'agent:stop', params: { sessionId: '' }, note: 'ipcMain.on, 发送中止信号' },

    PROGRESS: { channel: 'agent:progress', note: '推送: { sessionId, status, message }' },
    TRACE:    { channel: 'agent:trace',    note: '推送: { sessionId, step, type, name, input, output }' },
    DONE:     { channel: 'agent:done',     note: '推送: { sessionId, result, trace }' },
    ERROR:    { channel: 'agent:error',    note: '推送: { sessionId, error }' },

    TRUST_ADD:  { channel: 'agent:trust-add',  params: { path: '' }, returns: { success: true, paths: [] } },
    TRUST_LIST: { channel: 'agent:trust-list', params: {}, returns: { paths: [] } },
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
    onChunk: 'chat:chunk',
    onDone:  'chat:done',
    onError: 'chat:error',
    list: 'chat:list',
  },
  agent: {
    createSession: 'agent:session-create',
    listSessions:  'agent:session-list',
    deleteSession: 'agent:session-delete',
    send:   'agent:send',
    stop:   'agent:stop',
    onProgress: 'agent:progress',
    onTrace:    'agent:trace',
    onDone:     'agent:done',
    onError:    'agent:error',
    trustAdd:  'agent:trust-add',
    trustList: 'agent:trust-list',
  },
};

if (typeof module !== 'undefined') {
  module.exports = { IPC, PRELOAD_API };
}
