// ── Debate orchestration handler ──
// LLM 编排，不是 Agent — 没有工具调用，没有 ReAct 循环。
// 步进式执行：每点一次「下一步」执行一轮发言。

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════
//  Round definitions
// ═══════════════════════════════════════════════════════════════
const ROUNDS = [
  { phase: 'opening',  label: '立论',     budget: 700, maxTokens: 4096, speakerList: [{ side: 'pro', pos: 1 }, { side: 'con', pos: 1 }] },
  { phase: 'rebuttal', label: '驳论',    budget: 400, maxTokens: 4096, speakerList: [{ side: 'con', pos: 2 }, { side: 'pro', pos: 2 }] },
  { phase: 'cross',    label: '对辩',      budget: 300, maxTokens: null, speakers: 'cross', speakerPositions: [{ side: 'pro', pos: 3 }, { side: 'con', pos: 3 }] },
  { phase: 'free',     label: '自由辩论',   budget: 800, maxTokens: null, speakers: 'free' },
  { phase: 'closing',  label: '总结',     budget: 700, maxTokens: 4096, speakerList: [{ side: 'con', pos: 4 }, { side: 'pro', pos: 4 }] },
];

const POSITION_NAMES = ['', '一辩', '二辩', '三辩', '四辩'];

// ═══════════════════════════════════════════════════════════════
//  Prompts
// ═══════════════════════════════════════════════════════════════
const PHASE_PROMPTS = {
  opening: {
    pro: '现在是你方立论环节。作为正方开篇，为本场辩论定下基调。篇幅建议 600~700 字之间。',
    con: '现在是你方立论环节。作为反方开篇，建立本方论证框架。篇幅建议 600~700 字之间。',
  },
  rebuttal: {
    con: '现在是驳论环节，你的任务是反驳正方立论、加固本方立场。篇幅建议 300~400 字之间。',
    pro: '现在是驳论环节，你的任务是反驳反方立论、修复和巩固本方立场。篇幅建议 300~400 字之间。',
  },
  cross: '现在进入对辩环节，你和对方三辩多轮交替发言。留意上方的字数配额——你方还剩多少、对方还剩多少，都是重要信息。建议单次控制在 30~80 字以内，一句有力的质问或回应往往比长篇大论更有效，但不强制。\n如果你方字数用完，本轮失去发言权；如果对方字数先用完，你方依然可以继续输出直到自己也耗尽——可以一次打完所有剩余字数，也可以继续保持多轮短促输出。',
  free: '现在是自由辩论环节，双方交替发言，节奏紧凑。每次随机选派一名辩手出场，现在轮到你。\n\n留意上方的字数配额——你方还剩多少、对方还剩多少，都是重要信息。建议单次控制在 30~80 字以内，一句有力的质问或回应往往比长篇大论更有效，但不强制。\n如果你方字数用完，本轮失去发言权；如果对方字数先用完，你方依然可以继续输出直到自己也耗尽——可以一次打完所有剩余字数，也可以继续保持多轮短促输出。',
  closing: {
    con: '现在是总结陈词环节，你是反方收尾。回顾全场，指出正方始终未能解决的问题，升华本方立场。篇幅建议 600~700 字之间。',
    pro: '现在是总结陈词环节，你是正方收尾。回顾全场，指出反方始终未能有效回击的核心论点，升华本方立场。篇幅建议 600~700 字之间。',
  },
};

const JUDGE_SYSTEM = `你是本场辩论赛的裁判，请根据整场辩论记录进行评判。

评分维度（满分 10 分）：
- 内容与论据（权重 30%）：论据充分度、事实准确性
- 逻辑与推理（权重 25%）：论证严密性、逻辑自洽性
- 表达与语言（权重 20%）：语言流畅度、说服力
- 反驳与应变（权重 25%）：反驳精准度、抓对方漏洞能力

加权总分 = content×0.30 + logic×0.25 + expression×0.20 + rebuttal×0.25

输出严格 JSON：
{
  "scores": [
    { "side": "pro/con", "position": 1-4, "content": 1-10, "logic": 1-10, "expression": 1-10, "rebuttal": 1-10, "comment": "评语" }
  ],
  "winner": "pro/con",
  "bestPro": 1-4,
  "bestCon": 1-4,
  "overallBest": 1-4,
  "summary": "总体评价"
}`;

