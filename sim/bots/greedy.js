// greedy 봇: 전투 판단(조준·이동·스킬)은 src/core/autopilot.js 를 쓰고,
// 선택은 우선순위 표(스킬 > 총기 개조 > 패시브)와 상점 우선순위 표를 따른다.
// core 와 마찬가지로 전역 난수·시계를 쓰지 않는다 (같은 시드 = 같은 결과).
import { GUNS, SLOTS } from '../../src/data/guns.js';

export { decide } from '../../src/core/autopilot.js';

const CARD_PRIORITY = ['skill', 'tactic', 'gunMod', 'passive', 'heal'];
// 스킬 해금/강화 순서 선호: 고정 순서면 q·e 의 증강이 판마다 못 나온다(Lv5 에 닿지 않는다).
// 주무기 선호처럼 시드마다 맨 앞 스킬을 돌린다 (주무기와 겹치지 않게 시드/4). opts.skill 로 맨 앞 스킬 고정 가능.
const SKILL_PRIORITY = ['c', 'x', 'q', 'e'];
// 주무기 선호는 시드마다 돌려서(결정적) 총기별 데이터가 고르게 쌓이게 한다. opts.gun 으로 고정 가능.
const PRIMARIES = ['vandal', 'judge', 'operator', 'spectre'];
export const skillOrder = (state, opts = {}) => {
  const first = opts.skill ? SKILL_PRIORITY.indexOf(opts.skill) : Math.floor(state.seed / PRIMARIES.length) % SKILL_PRIORITY.length;
  return [...SKILL_PRIORITY.slice(first), ...SKILL_PRIORITY.slice(0, first)];
};
const SHOP_PRIORITY = ['buyGun:primary', 'buyGun:sheriff', 'tierUp', 'armor:heavy', 'contract', 'utilUpgrade', 'ultOrb', 'armor:light', 'utilCharge', 'relic', 'card'];
const RELIC_PRIORITY = ['eliteTrophy', 'ammoBelt', 'overheat', 'radiantHeart', 'crackedLens', 'architect', 'twinSlot', 'vampCore', 'gambler', 'heavyHand', 'glassCannon', 'pistolMaster'];
export const preferredPrimary = (state, opts = {}) => opts.gun ?? PRIMARIES[state.seed % PRIMARIES.length];

// 총 순위: 같은 슬롯의 총은 더 높은 순위이고, 지금 총에 티어 투자가 없을 때만 교체
const GUN_RANK = { classic: 0, sheriff: 1 };

function worthBuying(state, opt, opts) {
  if (opt.kind === 'contract') return (state.player.utils ?? []).length === 0 || opts.util === opt.id; // 빈 슬롯만 (교체 안 함)
  if (opt.kind === 'relic') return RELIC_PRIORITY.indexOf(opt.id) < 8;
  if (opt.kind === 'shopReroll' || opt.kind === 'rerollTicket') return false;
  if (opt.kind !== 'buyGun') return true;
  const slot = GUNS[opt.id].slot;
  const cur = state.player.guns[SLOTS[slot].index];
  if (slot === 'primary') return opt.id === preferredPrimary(state, opts) && !cur;
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
  if (pending.kind === 'branch' || pending.kind === 'mastery' || pending.kind === 'evolve') {
    // 형태·숙련: 'alt'(기본)는 시드·틱으로 돌려 고루 쌓이게, 특정 id 를 주면 있으면 그것
    const policy = (pending.kind === 'branch' ? opts.branch : opts.mastery) ?? 'alt';
    if (policy !== 'alt') {
      const i = o.findIndex((x) => x.branch === policy || x.mastery === policy);
      if (i >= 0) return i;
    }
    return (state.tick + state.seed) % o.length;
  }
  if (pending.kind === 'reward') return 0;
  if (pending.kind === 'weaponBox') {
    // 지금 주무기보다 순위가 높거나 주무기가 없으면 가져간다
    const cur = state.player.guns[0];
    const rank = { spectre: 1, judge: 2, operator: 2, vandal: 3 };
    const take = !cur || (rank[o[0].gun] ?? 0) > (rank[cur.id] ?? 0) || o[0].tier > cur.tier;
    return take ? 0 : 1;
  }
  if (pending.kind === 'relic') {
    // 유물: 고정 선호 순서 (opts.relic 으로 특정 유물 고정 가능)
    const rank = (r) => (r === opts.relic ? -1 : RELIC_PRIORITY.indexOf(r));
    let best = 0;
    o.forEach((c, i) => {
      if (rank(c.relic) < rank(o[best].relic)) best = i;
    });
    return best;
  }
  if (pending.kind === 'levelup') {
    let best = 0;
    const order = skillOrder(state, opts);
    const rank = (c) => CARD_PRIORITY.indexOf(c.type) * 10 + (c.type === 'skill' ? order.indexOf(c.key) : 0);
    o.forEach((c, i) => {
      if (rank(c) < rank(o[best])) best = i;
    });
    return best;
  }
  for (const want of SHOP_PRIORITY) {
    const match = (x) => x.kind === want || `${x.kind}:${x.id}` === want || (want === 'buyGun:primary' && x.kind === 'buyGun' && GUNS[x.id].slot === 'primary');
    const i = o.findIndex((x) => x.enabled && match(x) && worthBuying(state, x, opts));
    if (i >= 0) return i;
  }
  return o.findIndex((x) => x.kind === 'next');
}
