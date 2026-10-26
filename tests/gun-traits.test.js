import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { createGunSlot } from '../src/core/state.js';
import { GUNS } from '../src/data/guns.js';
import { CRIT } from '../src/data/balance.js';
import { falloffMult } from '../src/core/systems/weapons.js';

function quiet(gun) {
  const s = createGame(1, 'killjoy');
  s.spawnAcc = -1e9;
  s.enemies.length = 0;
  s.player.guns = [GUNS[gun].slot === 'primary' ? createGunSlot(gun) : null, GUNS[gun].slot === 'sidearm' ? createGunSlot(gun) : null];
  return s;
}
function enemy(s, x, y, hp = 1e6) {
  const e = { id: s.nextId++, type: 'chaser', x, y, r: 12, hp, maxHp: hp, speed: 0, damage: 0, mode: 'move', t: 0, dirX: 0, dirY: 0, fireCd: 0 };
  s.enemies.push(e);
  return e;
}

test('거리별 피해 감소: near 까지 100%, far 이후 min', () => {
  const f = GUNS.spectre.falloff;
  const at = (d) => falloffMult(GUNS.spectre, { sx: 0, sy: 0, x: d, y: 0 });
  assert.equal(at(f.near - 1), 1);
  assert.equal(at(f.far + 50), f.min);
  const mid = at((f.near + f.far) / 2);
  assert.ok(mid < 1 && mid > f.min);
  assert.equal(falloffMult(GUNS.vandal, { sx: 0, sy: 0, x: 3000, y: 0 }), 1, '밴달은 감소 없음');
});

test('연사 반동: 쏠수록 퍼짐이 쌓이고 재장전하면 0', () => {
  const s = quiet('vandal');
  const slot = s.player.guns[0];
  enemy(s, s.player.x + 300, s.player.y);
  for (let i = 0; i < 60; i++) step(s, { aim: { x: s.player.x + 300, y: s.player.y } });
  assert.ok(slot.heat > 0, '반동이 쌓였다');
  assert.ok(slot.heat <= GUNS.vandal.recoil.max + 1e-9);
  slot.ammo = 1;
  for (let i = 0; i < 200 && !(slot.reload > 0); i++) step(s, { aim: { x: s.player.x + 300, y: s.player.y } });
  while (slot.reload > 0) step(s, { aim: { x: s.player.x + 300, y: s.player.y } });
  assert.equal(slot.heat, 0);
});

test('클래식 근거리 점사: 가까운 적이 있으면 한 번에 3발, 멀면 1발', () => {
  const s = quiet('classic');
  const p = s.player;
  enemy(s, p.x + 100, p.y);
  let shots = 0;
  for (let i = 0; i < 30 && !shots; i++) {
    step(s, { aim: { x: p.x + 100, y: p.y } });
    shots = s.events.filter((e) => e.type === 'shot').length;
  }
  assert.equal(shots, GUNS.classic.closeBurst.count);
  const t = quiet('classic');
  enemy(t, t.player.x + 500, t.player.y);
  let far = 0;
  for (let i = 0; i < 30 && !far; i++) {
    step(t, { aim: { x: t.player.x + 500, y: t.player.y } });
    far = t.events.filter((e) => e.type === 'shot').length;
  }
  assert.equal(far, 1);
});

test('밀쳐내기: 저지 펠릿에 맞은 적이 뒤로 밀린다', () => {
  const s = quiet('judge');
  const p = s.player;
  const e = enemy(s, p.x + 80, p.y);
  const x0 = e.x;
  for (let i = 0; i < 30 && e.hp === e.maxHp; i++) step(s, { aim: { x: e.x, y: e.y } });
  assert.ok(e.x > x0 + 5, `x0=${x0} x=${e.x}`);
});

test('셰리프 헤드샷: 크리티컬 배율이 더 크다', () => {
  const s = quiet('sheriff');
  const p = s.player;
  const e = enemy(s, p.x + 200, p.y);
  let hit = null;
  for (let i = 0; i < 60 && !hit; i++) {
    step(s, { aim: { x: e.x, y: e.y } }); // 조준점이 적 위 = 헤드샷
    hit = s.events.find((ev) => ev.type === 'hit' && ev.crit);
  }
  assert.ok(hit);
  assert.ok(Math.abs(hit.damage / GUNS.sheriff.damage - (CRIT.multiplier + GUNS.sheriff.critBonus)) < 0.05, `배율 ${hit.damage / GUNS.sheriff.damage}`);
});
