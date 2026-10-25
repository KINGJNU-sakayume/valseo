// 에이전트별 최고 기록. 브라우저에만 저장하고, 저장이 막혀 있어도 게임은 그대로 돈다.
const KEY = 'crossfire.records';

const EMPTY = { runs: 0, wins: 0, bestRound: 0, bestKills: 0, fastestWin: null };

export function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function save(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // 저장 불가 환경: 이번 세션에서만 유지
  }
}

export const recordOf = (all, agent) => ({ ...EMPTY, ...(all[agent] ?? {}) });

/**
 * 한 판 결과를 반영하고, 새로 갱신된 항목 이름 목록을 돌려준다.
 * result: { agent, win, round, kills, time }
 */
export function submitRun(all, result) {
  const r = recordOf(all, result.agent);
  const fresh = [];
  r.runs++;
  if (result.win) r.wins++;
  if (result.round > r.bestRound) {
    r.bestRound = result.round;
    fresh.push('round');
  }
  if (result.kills > r.bestKills) {
    r.bestKills = result.kills;
    fresh.push('kills');
  }
  if (result.win && (r.fastestWin == null || result.time < r.fastestWin)) {
    r.fastestWin = result.time;
    fresh.push('time');
  }
  all[result.agent] = r;
  save(all);
  return fresh;
}
