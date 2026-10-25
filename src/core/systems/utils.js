// 유틸 슬롯 (설계 v0.2 9장): 용병 계약 실행. 던지는 유틸은 비행 → 착탄 → (지연) 효과.
// 입력: keys.u (우클릭) → 첫 슬롯, keys.f → 둘째 슬롯 (슬롯이 하나면 F 도 첫 슬롯).
import { isBig } from '../../data/enemies.js';
import { DT, WORLD } from '../../data/balance.js';
import { UTIL, UTILS } from '../../data/utils.js';
import { aimPoint } from './skillutil.js';
import { clampToFloor, pushOut, clearLine, refreshBlock } from './map.js';
import { addField } from './fields.js';
import { damageEnemy } from './combat.js';
import { relicOf } from './relics.js';

/** 레벨별 값 (배열이면 레벨에 맞게). */
export const utilValue = (id, key, level) => {
  const v = UTILS[id][key];
  return Array.isArray(v) ? v[Math.max(1, level) - 1] : v;
};

export const utilSlots = (p) => UTIL.slots + (relicOf(p, 'twinSlot')?.slots ?? 0);

/** 라운드당 무료 충전 수. */
export const freeCharges = (u) => utilValue(u.id, 'freeCharges', u.level) ?? UTIL.freePerRound;

/** 계약 생성 (구매 시). */
export function createUtil(id) {
  return { id, level: 1, charges: freeCharges({ id, level: 1 }), cd: 0 };
}

/** 라운드 시작: 무료 충전. */
export function refillUtils(state) {
  for (const u of state.player.utils ?? []) u.charges = Math.min(UTIL.maxCharges, Math.max(u.charges, freeCharges(u)));
}

const growth = (state) => 1 + UTIL.damageGrowth * (state.round - 1);

export function updateUtils(state, input) {
  const p = state.player;
  const keys = input.keys ?? {};
  const utils = p.utils ?? [];
  utils.forEach((u, i) => {
    if (u.cd > 0) u.cd = Math.max(0, u.cd - DT);
    const pressed = i === 0 ? keys.u || (keys.f && utils.length < 2) : keys.f;
    if (pressed && u.charges > 0 && !(u.cd > 0)) useUtil(state, u, input);
  });
  updateDash(state);
  updateShots(state);
  updateFx(state);
  updateSeekers(state);
  updateUtilZones(state);
  updateSmokes(state);
  updateWalls(state);
}

function useUtil(state, u, input) {
  const p = state.player;
  const def = UTILS[u.id];
  u.charges--;
  u.cd = UTIL.useCooldown;
  state.events.push({ type: 'utilUse', id: u.id, x: p.x, y: p.y });
  if (u.id === 'tailwind') {
    // 이동 방향 (없으면 조준 방향)으로 대시
    let dx = input.move?.x ?? 0;
    let dy = input.move?.y ?? 0;
    if (!dx && !dy) {
      dx = (input.aim?.x ?? p.x + 1) - p.x;
      dy = (input.aim?.y ?? p.y) - p.y;
    }
    const d = Math.hypot(dx, dy) || 1;
    const t = def.time;
    p.dash = { vx: (dx / d) * (utilValue('tailwind', 'distance', u.level) / t), vy: (dy / d) * (utilValue('tailwind', 'distance', u.level) / t), t };
    p.invuln = Math.max(p.invuln, t + 0.05);
    return;
  }
  if (u.id === 'tracker') {
    const n = utilValue('tracker', 'count', u.level);
    for (let k = 0; k < n; k++) {
      const a = p.aim + (k - (n - 1) / 2) * 0.6;
      (state.seekers ??= []).push({ x: p.x, y: p.y, vx: Math.cos(a), vy: Math.sin(a), life: def.life, level: u.level, target: 0, k });
    }
    return;
  }
  if (u.id === 'flash') {
    const r = def.radius;
    let n = 0;
    for (const e of state.enemies) {
      if (e.hp <= 0 || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r * r || !clearLine(state.map, p.x, p.y, e.x, e.y)) continue;
      e.blind = Math.max(e.blind ?? 0, utilValue('flash', 'blind', u.level));
      if (utilValue('flash', 'vuln', u.level)) e.vulnerable = Math.max(e.vulnerable, e.blind);
      n++;
    }
    state.events.push({ type: 'flash', x: p.x, y: p.y, n });
    return;
  }
  if (u.id === 'wall') {
    placeWall(state, u, input);
    return;
  }
  const to = clampToFloor(state.map, p, aimPoint(p, input, def.range, WORLD));
  (state.utilShots ??= []).push({ id: u.id, level: u.level, x: p.x, y: p.y, tx: to.x, ty: to.y });
}

