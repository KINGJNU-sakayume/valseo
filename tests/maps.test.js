import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, choose } from '../src/core/game.js';
import { MAPS, MAP, ACTS, mapForRound } from '../src/data/maps.js';
import { DT } from '../src/data/balance.js';
import { blocked, loadMap, navTarget } from '../src/core/systems/map.js';
import { startRound } from '../src/core/systems/rounds.js';
import { spawn } from '../src/core/systems/enemies.js';

const N = 20;
const PAIRS = { T: 't', t: 'T', U: 'u', u: 'U' };

/** 격자 BFS: 시작 위치에서 닿지 않는 통행 칸 목록. doorsClosed 면 D 를 벽으로. */
function unreachable(grid, doorsClosed) {
  const block = (c) => c === '#' || (doorsClosed && c === 'D');
  const pos = {};
  let start = null;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = grid[y][x];
    if (c === 'P') start = [x, y];
    if (PAIRS[c]) pos[c] = [x, y];
  }
  const seen = new Set([start.join()]);
  const q = [start];
  while (q.length) {
    const [x, y] = q.shift();
    const next = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    const c = grid[y][x];
    if (PAIRS[c]) next.push(pos[PAIRS[c]]);
    for (const [nx, ny] of next) {
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || block(grid[ny][nx]) || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  const lost = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!block(grid[y][x]) && !seen.has(`${x},${y}`)) lost.push([x, y]);
  return lost;
}

test('맵 데이터: 20×20, 테두리 벽, 시작·게이트·스파이크가 벽이 아니다', () => {
  for (const [id, m] of Object.entries(MAPS)) {
    assert.equal(m.grid.length, N, id);
    for (const row of m.grid) assert.equal(row.length, N, id);
    for (let i = 0; i < N; i++) {
      assert.equal(m.grid[0][i], '#');
      assert.equal(m.grid[N - 1][i], '#');
      assert.equal(m.grid[i][0], '#');
      assert.equal(m.grid[i][N - 1], '#');
    }
    const flat = m.grid.join('');
    assert.equal((flat.match(/P/g) ?? []).length, 1, `${id} 시작 위치 1개`);
    assert.ok((flat.match(/G/g) ?? []).length >= 3, `${id} 게이트`);
    assert.ok((flat.match(/S/g) ?? []).length >= 2, `${id} 스파이크 지점`);
  }
  assert.deepEqual(ACTS.map((a) => a.map), ['ascent', 'bind', 'haven']);
});

test('맵 연결성: 문이 열려도 닫혀도 모든 통행 칸이 이어진다 (텔레포터 포함)', () => {
  for (const [id, m] of Object.entries(MAPS)) {
    assert.deepEqual(unreachable(m.grid, false), [], `${id} 문 열림`);
    assert.deepEqual(unreachable(m.grid, true), [], `${id} 문 닫힘`);
  }
});

test('사이트 입구: 문을 닫아도 다른 입구가 남는다', () => {
  for (const [id, m] of Object.entries(MAPS)) {
    for (const L of 'ABC') {
      const cells = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m.grid[y][x] === L || (m.grid[y][x] === 'S' && cells.length)) cells.push([x, y]);
      if (!cells.length) continue;
      const inSite = new Set(cells.map((c) => c.join()));
      let entrances = 0;
      for (const [x, y] of cells) {
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const c = m.grid[ny][nx];
          if (c !== '#' && c !== 'D' && c !== 'S' && !inSite.has(`${nx},${ny}`) && !'ABC'.includes(c)) entrances++;
        }
      }
      assert.ok(entrances >= 2, `${id} ${L} 입구 ${entrances}`);
    }
  }
});

test('벽: 플레이어·적이 통과하지 못하고, 탄은 벽에서 사라진다', () => {
  const s = createGame(1);
  s.spawnAcc = -1e9;
  s.player.invuln = 1e9;
  // 어센트 (3,10)~(4,11) 벽 덩어리 오른쪽에서 왼쪽으로 걷기
  s.player.x = 560;
  s.player.y = 1050;
  for (let i = 0; i < 60; i++) step(s, { move: { x: -1, y: 0 } });
  assert.ok(s.player.x >= 500 + s.player.r - 1e-6, `x=${s.player.x}`);
  assert.ok(!blocked(s.map, s.player.x, s.player.y));
  s.player.guns = [null, { id: 'classic', tier: 1, cooldown: 0, mods: {}, evolved: false, critStreak: 0 }];
  for (let i = 0; i < 30; i++) step(s, { aim: { x: 0, y: s.player.y } });
  assert.ok(s.bullets.every((b) => b.x > 500), '벽 너머로 탄이 가지 않는다');
});

