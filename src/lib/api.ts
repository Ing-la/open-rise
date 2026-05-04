// ── Client-side API abstraction ──
// Bridges Electron IPC when available; graceful fallback otherwise.

interface OpenRiseAPI {
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
    send(params: { roleId: string; content: string }): Promise<{ reply?: string; error?: string }>;
    list(roleId: string): Promise<any[]>;
  };
  memory: {
    read(roleId: string, title: string): Promise<{ content: string }>;
    update(roleId: string, content: string): Promise<{ success: boolean }>;
    clear(roleId: string): Promise<{ success: boolean }>;
  };
}

const api = (typeof window !== 'undefined' ? (window as any).openriseAPI : undefined) as OpenRiseAPI | undefined;
const isElectron = !!api;

// ── Brain ──
export const listBrains = () => isElectron ? api!.brain.list() : Promise.resolve([]);

export const createBrain = (params: {
  name: string; vendor: string; endpoint: string; apiKey: string; website: string; model: string;
}) => isElectron ? api!.brain.create(params) : (console.warn('No Electron context'), Promise.resolve({ id: '' }));

export const updateBrain = (id: string, params: {
  name: string; vendor: string; endpoint: string; apiKey: string; website: string; model: string;
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

// ── Chat ──
export const sendChatMessage = (roleId: string, content: string) =>
  isElectron ? api!.chat.send({ roleId, content }) : Promise.resolve({ error: 'No Electron context' });

export const listMessages = (roleId: string) =>
  isElectron ? api!.chat.list(roleId) : Promise.resolve([]);

// ── Memory ──
export const readMemory = (roleId: string, title: string) =>
  isElectron ? api!.memory.read(roleId, title) : Promise.resolve({ content: '' });

export const updateMemory = (roleId: string, content: string) =>
  isElectron ? api!.memory.update(roleId, content) : Promise.resolve({ success: false });

export const clearMemory = (roleId: string) =>
  isElectron ? api!.memory.clear(roleId) : Promise.resolve({ success: false });
