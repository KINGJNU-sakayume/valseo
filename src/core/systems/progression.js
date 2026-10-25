import { XP_CURVE } from '../../data/balance.js';
import { PASSIVES, CARD_WEIGHTS, LEVELUP } from '../../data/passives.js';
import { GUNS, GUN_MODS } from '../../data/guns.js';
import { SKILLS, SKILL_MAX_LEVEL, BRANCH_LEVEL } from '../../data/skills.js';
import { SLOT_ORDER } from '../../data/agents.js';
import { skillValue } from './skills.js';
import { nextFloat } from '../rng.js';
import { playerStat, maxHp, gunStats, passiveAdd, passiveMult } from '../stats.js';
import { CRIT, PLAYER } from '../../data/balance.js';

/** xpNeed(L) = a + b·L + c·L² : 레벨 L → L+1 에 필요한 XP */
export function xpNeed(L) {
  const { a, b, c } = XP_CURVE;
  return a + b * L + c * L * L;
}

export function gainXp(state, value) {
  const p = state.player;
  p.xp += value * passiveMult(p, 'xpGain');
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

/** 패시브 카드 설명용: stacks 일 때의 효과 표기. */
function passiveLabel(p, key, stacks) {
  const def = PASSIVES[key];
  const add = passiveAdd(p, key, stacks);
  switch (def.fmt) {
    case 'stat': return FORMAT[key](playerStat(p, key, stacks));
    case 'pct': return `+${Math.round(add * 100)}%`;
    case 'pctDown': return `-${Math.round(add * 100)}%`;
    case 'crit': return `×${(CRIT.multiplier + add).toFixed(1)}`;
    case 'sec': return `${(PLAYER.invulnTime + add).toFixed(1)}초`;
    case 'heal': return `처치당 HP +${add}`;
  }
  return '';
}

/** 지금 뽑을 수 있는 모든 카드와 가중치. */
function candidates(state) {
  const p = state.player;
  const out = [];
  for (const key of SLOT_ORDER) {
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
    const id = p.skills[card.key].id;
    const def = SKILLS[id];
    const letter = card.key.toUpperCase();
    const n = p.skills[card.key].level;
    const level = `${n + 1}/${SKILL_MAX_LEVEL}`;
    if (n === 0) return { ...card, title: `[${letter}] ${def.name} 해금`, desc: def.unlockDesc, level };
    const parts = def.show
      .map(([stat, label, unit]) => {
        const f = (v) => (unit === '%' ? `${Math.round(v * 100)}%` : `${v}${unit}`);
        const a = skillValue(id, stat, n);
        const b = skillValue(id, stat, n + 1);
        return a === b ? null : `${label} ${f(a)} → ${f(b)}`;
      })
      .filter(Boolean);
    if (n + 1 === BRANCH_LEVEL) parts.push('분기 선택');
    const br = p.skills[card.key].branch;
    const title = `[${letter}] ${def.name}${br ? ` (${def.branches[br].name})` : ''}`;
    return { ...card, title, desc: parts.join(' · '), level };
  }
  if (card.type === 'passive') {
    const def = PASSIVES[card.key];
    const n = p.passives[card.key] ?? 0;
    const show = (k) => passiveLabel(p, card.key, k);
    return {
      ...card,
      title: def.name,
      desc: `${show(n)} → ${show(n + 1)}`,
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
    const s = p.skills[card.key];
    s.level++;
    if (s.level === BRANCH_LEVEL && !s.branch) state.branchQueue.push(card.key);
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

/** 스킬 분기 A/B 선택지. */
export function branchOptions(player, key) {
  const def = SKILLS[player.skills[key].id];
  return Object.entries(def.branches).map(([branch, b]) => ({
    branch,
    title: `[${key.toUpperCase()}] ${b.name}`,
    desc: b.desc,
    level: `분기 ${branch}`,
  }));
}