// ═══════════════════════════════════════════════════════════════
//  Prompt builders
// ═══════════════════════════════════════════════════════════════

function buildSystemPrompt(role, side, posNum, proTopic, conTopic, background, roundPhase) {
  const sideName = side === 'pro' ? '正方' : '反方';
  const posName = POSITION_NAMES[posNum] || '';

  let p = `你是${role.name}，${role.soul || ''}。${role.rule || ''}\n\n`;
  p += `你现在参加一场辩论赛。\n`;
  p += `正方辩题：${proTopic}\n`;
  p += `反方辩题：${conTopic}\n`;
  if (background) p += `背景：${background}\n`;
  p += `你的立场：${sideName}\n`;
  p += `你的位置：${posName}\n\n`;
  p += `你的唯一目标是在这场辩论中获胜。尽一切努力说服裁判和观众——用最强有力的论据、最严密的逻辑，抓住对方每一个漏洞。\n\n`;

  const phasePrompt = PHASE_PROMPTS[roundPhase];
  if (typeof phasePrompt === 'string') {
    p += phasePrompt + '\n\n';
  } else if (phasePrompt && phasePrompt[side]) {
    p += phasePrompt[side] + '\n\n';
  }

  p += `输出纯文本发言即可，不要解释你的思考过程。`;
  return p;
}

function buildUserMessage(allMsgs, roundPhase, mySide, myUsed, myBudget, oppUsed, oppBudget, roundIdx) {
  const roundDef = ROUNDS.find(r => r.phase === roundPhase);
  const label = roundDef ? roundDef.label : roundPhase;

  let msg = `以下是截至目前本场辩论的全部记录：\n---\n`;
  if (allMsgs.length === 0) {
    msg += '（暂无历史记录，你是第一个发言）\n';
  } else {
    for (const m of allMsgs) {
      const s = m.side === 'pro' ? '正方' : m.side === 'con' ? '反方' : '裁判';
      const pos = m.position > 0 ? POSITION_NAMES[m.position] : '';
      msg += `[${s}${pos}]：${m.content}\n`;
    }
  }
  msg += `---\n\n`;
  msg += `当前环节：${label}\n`;
  msg += `这是整场辩论的第 ${roundIdx} 轮发言。\n`;

  if (roundPhase === 'cross' || roundPhase === 'free') {
    const myRem = Math.max(0, myBudget - myUsed);
    msg += `我方已使用 ${myUsed} 字（共 ${myBudget}），对方已使用 ${oppUsed} 字（共 ${oppBudget}）\n`;
    msg += `（我方剩余 ${myRem} 字，累计达到 ${myBudget} 字后我方失去发言权）\n`;
  } else if (roundDef) {
    const lo = Math.round(roundDef.budget * 0.85);
    msg += `本环节建议输出约 ${lo}~${roundDef.budget} 字的内容。\n`;
  }

  msg += `\n轮到你发言了：`;
  return msg;
}

// ═══════════════════════════════════════════════════════════════
//  SSE streaming LLM call
// ═══════════════════════════════════════════════════════════════

