import { XP_CURVE } from '../../data/balance.js';
import { PASSIVES, CARD_WEIGHTS, LEVELUP } from '../../data/passives.js';
import { GUNS, GUN_MODS } from '../../data/guns.js';
import { SKILLS, SKILL_MAX_LEVEL } from '../../data/skills.js';
import { skillValue } from './skills.js';
import { nextFloat } from '../rng.js';
import { playerStat, maxHp, gunStats } from '../stats.js';

/** xpNeed(L) = a + b·L + c·L² : 레벨 L → L+1 에 필요한 XP */
export function xpNeed(L) {
  const { a, b, c } = XP_CURVE;
  return a + b * L + c * L * L;
}

export function gainXp(state, value) {
  const p = state.player;
  p.xp += value;
  while (p.xp >= xpNeed(p.level)) {
    p.xp -= xpNeed(p.level);
    p.level++;
    state.levelUpsQueued++;
    state.events.push({ type: 'levelUp', level: p.level });
  }
}

// 카드 설명의 수치 표기
const FORMAT = {
  maxHp: (v) => String(Math.round(v)),
  moveSpeed: (v) => String(Math.round(v)),
  magnetRadius: (v) => String(Math.round(v)),
  fireRate: (v) => `${v.toFixed(1)}/초`,
  pierce: (v) => String(Math.round(v)),
  bulletSpeed: (v) => String(Math.round(v)),
  critChance: (v) => `${Math.round(v * 100)}%`,
};

/** 지금 뽑을 수 있는 모든 카드와 가중치. */
function candidates(state) {
  const p = state.player;
  const out = [];
  for (const key of Object.keys(SKILLS)) {
    if (p.skills[key].level >= SKILL_MAX_LEVEL) continue;
    out.push({ weight: CARD_WEIGHTS.skill, card: { type: 'skill', key } });
  }
  for (const [key, def] of Object.entries(PASSIVES)) {
    const n = p.passives[key] ?? 0;
    if (n >= def.maxStacks) continue;
    out.push({ weight: CARD_WEIGHTS.passive, card: { type: 'passive', key } });
  }
  p.guns.forEach((slot, i) => {
    if (!slot) return;
    for (const [key, def] of Object.entries(GUN_MODS)) {
      if ((slot.mods[key] ?? 0) >= def.maxStacks) continue;
      out.push({ weight: CARD_WEIGHTS.gunMod, card: { type: 'gunMod', slot: i, gunId: slot.id, key } });
    }
  });
  return out;
}

/** 가중 비복원 추첨으로 n장. 후보가 없으면 빈 배열. */
export function drawCards(state, n) {
  const pool = candidates(state);
  const picked = [];
  while (picked.length < n && pool.length > 0) {
    const total = pool.reduce((s, c) => s + c.weight, 0);
    let roll = nextFloat(state.rng) * total;
    let i = 0;
    while (i < pool.length - 1 && roll >= pool[i].weight) roll -= pool[i++].weight;
    picked.push(pool[i].card);
    pool.splice(i, 1);
  }
  return picked;
}

export function levelUpOptions(state) {
  const cards = drawCards(state, LEVELUP.choices);
  if (cards.length === 0) cards.push({ type: 'heal' });
  return cards.map((c) => describeCard(state, c));
}

/** 카드가 여전히 적용 가능한지 (상점 카드는 총 교체 등으로 무효가 될 수 있다). */
export function cardValid(state, card) {
  if (card.type === 'skill') return state.player.skills[card.key].level < SKILL_MAX_LEVEL;
  if (card.type === 'passive') return (state.player.passives[card.key] ?? 0) < PASSIVES[card.key].maxStacks;
  if (card.type === 'gunMod') {
    const slot = state.player.guns[card.slot];
    return !!slot && slot.id === card.gunId && (slot.mods[card.key] ?? 0) < GUN_MODS[card.key].maxStacks;
  }
  return true;
}

/** 카드에 이름과 변화량(before → after) 설명을 붙인다. */
export function describeCard(state, card) {
  const p = state.player;
  if (card.type === 'skill') {
    const def = SKILLS[card.key];
    const n = p.skills[card.key].level;
    const level = `${n + 1}/${SKILL_MAX_LEVEL}`;
    if (n === 0) return { ...card, title: `[${def.key}] ${def.name} 해금`, desc: def.unlockDesc, level };
    const parts = def.show
      .map(([stat, label, unit]) => {
        const f = (v) => (unit === '%' ? `${Math.round(v * 100)}%` : `${v}${unit}`);
        const a = skillValue(card.key, stat, n);
        const b = skillValue(card.key, stat, n + 1);
        return a === b ? null : `${label} ${f(a)} → ${f(b)}`;
      })
      .filter(Boolean);
    return { ...card, title: `[${def.key}] ${def.name}`, desc: parts.join(' · '), level };
  }
  if (card.type === 'passive') {
    const def = PASSIVES[card.key];
    const n = p.passives[card.key] ?? 0;
    const f = FORMAT[card.key];
    return {
      ...card,
      title: def.name,
      desc: `${f(playerStat(p, card.key, n))} → ${f(playerStat(p, card.key, n + 1))}`,
      level: `${n + 1}/${def.maxStacks}`,
    };
  }
  if (card.type === 'gunMod') {
    const def = GUN_MODS[card.key];
    const slot = p.guns[card.slot];
    const n = slot && slot.id === card.gunId ? (slot.mods[card.key] ?? 0) : 0;
    const f = FORMAT[card.key];
    const desc = slot && slot.id === card.gunId
      ? `${f(gunStats(slot)[card.key])} → ${f(gunStats(slot, { mods: { ...slot.mods, [card.key]: n + 1 } })[card.key])}`
      : '';
    return {
      ...card,
      title: `${GUNS[card.gunId].name} ${def.name}`,
      desc,
      level: `${n + 1}/${def.maxStacks}`,
    };
  }
  const heal = Math.round(maxHp(p) * LEVELUP.fallback.healPct);
  return { ...card, title: LEVELUP.fallback.name, desc: `HP +${heal}`, level: '' };
}

export function applyCard(state, card) {
  const p = state.player;
  if (card.type === 'skill') {
    p.skills[card.key].level++;
  } else if (card.type === 'passive') {
    const before = maxHp(p);
    p.passives[card.key] = (p.passives[card.key] ?? 0) + 1;
    if (card.key === 'maxHp') p.hp += maxHp(p) - before; // 늘어난 만큼 함께 회복
  } else if (card.type === 'gunMod') {
    const slot = p.guns[card.slot];
    slot.mods[card.key] = (slot.mods[card.key] ?? 0) + 1;
  } else {
    p.hp = Math.min(maxHp(p), p.hp + maxHp(p) * LEVELUP.fallback.healPct);
  }
  state.events.push({ type: 'card', card: { type: card.type, key: card.key, gunId: card.gunId } });
}
