import { CLEAR_BONUS } from '../../data/rounds.js';
import { SHOP } from '../../data/shop.js';
import { GUNS, TIERS } from '../../data/guns.js';
import { createGunSlot } from '../state.js';
import { applyCard, cardValid, describeCard } from './progression.js';
import { addUltOrb } from './skills.js';
import { SKILLS } from '../../data/skills.js';

/** B(R) = B0 + b1·R */
export const clearBonus = (R) => CLEAR_BONUS.B0 + CLEAR_BONUS.b1 * R;

export function gainCredits(state, value) {
  state.credits += value;
  state.stats.creditsEarned += value;
}

const PRIMARY = 0;

/** 결정적 상점 목록 + 무작위 카드 1칸 + 다음 라운드. */
export function shopOptions(state) {
  const p = state.player;
  const opts = [];
  const owned = new Set(p.guns.filter(Boolean).map((s) => s.id));

  for (const [id, price] of Object.entries(SHOP.guns)) {
    if (owned.has(id)) continue;
    const cur = p.guns[PRIMARY];
    opts.push({
      kind: 'buyGun', id, price,
      title: `${GUNS[id].name} 구매`,
      desc: cur ? `주무기 ${GUNS[cur.id].name} 교체` : '주무기 슬롯에 장착',
    });
  }

  p.guns.forEach((slot, i) => {
    if (!slot || slot.tier >= TIERS.max) return;
    const next = slot.tier + 1;
    const dmg = (t) => Math.round(GUNS[slot.id].damage * TIERS.damageMult[t - 1]);
    opts.push({
      kind: 'tierUp', slot: i, price: SHOP.tierUp[next],
      title: `${GUNS[slot.id].name} 티어 ${next}`,
      desc: `피해 ${dmg(slot.tier)} → ${dmg(next)}, 연사 +${Math.round(TIERS.fireRateBonus[next - 1] * 100)}%`,
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
    desc: `궁극기 오브 ${state.ultOrbs} → ${state.ultOrbs + 1} (필요 ${SKILLS.x.orbsNeeded})`,
    blocked: state.ultOrbs >= SKILLS.x.orbsNeeded,
  });

  if (state.shopCard) {
    const card = describeCard(state, state.shopCard);
    opts.push({
      kind: 'card', price: SHOP.card,
      title: `카드: ${card.title}`, desc: card.desc,
      blocked: state.shopCardBought || !cardValid(state, state.shopCard),
    });
  }

  opts.push({ kind: 'next', price: 0, title: '다음 라운드', desc: `라운드 ${state.round + 1} 시작` });

  for (const o of opts) o.enabled = !o.blocked && o.price <= state.credits;
  return opts;
}

/** 상점 항목 구매. 'next' 는 호출 측(rounds)이 처리한다. */
export function buy(state, opt) {
  const p = state.player;
  state.credits -= opt.price;
  if (opt.kind === 'buyGun') {
    p.guns[PRIMARY] = createGunSlot(opt.id);
  } else if (opt.kind === 'tierUp') {
    p.guns[opt.slot].tier++;
  } else if (opt.kind === 'armor') {
    p.shield = p.shieldMax = SHOP.armor[opt.id].shield;
  } else if (opt.kind === 'ultOrb') {
    addUltOrb(state);
  } else if (opt.kind === 'card') {
    applyCard(state, state.shopCard);
    state.shopCardBought = true;
  }
  state.events.push({ type: 'buy', kind: opt.kind, id: opt.id, price: opt.price });
}
