// 자동 전투 판단: 조준(가장 가까운 적, 엘리트가 가까우면 엘리트), 이동(적 밀집 반대 + 조각 쪽), 스킬 사용.
// 시뮬레이터 greedy 봇과 모바일 자동 전투가 같은 판단을 쓴다. core 규칙대로 전역 난수·시계·DOM 금지.
import { WORLD } from '../data/balance.js';
import { ULT } from '../data/skills.js';
import { maxHp } from './stats.js';

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

/**
 * opts.gentle: 사람이 직접 이동하는 모바일 자동 전투용. 정조준(Q, 이속 50%)은 엘리트가 가까울 때만 쓴다.
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
  const s = p.skills;
  const keys = state.agent === 'killjoy'
    ? killjoyKeys(state, nearest, nd, target, eliteNear)
    : {
    c: !!nearest && nd < T.trapRange ** 2 && state.tick % T.trapEvery === 0,
    x: !!target && (state.ultOrbs >= ULT.orbsNeeded || s.x.extra > 0),
    // 앵커가 없으면 깔아 두고, 위험할 때 귀환
    e: s.e.level > 0 && (!s.e.anchor ? s.e.cd <= 0 && state.tick % 60 === 0 : hpLow(state) || surrounded(state)),
    q: s.q.level > 0 && !!target && s.q.ammo > 0 && (eliteNear || (!opts.gentle && nd < T.precisionRange ** 2)) && hpOk(state),
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
