import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/core/game.js';
import { spawn } from '../src/core/systems/enemies.js';
import { decide } from '../src/core/autopilot.js';
import { blocked } from '../src/core/systems/map.js';

function quiet() {
  const s = createGame(1, 'chamber');
  s.spawnAcc = -1e9;
  s.enemies.length = 0;
  return s;
}
const dummy = (s, x, y) => Object.assign(spawn(s, 'chaser', { x, y }), { speed: 0 });
const box = (p, r) => ({ x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r });

test('모바일 자동 조준: 화면(view) 밖의 적은 노리지 않는다', () => {
  const s = quiet();
  const p = s.player;
  const far = dummy(s, p.x + 700, p.y);
  assert.equal(decide(s).aimTarget, far.id, '시뮬레이터 봇(view 없음)은 맵 전체');
  assert.equal(decide(s, { view: box(p, 300) }).aimTarget, null, '화면 밖이면 대상 없음');
  const near = dummy(s, p.x + 120, p.y + 40);
  assert.equal(decide(s, { view: box(p, 300) }).aimTarget, near.id);
});

test('모바일 자동 조준: 벽에 가린 적은 노리지 않는다', () => {
  const s = quiet();
  const p = s.player;
  // 맵에서 "열린 곳 → 벽 → 열린 곳" 이 가로로 이어지는 자리를 찾아 플레이어와 적을 둔다
  let wall = null;
  for (let y = 100; y < 3000 && !wall; y += 50) {
    for (let x = 100; x < 3000 && !wall; x += 50) {
      if (blocked(s.map, x, y) || !blocked(s.map, x + 120, y) || blocked(s.map, x + 300, y)) continue;
      wall = { px: x, x: x + 300, y };
    }
  }
  assert.ok(wall, '맵에 벽이 있어야 한다');
  p.x = wall.px;
  p.y = wall.y;
  const hidden = dummy(s, wall.x, wall.y);
  assert.notEqual(decide(s, { view: box(p, 400) }).aimTarget, hidden.id);
});

test('모바일 자동 조준: 대상을 기억해 더 가까운 적이 와도 바로 바꾸지 않는다 (붙으면 바꾼다)', () => {
  const s = quiet();
  const p = s.player;
  const memory = { targetId: null };
  const a = dummy(s, p.x + 260, p.y);
  assert.equal(decide(s, { view: box(p, 400), memory }).aimTarget, a.id);
  const b = dummy(s, p.x - 220, p.y);
  assert.equal(decide(s, { view: box(p, 400), memory }).aimTarget, a.id, '기존 대상 유지');
  b.x = p.x - 60;
  assert.equal(decide(s, { view: box(p, 400), memory }).aimTarget, b.id, '바로 붙은 위협으로 교체');
});
