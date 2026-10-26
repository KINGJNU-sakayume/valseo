import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch } from '../sim/patch.js';
import { runJobs } from '../sim/pool.js';
import { playOne, agentList } from '../sim/run.js';
import * as greedy from '../sim/bots/greedy.js';
import { SKILLS } from '../src/data/skills.js';
import { COMMANDER, AGENTS } from '../src/data/agents.js';
import { createSpatialHash, clearHash, insert, query } from '../src/core/spatial.js';

test('시뮬 패치: mul·add·값 바꾸기, 배열의 null 은 그대로, 되돌리기', () => {
  const before = { dps: [...SKILLS.ember.dps], cd: [...SKILLS.ember.cooldown], taken: COMMANDER.takenMult };
  const blast = [...SKILLS.trademark.branches.A.blastDamage];
  const undo = applyPatch({
    changes: {
      'SKILLS.ember.dps': { mul: 0.5 },
      'SKILLS.ember.cooldown': { add: 1 },
      'COMMANDER.takenMult': 0.75,
      'SKILLS.trademark.branches.A.blastDamage': { mul: 2 },
    },
  });
  assert.deepEqual(SKILLS.ember.dps, before.dps.map((v) => v * 0.5));
  assert.deepEqual(SKILLS.ember.cooldown, before.cd.map((v) => v + 1));
  assert.equal(COMMANDER.takenMult, 0.75);
  assert.equal(SKILLS.trademark.branches.A.blastDamage[0], null);
  assert.equal(SKILLS.trademark.branches.A.blastDamage[1], blast[1] * 2);
  undo();
  assert.deepEqual(SKILLS.ember.dps, before.dps);
  assert.deepEqual(SKILLS.ember.cooldown, before.cd);
  assert.equal(COMMANDER.takenMult, before.taken);
  assert.deepEqual(SKILLS.trademark.branches.A.blastDamage, blast);
});

test('시뮬 패치: 없는 경로는 오류', () => {
  assert.throws(() => applyPatch({ changes: { 'SKILLS.ember.nope': 1 } }), /찾을 수 없음/);
  assert.throws(() => applyPatch({ changes: { 'NOPE.x': 1 } }), /찾을 수 없음/);
});

test('요원 목록: all 은 전부, 쉼표 목록, 모르는 이름은 오류', () => {
  assert.deepEqual(agentList('all'), Object.keys(AGENTS));
  assert.deepEqual(agentList('reyna,gecko'), ['reyna', 'gecko']);
  assert.throws(() => agentList('jett'), /알 수 없는 요원/);
});

test('작업 풀: worker 결과가 한 판씩 직접 돌린 것과 같다', async () => {
  const jobs = [{ seed: 3, agent: 'chamber' }, { seed: 4, agent: 'killjoy' }];
  const out = await runJobs(jobs, { workers: 2 });
  for (let i = 0; i < jobs.length; i++) {
    const { agent, ...rest } = out[i];
    assert.equal(agent, jobs[i].agent);
    assert.deepEqual(rest, playOne(jobs[i].seed, greedy, { agent: jobs[i].agent }));
  }
});

test('공간 해시: clear 뒤에는 이전 항목이 남지 않는다', () => {
  const h = createSpatialHash(64);
  const a = { x: 10, y: 10, r: 5 };
  const b = { x: 500, y: 500, r: 5 };
  insert(h, a);
  insert(h, b);
  clearHash(h);
  insert(h, b);
  assert.deepEqual(query(h, 10, 10, 5, []), []);
  assert.deepEqual(query(h, 500, 500, 5, []), [b]);
});
