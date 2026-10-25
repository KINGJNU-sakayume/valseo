import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { ENEMIES, isElite } from '../src/data/enemies.js';
import { ROUNDS, SPAWN_MIX, ELITE_BY_ROUND } from '../src/data/rounds.js';
import { DT } from '../src/data/balance.js';
import { spawn, spawnWeights, hpScale } from '../src/core/systems/enemies.js';
import { startRound } from '../src/core/systems/rounds.js';

function quiet(seed = 1) {
  const s = createGame(seed);
  s.spawnAcc = -1e9;
  s.player.guns = [null, null];
  return s;
}
const idle = (s, ticks) => {
  for (let i = 0; i < ticks; i++) step(s, {});
};

test('라운드 구성 (설계 13.3): 막이 오를수록 변이체가 늘어난다', () => {
  assert.deepEqual(Object.keys(spawnWeights(1)), ['chaser']);
  assert.ok('charger' in spawnWeights(2) && !('ranged' in spawnWeights(2)));
  assert.ok(!('ranged' in spawnWeights(4)) && !('carapace' in spawnWeights(3)));
  assert.ok('carapace' in spawnWeights(4) && 'ranged' in spawnWeights(5) && !('refractor' in spawnWeights(6)));
  assert.ok('refractor' in spawnWeights(7) && 'resonator' in spawnWeights(8) && !('spawner' in spawnWeights(8)));
  assert.ok('spawner' in spawnWeights(9) && !('overcharger' in spawnWeights(9)));
  assert.ok('overcharger' in spawnWeights(10) && 'overcharger' in spawnWeights(12));
  assert.equal(SPAWN_MIX[0].fromRound, 1);
  for (const m of SPAWN_MIX) for (const k of Object.keys(m.weights)) assert.ok(ENEMIES[k], k);
});

test('스폰 예산: R5 에서 cost 만큼 소비하며 여러 종류가 나온다', () => {
  const s = createGame(9);
  startRound(s, 5);
  s.player.hp = 1e9;
  idle(s, 60 * 40);
  const types = new Set(s.enemies.map((e) => e.type));
  assert.ok(types.has('chaser') && types.has('charger') && types.has('ranged'), [...types].join());
  for (const e of s.enemies) assert.ok(Math.abs(e.maxHp - ENEMIES[e.type].hp * hpScale(5)) < 1e-9);
});

test('막 엘리트는 4·8·11 라운드(막의 마무리)에 한 번만 등장, 처치 시 오브 확정', () => {
  for (const [R, type] of Object.entries(ELITE_BY_ROUND)) {
    const u = createGame(3);
    startRound(u, Number(R));
    u.spawnAcc = -1e9;
    u.player.invuln = 1e9;
    u.player.guns = [null, null];
    idle(u, Math.ceil(ROUNDS.eliteSpawnTime / DT) + 5);
    assert.equal(u.enemies.filter((e) => e.type === type).length, 1, type);
    assert.ok(isElite(u.enemies.find((e) => e.type === type)));
  }
  const s = createGame(2);
  startRound(s, 4);
  s.spawnAcc = -1e9;
  s.player.hp = 1e9;
  s.player.guns = [null, null];
  idle(s, Math.ceil(ROUNDS.eliteSpawnTime / DT) + 5);
  const elites = s.enemies.filter(isElite);
  assert.equal(elites.length, 1);
  assert.equal(elites[0].type, 'lord');
  idle(s, 60 * 5);
  assert.equal(s.enemies.filter(isElite).length, 1);

  elites[0].hp = -1;
  const orbs = s.ultOrbs;
  step(s, {});
  assert.equal(s.ultOrbs, orbs + 1);

  const t = createGame(2);
  startRound(t, 5);
  t.player.hp = 1e9;
  idle(t, Math.ceil(ROUNDS.eliteSpawnTime / DT) + 5);
  assert.ok(!t.enemies.some(isElite));
});

test('돌격형: 사거리 안에서 예고 → 고정 방향 돌진 → 회복', () => {
  const s = quiet();
  const p = s.player;
  const def = ENEMIES.charger;
  const e = spawn(s, 'charger', { x: p.x + 200, y: p.y });
  step(s, {});
  assert.equal(e.mode, 'telegraph');
  const x0 = e.x;
  idle(s, Math.floor(def.telegraph / DT) - 2);
  assert.equal(e.x, x0, '예고 중에는 멈춰 있다');
  p.y += 300; // 플레이어가 피해도 방향은 고정
  idle(s, 4);
  assert.equal(e.mode, 'dash');
  assert.equal(e.dirY, 0);
  assert.ok(e.x < x0);
  idle(s, Math.ceil(def.dashDuration / DT) + 1);
  assert.equal(e.mode, 'recover');
});

test('원거리형: 거리 유지 + 주기적 사격, 투사체가 플레이어에게 피해', () => {
  const s = quiet();
  const p = s.player;
  const def = ENEMIES.ranged;
  const e = spawn(s, 'ranged', { x: p.x + 100, y: p.y });
  idle(s, 60);
  assert.ok(Math.hypot(e.x - p.x, e.y - p.y) > 100, '가까우면 물러난다');
  const hp = p.hp;
  let shots = 0;
  for (let i = 0; i < Math.ceil(def.fireInterval * 2 / DT) + 60; i++) {
    step(s, {});
    shots += s.events.filter((ev) => ev.type === 'enemyShot').length;
  }
  assert.ok(shots >= 2, `shots=${shots}`);
  assert.ok(p.hp < hp, '투사체 피격');
});

test('엘리트 사격은 3방향 부채꼴', () => {
  const s = quiet();
  const p = s.player;
  const e = spawn(s, 'elite', { x: p.x - 500, y: p.y }); // 기준 각도 0 (±π 경계 회피), 벽 없는 칸
  e.fireCd = 0;
  step(s, {});
  assert.equal(s.enemyBullets.length, ENEMIES.elite.shot.count);
  const angles = s.enemyBullets.map((b) => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b);
  assert.ok(Math.abs(angles[1] - angles[0] - ENEMIES.elite.shot.spread) < 1e-9);
});

test('감속 필드는 돌진 속도도 늦춘다', () => {
  const s = quiet();
  const p = s.player;
  const e = spawn(s, 'charger', { x: p.x + 200, y: p.y });
  e.mode = 'dash';
  e.t = 10;
  e.dirX = -1;
  e.dirY = 0;
  s.fields.push({ x: e.x, y: e.y, r: 300, life: 10, maxLife: 10, slow: 0.5 });
  const x0 = e.x;
  step(s, {});
  assert.ok(Math.abs(x0 - e.x - ENEMIES.charger.dashSpeed * 0.5 * DT) < 1e-9);
});
