'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AvatarIcon } from './AvatarIcon';
import { listMessages, sendChatMessageStream, saveImage } from '@/lib/api';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const msgIdCounter = useRef(0);

  // ── Load messages when person changes ──
  useEffect(() => {
    if (selectedPerson) {
      setLoading(true);
      listMessages(selectedPerson.id).then(setMessages).catch(() => setMessages([])).finally(() => setLoading(false));
    } else {
      setMessages([]);
      setLoading(false);
    }
  }, [selectedPerson]);

  // ── Scroll to bottom when messages change ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Cleanup stream listeners on unmount ──
  useEffect(() => {
    return () => streamCleanupRef.current?.();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = '0';
    el.style.height = Math.min(el.scrollHeight, 24 * 7 + 28) + 'px';
    setInputValue(el.value);
  }, []);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || !selectedPerson || sending) return;
    if (error) setError(null);

    const content = inputValue.trim();
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '';
    }

    // Clean up any previous stream listeners
    streamCleanupRef.current?.();

    // Optimistic user message + AI placeholder (guaranteed unique IDs)
    const userMsgId = 'uid-' + ++msgIdCounter.current;
    const aiMsgId = 'aid-' + ++msgIdCounter.current;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, content, sender: 'user' },
      { id: aiMsgId, content: '', sender: 'assistant' },
    ]);

    setSending(true);

    const cleanup = sendChatMessageStream(selectedPerson.id, content, {
      onChunk: (chunk) => {
        setMessages((prev) => prev.map((m) =>
          m.id === aiMsgId ? { ...m, content: m.content + chunk } : m
        ));
      },
      onDone: () => {
        streamCleanupRef.current = null;
        setSending(false);
        // 流完成后从 DB 刷新，将乐观 ID 替换为真实 ID
        listMessages(selectedPerson.id).then(setMessages).catch(() => {});
      },
      onError: (errorMsg) => {
        streamCleanupRef.current = null;
        setMessages((prev) => prev.filter(
          (m) => m.id !== userMsgId && m.id !== aiMsgId
        ));
        setError(errorMsg || '发送失败，请重试');
        setSending(false);
      },
    });

    streamCleanupRef.current = cleanup;
  }, [inputValue, selectedPerson, sending, error]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const rightColumnPersons = individuals.filter((p) => p.id !== selectedPerson?.id).slice(0, 5);
  const rightColumnVisible = !!selectedPerson && !sidebarOpen;

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* ════════════════════════════════════════════
          Left standing column — ABSOLUTE overlay
          ════════════════════════════════════════════ */}
      {rightColumnVisible && rightColumnPersons.length > 0 && (
        <div className="absolute left-0 top-0 bottom-0 w-28 flex flex-col items-center gap-4 pt-6 overflow-y-auto z-10 bg-paper shrink-0">
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
          Main — full width, globally centered
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
        ) : loading ? (
          /* ── Loading ── */
          <div className="flex-1 flex items-center justify-center">
            <p className="font-hand text-lg text-oxblood/30 animate-pulse">加载中...</p>
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
                    ) : msg.type === 'image' ? (
                      /* ── Image message — left with avatar + name ── */
                      <div key={msg.id} className="flex justify-start">
                        <div className="max-w-[75%]">
                          <div className="flex items-center gap-2 mb-2">
                            <AvatarIcon id={selectedPerson.avatar} size={24} />
                            <span className="font-hand text-sm text-oxblood">{selectedPerson.name}</span>
                          </div>
                          <div className="relative group">
                            <img
                              src={msg.content}
                              alt="生成的图片"
                              className="max-h-64 w-auto rounded-lg"
                              style={{ filter: 'url(#tremble)' }}
                            />
                            <button
                              onClick={() => saveImage(msg.content)}
                              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-black/40 hover:bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              aria-label="下载图片"
                              type="button"
                            >
                              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" aria-hidden="true">
                                <path d="M 2 12 L 2 14 L 14 14 L 14 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M 8 2 L 8 10 M 4 6 L 8 10 L 12 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </div>
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

            {/* ── Error toast ── */}
            {error && (
              <div className="max-w-3xl mx-auto pb-1">
                <p className="font-mono text-xs text-red-500/70 text-center animate-pulse">{error}</p>
              </div>
            )}

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
