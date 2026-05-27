// ── Debate orchestration handler ──
// LLM 编排，不是 Agent — 没有工具调用，没有 ReAct 循环。
// 只是按规则依次调 LLM，喂入全部上下文，输出当前环节的发言。

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════
//  Round definitions
// ═══════════════════════════════════════════════════════════════
const ROUNDS = [
  { phase: 'opening', label: '立论',     budget: 700, maxTokens: 780, speakerList: [{ side: 'pro', pos: 1 }, { side: 'con', pos: 1 }] },
  { phase: 'rebuttal', label: '驳论',    budget: 400, maxTokens: 480, speakerList: [{ side: 'con', pos: 2 }, { side: 'pro', pos: 2 }] },
  { phase: 'cross', label: '对辩',      budget: 400, maxTokens: null, speakers: 'cross', speakerPositions: [{ side: 'pro', pos: 3 }, { side: 'con', pos: 3 }] },
  { phase: 'free', label: '自由辩论',   budget: 1600, maxTokens: null, speakers: 'free' },
  { phase: 'closing', label: '总结',     budget: 700, maxTokens: 780, speakerList: [{ side: 'con', pos: 4 }, { side: 'pro', pos: 4 }] },
];

const POSITION_NAMES = ['', '一辩', '二辩', '三辩', '四辩'];

// ═══════════════════════════════════════════════════════════════
//  Prompts
// ═══════════════════════════════════════════════════════════════
const PHASE_PROMPTS = {
  opening: {
    pro: '现在是你方立论环节。作为正方开篇，为本场辩论定下基调。篇幅建议 600~700 tokens 之间。',
    con: '现在是你方立论环节。作为反方开篇，建立本方论证框架。篇幅建议 600~700 tokens 之间。',
  },
  rebuttal: {
    con: '现在是驳论环节，你的任务是反驳正方立论、加固本方立场。篇幅建议 300~400 tokens 之间。',
    pro: '现在是驳论环节，你的任务是反驳反方立论、修复和巩固本方立场。篇幅建议 300~400 tokens 之间。',
  },
  cross: '现在进入对辩环节，你和对方三辩多轮交替发言。留意上方的 token 配额——你方还剩多少、对方还剩多少，都是重要信息。建议单次控制在 80 tokens 以内，一句有力的质问或回应往往比长篇大论更有效，但不强制。\n如果你方 token 用完，本轮失去发言权；如果对方 token 先用完，你方依然可以继续输出直到自己也耗尽——可以一次打完所有剩余 token，也可以继续保持多轮短促输出。',
  free: '现在是自由辩论环节，双方交替发言，节奏紧凑。每次随机选派一名辩手出场，现在轮到你。\n\n留意上方的 token 配额——你方还剩多少、对方还剩多少，都是重要信息。建议单次控制在 80 tokens 以内，一句有力的质问或回应往往比长篇大论更有效，但不强制。\n如果你方 token 用完，本轮失去发言权；如果对方 token 先用完，你方依然可以继续输出直到自己也耗尽——可以一次打完所有剩余 token，也可以继续保持多轮短促输出。',
  closing: {
    con: '现在是总结陈词环节，你是反方收尾。回顾全场，指出正方始终未能解决的问题，升华本方立场。篇幅建议 600~700 tokens 之间。',
    pro: '现在是总结陈词环节，你是正方收尾。回顾全场，指出反方始终未能有效回击的核心论点，升华本方立场。篇幅建议 600~700 tokens 之间。',
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
    msg += `我方已使用 ${myUsed} tokens（共 ${myBudget}），对方已使用 ${oppUsed} tokens（共 ${oppBudget}）\n`;
    msg += `（本次最多可输出 ${myRem + 80} tokens，累计达到 ${myBudget} tokens 后我方失去发言权）\n`;
  } else if (roundDef) {
    const lo = Math.round(roundDef.budget * 0.85);
    msg += `本环节建议输出约 ${lo}~${roundDef.budget} tokens 的内容。\n`;
  }

  msg += `\n轮到你发言了：`;
  return msg;
}

// ═══════════════════════════════════════════════════════════════
//  SSE streaming LLM call
// ═══════════════════════════════════════════════════════════════