/** 장벽: 조준 방향 앞에 수직으로 벽 칸 (맵 막힘에 더해 적·탄·경로를 막는다). 플레이어 칸은 비운다. */
function placeWall(state, u, input) {
  const m = state.map;
  if (!m) return;
  const p = state.player;
  const def = UTILS.wall;
  const a = Math.atan2((input.aim?.y ?? p.y) - p.y, (input.aim?.x ?? p.x + 1) - p.x);
  const cx = p.x + Math.cos(a) * def.distance;
  const cy = p.y + Math.sin(a) * def.distance;
  const n = utilValue('wall', 'cells', u.level);
  const cells = [];
  const pc = Math.floor(p.y / m.cell) * m.n + Math.floor(p.x / m.cell);
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * m.cell;
    const x = cx + Math.cos(a + Math.PI / 2) * off;
    const y = cy + Math.sin(a + Math.PI / 2) * off;
    const gx = Math.floor(x / m.cell);
    const gy = Math.floor(y / m.cell);
    if (gx <= 0 || gy <= 0 || gx >= m.n - 1 || gy >= m.n - 1) continue;
    const c = gy * m.n + gx;
    if (c === pc || m.block[c] || cells.includes(c)) continue;
    // 게이트·텔레포터 칸에는 세우지 않는다
    if (m.gates.some((g) => Math.floor(g.y / m.cell) * m.n + Math.floor(g.x / m.cell) === c)) continue;
    if (m.tele.some((t) => [t.a, t.b].some((q) => Math.floor(q.y / m.cell) * m.n + Math.floor(q.x / m.cell) === c))) continue;
    cells.push(c);
  }
  if (!cells.length) return;
  (m.walls ??= []).push({ cells, t: utilValue('wall', 'duration', u.level) });
  refreshBlock(m);
  // 벽 속에 갇힌 적은 밀어낸다
  for (const e of state.enemies) pushOut(m, e);
  state.events.push({ type: 'wallUp', cells: cells.length, x: cx, y: cy });
}

function updateWalls(state) {
  const m = state.map;
  if (!m?.walls?.length) return;
  let changed = false;
  for (let i = m.walls.length - 1; i >= 0; i--) {
    m.walls[i].t -= DT;
    if (m.walls[i].t <= 0) {
      m.walls.splice(i, 1);
      changed = true;
    }
  }
  if (changed) refreshBlock(m);
}

/** 추적자: 엘리트·은신 → 가까운 적 순으로 쫓아가 근시(실명) + 표식. */
function updateSeekers(state) {
  const list = state.seekers ?? [];
  const def = UTILS.tracker;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    s.life -= DT;
    let t = state.enemies.find((e) => e.id === s.target && e.hp > 0);
    if (!t) {
      const pool = state.enemies.filter((e) => e.hp > 0 && !(e.blind > 0));
      const pref = pool.filter((e) => isBig(e) || e.hidden);
      const from = pref.length ? pref : pool;
      let bd = Infinity;
      for (const e of from) {
        const d = (e.x - s.x) ** 2 + (e.y - s.y) ** 2 + (s.k ? e.id * 1e-3 : 0);
        if (d < bd && !list.some((o) => o !== s && o.target === e.id)) {
          bd = d;
          t = e;
        }
      }
      s.target = t?.id ?? 0;
    }
    if (t) {
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      s.vx = dx / d;
      s.vy = dy / d;
      if (d <= t.r + 10) {
        t.blind = Math.max(t.blind ?? 0, utilValue('tracker', 'blind', s.level));
        t.mark = Math.max(t.mark ?? 0, def.mark);
        state.events.push({ type: 'trackerHit', x: t.x, y: t.y });
        list.splice(i, 1);
        continue;
      }
    }
    s.x += s.vx * def.speed * DT;
    s.y += s.vy * def.speed * DT;
    if (s.life <= 0) list.splice(i, 1);
  }
}

/** 소이탄 장판: 0.25초마다 피해, Lv3 은 취약. */
function updateUtilZones(state) {
  const list = state.utilZones ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const z = list[i];
    z.life -= DT;
    z.tick -= DT;
    if (z.tick <= 0) {
      z.tick += 0.25;
      for (const e of state.enemies) {
        if (e.hp <= 0 || (e.x - z.x) ** 2 + (e.y - z.y) ** 2 > (z.r + e.r) ** 2) continue;
        if (z.vuln) e.vulnerable = Math.max(e.vulnerable, 0.5);
        damageEnemy(state, e, z.dps * 0.25, false, 'incendiary');
      }
    }
    if (z.life <= 0) list.splice(i, 1);
  }
}

function updateSmokes(state) {
  const list = state.smokes ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].life -= DT;
    if (list[i].life <= 0) list.splice(i, 1);
  }
}

/** (x, y) 가 연막 안인가. */
export function inSmoke(state, x, y) {
  return (state.smokes ?? []).some((s) => (s.x - x) ** 2 + (s.y - y) ** 2 <= s.r * s.r);
}

function updateDash(state) {
  const p = state.player;
  if (!p.dash) return;
  p.x += p.dash.vx * DT;
  p.y += p.dash.vy * DT;
  p.x = Math.min(WORLD.width - p.r, Math.max(p.r, p.x));
  p.y = Math.min(WORLD.height - p.r, Math.max(p.r, p.y));
  pushOut(state.map, p);
  p.dash.t -= DT;
  if (p.dash.t <= 0) p.dash = null;
}

