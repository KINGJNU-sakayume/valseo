import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, choose } from '../src/core/game.js';
import { ROUND_TYPES, ROUND_TYPE_OF, MUTATIONS } from '../src/data/rounds.js';
import { DT } from '../src/data/balance.js';
import { startRound, endRound } from '../src/core/systems/rounds.js';
import { spawn } from '../src/core/systems/enemies.js';
import { siteAt } from '../src/core/systems/map.js';

function at(R, seed = 1) {
  const s = createGame(seed);
  startRound(s, R);
  s.spawnAcc = -1e9;
  s.player.invuln = 1e9;
  s.player.guns = [null, null];
  return s;
}
const idle = (s, n) => {
  for (let i = 0; i < n; i++) step(s, {});
};

test('일정: 해체 R3·R7, 방어 R5·R9, 사냥 R6·R10, 엘리트 R4·R8·R11', () => {
  assert.equal(ROUND_TYPE_OF[3], 'defuse');
  assert.equal(ROUND_TYPE_OF[5], 'defend');
  assert.equal(ROUND_TYPE_OF[6], 'hunt');
  for (const R of [4, 8, 11]) assert.equal(ROUND_TYPE_OF[R], 'elite');
  const s = at(3);
  assert.equal(s.objective.type, 'defuse');
  assert.ok(s.map.spikes.some((sp) => sp.x === s.objective.x && sp.y === s.objective.y));
});

test('해체: 스파이크 지점에 누적 7초 → 크레딧 + 전술 카드 선택, 밖에 나가면 천천히 줄어든다', () => {
  const s = at(3);
  const o = s.objective;
  s.player.x = o.x;
  s.player.y = o.y;
  idle(s, Math.round(3 / DT));
  const mid = o.progress;
  s.player.x += 400;
  idle(s, 60);
  assert.ok(o.progress < mid && o.progress > mid - 1, '천천히 감소');
  s.player.x = o.x;
  const c = s.credits;
  let n = 0;
  while (!o.done && n++ < 60 * 10) step(s, {});
  assert.ok(o.done);
  assert.equal(s.credits - c, ROUND_TYPES.defuse.credits);
  step(s, {});
  assert.equal(s.pending?.kind, 'reward');
  assert.ok(s.pending.options.every((c2) => c2.type === 'tactic'));
  const key = s.pending.options[0].key;
  choose(s, 0);
  assert.ok(s.player.tactics[key]);
});

test('방어: 적이 사이트로 향하고, 사이트 안에 머문 비율만큼 보너스', () => {
  const s = at(5, 2);
  s.mutation = null;
  const o = s.objective;
  assert.equal(o.type, 'defend');
  const e = spawn(s, 'chaser', { x: s.player.x, y: s.player.y });
  s.player.x = o.x;
  s.player.y = o.y;
  assert.equal(siteAt(s.map, s.player.x, s.player.y), o.site);
  e.x = 1000;
  e.y = 1100;
  idle(s, 60 * 5);
  assert.ok(o.inside > 4.5);
  s.enemies.length = 0;
  const c = s.credits;
  endRound(s);
  assert.ok(s.credits - c >= Math.round(ROUND_TYPES.defend.credits * 0.9));
});

test('사냥: 은신 표적 3기, 모두 처치하면 유물 선택', () => {
  const s = at(6, 3);
  const o = s.objective;
  assert.equal(o.ids.length, ROUND_TYPES.hunt.targets);
  const targets = s.enemies.filter((e) => o.ids.includes(e.id));
  assert.ok(targets.every((t) => t.type === 'huntTarget'));
  step(s, {});
  assert.ok(targets.every((t) => t.hidden), '멀면 은신');
  for (const t of targets) t.hp = 0;
  idle(s, 2);
  assert.ok(o.done);
  assert.equal(s.pending?.kind, 'relic');
});

test('엘리트 무기 상자: 처치 지점에 상자, 밟으면 교체 제안 (가져가면 주무기 교체)', () => {
  const s = at(4, 5);
  const L = spawn(s, 'lord', { x: s.player.x + 60, y: s.player.y });
  L.speed = 0;
  L.hp = 0;
  step(s, {});
  while (s.pending?.kind === 'relic') choose(s, 0);
  assert.equal(s.boxes.length, 1);
  const b = s.boxes[0];
  s.player.x = b.x;
  s.player.y = b.y;
  step(s, {});
  assert.equal(s.pending?.kind, 'weaponBox');
  choose(s, 0);
  assert.equal(s.player.guns[0].id, b.gun);
  assert.equal(s.player.guns[0].tier, b.tier);
});

test('변이: 2막부터만, 과충전은 적 이속 증가 / 폭풍은 낙뢰가 적도 친다', () => {
  for (let seed = 1; seed <= 20; seed++) assert.equal(at(2, seed).mutation, null);
  let seen = 0;
  for (let seed = 1; seed <= 40; seed++) if (at(9, seed).mutation) seen++;
  assert.ok(seen > 5 && seen < 30, `변이 ${seen}/40`);
  const s = at(9);
  s.mutation = 'overcharge';
  const e = spawn(s, 'chaser', { x: 1000, y: 1300 });
  assert.ok(Math.abs(e.speed - 90 * MUTATIONS.overcharge.speedMult) < 1e-9);
  s.mutation = 'storm';
  const v = spawn(s, 'chaser', { x: s.player.x + 50, y: s.player.y });
  v.speed = 0;
  v.hp = v.maxHp = 1e6;
  s.hazards = [{ x: v.x, y: v.y, t: 0.01, r: 90 }];
  s.mutationT = -1e9;
  step(s, {});
  assert.ok(v.hp < 1e6);
});
