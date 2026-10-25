import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { SKILLS } from '../src/data/skills.js';
import { RECLAIM } from '../src/data/agents.js';
import { DT } from '../src/data/balance.js';
import { spawn } from '../src/core/systems/enemies.js';
import { damageEnemy } from '../src/core/systems/combat.js';
import { resetSkillsForRound } from '../src/core/systems/skills.js';
import { decide } from '../src/core/autopilot.js';

function quiet() {
  const s = createGame(1, 'gecko');
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
const unlock = (s, slot, level = 1) => {
  s.player.skills[slot].level = level;
};
const cast = (s, slot, at) => {
  step(s, { keys: { [slot]: true }, aim: at });
  step(s, { keys: {}, aim: at });
};
const secs = (t) => Math.ceil(t / DT);

test('폭파봇 지옥: 던지면 잠시 뒤 폭발(피해+취약), 끝난 자리에 구슬이 남는다', () => {
  const s = quiet();
  const p = s.player;
  const e = dummy(s, p.x + 200, p.y);
  cast(s, 'c', { x: e.x, y: e.y });
  assert.equal(p.skills.c.charges, 0, '쿨다운 시작');
  assert.equal(e.hp, e.maxHp, '폭발 전');
  idle(s, secs(SKILLS.moshpit.fuse) + 2);
  assert.ok(e.hp < e.maxHp, '폭발 피해');
  assert.ok(e.vulnerable > 0, '취약');
  assert.equal(s.globules.length, 1);
  assert.equal(s.globules[0].slot, 'c');
  assert.ok(Math.abs(s.globules[0].life - RECLAIM.life) < 0.2);
});

test('회수: 구슬을 밟으면 쿨다운이 회수 잠금 이하로, 이속 +20%. 즉시 재충전은 아니다', () => {
  const s = quiet();
  const p = s.player;
  cast(s, 'c', { x: p.x + 200, y: p.y });
  idle(s, secs(SKILLS.moshpit.fuse) + 2);
  assert.ok(p.skills.c.cd > RECLAIM.lockout + 1, '아직 기본 쿨다운이 많이 남았다');
  p.x = s.globules[0].x;
  p.y = s.globules[0].y;
  step(s, {});
  assert.equal(s.globules.length, 0);
  assert.ok(p.skills.c.cd <= RECLAIM.lockout + 1e-9, '쿨다운이 잠금 이하로');
  assert.ok(p.skills.c.cd > 0 && p.skills.c.charges === 0, '즉시 재충전은 아니다');
  assert.equal(p.speedBuff, RECLAIM.speed);
  idle(s, secs(RECLAIM.speedTime) + 3);
  assert.equal(p.speedBuff, 0);
  idle(s, secs(RECLAIM.lockout));
  assert.equal(p.skills.c.charges, 1, '잠금이 지나면 다시 쓸 수 있다');
});

test('구슬을 줍지 않으면 기본 쿨다운 그대로, 구슬은 수명이 끝나면 사라진다', () => {
  const s = quiet();
  const p = s.player;
  cast(s, 'c', { x: p.x + 300, y: p.y });
  idle(s, secs(SKILLS.moshpit.fuse) + 2);
  assert.equal(s.globules.length, 1);
  idle(s, secs(RECLAIM.life + 1));
  assert.equal(s.globules.length, 0);
  assert.ok(p.skills.c.cd > 0, '기본 쿨다운 진행 중');
});

test('스킬당 생물·구슬은 하나: 구슬이 남아 있으면 충전이 있어도 다시 못 쓴다', () => {
  const s = quiet();
  const p = s.player;
  cast(s, 'c', { x: p.x + 300, y: p.y });
  idle(s, secs(SKILLS.moshpit.fuse) + 2);
  p.skills.c.charges = 1;
  p.skills.c.cd = 0;
  const before = s.creatures.length;
  cast(s, 'c', { x: p.x + 300, y: p.y });
  assert.equal(s.creatures.length, before, '구슬이 남아 있어 재시전 불가');
});

test('회수 루프 방지: 처치해도 쿨다운·충전이 빨라지지 않는다', () => {
  const s = quiet();
  const p = s.player;
  cast(s, 'c', { x: p.x + 300, y: p.y });
  const cd0 = p.skills.c.cd;
  for (let i = 0; i < 30; i++) damageEnemy(s, dummy(s, p.x + 40, p.y, 1), 10, false, 'classic');
  step(s, {});
  assert.ok(Math.abs(cd0 - DT - p.skills.c.cd) < 1e-9);
});

test('지원봇: 적을 쫓아가 닿으면 주변을 구금하고, 끝나면 구슬을 남긴다', () => {
  const s = quiet();
  const p = s.player;
  unlock(s, 'q');
  const e = dummy(s, p.x + 250, p.y);
  cast(s, 'q', { x: e.x, y: e.y });
  assert.equal(s.creatures.length, 1);
  idle(s, secs(2));
  assert.ok(e.detained > 0 || s.creatures[0].hits > 0, '닿아서 구금');
  idle(s, secs(SKILLS.wingman.life[0] + 1));
  assert.equal(s.creatures.length, 0);
  assert.equal(s.globules.filter((g) => g.slot === 'q').length, 1);
});

test('쌍둥이 지원봇: 2기, 구슬은 하나만 남고 하나를 밟으면 회수', () => {
  const s = quiet();
  const p = s.player;
  unlock(s, 'q');
  p.skills.q.branch = 'twin';
  dummy(s, p.x + 650, p.y); // 멀리 있는 적: 지원봇이 나가서 구금하고 돌아오다 끝난다
  cast(s, 'q', { x: p.x + 100, y: p.y });
  assert.equal(s.creatures.length, 2);
  idle(s, secs(SKILLS.wingman.life[0] * SKILLS.wingman.branches.twin.lifeMult + 1));
  assert.equal(s.creatures.length, 0);
  assert.equal(s.globules.filter((g) => g.slot === 'q').length, 1, '2기여도 구슬은 하나');
});

test('해체 지원봇: 해체 라운드에서 플레이어 대신 스파이크에 서서 진행을 올린다', () => {
  const s = quiet();
  const p = s.player;
  unlock(s, 'q');
  p.skills.q.branch = 'defuser';
  s.objective = { type: 'defuse', done: false, x: p.x + 300, y: p.y, progress: 0 };
  cast(s, 'q', { x: p.x, y: p.y });
  idle(s, secs(3));
  assert.ok(s.objective.progress > 0, '해체 진행');
  assert.ok(s.objective.progress < 2.2, '플레이어가 서는 것보다 느리다 (×0.6)');
});

test('기절봇: 조준점으로 날아가 적을 눈멀게 한다 (피해 포함)', () => {
  const s = quiet();
  const p = s.player;
  unlock(s, 'e');
  const e = dummy(s, p.x + 250, p.y);
  cast(s, 'e', { x: e.x, y: e.y });
  idle(s, secs(1.5));
  assert.ok(e.blind > 0, '실명');
  assert.ok(e.hp < e.maxHp, '피해');
});

test('요동봇: 오브를 쓰고 닿는 적을 구금, 끝나면 구슬, 회수하면 오브 1개 환급', () => {
  const s = quiet();
  const p = s.player;
  unlock(s, 'x');
  const e = dummy(s, p.x + 200, p.y);
  cast(s, 'x', { x: e.x, y: e.y });
  assert.equal((s.creatures ?? []).length, 0, '오브 없으면 안 나감');
  s.ultOrbs = 3;
  cast(s, 'x', { x: e.x, y: e.y });
  assert.equal(s.ultOrbs, 0);
  idle(s, secs(1.2));
  assert.ok(e.detained > 0, '구금');
  idle(s, secs(SKILLS.thrash.life[0] + 1));
  assert.equal(s.creatures.length, 0);
  const g = s.globules.find((o) => o.slot === 'x');
  assert.ok(g, '구슬');
  p.x = g.x;
  p.y = g.y;
  step(s, {});
  assert.equal(s.ultOrbs, 1, '오브 1개 환급 (3개를 다 돌려받지 못한다)');
});

test('회수 공명(합성): 구슬 하나를 밟으면 다른 스킬 쿨다운도 잠금 이하로', () => {
  const s = quiet();
  const p = s.player;
  unlock(s, 'q');
  unlock(s, 'e');
  p.synths = { reclaimResonance: true };
  p.skills.q.charges = 0;
  p.skills.q.cd = 15;
  p.skills.e.charges = 0;
  p.skills.e.cd = 15;
  cast(s, 'c', { x: p.x + 300, y: p.y });
  idle(s, secs(SKILLS.moshpit.fuse) + 2);
  p.x = s.globules[0].x;
  p.y = s.globules[0].y;
  step(s, {});
  assert.ok(p.skills.q.cd <= RECLAIM.lockout + 1e-9);
  assert.ok(p.skills.e.cd <= RECLAIM.lockout + 1e-9);
});

test('자동 규칙: 적이 밀집하면 폭파봇을 던진다', () => {
  const s = quiet();
  const p = s.player;
  for (let i = 0; i < 8; i++) dummy(s, p.x + 150 + (i % 3) * 10, p.y + (i - 4) * 10);
  let saw = false;
  for (let k = 0; k < 12; k++) {
    saw ||= decide(s).keys.c;
    s.tick++;
  }
  assert.ok(saw);
});

test('라운드 전환: 생물·구슬·장판이 정리되고 충전이 돌아온다', () => {
  const s = quiet();
  const p = s.player;
  cast(s, 'c', { x: p.x + 300, y: p.y });
  idle(s, secs(SKILLS.moshpit.fuse) + 2);
  resetSkillsForRound(s);
  assert.equal(s.creatures.length, 0);
  assert.equal(s.globules.length, 0);
  assert.equal(p.skills.c.charges, 1);
  assert.equal(p.skills.c.cd, 0);
});
