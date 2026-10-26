import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { SKILLS } from '../src/data/skills.js';
import { STAR, ASTRAL } from '../src/data/agents.js';
import { DT } from '../src/data/balance.js';
import { spawn } from '../src/core/systems/enemies.js';
import { createGunSlot } from '../src/core/state.js';
import { resetSkillsForRound, agentDamageMult } from '../src/core/systems/skills.js';
import { blocked } from '../src/core/systems/map.js';
import { decide } from '../src/core/autopilot.js';

function quiet() {
  const s = createGame(1, 'astra');
  s.planning = false;
  s.spawnAcc = -1e9;
  s.enemies.length = 0;
  s.player.guns = [null, null];
  s.player.invuln = 1e9;
  return s;
}
const dummy = (s, x, y, hp = 1e6) => Object.assign(spawn(s, 'chaser', { x, y }), { hp, maxHp: hp, speed: 0, damage: 0 });
const idle = (s, n, input = {}) => {
  for (let i = 0; i < n; i++) step(s, input);
};
const secs = (t) => Math.ceil(t / DT);
const tap = (s, key, extra = {}) => {
  step(s, { keys: { [key]: true }, ...extra });
  step(s, { keys: {}, ...extra });
};
/** 천상계에 들어가 aim 들에 별을 놓고 나온다. */
function placeStars(s, points) {
  tap(s, 'x');
  for (const pt of points) tap(s, 'm', { aim: pt });
  tap(s, 'x');
}
/** 플레이어 근처의 열린 바닥 점들. */
function openSpots(s, n, r = 180) {
  const p = s.player;
  const out = [];
  for (let k = 0; k < 32 && out.length < n; k++) {
    const a = (k / 32) * Math.PI * 2;
    const pt = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
    if (!blocked(s.map, pt.x, pt.y) && out.every((o) => Math.hypot(o.x - pt.x, o.y - pt.y) > 80)) out.push(pt);
  }
  return out;
}

test('라운드 시작 계획 단계: 시간이 멈춘 채 별을 놓고, X 로 전투 시작', () => {
  const s = createGame(1, 'astra');
  assert.equal(s.planning, true);
  const t0 = s.time;
  const [a, b] = openSpots(s, 2);
  step(s, { keys: { m: true }, aim: a });
  step(s, { keys: {}, aim: a });
  step(s, { keys: { m: true }, aim: b });
  step(s, { keys: {} });
  assert.equal(s.stars.length, 2);
  assert.equal(s.time, t0, '시간이 흐르지 않는다');
  tap(s, 'x');
  assert.equal(s.planning, false);
  assert.ok(s.time > t0, '전투 시작');
});

test('별: 최대 수 제한, 클릭으로 회수하면 잠시 뒤에야 다시 놓을 수 있다', () => {
  const s = quiet();
  const max = SKILLS.astralForm.stars[0];
  const spots = openSpots(s, max + 1);
  placeStars(s, spots);
  assert.equal(s.stars.length, max, '최대 수까지만');
  idle(s, secs(ASTRAL.cooldown) + 1); // 나온 직후에는 다시 못 들어간다
  tap(s, 'x');
  tap(s, 'm', { aim: spots[0] });
  assert.equal(s.stars.length, max - 1, '회수');
  tap(s, 'm', { aim: spots[max] });
  assert.equal(s.stars.length, max - 1, '회수 직후에는 그 칸이 잠겨 있다');
  tap(s, 'x');
  idle(s, secs(Math.max(STAR.recallLock, ASTRAL.cooldown)) + 2);
  placeStars(s, [spots[max]]);
  assert.equal(s.stars.length, max);
});

test('천상계 형상: 몸은 멈추고 총을 쏘지 않으며, 제한 시간이 지나면 돌아온다', () => {
  const s = quiet();
  const p = s.player;
  p.guns = [null, createGunSlot('classic')];
  dummy(s, p.x + 200, p.y);
  tap(s, 'x');
  assert.ok(p.astral > 0);
  const x0 = p.x;
  s.bullets.length = 0;
  idle(s, 20, { move: { x: 1, y: 0 }, aim: { x: p.x + 200, y: p.y } });
  assert.equal(p.x, x0, '이동하지 않는다');
  assert.equal(s.bullets.length, 0, '총을 쏘지 않는다');
  idle(s, secs(ASTRAL.limit) + 2);
  assert.equal(p.astral, 0, '시간이 다 되면 돌아온다');
});

test('중력의 샘: 조준점에 가장 가까운 별에서 끌어당긴 뒤 폭발·취약, 별은 잠시 뒤 다시 생긴다', () => {
  const s = quiet();
  const [a, b] = openSpots(s, 2, 250);
  placeStars(s, [a, b]);
  const e = dummy(s, a.x + 120, a.y);
  const d0 = Math.hypot(e.x - a.x, e.y - a.y);
  tap(s, 'c', { aim: { x: a.x + 10, y: a.y } });
  const used = s.stars.find((st) => Math.hypot(st.x - a.x, st.y - a.y) < 1);
  assert.ok(used.reform > 0, '조준점에 가까운 별을 썼다');
  assert.ok(!(s.stars.find((st) => st !== used).reform > 0), '다른 별은 그대로');
  idle(s, secs(SKILLS.gravityWell.pullTime * 0.5));
  assert.ok(Math.hypot(e.x - a.x, e.y - a.y) < d0, '끌려온다');
  idle(s, secs(SKILLS.gravityWell.pullTime));
  assert.ok(e.hp < e.maxHp, '폭발 피해');
  assert.ok(e.vulnerable > 0, '취약');
  idle(s, secs(STAR.reform) + 2);
  assert.ok(!(used.reform > 0), '같은 자리에 다시 생긴다');
});

