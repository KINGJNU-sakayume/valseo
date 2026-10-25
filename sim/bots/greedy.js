// greedy 봇: 조준은 가장 가까운 적(엘리트가 가까우면 엘리트), 이동은 적 밀집 반대 + 조각 쪽,
// 선택은 우선순위 표(스킬 > 총기 개조 > 패시브)와 상점 우선순위 표를 따른다.
// core 와 마찬가지로 전역 난수·시계를 쓰지 않는다 (같은 시드 = 같은 결과).
import { WORLD } from '../../src/data/balance.js';
import { SKILLS, ULT } from '../../src/data/skills.js';
import { maxHp } from '../../src/core/stats.js';
import { GUNS, SLOTS } from '../../src/data/guns.js';

const T = {
  repelMin: 400, // 거리² 하한 (너무 가까운 적의 가중치 폭주 방지)
  wallMargin: 300,
  wallPush: 0.02,
  pickupRange: 220,
  pickupPull: 0.004,
  moveThreshold: 0.002,
  trapRange: 320,
  trapEvery: 20, // 틱
  eliteFocusRange: 700,
  recallHpPct: 0.35,
  precisionRange: 500,
  nanoRange: 300,
  nanoEvery: 30,
  lockdownRange: 320,
  lockdownCrowd: 14,
};

const CARD_PRIORITY = ['skill', 'gunMod', 'passive', 'heal'];
// 스킬 해금/강화 순서 선호
const SKILL_PRIORITY = ['c', 'x', 'q', 'e'];
const SHOP_PRIORITY = ['buyGun:vandal', 'buyGun:sheriff', 'tierUp', 'armor:heavy', 'ultOrb', 'armor:light', 'card'];

export function decide(state) {
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
  const s = p.skills;
  const keys = state.agent === 'killjoy'
    ? killjoyKeys(state, nearest, nd, target, eliteNear)
    : {
    c: !!nearest && nd < T.trapRange ** 2 && state.tick % T.trapEvery === 0,
    x: !!target && (state.ultOrbs >= ULT.orbsNeeded || s.x.extra > 0),
    // 앵커가 없으면 깔아 두고, 위험할 때 귀환
    e: s.e.level > 0 && (!s.e.anchor ? s.e.cd <= 0 && state.tick % 60 === 0 : hpLow(state) || surrounded(state)),
    q: s.q.level > 0 && !!target && s.q.ammo > 0 && (eliteNear || nd < T.precisionRange ** 2) && hpOk(state),
  };
  const t = T.moveThreshold;
  return {
    move: { x: fx > t ? 1 : fx < -t ? -1 : 0, y: fy > t ? 1 : fy < -t ? -1 : 0 },
    aim: target ? { x: target.x, y: target.y } : { x: p.x + 1, y: p.y },
    keys,
  };
}

// 킬조이: 알람봇·나노스웜은 가까운 적 쪽으로, 포탑은 쿨다운마다 발밑에, 락다운은 주변이 붐비거나 엘리트·보스가 가까울 때
function killjoyKeys(state, nearest, nd, target, eliteNear) {
  const p = state.player;
  const s = p.skills;
  let crowd = 0;
  for (const e of state.enemies) if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < T.lockdownRange ** 2) crowd++;
  return {
    c: !!nearest && nd < T.trapRange ** 2 && state.tick % T.trapEvery === 0,
    q: s.q.level > 0 && !!target && nd < T.nanoRange ** 2 && state.tick % T.nanoEvery === 0,
    e: s.e.level > 0 && s.e.cd <= 0,
    x: s.x.level > 0 && state.ultOrbs >= ULT.orbsNeeded && state.lockdowns.length === 0 && (crowd >= T.lockdownCrowd || eliteNear),
  };
}

function hpLow(state) {
  return state.player.hp < maxHp(state.player) * T.recallHpPct;
}
function hpOk(state) {
  return !hpLow(state);
}
function surrounded(state) {
  const p = state.player;
  let n = 0;
  for (const e of state.enemies) if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 120 * 120) n++;
  return n >= 6;
}

// 총 순위: 같은 슬롯의 총은 더 높은 순위이고, 지금 총에 티어 투자가 없을 때만 교체
const GUN_RANK = { classic: 0, sheriff: 1, vandal: 2 };

function worthBuying(state, opt) {
  if (opt.kind !== 'buyGun') return true;
  const cur = state.player.guns[SLOTS[GUNS[opt.id].slot].index];
  if (!cur) return true;
  return GUN_RANK[opt.id] > GUN_RANK[cur.id] && cur.tier === 1;
}

/**
 * state.pending 에 대한 선택 index.
 * opts.branch: 'A' | 'B' | 'alt'(기본, 틱 홀짝으로 섞음) — 분기별 강약 측정용
 */
export function choose(state, opts = {}) {
  const pending = state.pending;
  const o = pending.options;
  if (pending.kind === 'branch') {
    const policy = opts.branch ?? 'alt';
    return policy === 'alt' ? state.tick % 2 : o.findIndex((x) => x.branch === policy);
  }
  if (pending.kind === 'levelup') {
    let best = 0;
    const rank = (c) => CARD_PRIORITY.indexOf(c.type) * 10 + (c.type === 'skill' ? SKILL_PRIORITY.indexOf(c.key) : 0);
    o.forEach((c, i) => {
      if (rank(c) < rank(o[best])) best = i;
    });
    return best;
  }
  for (const want of SHOP_PRIORITY) {
    const i = o.findIndex((x) => x.enabled && (x.kind === want || `${x.kind}:${x.id}` === want) && worthBuying(state, x));
    if (i >= 0) return i;
  }
  return o.findIndex((x) => x.kind === 'next');
}
