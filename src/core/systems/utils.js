// 유틸 슬롯 (설계 v0.2 9장): 용병 계약 실행. 던지는 유틸은 비행 → 착탄 → (지연) 효과.
// 입력: keys.u (우클릭) → 첫 슬롯, keys.f → 둘째 슬롯 (슬롯이 하나면 F 도 첫 슬롯).
import { DT, WORLD } from '../../data/balance.js';
import { UTIL, UTILS } from '../../data/utils.js';
import { aimPoint } from './skillutil.js';
import { clampToFloor, pushOut } from './map.js';
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
  const to = clampToFloor(state.map, p, aimPoint(p, input, def.range, WORLD));
  (state.utilShots ??= []).push({ id: u.id, level: u.level, x: p.x, y: p.y, tx: to.x, ty: to.y });
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
  else if (id === 'slowOrb') {
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
