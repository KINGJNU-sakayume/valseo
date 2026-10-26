import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, choose } from '../src/core/game.js';
import { SKILLS, ULT } from '../src/data/skills.js';
import { CRIT, PLAYER, DT } from '../src/data/balance.js';
import { skillValue } from '../src/core/systems/skills.js';
import { addField } from '../src/core/systems/fields.js';
import { endRound } from '../src/core/systems/rounds.js';

/** 스폰·자동 사격이 없는 조용한 게임. */
function quiet(seed = 1) {
  const s = createGame(seed);
  s.spawnAcc = -1e9;
  s.player.guns = [null, null];
  return s;
}

function enemy(s, x, y, hp = 1e6, speed = 0) {
  const e = { id: s.nextId++, type: 'chaser', x, y, r: 12, hp, maxHp: hp, speed, damage: 0 };
  s.enemies.push(e);
  return e;
}

const idle = (s, ticks, input = {}) => {
  for (let i = 0; i < ticks; i++) step(s, input);
};
const press = (k, extra = {}) => ({ keys: { [k]: true }, ...extra });

test('C: 조준점(사거리 제한)에 함정 설치, 충전 소모 후 쿨다운으로 회복', () => {
  const s = quiet();
  const p = s.player;
  step(s, press('c', { aim: { x: p.x + 100, y: p.y } }));
  assert.equal(s.traps.length, 1);
  assert.ok(Math.abs(s.traps[0].x - (p.x + 100)) < 1e-9);
  step(s, press('c', { aim: { x: p.x + 5000, y: p.y } }));
  assert.ok(Math.abs(s.traps[1].x - (p.x + SKILLS.trademark.range)) < 1e-9, '사거리로 잘림');
  assert.equal(p.skills.c.charges, 0);
  step(s, press('c', { aim: { x: p.x, y: p.y + 50 } }));
  assert.equal(s.traps.length, 2, '충전이 없으면 설치 안 됨');
  idle(s, Math.ceil(skillValue('trademark', 'cooldown', 1) / DT) + 1);
  assert.equal(p.skills.c.charges, 1);
});

test('C: 적이 밟으면 감속 필드, 필드 안 적은 느려지고 지속 후 사라진다', () => {
  const s = quiet();
  const p = s.player;
  const e = enemy(s, p.x + 300, p.y, 1e6, 90);
  step(s, press('c', { aim: { x: p.x + 200, y: p.y } }));
  let ticks = 0;
  while (s.fields.length === 0 && ticks++ < 600) step(s, {});
  assert.equal(s.fields.length, 1);
  assert.equal(s.traps.length, 0);
  const x0 = e.x;
  step(s, {});
  const moved = Math.abs(e.x - x0);
  assert.ok(Math.abs(moved - 90 * DT * (1 - skillValue('trademark', 'slow', 1))) < 1e-6, `moved=${moved}`);
  idle(s, Math.ceil(skillValue('trademark', 'fieldDuration', 1) / DT) + 1);
  assert.equal(s.fields.length, 0);
});

test('집중포화: 필드 안 적에게는 일반 피해도 크리티컬', () => {
  const s = quiet();
  const p = s.player;
  const inside = enemy(s, p.x + 250, p.y);
  addField(s, inside.x, inside.y, 50, 10, 0.5);
  s.player.guns = [null, { id: 'classic', tier: 1, cooldown: 0, mods: {} }];
  let hit = null;
  for (let i = 0; i < 60 && !hit; i++) {
    step(s, { aim: { x: inside.x + 120, y: inside.y } }); // 조준점은 적 뒤 (헤드샷이 아닌 일반 명중)
    hit = s.events.find((ev) => ev.type === 'hit');
  }
  assert.ok(hit);
  assert.equal(hit.crit, true);
  assert.equal(hit.crossfire, true);
  assert.equal(hit.damage, 12 * CRIT.multiplier);
});

test('E: 앵커 설치 → 재입력으로 귀환, 쿨다운 동안 재설치 불가', () => {
  const s = quiet();
  const p = s.player;
  p.skills.e.level = 1;
  const start = { x: p.x, y: p.y };
  step(s, press('e'));
  assert.deepEqual(p.skills.e.anchor, start);
  idle(s, 60, { move: { x: 1, y: 0 } });
  assert.ok(p.x > start.x + 100);
  step(s, press('e'));
  assert.equal(p.x, start.x);
  assert.equal(p.skills.e.anchor, null);
  assert.ok(Math.abs(p.skills.e.cd - (skillValue('rendezvous', 'cooldown', 1) - 0)) < DT * 2);
  step(s, press('e'));
  assert.equal(p.skills.e.anchor, null, '쿨다운 중');
});