function updateShots(state) {
  const list = state.utilShots ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    const dx = s.tx - s.x;
    const dy = s.ty - s.y;
    const d = Math.hypot(dx, dy);
    const stepLen = UTIL.throwSpeed * DT;
    if (d <= stepLen) {
      list.splice(i, 1);
      land(state, s.id, s.level, s.tx, s.ty);
    } else {
      s.x += (dx / d) * stepLen;
      s.y += (dy / d) * stepLen;
    }
  }
}

/** 착탄: 즉시 효과 또는 지연 효과 등록. */
function land(state, id, level, x, y) {
  const def = UTILS[id];
  const fx = (state.utilFx ??= []);
  if (id === 'recon') fx.push({ kind: 'scan', x, y, t: 0, left: utilValue(id, 'scans', level), level });
  else if (id === 'zeroPoint') {
    fx.push({ kind: 'zeroPoint', x, y, t: def.windup, level });
    state.events.push({ type: 'zeroPointLand', x, y, r: utilValue(id, 'radius', level), t: def.windup });
  } else if (id === 'frag') fx.push({ kind: 'frag', x, y, t: def.fuse, level, stage: 0 });
  else if (id === 'incendiary') {
    (state.utilZones ??= []).push({ x, y, r: def.radius, life: def.duration, maxLife: def.duration, dps: utilValue(id, 'dps', level) * growth(state), vuln: utilValue(id, 'vuln', level), tick: 0 });
    state.events.push({ type: 'incendiary', x, y, r: def.radius });
  } else if (id === 'smoke') {
    const r = utilValue(id, 'radius', level);
    (state.smokes ??= []).push({ x, y, r, life: def.duration, maxLife: def.duration });
    state.events.push({ type: 'smoke', x, y, r });
  } else if (id === 'slowOrb') {
    addField(state, x, y, def.radius, utilValue(id, 'duration', level), utilValue(id, 'slow', level));
    state.events.push({ type: 'slowOrb', x, y, r: def.radius });
  }
}

function updateFx(state) {
  const fx = state.utilFx ?? [];
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t -= DT;
    if (f.t > 0) continue;
    fx.splice(i, 1);
    if (f.kind === 'scan') scan(state, f, fx);
    else if (f.kind === 'zeroPoint') zeroPoint(state, f);
    else if (f.kind === 'frag' || f.kind === 'fragBomb') frag(state, f, fx);
  }
}

function scan(state, f, fx) {
  const def = UTILS.recon;
  const dur = utilValue('recon', 'mark', f.level);
  let n = 0;
  for (const e of state.enemies) {
    if (e.hp <= 0 || (e.x - f.x) ** 2 + (e.y - f.y) ** 2 > def.radius * def.radius) continue;
    e.mark = Math.max(e.mark ?? 0, dur);
    n++;
  }
  state.events.push({ type: 'scan', x: f.x, y: f.y, r: def.radius, n });
  if (--f.left > 0) fx.push({ ...f, t: def.scanGap });
}

function zeroPoint(state, f) {
  const def = UTILS.zeroPoint;
  const r = utilValue('zeroPoint', 'radius', f.level);
  const dur = utilValue('zeroPoint', 'suppress', f.level);
  let n = 0;
  for (const e of state.enemies) {
    if (e.hp <= 0 || (e.x - f.x) ** 2 + (e.y - f.y) ** 2 > (r + e.r) ** 2) continue;
    e.suppressed = Math.max(e.suppressed ?? 0, dur);
    e.mark = Math.max(e.mark ?? 0, def.mark);
    n++;
  }
  state.events.push({ type: 'zeroPoint', x: f.x, y: f.y, r, n });
}

function frag(state, f, fx) {
  const def = UTILS.frag;
  const big = f.kind === 'frag';
  const r = big ? def.radius : def.split.radius;
  const base = big ? utilValue('frag', 'damage', f.level) : def.split.damage[f.level - 1] * (f.stage > 1 ? 0.6 : 1);
  const dmg = base * growth(state);
  for (const e of state.enemies) {
    const rr = r + e.r;
    if (e.hp > 0 && (e.x - f.x) ** 2 + (e.y - f.y) ** 2 <= rr * rr) damageEnemy(state, e, dmg, false, big ? 'frag' : 'fragBomb');
  }
  state.events.push({ type: 'fragBlast', x: f.x, y: f.y, r, big });
  // 분열: 1단계(큰 폭발) → 소형 폭탄. Lv3 는 소형 폭탄이 한 번 더 둘로
  const stages = utilValue('frag', 'stages', f.level);
  if (f.stage < stages) {
    const n = big ? def.split.count : 2;
    const spread = big ? def.split.spread : def.split.spread * 0.5;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + f.stage * 0.6;
      const at = clampToFloor(state.map, f, { x: f.x + Math.cos(a) * spread, y: f.y + Math.sin(a) * spread });
      fx.push({ kind: 'fragBomb', x: at.x, y: at.y, t: def.split.delay, level: f.level, stage: f.stage + 1 });
    }
  }
}
