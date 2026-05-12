'use client';

interface AgentSessionListProps {
  sessions: any[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
  onDelete: (sessionId: string) => void;
}

export default function AgentSessionList({
  sessions, activeSessionId, onSelect, onCreate, onDelete,
}: AgentSessionListProps) {
  return (
    <div className="flex flex-col">
      {/* New Session Button */}
      <div className="px-3 pt-4 pb-2">
        <button
          onClick={onCreate}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#2C2C2C]/20 hover:border-[#2C2C2C]/50 text-[#2C2C2C]/50 hover:text-[#2C2C2C]/80 transition-all cursor-pointer font-hand text-sm"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" aria-hidden="true">
            <path d="M 8 2 L 8 14 M 2 8 L 14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
          </svg>
          新建会话
        </button>
      </div>

      {/* Session List */}
      <div className="px-3 pb-4 space-y-1">
        {sessions.length === 0 ? (
          <p className="font-hand text-sm text-[#2C2C2C]/30 text-center py-8">暂无会话</p>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <button
                onClick={() => onSelect(s.id)}
                className={`flex-1 min-w-0 text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeSessionId === s.id
                    ? 'bg-[#2C2C2C]/8'
                    : 'hover:bg-[#2C2C2C]/5'
                }`}
              >
                <p className="font-hand text-sm text-[#2C2C2C] truncate">{s.title || '新会话'}</p>
                <p className="font-mono text-[10px] text-[#2C2C2C]/30">
                  {new Date(s.createdAt).toLocaleDateString()}
                </p>
              </button>
              <button
                onClick={() => onDelete(s.id)}
                className="w-6 h-6 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer focus:outline-none shrink-0"
                aria-label="删除会话"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" aria-hidden="true">
                  <path d="M 3 3 L 13 13 M 13 3 L 3 13" stroke="#2C2C2C/40" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