async function streamSpeech(event, brain, messages, maxTokens, onDelta, onDone) {
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
        positions: { include: { role: { select: { id: true, name: true } } } },
        messages: { orderBy: { createdAt: 'asc' } },
        scores: true,
        result: true,
      },
    });
  });

  // ── Stop ──
  ipcMain.on('debate:stop', () => {
    for (const [id, ctrl] of active) {
      ctrl.abort();
      active.delete(id);
    }
  });

  // ── Start ──
  ipcMain.on('debate:start', async (event, params) => {
    const { proTopic, conTopic, background, proRoles, conRoles, judgeRoleId } = params;

    let debateId;
    const ctrl = new AbortController();

    try {
      // ── 1. Create debate ──
      const debate = await prisma.debate.create({
        data: { proTopic, conTopic, background: background || null, status: 'ongoing' },
      });
      debateId = debate.id;
      active.set(debateId, ctrl);

      // ── 2. Load all roles+brains, create positions ──
      const allPositionDefs = [
        ...proRoles.map((rid, i) => ({ roleId: rid, side: 'pro', position: i + 1 })),
        ...conRoles.map((rid, i) => ({ roleId: rid, side: 'con', position: i + 1 })),
        { roleId: judgeRoleId, side: 'judge', position: 0 },
      ];

      /** @type {Map<string, { id: string, name: string, soul: string, rule: string, brain: { id: string, baseUrl: string, apiKey: string, modelName: string } }>} */
      const roleCache = new Map();

      for (const def of allPositionDefs) {
        const role = await prisma.role.findUnique({
          where: { id: def.roleId },
          include: { brain: true },
        });
        if (!role) throw new Error(`角色 ${def.roleId} 不存在`);
        roleCache.set(def.roleId, role);

        await prisma.debatePosition.create({
          data: { debateId, roleId: def.roleId, side: def.side, position: def.position, brainId: role.brainId },
        });
      }

      const proPositions = allPositionDefs.filter(p => p.side === 'pro');
      const conPositions = allPositionDefs.filter(p => p.side === 'con');

      // ── 3. Run rounds ──
      let allMsgs = [];
      let roundIdx = 0;
      const totalTokens = { pro: 0, con: 0 };
      let perSideTokens = { pro: 0, con: 0 }; // reset per alternating round

      for (const round of ROUNDS) {
        if (ctrl.signal.aborted) break;

        if (round.speakers === 'cross' || round.speakers === 'free') {
          perSideTokens = { pro: 0, con: 0 };
        }

        event.sender.send('debate:progress', {
          phase: round.phase, speakerRoleId: '', side: '', position: '',
        });

        // ── Alternating rounds (对辩 / 自由辩论) ──
        if (round.speakers === 'cross' || round.speakers === 'free') {
          let turn = 'pro';

          while (true) {
            if (ctrl.signal.aborted) break;

            const opp = turn === 'pro' ? 'con' : 'pro';
            const used = perSideTokens[turn];
            const oppUsed = perSideTokens[opp];

            if (used >= round.budget) {
              if (oppUsed >= round.budget) break;
              turn = opp;
              continue;
            }

            // Pick speaker
            const pool = turn === 'pro' ? proPositions : conPositions;
            const posDef = round.speakers === 'cross'
              ? pool.find(p => p.position === (turn === 'pro' ? 3 : 3))
              : pickFreeDebater(pool);

            if (!posDef) { turn = opp; continue; }

            const role = roleCache.get(posDef.roleId);
            const maxTk = round.budget - used + 80;

            const sys = buildSystemPrompt(role, turn, posDef.position, proTopic, conTopic, background, round.phase);
            const usr = buildUserMessage(allMsgs, round.phase, turn, used, round.budget, oppUsed, round.budget, ++roundIdx);

            event.sender.send('debate:progress', {
              phase: round.phase, speakerRoleId: role.id, side: turn, position: String(posDef.position),
            });

            let speech = '', tokens = 0;
            await streamSpeech(event, role.brain, [
              { role: 'system', content: sys },
              { role: 'user', content: usr },
            ], maxTk,
              (d) => event.sender.send('debate:message', { roleId: role.id, content: d, tokensUsed: 0, done: false }),
              (c, t) => { speech = c; tokens = t; }
            );

            perSideTokens[turn] += tokens;
            totalTokens[turn] += tokens;

            await prisma.debateMessage.create({
              data: { debateId, roleId: role.id, side: turn, position: posDef.position, round: round.phase, content: speech, tokenCount: tokens, roundIndex: roundIdx },
            });
            allMsgs.push({ side: turn, position: posDef.position, content: speech });
            event.sender.send('debate:message', { roleId: role.id, content: '', tokensUsed: tokens, done: true });

            turn = opp;
          }

        // ── Fixed speaker rounds (立论 / 驳论 / 总结) ──
        } else if (round.speakerList) {
          for (const sp of round.speakerList) {
            if (ctrl.signal.aborted) break;

            const pool = sp.side === 'pro' ? proPositions : conPositions;
            const posDef = pool.find(p => p.position === sp.pos);
            if (!posDef) continue;

            const role = roleCache.get(posDef.roleId);

            const sys = buildSystemPrompt(role, sp.side, sp.pos, proTopic, conTopic, background, round.phase);
            const usr = buildUserMessage(allMsgs, round.phase, sp.side, 0, round.budget, 0, round.budget, ++roundIdx);

            event.sender.send('debate:progress', {
              phase: round.phase, speakerRoleId: role.id, side: sp.side, position: String(sp.pos),
            });

            let speech = '', tokens = 0;
            await streamSpeech(event, role.brain, [
              { role: 'system', content: sys },
              { role: 'user', content: usr },
            ], round.maxTokens,
              (d) => event.sender.send('debate:message', { roleId: role.id, content: d, tokensUsed: 0, done: false }),
              (c, t) => { speech = c; tokens = t; }
            );

            totalTokens[sp.side] += tokens;

            await prisma.debateMessage.create({
              data: { debateId, roleId: role.id, side: sp.side, position: sp.pos, round: round.phase, content: speech, tokenCount: tokens, roundIndex: roundIdx },
            });
            allMsgs.push({ side: sp.side, position: sp.pos, content: speech });
            event.sender.send('debate:message', { roleId: role.id, content: '', tokensUsed: tokens, done: true });
          }
        }
      }

      if (ctrl.signal.aborted) {
        event.sender.send('debate:error', { error: '辩论已中止' });
        active.delete(debateId);
        return;
      }

      // ── 4. Judge ──
      event.sender.send('debate:progress', {
        phase: 'judging', speakerRoleId: judgeRoleId, side: 'judge', position: '0',
      });

      const judgeRole = roleCache.get(judgeRoleId);
      let judgeText = '';

      {
        let history = '';
        for (const m of allMsgs) {
          const s = m.side === 'pro' ? '正方' : '反方';
          const pos = m.position > 0 ? POSITION_NAMES[m.position] : '';
          history += `[${s}${pos}]：${m.content}\n`;
        }

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
        judgeText = data.choices?.[0]?.message?.content || '';

        event.sender.send('debate:message', { roleId: judgeRoleId, content: judgeText, tokensUsed: 0, done: false });
        event.sender.send('debate:message', { roleId: judgeRoleId, content: '', tokensUsed: 0, done: true });

        await prisma.debateMessage.create({
          data: { debateId, roleId: judgeRoleId, side: 'judge', position: 0, round: 'judging', content: judgeText, tokenCount: data.usage?.completion_tokens || Math.ceil(judgeText.length * 0.35), roundIndex: ++roundIdx },
        });
      }

      // ── 5. Parse judge result ──
      let judgeResult;
      try {
        judgeResult = JSON.parse(judgeText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim());
      } catch {
        throw new Error('裁判输出无法解析为 JSON');
      }

      // Save scores
      if (judgeResult.scores) {
        for (const sc of judgeResult.scores) {
          const def = allPositionDefs.find(p => p.side === sc.side && p.position === sc.position);
          if (!def) continue;
          await prisma.debateScore.create({
            data: {
              debateId, roleId: def.roleId, side: sc.side, position: sc.position,
              scoreContent: sc.content, scoreLogic: sc.logic, scoreExpression: sc.expression, scoreRebuttal: sc.rebuttal,
              totalScore: (sc.content || 0) * 0.30 + (sc.logic || 0) * 0.25 + (sc.expression || 0) * 0.20 + (sc.rebuttal || 0) * 0.25,
              judgeComment: sc.comment,
            },
          });
        }
      }

      await prisma.debateResult.create({
        data: {
          debateId, winner: judgeResult.winner || 'pro',
          bestPro: judgeResult.bestPro || null, bestCon: judgeResult.bestCon || null,
          overallBest: judgeResult.overallBest || null, bestSide: judgeResult.bestSide || null,
          judgeSummary: judgeResult.summary || null,
        },
      });

      await prisma.debate.update({
        where: { id: debateId },
        data: { status: 'completed', summary: judgeResult.summary || null },
      });

      event.sender.send('debate:done', {
        winner: judgeResult.winner,
        scores: judgeResult.scores || [],
        summary: judgeResult.summary || '',
      });

      active.delete(debateId);

    } catch (err) {
      console.error('[debate]', err);
      event.sender.send('debate:error', { error: err.message || '辩论过程出错' });
      if (debateId) active.delete(debateId);
    }
  });
};
