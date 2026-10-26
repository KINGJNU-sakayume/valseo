// 맵 (설계 v0.2 12장): 벽 충돌, 철문, 텔레포터, 게이트, 적 경로(flow field). core 규칙대로 DOM·난수 금지 (난수는 state.rng).
import { DT } from '../../data/balance.js';
import { MAP, MAPS } from '../../data/maps.js';

const SITE_LETTERS = 'ABC';
const TELE_PAIRS = [['T', 't'], ['U', 'u']];

/** 맵 데이터 → state.map. 플레이어는 시작 위치로. */
export function loadMap(state, id) {
  const def = MAPS[id];
  const g = def.grid;
  const n = g.length;
  const C = MAP.cell;
  const center = (x, y) => ({ x: (x + 0.5) * C, y: (y + 0.5) * C });
  const solid = new Array(n * n).fill(0);
  const doors = [];
  const switches = [];
  const ends = {};
  const gates = [];
  const spikes = [];
  const sites = {};
  let start = center(n / 2, n / 2);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const ch = g[y][x];
      if (ch === '#') solid[y * n + x] = 1;
      // 시작 위치: P 칸의 오른쪽 아래 모서리 (네 칸이 열려 있다)
      if (ch === 'P') start = { x: (x + 1) * C, y: (y + 1) * C };
      else if (ch === 'D') doors.push({ cx: x, cy: y, open: true, hold: 0, switch: null });
      else if (ch === 's') switches.push(center(x, y));
      else if (ch === 'G') gates.push(center(x, y));
      else if (ch === 'S') spikes.push(center(x, y));
      else if ('TtUu'.includes(ch)) ends[ch] = center(x, y);
      if (SITE_LETTERS.includes(ch)) (sites[ch] ??= []).push(center(x, y));
    }
  }
  // 스파이크 지점은 둘러싼 사이트에 속한다
  for (const sp of spikes) {
    const near = SITE_LETTERS.split('').find((L) => sites[L]?.some((c) => Math.abs(c.x - sp.x) <= C && Math.abs(c.y - sp.y) <= C));
    if (near) sites[near].push(sp);
  }
  // 문마다 가장 가까운 스위치
  for (const d of doors) {
    const dc = center(d.cx, d.cy);
    d.switch = switches.reduce((a, b) => (!a || (b.x - dc.x) ** 2 + (b.y - dc.y) ** 2 < (a.x - dc.x) ** 2 + (a.y - dc.y) ** 2 ? b : a), null);
  }
  const tele = TELE_PAIRS.filter(([a, b]) => ends[a] && ends[b]).map(([a, b]) => ({ a: ends[a], b: ends[b], used: 0, span: 0 }));
  const siteCenter = {};
  for (const [L, cells] of Object.entries(sites)) {
    siteCenter[L] = { x: cells.reduce((s, c) => s + c.x, 0) / cells.length, y: cells.reduce((s, c) => s + c.y, 0) / cells.length };
  }
  state.map = {
    id, n, cell: C, solid, block: solid.slice(), doors, tele, gates, spikes, sites: siteCenter, start,
    version: 0, nav: null,
  };
  refreshBlock(state.map);
  const p = state.player;
  p.x = start.x;
  p.y = start.y;
  p.tpLock = false;
}

/** 닫힌 문을 벽으로 반영. */
export function refreshBlock(m) {
  m.block = m.solid.slice();
  for (const d of m.doors) if (!d.open) m.block[d.cy * m.n + d.cx] = 1;
  for (const w of m.walls ?? []) for (const c of w.cells) m.block[c] = 1; // 장벽 (유틸)
  m.version++;
}

/** (x, y)가 막혀 있는가 (벽·닫힌 문·맵 밖). 맵이 없으면 false. */
export function blocked(m, x, y) {
  if (!m) return false;
  const cx = Math.floor(x / m.cell);
  const cy = Math.floor(y / m.cell);
  if (cx < 0 || cy < 0 || cx >= m.n || cy >= m.n) return true;
  return m.block[cy * m.n + cx] === 1;
}

