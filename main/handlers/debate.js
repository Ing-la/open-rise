// ── Debate orchestration handler ──
// LLM 编排，不是 Agent — 没有工具调用，没有 ReAct 循环。
// 步进式执行：每点一次「下一步」执行一轮发言。

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════
//  Round definitions
// ═══════════════════════════════════════════════════════════════
const ROUNDS = [
  { phase: 'opening',  label: '立论',     budget: 500, maxTokens: 4096, speakerList: [{ side: 'pro', pos: 1 }, { side: 'con', pos: 1 }] },
  { phase: 'rebuttal', label: '驳论',    budget: 300, maxTokens: 4096, speakerList: [{ side: 'con', pos: 2 }, { side: 'pro', pos: 2 }] },
  { phase: 'cross',    label: '对辩',      budget: 300, maxTokens: null, speakers: 'cross', speakerPositions: [{ side: 'pro', pos: 3 }, { side: 'con', pos: 3 }] },
  { phase: 'free',     label: '自由辩论',   budget: 800, maxTokens: null, speakers: 'free' },
  { phase: 'closing',  label: '总结',     budget: 500, maxTokens: 4096, speakerList: [{ side: 'con', pos: 4 }, { side: 'pro', pos: 4 }] },
];

const POSITION_NAMES = ['', '一辩', '二辩', '三辩', '四辩'];

// ═══════════════════════════════════════════════════════════════
//  Prompts
// ═══════════════════════════════════════════════════════════════
const PHASE_PROMPTS = {
  opening: {
    pro: '现在是你方立论环节。作为正方开篇，为本场辩论定下基调。篇幅建议 400~500 字之间。',
    con: '现在是你方立论环节。作为反方开篇，建立本方论证框架。此时无需深入反驳正方一辩的发言，驳论环节会专门处理。篇幅建议 400~500 字之间。',
  },
  rebuttal: {
    con: '现在是驳论环节，你的任务是反驳正方立论、加固本方立场。篇幅建议 200~300 字之间。',
    pro: '现在是驳论环节，你的任务是反驳反方立论、修复和巩固本方立场。篇幅建议 200~300 字之间。',
  },
  cross: '现在进入对辩环节，你和对方三辩多轮交替发言。留意上方的字数配额——你方还剩多少、对方还剩多少，都是重要信息。\n如果你方字数用完，本轮失去发言权；如果对方字数先用完，你方依然可以继续输出直到自己也耗尽——可以一次打完所有剩余字数，也可以继续保持多轮短促输出。',
  free: '现在是自由辩论环节，双方交替发言，节奏紧凑。每次随机选派一名辩手出场，现在轮到你。\n\n留意上方的字数配额——你方还剩多少、对方还剩多少，都是重要信息。\n如果你方字数用完，本轮失去发言权；如果对方字数先用完，你方依然可以继续输出直到自己也耗尽——可以一次打完所有剩余字数，也可以继续保持多轮短促输出。',
  closing: {
    con: '现在是总结陈词环节，你是反方收尾。回顾全场，指出正方始终未能解决的问题，升华本方立场。篇幅建议 400~500 字之间。',
    pro: '现在是总结陈词环节，你是正方收尾。回顾全场，指出反方始终未能有效回击的核心论点，升华本方立场。篇幅建议 400~500 字之间。',
  },
};

