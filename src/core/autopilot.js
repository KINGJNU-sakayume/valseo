// 자동 전투 판단: 조준(가장 가까운 적, 엘리트가 가까우면 엘리트), 이동(적 밀집 반대 + 조각 쪽), 스킬 사용.
// 시뮬레이터 greedy 봇과 모바일 자동 전투가 같은 판단을 쓴다. core 규칙대로 전역 난수·시계·DOM 금지.
// 스킬 사용은 데이터 규칙(설계 21장): 스킬·형태의 auto 필드를 읽는다.
import { isBig, ENEMIES } from '../data/enemies.js';
import { UTILS } from '../data/utils.js';
import { targetable } from './systems/mutants.js';
import { WORLD } from '../data/balance.js';
import { ULT, SKILLS } from '../data/skills.js';
import { maxHp } from './stats.js';
import { branchOf, masteryAlt, ultCost } from './systems/skillutil.js';
import { blocked } from './systems/map.js';
import { agentInZone } from './systems/skills.js';

const T = {
  repelMin: 400, // 거리² 하한 (너무 가까운 적의 가중치 폭주 방지)
  wallMargin: 300,
  wallPush: 0.02,
  pickupRange: 220,
  pickupPull: 0.004,
  moveThreshold: 0.002,
  moveLook: 110, // 이동 후보 지점 거리 (≈0.5초)
  wallNear: 0.00012,
  openLook: 400,
  deadEnd: 0.0003,
  pickupBonus: 0.0002,
  goalBonus: 0.0005, // 라운드 목표 쪽으로
  zoneBonus: 0.0006, // 내 구역 안 (브림스톤: 한 자리를 지키는 요원, 설계 24.9)
  eliteFocusRange: 700,
  supportFocusRange: 550,
  blastDanger: 0.01,
  threatRange: 170, // 이 안에 적이 붙으면 우선순위보다 가까운 적 // 지원형(공명체·산란체) 우선 조준 거리
  recallHpPct: 0.35,
  evalEvery: 6, // 시전형 규칙 판단 주기 (틱)
  placeEvery: 60, // 앵커 설치 판단 주기
  placeRange: 420, // 설치형 스킬 사거리 (지점 계산)
  densestSamples: 40,
  lineWidth: 18,
  lineLength: 2200,
};

/**
 * opts.gentle: 사람이 직접 이동하는 모바일 자동 전투용. 정조준(Q, 이속 50%)은 규칙의 gentleHold 를 쓴다.
 * 반환값의 autoSkills: true 는 "자동 사용 중" 표시 (자동화 숙련이 자동 모드 효과로 바뀐다).
 */
export function decide(state, opts = {}) {
  const p = state.player;
  let nearest = null;
  let nd = Infinity;
  let fx = 0;
  let fy = 0;
  for (const e of state.enemies) {
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < nd && targetable(e)) {
      nd = d2;
      nearest = e;
    }
    const w = 1 / Math.max(d2, T.repelMin);
    fx -= dx * w;
    fy -= dy * w;
  }
  for (const b of state.enemyBullets) {
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const w = 1 / Math.max(dx * dx + dy * dy, T.repelMin);
    fx -= dx * w;
    fy -= dy * w;
  }
  let pk = null;
  let pd = Infinity;
  for (const k of state.pickups) {
    const d2 = (k.x - p.x) ** 2 + (k.y - p.y) ** 2;
    if (d2 < pd) {
      pd = d2;
      pk = k;
    }
  }
  if (pk && pd < T.pickupRange ** 2) {
    const d = Math.sqrt(pd);
    fx += ((pk.x - p.x) / d) * T.pickupPull;
    fy += ((pk.y - p.y) / d) * T.pickupPull;
  }

  const target = pickTarget(state, nearest);
  let aim = target ? { x: target.x, y: target.y } : { x: p.x + 1, y: p.y };
  const r = ruleKeys(state, { nearest, nd, target, gentle: !!opts.gentle });
  const keys = r.keys;
  if (r.aim) aim = r.aim;
  const t = T.moveThreshold;
  const move = state.map ? pickMove(state, pk && pd < T.pickupRange ** 2 ? pk : null) : { x: fx > t ? 1 : fx < -t ? -1 : 0, y: fy > t ? 1 : fy < -t ? -1 : 0 };
  return {
    move,
    aim,
    keys,
    autoSkills: true,
    autoAim: true,
  };
}

