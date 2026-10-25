import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submitRun, recordOf, loadRecords } from '../src/render/records.js';

test('기록: 저장소가 없어도 동작하고, 갱신된 항목만 NEW', () => {
  const all = loadRecords(); // Node 에는 localStorage 가 없다 → 빈 기록
  assert.deepEqual(all, {});
  assert.deepEqual(submitRun(all, { agent: 'chamber', win: false, round: 6, kills: 500, time: 600 }), ['round', 'kills']);
  assert.deepEqual(submitRun(all, { agent: 'chamber', win: false, round: 5, kills: 700, time: 500 }), ['kills']);
  assert.deepEqual(submitRun(all, { agent: 'chamber', win: true, round: 12, kills: 600, time: 1300 }), ['round', 'time']);
  assert.deepEqual(submitRun(all, { agent: 'chamber', win: true, round: 12, kills: 600, time: 1200 }), ['time']);
  const r = recordOf(all, 'chamber');
  assert.deepEqual([r.runs, r.wins, r.bestRound, r.bestKills, r.fastestWin], [4, 2, 12, 700, 1200]);
  assert.equal(recordOf(all, 'killjoy').runs, 0, '에이전트별로 따로');
});
