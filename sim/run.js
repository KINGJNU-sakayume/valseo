// 헤드리스 시뮬레이터: node sim/run.js --seeds 300 --bot greedy --out report.json
import { tagCounts } from '../src/core/systems/tactics.js';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { createGame, step, choose } from '../src/core/game.js';
import { ROUNDS } from '../src/data/rounds.js';
import { DT } from '../src/data/balance.js';

function parseArgs(argv) {
  const args = { seeds: 100, start: 1, bot: 'greedy', agent: 'chamber', branch: 'alt', out: null, workers: Math.max(1, cpus().length - 1), quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--seeds') (args.seeds = Number(v)), i++;
    else if (a === '--start') (args.start = Number(v)), i++;
    else if (a === '--bot') (args.bot = v), i++;
    else if (a === '--branch') (args.branch = v), i++;
    else if (a === '--agent') (args.agent = v), i++;
    else if (a === '--gun') (args.gun = v), i++;
    else if (a === '--archetype') (args.archetype = v), i++;
    else if (a === '--out') (args.out = v), i++;
    else if (a === '--workers') (args.workers = Number(v)), i++;
    else if (a === '--quiet') args.quiet = true;
  }
  return args;
}

/** 한 판을 끝까지 돌리고 요약을 돌려준다. */
export function playOne(seed, bot, botOpts = {}) {
  const s = createGame(seed, botOpts.agent ?? 'chamber');
  const r = { seed, damage: 0, combatTicks: 0, cards: {}, branches: {}, buys: {}, carry: [], evolved: [] };
  const count = (o, k) => (o[k] = (o[k] ?? 0) + 1);
  while (s.phase === 'COMBAT' || s.phase === 'SWEEP' || s.phase === 'BUY') {
    if (s.pending) {
      if (s.pending.kind === 'shop') {
        const i = bot.choose(s, botOpts);
        if (s.pending.options[i].kind === 'next') r.carry.push(s.credits);
        choose(s, i);
      } else {
        choose(s, bot.choose(s, botOpts));
      }
    } else {
      step(s, bot.decide(s));
      r.combatTicks++;
    }
    for (const ev of s.events) {
      if (ev.type === 'hit') r.damage += ev.damage;
      else if (ev.type === 'card') count(r.cards, ev.card.type === 'gunMod' ? `mod:${ev.card.gunId}:${ev.card.key}` : `${ev.card.type}:${ev.card.key ?? ''}`);
      else if (ev.type === 'buy') count(r.buys, ev.id ? `${ev.kind}:${ev.id}` : ev.kind);
      else if (ev.type === 'branch') count(r.branches, `${ev.skill}${ev.branch}`);
      else if (ev.type === 'mastery') count(r.branches, `${ev.skill}:${ev.mastery}`);
      else if (ev.type === 'evolve') r.evolved.push(ev.gun);
    }
    s.events.length = 0; // choose() 는 이벤트를 비우지 않으므로 한 번만 집계되게 직접 비운다
  }
  return {
    ...r,
    win: s.phase === 'VICTORY',
    round: s.round,
    level: s.player.level,
    kills: s.stats.kills,
    guns: s.player.guns.filter(Boolean).map((g) => `${g.id}${g.tier}${g.evolved ? '*' : ''}`),
    skills: Object.fromEntries(Object.entries(s.player.skills).map(([k, v]) => [k, `${v.level}${v.branch ?? ''}`])),
    archetype: archetypeOf(s),
    tactics: Object.keys(s.player.tactics),
    relics: [...(s.player.relics ?? [])],
    utils: (s.player.utils ?? []).map((u) => u.id),
    synths: Object.keys(s.player.synths ?? {}),
  };
}

/** 빌드 아키타입: 카드·증강·계약·유물 태그 중 가장 많은 것 (동률이면 태그 이름순). 없으면 'none'. */
export function archetypeOf(state) {
  const t = tagCounts(state, false);
  const best = Object.entries(t).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? best[0] : 'none';
}

/** 항목(목록 필드)별 승률·생존. */
function rateBy(results, key) {
  const by = {};
  for (const r of results) {
    for (const k of new Set([].concat(r[key] ?? []))) {
      const e = (by[k] ??= { games: 0, wins: 0, rounds: 0 });
      e.games++;
      e.wins += r.win ? 1 : 0;
      e.rounds += r.win ? ROUNDS.count : r.round;
    }
  }
  return Object.fromEntries(Object.entries(by).sort((a, b) => b[1].games - a[1].games).map(([k, e]) => [k, {
    games: e.games, winRate: +(e.wins / e.games).toFixed(3), avgSurvivalRound: +(e.rounds / e.games).toFixed(2),
  }]));
}