const JUDGE_PERSONAS = [
  { id: 1,  name: '严谨学者',  weights: { content: 0.25, logic: 0.45, expression: 0.05, rebuttal: 0.25 },
    promptSoul: '你以逻辑严密著称，在你看来论证漏洞不可原谅，而对语言风格你不太在意。' },
  { id: 2,  name: '修辞大师',  weights: { content: 0.20, logic: 0.15, expression: 0.50, rebuttal: 0.15 },
    promptSoul: '你是语言艺术的鉴赏家，比起干巴巴的事实陈述，你更看重表达的说服力和感染力。' },
  { id: 3,  name: '战术分析师', weights: { content: 0.15, logic: 0.25, expression: 0.10, rebuttal: 0.50 },
    promptSoul: '你专注于辩论中的攻防转换，谁能有效反驳对方、抓住漏洞，谁就能赢得你的高分。' },
  { id: 4,  name: '中立主义者', weights: { content: 0.30, logic: 0.25, expression: 0.20, rebuttal: 0.25 },
    promptSoul: '你以公正均衡的态度评分，不偏重任何单一维度，追求全面的评判。' },
  { id: 5,  name: '事实核查官', weights: { content: 0.55, logic: 0.25, expression: 0.05, rebuttal: 0.15 },
    promptSoul: '你只相信事实和证据，华丽的辞藻在你面前毫无价值，数据不准确更是不可原谅。' },
  { id: 6,  name: '即兴艺术家', weights: { content: 0.15, logic: 0.15, expression: 0.35, rebuttal: 0.35 },
    promptSoul: '你欣赏临场发挥和创新角度，能够灵活应对突发情况的辩手最能打动你。' },
  { id: 7,  name: '传统守护者', weights: { content: 0.35, logic: 0.30, expression: 0.25, rebuttal: 0.10 },
    promptSoul: '你遵循辩论传统，看重立论框架的完整性和总结陈词的升华能力，反驳技巧不在你优先考虑之列。' },
  { id: 8,  name: '激进辩手',   weights: { content: 0.10, logic: 0.20, expression: 0.15, rebuttal: 0.55 },
    promptSoul: '你偏好攻击性辩论风格，认为辩论的本质是击败对手，强有力的反驳比温和的论述更有价值。' },
  { id: 9,  name: '温和评判',   weights: { content: 0.25, logic: 0.20, expression: 0.30, rebuttal: 0.25 },
    promptSoul: '你以包容态度评分，关注辩论的整体质量和建设性对话，不因个别激进言论而偏颇。' },
];

const JUDGE_SCORING_RULES = `评分维度（满分 10 分，整数）：
- 内容与论据（content）：论据充分度、事实准确性
- 逻辑与推理（logic）：论证严密性、逻辑自洽性
- 表达与语言（expression）：语言流畅度、说服力
- 反驳与应变（rebuttal）：反驳精准度、抓对方漏洞能力

评分参考标准：
- 8-10 分：出色，远超预期
- 6-7 分：良好，达到预期
- 4-5 分：一般，有改进空间
- 1-3 分：差，明显不足

输出严格 JSON 数组（每个辩手一个元素），不要包含任何其他内容：

[
  { "side": "pro/con", "position": 1-4, "content": 0-10, "logic": 0-10, "expression": 0-10, "rebuttal": 0-10, "comment": "约 200 字的点评" },
  ...
]`;

function buildJudgeSystemPrompt(persona) {
  return `你是本场辩论赛的裁判，${persona.name}。

${persona.promptSoul}`;
}

function pickN(n, arr) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

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
  if (background) p += `背景：${background}\n\n`;
  const myTopic = side === 'pro' ? proTopic : conTopic;
  p += `你的立场：${sideName}（${myTopic}）\n`;
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

function buildUserMessage(allMsgs, roundPhase, mySide, myUsed, myBudget, oppUsed, oppBudget, roundIdx, proTopic, conTopic) {
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

  const sideName = mySide === 'pro' ? '正方' : '反方';
  const myTopic = mySide === 'pro' ? proTopic : conTopic;
  msg += `\n重申立场：${sideName} —— ${myTopic}\n\n`;
  msg += `轮到你发言了：`;
  return msg;
}

// ═══════════════════════════════════════════════════════════════
//  SSE streaming LLM call
// ═══════════════════════════════════════════════════════════════

