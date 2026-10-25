import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, choose } from '../src/core/game.js';
import { GUNS, TIERS } from '../src/data/guns.js';
import { DT } from '../src/data/balance.js';
import { createGunSlot } from '../src/core/state.js';
import { spawn } from '../src/core/systems/enemies.js';
import { endRound } from '../src/core/systems/rounds.js';
import { shopOptions } from '../src/core/systems/economy.js';

function withGun(id, evolved = false) {
  const s = createGame(1);
  s.spawnAcc = -1e9;
  const slot = { ...createGunSlot(id), tier: evolved ? TIERS.max : 1, evolved };
  s.player.stillT = 1; // 멈춘 상태 (이동 탄 퍼짐 없음)
  s.player.guns = [slot, null];
  return s;
}

test('저지: 한 번에 펠릿 여러 발, 짧은 사거리', () => {
  const s = withGun('judge');
  step(s, { aim: { x: s.player.x + 500, y: s.player.y } });
  assert.equal(s.bullets.length, GUNS.judge.pellets);
  assert.ok(s.bullets.every((b) => Math.abs(b.life - GUNS.judge.lifetime) <= DT + 1e-9), '같은 틱에 한 번 이동했다');
  const angles = s.bullets.map((b) => Math.atan2(b.vy, b.vx));
  assert.ok(Math.abs(Math.max(...angles) - Math.min(...angles) - GUNS.judge.spread) < 1e-6);
});

test('처형 저지: 처치 직후 다음 사격 펠릿 추가 (재충전 대기)', () => {
  const s = withGun('judge', 'slow');
  const p = s.player;
  const e = spawn(s, 'chaser', { x: p.x + 60, y: p.y });
  e.hp = 1;
  let fired = [];
  for (let i = 0; i < 120 && fired.length < 2; i++) {
    step(s, { aim: { x: p.x + 60, y: p.y } });
    const n = s.events.filter((ev) => ev.type === 'shot').length;
    if (n) fired.push(n);
  }
  assert.equal(fired[0], GUNS.judge.pellets);
  assert.equal(fired[1], GUNS.judge.pellets + GUNS.judge.evolutions.slow.pelletBonus);
});

test('오퍼레이터: 관통, 진화하면 관통할수록 피해 증가', () => {
  for (const evolved of [false, true]) {
    const s = withGun('operator', evolved && 'sniper');
    s.player.guns[0].tier = evolved ? TIERS.max : 1;
    const p = s.player;
    const line = [100, 160, 220].map((dx) => {
      const e = spawn(s, 'chaser', { x: p.x + dx, y: p.y });
      e.hp = e.maxHp = 1e6;
      e.speed = 0;
      return e;
    });
    for (let i = 0; i < 20; i++) step(s, { aim: { x: p.x + 500, y: p.y } });
    const dmg = line.map((e) => e.maxHp - e.hp);
    assert.ok(dmg.every((d) => d > 0), '관통');
    if (evolved) assert.ok(dmg[2] > dmg[0] * 1.3, `증가 ${dmg}`);
  }
});

test('주무기끼리는 서로 교체, 보조무기는 유지', () => {
  const s = createGame(3);
  endRound(s);
  while (s.pending?.kind !== 'shop') (s.pending ? choose(s, 0) : step(s, {}));
  s.credits = 1e6;
  for (const id of ['vandal', 'judge', 'operator', 'spectre']) {
    s.pending = { kind: 'shop', options: shopOptions(s) };
    choose(s, s.pending.options.findIndex((o) => o.kind === 'buyGun' && o.id === id));
    assert.equal(s.player.guns[0].id, id);
    assert.equal(s.player.guns[1].id, 'classic');
  }
});
