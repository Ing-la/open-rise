'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DebateSetupModal from './DebateSetupModal';
import { AvatarIcon } from './AvatarIcon';
import { listRoles, createDebate, stepDebate, subscribeDebate, stopDebate, listDebates, getDebate, resumeDebate, aggregateDebate } from '@/lib/api';

// ── Types ──
type PageMode = 'idle' | 'active' | 'finished';

interface DebaterInfo {
  roleId: string;
  roleName: string;
  avatar?: string;
  side: 'pro' | 'con';
  positionLabel: string; // 一辩/二辩/三辩/四辩
  status: 'waiting' | 'speaking' | 'done';
}

interface SpeechEntry {
  roleId: string;
  roleName: string;
  avatar?: string;
  side: 'pro' | 'con' | 'judge';
  position: string;
  phase: string;
  content: string;
  charsUsed: number;
  charBudget: number;
  isStreaming: boolean;
}

const PHASE_ORDER = ['立论', '驳论', '对辩', '自由辩论', '总结', '裁判评判'];
const PHASE_LABELS: Record<string, string> = {
  '立论': '立论陈词',
  '驳论': '驳论阶段',
  '对辩': '对辩阶段',
  '自由辩论': '自由辩论',
  '总结': '总结陈词',
  '裁判评判': '裁判评判',
};
const CROSS_FREE_PHASES = ['对辩', '自由辩论'];

interface JudgeRow { debater: string; content: number; logic: number; expression: number; rebuttal: number; total: number; comment: string; }

// ══════════════════════════════════════════════════════════════════
//  Sub-components
// ══════════════════════════════════════════════════════════════════

function DebaterAvatar({ debater, isSpeaking }: { debater: DebaterInfo; isSpeaking: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative rounded-full">
        <AvatarIcon id={debater.avatar ?? ''} size={40} />
      </div>
      <span className="font-hand text-lg text-[#2C2C2C] text-center leading-tight">{debater.roleName}</span>
      <span className="font-mono text-sm text-[#2C2C2C]/40">{debater.positionLabel}</span>
    </div>
  );
}

function parseJudgeTable(markdown: string): JudgeRow[] {
  const lines = markdown.split('\n');
  const headerIdx = lines.findIndex(l => /^\|/.test(l.trim()) && l.includes('辩手'));
  if (headerIdx < 0) return [];
  const tableLines = lines.slice(headerIdx + 1).filter(l => /^\|/.test(l.trim()) && !l.includes('---'));
  const rows: JudgeRow[] = [];
  for (const line of tableLines) {
    const parts = line.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length < 7) continue;
    rows.push({
      debater: parts[0],
      content: parseInt(parts[1]) || 0,
      logic: parseInt(parts[2]) || 0,
      expression: parseInt(parts[3]) || 0,
      rebuttal: parseInt(parts[4]) || 0,
      total: parseFloat(parts[5]) || 0,
      comment: parts[6] || '',
    });
  }
  return rows;
}