/**
 * 자동 조준 우선순위 (설계 13.6): 보이는 적만.
 * 0. 120 안의 과충전체, threatRange 안에 붙은 적 (포위 방지)
 * 1. 700 안의 엘리트·보스 (보스에게 결정 기둥이 남아 있으면 가장 가까운 기둥)
 * 2. 공명체 → 산란체 (지원형 먼저)
 * 3. 가장 가까운 적
 */
export function pickTarget(state, nearest = null) {
  const p = state.player;
  const closest = (pred, r) => {
    let best = null;
    let bd = r * r;
    for (const e of state.enemies) {
      if (!targetable(e) || !pred(e)) continue;
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d <= bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  };
  // 바로 붙은 위협이 먼저: 과충전체, 그다음 근접한 적 (엘리트만 쏘다 포위되지 않게)
  const fuse = closest((e) => e.type === 'overcharger', 120);
  if (fuse) return fuse;
  if (nearest && (nearest.x - p.x) ** 2 + (nearest.y - p.y) ** 2 <= T.threatRange ** 2) return nearest;
  const big = closest(isBig, T.eliteFocusRange);
  if (big) {
    if (big.type === 'boss' && big.pillars > 0) return closest((e) => e.type === 'pillar', 1e5) ?? big;
    return big;
  }
  const sup = closest((e) => e.type === 'resonator', T.supportFocusRange) ?? closest((e) => e.type === 'spawner', T.supportFocusRange);
  if (sup) return sup;
  return nearest ?? closest(() => true, 1e5);
}

/** 라운드 목표 지점 (해체 스파이크, 방어 사이트, 무기 상자). 가까우면 null. */
function objectiveGoal(state) {
  const p = state.player;
  const o = state.objective;
  const far = (pt, r) => (pt.x - p.x) ** 2 + (pt.y - p.y) ** 2 > r * r;
  const box = state.boxes?.[0];
  if (box) return box;
  if (!o || o.done) return null;
  if (o.type === 'defuse' && far(o, 40)) return o;
  if (o.type === 'defend' && !state.cleanup && far(o, 120)) return o;
  return null;
}

/** 위험 퍼텐셜: 적·적 탄이 가까울수록 크다. */
function danger(state, x, y) {
  let u = 0;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - x, e.y - y);
    const g = Math.max(d - e.r + 12, 0);
    u += Math.max(1, (e.damage ?? 8) / 8) / Math.max(g * g, T.repelMin);
    // 터지기 직전의 범위 공격(충격파·자폭) 안은 피한다
    const def = ENEMIES[e.type];
    if (e.shockWind > 0 && d < def.shock.radius + 30) u += T.blastDanger;
    if (e.mode === 'fuse' && d < def.fuse.radius + 30) u += T.blastDanger;
  }
  for (const b of state.enemyBullets) u += 0.6 / Math.max((b.x - x) ** 2 + (b.y - y) ** 2, T.repelMin);
  // 낙뢰(폭풍 변이) 예고 범위
  for (const h of state.hazards ?? []) if ((h.x - x) ** 2 + (h.y - y) ** 2 <= (h.r + 25) ** 2) u += T.blastDanger;
  return u;
}

const DIRS = [[0, 0], ...Array.from({ length: 8 }, (_, k) => [Math.cos((k / 8) * Math.PI * 2), Math.sin((k / 8) * Math.PI * 2)])];

