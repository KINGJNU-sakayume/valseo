import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { TACTICS } from '../src/data/tactics.js';
import { CRIT } from '../src/data/balance.js';
import { STATUS } from '../src/data/agents.js';
import { damageEnemy } from '../src/core/systems/combat.js';
import { spawn } from '../src/core/systems/enemies.js';
import { addField } from '../src/core/systems/fields.js';
import { createGunSlot } from '../src/core/state.js';

function quiet(agent = 'chamber') {
  const s = createGame(1, agent);
  s.spawnAcc = -1e9;
  s.player.guns = [null, null];
  s.player.invuln = 1e9;
  s.roundTime = 30;
  return s;
}
const dummy = (s, x = 1300, y = 1000, hp = 1e6, type = 'chaser') => Object.assign(spawn(s, type, { x, y }), { hp, maxHp: hp, speed: 0, damage: 0 });
const dealt = (s, e, base, crit, source) => {
  const b = e.hp;
  damageEnemy(s, e, base, crit, source);
  return b - e.hp;
};
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('보조 전문가·엘리트 사냥꾼·장판 중첩·제압 사격: 피해 배율', () => {
  const s = quiet();
  const e = dummy(s);
  s.player.tactics = { sidearmPro: true };
  assert.ok(near(dealt(s, e, 10, false, 'classic'), 10 * (1 + TACTICS.sidearmPro.damage)));
  assert.ok(near(dealt(s, e, 10, false, 'vandal'), 10));
  s.player.tactics = { eliteHunter: true };
  const L = dummy(s, 1500, 1000, 1e6, 'lord');
  L.face = 0; // 껍질은 반대쪽
  assert.ok(near(dealt(s, L, 10, false, 'nanoswarm'), 10 * (1 + TACTICS.eliteHunter.bonus)));
  s.player.tactics = { zoneStack: true };
  s.fields.push({ x: e.x, y: e.y, r: 50, life: 5, maxLife: 5, slow: 0 }, { x: e.x, y: e.y, r: 50, life: 5, maxLife: 5, slow: 0 });
  const v = dealt(s, e, 10, false, 'nanoswarm');
  assert.ok(near(v, 10 * CRIT.multiplier * (1 + TACTICS.zoneStack.bonus)), `체임버 집중포화 크리 + 중첩 (${v})`);
  s.fields.length = 0;
  s.player.tactics = { suppressCrit: true };
  e.suppressed = 1;
  assert.ok(near(dealt(s, e, 10, false, 'vandal'), 10 * CRIT.multiplier));
  void STATUS;
});

test('탄피 회수: 재장전 직후 3발 크리 / 마지막 한 발: 탄창 마지막 탄 ×3', () => {
  const s = quiet();
  s.player.tactics = { casingRecall: true, lastShot: true };
  s.player.guns = [createGunSlot('vandal'), null];
  const g = s.player.guns[0];
  g.ammo = 1;
  s.bullets.length = 0;
  let last = null;
  for (let i = 0; i < 10 && !last; i++) {
    step(s, { aim: { x: s.player.x + 500, y: s.player.y } });
    last = s.bullets.find((b) => b.source === 'vandal');
  }
  assert.ok(last);
  assert.ok(near(last.damage, 22 * TACTICS.lastShot.mult) || last.damage > 22 * 2.5, `마지막 탄 ×3 (${last.damage})`);
  while (g.reload > 0) step(s, { aim: { x: s.player.x + 500, y: s.player.y } });
  s.bullets.length = 0;
  for (let i = 0; i < 50; i++) step(s, { aim: { x: s.player.x + 500, y: s.player.y } });
  const shots = s.bullets.filter((b) => b.source === 'vandal');
  assert.ok(shots.length >= 4);
  assert.ok(shots.slice(0, 3).every((b) => b.crit), '재장전 후 3발 크리');
});

test('표식 사냥: 표식 적 처치 시 XP 두 배·크레딧 +10', () => {
  const s = quiet();
  s.player.tactics = { markHunt: true };
  const e = dummy(s, 1300, 1000, 1);
  e.mark = 2;
  const c = s.credits;
  damageEnemy(s, e, 10, false, 'vandal');
  step(s, {});
  const xp = s.pickups.reduce((a, k) => a + k.value, 0);
  assert.equal(xp, 2);
  assert.ok(s.credits - c >= 10 + 10);
});

test('설치 동기화: 스킬을 쓰면 포탑 공격 속도 ×2 (1초)', () => {
  const s = quiet('killjoy');
  s.player.tactics = { syncGadgets: true };
  s.player.skills.e.level = 1;
  step(s, { keys: { e: true } });
  assert.ok(s.syncT > 0);
});

test('관통 파편: 관통을 다 쓴 탄이 마지막 대상 자리에서 소폭발', () => {
  const s = quiet();
  s.player.tactics = { shrapnel: true };
  const a = dummy(s, s.player.x + 120, s.player.y);
  const b = dummy(s, s.player.x + 180, s.player.y);
  const c = dummy(s, s.player.x + 200, s.player.y + 30);
  s.bullets.push({ x: s.player.x + 100, y: s.player.y, vx: 900, vy: 0, r: 4, damage: 100, crit: false, life: 1, pierce: 1, hitIds: [], source: 'operator', homing: null });
  for (let i = 0; i < 10; i++) step(s, { aim: { x: s.player.x, y: s.player.y + 300 } });
  assert.ok(1e6 - c.hp > 0, '파편 피해');
  void a;
  void b;
});

test('자석 폭발: XP 조각 40개 흡수마다 충격파', () => {
  const s = quiet();
  s.player.tactics = { magnetBlast: true };
  const e = dummy(s, s.player.x + 100, s.player.y);
  for (let i = 0; i < TACTICS.magnetBlast.every; i++) s.pickups.push({ kind: 'xp', x: s.player.x, y: s.player.y, value: 1, r: 4 });
  for (let i = 0; i < 5; i++) step(s, {});
  assert.ok(e.hp < 1e6);
  void addField;
});