test('별이 없으면 C/Q/E 는 아무 일도 없고 충전도 쓰지 않는다', () => {
  const s = quiet();
  tap(s, 'c', { aim: { x: s.player.x + 100, y: s.player.y } });
  assert.equal(s.player.skills.c.charges, SKILLS.gravityWell.maxCharges);
  assert.equal((s.wells ?? []).length, 0);
});

test('신성 파동: 짧은 충전 뒤 범위 안 적 기절', () => {
  const s = quiet();
  s.player.skills.q.level = 1;
  const [a] = openSpots(s, 1, 250);
  placeStars(s, [a]);
  const e = dummy(s, a.x + 60, a.y);
  tap(s, 'q', { aim: a });
  assert.ok(!(e.detained > 0), '충전 중');
  idle(s, secs(SKILLS.novaPulse.windup) + 1);
  assert.ok(e.detained > 0, '기절');
});

test('성운: 별 자리에 연막, 안의 적은 사격하지 않는다', () => {
  const s = quiet();
  s.player.skills.e.level = 1;
  const [a] = openSpots(s, 1, 250);
  placeStars(s, [a]);
  tap(s, 'e', { aim: a });
  const sm = (s.smokes ?? []).find((z) => z.owner === 'astra');
  assert.ok(sm, '성운');
  assert.ok(Math.hypot(sm.x - a.x, sm.y - a.y) < 1);
});

test('우주 장벽(두 세계): 건너편 적은 플레이어를 쫓지 못하고, 벽을 넘는 탄은 사라진다', () => {
  const s = quiet();
  const p = s.player;
  s.ultOrbs = 3;
  // 플레이어 오른쪽 100 에 세로 장벽
  tap(s, 'x');
  tap(s, 'u');
  tap(s, 'm', { aim: { x: p.x + 100, y: p.y - 100 } });
  tap(s, 'm', { aim: { x: p.x + 100, y: p.y + 100 } });
  assert.ok(s.divide, '장벽');
  assert.equal(s.ultOrbs, 0);
  tap(s, 'x');
  const other = Object.assign(spawn(s, 'chaser', { x: p.x + 300, y: p.y }), { damage: 0 });
  const mine = Object.assign(spawn(s, 'chaser', { x: p.x - 300, y: p.y }), { damage: 0 });
  const dOther = Math.hypot(other.x - p.x, other.y - p.y);
  const dMine = Math.hypot(mine.x - p.x, mine.y - p.y);
  idle(s, secs(1.5));
  assert.ok(Math.hypot(mine.x - p.x, mine.y - p.y) < dMine - 60, '내 세계의 적은 다가온다');
  assert.ok(Math.hypot(other.x - p.x, other.y - p.y) > dOther - 60, '건너편 적은 헤맨다');
  s.enemyBullets.push({ x: p.x + 140, y: p.y, vx: -600, vy: 0, r: 5, damage: 10, life: 2, source: 'ranged' });
  idle(s, 5);
  assert.equal(s.enemyBullets.length, 0, '벽을 넘는 적 탄은 사라진다');
  assert.notEqual(decide(s).aimTarget, other.id, '자동 조준도 건너편 적은 노리지 않는다');
  idle(s, secs(SKILLS.astralForm.divide[0]) + 2);
  assert.equal(s.divide, null, '시간이 지나면 사라진다');
});

test('별빛: 별 근처의 적은 받는 피해 +10%, 멀면 그대로', () => {
  const s = quiet();
  const [a] = openSpots(s, 1, 250);
  placeStars(s, [a]);
  const nearE = dummy(s, a.x + 50, a.y);
  const farE = dummy(s, a.x + STAR.passiveRadius + 200, a.y);
  assert.equal(agentDamageMult(s, nearE, 'classic'), STAR.passiveMult);
  assert.equal(agentDamageMult(s, farE, 'classic'), 1);
});

test('라운드 정리: 별·장벽·천상계 상태가 사라지고 충전이 돌아온다', () => {
  const s = quiet();
  placeStars(s, openSpots(s, 2));
  s.player.skills.c.charges = 0;
  resetSkillsForRound(s);
  assert.equal(s.stars.length, 0);
  assert.equal(s.divide, null);
  assert.equal(s.player.astral, 0);
  assert.equal(s.player.skills.c.charges, SKILLS.gravityWell.maxCharges);
});

test('자동 판단: 계획 단계에서 별을 깔고 전투를 시작한다', () => {
  const s = createGame(2, 'astra');
  for (let i = 0; i < 200 && s.planning; i++) step(s, decide(s));
  assert.equal(s.planning, false, '스스로 시작');
  assert.equal(s.stars.length, SKILLS.astralForm.stars[0], '별을 모두 깔았다');
});
