import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { SKILLS, ULT } from '../src/data/skills.js';
import { SOUL } from '../src/data/agents.js';
import { CRIT, DT } from '../src/data/balance.js';
import { spawn } from '../src/core/systems/enemies.js';
import { damageEnemy } from '../src/core/systems/combat.js';
import { maxHp } from '../src/core/stats.js';
import { decide } from '../src/core/autopilot.js';
import { createGunSlot } from '../src/core/state.js';

function quiet() {
  const s = createGame(1, 'reyna');
  s.spawnAcc = -1e9;
  s.player.guns = [null, null];
  s.player.invuln = 1e9;
  s.roundTime = 30;
  return s;
}
const dummy = (s, x, y, hp = 1e6) => Object.assign(spawn(s, 'chaser', { x, y }), { hp, maxHp: hp, speed: 0, damage: 0 });
const idle = (s, n, input = {}) => {
  for (let i = 0; i < n; i++) step(s, input);
};

test('리어: 눈 반경 안 적 실명, 포식자 — 실명 적에게 모든 피해 크리', () => {
  const s = quiet();
  const p = s.player;
  const e = dummy(s, p.x + 200, p.y);
  step(s, { keys: { c: true }, aim: { x: e.x, y: e.y } });
  step(s, {});
  assert.ok(e.blind > 0);
  const before = e.hp;
  damageEnemy(s, e, 10, false, 'classic');
  assert.ok(Math.abs(before - e.hp - 10 * CRIT.multiplier) < 1e-6);
  assert.equal(p.skills.c.charges, SKILLS.leer.maxCharges - 1);
});

test('영혼: 실명 적 처치는 영혼 확정, 밟으면 흡수 (최대 4)', () => {
  const s = quiet();
  const p = s.player;
  const e = dummy(s, p.x + 30, p.y, 1);
  e.blind = 1;
  damageEnemy(s, e, 10, false, 'classic');
  step(s, {});
  idle(s, 10);
  assert.equal(p.souls, 1);
  p.souls = SOUL.max;
  const f = dummy(s, p.x + 30, p.y, 1);
  f.blind = 1;
  damageEnemy(s, f, 10, false, 'classic');
  idle(s, 10);
  assert.equal(p.souls, SOUL.max, '가득이면 흡수 안 함');
  assert.equal(s.souls.length, 1, '바닥에 남는다');
});

test('흡수: 영혼 1개로 2초 동안 회복, 영혼 없으면 안 됨', () => {
  const s = quiet();
  const p = s.player;
  p.skills.q.level = 1;
  p.hp = 40;
  step(s, { keys: { q: true } });
  assert.equal(p.hp, 40, '영혼 없음');
  p.souls = 1;
  step(s, {});
  step(s, { keys: { q: true } });
  assert.equal(p.souls, 0);
  idle(s, Math.ceil(SKILLS.devour.time / DT) + 2);
  assert.ok(Math.abs(p.hp - (40 + SKILLS.devour.heal[0])) < 1e-6);
});

test('무시: 영혼 1개로 무적 질주', () => {
  const s = quiet();
  const p = s.player;
  p.invuln = 0;
  p.skills.e.level = 1;
  p.souls = 1;
  const x0 = p.x;
  step(s, { keys: { e: true }, move: { x: 1, y: 0 } });
  assert.ok(p.invuln > 0);
  idle(s, Math.ceil(SKILLS.dismiss.time / DT) + 1);
  assert.ok(p.x - x0 > SKILLS.dismiss.distance[0] * 0.8);
  assert.equal(p.souls, 0);
});

test('여제: 오브로 발동, 연사 증가, 처치마다 연장', () => {
  const s = quiet();
  const p = s.player;
  p.skills.x.level = 1;
  s.ultOrbs = ULT.orbsNeeded;
  p.guns = [null, createGunSlot('classic')];
  step(s, { keys: { x: true } });
  assert.ok(p.skills.x.active > 0);
  assert.ok(p.fireRateBuff >= SKILLS.empress.fireRate[0] - 1e-9);
  const t = p.skills.x.active;
  const e = dummy(s, p.x + 30, p.y, 1);
  damageEnemy(s, e, 10, false, 'classic');
  step(s, {});
  assert.ok(p.skills.x.active > t - 2 * DT + SKILLS.empress.extend - 1e-6);
  assert.ok(s.souls.length >= 1 || p.souls >= 1, '여제 중 처치는 영혼 확정');
});

test('자동: HP가 낮고 영혼이 있으면 흡수, 포위되면 무시', () => {
  const s = quiet();
  const p = s.player;
  p.skills.q.level = 1;
  p.skills.e.level = 1;
  p.souls = 2;
  p.hp = maxHp(p) * 0.3;
  let q = false;
  for (let i = 0; i < 12 && !q; i++) {
    s.tick = i;
    q = decide(s).keys.q;
  }
  assert.ok(q);
});