function aggregate(results) {
  const n = results.length;
  const avg = (f) => results.reduce((a, r) => a + f(r), 0) / n;
  const sumMaps = (f) => {
    const out = {};
    for (const r of results) for (const [k, v] of Object.entries(f(r))) out[k] = (out[k] ?? 0) + v;
    return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / n).toFixed(3)]));
  };
  const deaths = {};
  for (const r of results) if (!r.win) deaths[r.round] = (deaths[r.round] ?? 0) + 1;
  const carries = results.flatMap((r) => r.carry);
  // 분기별: 그 분기를 고른 판들의 승률·평균 생존 라운드
  const byBranch = {};
  for (const r of results) {
    for (const b of Object.keys(r.branches)) {
      const e = (byBranch[b] ??= { games: 0, wins: 0, rounds: 0 });
      e.games++;
      e.wins += r.win ? 1 : 0;
      e.rounds += r.win ? ROUNDS.count : r.round;
    }
  }
  // 총기별: 최종 주무기(없으면 '없음') 기준 승률·평균 생존
  const byGun = {};
  for (const r of results) {
    const g = r.guns.map((x) => x.replace(/\d\*?$/, '')).find((x) => ['vandal', 'judge', 'operator'].includes(x)) ?? 'none';
    const e = (byGun[g] ??= { games: 0, wins: 0, rounds: 0 });
    e.games++;
    e.wins += r.win ? 1 : 0;
    e.rounds += r.win ? ROUNDS.count : r.round;
  }
  const winRateByGun = Object.fromEntries(Object.entries(byGun).sort().map(([g, e]) => [g, {
    games: e.games, winRate: +(e.wins / e.games).toFixed(3), avgSurvivalRound: +(e.rounds / e.games).toFixed(2),
  }]));
  const winRateByBranch = Object.fromEntries(Object.entries(byBranch).sort().map(([b, e]) => [b, {
    games: e.games, winRate: +(e.wins / e.games).toFixed(3), avgSurvivalRound: +(e.rounds / e.games).toFixed(2),
  }]));
  const finalGuns = {};
  for (const r of results) for (const g of r.guns) finalGuns[g] = (finalGuns[g] ?? 0) + 1;
  return {
    games: n,
    winRate: +(results.filter((r) => r.win).length / n).toFixed(3),
    avgSurvivalRound: +avg((r) => (r.win ? ROUNDS.count : r.round)).toFixed(2),
    deathsByRound: Object.fromEntries(Object.entries(deaths).sort((a, b) => a[0] - b[0])),
    avgLevel: +avg((r) => r.level).toFixed(2),
    // 설계 목표 "12라운드 도달 시 레벨 18~22" 를 재는 지표 (일찍 죽은 판은 제외)
    avgLevelAtFinalRound: (() => {
      const reached = results.filter((r) => r.win || r.round >= ROUNDS.count);
      return reached.length ? +(reached.reduce((a, r) => a + r.level, 0) / reached.length).toFixed(2) : null;
    })(),
    avgLevelOfWinners: results.some((r) => r.win) ? +(results.filter((r) => r.win).reduce((a, r) => a + r.level, 0) / results.filter((r) => r.win).length).toFixed(2) : null,
    avgKills: +avg((r) => r.kills).toFixed(1),
    avgCreditCarry: carries.length ? Math.round(carries.reduce((a, b) => a + b, 0) / carries.length) : 0,
    avgDps: +avg((r) => r.damage / Math.max(1, r.combatTicks * DT)).toFixed(1),
    evolutionRate: +(results.filter((r) => r.evolved.length > 0).length / n).toFixed(3),
    cardPicksPerGame: sumMaps((r) => r.cards),
    branchPicksPerGame: sumMaps((r) => r.branches),
    winRateByBranch,
    winRateByGun,
    buysPerGame: sumMaps((r) => r.buys),
    // 다양성 (설계 16장): 아키타입 분포 엔트로피 (비트), 아키타입·전술·유물·계약별 승률
    buildEntropy: (() => {
      const c = {};
      for (const r of results) c[r.archetype] = (c[r.archetype] ?? 0) + 1;
      return +Object.values(c).reduce((h, k) => h - (k / n) * Math.log2(k / n), 0).toFixed(3);
    })(),
    winRateByArchetype: rateBy(results, 'archetype'),
    winRateByTactic: rateBy(results, 'tactics'),
    winRateByRelic: rateBy(results, 'relics'),
    winRateByUtil: rateBy(results, 'utils'),
    synthsPerGame: +avg((r) => r.synths.length).toFixed(3),
    finalGuns: Object.fromEntries(Object.entries(finalGuns).sort((a, b) => b[1] - a[1])),
  };
}

async function loadBot(name) {
  return import(`./bots/${name}.js`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seeds = Array.from({ length: args.seeds }, (_, i) => args.start + i);
  const t0 = performance.now();
  const n = Math.min(args.workers, seeds.length);
  const chunks = Array.from({ length: n }, (_, w) => seeds.filter((_, i) => i % n === w));
  let done = 0;
  const parts = await Promise.all(chunks.map((chunk) => new Promise((resolve, reject) => {
    const worker = new Worker(self, { workerData: { seeds: chunk, bot: args.bot, botOpts: { branch: args.branch, agent: args.agent, gun: args.gun, archetype: args.archetype } } });
    const out = [];
    worker.on('message', (m) => {
      out.push(m);
      done++;
      if (!args.quiet) process.stderr.write(`\r${done}/${seeds.length}`);
    });
    worker.on('error', reject);
    worker.on('exit', () => resolve(out));
  })));
  if (!args.quiet) process.stderr.write('\n');
  const results = parts.flat().sort((a, b) => a.seed - b.seed);
  const report = {
    bot: args.bot,
    agent: args.agent,
    branch: args.branch,
    seeds: [seeds[0], seeds[seeds.length - 1]],
    elapsedSec: +((performance.now() - t0) / 1000).toFixed(1),
    summary: aggregate(results),
    games: results.map(({ seed, win, round, level, kills, guns, skills }) => ({ seed, win, round, level, kills, guns, skills })),
  };
  if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ bot: report.bot, elapsedSec: report.elapsedSec, ...report.summary }, null, 2));
}

const self = fileURLToPath(import.meta.url);
if (isMainThread && process.argv[1] === self) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else if (!isMainThread) {
  const bot = await loadBot(workerData.bot);
  for (const seed of workerData.seeds) parentPort.postMessage(playOne(seed, bot, workerData.botOpts));
}
