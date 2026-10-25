import { CLEAR_BONUS } from '../../data/rounds.js';
import { SHOP } from '../../data/shop.js';
import { GUNS, TIERS, SLOTS } from '../../data/guns.js';
import { createGunSlot } from '../state.js';
import { openRoutes } from './evolution.js';
import { TAGS, RESONANCE } from '../../data/tags.js';
import { passiveMult } from '../stats.js';
import { applyCard, cardValid, describeCard, drawCards } from './progression.js';
import { addUltOrb } from './skills.js';
import { ULT } from '../../data/skills.js';
import { UTIL, UTILS, UTIL_IDS } from '../../data/utils.js';
import { RELIC, RELICS } from '../../data/relics.js';
import { nextFloat } from '../rng.js';
import { relicOf, relicOptions, gainRelic, hasRelic } from './relics.js';
import { createUtil, utilSlots } from './utils.js';
import { tagCounts } from './tactics.js';
import { ultCost } from './skillutil.js';

/** B(R) = B0 + b1·R */
export const clearBonus = (R) => CLEAR_BONUS.B0 + CLEAR_BONUS.b1 * R;

export function gainCredits(state, value) {
  const mult = passiveMult(state.player, 'creditGain');
  if (mult !== 1) value = Math.round(value * mult);
  state.credits += value;
  state.stats.creditsEarned += value;
}

/**
 * 상점 무작위 칸 (설계 11장): 용병 계약 2 + (전술 카드 또는 유물) 1. 구매 페이즈마다 새로 뽑는다.
 * 계약은 보유 태그와 겹칠수록 잘 나온다 (시너지 가중).
 */
export function rollShop(state) {
  const p = state.player;
  const have = new Set((p.utils ?? []).map((u) => u.id));
  const tags = tagCounts(state, true);
  const pool = UTIL_IDS.filter((id) => !have.has(id)).map((id) => ({ id, w: 1 + 0.3 * UTILS[id].tags.filter((t) => tags[t]).length }));
  const contracts = [];
  while (contracts.length < UTIL.shopOffers && pool.length) {
    const total = pool.reduce((a, c) => a + c.w, 0);
    let roll = nextFloat(state.rng) * total;
    let i = 0;
    while (i < pool.length - 1 && roll >= pool[i].w) roll -= pool[i++].w;
    contracts.push({ kind: 'contract', id: pool.splice(i, 1)[0].id, bought: false });
  }
  const third = nextFloat(state.rng) < RELIC.shopChance ? relicOptions(state, 1)[0] : null;
  const card = third ? null : drawCards(state, 1)[0] ?? null;
  state.shopRandom = [
    ...contracts,
    third ? { kind: 'relic', id: third.relic, bought: false } : card ? { kind: 'card', card, bought: false } : null,
  ].filter(Boolean);
}

/** 유물 쌍둥이 슬롯: 상점 가격 +20%. */
const priceOf = (state, price) => (relicOf(state.player, 'twinSlot') ? Math.round(price * RELICS.twinSlot.priceMult) : price);

