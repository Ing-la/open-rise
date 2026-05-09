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

  // 返回一次性取消所有监听的函数
  return () => {
    unsubChunk();
    unsubDone();
    unsubError();
  };
}

// ── File: 图片保存 ──

export const saveImage = (appImgUrl: string) =>
  isElectron ? api!.file.saveImage(appImgUrl) : Promise.resolve({ success: false });

// ── Chat: 查询历史（非流式）──

export const listMessages = (roleId: string) =>
  isElectron ? api!.chat.list(roleId) : Promise.resolve([]);

