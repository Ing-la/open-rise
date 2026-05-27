'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DebateSetupModal from './DebateSetupModal';
import { listRoles, sendDebateStart, stopDebate, listDebates, getDebate } from '@/lib/api';

// ── Types ──
type PageMode = 'idle' | 'active' | 'finished';
type DebaterStatus = 'waiting' | 'speaking' | 'done';

interface DebaterInfo {
  roleId: string;
  roleName: string;
  side: 'pro' | 'con';
  position: string;
  positionNum: number;
  status: DebaterStatus;
  totalTokens: number;
}

interface SpeechEntry {
  roleId: string;
  roleName: string;
  side: 'pro' | 'con' | 'judge';
  position: string;
  phase: string;
  content: string;
  tokensUsed: number;
  tokenBudget: number;
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
const PHASE_TOKENS: Record<string, number> = {
  '立论': 700,
  '驳论': 400,
  '对辩': 400,
  '自由辩论': 1600,
  '总结': 700,
  '裁判评判': 0,
};

// ── Debater Card ──
function DebaterCard({ debater, isCurrent }: { debater: DebaterInfo; isCurrent: boolean }) {
  let indicator: string;
  let indicatorColor: string;
  if (debater.status === 'speaking') {
    indicator = '●';
    indicatorColor = 'text-red-500';
  } else if (debater.status === 'done') {
    indicator = '●';
    indicatorColor = 'text-gray-400';
  } else {
    indicator = '●';
    indicatorColor = 'text-green-500';
  }

  return (
    <div
      className={`p-3 rounded-lg transition-all cursor-default ${
        isCurrent
          ? 'bg-[#2C2C2C]/10 ring-1 ring-[#2C2C2C]/30'
          : 'hover:bg-[#2C2C2C]/5'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-sm ${indicatorColor} ${debater.status === 'speaking' ? 'animate-pulse' : ''}`}>{indicator}</span>
        <span className={`font-hand text-sm ${debater.status === 'done' ? 'text-[#2C2C2C]/40' : 'text-[#2C2C2C]'}`}>
          {debater.position}
        </span>
      </div>
      <p className="font-mono text-xs text-[#2C2C2C]/50 mt-0.5 truncate">{debater.roleName || '待分配'}</p>
      {debater.totalTokens > 0 && (
        <p className="font-mono text-[9px] text-[#2C2C2C]/25 mt-1">已使用 {debater.totalTokens} tokens</p>
      )}
    </div>
  );
}

// ── Speech Bubble ──
function SpeechBubble({ speech, isCurrent }: { speech: SpeechEntry; isCurrent: boolean }) {
  const sideLabel = speech.side === 'pro' ? '正方' : speech.side === 'con' ? '反方' : '裁判';
  const label = speech.position ? `${sideLabel}${speech.position}` : sideLabel;

  return (
    <div
      className={`p-4 rounded-xl transition-all ${
        isCurrent
          ? 'bg-[#2C2C2C]/8 ring-1 ring-[#2C2C2C]/15'
          : 'bg-[#2C2C2C]/4 hover:bg-[#2C2C2C]/6'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="font-hand text-sm text-[#2C2C2C] font-bold">{label}</span>
        <span className="font-mono text-[10px] text-[#2C2C2C]/30">
          {PHASE_LABELS[speech.phase] || speech.phase}
        </span>
      </div>
      <div className="font-mono text-sm text-[#2C2C2C]/80 leading-relaxed whitespace-pre-wrap prose prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{speech.content}</ReactMarkdown>
        {speech.isStreaming && (
          <span className="inline-block w-[2px] h-[1em] bg-[#2C2C2C]/60 animate-pulse ml-0.5 align-middle" />
        )}
      </div>
      {speech.tokensUsed > 0 && (
        <p className="font-mono text-[10px] text-[#2C2C2C]/25 mt-2 text-right">
          已使用 {speech.tokensUsed} tokens
          {speech.tokenBudget > 0 && <>（共 {speech.tokenBudget}）</>}
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Main Component
// ══════════════════════════════════════════════════════════════════
export default function DebateView() {
  const [pageMode, setPageMode] = useState<PageMode>('idle');
  const [setupOpen, setSetupOpen] = useState(false);
  const [proTopic, setProTopic] = useState('');
  const [conTopic, setConTopic] = useState('');
  const [background, setBackground] = useState('');
  const [proDebaters, setProDebaters] = useState<DebaterInfo[]>([]);
  const [conDebaters, setConDebaters] = useState<DebaterInfo[]>([]);
  const [judgeRoleId, setJudgeRoleId] = useState('');
  const [judgeName, setJudgeName] = useState('');
  const [speeches, setSpeeches] = useState<SpeechEntry[]>([]);
  const [currentPhase, setCurrentPhase] = useState('');
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null);
  const [winner, setWinner] = useState<'pro' | 'con' | null>(null);
  const [sideTokens, setSideTokens] = useState<{ pro: number; con: number }>({ pro: 0, con: 0 });
  const [debateList, setDebateList] = useState<any[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const streamingSpeechIdx = useRef(-1);
  const streamingAccum = useRef('');

  // Cleanup IPC listeners on unmount
  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  // Load debate history when entering idle
  useEffect(() => {
    if (pageMode === 'idle') {
      listDebates().then(setDebateList).catch(() => setDebateList([]));
    }
  }, [pageMode]);

  // Auto-scroll transcript when speeches change
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [speeches]);

  // ── Start debate from setup ──
  const handleSetupStart = useCallback(async (params: any) => {
    cleanupRef.current?.(); // remove any prior listeners
    streamingSpeechIdx.current = -1;
    streamingAccum.current = '';

    setProTopic(params.proTopic || '');
    setConTopic(params.conTopic || '');
    setBackground(params.background);

    const roles = await listRoles();
    const roleMap = new Map(roles.map((r: any) => [r.id, r.name]));

    const proData: DebaterInfo[] = [
      { roleId: params.pro1, roleName: roleMap.get(params.pro1) || '', side: 'pro', position: '一辩', positionNum: 1, status: 'waiting', totalTokens: 0 },
      { roleId: params.pro2, roleName: roleMap.get(params.pro2) || '', side: 'pro', position: '二辩', positionNum: 2, status: 'waiting', totalTokens: 0 },
      { roleId: params.pro3, roleName: roleMap.get(params.pro3) || '', side: 'pro', position: '三辩', positionNum: 3, status: 'waiting', totalTokens: 0 },
      { roleId: params.pro4, roleName: roleMap.get(params.pro4) || '', side: 'pro', position: '四辩', positionNum: 4, status: 'waiting', totalTokens: 0 },
    ];
    const conData: DebaterInfo[] = [
      { roleId: params.con1, roleName: roleMap.get(params.con1) || '', side: 'con', position: '一辩', positionNum: 1, status: 'waiting', totalTokens: 0 },
      { roleId: params.con2, roleName: roleMap.get(params.con2) || '', side: 'con', position: '二辩', positionNum: 2, status: 'waiting', totalTokens: 0 },
      { roleId: params.con3, roleName: roleMap.get(params.con3) || '', side: 'con', position: '三辩', positionNum: 3, status: 'waiting', totalTokens: 0 },
      { roleId: params.con4, roleName: roleMap.get(params.con4) || '', side: 'con', position: '四辩', positionNum: 4, status: 'waiting', totalTokens: 0 },
    ];

    setProDebaters(proData);
    setConDebaters(conData);
    setJudgeRoleId(params.judge);
    setJudgeName(roleMap.get(params.judge) || '');
    setSpeeches([]);
    setCurrentPhase('立论');
    setCurrentSpeakerId(null);
    setWinner(null);
    setSideTokens({ pro: 0, con: 0 });
    setPageMode('active');

    // Build role-id → display-info lookup (includes judge)
    const allDebaters = [...proData, ...conData];
    const nameMap = new Map(allDebaters.map(d => [d.roleId, { roleName: d.roleName, side: d.side as SpeechEntry['side'], position: d.position }]));
    nameMap.set(params.judge, { roleName: roleMap.get(params.judge) || '', side: 'judge', position: '裁判' });

    const phaseMap: Record<string, string> = {
      opening: '立论', rebuttal: '驳论', cross: '对辩', free: '自由辩论', closing: '总结', judging: '裁判评判',
    };

    const cleanup = sendDebateStart({
      proTopic: params.proTopic,
      conTopic: params.conTopic,
      background: params.background,
      proRoles: [params.pro1, params.pro2, params.pro3, params.pro4],
      conRoles: [params.con1, params.con2, params.con3, params.con4],
      judgeRoleId: params.judge,
    }, {
      onProgress: (data) => {
        const cnPhase = phaseMap[data.phase] || data.phase;
        setCurrentPhase(cnPhase);
        setCurrentSpeakerId(data.speakerRoleId || null);
        // Empty speakerRoleId = phase-start signal only, not a speech
        if (!data.speakerRoleId) return;

        // Update debater card status
        const sid = data.speakerRoleId;
        const markSpeaking = (d: DebaterInfo) => ({ ...d, status: (d.roleId === sid ? 'speaking' : d.status) as DebaterStatus });
        setProDebaters(prev => prev.map(markSpeaking));
        setConDebaters(prev => prev.map(markSpeaking));

        // Create a new speech entry
        const info = nameMap.get(sid) || { roleName: '', side: 'judge' as const, position: '裁判' };
        const entry: SpeechEntry = {
          roleId: sid,
          roleName: info.roleName,
          side: info.side,
          position: info.position,
          phase: cnPhase,
          content: '',
          tokensUsed: 0,
          tokenBudget: 0,
          isStreaming: true,
        };
        streamingAccum.current = '';
        streamingSpeechIdx.current = -1;
        setSpeeches(prev => {
          streamingSpeechIdx.current = prev.length;
          return [...prev, entry];
        });
      },

      onMessage: (data) => {
        if (!data.done) {
          streamingAccum.current += data.content;
          setSpeeches(prev => {
            const idx = streamingSpeechIdx.current;
            if (idx < 0 || idx >= prev.length) return prev;
            const copy = [...prev];
            copy[idx] = { ...copy[idx], content: streamingAccum.current };
            return copy;
          });
        } else {
          // Finalize speech
          setSpeeches(prev => {
            const idx = streamingSpeechIdx.current;
            if (idx < 0 || idx >= prev.length) return prev;
            const copy = [...prev];
            copy[idx] = { ...copy[idx], tokensUsed: data.tokensUsed, isStreaming: false };
            return copy;
          });

          // Update per-debater token count & mark done
          const rid = data.roleId;
          const addTokens = (d: DebaterInfo) =>
            d.roleId === rid
              ? { ...d, totalTokens: d.totalTokens + data.tokensUsed, status: 'done' as DebaterStatus }
              : d;
          setProDebaters(prev => prev.map(addTokens));
          setConDebaters(prev => prev.map(addTokens));

          if (data.tokensUsed > 0) {
            setSideTokens(prev => {
              if (proData.some(p => p.roleId === rid)) return { ...prev, pro: prev.pro + data.tokensUsed };
              if (conData.some(c => c.roleId === rid)) return { ...prev, con: prev.con + data.tokensUsed };
              return prev;
            });
          }
        }
      },

      onDone: (data) => {
        setWinner(data.winner as 'pro' | 'con');
        setPageMode('finished');
        cleanupRef.current = null;
      },

      onError: (data) => {
        console.error('[Debate Error]', data.error);
        cleanupRef.current = null;
      },
    });

    cleanupRef.current = cleanup;
  }, []);

  // ── Return to idle ──
  const handleReturnHome = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    stopDebate();
    setPageMode('idle');
    setProTopic('');
    setConTopic('');
    setBackground('');
    setProDebaters([]);
    setConDebaters([]);
    setJudgeRoleId('');
    setJudgeName('');
    setSpeeches([]);
    setCurrentPhase('');
    setCurrentSpeakerId(null);
    setWinner(null);
    setSideTokens({ pro: 0, con: 0 });
  }, []);

  // ── View past debate record ──
  const handleViewHistory = useCallback(async (debateId: string) => {
    try {
      const debate = await getDebate(debateId);
      if (!debate) return;

      const posNames = ['', '一辩', '二辩', '三辩', '四辩'];
      const phaseMap: Record<string, string> = {
        opening: '立论', rebuttal: '驳论', cross: '对辩', free: '自由辩论', closing: '总结', judging: '裁判评判',
      };

      const proPositions = debate.positions.filter((p: any) => p.side === 'pro').sort((a: any, b: any) => a.position - b.position);
      const conPositions = debate.positions.filter((p: any) => p.side === 'con').sort((a: any, b: any) => a.position - b.position);
      const judgePosition = debate.positions.find((p: any) => p.side === 'judge');

      const roleNameMap = new Map(debate.positions.map((p: any) => [p.roleId, p.role?.name || '']));

      // Token sums per role
      const tokenSums: Record<string, number> = {};
      for (const m of debate.messages) {
        tokenSums[m.roleId] = (tokenSums[m.roleId] || 0) + (m.tokenCount || 0);
      }

      setProTopic(debate.proTopic || '');
      setConTopic(debate.conTopic || '');

      setProDebaters(proPositions.map((p: any) => ({
        roleId: p.roleId, roleName: roleNameMap.get(p.roleId) || '',
        side: 'pro' as const, position: posNames[p.position] || '',
        positionNum: p.position, status: 'done' as DebaterStatus,
        totalTokens: tokenSums[p.roleId] || 0,
      })));
      setConDebaters(conPositions.map((p: any) => ({
        roleId: p.roleId, roleName: roleNameMap.get(p.roleId) || '',
        side: 'con' as const, position: posNames[p.position] || '',
        positionNum: p.position, status: 'done' as DebaterStatus,
        totalTokens: tokenSums[p.roleId] || 0,
      })));
      setJudgeRoleId(judgePosition?.roleId || '');
      setJudgeName(judgePosition?.role?.name || '');

      setSpeeches(debate.messages.map((m: any) => ({
        roleId: m.roleId, roleName: roleNameMap.get(m.roleId) || '',
        side: m.side as SpeechEntry['side'],
        position: m.side === 'judge' ? '裁判' : posNames[m.position] || '',
        phase: phaseMap[m.round] || m.round,
        content: m.content, tokensUsed: m.tokenCount || 0, tokenBudget: 0, isStreaming: false,
      })));

      setWinner(debate.result?.winner || null);
      setCurrentPhase('裁判评判');
      setCurrentSpeakerId(null);

      const proTokens = debate.messages.filter((m: any) => m.side === 'pro').reduce((s: number, m: any) => s + (m.tokenCount || 0), 0);
      const conTokens = debate.messages.filter((m: any) => m.side === 'con').reduce((s: number, m: any) => s + (m.tokenCount || 0), 0);
      setSideTokens({ pro: proTokens, con: conTokens });

      setPageMode('finished');
    } catch { /* ignore */ }
  }, []);

  // ── Phase index for progress ──
  const currentPhaseIndex = PHASE_ORDER.indexOf(currentPhase);
  const progress = currentPhaseIndex >= 0 ? ((currentPhaseIndex) / PHASE_ORDER.length) * 100 : 0;

  // ── Render ──
  return (
    <div className="flex-1 flex flex-col min-w-0">
      {pageMode === 'idle' && (
        /* ════════════ IDLE ════════════ */
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="text-center mb-12">
            <h2 className="font-hand text-4xl text-[#2C2C2C] mb-3">
              辩论赛
            </h2>
            <p className="font-mono text-sm text-[#2C2C2C]/40">
              选择 8 位辩手和 1 位裁判，开始一场 AI 辩论赛
            </p>
          </div>

          <button
            onClick={() => setSetupOpen(true)}
            className="px-10 py-4 rounded-xl bg-[#2C2C2C] text-[#F2F2EE] font-hand text-xl hover:bg-[#2C2C2C]/90 transition-all cursor-pointer active:scale-[0.98]"
          >
            开始新辩论
          </button>

          {/* ── History list ── */}
          <div className="mt-16 w-full max-w-md">
            <p className="font-hand text-sm text-[#2C2C2C]/30 text-center border-t border-[#2C2C2C]/10 pt-6 mb-3">
              历史辩论记录
            </p>
            {debateList.length === 0 ? (
              <p className="font-mono text-xs text-[#2C2C2C]/20 text-center">
                暂无辩论记录
              </p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto thin-scroll">
                {debateList.map((d: any) => (
                  <button
                    key={d.id}
                    onClick={() => handleViewHistory(d.id)}
                    className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[#2C2C2C]/5 transition-colors text-left cursor-pointer border border-transparent hover:border-[#2C2C2C]/10"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm text-[#2C2C2C] truncate">
                        {d.proTopic} | {d.conTopic}
                      </p>
                      <p className="font-mono text-[10px] text-[#2C2C2C]/30 mt-0.5">
                        {new Date(d.createdAt).toLocaleDateString('zh-CN')} · {d._count.messages} 条发言
                      </p>
                    </div>
                    {d.result?.winner && (
                      <span className="shrink-0 ml-3 font-hand text-xs text-[#2C2C2C]/50">
                        {d.result.winner === 'pro' ? '正方胜' : '反方胜'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <DebateSetupModal
            isOpen={setupOpen}
            onClose={() => setSetupOpen(false)}
            onStart={handleSetupStart}
          />
        </main>
      )}

      {pageMode === 'active' && (
        /* ════════════ ACTIVE ════════════ */
        <div className="flex-1 flex flex-col">
          {/* ── Top phase bar ── */}
          <div className="shrink-0 flex items-center gap-4 px-6 py-3 border-b border-[#2C2C2C]/10">
            <div className="flex items-center gap-2">
              {PHASE_ORDER.map((p, i) => (
                <div key={p} className="flex items-center gap-2">
                  <span
                    className={`font-mono text-xs transition-colors ${
                      i === currentPhaseIndex
                        ? 'text-[#2C2C2C] font-bold'
                        : i < currentPhaseIndex
                        ? 'text-[#2C2C2C]/30'
                        : 'text-[#2C2C2C]/15'
                    }`}
                  >
                    {p}
                  </span>
                  {i < PHASE_ORDER.length - 1 && (
                    <span className="text-[#2C2C2C]/10 text-xs">→</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex-1" />
            <span className="font-mono text-xs text-[#2C2C2C]/30 text-right leading-tight">
              <span className="text-blue-600/50">正方</span> {proTopic} &nbsp;|&nbsp; <span className="text-red-600/50">反方</span> {conTopic}
            </span>
          </div>

          {/* ── Three-column body ── */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left: Pro side */}
            <div className="w-[200px] shrink-0 border-r border-[#2C2C2C]/10 p-3 overflow-y-auto thin-scroll">
              <h3 className="font-hand text-base text-[#2C2C2C] text-center mb-3 pb-2 border-b border-[#2C2C2C]/10">
                正方
              </h3>
              <div className="space-y-2">
                {proDebaters.map((d) => (
                  <DebaterCard key={d.roleId} debater={d} isCurrent={d.roleId === currentSpeakerId} />
                ))}
              </div>
              {sideTokens.pro > 0 && (
                <p className="font-mono text-[10px] text-[#2C2C2C]/25 text-center mt-4">
                  全队已使用 {sideTokens.pro} tokens
                </p>
              )}
            </div>

            {/* Center: Transcript */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <div ref={transcriptRef} className="flex-1 overflow-y-auto thin-scroll p-4 space-y-3 min-h-0">
                {speeches.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <p className="font-mono text-sm text-[#2C2C2C]/20">等待辩论开始...</p>
                  </div>
                )}
                {speeches.map((s, i) => (
                  <SpeechBubble
                    key={i}
                    speech={s}
                    isCurrent={i === speeches.length - 1 && s.isStreaming}
                  />
                ))}
              </div>
            </div>

            {/* Right: Con side */}
            <div className="w-[200px] shrink-0 border-l border-[#2C2C2C]/10 p-3 overflow-y-auto thin-scroll">
              <h3 className="font-hand text-base text-[#2C2C2C] text-center mb-3 pb-2 border-b border-[#2C2C2C]/10">
                反方
              </h3>
              <div className="space-y-2">
                {conDebaters.map((d) => (
                  <DebaterCard key={d.roleId} debater={d} isCurrent={d.roleId === currentSpeakerId} />
                ))}
              </div>
              {sideTokens.con > 0 && (
                <p className="font-mono text-[10px] text-[#2C2C2C]/25 text-center mt-4">
                  全队已使用 {sideTokens.con} tokens
                </p>
              )}
            </div>
          </div>

          {/* ── Bottom bar ── */}
          <div className="shrink-0 flex items-center gap-4 px-6 py-2.5 border-t border-[#2C2C2C]/10 bg-[#F2F2EE]/80 backdrop-blur-sm">
            <button
              className="font-mono text-xs text-[#2C2C2C]/40 hover:text-[#2C2C2C]/70 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              disabled
              title="暂停（开发中）"
            >
              ‖ 暂停
            </button>
            <button
              className="font-mono text-xs text-[#2C2C2C]/40 hover:text-[#2C2C2C]/70 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              disabled
              title="跳过当前发言（开发中）"
            >
              ⏭ 跳过
            </button>

            {/* ── Progress bar ── */}
            <div className="flex-1 mx-4">
              <div className="h-1 bg-[#2C2C2C]/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#2C2C2C]/30 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>

            <span className="font-mono text-[10px] text-[#2C2C2C]/30">
              {currentPhaseIndex >= 0
                ? `${PHASE_LABELS[currentPhase]} · ${Math.round(progress)}%`
                : ''}
            </span>
          </div>
        </div>
      )}

      {pageMode === 'finished' && (
        /* ════════════ FINISHED ════════════ */
        <div className="flex-1 flex flex-col">
          {/* ── Top phase bar (read-only) ── */}
          <div className="shrink-0 flex items-center gap-4 px-6 py-3 border-b border-[#2C2C2C]/10">
            {PHASE_ORDER.map((p, i) => (
              <span key={p} className="font-mono text-xs text-[#2C2C2C]/30">
                {p}
                {i < PHASE_ORDER.length - 1 && <span className="ml-2 text-[#2C2C2C]/10">→</span>}
              </span>
            ))}
          </div>

          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left: Pro */}
            <div className="w-[200px] shrink-0 border-r border-[#2C2C2C]/10 p-3 overflow-y-auto thin-scroll">
              <h3 className="font-hand text-base text-[#2C2C2C] text-center mb-3 pb-2 border-b border-[#2C2C2C]/10">
                正方
              </h3>
              <div className="space-y-2">
                {proDebaters.map((d) => (
                  <DebaterCard key={d.roleId} debater={d} isCurrent={false} />
                ))}
              </div>
            </div>

            {/* Center: Transcript + Winner */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              {/* ── Winner banner ── */}
              <div className="shrink-0 mx-4 mt-4 p-4 rounded-xl bg-[#2C2C2C]/5 border border-[#2C2C2C]/10 text-center">
                <p className="font-hand text-xl text-[#2C2C2C]">
                  辩论结束
                </p>
                {winner && (
                  <p className="font-hand text-lg text-[#2C2C2C]/70 mt-1">
                    获胜方：{winner === 'pro' ? '正方' : '反方'}
                  </p>
                )}
                <button
                  onClick={handleReturnHome}
                  className="mt-3 px-6 py-2 rounded-lg bg-[#2C2C2C] text-[#F2F2EE] font-hand text-sm hover:bg-[#2C2C2C]/90 transition-colors cursor-pointer active:scale-[0.98]"
                >
                  返回
                </button>
              </div>

              {/* ── Transcript ── */}
              <div ref={transcriptRef} className="flex-1 overflow-y-auto thin-scroll p-4 space-y-3 min-h-0">
                {speeches.map((s, i) => (
                  <SpeechBubble key={i} speech={s} isCurrent={false} />
                ))}
              </div>
            </div>

            {/* Right: Con */}
            <div className="w-[200px] shrink-0 border-l border-[#2C2C2C]/10 p-3 overflow-y-auto thin-scroll">
              <h3 className="font-hand text-base text-[#2C2C2C] text-center mb-3 pb-2 border-b border-[#2C2C2C]/10">
                反方
              </h3>
              <div className="space-y-2">
                {conDebaters.map((d) => (
                  <DebaterCard key={d.roleId} debater={d} isCurrent={false} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
