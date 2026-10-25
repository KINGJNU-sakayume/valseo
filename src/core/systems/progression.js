import { XP_CURVE } from '../../data/balance.js';
import { SYNTHS } from '../../data/synth.js';
import { PASSIVES, CARD_WEIGHTS, LEVELUP, RARITY } from '../../data/passives.js';
import { TACTICS } from '../../data/tactics.js';
import { SYNERGY } from '../../data/tags.js';
import { tagCounts, cardTags } from './tactics.js';
import { GUNS, GUN_MODS } from '../../data/guns.js';
import { SKILLS, SKILL_MAX_LEVEL, BRANCH_LEVEL, MASTERY_LEVEL, AUGMENT_CHOICES } from '../../data/skills.js';
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
  magazine: (v) => `${Math.round(v)}발`,
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

/** 카드 식별 키 (추방·중복 판정). */
export const cardKey = (c) => (c.type === 'gunMod' ? `gunMod:${c.gunId}:${c.key}` : `${c.type}:${c.key ?? ''}`);

/** 보유 태그와 겹치는 카드 태그 수 (시너지). */
export function synergyOf(state, card, owned = tagCounts(state)) {
  return cardTags(state, card).filter((t) => owned[t] > 0).length;
}

/** 지금 뽑을 수 있는 모든 카드와 가중치 (희귀도 × 시너지). */
function candidates(state) {
  const p = state.player;
  const out = [];
  const owned = tagCounts(state);
  const banned = new Set(p.banished);
  const add = (weight, card) => {
    if (banned.has(cardKey(card))) return;
    const syn = synergyOf(state, card, owned);
    out.push({ weight: weight * Math.min(SYNERGY.max, 1 + SYNERGY.per * syn), card });
  };
  for (const key of SLOT_ORDER) {
    if (p.skills[key].level >= SKILL_MAX_LEVEL) continue;
    add(CARD_WEIGHTS.skill, { type: 'skill', key });
  }
  for (const [key, def] of Object.entries(PASSIVES)) {
    if (def.pool === false) continue;
    const n = p.passives[key] ?? 0;
    if (n >= def.maxStacks) continue;
    add(CARD_WEIGHTS.passive, { type: 'passive', key });
  }
  p.guns.forEach((slot, i) => {
    if (!slot) return;
    for (const [key, def] of Object.entries(GUN_MODS)) {
      if ((slot.mods[key] ?? 0) >= def.maxStacks) continue;
      if (def.primaryOnly && !GUNS[slot.id].magazine) continue;
      add(CARD_WEIGHTS.gunMod, { type: 'gunMod', slot: i, gunId: slot.id, key });
    }
  });
  // 합성 증강 (전설): 재료 증강이 갖춰지면
  for (const [key, def] of Object.entries(SYNTHS)) {
    if (p.synths?.[key] || def.agent !== state.agent || !synthReady(p, def)) continue;
    const r = RARITY.legendary;
    if (p.level < r.minLevel) continue;
    add(CARD_WEIGHTS.tactic * r.weight * 3, { type: 'synth', key });
  }
  for (const [key, def] of Object.entries(TACTICS)) {
    if (p.tactics[key]) continue;
    const r = RARITY[def.rarity];
    if (r.minLevel && p.level < r.minLevel) continue;
    add(CARD_WEIGHTS.tactic * r.weight, { type: 'tactic', key });
  }
  return out;
}

/** 합성 재료가 갖춰졌는가. */
export function synthReady(p, def) {
  return Object.entries(def.requires).every(([slot, r]) => {
    const s = p.skills[slot];
    return r.branch ? s.branch === r.branch : s.level >= r.level;
  });
}

/** 가중 비복원 추첨으로 n장. 후보가 없으면 빈 배열. exclude: 제외할 카드 키 (추방 후 다시 뽑기). */
export function drawCards(state, n, exclude = [], filter = null) {
  const skip = new Set(exclude);
  const pool = candidates(state).filter((c) => !skip.has(cardKey(c.card)) && (!filter || filter(c.card)));
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
  if (card.type === 'tactic') return !state.player.tactics[card.key];
  if (card.type === 'synth') return !state.player.synths?.[card.key];
  return true;
}

/** 카드에 이름과 변화량(before → after) 설명, 태그, 시너지를 붙인다. */
export function describeCard(state, card) {
  const d = describeBase(state, card);
  return { ...d, tags: cardTags(state, card), synergy: synergyOf(state, card) };
}

function describeBase(state, card) {
  const p = state.player;
  if (card.type === 'tactic') {
    const def = TACTICS[card.key];
    return { ...card, title: def.name, desc: def.desc, rarity: def.rarity, level: '' };
  }
  if (card.type === 'synth') {
    const def = SYNTHS[card.key];
    return { ...card, title: def.name, desc: def.desc, rarity: 'legendary', level: '' };
  }
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
    if (n + 1 === BRANCH_LEVEL) parts.push('형태 증강 선택');
    if (n + 1 === MASTERY_LEVEL && def.masteries) parts.push('숙련 증강 선택');
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
    if (s.level === MASTERY_LEVEL && !s.mastery && SKILLS[s.id].masteries) state.masteryQueue.push(card.key);
  } else if (card.type === 'passive') {
    const before = maxHp(p);
    p.passives[card.key] = (p.passives[card.key] ?? 0) + 1;
    if (card.key === 'maxHp') p.hp += maxHp(p) - before; // 늘어난 만큼 함께 회복
  } else if (card.type === 'gunMod') {
    const slot = p.guns[card.slot];
    slot.mods[card.key] = (slot.mods[card.key] ?? 0) + 1;
  } else if (card.type === 'tactic') {
    p.tactics[card.key] = true;
  } else if (card.type === 'synth') {
    (p.synths ??= {})[card.key] = true;
  } else {
    p.hp = Math.min(maxHp(p), p.hp + maxHp(p) * LEVELUP.fallback.healPct);
  }
  state.events.push({ type: 'card', card: { type: card.type, key: card.key, gunId: card.gunId } });
}

/** 풀에서 n개를 시드 RNG 로 비복원 추첨 (풀 순서를 유지해 결정적). */
function pickSome(state, ids, n) {
  if (ids.length <= n) return ids;
  const pool = [...ids];
  const out = [];
  while (out.length < n) out.push(pool.splice(Math.floor(nextFloat(state.rng) * pool.length), 1)[0]);
  return ids.filter((id) => out.includes(id));
}

/** 형태 증강 선택지: 그 스킬의 형태 풀에서 AUGMENT_CHOICES 개. */
export function branchOptions(state, key) {
  const def = SKILLS[state.player.skills[key].id];
  return pickSome(state, Object.keys(def.branches), AUGMENT_CHOICES).map((id) => {
    const b = def.branches[id];
    return { branch: id, title: `[${key.toUpperCase()}] ${b.name}`, desc: b.desc, tags: b.tags ?? [], level: '형태' };
  });
}

/** 숙련 증강 선택지. 자동화 숙련은 수동/자동 두 효과를 함께 적는다. */
export function masteryOptions(state, key) {
  const def = SKILLS[state.player.skills[key].id];
  return pickSome(state, Object.keys(def.masteries ?? {}), AUGMENT_CHOICES).map((id) => {
    const m = def.masteries[id];
    const desc = m.auto ? `수동: ${m.desc} / 자동 사용 중: ${m.altDesc}` : m.desc;
    return { mastery: id, title: `[${key.toUpperCase()}] ${m.name}`, desc, tags: m.tags ?? [], auto: !!m.auto, level: '숙련' };
  });
}