/** 원(엔티티)을 막힌 칸 밖으로 밀어낸다. 밀었으면 true. */
export function pushOut(m, ent) {
  if (!m) return false;
  const C = m.cell;
  let moved = false;
  for (let pass = 0; pass < 2; pass++) {
    const x0 = Math.floor((ent.x - ent.r) / C);
    const x1 = Math.floor((ent.x + ent.r) / C);
    const y0 = Math.floor((ent.y - ent.r) / C);
    const y1 = Math.floor((ent.y + ent.r) / C);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!(cx < 0 || cy < 0 || cx >= m.n || cy >= m.n) && m.block[cy * m.n + cx] !== 1) continue;
        const rx = cx * C;
        const ry = cy * C;
        const nx = Math.max(rx, Math.min(ent.x, rx + C));
        const ny = Math.max(ry, Math.min(ent.y, ry + C));
        let dx = ent.x - nx;
        let dy = ent.y - ny;
        const d = Math.hypot(dx, dy);
        if (d >= ent.r) continue;
        if (d === 0) {
          // 중심이 칸 안(또는 변 위): 열린 쪽 중 가장 얕은 변 밖으로
          const sides = [
            [ent.x - rx, rx - ent.r, null, -1, 0],
            [rx + C - ent.x, rx + C + ent.r, null, 1, 0],
            [ent.y - ry, null, ry - ent.r, 0, -1],
            [ry + C - ent.y, null, ry + C + ent.r, 0, 1],
          ].sort((u, v) => u[0] - v[0]);
          const open = sides.find(([, , , sx, sy]) => !blocked(m, (cx + 0.5 + sx) * C, (cy + 0.5 + sy) * C)) ?? sides[0];
          if (open[1] !== null) ent.x = open[1];
          else ent.y = open[2];
        } else {
          dx /= d;
          dy /= d;
          ent.x = nx + dx * ent.r;
          ent.y = ny + dy * ent.r;
        }
        moved = true;
      }
    }
  }
  return moved;
}

/** from 에서 to 로 가다가 막히기 직전 지점 (설치 지점이 벽 속에 들어가지 않게). */
export function clampToFloor(m, from, to) {
  if (!m || !blocked(m, to.x, to.y)) return to;
  const steps = 20;
  let last = { x: from.x, y: from.y };
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    if (blocked(m, x, y)) break;
    last = { x, y };
  }
  return last;
}

// ── 문·텔레포터 ──────────────────────────────────────────────────────

export function updateMap(state) {
  const m = state.map;
  if (!m) return;
  const p = state.player;
  // 철문: 스위치 위에 holdTime 동안 서 있으면 열림↔닫힘
  for (const d of m.doors) {
    if (!d.switch) continue;
    const on = (p.x - d.switch.x) ** 2 + (p.y - d.switch.y) ** 2 <= MAP.door.switchRadius ** 2;
    if (!on) {
      d.hold = 0;
      continue;
    }
    if (d.hold < 0) continue; // 이번에 이미 바꿨다: 스위치에서 내려와야 다시
    d.hold += DT;
    if (d.hold >= MAP.door.holdTime) {
      d.open = !d.open;
      d.hold = -1;
      refreshBlock(m);
      const C = m.cell;
      state.events.push({ type: 'door', open: d.open, x: (d.cx + 0.5) * C, y: (d.cy + 0.5) * C });
    }
  }
  // 텔레포터: 플레이어와 적 공용
  const T = MAP.teleporter;
  let onAny = false;
  for (const t of m.tele) {
    t.span += DT;
    if (t.span >= 1) {
      t.span -= 1;
      t.used = 0;
    }
    for (const [from, to] of [[t.a, t.b], [t.b, t.a]]) {
      if ((p.x - from.x) ** 2 + (p.y - from.y) ** 2 <= T.radius ** 2) {
        onAny = true;
        if (!p.tpLock) {
          p.x = to.x;
          p.y = to.y;
          p.tpLock = true;
          p.invuln = Math.max(p.invuln, T.exitInvuln);
          state.events.push({ type: 'teleporter', from, to, who: 'player' });
        }
      }
      for (const e of state.enemies) {
        if (e.tpCd > 0 || t.used >= T.throughput || e.type === 'boss') continue;
        if ((e.x - from.x) ** 2 + (e.y - from.y) ** 2 > T.radius ** 2) continue;
        e.x = to.x;
        e.y = to.y;
        e.tpCd = T.enemyCooldown;
        t.used++;
      }
    }
  }
  // 출구에 선 채로 되돌아가지 않게: 텔레포터 밖으로 나가면 잠금 해제
  if (!onAny) p.tpLock = false;
}