function SpeechBubble({ speech }: { speech: SpeechEntry }) {
  const isPro = speech.side === 'pro';
  const isJudge = speech.side === 'judge';
  const showChars = CROSS_FREE_PHASES.includes(speech.phase);

  if (isJudge) {
    // Parse the markdown table into structured rows for compact card view
    const rows = !speech.isStreaming ? parseJudgeTable(speech.content) : [];

    return (
      <div className="flex flex-col items-center max-w-[90%] mx-auto">
        <span className="font-hand text-lg text-[#2C2C2C]/60 mb-2">
          {speech.roleName || '裁判评判'}
          {speech.isStreaming && (
            <span className="inline-flex items-center ml-2 gap-1">
              <span className="w-2 h-2 rounded-full bg-[#FF4B4B] animate-stream-dot" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-[#FF8C42] animate-stream-dot" style={{ animationDelay: '333ms' }} />
              <span className="w-2 h-2 rounded-full bg-[#9B59B6] animate-stream-dot" style={{ animationDelay: '666ms' }} />
            </span>
          )}
        </span>
        <div className="w-full p-4 rounded-xl bg-[#2C2C2C]/4">
          {speech.isStreaming ? (
            <span className="inline-block w-[2px] h-[1em] bg-[#2C2C2C]/60 animate-pulse align-middle" />
          ) : rows.length > 0 ? (
            <div className="space-y-4">
              {rows.map((row, i) => (
                <div key={i} className="border-b border-[#2C2C2C]/5 pb-3 last:border-b-0">
                  <p className="font-hand text-base text-[#2C2C2C]">{row.debater}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="text-sm px-2 py-0.5 rounded bg-[#2C2C2C]/8 text-[#2C2C2C]/70">内容 {row.content}</span>
                    <span className="text-sm px-2 py-0.5 rounded bg-[#2C2C2C]/8 text-[#2C2C2C]/70">逻辑 {row.logic}</span>
                    <span className="text-sm px-2 py-0.5 rounded bg-[#2C2C2C]/8 text-[#2C2C2C]/70">表达 {row.expression}</span>
                    <span className="text-sm px-2 py-0.5 rounded bg-[#2C2C2C]/8 text-[#2C2C2C]/70">反驳 {row.rebuttal}</span>
                    <span className="text-sm px-3 py-0.5 rounded bg-[#2C2C2C]/15 text-[#2C2C2C] font-bold">{row.total.toFixed(2)}</span>
                  </div>
                  {row.comment && (
                    <p className="font-mono text-lg text-[#2C2C2C]/80 mt-1.5" title={row.comment}>{row.comment}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="prose prose-sm max-w-none font-mono text-lg text-[#2C2C2C]/80 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{speech.content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 max-w-[80%] ${isPro ? '' : 'ml-auto flex-row-reverse'}`}>
      <AvatarIcon id={speech.avatar ?? ''} size={36} />
      <div className="min-w-0 flex-1">
        <span className={`block font-hand text-lg text-[#2C2C2C] mb-1 ${isPro ? '' : 'text-right'}`}>
          {isPro ? (
            <>
              {speech.roleName || '正方'} · {speech.position}
              {speech.isStreaming && (
                <span className="inline-flex items-center ml-2 gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#FF4B4B] animate-stream-dot" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-[#FF8C42] animate-stream-dot" style={{ animationDelay: '333ms' }} />
                  <span className="w-2 h-2 rounded-full bg-[#9B59B6] animate-stream-dot" style={{ animationDelay: '666ms' }} />
                </span>
              )}
            </>
          ) : (
            <>
              {speech.isStreaming && (
                <span className="inline-flex items-center mr-2 gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#FF4B4B] animate-stream-dot" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-[#FF8C42] animate-stream-dot" style={{ animationDelay: '333ms' }} />
                  <span className="w-2 h-2 rounded-full bg-[#9B59B6] animate-stream-dot" style={{ animationDelay: '666ms' }} />
                </span>
              )}
              {speech.roleName || '反方'} · {speech.position}
            </>
          )}
        </span>
        <div className={`p-4 rounded-xl ${speech.isStreaming ? 'bg-[#2C2C2C]/8 ring-1 ring-[#2C2C2C]/15' : 'bg-[#2C2C2C]/4'}`}>
          <div className="prose prose-sm max-w-none font-mono text-lg text-[#2C2C2C]/80 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{speech.content}</ReactMarkdown>
            {speech.isStreaming && (
              <span className="inline-block w-[2px] h-[1em] bg-[#2C2C2C]/60 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        </div>
        {showChars && speech.charsUsed > 0 && !speech.isStreaming && (
          <p className={`font-mono text-xs text-[#2C2C2C]/25 mt-1 ${isPro ? '' : 'text-right'}`}>
            已使用 {speech.charsUsed}/{speech.charBudget} 字
          </p>
        )}
      </div>
    </div>
  );
}

function PromptModal({ system, user, tacticSystem, tacticUser, onClose }: {
  system: string; user: string; tacticSystem?: string; tacticUser?: string; onClose: () => void;
}) {
  const [tacticOpen, setTacticOpen] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="本轮输入"
    >
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-[90vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2C2C2C]/10">
          <span className="font-hand text-base text-[#2C2C2C]">本轮 LLM 输入</span>
          <button onClick={onClose} className="font-mono text-sm text-[#2C2C2C]/40 hover:text-[#2C2C2C]/70 cursor-pointer">✕ 关闭</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4 thin-scroll">
          {tacticSystem && tacticUser && (
            <div className="border border-[#2C2C2C]/15 rounded-lg overflow-hidden">
              <button
                onClick={() => setTacticOpen(!tacticOpen)}
                className="w-full flex items-center justify-between px-4 py-2 bg-[#F2F2EE] hover:bg-[#2C2C2C]/5 transition-colors cursor-pointer text-left"
              >
                <span className="font-hand text-sm text-[#2C2C2C]/70">战术分析 Prompt（预调用）</span>
                <span className={`transform transition-transform duration-200 ${tacticOpen ? 'rotate-180' : ''} text-[#2C2C2C]/40`}>▾</span>
              </button>
              {tacticOpen && (
                <div className="p-4 space-y-3">
                  <div>
                    <p className="font-hand text-xs text-[#2C2C2C]/50 mb-1">System Prompt</p>
                    <pre className="font-mono text-sm text-[#2C2C2C]/80 bg-[#F2F2EE] p-3 rounded-lg whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{tacticSystem}</pre>
                  </div>
                  <div>
                    <p className="font-hand text-xs text-[#2C2C2C]/50 mb-1">User Message</p>
                    <pre className="font-mono text-sm text-[#2C2C2C]/80 bg-[#F2F2EE] p-3 rounded-lg whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{tacticUser}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
          <div>
            <p className="font-hand text-sm text-[#2C2C2C]/60 mb-1">System Prompt</p>
            <pre className="font-mono text-sm text-[#2C2C2C]/80 bg-[#F2F2EE] p-3 rounded-lg whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">{system}</pre>
          </div>
          <div>
            <p className="font-hand text-sm text-[#2C2C2C]/60 mb-1">User Message</p>
            <pre className="font-mono text-sm text-[#2C2C2C]/80 bg-[#F2F2EE] p-3 rounded-lg whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">{user}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Main Component
// ══════════════════════════════════════════════════════════════════
export default function DebateView({ onPhaseInfo }: { onPhaseInfo?: (info: { currentPhase: string; roundIndex: number }) => void }) {
  const [pageMode, setPageMode] = useState<PageMode>('idle');
  const [setupOpen, setSetupOpen] = useState(false);
  const [debateId, setDebateId] = useState('');
  const [proTopic, setProTopic] = useState('');
  const [conTopic, setConTopic] = useState('');
  const [proDebaters, setProDebaters] = useState<DebaterInfo[]>([]);
  const [conDebaters, setConDebaters] = useState<DebaterInfo[]>([]);
  const [judgeName, setJudgeName] = useState('');
  const [speeches, setSpeeches] = useState<SpeechEntry[]>([]);
  const [currentPhase, setCurrentPhase] = useState('');
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [winner, setWinner] = useState<'pro' | 'con' | null>(null);
  const [isStepping, setIsStepping] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [latestPrompt, setLatestPrompt] = useState<{ system: string; user: string; tacticSystem?: string; tacticUser?: string } | null>(null);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [debateList, setDebateList] = useState<any[]>([]);
  const [judgingPhase2Ready, setJudgingPhase2Ready] = useState(false);
  const [judgingTotal, setJudgingTotal] = useState(0);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [debateError, setDebateError] = useState<string | null>(null);
  const [debateResult, setDebateResult] = useState<{ proTotal: number; conTotal: number; bestPro?: number; bestCon?: number; overallBest?: number } | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const streamingAccum = useRef('');
  const cleanupRef = useRef<(() => void) | null>(null);
  const streamingSpeechIdx = useRef(-1);

  // ── Auto-scroll ──
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [speeches]);

  // ── Load history on idle ──
  useEffect(() => {
    if (pageMode === 'idle') {
      listDebates().then(setDebateList).catch(() => setDebateList([]));
    }
  }, [pageMode]);

  // ── Report phase info to PageShell for top bar ──
  useEffect(() => {
    if (pageMode === 'active' && onPhaseInfo) {
      onPhaseInfo({ currentPhase, roundIndex });
    } else if (pageMode !== 'active' && onPhaseInfo) {
      onPhaseInfo({ currentPhase: '', roundIndex: 0 });
    }
  }, [pageMode, currentPhase, roundIndex, onPhaseInfo]);

  // ── Cleanup listeners on unmount ──
  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  // ── Subscribe to debate events ──
  const subscribe = useCallback((callbacks: {
    onDelta: (data: any) => void;
    onPrompt: (data: any) => void;
    onRoundDone: (data: any) => void;
    onDone: (data: any) => void;
    onError: (data: any) => void;
    onJudgingDone: (data: any) => void;
  }) => {
    cleanupRef.current?.();
    const unsub = subscribeDebate({
      onDelta: callbacks.onDelta,
      onPrompt: callbacks.onPrompt,
      onRoundDone: callbacks.onRoundDone,
      onDone: callbacks.onDone,
      onError: callbacks.onError,
      onJudgingDone: callbacks.onJudgingDone,
    });
    cleanupRef.current = unsub;
  }, []);

  // ── Create debate from setup ──
  const handleSetupStart = useCallback(async (params: any) => {
    try {
      const { debateId: id } = await createDebate({
        proTopic: params.proTopic,
        conTopic: params.conTopic,
        background: params.background,
        proRoles: [params.pro1, params.pro2, params.pro3, params.pro4],
        conRoles: [params.con1, params.con2, params.con3, params.con4],
        judgeBrainId: params.judge,
        debugMode: params.debugMode,
      });

      if (!id) throw new Error('创建辩论失败');

      // Load role names
      const roles = await listRoles();
      const roleMap = new Map(roles.map((r: any) => [r.id, r.name]));
      const avatarMap = new Map(roles.map((r: any) => [r.id, r.avatar]));

      setDebateId(id);
      setProTopic(params.proTopic);
      setConTopic(params.conTopic);
      setDebugMode(!!params.debugMode);
      setCurrentPhase('立论');
      setRoundIndex(0);
      setSpeeches([]);
      setWinner(null);
      setCurrentSpeakerId(null);
      setLatestPrompt(null);
      streamingAccum.current = '';
      streamingSpeechIdx.current = -1;

      setProDebaters([
        { roleId: params.pro1, roleName: roleMap.get(params.pro1) || '', avatar: avatarMap.get(params.pro1), side: 'pro', positionLabel: '一辩', status: 'waiting' },
        { roleId: params.pro2, roleName: roleMap.get(params.pro2) || '', avatar: avatarMap.get(params.pro2), side: 'pro', positionLabel: '二辩', status: 'waiting' },
        { roleId: params.pro3, roleName: roleMap.get(params.pro3) || '', avatar: avatarMap.get(params.pro3), side: 'pro', positionLabel: '三辩', status: 'waiting' },
        { roleId: params.pro4, roleName: roleMap.get(params.pro4) || '', avatar: avatarMap.get(params.pro4), side: 'pro', positionLabel: '四辩', status: 'waiting' },
      ]);
      setConDebaters([
        { roleId: params.con1, roleName: roleMap.get(params.con1) || '', avatar: avatarMap.get(params.con1), side: 'con', positionLabel: '一辩', status: 'waiting' },
        { roleId: params.con2, roleName: roleMap.get(params.con2) || '', avatar: avatarMap.get(params.con2), side: 'con', positionLabel: '二辩', status: 'waiting' },
        { roleId: params.con3, roleName: roleMap.get(params.con3) || '', avatar: avatarMap.get(params.con3), side: 'con', positionLabel: '三辩', status: 'waiting' },
        { roleId: params.con4, roleName: roleMap.get(params.con4) || '', avatar: avatarMap.get(params.con4), side: 'con', positionLabel: '四辩', status: 'waiting' },
      ]);
      setJudgeName('裁判');
      setPageMode('active');

      // Subscribe to events
      const phaseMap: Record<string, string> = {
        opening: '立论', rebuttal: '驳论', cross: '对辩', free: '自由辩论', closing: '总结', judging: '裁判评判',
      };
      subscribe({
        onDelta: (data) => {
          if (data.isFirst) {
            // Create new speech entry
            streamingAccum.current = '';
            streamingSpeechIdx.current = -1;
            const entry: SpeechEntry = {
              roleId: data.roleId,
              roleName: data.roleName || '',
              avatar: avatarMap.get(data.roleId) || undefined,
              side: data.side || 'judge',
              position: data.position ? (data.side === 'judge' ? '裁判' : ['', '一辩', '二辩', '三辩', '四辩'][data.position] || '') : '裁判',
              phase: phaseMap[data.phase] || data.phase || '裁判评判',
              content: '',
              charsUsed: 0,
              charBudget: 0,
              isStreaming: true,
            };
            setSpeeches(prev => {
              streamingSpeechIdx.current = prev.length;
              return [...prev, entry];
            });
            setCurrentSpeakerId(data.roleId);
            setCurrentPhase(phaseMap[data.phase] || data.phase || '裁判评判');
            // Update debater status
            const markSpeaking = (d: DebaterInfo) => ({ ...d, status: (d.roleId === data.roleId ? 'speaking' : d.status) as DebaterInfo['status'] });
            setProDebaters(prev => prev.map(markSpeaking));
            setConDebaters(prev => prev.map(markSpeaking));
          } else if (data.content) {
            streamingAccum.current += data.content;
            setSpeeches(prev => {
              const idx = streamingSpeechIdx.current;
              if (idx < 0 || idx >= prev.length) return prev;
              const copy = [...prev];
              copy[idx] = { ...copy[idx], content: streamingAccum.current };
              return copy;
            });
          }
        },
        onPrompt: (data) => {
          setLatestPrompt(data);
        },
        onRoundDone: (data) => {
          // Finalize speech
          setSpeeches(prev => {
            const idx = streamingSpeechIdx.current;
            if (idx < 0 || idx >= prev.length) return prev;
            const copy = [...prev];
            const isCrossFree = CROSS_FREE_PHASES.includes(data.label || data.phase || '');
            const sideCumulative = data.side === 'pro' ? (data.sideCharsPro || 0) : (data.sideCharsCon || 0);
            copy[idx] = {
              ...copy[idx],
              content: data.content || copy[idx].content,
              charsUsed: isCrossFree ? sideCumulative : (data.charsUsed || 0),
              charBudget: data.charBudget || 0,
              isStreaming: false,
            };
            return copy;
          });

          setRoundIndex(data.roundIndex || 0);
          setCurrentPhase(data.label || data.phase || '');

          // Update debater status to done
          const markDone = (d: DebaterInfo) => d.roleId === data.roleId && d.side === data.side
            ? { ...d, status: 'done' as DebaterInfo['status'] }
            : d;
          setProDebaters(prev => prev.map(markDone));
          setConDebaters(prev => prev.map(markDone));
          setCurrentSpeakerId(null);

          // Enable step button (skip judging — judging_done handles it)
          if (data.phase !== 'judging') setIsStepping(false);
        },
        onJudgingDone: (data) => {
          setJudgingPhase2Ready(true);
          setJudgingTotal(data.personaCount || 0);
          setIsStepping(false);
        },
        onDone: (data) => {
          setWinner(data.winner as 'pro' | 'con');
          setPageMode('finished');
          setCurrentSpeakerId(null);
          setIsStepping(false);
          cleanupRef.current = null;
        },
        onError: (data) => {
          console.error('[Debate Error]', data.error);
          setDebateError(data.error || '未知错误');
          setIsStepping(false);
          cleanupRef.current = null;
        },
      });
    } catch (err) {
      console.error('[Debate Create]', err);
    }
  }, [subscribe]);

  // ── Aggregate judging ──
  const handleAggregate = useCallback(async () => {
    if (!debateId) return;
    try {
      const result = await aggregateDebate(debateId);
      if (result.winner) setWinner(result.winner as 'pro' | 'con');
      setDebateResult({ proTotal: result.proTotal, conTotal: result.conTotal, bestPro: result.bestPro, bestCon: result.bestCon, overallBest: result.overallBest });
      setPageMode('finished');
      setCurrentSpeakerId(null);
      setIsStepping(false);
    } catch (err) {
      console.error('[Debate Aggregate]', err);
      setDebateError(err instanceof Error ? err.message : '聚合评分失败');
      setIsStepping(false);
    }
  }, [debateId]);

  // ── Step (next round) ──
  const handleStep = useCallback(() => {
    if (!debateId || isStepping) return;
    if (judgingPhase2Ready) {
      handleAggregate();
      return;
    }
    setDebateError(null);
    setIsStepping(true);
    stepDebate(debateId);
  }, [debateId, isStepping, judgingPhase2Ready, handleAggregate]);

  // ── Return to idle ──
  const handleReturnHome = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    stopDebate();
    setPageMode('idle');
    setDebateId('');
    setProTopic('');
    setConTopic('');
    setProDebaters([]);
    setConDebaters([]);
    setJudgeName('');
    setSpeeches([]);
    setCurrentPhase('');
    setCurrentSpeakerId(null);
    setRoundIndex(0);
    setWinner(null);
    setDebugMode(false);
    setLatestPrompt(null);
    setPromptModalOpen(false);
    setIsStepping(false);
    setJudgingPhase2Ready(false);
    setJudgingTotal(0);
    setDebateError(null);
    setDebateResult(null);
  }, []);

  // ── View history (or resume ongoing) ──
  const handleViewHistory = useCallback(async (id: string) => {
    try {
      const debate = await getDebate(id);
      if (!debate) return;

      const posNames = ['', '一辩', '二辩', '三辩', '四辩'];
      const phaseMap: Record<string, string> = {
        opening: '立论', rebuttal: '驳论', cross: '对辩', free: '自由辩论', closing: '总结', judging: '裁判评判',
      };

      const proPos = debate.positions.filter((p: any) => p.side === 'pro').sort((a: any, b: any) => a.position - b.position);
      const conPos = debate.positions.filter((p: any) => p.side === 'con').sort((a: any, b: any) => a.position - b.position);

      const roles = await listRoles();
      const nameMap = new Map(roles.map((r: any) => [r.id, r.name]));
      const avatarMap = new Map(roles.map((r: any) => [r.id, r.avatar]));

      setDebateId(id);
      setProTopic(debate.proTopic || '');
      setConTopic(debate.conTopic || '');

      setProDebaters(proPos.map((p: any) => ({
        roleId: p.roleId, roleName: nameMap.get(p.roleId) || '', avatar: avatarMap.get(p.roleId),
        side: 'pro' as const, positionLabel: posNames[p.position] || '', status: 'done' as DebaterInfo['status'],
      })));
      setConDebaters(conPos.map((p: any) => ({
        roleId: p.roleId, roleName: nameMap.get(p.roleId) || '', avatar: avatarMap.get(p.roleId),
        side: 'con' as const, positionLabel: posNames[p.position] || '', status: 'done' as DebaterInfo['status'],
      })));
      setJudgeName(nameMap.get(debate.positions.find((p: any) => p.side === 'judge')?.roleId || '') || debate.positions.find((p: any) => p.side === 'judge')?.brainId ? '裁判' : '');

      const sidebarPhases = new Set(['cross', 'free']);
      let lastPhase = '';
      let sidePhaseChars = { pro: 0, con: 0 };
      const speechesData = debate.messages.map((m: any) => {
        const isCrossFree = sidebarPhases.has(m.round);
        if (isCrossFree && m.round !== lastPhase) {
          sidePhaseChars = { pro: 0, con: 0 };
          lastPhase = m.round;
        }
        if (isCrossFree && (m.side === 'pro' || m.side === 'con')) {
          const s = m.side as 'pro' | 'con';
          sidePhaseChars[s] += (m.charCount || m.content.length || 0);
        }
        return {
          roleId: m.roleId, roleName: nameMap.get(m.roleId) || '', avatar: avatarMap.get(m.roleId),
          side: m.side as SpeechEntry['side'],
          position: m.side === 'judge' ? '裁判' : posNames[m.position] || '',
          phase: phaseMap[m.round] || m.round,
          content: m.content,
          charsUsed: isCrossFree && (m.side === 'pro' || m.side === 'con') ? sidePhaseChars[m.side as 'pro' | 'con'] : (m.charCount || m.content.length || 0),
          charBudget: sidebarPhases.has(m.round) ? (m.round === 'cross' ? 300 : 800) : 0,
          isStreaming: false,
        };
      });

      // ── Ongoing → resume ──
      if (debate.status === 'ongoing') {
        try {
          await resumeDebate({ debateId: id, debugMode: !!debate.debugMode });
        } catch {
          // If resume fails (e.g. backend doesn't have the new handler yet),
          // just show as finished
          setWinner(null);
          setCurrentPhase('裁判评判');
          setCurrentSpeakerId(null);
          setRoundIndex(debate.messages.length);
          setSpeeches(speechesData);
          setPageMode('finished');
          return;
        }

        setWinner(null);
        streamingAccum.current = '';
        streamingSpeechIdx.current = -1;
        setSpeeches(speechesData);
        setDebugMode(!!debate.debugMode);
        setPageMode('active');

        // Re-subscribe for step events
        const resumePhaseMap = phaseMap;
        subscribe({
          onDelta: (data) => {
            if (data.isFirst) {
              streamingAccum.current = '';
              streamingSpeechIdx.current = -1;
              const entry: SpeechEntry = {
                roleId: data.roleId, roleName: data.roleName || '',
                avatar: avatarMap.get(data.roleId) || undefined,
                side: data.side || 'judge',
                position: data.position ? (data.side === 'judge' ? '裁判' : posNames[data.position] || '') : '裁判',
                phase: resumePhaseMap[data.phase] || data.phase || '裁判评判',
                content: '', charsUsed: 0, charBudget: 0, isStreaming: true,
              };
              setSpeeches(prev => { streamingSpeechIdx.current = prev.length; return [...prev, entry]; });
              setCurrentSpeakerId(data.roleId);
              setCurrentPhase(resumePhaseMap[data.phase] || data.phase || '裁判评判');
              const markSpeaking = (d: DebaterInfo) => ({ ...d, status: (d.roleId === data.roleId ? 'speaking' : d.status) as DebaterInfo['status'] });
              setProDebaters(prev => prev.map(markSpeaking));
              setConDebaters(prev => prev.map(markSpeaking));
            } else if (data.content) {
              streamingAccum.current += data.content;
              setSpeeches(prev => {
                const idx = streamingSpeechIdx.current;
                if (idx < 0 || idx >= prev.length) return prev;
                const copy = [...prev];
                copy[idx] = { ...copy[idx], content: streamingAccum.current };
                return copy;
              });
            }
          },
          onPrompt: (data) => { setLatestPrompt(data); },
          onRoundDone: (data) => {
            setSpeeches(prev => {
              const idx = streamingSpeechIdx.current;
              if (idx < 0 || idx >= prev.length) return prev;
              const copy = [...prev];
              const isCrossFree = CROSS_FREE_PHASES.includes(data.label || data.phase || '');
              const sideCumulative = data.side === 'pro' ? (data.sideCharsPro || 0) : (data.sideCharsCon || 0);
              copy[idx] = { ...copy[idx], content: data.content || copy[idx].content, charsUsed: isCrossFree ? sideCumulative : (data.charsUsed || 0), charBudget: data.charBudget || 0, isStreaming: false };
              return copy;
            });
            setRoundIndex(data.roundIndex || 0);
            setCurrentPhase(data.label || data.phase || '');
            const markDone = (d: DebaterInfo) => d.roleId === data.roleId && d.side === data.side
              ? { ...d, status: 'done' as DebaterInfo['status'] } : d;
            setProDebaters(prev => prev.map(markDone));
            setConDebaters(prev => prev.map(markDone));
            setCurrentSpeakerId(null);
            if (data.phase !== 'judging') setIsStepping(false);
          },
          onJudgingDone: (data) => {
            setJudgingPhase2Ready(true);
            setJudgingTotal(data.personaCount || 0);
            setIsStepping(false);
          },
          onDone: (data) => {
            setWinner(data.winner as 'pro' | 'con');
            setPageMode('finished');
            setCurrentSpeakerId(null);
            setIsStepping(false);
            cleanupRef.current = null;
          },
          onError: (data) => {
            console.error('[Debate Error]', data.error);
            setDebateError(data.error || '未知错误');
            setIsStepping(false);
            cleanupRef.current = null;
          },
        });
        return;
      }

      // ── Finished → view only ──
      setWinner(debate.result?.winner || null);
      if (debate.result) {
        setDebateResult({ proTotal: debate.result.proTotalScore, conTotal: debate.result.conTotalScore, bestPro: debate.result.bestPro, bestCon: debate.result.bestCon, overallBest: debate.result.overallBest });
      } else {
        setDebateResult(null);
      }
      setCurrentPhase('裁判评判');
      setCurrentSpeakerId(null);
      setRoundIndex(debate.messages.length);
      setSpeeches(speechesData);
      setPageMode('finished');
    } catch (e) {
      console.error('[Debate History] 加载失败:', e);
    }
  }, [subscribe]);

  // ── Phase index for display ──
  const currentPhaseIndex = PHASE_ORDER.indexOf(currentPhase);

  function renderBestDebater(label: string, position: number | undefined | null, debaters: DebaterInfo[]) {
    if (position == null) return null;
    const posNames = ['', '一辩', '二辩', '三辩', '四辩'];
    const d = debaters.find(r => r.positionLabel === posNames[position]);
    return <p>{label}：{d?.roleName || `第${position}辩`}（{posNames[position] || `第${position}位`}）</p>;
  }

  // ══════════════════════════════════════════════════════════════
  //  Render
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* ════════════ IDLE ════════════ */}
      {pageMode === 'idle' && (
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="text-center mb-12">
            <h2 className="font-hand text-4xl text-[#2C2C2C] mb-3">辩论赛</h2>
            <p className="font-mono text-base text-[#2C2C2C]/40">选择 8 位辩手和 1 位裁判，开始一场 AI 辩论赛</p>
          </div>

          <button
            onClick={() => setSetupOpen(true)}
            className="px-10 py-4 rounded-xl bg-[#2C2C2C] text-[#F2F2EE] font-hand text-xl hover:bg-[#2C2C2C]/90 transition-all cursor-pointer active:scale-[0.98]"
          >
            开始新辩论
          </button>

          {/* ── History list ── */}
          <div className="mt-16 w-full max-w-md">
            <p className="font-hand text-base text-[#2C2C2C]/30 text-center border-t border-[#2C2C2C]/10 pt-6 mb-3">历史辩论记录</p>
            {debateList.length === 0 ? (
              <p className="font-mono text-sm text-[#2C2C2C]/20 text-center">暂无辩论记录</p>
            ) : (
              <>
                <div className="space-y-2">
                  {debateList.slice(0, 2).map((d: any) => (
                    <button
                      key={d.id}
                      onClick={() => handleViewHistory(d.id)}
                      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[#2C2C2C]/5 transition-colors text-left cursor-pointer border border-transparent hover:border-[#2C2C2C]/10"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-base text-[#2C2C2C] truncate">{d.proTopic} | {d.conTopic}</p>
                        <p className="font-mono text-xs text-[#2C2C2C]/30 mt-0.5">
                          {new Date(d.createdAt).toLocaleDateString('zh-CN')} · {d._count.messages} 条发言
                        </p>
                      </div>
                      {d.result?.winner && (
                        <span className="shrink-0 ml-3 font-hand text-sm text-[#2C2C2C]/50">
                          {d.result.winner === 'pro' ? '正方胜' : '反方胜'}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {debateList.length > 2 && (
                  <button
                    onClick={() => setHistoryModalOpen(true)}
                    className="w-full mt-2 py-2 text-center font-mono text-sm text-[#2C2C2C]/30 hover:text-[#2C2C2C]/60 transition-colors cursor-pointer rounded-lg hover:bg-[#2C2C2C]/5"
                  >
                    更多记录 ({debateList.length - 2})
                  </button>
                )}
              </>
            )}
          </div>

          <DebateSetupModal isOpen={setupOpen} onClose={() => setSetupOpen(false)} onStart={handleSetupStart} />

          {/* ── History modal ── */}
          {historyModalOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
              onClick={(e) => { if (e.target === e.currentTarget) setHistoryModalOpen(false); }}
              role="dialog"
              aria-modal="true"
              aria-label="历史辩论记录"
            >
              <div className="bg-white rounded-xl shadow-lg max-w-lg w-[90vw] max-h-[70vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#2C2C2C]/10 shrink-0">
                  <span className="font-hand text-base text-[#2C2C2C]">全部历史记录</span>
                  <button onClick={() => setHistoryModalOpen(false)} className="font-mono text-sm text-[#2C2C2C]/40 hover:text-[#2C2C2C]/70 cursor-pointer">✕ 关闭</button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 thin-scroll">
                  {debateList.map((d: any) => (
                    <button
                      key={d.id}
                      onClick={() => { setHistoryModalOpen(false); handleViewHistory(d.id); }}
                      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[#2C2C2C]/5 transition-colors text-left cursor-pointer border border-transparent hover:border-[#2C2C2C]/10"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm text-[#2C2C2C] truncate">{d.proTopic} | {d.conTopic}</p>
                        <p className="font-mono text-xs text-[#2C2C2C]/30 mt-0.5">
                          {new Date(d.createdAt).toLocaleDateString('zh-CN')} · {d._count.messages} 条发言
                        </p>
                      </div>
                      {d.result?.winner && (
                        <span className="shrink-0 ml-3 font-hand text-sm text-[#2C2C2C]/50">
                          {d.result.winner === 'pro' ? '正方胜' : '反方胜'}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ════════════ ACTIVE ════════════ */}
      {pageMode === 'active' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* ── Three-column body ── */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left: Pro */}
            <div className="w-[200px] shrink-0 border-r border-[#2C2C2C]/10 p-3 overflow-y-auto thin-scroll flex flex-col gap-3">
              <h3 className="font-hand text-lg text-[#2C2C2C] text-center shrink-0">正方</h3>
              {proTopic && (
                <p className="font-hand text-lg text-[#2C2C2C]/60 text-center whitespace-pre-wrap leading-relaxed shrink-0">{proTopic}</p>
              )}
              {proDebaters.map(d => (
                <DebaterAvatar key={d.roleId} debater={d} isSpeaking={d.status === 'speaking'} />
              ))}
            </div>

            {/* Center: Transcript */}
            <div ref={transcriptRef} className="flex-1 overflow-y-auto thin-scroll p-4 space-y-5 min-h-0 relative">
              {/* Debug mode: floating eye button */}
              {debugMode && (
                <button
                  onClick={() => latestPrompt && setPromptModalOpen(true)}
                  className="fixed top-[52px] right-[210px] z-30 w-8 h-8 rounded-full bg-[#2C2C2C]/10 hover:bg-[#2C2C2C]/20 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="查看 LLM 输入"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              )}
              {speeches.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <p className="font-mono text-sm text-[#2C2C2C]/20">点击「下一步」开始辩论</p>
                </div>
              )}
              {speeches.map((s, i) => (
                <SpeechBubble key={i} speech={s} />
              ))}
            </div>

            {/* Right: Con */}
            <div className="w-[200px] shrink-0 border-l border-[#2C2C2C]/10 p-3 overflow-y-auto thin-scroll flex flex-col gap-3">
              <h3 className="font-hand text-lg text-[#2C2C2C] text-center shrink-0">反方</h3>
              {conTopic && (
                <p className="font-hand text-lg text-[#2C2C2C]/60 text-center whitespace-pre-wrap leading-relaxed shrink-0">{conTopic}</p>
              )}
              {conDebaters.map(d => (
                <DebaterAvatar key={d.roleId} debater={d} isSpeaking={d.status === 'speaking'} />
              ))}
            </div>
          </div>

          {/* ── Bottom bar ── */}
          <div className="shrink-0 flex flex-col">
            {debateError && (
              <div className="mx-4 mt-2 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 font-mono text-sm flex items-center gap-2">
                <span className="font-bold shrink-0">[!]</span>
                <span className="flex-1">{debateError}</span>
                <button onClick={() => setDebateError(null)} className="hover:text-red-900 cursor-pointer shrink-0">✕</button>
              </div>
            )}
            <div className="flex items-center gap-4 px-6 py-2.5 border-t border-[#2C2C2C]/10 bg-[#F2F2EE]/80 backdrop-blur-sm">
            <button
              onClick={handleStep}
              disabled={isStepping}
              className="px-6 py-2 rounded-lg bg-[#2C2C2C] text-[#F2F2EE] font-hand text-base hover:bg-[#2C2C2C]/90 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {isStepping ? '发言中...' : judgingPhase2Ready ? '查看结果' : currentPhaseIndex >= PHASE_ORDER.length - 1 ? '裁判评判' : '下一步 →'}
            </button>
            <span className="font-mono text-xs text-[#2C2C2C]/30">
              {judgingPhase2Ready ? `${judgingTotal} 位裁判已全部完成` : `${currentPhase} · 第 ${roundIndex} 轮发言`}
            </span>
          </div>
        </div>
      </div>
      )}

      {/* ════════════ FINISHED ════════════ */}
      {pageMode === 'finished' && (
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left: Pro */}
          <div className="w-[200px] shrink-0 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto thin-scroll p-3 space-y-3">
              <h3 className="font-hand text-lg text-[#2C2C2C] text-center pb-2 border-b border-[#2C2C2C]/10 shrink-0">正方</h3>
              {proTopic && <p className="font-hand text-lg text-[#2C2C2C]/60 text-center whitespace-pre-wrap leading-relaxed">{proTopic}</p>}
              {proDebaters.map(d => (
                <div key={d.roleId} className="flex flex-col items-center gap-1">
                  <AvatarIcon id={d.avatar ?? ''} size={40} />
                  <span className="font-hand text-lg text-[#2C2C2C] text-center leading-tight">{d.roleName}</span>
                  <span className="font-mono text-sm text-[#2C2C2C]/40">{d.positionLabel}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Center: Transcript */}
          <div ref={transcriptRef} className="flex-1 overflow-y-auto thin-scroll min-h-0">
            <div className="mx-4 mt-4 p-4 rounded-xl bg-[#2C2C2C]/5 border border-[#2C2C2C]/10 text-center">
              <p className="font-hand text-xl text-[#2C2C2C]">辩论结束</p>
              {winner && <p className="font-hand text-lg text-[#2C2C2C]/70 mt-1">获胜方：{winner === 'pro' ? '正方' : '反方'}</p>}
              {debateResult && (
                <div className="font-mono text-sm text-[#2C2C2C]/40 mt-2 space-y-0.5">
                  {renderBestDebater('正方最佳辩手', debateResult.bestPro, proDebaters)}
                  {renderBestDebater('反方最佳辩手', debateResult.bestCon, conDebaters)}
                </div>
              )}
              <button
                onClick={handleReturnHome}
                className="mt-3 px-6 py-2 rounded-lg bg-[#2C2C2C] text-[#F2F2EE] font-hand text-base hover:bg-[#2C2C2C]/90 transition-colors cursor-pointer active:scale-[0.98]"
              >
                返回
              </button>
            </div>

            <div className="p-4 space-y-5">
              {speeches.map((s, i) => (
                <SpeechBubble key={i} speech={s} />
              ))}

              {/* ── Result bubble at bottom ── */}
              {winner && (
                <div className="flex flex-col items-center max-w-[80%] mx-auto">
                  <span className="font-hand text-base text-[#2C2C2C]/60 mb-2">裁判结果</span>
                  <div className="w-full p-4 rounded-xl bg-[#2C2C2C]/4">
                    <div className="text-center space-y-2">
                      <p className="font-hand text-xl text-[#2C2C2C]">获胜方：{winner === 'pro' ? '正方' : '反方'}</p>
                      {debateResult && (
                        <>
                          <p className="font-mono text-base text-[#2C2C2C]/60">正方 {debateResult.proTotal.toFixed(2)} 分 — 反方 {debateResult.conTotal.toFixed(2)} 分</p>
                          <div className="font-mono text-sm text-[#2C2C2C]/40 pt-1 space-y-0.5">
                            {renderBestDebater('正方最佳辩手', debateResult.bestPro, proDebaters)}
                            {renderBestDebater('反方最佳辩手', debateResult.bestCon, conDebaters)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Con */}
          <div className="w-[200px] shrink-0 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto thin-scroll p-3 space-y-3">
              <h3 className="font-hand text-lg text-[#2C2C2C] text-center pb-2 border-b border-[#2C2C2C]/10 shrink-0">反方</h3>
              {conTopic && <p className="font-hand text-lg text-[#2C2C2C]/60 text-center whitespace-pre-wrap leading-relaxed">{conTopic}</p>}
              {conDebaters.map(d => (
                <div key={d.roleId} className="flex flex-col items-center gap-1">
                  <AvatarIcon id={d.avatar ?? ''} size={40} />
                  <span className="font-hand text-lg text-[#2C2C2C] text-center leading-tight">{d.roleName}</span>
                  <span className="font-mono text-sm text-[#2C2C2C]/40">{d.positionLabel}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Prompt modal (debug mode) ── */}
      {promptModalOpen && latestPrompt && (
        <PromptModal system={latestPrompt.system} user={latestPrompt.user} tacticSystem={latestPrompt.tacticSystem} tacticUser={latestPrompt.tacticUser} onClose={() => setPromptModalOpen(false)} />
      )}
    </div>
  );
}