/**
 * 맵 이동: 8방향 + 정지 후보 중 0.5초 뒤 위치의 위험이 가장 낮은 쪽.
 * 벽에 붙거나 막다른 방향(앞이 곧 막힘)은 벌점 — 구석에 몰리지 않게.
 */
function pickMove(state, pk) {
  const p = state.player;
  const m = state.map;
  const goal = objectiveGoal(state);
  let best = null;
  let bestU = Infinity;
  for (const [dx, dy] of DIRS) {
    const step = T.moveLook;
    const qx = p.x + dx * step;
    const qy = p.y + dy * step;
    if ((dx || dy) && (blocked(m, qx, qy) || blocked(m, p.x + dx * step * 0.5, p.y + dy * step * 0.5))) continue;
    let u = danger(state, qx, qy);
    if (agentInZone(state, qx, qy)) u -= T.zoneBonus;
    // 벽 근접 벌점
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (blocked(m, qx + Math.cos(a) * 60, qy + Math.sin(a) * 60)) u += T.wallNear;
      if (blocked(m, qx + Math.cos(a) * 130, qy + Math.sin(a) * 130)) u += T.wallNear * 0.4;
    }
    // 막다른 방향 벌점 (그 방향으로 얼마나 더 갈 수 있나)
    if (dx || dy) {
      let free = 0;
      while (free < T.openLook && !blocked(m, qx + dx * (free + 50), qy + dy * (free + 50))) free += 50;
      u += (1 - free / T.openLook) * T.deadEnd;
      if (pk) u -= Math.max(0, ((pk.x - p.x) * dx + (pk.y - p.y) * dy) / Math.hypot(pk.x - p.x, pk.y - p.y)) * T.pickupBonus;
      if (goal) u -= Math.max(0, ((goal.x - p.x) * dx + (goal.y - p.y) * dy) / Math.hypot(goal.x - p.x, goal.y - p.y)) * T.goalBonus;
    }
    if (u < bestU - 1e-12) {
      bestU = u;
      best = [dx, dy];
    }
  }
  if (!best) return { x: 0, y: 0 };
  const r = (v) => (v > 0.38 ? 1 : v < -0.38 ? -1 : 0);
  return { x: r(best[0]), y: r(best[1]) };
}

// ── 데이터 규칙 엔진 ─────────────────────────────────────────────────

/** 슬롯의 자동 규칙: 형태 규칙이 기본 규칙을 덮어쓴다. */
export function ruleOf(player, slot) {
  const s = player.skills[slot];
  const def = SKILLS[s.id];
  return (s.branch && def.branches[s.branch]?.auto) || def.auto || null;
}

/** 지금 쓸 수 있는가 (스킬 id 별). */
function ready(state, slot) {
  const p = state.player;
  const s = p.skills[slot];
  if (s.level <= 0) return false;
  switch (s.id) {
    case 'trademark':
    case 'alarmbot':
    case 'nanoswarm':
      return s.charges > 0;
    case 'headhunter':
      return s.ammo > 0;
    case 'tourDeForce':
      return s.extra > 0 || state.ultOrbs >= ultCost(p);
    case 'leer':
    case 'beacon':
    case 'skysmoke':
    case 'ember':
      return s.charges > 0;
    case 'orbital':
      return state.ultOrbs >= ultCost(p);
    case 'devour':
    case 'dismiss':
      return !(s.cd > 0) && ((p.souls ?? 0) > 0 || (slot === 'e' && s.free > 0) || (p.skills.x.mastery === 'soulThrone' && p.skills.x.active > 0));
    case 'empress':
      return !(s.active > 0) && state.ultOrbs >= ultCost(p);
    case 'lockdown':
      return state.ultOrbs >= ULT.orbsNeeded && state.lockdowns.length === 0;
    default:
      return !(s.cd > 0);
  }
}

function countWithin(state, x, y, r) {
  let n = 0;
  for (const e of state.enemies) if (e.hp > 0 && (e.x - x) ** 2 + (e.y - y) ** 2 <= r * r) n++;
  return n;
}