// ── 적 경로: flow field (플레이어 칸 기준 BFS, 텔레포터는 비용 linkCost 간선) ──

function navOf(state, goal = state.player) {
  const m = state.map;
  const N = Math.round((m.n * m.cell) / MAP.navCell);
  const p = goal;
  const pc = Math.min(N - 1, Math.max(0, Math.floor(p.y / MAP.navCell))) * N + Math.min(N - 1, Math.max(0, Math.floor(p.x / MAP.navCell)));
  // 목표 칸별 캐시 (플레이어 + 방어 라운드의 사이트 정도라 둘이면 충분)
  m.navs ??= [];
  const hit = m.navs.find((n) => n.from === pc && n.version === m.version);
  if (hit) return hit;
  const block = new Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) block[y * N + x] = blocked(m, (x + 0.5) * MAP.navCell, (y + 0.5) * MAP.navCell) ? 1 : 0;
  }
  const link = new Map();
  const idx = (pt) => Math.floor(pt.y / MAP.navCell) * N + Math.floor(pt.x / MAP.navCell);
  for (const t of m.tele) {
    link.set(idx(t.a), idx(t.b));
    link.set(idx(t.b), idx(t.a));
  }
  const INF = 1e9;
  const dist = new Array(N * N).fill(INF);
  // 다이얼(버킷) 다익스트라: 이웃 비용 1, 텔레포터 비용 linkCost
  const buckets = [[pc]];
  dist[pc] = 0;
  for (let d = 0; d < buckets.length; d++) {
    const b = buckets[d];
    if (!b) continue;
    for (const c of b) {
      if (dist[c] !== d) continue;
      const cx = c % N;
      const cy = (c - cx) / N;
      const relax = (nc, w) => {
        if (block[nc] || dist[nc] <= d + w) return;
        dist[nc] = d + w;
        (buckets[d + w] ??= []).push(nc);
      };
      if (cx > 0) relax(c - 1, 1);
      if (cx < N - 1) relax(c + 1, 1);
      if (cy > 0) relax(c - N, 1);
      if (cy < N - 1) relax(c + N, 1);
      const l = link.get(c);
      if (l !== undefined) relax(l, MAP.teleporter.linkCost);
    }
  }
  const nav = { from: pc, version: m.version, N, dist, link };
  m.navs.unshift(nav);
  m.navs.length = Math.min(m.navs.length, 3);
  return nav;
}

const DIAG_X = [-1, 1, -1, 1];
const DIAG_Y = [-1, -1, 1, 1];

/**
 * 적이 향할 지점: 같은 칸이거나 경로가 없으면 플레이어, 아니면 거리가 줄어드는 이웃 칸 중심.
 * 다음 칸이 텔레포터 건너편이면 이쪽 텔레포터 중심으로 (들어가면 건너간다).
 */
