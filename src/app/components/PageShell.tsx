'use client';

import { useState, useCallback, useEffect } from 'react';
import { listRoles, listAgentSessions, createAgentSession, deleteAgentSession, renameAgentSession, clearMessages } from '@/lib/api';
import { AvatarIcon } from './AvatarIcon';
import CommandCenter from './CommandCenter';
import ChatView from './ChatView';
import AgentView from './AgentView';
import AgentSessionList from './AgentSessionList';
import BrainLibrary from './BrainLibrary';
import RoleLibrary from './RoleLibrary';
import ConfirmDialog from './ConfirmDialog';
import AgentCapabilitiesModal from './AgentCapabilitiesModal';
import DebateView from './DebateView';

const SIDEBAR_W = 256;

export default function PageShell() {
  const [mode, setMode] = useState<'home' | 'chat' | 'agent' | 'debate' | 'brain-library' | 'role-library'>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
  const [agentRole, setAgentRole] = useState<any | null>(null);
  const [individuals, setIndividuals] = useState<any[]>([]);
  const [agentSessions, setAgentSessions] = useState<any[]>([]);
  const [agentActiveSessionId, setAgentActiveSessionId] = useState<string | null>(null);
  const [capabilitiesModalOpen, setCapabilitiesModalOpen] = useState(false);
  const [debatePhaseInfo, setDebatePhaseInfo] = useState<{ currentPhase: string; roundIndex: number }>({ currentPhase: '', roundIndex: 0 });
  const [debateResetKey, setDebateResetKey] = useState(0);
  const [clearTarget, setClearTarget] = useState<any | null>(null);
  const [sessionDeleteTarget, setSessionDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    listRoles().then(setIndividuals).catch(() => {});
  }, []);

  // Load agent sessions when agent role changes
  useEffect(() => {
    if (agentRole) {
      listAgentSessions(agentRole.id).then(setAgentSessions).catch(() => setAgentSessions([]));
    } else {
      setAgentSessions([]);
      setAgentActiveSessionId(null);
    }
  }, [agentRole]);

  const handleAgentCreateSession = useCallback(async () => {
    if (!agentRole) return;
    try {
      const { id } = await createAgentSession({ roleId: agentRole.id });
      setAgentActiveSessionId(id);
      setAgentSessions((prev) => {
        const newS = { id, roleId: agentRole.id, title: '新会话', status: 'active', createdAt: new Date().toISOString() };
        return [newS, ...prev];
      });
    } catch {
      // silently fail
    }
  }, [agentRole]);

  const handleAgentDeleteSession = useCallback((sessionId: string) => {
    setSessionDeleteTarget(sessionId);
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    const sessionId = sessionDeleteTarget;
    if (!sessionId) return;
    try {
      await deleteAgentSession(sessionId);
      setAgentSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setAgentActiveSessionId((prev) => prev === sessionId ? null : prev);
    } catch {
      // silently fail
    } finally {
      setSessionDeleteTarget(null);
    }
  }, [sessionDeleteTarget]);

  const handleAgentRenameSession = useCallback(async (sessionId: string, title: string) => {
    try {
      await renameAgentSession(sessionId, title);
      setAgentSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, title } : s));
    } catch {
      // silently fail
    }
  }, []);

  const handleAgentSelectSession = useCallback((sessionId: string) => {
    setAgentActiveSessionId(sessionId);
  }, []);

  const handleAgentSessionsRefresh = useCallback(() => {
    if (agentRole) listAgentSessions(agentRole.id).then(setAgentSessions).catch(() => {});
  }, [agentRole]);

  const exitToHome = useCallback(() => {
    setMode('home');
    setSelectedPerson(null);
    setAgentRole(null);
  }, []);

  const handleSelectPerson = useCallback((person: any) => {
    setSelectedPerson(person);
    setSidebarOpen(false);
    if (mode === 'home') setMode('chat');
  }, [mode]);

  const enterChat = useCallback(() => {
    setMode('chat');
    setSidebarOpen(false);
    listRoles().then(setIndividuals).catch(() => {});
  }, []);

  const enterAgent = useCallback(() => {
    setMode('agent');
    setSidebarOpen(false);
    listRoles().then(setIndividuals).catch(() => {});
  }, []);

  const enterDebate = useCallback(() => {
    setMode('debate');
    setSidebarOpen(false);
  }, []);

  const enterBrainLibrary = useCallback(() => {
    setMode('brain-library');
    setSidebarOpen(false);
  }, []);

  const enterRoleLibrary = useCallback(() => {
    setMode('role-library');
    setSidebarOpen(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    const next = !sidebarOpen;
    if (next) listRoles().then(setIndividuals).catch(() => {});
    setSidebarOpen(next);
  }, [sidebarOpen]);

  const handleAgentRoleChange = useCallback((role: any | null) => {
    setAgentRole(role);
  }, []);

  const handleClearMessages = useCallback(async (person: any) => {
    setClearTarget(person);
  }, []);

  const confirmClearMessages = useCallback(async () => {
    if (!clearTarget) return;
    await clearMessages(clearTarget.id);
    if (selectedPerson?.id === clearTarget.id) {
      setSelectedPerson({ ...clearTarget });
    }
    setClearTarget(null);
  }, [clearTarget, selectedPerson]);

  return (
    <div className="h-screen flex bg-[#F2F2EE] overflow-hidden relative">
      {/* ════════════════════════════════════════════
          Fixed top bar
          ════════════════════════════════════════════ */}
      <div className="fixed top-0 left-0 right-0 z-50 h-12 flex items-center px-10">
        {/* ── ≡ (hidden in debate) ── */}
        {mode !== 'debate' && mode !== 'brain-library' && mode !== 'role-library' && (
        <button
          onClick={toggleSidebar}
          className="w-8 h-8 flex items-center justify-center cursor-pointer focus:outline-none"
          aria-label="功能菜单"
        >
          <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" aria-hidden="true">
            <path d="M 4 6 L 20 6 M 4 12 L 20 12 M 4 18 L 20 18" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
          </svg>
        </button>
        )}

        {/* ── Person name — centered ── */}
        {mode === 'chat' && selectedPerson && (
          <div
            className="absolute left-1/2 flex items-center gap-2 transition-transform duration-200 ease-out"
            style={{ transform: `translateX(calc(-50% - 16px${sidebarOpen ? ' + 128px' : ''}))` }}
          >
            <AvatarIcon id={selectedPerson.avatar} size={32} />
            <span className="font-hand text-lg text-[#2C2C2C] whitespace-nowrap">{selectedPerson.name}</span>
          </div>
        )}

        {/* ── Agent mode ── */}
        {mode === 'agent' && agentRole && (
          <div
            className="absolute left-1/2 flex items-center gap-2 transition-transform duration-200 ease-out"
            style={{ transform: `translateX(calc(-50% - 16px${sidebarOpen ? ' + 128px' : ''}))` }}
          >
            <AvatarIcon id={agentRole.avatar} size={32} />
            <span className="font-hand text-lg text-[#2C2C2C] whitespace-nowrap">{agentRole.name}</span>
            <button
              onClick={() => handleAgentRoleChange(null)}
              className="font-mono text-xs text-[#2C2C2C]/30 hover:text-[#2C2C2C]/70 transition-colors ml-1 cursor-pointer"
              aria-label="切换角色"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Debate mode ── */}
        {mode === 'debate' && (
          <>
            {/* Left: back button (history view) + phase status (active) */}
            <button
              onClick={() => setDebateResetKey(k => k + 1)}
              className="w-8 h-8 flex items-center justify-center cursor-pointer focus:outline-none mr-3"
              aria-label="返回辩论首页"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            {debatePhaseInfo.currentPhase && (
              <div className="flex items-center gap-3 max-w-[50%] overflow-hidden">
                {['立论', '驳论', '对辩', '自由辩论', '总结', '裁判评判'].map((p, i) => {
                  const idx = ['立论', '驳论', '对辩', '自由辩论', '总结', '裁判评判'].indexOf(debatePhaseInfo.currentPhase);
                  return (
                    <span key={p} className={`font-mono text-xs whitespace-nowrap ${i === idx ? 'text-[#2C2C2C] font-bold' : i < idx ? 'text-[#2C2C2C]/30' : 'text-[#2C2C2C]/15'}`}>
                      {i > 0 && <span className="mx-1 text-[#2C2C2C]/10">→</span>}{p}
                    </span>
                  );
                })}
                <span className="font-mono text-[10px] text-[#2C2C2C]/30 ml-2">第 {debatePhaseInfo.roundIndex} 轮</span>
              </div>
            )}

            {/* Center: 辩论赛 */}
            <div className="absolute left-1/2 -translate-x-1/2">
              <span className="font-hand text-lg text-[#2C2C2C]">辩论赛</span>
            </div>
          </>
        )}

        {/* ── OpenRise ── */}
        <div className="ml-auto flex items-center gap-3">
          {mode !== 'home' ? (
            <button
              onClick={exitToHome}
              className="font-hand text-xl text-[#2C2C2C] cursor-pointer select-none tracking-[0.15em] focus:outline-none"
              style={{ filter: 'url(#charcoal)' }}
              aria-label="返回首页"
            >
              OpenRise
            </button>
          ) : (
            <span className="font-hand text-xl text-[#2C2C2C] select-none tracking-[0.15em]" style={{ filter: 'url(#charcoal)' }}>
              OpenRise
            </span>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════
          Sidebar (hidden in debate)
          ════════════════════════════════════════════ */}
      {mode !== 'debate' && (
      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          mode === 'home' || mode === 'brain-library' || mode === 'role-library' ? 'absolute left-0 top-0 bottom-0 z-40' : 'h-full shrink-0'
        }`}
        style={{ width: sidebarOpen ? SIDEBAR_W : 0 }}
      >
        <div className="w-64 h-full flex flex-col pt-20" style={{ width: SIDEBAR_W }}>
          <div className="flex-1 overflow-y-auto thin-scroll px-3 pb-4">
            {mode === 'home' || mode === 'brain-library' || mode === 'role-library' ? (
              <div className="space-y-0.5 pt-2">
                <button
                  onClick={enterBrainLibrary}
                  className={`w-full flex items-center gap-3 px-2.5 py-3 rounded-lg font-hand text-lg font-bold transition-colors cursor-pointer text-left ${
                    mode === 'brain-library' ? 'text-[#2C2C2C] bg-[#2C2C2C]/8' : 'text-[#2C2C2C]/60 hover:text-[#2C2C2C] hover:bg-[#2C2C2C]/5'
                  }`}
                >
                  brain
                </button>
                <button
                  onClick={enterRoleLibrary}
                  className={`w-full flex items-center gap-3 px-2.5 py-3 rounded-lg font-hand text-lg font-bold transition-colors cursor-pointer text-left ${
                    mode === 'role-library' ? 'text-[#2C2C2C] bg-[#2C2C2C]/8' : 'text-[#2C2C2C]/60 hover:text-[#2C2C2C] hover:bg-[#2C2C2C]/5'
                  }`}
                >
                  role
                </button>
                <button
                  onClick={enterChat}
                  className="w-full flex items-center gap-3 px-2.5 py-3 rounded-lg font-hand text-lg font-bold text-[#2C2C2C]/60 hover:text-[#2C2C2C] hover:bg-[#2C2C2C]/5 transition-colors cursor-pointer text-left"
                >
                  chat
                </button>
                <button
                  onClick={enterAgent}
                  className="w-full flex items-center gap-3 px-2.5 py-3 rounded-lg font-hand text-lg font-bold text-[#2C2C2C]/60 hover:text-[#2C2C2C] hover:bg-[#2C2C2C]/5 transition-colors cursor-pointer text-left"
                >
                  agent
                </button>
                <button
                  onClick={enterDebate}
                  className="w-full flex items-center gap-3 px-2.5 py-3 rounded-lg font-hand text-lg font-bold text-[#2C2C2C]/60 hover:text-[#2C2C2C] hover:bg-[#2C2C2C]/5 transition-colors cursor-pointer text-left"
                >
                  debate
                </button>
              </div>
            ) : mode === 'chat' ? (
              individuals.length === 0 ? (
                <p className="font-hand text-sm text-[#2C2C2C]/40 text-center py-8">暂无人物</p>
              ) : (
                <div className="space-y-1">
                  {individuals.map((ind) => (
                    <div key={ind.id} className="group flex items-center">
                      <button
                        onClick={() => handleSelectPerson(ind)}
                        className={`flex-1 flex items-center gap-3 p-2.5 rounded-lg transition-colors cursor-pointer text-left ${
                          selectedPerson?.id === ind.id ? 'bg-[#2C2C2C]/8' : 'hover:bg-[#2C2C2C]/5'
                        }`}
                      >
                        <AvatarIcon id={ind.avatar} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="font-hand text-lg text-[#2C2C2C] truncate">{ind.name}</p>
                          <p className="font-mono text-[10px] text-[#2C2C2C]/40 truncate">{ind.brainName}</p>
                        </div>
                      </button>
                      <button
                        onClick={() => handleClearMessages(ind)}
                        className="shrink-0 mr-1.5 w-7 h-7 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#2C2C2C]/10 transition-all cursor-pointer"
                        aria-label={`清除 ${ind.name} 聊天记录`}
                        type="button"
                      >
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" aria-hidden="true">
                          <path d="M 2 4 L 14 4 M 5 4 L 5 2 C 5 1.5 5.5 1 6 1 L 10 1 C 10.5 1 11 1.5 11 2 L 11 4 M 12.5 4 L 12 13 C 12 13.5 11.5 14 11 14 L 5 14 C 4.5 14 4 13.5 4 13 L 3.5 4" stroke="#2C2C2C" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M 6.5 7 L 6.5 11 M 9.5 7 L 9.5 11" stroke="#2C2C2C" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : mode === 'agent' ? (
              <AgentSessionList
                sessions={agentSessions}
                activeSessionId={agentActiveSessionId}
                onSelect={handleAgentSelectSession}
                onCreate={handleAgentCreateSession}
                onDelete={handleAgentDeleteSession}
                onRename={handleAgentRenameSession}
              />
            ) : null}
          </div>

          {/* ── Sidebar footer — agent capabilities ── */}
          {mode === 'agent' && (
            <div className="shrink-0 px-3 py-3 border-t border-[#2C2C2C]/10">
              <button
                onClick={() => setCapabilitiesModalOpen(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg font-hand text-lg text-[#2C2C2C]/50 hover:text-[#2C2C2C] hover:bg-[#2C2C2C]/5 transition-all cursor-pointer"
                type="button"
              >
                <span>🔧</span>
                <span>小帮手</span>
              </button>
            </div>
          )}
        </div>
      </div>)}

      {/* ════════════════════════════════════════════
          Main Content
          ════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 pt-12 transition-all duration-200 ease-out">
        {/* ─── Home ─── */}
        {mode === 'home' && (
          <main className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="relative mb-12 select-none" style={{ transform: 'translateY(-40px)' }}>
              <h1 className="absolute inset-0 text-[160px] sm:text-[220px] font-hand text-[#2C2C2C]/10 leading-none text-center" style={{ transform: 'rotate(-0.8deg) translate(-4px, 2px)', filter: 'url(#charcoal)' }} aria-hidden="true">OpenRise</h1>
              <h1 className="absolute inset-0 text-[160px] sm:text-[220px] font-hand text-[#2C2C2C]/15 leading-none text-center" style={{ transform: 'rotate(0.5deg) translate(3px, -2px)', filter: 'url(#charcoal)' }} aria-hidden="true">OpenRise</h1>
              <h1 className="relative text-[160px] sm:text-[220px] font-hand text-[#2C2C2C] leading-none text-center wiggle-subtle" style={{ filter: 'url(#charcoal)' }}>OpenRise</h1>
            </div>
            <CommandCenter onChatStart={enterChat} onAgentStart={enterAgent} onBrainOpen={enterBrainLibrary} onRoleOpen={enterRoleLibrary} onDebateStart={enterDebate} />
          </main>
        )}

        {/* ─── Chat ─── */}
        {mode === 'chat' && (
          <ChatView
            individuals={individuals}
            selectedPerson={selectedPerson}
            onSelectPerson={handleSelectPerson}
            sidebarOpen={sidebarOpen}
          />
        )}

        {/* ─── Debate ─── */}
        {mode === 'debate' && (
          <DebateView key={debateResetKey} onPhaseInfo={setDebatePhaseInfo} />
        )}

        {/* ─── Agent ─── */}
        {mode === 'agent' && (
          <AgentView
            agentRole={agentRole}
            onAgentRoleChange={handleAgentRoleChange}
            sessions={agentSessions}
            activeSessionId={agentActiveSessionId}
            onCreateSession={handleAgentCreateSession}
            onDeleteSession={handleAgentDeleteSession}
            onSelectSession={handleAgentSelectSession}
            onSessionsRefresh={handleAgentSessionsRefresh}
            onRequestSidebarOpen={toggleSidebar}
          />
        )}

        {/* ─── Brain Library ─── */}
        {mode === 'brain-library' && (
          <BrainLibrary onBack={exitToHome} />
        )}

        {/* ─── Role Library ─── */}
        {mode === 'role-library' && (
          <RoleLibrary onBack={exitToHome} />
        )}
      </div>

      {/* ── Agent capabilities modal ── */}
      <AgentCapabilitiesModal
        isOpen={capabilitiesModalOpen}
        onClose={() => setCapabilitiesModalOpen(false)}
        agentRoleId={agentRole?.id || null}
        agentRoleName={agentRole?.name || ''}
      />

      {/* ── Clear messages confirm ── */}
      <ConfirmDialog
        open={!!clearTarget}
        title="清除聊天记录"
        message={`确认清除 ${clearTarget?.name || ''} 的聊天记录？\n此操作不可撤销。`}
        confirmText="清除"
        onConfirm={confirmClearMessages}
        onCancel={() => setClearTarget(null)}
      />

      {/* ── Delete session confirm ── */}
      <ConfirmDialog
        open={!!sessionDeleteTarget}
        title="删除会话"
        message={`确认删除会话「${agentSessions.find(s => s.id === sessionDeleteTarget)?.title || ''}」？\n此操作不可撤销。`}
        confirmText="删除"
        onConfirm={confirmDeleteSession}
        onCancel={() => setSessionDeleteTarget(null)}
      />
    </div>
  );
}