test('철문: 스위치 위에 1초 서 있으면 닫히고, 닫힌 문은 벽, 다시 서면 열린다', () => {
  const s = createGame(1);
  s.spawnAcc = -1e9;
  s.player.invuln = 1e9;
  const d = s.map.doors.find((x) => x.cx === 6);
  assert.ok(d.open);
  s.player.x = d.switch.x;
  s.player.y = d.switch.y;
  for (let i = 0; i < Math.ceil(MAP.door.holdTime / DT) + 2; i++) step(s, {});
  assert.equal(d.open, false);
  assert.ok(blocked(s.map, (d.cx + 0.5) * 100, (d.cy + 0.5) * 100));
  for (let i = 0; i < 90; i++) step(s, {});
  assert.equal(d.open, false, '내려오기 전에는 다시 바뀌지 않는다');
  s.player.x += 200;
  step(s, {});
  s.player.x -= 200;
  for (let i = 0; i < Math.ceil(MAP.door.holdTime / DT) + 2; i++) step(s, {});
  assert.equal(d.open, true);
});

test('텔레포터 (바인드): 플레이어는 건너가고 출구에서 바로 되돌아가지 않는다, 적은 재사용 대기', () => {
  const s = createGame(1);
  s.spawnAcc = -1e9;
  s.player.invuln = 1e9;
  startRound(s, 5);
  assert.equal(s.map.id, 'bind');
  const t = s.map.tele[0];
  s.player.x = t.a.x;
  s.player.y = t.a.y;
  step(s, {});
  assert.ok(Math.abs(s.player.x - t.b.x) < 1e-6 && Math.abs(s.player.y - t.b.y) < 1e-6);
  for (let i = 0; i < 30; i++) step(s, {});
  assert.ok(Math.abs(s.player.x - t.b.x) < 1e-6, '출구에 서 있어도 되돌아가지 않는다');

  const e = spawn(s, 'chaser', { x: t.a.x, y: t.a.y });
  e.speed = 0;
  step(s, {});
  assert.ok(Math.abs(e.x - t.b.x) < 30, '적도 건너간다');
  assert.ok(e.tpCd > 0);
});

test('적 경로: 벽 너머 플레이어에게 돌아서 온다', () => {
  const s = createGame(3);
  s.spawnAcc = -1e9;
  s.player.invuln = 1e9;
  startRound(s, 5); // 바인드: 가운데 척추 벽 (x 9~10, y 4~15)
  s.enemies.length = 0;
  s.player.x = 750;
  s.player.y = 1000;
  const e = spawn(s, 'chaser', { x: 1250, y: 1000 });
  const first = navTarget(s, e);
  assert.ok(Math.abs(first.x - s.player.x) > 1 || Math.abs(first.y - s.player.y) > 1, '직선이 아니라 경로');
  let reached = false;
  for (let i = 0; i < 60 * 25 && !reached; i++) {
    step(s, {});
    assert.ok(!blocked(s.map, e.x, e.y), '벽 속으로 들어가지 않는다');
    reached = Math.hypot(e.x - s.player.x, e.y - s.player.y) < 60;
  }
  assert.ok(reached, '돌아서 도착');
});

test('스폰: 대부분 게이트 근처, 벽 속에는 나오지 않는다', () => {
  const s = createGame(4);
  s.player.invuln = 1e9;
  s.player.guns = [null, null];
  const seen = new Set();
  let total = 0;
  let near = 0;
  for (let i = 0; i < 60 * 15; i++) {
    step(s, {});
    for (const e of s.enemies) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      total++;
      assert.ok(!blocked(s.map, e.x, e.y), '벽 속 스폰 없음');
      if (s.map.gates.some((g) => Math.hypot(g.x - e.x, g.y - e.y) < 100)) near++;
    }
  }
  assert.ok(total > 10);
  assert.ok(near >= total * 0.5, `게이트에서 나온 적 ${near}/${total}`);
});

test('막: 라운드 5에 바인드, 9에 헤이븐, 플레이어는 시작 위치로', () => {
  assert.equal(mapForRound(1), 'ascent');
  assert.equal(mapForRound(5), 'bind');
  assert.equal(mapForRound(12), 'haven');
  const s = createGame(5);
  assert.equal(s.map.id, 'ascent');
  startRound(s, 9);
  assert.equal(s.map.id, 'haven');
  assert.ok(Math.abs(s.player.x - s.map.start.x) < 1e-9 && Math.abs(s.player.y - s.map.start.y) < 1e-9);
  assert.ok(s.map.sites.C, '헤이븐은 사이트 셋');
  const t = createGame(6);
  loadMap(t, 'bind');
  assert.equal(t.map.tele.length, 2);
  void choose;
});
