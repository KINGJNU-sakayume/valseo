// 패치 후보 비교: 같은 시드에서 원래 수치와 후보 수치를 한 작업 풀로 함께 돌린다.
//   node sim/compare.js --agent brimstone --seeds 100 --patch sim/patches/a.json --patch sim/patches/b.json
//   (--agent all 이면 요원 전부, --workers 로 병렬 수)
// 승률 차이 옆의 ±는 95% 신뢰구간 반폭이다. 차이가 ± 보다 작으면 판 수를 늘려 다시 본다.
import { runJobs, defaultWorkers } from './pool.js';
import { loadPatch } from './patch.js';
import { agentList } from './run.js';
import { ROUNDS } from '../src/data/rounds.js';
import { TARGETS } from './targets.js';

function parseArgs(argv) {
  const args = { seeds: 100, start: 1, bot: 'greedy', agent: 'chamber', branch: 'alt', patches: [], workers: defaultWorkers(), quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--seeds') (args.seeds = Number(v)), i++;
    else if (a === '--start') (args.start = Number(v)), i++;
    else if (a === '--bot') (args.bot = v), i++;
    else if (a === '--branch') (args.branch = v), i++;
    else if (a === '--agent') (args.agent = v), i++;
    else if (a === '--patch') args.patches.push(v), i++;
    else if (a === '--workers') (args.workers = Number(v)), i++;
    else if (a === '--quiet') args.quiet = true;
  }
  return args;
}

/** 결과 묶음 → 승률·생존 요약 */
export function stats(rs) {
  const n = rs.length;
  const wins = rs.filter((r) => r.win).length;
  const p = wins / n;
  return {
    n,
    winRate: p,
    se: Math.sqrt((p * (1 - p)) / n),
    survival: rs.reduce((a, r) => a + (r.win ? ROUNDS.count : r.round), 0) / n,
    evolution: rs.filter((r) => r.evolved.length > 0).length / n,
  };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const signed = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%p`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.patches.length === 0) throw new Error('--patch 파일을 하나 이상 주세요');
  const agents = agentList(args.agent);
  const patches = args.patches.map(loadPatch);
  const seeds = Array.from({ length: args.seeds }, (_, i) => args.start + i);
  const variants = [undefined, ...patches.map((_, i) => i)];
  // 같은 패치끼리 이어지게 넣어 worker 의 패치 전환을 줄인다
  const jobs = variants.flatMap((patch) => seeds.flatMap((seed) => agents.map((agent) => ({ seed, agent, patch }))));
  const t0 = performance.now();
  const results = await runJobs(jobs, {
    bot: args.bot,
    botOpts: { branch: args.branch },
    patches,
    workers: args.workers,
    onDone: args.quiet ? null : (d, n) => process.stderr.write(`\r${d}/${n}`),
  });
  if (!args.quiet) process.stderr.write('\n');
  const [lo, hi] = TARGETS.winRate;
  const lines = [
    `## 패치 비교 (${args.bot}, 시드 ${seeds[0]}–${seeds[seeds.length - 1]}, 조건마다 ${seeds.length}판, ${((performance.now() - t0) / 1000).toFixed(0)}초)`,
    '',
    `목표 승률 ${pct(lo)}~${pct(hi)}. ±는 95% 신뢰구간.`,
    '',
    '| 요원 | 조건 | 승률 | 차이 | 평균 생존 | 진화 |',
    '|---|---|---|---|---|---|',
  ];
  for (const agent of agents) {
    const base = stats(results.filter((r) => r.agent === agent && r.patch === undefined));
    lines.push(`| ${agent} | 원래 수치 | ${pct(base.winRate)} | | ${base.survival.toFixed(2)} | ${pct(base.evolution)} |`);
    patches.forEach((p, i) => {
      const s = stats(results.filter((r) => r.agent === agent && r.patch === i));
      const ci = 1.96 * Math.hypot(base.se, s.se);
      const inRange = s.winRate >= lo && s.winRate <= hi ? '✅' : '⚠️';
      lines.push(`| ${agent} | ${p.title} | ${pct(s.winRate)} ${inRange} | ${signed(s.winRate - base.winRate)} ±${(ci * 100).toFixed(1)} | ${s.survival.toFixed(2)} | ${pct(s.evolution)} |`);
    });
  }
  console.log(lines.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