async function streamSpeech(brain, messages, maxTokens, onDelta, onDone) {
  const body = {
    model: brain.modelName,
    messages,
    stream: true,
  };
  if (maxTokens) body.max_tokens = maxTokens;

  const response = await fetch(`${brain.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${brain.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let totalTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) {
          full += delta;
          onDelta(delta);
        }
        if (json.usage?.completion_tokens) {
          totalTokens = json.usage.completion_tokens;
        }
      } catch { /* skip malformed */ }
    }
  }

  if (!totalTokens) totalTokens = Math.ceil(full.length * 0.35) || 1;
  onDone(full, totalTokens);
}

// ═══════════════════════════════════════════════════════════════
//  自由辩论 speaker picker (三辩 50% weight)
// ═══════════════════════════════════════════════════════════════

function pickFreeDebater(positions) {
  const third = positions.find(p => p.position === 3);
  if (third && Math.random() < 0.5) return third;
  const others = positions.filter(p => p.position !== 3);
  return others[Math.floor(Math.random() * others.length)];
}

// ═══════════════════════════════════════════════════════════════
//  State machine: get next speaker
// ═══════════════════════════════════════════════════════════════

function getNextSpeaker(state) {
  while (state.phaseIndex < ROUNDS.length) {
    const round = ROUNDS[state.phaseIndex];

    // ── Fixed speaker list ──
    if (round.speakerList) {
      if (state.phaseStepIndex < round.speakerList.length) {
        const sp = round.speakerList[state.phaseStepIndex];
        state.phaseStepIndex++;
        return { phase: round.phase, side: sp.side, pos: sp.pos, label: round.label, budget: round.budget };
      }
      // All speakers done → next phase
      state.phaseIndex++;
      state.phaseStepIndex = 0;
      state.perSideChars = { pro: 0, con: 0 };
      continue;
    }

    // ── Cross debate ──
    if (round.speakers === 'cross') {
      if (state.perSideChars.pro >= round.budget && state.perSideChars.con >= round.budget) {
        state.phaseIndex++;
        state.perSideChars = { pro: 0, con: 0 };
        continue;
      }

      for (const attempt of [state.crossTurn, state.crossTurn === 'pro' ? 'con' : 'pro']) {
        if (state.perSideChars[attempt] < round.budget) {
          const pool = attempt === 'pro' ? state.proRoles : state.conRoles;
          const posDef = pool.find(p => p.position === 3);
          if (posDef) {
            state.crossTurn = attempt === 'pro' ? 'con' : 'pro';
            return { phase: round.phase, side: attempt, pos: 3, label: round.label, budget: round.budget };
          }
        }
      }

      state.phaseIndex++;
      state.perSideChars = { pro: 0, con: 0 };
      continue;
    }

    // ── Free debate ──
    if (round.speakers === 'free') {
      if (state.perSideChars.pro >= round.budget && state.perSideChars.con >= round.budget) {
        state.phaseIndex++;
        state.perSideChars = { pro: 0, con: 0 };
        continue;
      }

      for (const attempt of [state.freeTurn, state.freeTurn === 'pro' ? 'con' : 'pro']) {
        if (state.perSideChars[attempt] < round.budget) {
          const pool = attempt === 'pro' ? state.proRoles : state.conRoles;
          const pick = pickFreeDebater(pool);
          if (pick) {
            state.freeTurn = attempt === 'pro' ? 'con' : 'pro';
            return { phase: round.phase, side: attempt, pos: pick.position, label: round.label, budget: round.budget };
          }
        }
      }

      state.phaseIndex++;
      state.perSideChars = { pro: 0, con: 0 };
      continue;
    }
  }

  return { phase: 'judging' };
}

// ═══════════════════════════════════════════════════════════════
//  Execute one speech step
// ═══════════════════════════════════════════════════════════════

async function executeSpeech(event, state, speaker) {
  const { phase, side, pos, label, budget } = speaker;
  const pool = side === 'pro' ? state.proRoles : state.conRoles;
  const posDef = pool.find(p => p.position === pos);
  if (!posDef) throw new Error(`找不到 ${side} ${pos} 辩手`);

  const role = state.roleCache.get(posDef.roleId);
  if (!role) throw new Error(`角色 ${posDef.roleId} 未加载`);

  const opp = side === 'pro' ? 'con' : 'pro';
  const myUsed = state.perSideChars[side];
  const oppUsed = state.perSideChars[opp];

  const sys = buildSystemPrompt(role, side, pos, state.proTopic, state.conTopic, state.background, phase);
  const usr = buildUserMessage(state.allMsgs, phase, side, myUsed, budget, oppUsed, budget, ++state.roundIdx);

  // Debug mode: send prompt
  if (state.debugMode) {
    event.sender.send('debate:prompt', { system: sys, user: usr });
  }

  // Send first delta with speaker info to create speech entry
  event.sender.send('debate:delta', {
    roleId: role.id,
    roleName: role.name,
    content: '',
    phase,
    side,
    position: pos,
    isFirst: true,
  });

  let speech = '', tokens = 0;
  await streamSpeech(role.brain, [
    { role: 'system', content: sys },
    { role: 'user', content: usr },
  ], 4096,
    (d) => event.sender.send('debate:delta', { roleId: role.id, content: d, isFirst: false }),
    (c, t) => { speech = c; tokens = t; }
  );

  // Update state
  state.perSideChars[side] += speech.length;
  state.allMsgs.push({ side, position: pos, content: speech, phase });

  // Save to DB
  await prisma.debateMessage.create({
    data: {
      debateId: state.debateId,
      roleId: role.id,
      side,
      position: pos,
      round: phase,
      content: speech,
      tokenCount: tokens,
      charCount: speech.length,
      roundIndex: state.roundIdx,
    },
  });

  // Send round_done
  event.sender.send('debate:round_done', {
    phase,
    side,
    position: pos,
    label,
    roleId: role.id,
    roleName: role.name,
    content: speech,
    charsUsed: speech.length,
    charBudget: budget,
    roundIndex: state.roundIdx,
    sideCharsPro: state.perSideChars.pro,
    sideCharsCon: state.perSideChars.con,
  });
}

// ═══════════════════════════════════════════════════════════════
//  Execute judging
// ═══════════════════════════════════════════════════════════════

async function executeJudging(event, state) {
  const judgeRole = state.roleCache.get(state.judgeRoleId);
  if (!judgeRole) throw new Error(`裁判角色 ${state.judgeRoleId} 未加载`);

  // Build history
  let history = '';
  for (const m of state.allMsgs) {
    const s = m.side === 'pro' ? '正方' : m.side === 'con' ? '反方' : '裁判';
    const pos = m.position > 0 ? POSITION_NAMES[m.position] : '';
    history += `[${s}${pos}]：${m.content}\n`;
  }

  // Send judge phase start
  event.sender.send('debate:delta', {
    roleId: judgeRole.id,
    roleName: judgeRole.name,
    content: '',
    phase: 'judging',
    side: 'judge',
    position: 0,
    isFirst: true,
  });

  const jmsg = [
    { role: 'system', content: `你是${judgeRole.name}，${judgeRole.soul || ''}。${judgeRole.rule || ''}\n\n${JUDGE_SYSTEM}` },
    { role: 'user', content: `以下是本场辩论的完整记录：\n\n${history}\n\n请给出你的评判：` },
  ];

  const resp = await fetch(`${judgeRole.brain.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${judgeRole.brain.apiKey}`,
    },
    body: JSON.stringify({ model: judgeRole.brain.modelName, messages: jmsg, max_tokens: 2048 }),
  });

  if (!resp.ok) throw new Error(`裁判 API 错误 ${resp.status}`);

  const data = await resp.json();
  const judgeText = data.choices?.[0]?.message?.content || '';

  // Stream judge text for visual effect
  for (let i = 0; i < judgeText.length; i += 5) {
    const chunk = judgeText.slice(i, i + 5);
    event.sender.send('debate:delta', { roleId: judgeRole.id, content: chunk, isFirst: false });
  }

  await prisma.debateMessage.create({
    data: {
      debateId: state.debateId,
      roleId: judgeRole.id,
      side: 'judge',
      position: 0,
      round: 'judging',
      content: judgeText,
      tokenCount: data.usage?.completion_tokens || Math.ceil(judgeText.length * 0.35),
      roundIndex: ++state.roundIdx,
    },
  });

  // Parse judge result
  let judgeResult;
  try {
    judgeResult = JSON.parse(judgeText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim());
  } catch {
    throw new Error('裁判输出无法解析为 JSON');
  }

  // Save scores
  const allPositionDefs = [
    ...state.proRoles.map(p => ({ roleId: p.roleId, side: 'pro', position: p.position })),
    ...state.conRoles.map(p => ({ roleId: p.roleId, side: 'con', position: p.position })),
  ];

  if (judgeResult.scores) {
    for (const sc of judgeResult.scores) {
      const def = allPositionDefs.find(p => p.side === sc.side && p.position === sc.position);
      if (!def) continue;
      await prisma.debateScore.create({
        data: {
          debateId: state.debateId,
          roleId: def.roleId,
          side: sc.side,
          position: sc.position,
          scoreContent: sc.content,
          scoreLogic: sc.logic,
          scoreExpression: sc.expression,
          scoreRebuttal: sc.rebuttal,
          totalScore: (sc.content || 0) * 0.30 + (sc.logic || 0) * 0.25 + (sc.expression || 0) * 0.20 + (sc.rebuttal || 0) * 0.25,
          judgeComment: sc.comment,
        },
      });
    }
  }

  await prisma.debateResult.create({
    data: {
      debateId: state.debateId,
      winner: judgeResult.winner || 'pro',
      bestPro: judgeResult.bestPro || null,
      bestCon: judgeResult.bestCon || null,
      overallBest: judgeResult.overallBest || null,
      bestSide: judgeResult.bestSide || null,
      judgeSummary: judgeResult.summary || null,
    },
  });

  await prisma.debate.update({
    where: { id: state.debateId },
    data: { status: 'completed', summary: judgeResult.summary || null },
  });

  event.sender.send('debate:round_done', {
    phase: 'judging',
    side: 'judge',
    position: 0,
    label: '裁判评判',
    roleId: judgeRole.id,
    roleName: judgeRole.name,
    content: judgeText,
    charsUsed: judgeText.length,
    charBudget: 0,
    roundIndex: state.roundIdx,
    sideCharsPro: state.perSideChars.pro,
    sideCharsCon: state.perSideChars.con,
  });

  event.sender.send('debate:done', {
    winner: judgeResult.winner,
    scores: judgeResult.scores || [],
    summary: judgeResult.summary || '',
  });

  state.completed = true;
}

// ═══════════════════════════════════════════════════════════════
//  IPC Registration
// ═══════════════════════════════════════════════════════════════

module.exports = function (ipcMain) {
  const active = new Map();

  // ── List past debates ──
  ipcMain.handle('debate:list', async () => {
    return prisma.debate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
        result: { select: { winner: true } },
      },
    });
  });

  // ── Get full debate record ──
  ipcMain.handle('debate:get', async (_event, id) => {
    return prisma.debate.findUniqueOrThrow({
      where: { id },
      include: {
        positions: true,
        messages: { orderBy: { createdAt: 'asc' } },
        scores: true,
        result: true,
      },
    });
  });

  // ── Stop ──
  ipcMain.on('debate:stop', () => {
    for (const [id, state] of active) {
      if (!state.completed) {
        prisma.debate.update({
          where: { id },
          data: { status: 'ongoing' },
        }).catch(() => {});
      }
      active.delete(id);
    }
  });

  // ── Create debate (step-by-step) ──
  ipcMain.handle('debate:create', async (_event, params) => {
    const { proTopic, conTopic, background, proRoles, conRoles, judgeRoleId, debugMode } = params;

    // 1. Create debate
    const debate = await prisma.debate.create({
      data: { proTopic, conTopic, background: background || null, debugMode: !!debugMode, status: 'ongoing' },
    });

    // 2. Load roles+brains, create positions
    const allPositionDefs = [
      ...proRoles.map((rid, i) => ({ roleId: rid, side: 'pro', position: i + 1 })),
      ...conRoles.map((rid, i) => ({ roleId: rid, side: 'con', position: i + 1 })),
    ];

    const roleCache = new Map();

    for (const def of allPositionDefs) {
      const role = await prisma.role.findUnique({
        where: { id: def.roleId },
        include: { brain: true },
      });
      if (!role) throw new Error(`角色 ${def.roleId} 不存在`);
      roleCache.set(def.roleId, role);

      await prisma.debatePosition.create({
        data: { debateId: debate.id, roleId: def.roleId, side: def.side, position: def.position, brainId: role.brainId },
      });
    }

    // Judge
    const judgeRole = await prisma.role.findUnique({
      where: { id: judgeRoleId },
      include: { brain: true },
    });
    if (!judgeRole) throw new Error(`裁判角色 ${judgeRoleId} 不存在`);
    roleCache.set(judgeRoleId, judgeRole);

    await prisma.debatePosition.create({
      data: { debateId: debate.id, roleId: judgeRoleId, side: 'judge', position: 0, brainId: judgeRole.brainId },
    });

    // 3. Initialize state
    const state = {
      debateId: debate.id,
      proTopic, conTopic, background,
      proRoles: allPositionDefs.filter(p => p.side === 'pro'),
      conRoles: allPositionDefs.filter(p => p.side === 'con'),
      judgeRoleId,
      roleCache,
      allMsgs: [],
      roundIdx: 0,
      perSideChars: { pro: 0, con: 0 },
      phaseIndex: 0,
      phaseStepIndex: 0,
      crossTurn: 'pro',
      freeTurn: 'pro',
      debugMode: !!debugMode,
      completed: false,
    };

    active.set(debate.id, state);

    return { debateId: debate.id };
  });

  // ── Resume incomplete debate ──
  ipcMain.handle('debate:resume', async (_event, { debateId, debugMode }) => {
    const debate = await prisma.debate.findUniqueOrThrow({
      where: { id: debateId },
      include: {
        positions: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (debate.status === 'completed') {
      throw new Error('辩论已结束，无法继续');
    }

    // Use persisted debugMode (resume param overrides)
    const resumeDebugMode = debugMode !== undefined ? !!debugMode : debate.debugMode;

    // Load roles + brains
    const roleCache = new Map();
    const positionDefs = debate.positions.filter(p => p.side !== 'judge');
    const judgePosition = debate.positions.find(p => p.side === 'judge');

    for (const pos of debate.positions) {
      const role = await prisma.role.findUnique({
        where: { id: pos.roleId },
        include: { brain: true },
      });
      if (role) roleCache.set(pos.roleId, role);
    }

    // Reconstruct state from existing messages
    const allMsgs = debate.messages.map(m => ({
      side: m.side, position: m.position, content: m.content, phase: m.round,
    }));

    // Determine current phase and compute perSideChars per phase
    const phaseOrder = ['opening', 'rebuttal', 'cross', 'free', 'closing'];
    let phaseIndex = 0;
    let phaseStepIndex = 0;
    let perSideChars = { pro: 0, con: 0 };
    let crossTurn = 'pro';
    let freeTurn = 'pro';

    for (let i = 0; i < phaseOrder.length; i++) {
      const phase = phaseOrder[i];
      const roundDef = ROUNDS[i];
      const phaseMsgs = debate.messages.filter(m => m.round === phase);
      const phaseChars = { pro: 0, con: 0 };
      for (const m of phaseMsgs) {
        const c = m.charCount || m.content.length || 0;
        if (m.side === 'pro') phaseChars.pro += c;
        if (m.side === 'con') phaseChars.con += c;
      }

      let phaseComplete = false;
      if (roundDef.speakerList) {
        // Fixed speaker list: all positions spoken
        phaseComplete = roundDef.speakerList.every(sp =>
          phaseMsgs.some(m => m.side === sp.side && m.position === sp.pos)
        );
      } else if (roundDef.speakers === 'cross') {
        phaseComplete = phaseChars.pro >= roundDef.budget && phaseChars.con >= roundDef.budget;
      } else if (roundDef.speakers === 'free') {
        phaseComplete = phaseChars.pro >= roundDef.budget && phaseChars.con >= roundDef.budget;
      }

      if (!phaseComplete) {
        phaseIndex = i;
        perSideChars = phaseChars;
        if (roundDef.speakerList) {
          phaseStepIndex = phaseMsgs.length;
        }
        if (roundDef.speakers === 'cross' && phaseMsgs.length > 0) {
          crossTurn = phaseMsgs[phaseMsgs.length - 1].side === 'pro' ? 'con' : 'pro';
        }
        if (roundDef.speakers === 'free' && phaseMsgs.length > 0) {
          freeTurn = phaseMsgs[phaseMsgs.length - 1].side === 'pro' ? 'con' : 'pro';
        }
        break;
      }

      if (i === phaseOrder.length - 1) {
        phaseIndex = phaseOrder.length; // all done, will trigger judging
      }
    }

    const state = {
      debateId: debate.id,
      proTopic: debate.proTopic,
      conTopic: debate.conTopic,
      background: debate.background,
      proRoles: positionDefs.filter(p => p.side === 'pro').map(p => ({ roleId: p.roleId, position: p.position })),
      conRoles: positionDefs.filter(p => p.side === 'con').map(p => ({ roleId: p.roleId, position: p.position })),
      judgeRoleId: judgePosition?.roleId || '',
      roleCache,
      allMsgs,
      roundIdx: allMsgs.length,
      perSideChars,
      phaseIndex,
      phaseStepIndex,
      crossTurn,
      freeTurn,
      debugMode: resumeDebugMode,
      completed: false,
    };

    active.set(debate.id, state);
    return { debateId: debate.id };
  });

  // ── Step (execute one round) ──
  ipcMain.on('debate:step', async (event, { debateId }) => {
    try {
      const state = active.get(debateId);
      if (!state) {
        event.sender.send('debate:error', { error: '辩论未找到或已结束' });
        return;
      }

      if (state.completed) {
        event.sender.send('debate:error', { error: '辩论已结束' });
        return;
      }

      const speaker = getNextSpeaker(state);

      if (speaker.phase === 'judging') {
        await executeJudging(event, state);
        active.delete(debateId);
        return;
      }

      await executeSpeech(event, state, speaker);
    } catch (err) {
      console.error('[debate:step]', err);
      event.sender.send('debate:error', { error: err.message || '发言过程出错' });
    }
  });
};
