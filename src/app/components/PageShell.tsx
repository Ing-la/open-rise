'use client';

import { useState, useCallback, useEffect } from 'react';
import { listRoles } from '@/lib/api';
import { AvatarIcon } from './AvatarIcon';
import CommandCenter from './CommandCenter';
import ChatView from './ChatView';

const SIDEBAR_W = 256;

export default function PageShell() {
  const [mode, setMode] = useState<'home' | 'chat'>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
  const [individuals, setIndividuals] = useState<any[]>([]);

  useEffect(() => {
    listRoles().then(setIndividuals).catch(() => {});
  }, []);

  const exitChat = useCallback(() => {
    setMode('home');
    setSelectedPerson(null);
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

  const toggleSidebar = useCallback(() => {
    const next = !sidebarOpen;
    if (next) listRoles().then(setIndividuals).catch(() => {});
    setSidebarOpen(next);
  }, [sidebarOpen]);

  return (
    <div className="h-screen flex bg-[#F2F2EE] overflow-hidden">
      {/* ════════════════════════════════════════════
          Fixed top bar — reduced height
          ≡ │ centered name │ OpenRise — same horizontal line
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

        {/* ── Person name — centered, offset for avatar+text midpoint ── */}
        {mode === 'chat' && selectedPerson && (
          <div
            className="absolute left-1/2 flex items-center gap-2"
            style={{ transform: 'translateX(calc(-50% - 16px))' }}
          >
            <AvatarIcon id={selectedPerson.avatar} size={32} />
            <span className="font-hand text-lg text-oxblood whitespace-nowrap">{selectedPerson.name}</span>
          </div>
        )}

        {/* ── OpenRise ── */}
        <div className="ml-auto">
          {mode === 'chat' ? (
            <button
              onClick={exitChat}
              className="font-hand text-xl text-oxblood cursor-pointer select-none tracking-[0.15em] focus:outline-none"
              style={{ filter: 'url(#charcoal)' }}
              aria-label="返回首页"
            >
              OpenRise
            </button>
          ) : (
            <span className="font-hand text-xl text-oxblood select-none tracking-[0.15em]" style={{ filter: 'url(#charcoal)' }}>
              OpenRise
            </span>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════
          Sidebar — pushes main content via flex
          ════════════════════════════════════════════ */}
      <div
        className="h-full overflow-hidden shrink-0 transition-all duration-200 ease-out"
        style={{ width: sidebarOpen ? SIDEBAR_W : 0 }}
      >
        <div className="w-64 h-full flex flex-col pt-20" style={{ width: SIDEBAR_W }}>
          <div className="flex-1 overflow-y-auto thin-scroll px-3 pb-4">
            {mode === 'chat' ? (
              individuals.length === 0 ? (
                <p className="font-hand text-sm text-oxblood/40 text-center py-8">暂无人物</p>
              ) : (
                <div className="space-y-1">
                  {individuals.map((ind) => (
                    <button
                      key={ind.id}
                      onClick={() => handleSelectPerson(ind)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors cursor-pointer text-left ${
                        selectedPerson?.id === ind.id ? 'bg-oxblood/8' : 'hover:bg-oxblood/5'
                      }`}
                    >
                      <AvatarIcon id={ind.avatar} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="font-hand text-sm text-oxblood truncate">{ind.name}</p>
                        <p className="font-mono text-[10px] text-oxblood/40 truncate">{ind.brainName}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          Main Content — pt-12 clears top bar
          ════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 pt-12 transition-all duration-200 ease-out">
        {/* ─── Home ─── */}
        {mode === 'home' && (
          <main className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="relative mb-12 select-none">
              <h1 className="absolute inset-0 text-[160px] sm:text-[220px] font-hand text-oxblood/10 leading-none text-center" style={{ transform: 'rotate(-0.8deg) translate(-4px, 2px)', filter: 'url(#charcoal)' }} aria-hidden="true">OpenRise</h1>
              <h1 className="absolute inset-0 text-[160px] sm:text-[220px] font-hand text-oxblood/15 leading-none text-center" style={{ transform: 'rotate(0.5deg) translate(3px, -2px)', filter: 'url(#charcoal)' }} aria-hidden="true">OpenRise</h1>
              <h1 className="relative text-[160px] sm:text-[220px] font-hand text-oxblood leading-none text-center wiggle-subtle" style={{ filter: 'url(#charcoal)' }}>OpenRise</h1>
            </div>
            <CommandCenter onChatStart={enterChat} />
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
      </div>
    </div>
  );
}
