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
    clearMessages(roleId: string): Promise<{ success: boolean }>;
  };
  debate: {
    create(params: { proTopic: string; conTopic: string; background: string; proRoles: string[]; conRoles: string[]; judgeBrainId: string; debugMode?: boolean }): Promise<{ debateId: string }>;
    resume(params: { debateId: string; debugMode?: boolean }): Promise<{ debateId: string }>;
    step(params: { debateId: string }): void;
    stop(): void;
    list(): Promise<any[]>;
    get(id: string): Promise<any>;
    onDelta(cb: (data: any) => void): () => void;
    onPrompt(cb: (data: any) => void): () => void;
    onRoundDone(cb: (data: any) => void): () => void;
    onJudgingDone(cb: (data: any) => void): () => void;
    onDone(cb: (data: any) => void): () => void;
    onError(cb: (data: any) => void): () => void;
    aggregate(params: { debateId: string }): Promise<{ winner: string; bestPro: any; bestCon: any; overallBest: any; proTotal: number; conTotal: number }>;
  };
  agent: {
    createSession(params: { roleId: string; title?: string }): Promise<{ id: string }>;
    listSessions(roleId: string): Promise<any[]>;
    deleteSession(id: string): Promise<{ success: boolean }>;
    renameSession(id: string, title: string): Promise<{ success: boolean }>;
    clearSession(sessionId: string): Promise<{ success: boolean }>;
    listMessages(id: string): Promise<any[]>;
    send(params: { sessionId: string; roleId: string; content: string }): void;
    stop(sessionId: string): void;
    onProgress(cb: (data: any) => void): () => void;
    onTrace(cb: (data: any) => void): () => void;
    onDone(cb: (data: any) => void): () => void;
    onError(cb: (data: any) => void): () => void;
    getCompactInfo(sessionId: string): Promise<{ summary: string; compactedAt: string; archivePath: string } | null>;
    trustAdd(path: string): Promise<{ success: boolean; paths: string[] }>;
    trustList(): Promise<{ paths: string[] }>;
    capabilitiesLoad(): Promise<any>;
    capabilitiesSave(config: any): Promise<{ success: boolean }>;
    toolList(roleId?: string): Promise<{ name: string; description: string; params: string[] }[]>;
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

export const clearMessages = (roleId: string) =>
  isElectron ? api!.chat.clearMessages(roleId) : Promise.resolve({ success: false });

// ── Agent: Session 管理 ──

export const createAgentSession = (params: { roleId: string; title?: string }) =>
  isElectron ? api!.agent.createSession(params) : Promise.resolve({ id: '' });

export const listAgentSessions = (roleId: string) =>
  isElectron ? api!.agent.listSessions(roleId) : Promise.resolve([]);

export const deleteAgentSession = (id: string) =>
  isElectron ? api!.agent.deleteSession(id) : Promise.resolve({ success: false });

export const renameAgentSession = (sessionId: string, title: string) =>
  isElectron ? api!.agent.renameSession(sessionId, title) : Promise.resolve({ success: false });

export const clearAgentSession = (sessionId: string) =>
  isElectron ? api!.agent.clearSession(sessionId) : Promise.resolve({ success: false });

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

export const getAgentToolList = (roleId: string) =>
  isElectron ? api!.agent.toolList(roleId) : Promise.resolve([]);

// ── Agent: 压缩信息 ──

export const getAgentSessionCompactInfo = (sessionId: string) =>
  isElectron ? api!.agent.getCompactInfo(sessionId) : Promise.resolve(null);

// ── Debate ──

export interface DebateCallbacks {
  onDelta?: (data: { roleId: string; roleName?: string; content: string; phase?: string; side?: string; position?: number | string; isFirst?: boolean; personaIndex?: number; totalPersonas?: number }) => void;
  onPrompt?: (data: { system: string; user: string }) => void;
  onRoundDone?: (data: { phase: string; side: string; position: number | string; label: string; roleId: string; roleName: string; content: string; charsUsed: number; charBudget: number; roundIndex: number; personaIndex?: number; totalPersonas?: number; sideCharsPro?: number; sideCharsCon?: number }) => void;
  onJudgingDone?: (data: { personaCount: number }) => void;
  onDone?: (data: { winner: string; scores: any[]; summary: string }) => void;
  onError?: (data: { error: string }) => void;
}

export function createDebate(params: Parameters<OpenRiseAPI['debate']['create']>[0]): Promise<{ debateId: string }> {
  if (!isElectron) return Promise.resolve({ debateId: '' });
  return api!.debate.create(params);
}

export function resumeDebate(params: { debateId: string; debugMode?: boolean }): Promise<{ debateId: string }> {
  if (!isElectron) return Promise.resolve({ debateId: '' });
  return api!.debate.resume(params);
}

export function stepDebate(debateId: string) {
  if (isElectron) api!.debate.step({ debateId });
}

export function stopDebate() {
  if (isElectron) api!.debate.stop();
}

export function subscribeDebate(callbacks: DebateCallbacks): () => void {
  if (!isElectron) {
    callbacks.onError?.({ error: 'No Electron context' });
    return () => {};
  }

  const cleanups: (() => void)[] = [];
  if (callbacks.onDelta) cleanups.push(api!.debate.onDelta(callbacks.onDelta));
  if (callbacks.onPrompt) cleanups.push(api!.debate.onPrompt(callbacks.onPrompt));
  if (callbacks.onRoundDone) cleanups.push(api!.debate.onRoundDone(callbacks.onRoundDone));
  if (callbacks.onJudgingDone) cleanups.push(api!.debate.onJudgingDone(callbacks.onJudgingDone));
  if (callbacks.onDone) cleanups.push(api!.debate.onDone(callbacks.onDone));
  if (callbacks.onError) cleanups.push(api!.debate.onError(callbacks.onError));

  return () => cleanups.forEach((fn) => fn());
}

export const listDebates = () =>
  isElectron ? api!.debate.list() : Promise.resolve([]);

export const aggregateDebate = (debateId: string) =>
  isElectron ? api!.debate.aggregate({ debateId }) : Promise.resolve({ winner: '', bestPro: null, bestCon: null, overallBest: null, proTotal: 0, conTotal: 0 });

export const getDebate = (id: string) =>
  isElectron ? api!.debate.get(id) : Promise.resolve(null);
