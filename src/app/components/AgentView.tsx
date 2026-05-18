'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { AvatarIcon } from './AvatarIcon';
import AgentRolePicker from './AgentRolePicker';
import ReActTrace from './ReActTrace';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  listAgentMessages,
  sendAgentTask,
  stopAgentTask,
  listTrustedPaths,
  addTrustedPath,
} from '@/lib/api';

interface AgentViewProps {
  agentRole: any | null;
  onAgentRoleChange: (role: any | null) => void;
  sessions: any[];
  activeSessionId: string | null;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onSessionsRefresh: () => void;
  onRequestSidebarOpen?: () => void;
}

export default function AgentView({
  agentRole, onAgentRoleChange,
  sessions, activeSessionId, onCreateSession, onDeleteSession, onSelectSession, onSessionsRefresh,
  onRequestSidebarOpen,
}: AgentViewProps) {
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  // Messages for active session
  const [sessionMessages, setSessionMessages] = useState<any[]>([]);

  // Agent state
  const [inputValue, setInputValue] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<string>('');
  const [currentTrace, setCurrentTrace] = useState<any[]>([]);

  // Refs
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  // ── Load messages when session changes ──
  useEffect(() => {
    if (activeSessionId) {
      listAgentMessages(activeSessionId).then(setSessionMessages).catch(() => setSessionMessages([]));
    } else {
      setSessionMessages([]);
    }
  }, [activeSessionId]);

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionMessages, currentResult]);

  // ── Cleanup ──
  useEffect(() => {
    return () => streamCleanupRef.current?.();
  }, []);

  // ── Open role picker if no role selected on mount ──
  useEffect(() => {
    if (!agentRole) {
      setRolePickerOpen(true);
    }
  }, [agentRole]);

  // ── Session management (handled by PageShell) ──
  // Props: sessions, activeSessionId, onCreateSession, onDeleteSession, onSelectSession

  // ── Send agent task ──
  const handleSend = useCallback(() => {
    const content = inputValue.trim();
    if (!content || !agentRole || !activeSessionId || isRunning) return;

    setInputValue('');
    if (inputRef.current) inputRef.current.style.height = '';

    setError(null);
    setCurrentResult('');
    setCurrentTrace([]);
    setIsRunning(true);
    setProgress('正在思考...');

    // Add user message to display
    const userMsgId = 'user-' + Date.now();
    setSessionMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content, type: 'text' },
    ]);

    streamCleanupRef.current?.();

    const cleanup = sendAgentTask(
      { sessionId: activeSessionId, roleId: agentRole.id, content },
      {
        onProgress: (data) => {
          setProgress(data.message || '');
        },
        onTrace: (data) => {
          setCurrentTrace((prev) => {
            const newTrace = [...prev];
            if (data.type === 'thought') {
              newTrace.push({ step: data.step, type: 'thought', content: data.content });
            } else if (data.type === 'tool_result') {
              newTrace.push({ step: data.step, type: 'tool_use', name: data.name, input: data.input, output: data.output });
            }
            return newTrace;
          });
        },
        onDone: (data) => {
          setIsRunning(false);
          setProgress('');
          setCurrentResult(data.result || '');
          setCurrentTrace(data.trace || []);
          setSessionMessages((prev) => [
            ...prev,
            { id: 'agent-' + Date.now(), role: 'assistant', content: data.result, type: 'text' },
          ]);
          // Refresh sessions list for updated title
          onSessionsRefresh();
        },
        onError: (data) => {
          setIsRunning(false);
          setProgress('');
          setError(data.error || '执行失败');
        },
      },
    );

    streamCleanupRef.current = cleanup;
  }, [inputValue, agentRole, activeSessionId, isRunning]);

  const handleStop = useCallback(() => {
    if (activeSessionId) {
      stopAgentTask(activeSessionId);
      setIsRunning(false);
    }
  }, [activeSessionId]);

  const COMMANDS = [
    { cmd: '/trust', desc: '查看信任路径' },
    { cmd: '/trust add <path>', desc: '添加信任路径' },
    { cmd: '/tool', desc: '查看可用工具列表' },
    { cmd: '/help', desc: '显示此帮助' },
  ];

  const TOOL_LIST_TEXT = `可用工具:

  read_file  读取文件内容
             参数: path (必需), limit (可选)

  write_file 写入文件（覆盖已有内容，自动创建父目录）
             参数: path (必需), content (必需)

  edit_file  替换文件中首次出现的文本（精确匹配）
             参数: path (必需), old_text (必需), new_text (必需)

  web_fetch  获取网页内容（Readability + Markdown）
             参数: url (必需)
             说明: 获取 URL 的正文内容，转为 Markdown。适合新闻/文章/文档类页面

  web_search 搜索互联网实时信息
             参数: query (必需), count (可选, 1-10, 默认 5)
             说明: 返回搜索结果含摘要和链接。需在 .env 中配置 TAVILY_API_KEY`;

  // Helper: show command result as a pair of chat messages
  const showCommandResult = useCallback((cmdText: string, resultText: string) => {
    setSessionMessages((prev) => [
      ...prev,
      { id: 'cmd-' + Date.now(), role: 'user', content: cmdText, type: 'text' },
      { id: 'cmd-res-' + Date.now(), role: 'assistant', content: resultText, type: 'text' },
    ]);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const trimmed = inputValue.trim();

    // Tab: accept suggestion
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      setInputValue(inputValue + suggestion);
      setSuggestion('');
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();

      // ── In-agent commands ──
      if (trimmed.startsWith('/')) {
        setInputValue('');
        if (inputRef.current) inputRef.current.style.height = '';

        if (trimmed === '/trust') {
          listTrustedPaths().then((res) => {
            const paths = res.paths || [];
            const text = paths.length === 0
              ? '没有配置信任路径'
              : `信任路径 (${paths.length}):\n${paths.map((p: string) => `  ${p}`).join('\n')}`;
            showCommandResult(trimmed, text);
          }).catch(() => {
            showCommandResult(trimmed, '获取信任路径失败');
          });
        } else if (trimmed.startsWith('/trust add ')) {
          const path = trimmed.slice('/trust add '.length).trim();
          if (!path) {
            showCommandResult(trimmed, '用法: /trust add <path>');
          } else {
            addTrustedPath(path).then(() => {
              showCommandResult(trimmed, `已添加信任路径:\n  ${path}`);
            }).catch(() => {
              showCommandResult(trimmed, '添加信任路径失败');
            });
          }
        } else if (trimmed === '/tool') {
          showCommandResult(trimmed, TOOL_LIST_TEXT);
        } else if (trimmed === '/help') {
          showCommandResult(trimmed, '可用命令:\n' + COMMANDS.map((c) => `  ${c.cmd.padEnd(22)}${c.desc}`).join('\n'));
        } else {
          showCommandResult(trimmed, `未知命令: ${trimmed}，输入 /help 查看可用命令`);
        }
        return;
      }

      handleSend();
    }
  }, [handleSend, inputValue, showCommandResult, suggestion]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = '0';
    el.style.height = Math.min(el.scrollHeight, 24 * 7 + 28) + 'px';
    const val = el.value;
    setInputValue(val);

    // Compute command suggestion
    const t = val.trim();
    if (t.startsWith('/') && t.length > 0 && !t.includes(' ')) {
      const match = COMMANDS.find((c) => c.cmd.startsWith(t) && c.cmd !== t);
      setSuggestion(match ? match.cmd.split(' ')[0].slice(t.length) : '');
    } else {
      setSuggestion('');
    }
  }, []);

  // If no role selected, show picker trigger
  if (!agentRole) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="font-hand text-lg text-[#2C2C2C]/40 mb-4">请选择一个角色作为 Agent</p>
          <button
            onClick={() => setRolePickerOpen(true)}
            className="font-mono text-sm text-[#2C2C2C]/60 hover:text-[#2C2C2C] border border-[#2C2C2C]/20 hover:border-[#2C2C2C]/50 px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            选择角色
          </button>
          <AgentRolePicker
            isOpen={rolePickerOpen}
            onClose={() => setRolePickerOpen(false)}
            onSelect={(r) => {
              onAgentRoleChange(r);
              setRolePickerOpen(false);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ════════════════════════════════════════════
          Main Chat Area
          ════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 px-6">
        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto thin-scroll pt-8 pb-4">
          <div className="max-w-2xl mx-auto space-y-6">
            {sessionMessages.length === 0 && !currentResult && !isRunning ? (
              <div className="flex flex-col items-center justify-center pt-16">
                <span className="font-hand text-4xl text-[#2C2C2C]/30 select-none" style={{ filter: 'url(#charcoal)' }}>
                  OpenRise
                </span>
                <p className="font-mono text-sm text-[#2C2C2C]/20 mt-2 select-none">
                  Agent · {agentRole.name}
                </p>
              </div>
            ) : (
              sessionMessages.map((msg, idx) => {
                const isLastAssistant = !isRunning && currentResult && idx === sessionMessages.length - 1 && msg.role === 'assistant';
                return msg.role === 'user' ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[75%]">
                      <p className="font-mono text-sm text-[#2C2C2C] leading-relaxed whitespace-pre-wrap px-4 py-2.5 bg-paper border border-[#2C2C2C] rounded-xl">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="flex justify-start">
                    <div className="max-w-[90%]">
                      <div className="flex items-center gap-2 mb-2">
                        <AvatarIcon id={agentRole.avatar} size={24} />
                        <span className="font-hand text-sm text-[#2C2C2C]">{agentRole.name}</span>
                      </div>
                      <div className="markdown-content ml-6">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {isLastAssistant ? currentResult : msg.content}
                            </ReactMarkdown>
                        {isLastAssistant && currentTrace.length > 0 && (
                          <ReActTrace trace={currentTrace} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Current running state */}
            {isRunning && (
              <div className="flex justify-start">
                <div className="max-w-[90%]">
                  <div className="flex items-center gap-2 mb-2">
                    <AvatarIcon id={agentRole.avatar} size={24} />
                    <span className="font-hand text-sm text-[#2C2C2C]">{agentRole.name}</span>
                  </div>
                  <div className="ml-6">
                    {progress && (
                      <p className="font-mono text-xs text-[#2C2C2C]/50 animate-pulse mb-2">{progress}</p>
                    )}
                    {currentTrace.length > 0 && (
                      <div className="border-l-2 border-[#2C2C2C]/10 pl-2">
                        {currentTrace.slice(-3).map((t: any, i: number) => (
                          <p key={i} className="font-mono text-xs text-[#2C2C2C]/40">
                            {t.type === 'thought' ? '🤔 思考中...' : `🛠 ${t.name}...`}
                          </p>
                        ))}
                        {currentTrace.length > 3 && (
                          <p className="font-mono text-xs text-[#2C2C2C]/30">+{currentTrace.length - 3} 步</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="max-w-3xl mx-auto pb-1">
            <p className="font-mono text-xs text-red-500/70 text-center animate-pulse">{error}</p>
          </div>
        )}

        {/* ── Input / Stop ── */}
        <div className="pb-9 pt-1">
          <div className="max-w-3xl mx-auto">
            {isRunning ? (
              <div className="flex justify-center">
                <button
                  onClick={handleStop}
                  className="font-mono text-sm text-[#2C2C2C]/60 hover:text-[#2C2C2C] border border-[#2C2C2C]/20 hover:border-[#2C2C2C]/50 px-6 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  停止
                </button>
              </div>
            ) : (
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
                {/* Suggestion overlay */}
                {suggestion && (
                  <div
                    className="absolute top-0 left-0 w-full h-full pointer-events-none font-mono text-base px-5 py-3.5 overflow-hidden"
                    style={{ lineHeight: '24px', zIndex: 2, color: 'transparent' }}
                    aria-hidden="true"
                  >
                    <span style={{ color: 'transparent' }}>{inputValue}</span>
                    <span className="text-[#2C2C2C]/20">{suggestion}</span>
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder={activeSessionId ? '描述任务...' : '请先新建或选择一个会话...'}
                  disabled={!activeSessionId}
                  className="relative w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-[#2C2C2C] placeholder-[#2C2C2C]/30 caret-[#2C2C2C] resize-none overflow-y-auto thin-scroll px-5 py-3.5"
                  style={{ lineHeight: '24px', maxHeight: '196px', zIndex: 3 }}
                  autoComplete="off"
                />
                {!activeSessionId && onRequestSidebarOpen && (
                  <div
                    className="absolute inset-0 cursor-pointer"
                    style={{ zIndex: 10 }}
                    onClick={() => onRequestSidebarOpen?.()}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Role picker accessible when clicking role name in top bar */}
      <AgentRolePicker
        isOpen={rolePickerOpen}
        onClose={() => setRolePickerOpen(false)}
        onSelect={(r) => {
          onAgentRoleChange(r);
          setRolePickerOpen(false);
          setCurrentResult('');
          setCurrentTrace([]);
        }}
      />
    </div>
  );
}
