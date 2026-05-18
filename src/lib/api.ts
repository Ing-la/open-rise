// ── Client-side API abstraction ──
// Bridges Electron IPC when available; graceful fallback otherwise.

interface OpenRiseAPI {
  file: {
    saveImage(url: string): Promise<{ success: boolean; savedPath?: string; error?: string }>;
  };
  brain: {
    list(): Promise<any[]>;
    create(p: any): Promise<{ id: string }>;
    update(id: string, p: any): Promise<{ id: string }>;
    delete(id: string): Promise<{ success: boolean }>;
    get(id: string): Promise<{ brain: any | null }>;
    test(id: string): Promise<{ success: boolean }>;
  };
  role: {
    list(): Promise<any[]>;
    create(p: any): Promise<{ id: string }>;
    update(id: string, p: any): Promise<{ success: boolean }>;
    delete(id: string): Promise<{ success: boolean }>;
  };
  chat: {
    sendStream(params: { roleId: string; content: string }): void;
    onChunk(cb: (data: { content: string }) => void): () => void;
    onDone(cb: () => void): () => void;
    onError(cb: (data: { error: string }) => void): () => void;
    list(roleId: string): Promise<any[]>;
  };
  agent: {
    createSession(params: { roleId: string; title?: string }): Promise<{ id: string }>;
    listSessions(roleId: string): Promise<any[]>;
    deleteSession(id: string): Promise<{ success: boolean }>;
    listMessages(id: string): Promise<any[]>;
    send(params: { sessionId: string; roleId: string; content: string }): void;
    stop(sessionId: string): void;
    onProgress(cb: (data: any) => void): () => void;
    onTrace(cb: (data: any) => void): () => void;
    onDone(cb: (data: any) => void): () => void;
    onError(cb: (data: any) => void): () => void;
    trustAdd(path: string): Promise<{ success: boolean; paths: string[] }>;
    trustList(): Promise<{ paths: string[] }>;
    capabilitiesLoad(): Promise<any>;
    capabilitiesSave(config: any): Promise<{ success: boolean }>;
    toolList(): Promise<{ name: string; description: string; params: string[] }[]>;
  };
}

const api = (typeof window !== 'undefined' ? (window as any).openriseAPI : undefined) as OpenRiseAPI | undefined;
const isElectron = !!api;

// ── Brain ──
export const listBrains = () => isElectron ? api!.brain.list() : Promise.resolve([]);

export const createBrain = (params: {
  name: string; vendor: string; endpoint: string; apiKey: string; website: string; model: string; type: string;
}) => isElectron ? api!.brain.create(params) : (console.warn('No Electron context'), Promise.resolve({ id: '' }));

export const updateBrain = (id: string, params: {
  name: string; vendor: string; endpoint: string; apiKey: string; website: string; model: string; type: string;
}) => isElectron ? api!.brain.update(id, params) : (console.warn('No Electron context'), Promise.resolve({ id: '' }));

export const deleteBrain = (id: string) => isElectron ? api!.brain.delete(id) : Promise.resolve({ success: false });

export const testBrainConnection = (id: string) => isElectron ? api!.brain.test(id) : Promise.resolve({ success: false });

// ── Role ──
export const listRoles = () => isElectron ? api!.role.list() : Promise.resolve([]);

export const createRole = (params: {
  name: string; brainId: string; soul: string; rule: string; avatar: string | null;
}) => isElectron ? api!.role.create(params) : (console.warn('No Electron context'), Promise.resolve({ id: '' }));

export const deleteRole = (id: string) => isElectron ? api!.role.delete(id) : Promise.resolve({ success: false });

export const updateRole = (id: string, params: {
  name: string; brainId: string; soul: string; rule: string; avatar: string | null;
}) => isElectron ? api!.role.update(id, params) : (console.warn('No Electron context'), Promise.resolve({ success: false }));

// ── Chat: 流式发送 ──

export function sendChatMessageStream(
  roleId: string,
  content: string,
  callbacks: {
    onChunk: (chunk: string) => void;
    onDone: () => void;
    onError: (error: string) => void;
  }
): () => void {
  if (!isElectron) {
    callbacks.onError('No Electron context');
    return () => {};
  }

  const unsubChunk = api!.chat.onChunk((data) => callbacks.onChunk(data.content));
  const unsubDone = api!.chat.onDone(() => callbacks.onDone());
  const unsubError = api!.chat.onError((data) => callbacks.onError(data.error));

  api!.chat.sendStream({ roleId, content });

  return () => {
    unsubChunk();
    unsubDone();
    unsubError();
  };
}

// ── File: 图片保存 ──

export const saveImage = (appImgUrl: string) =>
  isElectron ? api!.file.saveImage(appImgUrl) : Promise.resolve({ success: false });

// ── Chat: 查询历史 ──

export const listMessages = (roleId: string) =>
  isElectron ? api!.chat.list(roleId) : Promise.resolve([]);

// ── Agent: Session 管理 ──

export const createAgentSession = (params: { roleId: string; title?: string }) =>
  isElectron ? api!.agent.createSession(params) : Promise.resolve({ id: '' });

export const listAgentSessions = (roleId: string) =>
  isElectron ? api!.agent.listSessions(roleId) : Promise.resolve([]);

export const deleteAgentSession = (id: string) =>
  isElectron ? api!.agent.deleteSession(id) : Promise.resolve({ success: false });

export const listAgentMessages = (sessionId: string) =>
  isElectron ? api!.agent.listMessages(sessionId) : Promise.resolve([]);

// ── Agent: 发送任务 ──

export interface AgentCallbacks {
  onProgress?: (data: { sessionId: string; status: string; message: string }) => void;
  onTrace?: (data: { sessionId: string; step: number; type: string; name?: string; input?: any; output?: string; content?: string }) => void;
  onDone?: (data: { sessionId: string; result: string; trace: any[] }) => void;
  onError?: (data: { sessionId: string; error: string }) => void;
}

export function sendAgentTask(
  params: { sessionId: string; roleId: string; content: string },
  callbacks: AgentCallbacks
): () => void {
  if (!isElectron) {
    callbacks.onError?.({ sessionId: params.sessionId, error: 'No Electron context' });
    return () => {};
  }

  const cleanups: (() => void)[] = [];
  if (callbacks.onProgress) cleanups.push(api!.agent.onProgress(callbacks.onProgress));
  if (callbacks.onTrace) cleanups.push(api!.agent.onTrace(callbacks.onTrace));
  if (callbacks.onDone) cleanups.push(api!.agent.onDone(callbacks.onDone));
  if (callbacks.onError) cleanups.push(api!.agent.onError(callbacks.onError));

  api!.agent.send(params);

  return () => cleanups.forEach((fn) => fn());
}

export function stopAgentTask(sessionId: string) {
  if (isElectron) api!.agent.stop(sessionId);
}

// ── Agent: 信任路径 ──

export const addTrustedPath = (path: string) =>
  isElectron ? api!.agent.trustAdd(path) : Promise.resolve({ success: false, paths: [] });

export const listTrustedPaths = () =>
  isElectron ? api!.agent.trustList() : Promise.resolve({ paths: [] });

// ── Agent: 多模态能力 ──

export const loadAgentCapabilities = () =>
  isElectron ? api!.agent.capabilitiesLoad() : Promise.resolve({});

export const saveAgentCapabilities = (config: any) =>
  isElectron ? api!.agent.capabilitiesSave(config) : Promise.resolve({ success: false });

// ── Agent: 工具列表 ──

export const getAgentToolList = () =>
  isElectron ? api!.agent.toolList() : Promise.resolve([]);
