// 자동 전투 판단: 조준(가장 가까운 적, 엘리트가 가까우면 엘리트), 이동(적 밀집 반대 + 조각 쪽), 스킬 사용.
// 시뮬레이터 greedy 봇과 모바일 자동 전투가 같은 판단을 쓴다. core 규칙대로 전역 난수·시계·DOM 금지.
// 스킬 사용은 데이터 규칙(설계 21장): 스킬·형태의 auto 필드를 읽는다.
import { WORLD } from '../data/balance.js';
import { ULT, SKILLS } from '../data/skills.js';
import { maxHp } from './stats.js';
import { branchOf, masteryAlt, ultCost } from './systems/skillutil.js';

const T = {
  repelMin: 400, // 거리² 하한 (너무 가까운 적의 가중치 폭주 방지)
  wallMargin: 300,
  wallPush: 0.02,
  pickupRange: 220,
  pickupPull: 0.004,
  moveThreshold: 0.002,
  eliteFocusRange: 700,
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
  let elite = null;
  for (const e of state.enemies) {
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < nd) {
      nd = d2;
      nearest = e;
    }
    if (e.type === 'elite') elite = e;
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
  const m = T.wallMargin;
  if (p.x < m) fx += T.wallPush;
  if (p.x > WORLD.width - m) fx -= T.wallPush;
  if (p.y < m) fy += T.wallPush;
  if (p.y > WORLD.height - m) fy -= T.wallPush;

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

  const eliteNear = elite && (elite.x - p.x) ** 2 + (elite.y - p.y) ** 2 < T.eliteFocusRange ** 2;
  const target = eliteNear ? elite : nearest;
  let aim = target ? { x: target.x, y: target.y } : { x: p.x + 1, y: p.y };
  const r = ruleKeys(state, { nearest, nd, target, gentle: !!opts.gentle });
  const keys = r.keys;
  if (r.aim) aim = r.aim;
  const t = T.moveThreshold;
  return {
    move: { x: fx > t ? 1 : fx < -t ? -1 : 0, y: fy > t ? 1 : fy < -t ? -1 : 0 },
    aim,
    keys,
    autoSkills: true,
    autoAim: true,
  };
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

const bigWithin = (state, r) => state.enemies.some((e) => (e.type === 'elite' || e.type === 'boss') && (e.x - state.player.x) ** 2 + (e.y - state.player.y) ** 2 <= r * r);

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
      case 'mineElite': return (c.mines ?? []).some((z) => state.enemies.some((e) => (e.type === 'elite' || e.type === 'boss') && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= z.r * z.r));
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
  const keys = { c: false, q: false, e: false, x: false };
  let aim = null;
  const evalTick = state.tick % T.evalEvery === 0;
  const hpLow = p.hp < maxHp(p) * T.recallHpPct;
  const setAim = (pt) => {
    if (pt && !aim) aim = pt;
  };

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
      // 설치·귀환형 (랑데뷰). 덫 귀환은 앵커 없이 덫으로
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
      if (rule.at !== 'self' || slot === 'c') setAim(pt);
    }
  }
  // 2발 장전: 남은 한 발은 extra 조건으로
  const xs = p.skills.x;
  const xr = ruleOf(p, 'x');
  if (evalTick && xs.extra > 0 && xr?.extra && c.target) keys.x = any(state, xr.extra, c);
  return { keys, aim };
}
