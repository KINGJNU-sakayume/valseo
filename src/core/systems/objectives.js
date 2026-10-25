// 라운드 유형 (설계 12.5): 해체·방어·사냥·엘리트 무기 상자, 변이(안개·과충전·폭풍).
// state.objective = { type, ... }, state.mutation = id | null. 보상은 pending(reward·weaponBox)·relicQueue 로.
import { DT } from '../../data/balance.js';
import { ROUND_TYPE_OF, ROUND_TYPES, WEAPON_BOX, MUTATION, MUTATIONS } from '../../data/rounds.js';
import { ENEMIES } from '../../data/enemies.js';
import { GUNS } from '../../data/guns.js';
import { nextFloat } from '../rng.js';
import { spawn } from './enemies.js';
import { siteAt, floorCells } from './map.js';
import { gainCredits } from './economy.js';
import { damagePlayer } from './player.js';
import { damageEnemy } from './combat.js';
import { hasRelic } from './relics.js';

const pick = (state, arr) => arr[Math.floor(nextFloat(state.rng) * arr.length)];

/** 라운드 시작: 유형과 변이를 정한다. */
export function startObjective(state) {
  const R = state.round;
  const type = ROUND_TYPE_OF[R] ?? 'clear';
  const o = { type, done: false };
  const m = state.map;
  if (type === 'defuse' && m?.spikes.length) {
    const sp = pick(state, m.spikes);
    Object.assign(o, { x: sp.x, y: sp.y, progress: 0 });
  } else if (type === 'defend' && m) {
    const L = pick(state, Object.keys(m.sites));
    Object.assign(o, { site: L, x: m.sites[L].x, y: m.sites[L].y, inside: 0, total: 0 });
  } else if (type === 'hunt' && m) {
    const cfg = ROUND_TYPES.hunt;
    const p = state.player;
    const cells = floorCells(m).filter((c) => (c.x - p.x) ** 2 + (c.y - p.y) ** 2 >= cfg.minDist * cfg.minDist);
    o.ids = [];
    for (let i = 0; i < cfg.targets && cells.length; i++) {
      const c = cells.splice(Math.floor(nextFloat(state.rng) * cells.length), 1)[0];
      const e = spawn(state, cfg.type, c);
      if (e) o.ids.push(e.id);
    }
  }
  state.objective = o;
  state.boxes = [];
  state.hazards = [];
  state.mutation = R >= MUTATION.fromRound && R !== 12 && type !== 'elite' && nextFloat(state.rng) < MUTATION.chance
    ? pick(state, Object.keys(MUTATIONS)) : null;
  state.mutationT = 0;
  state.events.push({ type: 'objective', kind: type, mutation: state.mutation });
}

/** 매 전투 틱. */
export function updateObjective(state) {
  const o = state.objective;
  const p = state.player;
  if (o && !o.done) {
    if (o.type === 'defuse') {
      const cfg = ROUND_TYPES.defuse;
      const inside = (p.x - o.x) ** 2 + (p.y - o.y) ** 2 <= cfg.radius * cfg.radius;
      o.progress = inside ? o.progress + DT : Math.max(0, o.progress - cfg.decay * DT);
      if (o.progress >= cfg.hold) {
        o.done = true;
        gainCredits(state, cfg.credits);
        state.rewardQueue = (state.rewardQueue ?? 0) + 1; // 전술 카드 선택
        state.events.push({ type: 'defuseDone', x: o.x, y: o.y, credits: cfg.credits });
      }
    } else if (o.type === 'defend') {
      if (!state.cleanup) {
        o.total += DT;
        if (siteAt(state.map, p.x, p.y) === o.site) o.inside += DT;
      }
    } else if (o.type === 'hunt') {
      if (o.ids.every((id) => !state.enemies.some((e) => e.id === id))) {
        o.done = true;
        state.relicQueue = (state.relicQueue ?? 0) + 1;
        state.events.push({ type: 'huntDone' });
      }
    }
  }
  // 엘리트 무기 상자: 밟으면 교체 제안
  for (let i = (state.boxes ?? []).length - 1; i >= 0; i--) {
    const b = state.boxes[i];
    if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 > WEAPON_BOX.radius ** 2) continue;
    state.boxes.splice(i, 1);
    state.boxQueue = [...(state.boxQueue ?? []), b];
  }
  updateMutation(state);
}

/** 방어 라운드: 적이 향할 목표 (가까우면 플레이어). */
export function defendGoal(state, e) {
  const o = state.objective;
  if (o?.type !== 'defend' || state.cleanup) return null;
  const p = state.player;
  const r = ROUND_TYPES.defend.chaseRange;
  if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 <= r * r) return null;
  return { x: o.x, y: o.y };
}

/** 라운드 종료 정산 (방어 보너스). */
export function endObjective(state) {
  const o = state.objective;
  if (o?.type === 'defend' && o.total > 0) {
    const value = Math.round((o.inside / o.total) * ROUND_TYPES.defend.credits);
    if (value > 0) gainCredits(state, value);
    state.events.push({ type: 'defendDone', value, pct: o.inside / o.total });
  }
  state.boxes = [];
  state.hazards = [];
}

/** 엘리트 처치 → 무기 상자. */
export function dropWeaponBox(state, e) {
  if (!ENEMIES[e.type].elite || hasRelic(state.player, 'pistolMaster')) return;
  const cur = state.player.guns[0]?.id;
  const gun = pick(state, WEAPON_BOX.guns.filter((g) => g !== cur));
  const tier = WEAPON_BOX.tier[state.round] ?? 2;
  (state.boxes ??= []).push({ x: e.x, y: e.y, gun, tier });
  state.events.push({ type: 'weaponBox', x: e.x, y: e.y, gun });
}

/** 무기 상자 선택지. */
export function boxOptions(b) {
  return [
    { take: true, gun: b.gun, tier: b.tier, title: `${GUNS[b.gun].name} T${b.tier}`, desc: '주무기를 교체한다 (개조는 사라진다)' },
    { take: false, title: '두고 간다', desc: '지금 총을 계속 쓴다' },
  ];
}

function updateMutation(state) {
  if (state.mutation !== 'storm') return;
  const cfg = MUTATIONS.storm;
  const p = state.player;
  state.mutationT += DT;
  if (state.mutationT >= cfg.interval && !state.cleanup) {
    state.mutationT = 0;
    const a = nextFloat(state.rng) * Math.PI * 2;
    const d = nextFloat(state.rng) * cfg.range;
    state.hazards.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, t: cfg.telegraph, r: cfg.radius });
  }
  for (let i = state.hazards.length - 1; i >= 0; i--) {
    const h = state.hazards[i];
    h.t -= DT;
    if (h.t > 0) continue;
    state.hazards.splice(i, 1);
    if ((p.x - h.x) ** 2 + (p.y - h.y) ** 2 <= (h.r + p.r) ** 2) damagePlayer(state, cfg.playerDamage, 'storm');
    for (const e of state.enemies) {
      if (e.hp > 0 && (e.x - h.x) ** 2 + (e.y - h.y) ** 2 <= (h.r + e.r) ** 2) damageEnemy(state, e, cfg.enemyDamage, false, 'storm');
    }
    state.events.push({ type: 'storm', x: h.x, y: h.y, r: h.r });
  }
}