async function streamSpeech(brain, messages, maxTokens, onDelta, onDone, debugLabel) {
  const body = {
    model: brain.modelName,
    messages,
    stream: true,
  };
  if (maxTokens) body.max_tokens = maxTokens;

  const url = `${brain.baseUrl}/chat/completions`;
  if (debugLabel) console.log(`[streamSpeech:${debugLabel}] POST`, url, 'body.model:', body.model, 'max_tokens:', body.max_tokens);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${brain.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    if (debugLabel) console.log(`[streamSpeech:${debugLabel}] HTTP ${response.status}:`, err.slice(0, 200));
    throw new Error(`API error ${response.status}: ${err}`);
  }

  if (debugLabel) console.log(`[streamSpeech:${debugLabel}] HTTP ${response.status} OK, reading stream...`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let totalTokens = 0;
  let lineCount = 0;

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

      lineCount++;

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

  if (debugLabel) console.log(`[streamSpeech:${debugLabel}] stream ended, lines:${lineCount} full.length:${full.length}`);
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

  return { phase: 'judging', judgeIndex: state.judgeIndex, label: '裁判评判' };
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
  let usr = buildUserMessage(state.allMsgs, phase, side, myUsed, budget, oppUsed, budget, ++state.roundIdx, state.proTopic, state.conTopic);

  // Send first delta immediately so frontend shows speech bubble & animation
  event.sender.send('debate:delta', {
    roleId: role.id,
    roleName: role.name,
    content: '',
    phase,
    side,
    position: pos,
    isFirst: true,
  });

  // ── Two-step tactical analysis for cross/free debate ──
  const isCrossFree = (phase === 'cross' || phase === 'free');
  let tacticSys, tacticUser;
  if (isCrossFree) {
    const sideName = side === 'pro' ? '正方' : '反方';
    const posName = POSITION_NAMES[pos] || '';
    const myTopic = side === 'pro' ? state.proTopic : state.conTopic;

    tacticSys = `你是辩论赛的${sideName}${posName}，你的立场是：${sideName} —— ${myTopic}\n你的目标是赢下这场比赛。分析当前局势，为你的下一轮发言制定策略。`;

    let historyText = '';
    for (const m of state.allMsgs) {
      const s = m.side === 'pro' ? '正方' : m.side === 'con' ? '反方' : '裁判';
      const p = m.position > 0 ? POSITION_NAMES[m.position] : '';
      historyText += `[${s}${p}]：${m.content}\n`;
    }

    tacticUser = `辩题：正方「${state.proTopic}」vs 反方「${state.conTopic}」\n以下是截至目前本场辩论的全部记录：\n---\n${historyText}---\n\n当前环节：${label}\n双方字数：我方 ${myUsed}/${budget}，对方 ${oppUsed}/${budget}\n\n评估以下维度：\n1. 致命漏洞：对方尚未被有效反驳的逻辑漏洞或事实错误\n2. 防守回应：对方正在攻击我方且尚未有效回应的点\n3. 新攻击角度：尚未展开、但能有力支撑己方立场的新角度\n\n输出两项内容：\n\n策略一：从 1~3 中选当前最重要的一个方向，一句话说明。\n新角度参考（用于后续轮次）：基于维度 3，给一个尚未使用的新攻击角度作为种子。`;

    let analysisText = '';
    await streamSpeech(role.brain, [
      { role: 'system', content: tacticSys },
      { role: 'user', content: tacticUser },
    ], 4096,
      () => {},
      (c) => { analysisText = c; },
      'tactic'
    );

    if (analysisText.trim()) {
      const injectPoint = usr.lastIndexOf('轮到你发言了');
      if (injectPoint !== -1) {
        usr = usr.slice(0, injectPoint) + `战术分析：\n${analysisText.trim()}\n\n` + usr.slice(injectPoint);
        console.log('[tactic] injection done, usr length:', usr.length);
      }
    } else {
      console.log('[tactic] analysis text empty, skipping injection');
    }
  }

  // Debug mode: send both tactical and final prompts
  if (state.debugMode) {
    event.sender.send('debate:prompt', {
      system: sys,
      user: usr,
      tacticSystem: isCrossFree ? tacticSys : undefined,
      tacticUser: isCrossFree ? tacticUser : undefined,
    });
  }

  let speech = '', tokens = 0;
  await streamSpeech(role.brain, [
    { role: 'system', content: sys },
    { role: 'user', content: usr },
  ], 4096,
    (d) => event.sender.send('debate:delta', { roleId: role.id, content: d, isFirst: false }),
    (c, t) => { speech = c; tokens = t; },
    'main'
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
//  Judge phase 1 — one judge per call, per-click model
// ═══════════════════════════════════════════════════════════════

async function executeOneJudge(event, state, judgeIndex) {
  const judgeEntry = state.roleCache.get(state.judgeRoleId);
  if (!judgeEntry) throw new Error(`裁判大脑 ${state.judgeRoleId} 未加载`);
  const judgeBrain = judgeEntry.brain;

  const persona = state.judgePersonas[judgeIndex];
  if (!persona) throw new Error(`裁判索引 ${judgeIndex} 超出范围`);

  // Build full debate history
  let history = '';
  for (const m of state.allMsgs) {
    const s = m.side === 'pro' ? '正方' : m.side === 'con' ? '反方' : '裁判';
    const pos = m.position > 0 ? POSITION_NAMES[m.position] : '';
    history += `[${s}${pos}]：${m.content}\n`;
  }

  const allPositionDefs = [
    ...state.proRoles.map(p => ({ roleId: p.roleId, side: 'pro', position: p.position })),
    ...state.conRoles.map(p => ({ roleId: p.roleId, side: 'con', position: p.position })),
  ];

  // Debug: send prompt for this judge
  if (state.debugMode) {
    const sampleSys = buildJudgeSystemPrompt(persona);
    const debugUsr = `以下是本场辩论的完整记录：\n\n${history}\n\n${JUDGE_SCORING_RULES}\n\n请根据你对 ${persona.name} 的角色定位给出评分：`;
    event.sender.send('debate:prompt', { system: sampleSys, user: debugUsr });
  }

  // 1. Send isFirst delta BEFORE LLM call — immediate thinking box with animation
  event.sender.send('debate:delta', {
    roleId: state.judgeRoleId,
    roleName: `${persona.name} · 裁判`,
    content: '',
    phase: 'judging',
    side: 'judge',
    position: 0,
    isFirst: true,
    personaIndex: judgeIndex,
    totalPersonas: state.judgePersonas.length,
  });

  // 2. Call LLM
  const sys = buildJudgeSystemPrompt(persona);
  const usr = `以下是本场辩论的完整记录：\n\n${history}\n\n${JUDGE_SCORING_RULES}\n\n请根据你对 ${persona.name} 的角色定位给出评分：`;

  let text = '', tokens = 0;
  await streamSpeech(judgeBrain, [
    { role: 'system', content: sys },
    { role: 'user', content: usr },
  ], 8192,
    () => {},
    (c, t) => { text = c; tokens = t; },
    'judge'
  );

  if (!text.trim()) throw new Error(`裁判 ${persona.name} 输出为空`);

  // 3. Parse JSON scores
  let scores;
  try {
    scores = JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim());
  } catch {
    throw new Error(`裁判 ${persona.name} 输出无法解析为 JSON：${text.slice(0, 200)}`);
  }
  if (!Array.isArray(scores)) throw new Error(`裁判 ${persona.name} 输出不是数组`);

  // 4. Validate numeric fields and calculate weighted totals
  const w = persona.weights;
  for (const sc of scores) {
    sc.content = parseInt(sc.content) || 0;
    sc.logic = parseInt(sc.logic) || 0;
    sc.expression = parseInt(sc.expression) || 0;
    sc.rebuttal = parseInt(sc.rebuttal) || 0;
    sc.weightedTotal = sc.content * w.content + sc.logic * w.logic + sc.expression * w.expression + sc.rebuttal * w.rebuttal;
  }

  // 5. Save to DebateScore
  for (const sc of scores) {
    const def = allPositionDefs.find(p => p.side === sc.side && p.position === sc.position);
    if (!def) continue;
    await prisma.debateScore.create({
      data: {
        debateId: state.debateId,
        roleId: def.roleId,
        judgeRoleId: state.judgeRoleId,
        judgePersonaId: persona.id,
        side: sc.side,
        position: sc.position,
        scoreContent: sc.content,
        scoreLogic: sc.logic,
        scoreExpression: sc.expression,
        scoreRebuttal: sc.rebuttal,
        weightedTotal: sc.weightedTotal,
        judgeComment: sc.comment || null,
      },
    });
  }

  // 6. Build readable markdown & stream to frontend with delay
  let readable = `**${persona.name} · 评分**\n\n`;
  readable += `| 辩手 | 内容 | 逻辑 | 表达 | 反驳 | 加权总分 | 评语 |\n`;
  readable += `|------|------|------|------|------|---------|------|\n`;
  for (const sc of scores) {
    const sideLabel = sc.side === 'pro' ? '正方' : '反方';
    const posName = POSITION_NAMES[sc.position] || '';
    readable += `| ${sideLabel}${posName} | ${sc.content ?? '-'} | ${sc.logic ?? '-'} | ${sc.expression ?? '-'} | ${sc.rebuttal ?? '-'} | ${sc.weightedTotal.toFixed(2)} | ${sc.comment || ''} |\n`;
  }

  event.sender.send('debate:delta', {
    roleId: state.judgeRoleId,
    content: readable,
    isFirst: false,
  });

  // 7. Persist judge message to DB
  await prisma.debateMessage.create({
    data: {
      debateId: state.debateId,
      roleId: state.judgeRoleId,
      side: 'judge',
      position: 0,
      round: 'judging',
      content: readable,
      tokenCount: tokens || null,
      charCount: readable.length,
      roundIndex: ++state.roundIdx,
    },
  });

  // 8. Increment judge index for next click
  state.judgeIndex++;

  // 9. Send round_done per judge (enables step button for next judge)
  event.sender.send('debate:round_done', {
    phase: 'judging',
    side: 'judge',
    position: 0,
    label: '裁判评判',
    roleId: state.judgeRoleId,
    roleName: `${persona.name} · 裁判`,
    content: readable,
    charsUsed: readable.length,
    charBudget: 0,
    roundIndex: state.roundIdx,
    personaIndex: judgeIndex,
    totalPersonas: state.judgePersonas.length,
    sideCharsPro: 0,
    sideCharsCon: 0,
  });

  // 10. If last judge, signal judging_done
  if (state.judgeIndex >= state.judgePersonas.length) {
    event.sender.send('debate:judging_done', { personaCount: state.judgePersonas.length });
  }
}

// ═══════════════════════════════════════════════════════════════
//  Judge phase 2 — aggregate scores & determine winner
// ═══════════════════════════════════════════════════════════════

async function aggregateJudging(state) {
  const scores = await prisma.debateScore.findMany({
    where: { debateId: state.debateId, weightedTotal: { not: null } },
  });

  // Group by side+position (not roleId — same role can appear in multiple positions)
  const bySidePos = {};
  for (const sc of scores) {
    const key = `${sc.side}-${sc.position}`;
    if (!bySidePos[key]) {
      bySidePos[key] = { side: sc.side, position: sc.position, totals: [] };
    }
    if (sc.weightedTotal != null) bySidePos[key].totals.push(sc.weightedTotal);
  }

  // Average per debater
  const avgs = Object.values(bySidePos).map(d => ({
    ...d,
    average: d.totals.length > 0 ? d.totals.reduce((a, b) => a + b, 0) / d.totals.length : 0,
  }));

  // Team totals
  const proSum = avgs.filter(d => d.side === 'pro').reduce((s, d) => s + d.average, 0);
  const conSum = avgs.filter(d => d.side === 'con').reduce((s, d) => s + d.average, 0);
  const winner = proSum >= conSum ? 'pro' : 'con';

  // Best debaters
  const allBest = avgs.reduce((best, d) => (!best || d.average > best.average) ? d : best, null);
  const proBest = avgs.filter(d => d.side === 'pro').reduce((best, d) => (!best || d.average > best.average) ? d : best, null);
  const conBest = avgs.filter(d => d.side === 'con').reduce((best, d) => (!best || d.average > best.average) ? d : best, null);

  // Write results
  await prisma.debateResult.create({
    data: {
      debateId: state.debateId,
      winner,
      bestPro: proBest?.position || null,
      bestCon: conBest?.position || null,
      overallBest: allBest?.position || null,
      proTotalScore: proSum,
      conTotalScore: conSum,
      judgeIds: JSON.stringify(state.judgePersonas.map(p => p.id)),
    },
  });

  await prisma.debate.update({
    where: { id: state.debateId },
    data: { status: 'completed' },
  });

  state.completed = true;

  return { winner, bestPro: proBest?.position, bestCon: conBest?.position, overallBest: allBest?.position, proTotal: proSum, conTotal: conSum };
}

// ═══════════════════════════════════════════════════════════════
//  Phase state recovery (for resume)
// ═══════════════════════════════════════════════════════════════

function recoverPhaseState(messages) {
  let phaseIndex = 0;
  let phaseStepIndex = 0;
  let perSideChars = { pro: 0, con: 0 };
  let crossTurn = 'pro';
  let freeTurn = 'pro';

  for (let i = 0; i < ROUNDS.length; i++) {
    const roundDef = ROUNDS[i];
    const phase = roundDef.phase;
    const phaseMsgs = messages.filter(m => m.round === phase);
    const phaseChars = { pro: 0, con: 0 };
    for (const m of phaseMsgs) {
      const c = m.charCount || m.content.length || 0;
      if (m.side === 'pro') phaseChars.pro += c;
      if (m.side === 'con') phaseChars.con += c;
    }

    let phaseComplete = false;
    if (roundDef.speakerList) {
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

    if (i === ROUNDS.length - 1) {
      phaseIndex = ROUNDS.length;
    }
  }

  return { phaseIndex, phaseStepIndex, perSideChars, crossTurn, freeTurn };
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
    const { proTopic, conTopic, background, proRoles, conRoles, judgeBrainId, debugMode } = params;

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

    // Judge — directly load brain, no role persona
    const judgeBrain = await prisma.brain.findUnique({
      where: { id: judgeBrainId },
    });
    if (!judgeBrain) throw new Error(`裁判大脑 ${judgeBrainId} 不存在`);
    roleCache.set(judgeBrainId, { name: '裁判', brain: judgeBrain });

    await prisma.debatePosition.create({
      data: { debateId: debate.id, roleId: judgeBrainId, side: 'judge', position: 0, brainId: judgeBrainId },
    });

    // Randomly select 3 judge personas
    const selectedPersonas = pickN(3, JUDGE_PERSONAS);

    // Persist selected personas
    await prisma.debate.update({
      where: { id: debate.id },
      data: { judgePersonas: JSON.stringify(selectedPersonas.map(p => p.id)) },
    });

    // 3. Initialize state
    const state = {
      debateId: debate.id,
      proTopic, conTopic, background,
      proRoles: allPositionDefs.filter(p => p.side === 'pro'),
      conRoles: allPositionDefs.filter(p => p.side === 'con'),
      judgeRoleId: judgeBrainId,
      judgePersonas: selectedPersonas,
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
      judgeIndex: 0,
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

    // Load roles for debaters, load brain for judge
    const roleCache = new Map();
    const positionDefs = debate.positions.filter(p => p.side !== 'judge');
    const judgePosition = debate.positions.find(p => p.side === 'judge');

    for (const pos of positionDefs) {
      const role = await prisma.role.findUnique({
        where: { id: pos.roleId },
        include: { brain: true },
      });
      if (role) roleCache.set(pos.roleId, role);
    }

    // Judge uses brain directly (no role persona)
    let judgeRoleId = '';
    if (judgePosition) {
      judgeRoleId = judgePosition.roleId;
      const brain = await prisma.brain.findUnique({ where: { id: judgePosition.brainId } });
      if (brain) roleCache.set(judgeRoleId, { name: '裁判', brain });
    }

    // Recover judge personas from DB
    let judgePersonas = [];
    if (debate.judgePersonas) {
      const personaIds = JSON.parse(debate.judgePersonas);
      judgePersonas = personaIds.map(id => JUDGE_PERSONAS.find(p => p.id === id)).filter(Boolean);
    }

    // Reconstruct state from existing messages
    const allMsgs = debate.messages.map(m => ({
      side: m.side, position: m.position, content: m.content, phase: m.round,
    }));

    // Determine current phase via shared recovery logic
    const { phaseIndex, phaseStepIndex, perSideChars, crossTurn, freeTurn } = recoverPhaseState(debate.messages);

    const state = {
      debateId: debate.id,
      proTopic: debate.proTopic,
      conTopic: debate.conTopic,
      background: debate.background,
      proRoles: positionDefs.filter(p => p.side === 'pro').map(p => ({ roleId: p.roleId, position: p.position })),
      conRoles: positionDefs.filter(p => p.side === 'con').map(p => ({ roleId: p.roleId, position: p.position })),
      judgeRoleId,
      judgePersonas,
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
      judgeIndex: 0,
    };

    // Count already-processed judges from DebateScore to set correct judgeIndex
    const existingJudgeIds = await prisma.debateScore.findMany({
      where: { debateId: debate.id, judgePersonaId: { not: null } },
      select: { judgePersonaId: true },
      distinct: ['judgePersonaId'],
    });
    state.judgeIndex = existingJudgeIds.length;
    if (state.judgeIndex >= judgePersonas.length) {
      state.judgeIndex = judgePersonas.length;
    }

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
        await executeOneJudge(event, state, speaker.judgeIndex);
        return;
      }

      await executeSpeech(event, state, speaker);
    } catch (err) {
      console.error('[debate:step]', err);
      event.sender.send('debate:error', { error: err.message || '发言过程出错' });
    }
  });

  // ── Aggregate judge results (Phase 2) ──
  ipcMain.handle('debate:aggregate', async (_event, { debateId }) => {
    const state = active.get(debateId);
    if (!state) throw new Error(`辩论 ${debateId} 未找到或已结束`);
    if (state.completed) throw new Error('辩论已结束');

    return aggregateJudging(state);
  });
};