/** 결정적 상점 목록 + 무작위 칸 + 다음 라운드. */
export function shopOptions(state) {
  const p = state.player;
  const opts = [];
  const owned = new Set(p.guns.filter(Boolean).map((s) => s.id));

  for (const [id, price] of Object.entries(SHOP.guns)) {
    if (owned.has(id)) continue;
    if (hasRelic(p, 'pistolMaster') && GUNS[id].slot === 'primary') continue; // 주무기 슬롯 봉인
    const slot = SLOTS[GUNS[id].slot];
    const cur = p.guns[slot.index];
    opts.push({
      kind: 'buyGun', id, price,
      title: `${GUNS[id].name} 구매`,
      desc: cur ? `${slot.name} ${GUNS[cur.id].name} 교체` : `${slot.name} 슬롯에 장착`,
    });
  }

  p.guns.forEach((slot, i) => {
    if (!slot || slot.tier >= TIERS.max) return;
    const next = slot.tier + 1;
    const dmg = (t) => Math.round(GUNS[slot.id].damage * TIERS.damageMult[t - 1]);
    opts.push({
      kind: 'tierUp', slot: i, price: SHOP.tierUp[next],
      title: `${GUNS[slot.id].name} 티어 ${next}`,
      desc: `피해 ${dmg(slot.tier)} → ${dmg(next)}, 연사 +${Math.round(TIERS.fireRateBonus[next - 1] * 100)}%${evoNote(state, slot, next)}`,
    });
  });

  for (const [id, a] of Object.entries(SHOP.armor)) {
    opts.push({
      kind: 'armor', id, price: a.price, title: a.name,
      desc: `실드 ${a.shield} (라운드 유지, HP보다 먼저 흡수)`,
      blocked: p.shield >= a.shield,
    });
  }

  opts.push({
    kind: 'ultOrb', price: SHOP.ultOrb, title: '궁극기 충전',
    desc: `궁극기 오브 ${state.ultOrbs} → ${state.ultOrbs + 1} (필요 ${ultCost(p)})`,
    blocked: state.ultOrbs >= ULT.orbsNeeded,
  });

  // 보유 계약: 충전 구매, 업그레이드
  (p.utils ?? []).forEach((u, i) => {
    const def = UTILS[u.id];
    opts.push({
      kind: 'utilCharge', slot: i, id: u.id, price: UTIL.chargePrice,
      title: `${def.name} 충전`, desc: `충전 ${u.charges} → ${u.charges + 1} (최대 ${UTIL.maxCharges})`,
      blocked: u.charges >= UTIL.maxCharges,
    });
    if (u.level < 3) {
      opts.push({
        kind: 'utilUpgrade', slot: i, id: u.id, price: UTIL.upgradePrice[u.level + 1],
        title: `${def.name} Lv${u.level + 1}`, desc: def.levelDesc[u.level + 1],
      });
    }
  });

  // 무작위 칸
  (state.shopRandom ?? []).forEach((r, i) => {
    if (r.kind === 'contract') {
      const def = UTILS[r.id];
      const full = (p.utils ?? []).length >= utilSlots(p);
      opts.push({
        kind: 'contract', id: r.id, rand: i, price: def.price, tags: def.tags,
        title: `계약: ${def.name}`, desc: `${def.desc}${full ? ` · ${UTILS[p.utils[p.utils.length - 1].id].name} 대체` : ''}`,
        blocked: r.bought,
      });
    } else if (r.kind === 'relic') {
      const def = RELICS[r.id];
      opts.push({
        kind: 'relic', id: r.id, rand: i, price: def.price, tags: def.tags,
        title: `유물: ${def.name}`, desc: def.desc,
        blocked: r.bought || hasRelic(p, r.id),
      });
    } else if (r.kind === 'card') {
      const card = describeCard(state, r.card);
      opts.push({
        kind: 'card', rand: i, price: SHOP.card,
        title: `카드: ${card.title}`, desc: card.desc,
        blocked: r.bought || !cardValid(state, r.card),
      });
    }
  });
  opts.push({ kind: 'shopReroll', price: SHOP.reroll, title: '무작위 칸 다시 뽑기', desc: '계약·카드·유물 칸을 새로 뽑는다' });
  opts.push({ kind: 'rerollTicket', price: SHOP.rerollTicket, title: '레벨업 리롤권', desc: `레벨업 카드 다시 뽑기 +1 (보유 ${state.rerolls})` });

  opts.push({ kind: 'next', price: 0, title: '다음 라운드', desc: `라운드 ${state.round + 1} 시작` });

  for (const o of opts) {
    if (o.kind !== 'next') o.price = priceOf(state, o.price);
    o.enabled = !o.blocked && o.price <= state.credits;
  }
  return opts;
}

/** 티어 3 구매 시 진화 안내: 공명 경로. */
function evoNote(state, slot, next) {
  if (next < TIERS.max) return '';
  const routes = openRoutes(state, slot);
  if (routes.length) return ` · 즉시 진화 (${routes.map((t) => TAGS[t].name).join('/')} 공명)`;
  return ` · 진화: ${Object.keys(GUNS[slot.id].evolutions).map((t) => TAGS[t].name).join('/')} 태그 ${RESONANCE}개`;
}

/** 상점 항목 구매. 'next' 는 호출 측(rounds)이 처리한다. */
export function buy(state, opt) {
  const p = state.player;
  state.credits -= opt.price;
  if (opt.kind === 'buyGun') {
    p.guns[SLOTS[GUNS[opt.id].slot].index] = createGunSlot(opt.id);
  } else if (opt.kind === 'tierUp') {
    p.guns[opt.slot].tier++;
  } else if (opt.kind === 'armor') {
    p.shield = p.shieldMax = SHOP.armor[opt.id].shield;
  } else if (opt.kind === 'ultOrb') {
    addUltOrb(state);
  } else if (opt.kind === 'card') {
    const r = state.shopRandom[opt.rand];
    applyCard(state, r.card);
    r.bought = true;
  } else if (opt.kind === 'relic') {
    gainRelic(state, opt.id);
    state.shopRandom[opt.rand].bought = true;
  } else if (opt.kind === 'contract') {
    const utils = (p.utils ??= []);
    // 슬롯이 가득이면 마지막 슬롯 계약을 대체
    if (utils.length >= utilSlots(p)) utils[utils.length - 1] = createUtil(opt.id);
    else utils.push(createUtil(opt.id));
    state.shopRandom[opt.rand].bought = true;
  } else if (opt.kind === 'utilCharge') {
    p.utils[opt.slot].charges++;
  } else if (opt.kind === 'utilUpgrade') {
    p.utils[opt.slot].level++;
  } else if (opt.kind === 'shopReroll') {
    rollShop(state);
  } else if (opt.kind === 'rerollTicket') {
    state.rerolls++;
  }
  state.events.push({ type: 'buy', kind: opt.kind, id: opt.id, price: opt.price });
}
