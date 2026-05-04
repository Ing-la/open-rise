'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AvatarIcon } from './AvatarIcon';
import { listMessages, sendChatMessage } from '@/lib/api';

interface ChatViewProps {
  individuals: any[];
  selectedPerson: any | null;
  onSelectPerson: (person: any) => void;
  sidebarOpen: boolean;
}

export default function ChatView({ individuals, selectedPerson, onSelectPerson, sidebarOpen }: ChatViewProps) {
  const [doorOpen, setDoorOpen] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Load messages when person changes ──
  useEffect(() => {
    if (selectedPerson) {
      listMessages(selectedPerson.id).then(setMessages).catch(() => setMessages([]));
    } else {
      setMessages([]);
    }
  }, [selectedPerson]);

  // ── Scroll to bottom when messages change ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = '0';
    el.style.height = Math.min(el.scrollHeight, 24 * 7 + 28) + 'px';
    setInputValue(el.value);
  }, []);

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || !selectedPerson || sending) return;
    const content = inputValue.trim();
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '';
    }

    // Optimistic user message
    const tempId = 'tmp-' + Date.now();
    setMessages((prev) => [...prev, { id: tempId, content, sender: 'user' }]);

    setSending(true);
    try {
      await sendChatMessage(selectedPerson.id, content);
      const updated = await listMessages(selectedPerson.id);
      setMessages(updated);
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }, [inputValue, selectedPerson, sending]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const rightColumnPersons = individuals.filter((p) => p.id !== selectedPerson?.id).slice(0, 5);
  const rightColumnVisible = !!selectedPerson && !sidebarOpen;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ════════════════════════════════════════════
          Left standing column — door at top, persons below
          ════════════════════════════════════════════ */}
      {rightColumnVisible && rightColumnPersons.length > 0 && (
        <div className="w-28 flex flex-col items-center gap-4 pt-6 shrink-0 overflow-y-auto">
          <button
            onClick={() => setDoorOpen((v) => !v)}
            className="w-12 h-14 flex items-center justify-center cursor-pointer opacity-30 hover:opacity-100 transition-opacity shrink-0 focus:outline-none"
            aria-label="门"
          >
            <svg viewBox="0 0 40 56" className="w-full h-full" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="36" height="52" rx="2" stroke="#2C2C2C" strokeWidth="2" filter="url(#tremble)" />
              <circle cx="30" cy="30" r="3" stroke="#2C2C2C" strokeWidth="2" fill="none" filter="url(#tremble)" />
            </svg>
          </button>

          {rightColumnPersons.map((p, i) => (
            <button
              key={p.id}
              onClick={() => onSelectPerson(p)}
              className="flex flex-col items-center gap-1 cursor-pointer group w-full focus:outline-none"
              style={{
                transition: `all 0.35s ease ${doorOpen ? i * 60 : (rightColumnPersons.length - 1 - i) * 60}ms`,
                transform: doorOpen ? 'translateY(0)' : `translateY(-${120 + i * 45}px)`,
                opacity: doorOpen ? 1 : 0,
                pointerEvents: doorOpen ? 'auto' : 'none',
              }}
            >
              <AvatarIcon id={p.avatar} size={48} />
              <span className="font-hand text-sm text-oxblood/50 group-hover:text-oxblood transition-colors leading-tight text-center w-full truncate">
                {p.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════
          Main — messages + input
          ════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 px-6">
        {!selectedPerson ? (
          /* ── No person selected ── */
          <div className="flex-1 flex items-center justify-center overflow-y-auto">
            {individuals.length === 0 ? (
              <div className="text-center">
                <p className="font-hand text-lg text-oxblood/40">还没有人物</p>
                <p className="font-mono text-xs text-oxblood/20 mt-2">请先通过 /role 配置人物</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-6 items-center justify-center max-w-2xl py-12">
                {individuals.map((ind) => (
                  <button
                    key={ind.id}
                    onClick={() => onSelectPerson(ind)}
                    className="flex flex-col items-center gap-2 cursor-pointer group focus:outline-none"
                  >
                    <div className="transition-transform duration-200 group-hover:scale-110">
                      <AvatarIcon id={ind.avatar} size={52} />
                    </div>
                    <span className="font-hand text-sm text-oxblood/70 group-hover:text-oxblood transition-colors">
                      {ind.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Person selected ── */
          <>
            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto thin-scroll pt-8 pb-4">
              <div className="max-w-3xl mx-auto space-y-6">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center pt-16">
                    <span className="font-hand text-4xl text-oxblood/30 select-none" style={{ filter: 'url(#charcoal)' }}>
                      OpenRise
                    </span>
                    <p className="font-mono text-sm text-oxblood/20 mt-2 select-none">
                      开始和 {selectedPerson.name} 对话
                    </p>
                  </div>
                ) : (
                  messages.map((msg) =>
                    msg.sender === 'user' ? (
                      /* ── User message — right ── */
                      <div key={msg.id} className="flex justify-end">
                        <div className="max-w-[75%]">
                          <p className="font-mono text-sm text-oxblood leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* ── AI message — left with avatar + name ── */
                      <div key={msg.id} className="flex justify-start">
                        <div className="max-w-[75%]">
                          <div className="flex items-center gap-2 mb-2">
                            <AvatarIcon id={selectedPerson.avatar} size={24} />
                            <span className="font-hand text-sm text-oxblood">{selectedPerson.name}</span>
                          </div>
                          <div className="markdown-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    )
                  )
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* ── Input bar ── */}
            <div className="pb-9 pt-1">
              <div className="max-w-3xl mx-auto">
                <div className="relative">
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox="0 0 400 200"
                    preserveAspectRatio="none"
                    fill="none"
                    aria-hidden="true"
                    style={{ zIndex: 1 }}
                  >
                    <rect x="4" y="4" width="392" height="192" rx="16" fill="#FFFFFF" />
                    <rect x="4" y="4" width="392" height="192" rx="16" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                  </svg>
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder="输入消息..."
                    className="relative w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood resize-none overflow-y-auto thin-scroll px-5 py-3.5"
                    style={{ lineHeight: '24px', maxHeight: '196px', zIndex: 2 }}
                    autoComplete="off"
                    disabled={sending}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