/** 사거리 안에서 반경 r 안의 적이 가장 많은 지점 (가까운 적 위치를 후보로). */
function densest(state, r) {
  const p = state.player;
  const cands = state.enemies
    .filter((e) => e.hp > 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= T.placeRange * T.placeRange)
    .slice(0, T.densestSamples);
  let best = null;
  let bn = 0;
  for (const c of cands) {
    const n = countWithin(state, c.x, c.y, r);
    if (n > bn) {
      bn = n;
      best = { x: c.x, y: c.y };
    }
  }
  return { pt: best, n: bn };
}

/** 조준 방향 직선 위의 적 수. */
function lineCount(state, to) {
  const p = state.player;
  const a = Math.atan2(to.y - p.y, to.x - p.x);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  let n = 0;
  for (const e of state.enemies) {
    const rx = e.x - p.x;
    const ry = e.y - p.y;
    const t = rx * dx + ry * dy;
    if (t >= 0 && t <= T.lineLength && Math.abs(rx * dy - ry * dx) <= e.r + T.lineWidth) n++;
  }
  return n;
}

const bigWithin = (state, r) => state.enemies.some((e) => isBig(e) && (e.x - state.player.x) ** 2 + (e.y - state.player.y) ** 2 <= r * r);

/** 플레이어를 향해 돌진 예고 중인 돌진수 (300 안). */
function incomingCharger(state) {
  const p = state.player;
  return state.enemies.find((e) => e.mode === 'telegraph' && e.type === 'charger' && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= 300 * 300
    && ((p.x - e.x) * e.dirX + (p.y - e.y) * e.dirY) > 0) ?? null;
}

/** 능력형 적 (제압할 가치가 있는 적): 기본 파편충·기둥·분신 제외. */
const hasAbility = (e) => e.type !== 'chaser' && e.type !== 'pillar' && !ENEMIES[e.type]?.clone && e.hp > 0;