test('Q: 정조준 중 이속 감소, 주무기 대신 크리 확정 권총, 탄창 소모와 회복', () => {
  const s = quiet();
  const p = s.player;
  p.skills.q.level = 1;
  p.guns = [{ id: 'sheriff', tier: 1, cooldown: 0, mods: {} }, null];
  const x0 = p.x;
  step(s, { keys: { q: true }, move: { x: 1, y: 0 }, aim: { x: p.x + 1000, y: p.y } });
  assert.equal(p.precision, true);
  assert.ok(Math.abs(p.x - x0 - PLAYER.speed * SKILLS.headhunter.speedMult * DT) < 1e-9);
  assert.equal(s.bullets.length, 1);
  assert.equal(s.bullets[0].source, 'headhunter');
  assert.equal(s.bullets[0].crit, true);
  assert.equal(s.bullets[0].pierce, SKILLS.headhunter.pierce);

  idle(s, 60 * 10, { keys: { q: true }, aim: { x: p.x + 1000, y: p.y } });
  const shots = (src) => s.bullets.filter((b) => b.source === src).length;
  assert.equal(shots('sheriff'), 0, '정조준 중 주무기는 쏘지 않는다');
  assert.ok(p.skills.q.ammo < SKILLS.headhunter.magazine);

  idle(s, Math.ceil(SKILLS.headhunter.magazine * skillValue('headhunter', 'ammoRegen', 1) / DT) + 2);
  assert.equal(p.skills.q.ammo, SKILLS.headhunter.magazine, '손을 떼면 탄창 회복');
  assert.equal(p.precision, false);
});

test('X: 오브가 모자라면 불발, 충분하면 직선 관통 피해 + 처치 시 감속 폭발', () => {
  const s = quiet();
  const p = s.player;
  p.skills.x.level = 1;
  const a = enemy(s, p.x + 200, p.y, 10);
  const b = enemy(s, p.x + 600, p.y, 10);
  const off = enemy(s, p.x + 300, p.y + 200, 10);
  step(s, press('x', { aim: { x: p.x + 1000, y: p.y } }));
  assert.equal(s.enemies.length, 3, '오브 부족');

  s.ultOrbs = ULT.orbsNeeded;
  step(s, press('x', { aim: { x: p.x + 1000, y: p.y } }));
  assert.equal(s.ultOrbs, 0);
  assert.ok(!s.enemies.includes(a) && !s.enemies.includes(b));
  assert.ok(s.enemies.includes(off), '선 밖의 적은 무사');
  assert.equal(s.fields.length, 2, '처치마다 감속 폭발');
  assert.ok(s.events.some((e) => e.type === 'ult'));
});

test('처치 수로 궁극기 오브 적립, 상점에서 충전 구매', () => {
  const s = quiet();
  for (let i = 0; i < ULT.killsPerOrb; i++) enemy(s, s.player.x + 100, s.player.y, -1);
  step(s, {});
  assert.equal(s.ultOrbs, 1);

  endRound(s);
  while (s.pending?.kind !== 'shop') (s.pending ? choose(s, 0) : step(s, {}));
  s.credits = 1e5;
  s.pending = null;
  step(s, {});
  const i = s.pending.options.findIndex((o) => o.kind === 'ultOrb');
  choose(s, i);
  assert.equal(s.ultOrbs, 2);
});

test('스킬 카드: 해금(0→1)과 강화 설명, 적용 시 레벨 상승', () => {
  const s = quiet();
  s.pending = { kind: 'levelup', options: [{ type: 'skill', key: 'e' }] };
  s.levelUpsQueued = 1;
  choose(s, 0);
  assert.equal(s.player.skills.e.level, 1);
  s.levelUpsQueued = 1;
  step(s, {});
  const card = s.pending.options[0];
  assert.ok(card.title && card.level);
});

test('라운드 종료 시 함정·필드·앵커 정리', () => {
  const s = quiet();
  s.player.skills.e.level = 1;
  step(s, press('c', { aim: { x: s.player.x + 100, y: s.player.y } }));
  step(s, press('e'));
  addField(s, 0, 0, 10, 10, 0.5);
  endRound(s);
  assert.equal(s.traps.length + s.fields.length, 0);
  assert.equal(s.player.skills.e.anchor, null);
  assert.equal(s.player.skills.c.charges, SKILLS.trademark.maxCharges);
});
