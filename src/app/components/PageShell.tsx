'use client';

import { useState, useCallback, useEffect } from 'react';
import { listRoles, listAgentSessions, createAgentSession, deleteAgentSession } from '@/lib/api';
import { AvatarIcon } from './AvatarIcon';
import CommandCenter from './CommandCenter';
import ChatView from './ChatView';
import AgentView from './AgentView';
import AgentSessionList from './AgentSessionList';

const SIDEBAR_W = 256;

export default function PageShell() {
  const [mode, setMode] = useState<'home' | 'chat' | 'agent'>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
  const [agentRole, setAgentRole] = useState<any | null>(null);
  const [individuals, setIndividuals] = useState<any[]>([]);
  const [agentSessions, setAgentSessions] = useState<any[]>([]);
  const [agentActiveSessionId, setAgentActiveSessionId] = useState<string | null>(null);

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

  const handleAgentDeleteSession = useCallback(async (sessionId: string) => {
    try {
      await deleteAgentSession(sessionId);
      setAgentSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setAgentActiveSessionId((prev) => prev === sessionId ? null : prev);
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
    listRoles().then(setIndividuals).catch(() => {});
  }, []);

  const enterAgent = useCallback(() => {
    setMode('agent');
    setSidebarOpen(false);
    listRoles().then(setIndividuals).catch(() => {});
  }, []);

  const toggleSidebar = useCallback(() => {
    const next = !sidebarOpen;
    if (next) listRoles().then(setIndividuals).catch(() => {});
    setSidebarOpen(next);
  }, [sidebarOpen]);

  const handleAgentRoleChange = useCallback((role: any | null) => {
    setAgentRole(role);
  }, []);

  return (
    <div className="h-screen flex bg-[#F2F2EE] overflow-hidden">
      {/* ════════════════════════════════════════════
          Fixed top bar
          ════════════════════════════════════════════ */}
      <div className="fixed top-0 left-0 right-0 z-50 h-12 flex items-center px-10">
        {/* ── ≡ ── */}
        <button
          onClick={toggleSidebar}
          className="w-8 h-8 flex items-center justify-center cursor-pointer focus:outline-none"
          aria-label="功能菜单"
        >
          <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" aria-hidden="true">
            <path d="M 4 6 L 20 6 M 4 12 L 20 12 M 4 18 L 20 18" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
          </svg>
        </button>

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

        {/* ── OpenRise ── */}
        <div className="ml-auto">
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
          Sidebar
          ════════════════════════════════════════════ */}
      <div
        className="h-full overflow-hidden shrink-0 transition-all duration-200 ease-out"
        style={{ width: sidebarOpen ? SIDEBAR_W : 0 }}
      >
        <div className="w-64 h-full flex flex-col pt-20" style={{ width: SIDEBAR_W }}>
          <div className="flex-1 overflow-y-auto thin-scroll px-3 pb-4">
            {mode === 'chat' ? (
              individuals.length === 0 ? (
                <p className="font-hand text-sm text-[#2C2C2C]/40 text-center py-8">暂无人物</p>
              ) : (
                <div className="space-y-1">
                  {individuals.map((ind) => (
                    <button
                      key={ind.id}
                      onClick={() => handleSelectPerson(ind)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors cursor-pointer text-left ${
                        selectedPerson?.id === ind.id ? 'bg-[#2C2C2C]/8' : 'hover:bg-[#2C2C2C]/5'
                      }`}
                    >
                      <AvatarIcon id={ind.avatar} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="font-hand text-sm text-[#2C2C2C] truncate">{ind.name}</p>
                        <p className="font-mono text-[10px] text-[#2C2C2C]/40 truncate">{ind.brainName}</p>
                      </div>
                    </button>
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
              />
            ) : null}
          </div>
        </div>
      </div>

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
            <CommandCenter onChatStart={enterChat} onAgentStart={enterAgent} />
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
          />
        )}
      </div>
    </div>
  );
}