function closestTo(state, from, pred, r) {
  let best = null;
  let bd = r * r;
  for (const e of state.enemies) {
    if (e.hp <= 0 || !pred(e)) continue;
    const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
    if (d <= bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** 조건 목록 중 하나라도 맞으면 true. 조건 형태는 [이름, ...인자]. */
function any(state, conds, c) {
  if (!conds) return false;
  const p = state.player;
  return conds.some((cond) => {
    const [name, a, b] = cond;
    if (name === 'all') return cond.slice(1).every((sub) => any(state, [sub], c));
    switch (name) {
      case 'ready': return true;
      case 'near': return !!c.nearest && c.nd <= a * a;
      case 'crowd': return densest(state, a).n >= b;
      case 'surrounded': return countWithin(state, p.x, p.y, a) >= b;
      case 'notSurrounded': return countWithin(state, p.x, p.y, a) < b;
      case 'elite': return bigWithin(state, a);
      case 'hpBelow': return p.hp < maxHp(p) * a;
      case 'line': return !!c.target && lineCount(state, c.target) >= a;
      case 'extraEnding': return p.skills.x.extraTimer < a;
      case 'noGuard': return !state.devices.some((d) => d.guard);
      case 'turretFar': {
        const ts = state.devices.filter((d) => d.kind === 'turret');
        return ts.length === 0 || ts.every((d) => (d.x - p.x) ** 2 + (d.y - p.y) ** 2 > a * a);
      }
      case 'minesHit': return (c.mines ?? []).reduce((n, z) => n + countWithin(state, z.x, z.y, z.r), 0) >= a;
      case 'mineElite': return (c.mines ?? []).some((z) => state.enemies.some((e) => isBig(e) && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= z.r * z.r));
      case 'ranged': return state.enemies.filter((e) => (e.type === 'ranged' || e.type === 'elite') && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= a * a).length >= b;
      case 'chargeIncoming': return !!incomingCharger(state);
      case 'souls': return (p.souls ?? 0) >= a;
      case 'hidden': return state.enemies.some((e) => e.hidden && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= a * a);
      case 'ability': return state.enemies.filter((e) => hasAbility(e) && !(e.suppressed > 0) && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= a * a).length >= b;
      case 'gadgets': return state.devices.length + state.zones.filter((z) => z.flight <= 0 && !z.dormant).length >= a;
      default: return false;
    }
  });
}

/** 규칙의 지점(at) → 조준점. 'aim' 이나 지점이 없으면 null (기본 조준 유지). */
function pointOf(state, at, rule, c) {
  const p = state.player;
  switch (at) {
    case 'self':
      return { x: p.x, y: p.y };
    case 'between':
      return c.nearest ? { x: p.x + (c.nearest.x - p.x) * (2 / 3), y: p.y + (c.nearest.y - p.y) * (2 / 3) } : null;
    case 'densest': {
      const crowd = rule.when?.find((w) => w[0] === 'crowd');
      return densest(state, crowd ? crowd[1] : 220).pt;
    }
    case 'spread': {
      // 이미 깐 덫에서 가장 먼, 사거리 70% 원 위의 지점 (8방향)
      let best = null;
      let bd = -1;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = Math.min(WORLD.width, Math.max(0, p.x + Math.cos(a) * T.placeRange * 0.7));
        const y = Math.min(WORLD.height, Math.max(0, p.y + Math.sin(a) * T.placeRange * 0.7));
        const d = state.traps.reduce((m, t) => Math.min(m, (t.x - x) ** 2 + (t.y - y) ** 2), Infinity);
        if (d > bd) {
          bd = d;
          best = { x, y };
        }
      }
      return best;
    }
    case 'nearest':
      return c.nearest ? { x: c.nearest.x, y: c.nearest.y } : null;
    case 'ahead': {
      // 적 무리 무게중심 방향, 사거리 70% (길목 선점)
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const e of state.enemies) {
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > 600 * 600) continue;
        sx += e.x;
        sy += e.y;
        n++;
      }
      if (!n) return null;
      const dx = sx / n - p.x;
      const dy = sy / n - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(d, T.placeRange * 0.7) / d;
      return { x: p.x + dx * k, y: p.y + dy * k };
    }
    case 'charger': {
      const e = incomingCharger(state);
      return e ? { x: (e.x + p.x) / 2, y: (e.y + p.y) / 2 } : null;
    }
    case 'hiddenOrDensest': {
      const h = closestTo(state, p, (e) => e.hidden, 800);
      return h ? { x: h.x, y: h.y } : densest(state, 300).pt;
    }
    case 'abilityOrBig': {
      // 능력형 적이 가장 많이 모인 곳 (없으면 엘리트·보스)
      let best = null;
      let bn = 0;
      for (const e of state.enemies) {
        if (!hasAbility(e) || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > T.placeRange * T.placeRange) continue;
        const n = state.enemies.filter((o) => hasAbility(o) && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= 220 * 220).length;
        if (n > bn) {
          bn = n;
          best = { x: e.x, y: e.y };
        }
      }
      const big = closestTo(state, p, isBig, 600);
      return bn >= 2 || !big ? best : { x: big.x, y: big.y };
    }
    case 'away': {
      // 적 무게중심 반대쪽
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const e of state.enemies) {
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > 400 * 400) continue;
        sx += e.x;
        sy += e.y;
        n++;
      }
      if (!n) return null;
      const dx = p.x - sx / n;
      const dy = p.y - sy / n;
      const d = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / d) * 200, y: p.y + (dy / d) * 200 };
    }
    case 'safestGadget': {
      let best = null;
      let bn = Infinity;
      for (const t of state.traps) {
        const n = countWithin(state, t.x, t.y, 200);
        if (n < bn) {
          bn = n;
          best = { x: t.x, y: t.y };
        }
      }
      return best;
    }
    default:
      return null;
  }
}

