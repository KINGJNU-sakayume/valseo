// 리포트(JSON) → 마크다운 요약. GitHub Actions 의 $GITHUB_STEP_SUMMARY 로 보낸다.
// node sim/summary.js report.json
import { readFileSync } from 'node:fs';
import { TARGETS } from './targets.js';

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const s = report.summary;
const lines = [
  `## 밸런스 리포트 (${report.agent ?? 'chamber'}, ${report.bot}, 분기 ${report.branch ?? 'alt'}, 시드 ${report.seeds[0]}–${report.seeds[1]}, ${s.games}판, ${report.elapsedSec}초)`,
  '',
  '| 지표 | 값 | 목표 | |',
  '|---|---|---|---|',
];
let ok = true;
for (const [key, [lo, hi]] of Object.entries(TARGETS)) {
  const v = s[key];
  const pass = v >= lo && v <= hi;
  ok &&= pass;
  lines.push(`| ${key} | ${v} | ${lo} ~ ${hi} | ${pass ? '✅' : '⚠️'} |`);
}
lines.push(
  '',
  `- 라운드별 사망: ${Object.entries(s.deathsByRound).map(([r, n]) => `R${r} ${n}`).join(', ') || '없음'}`,
  `- 평균 처치 ${s.avgKills} · 평균 DPS ${s.avgDps} · 평균 크레딧 이월 ${s.avgCreditCarry} · 진화 발생률 ${s.evolutionRate}`,
  `- 최종 총기: ${Object.entries(s.finalGuns).map(([g, n]) => `${g} ${n}`).join(', ')}`,
  `- 분기 선택(판당): ${Object.entries(s.branchPicksPerGame).map(([k, v]) => `${k} ${v}`).join(', ')}`,
  `- 구매(판당): ${Object.entries(s.buysPerGame).map(([k, v]) => `${k} ${v}`).join(', ')}`,
  '',
  '| 주무기 | 판 수 | 승률 | 평균 생존 |',
  '|---|---|---|---|',
  ...Object.entries(s.winRateByGun ?? {}).map(([g, e]) => `| ${g} | ${e.games} | ${e.winRate} | ${e.avgSurvivalRound} |`),
  '',
  '| 분기 | 판 수 | 승률 | 평균 생존 |',
  '|---|---|---|---|',
  ...Object.entries(s.winRateByBranch ?? {}).map(([b, e]) => `| ${b} | ${e.games} | ${e.winRate} | ${e.avgSurvivalRound} |`),
  '',
  ok ? '모든 지표가 목표 범위 안입니다.' : '목표 범위를 벗어난 지표가 있습니다. `src/data/` 수치를 조정하세요.',
);
console.log(lines.join('\n'));
