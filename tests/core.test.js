import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, choose, DT } from '../src/core/game.js';
import { mulberry32 } from '../src/core/rng.js';
import { createSpatialHash, insert, query } from '../src/core/spatial.js';

/** 가장 가까운 적을 조준하고, 입력열 함수 moveAt(tick)으로 움직이는 간단한 봇 입력. */
function botInput(state, moveAt) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return {
    move: moveAt(state.tick),
    aim: best ? { x: best.x, y: best.y } : { x: p.x + 1, y: p.y },
    keys: { c: false, q: false, e: false, x: false },
  };
}

const circleMove = (t) => {
  const phase = Math.floor(t / 90) % 4;
  return [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }][phase];
};

function run(seed, ticks) {
  const s = createGame(seed);
  for (let i = 0; i < ticks && s.phase === 'COMBAT'; i++) step(s, botInput(s, circleMove));
  return s;
}

function snapshot(s) {
  return JSON.stringify({
    tick: s.tick,
    phase: s.phase,
    rng: s.rng,
    player: s.player,
    kills: s.stats.kills,
    enemies: s.enemies.map((e) => [e.id, e.x, e.y, e.hp]),
  });
}

test('core 는 Node 에서 import·실행된다', () => {
  const s = createGame(1);
  assert.equal(s.phase, 'COMBAT');
  step(s, {});
  assert.equal(s.tick, 1);
  assert.ok(Math.abs(s.time - DT) < 1e-12);
});

test('mulberry32: 같은 시드 = 같은 수열, 범위 [0,1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(43);
  const sa = Array.from({ length: 1000 }, a);
  const sb = Array.from({ length: 1000 }, b);
  const sc = Array.from({ length: 1000 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test('결정성: 같은 시드 + 같은 입력 = 같은 결과', () => {
  const ticks = 60 * 60;
  assert.equal(snapshot(run(7, ticks)), snapshot(run(7, ticks)));
  assert.notEqual(snapshot(run(7, ticks)), snapshot(run(8, ticks)));
});

test('스모크: 클래식 자동 발사로 추격형을 처치한다', () => {
  const s = run(123, 60 * 30);
  assert.ok(s.stats.kills > 0, `kills=${s.stats.kills}`);
});

test('정지한 플레이어는 결국 HP 0 → DEFEAT', () => {
  const s = createGame(5);
  s.player.guns = [null, null]; // 무기 없이
  let sawDefeat = false;
  for (let i = 0; i < 60 * 120 && s.phase === 'COMBAT'; i++) {
    step(s, {});
    if (s.events.some((e) => e.type === 'defeat')) sawDefeat = true;
  }
  assert.equal(s.phase, 'DEFEAT');
  assert.ok(sawDefeat);
  const tick = s.tick;
  step(s, {});
  assert.equal(s.tick, tick, 'DEFEAT 이후 step 은 no-op');
});

test('pending 이 있으면 step 은 no-op, choose 는 pending 이 없으면 false', () => {
  const s = createGame(1);
  assert.equal(choose(s, 0), false);
  s.pending = { kind: 'test', options: [] };
  step(s, {});
  assert.equal(s.tick, 0);
});

test('공간 해시 query 는 겹칠 수 있는 항목만 돌려준다', () => {
  const h = createSpatialHash(64);
  const a = { x: 10, y: 10, r: 5 };
  const b = { x: 500, y: 500, r: 5 };
  const big = { x: 100, y: 100, r: 80 }; // 여러 셀에 걸침
  insert(h, a);
  insert(h, b);
  insert(h, big);
  const out = [];
  query(h, 12, 12, 4, out);
  assert.ok(out.includes(a) && out.includes(big) && !out.includes(b));
  assert.equal(new Set(out).size, out.length, '중복 없음');
});