/** 요원 공통 스킬 판단: 슬롯마다 규칙 형태(유지 / 설치·귀환 / 지뢰 / 시전)에 따라. */
function ruleKeys(state, c) {
  const p = state.player;
  const keys = { c: false, q: false, e: false, x: false, u: false, f: false };
  let aim = null;
  const evalTick = state.tick % T.evalEvery === 0;
  const hpLow = p.hp < maxHp(p) * T.recallHpPct;
  const setAim = (pt) => {
    if (pt && !aim) aim = pt;
  };

  // 유틸 (설계 21.3): 첫 슬롯 u(우클릭), 둘째 f. 던지는 이번 틱은 조준점을 유틸이 쓴다
  if (evalTick) {
    const utils = p.utils ?? [];
    for (let i = 0; i < utils.length; i++) {
      const u = utils[i];
      const rule = UTILS[u.id].auto;
      if (!rule || u.charges <= 0 || u.cd > 0 || !any(state, rule.when, c)) continue;
      const pt = pointOf(state, rule.at, rule, c);
      if (!pt) continue;
      keys[i === 0 ? 'u' : 'f'] = true;
      return { keys, aim: pt };
    }
  }

  for (const slot of ['e', 'c', 'q', 'x']) {
    const s = p.skills[slot];
    const rule = ruleOf(p, slot);
    if (!rule || s.level <= 0) continue;
    if (rule.hold) {
      // 유지형 (헤드헌터): 조건 동안 누르고 있는다
      if (!ready(state, slot) || hpLow || !c.target) continue;
      const noSlow = (branchOf(p, slot)?.speedMult ?? masteryAlt(p, slot)?.speedMult) === 1;
      keys[slot] = any(state, c.gentle && !noSlow ? rule.gentleHold : rule.hold, c);
    } else if (rule.place || rule.recall) {
      // 설치·귀환형 (랑데부). 덫 귀환은 앵커 없이 덫으로
      if (branchOf(p, slot)?.noAnchor) {
        if (!(s.cd > 0) && state.traps.length > 0 && any(state, rule.recall?.when, c)) {
          keys[slot] = true;
          setAim(pointOf(state, rule.at ?? 'safestGadget', rule, c));
        }
      } else if (!s.anchor) {
        keys[slot] = !(s.cd > 0) && state.tick % T.placeEvery === 0 && any(state, rule.place?.when, c);
      } else {
        keys[slot] = any(state, rule.recall?.when, c);
      }
    } else if (rule.mines) {
      // 은닉 지뢰: 발동 조건이면 누르고 있기(길게), 아니면 짧게 눌러 설치
      const m = rule.mines;
      const mines = state.zones.filter((z) => z.dormant && z.flight <= 0);
      if (mines.length && any(state, m.trigger, { ...c, mines })) keys[slot] = true;
      else if (evalTick && ready(state, slot) && any(state, m.place, c)) {
        keys[slot] = true;
        setAim(pointOf(state, m.at, m, c));
      }
    } else if (rule.when && evalTick) {
      // 시전형: 조건이면 지점에
      if (!ready(state, slot) || !any(state, rule.when, c)) continue;
      const pt = pointOf(state, rule.at, rule, c);
      if (!pt && rule.at !== 'aim') continue;
      if (slot === 'x' && s.extra > 0 && rule.extra && !any(state, rule.extra, c)) continue;
      keys[slot] = true;
      if (rule.at !== 'self' || slot === 'c' || s.id === 'skysmoke') setAim(pt); // 신호기·연막은 발밑에 놓는다
    }
  }
  // 2발 장전: 남은 한 발은 extra 조건으로
  const xs = p.skills.x;
  const xr = ruleOf(p, 'x');
  if (evalTick && xs.extra > 0 && xr?.extra && c.target) keys.x = any(state, xr.extra, c);
  return { keys, aim };
}