export function navTarget(state, e, goal = state.player) {
  const m = state.map;
  const p = goal;
  if (!m) return p;
  // 시야가 트여 있으면 곧장 (경로 칸 중심을 따라 지그재그하지 않게)
  if (clearLine(m, e.x, e.y, p.x, p.y)) return p;
  const nav = navOf(state, goal);
  const { N, dist, link } = nav;
  const ex = Math.min(N - 1, Math.max(0, Math.floor(e.x / MAP.navCell)));
  const ey = Math.min(N - 1, Math.max(0, Math.floor(e.y / MAP.navCell)));
  const c = ey * N + ex;
  const here = dist[c];
  if (here === 0 || here >= 1e9) return p;
  let best = -1;
  let bd = here;
  // 후보 순서: 왼·오른·위·아래, 그다음 대각선 (배열을 만들지 않고 같은 순서로 본다)
  const consider = (nc) => {
    if (dist[nc] < bd) {
      bd = dist[nc];
      best = nc;
    }
  };
  if (ex > 0) consider(c - 1);
  if (ex < N - 1) consider(c + 1);
  if (ey > 0) consider(c - N);
  if (ey < N - 1) consider(c + N);
  // 대각선: 양쪽 직교 칸이 열려 있을 때만 (모서리 뚫기 방지)
  for (let k = 0; k < 4; k++) {
    const nx = ex + DIAG_X[k];
    const ny = ey + DIAG_Y[k];
    if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
    if (dist[ey * N + nx] >= 1e9 || dist[ny * N + ex] >= 1e9) continue;
    consider(ny * N + nx);
  }
  const l = link.get(c);
  if (l !== undefined && dist[l] + MAP.teleporter.linkCost === here && (best < 0 || dist[l] + MAP.teleporter.linkCost <= bd)) {
    // 텔레포터를 타는 게 최선: 이 칸의 텔레포터 중심으로
    const t = m.tele.find((t) => [t.a, t.b].some((pt) => Math.floor(pt.y / MAP.navCell) * N + Math.floor(pt.x / MAP.navCell) === c));
    const pt = [t.a, t.b].find((q) => Math.floor(q.y / MAP.navCell) * N + Math.floor(q.x / MAP.navCell) === c);
    return pt;
  }
  if (best < 0) return p;
  const bx = best % N;
  return { x: (bx + 0.5) * MAP.navCell, y: ((best - bx) / N + 0.5) * MAP.navCell };
}

/** 두 점 사이에 막힌 칸이 없는가 (25 단위 표본, 600 이상은 false). */
export function clearLine(m, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (d > 600) return false;
  const n = Math.ceil(d / 25);
  for (let i = 1; i < n; i++) if (blocked(m, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
  return true;
}

/** 스폰 지점: 게이트(플레이어에게서 충분히 먼 것) 근처의 열린 지점, 없으면 null. */
export function gatePoint(state, roll, jitterX, jitterY) {
  const m = state.map;
  if (!m || m.gates.length === 0) return null;
  const p = state.player;
  const far = m.gates.filter((g) => (g.x - p.x) ** 2 + (g.y - p.y) ** 2 >= MAP.gateMinDist ** 2);
  if (far.length === 0) return null;
  const g = far[Math.min(far.length - 1, Math.floor(roll * far.length))];
  const x = g.x + jitterX * MAP.gateJitter;
  const y = g.y + jitterY * MAP.gateJitter;
  return blocked(m, x, y) ? { x: g.x, y: g.y } : { x, y };
}

/** 좌표가 속한 사이트 글자 (A/B/C) 또는 null. 스파이크 칸은 둘러싼 사이트. */
export function siteAt(m, x, y) {
  if (!m) return null;
  const g = MAPS[m.id].grid;
  const cx = Math.floor(x / m.cell);
  const cy = Math.floor(y / m.cell);
  const ch = g[cy]?.[cx];
  if (SITE_LETTERS.includes(ch)) return ch;
  if (ch !== 'S') return null;
  let best = null;
  let bd = Infinity;
  for (const [L, c] of Object.entries(m.sites)) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = L;
    }
  }
  return best;
}

/** 열린 바닥 칸 중심 목록 (게이트·텔레포터 제외). */
export function floorCells(m) {
  const g = MAPS[m.id].grid;
  const out = [];
  for (let y = 0; y < m.n; y++) for (let x = 0; x < m.n; x++) if (!m.solid[y * m.n + x] && '.ABCS'.includes(g[y][x])) out.push({ x: (x + 0.5) * m.cell, y: (y + 0.5) * m.cell });
  return out;
}
