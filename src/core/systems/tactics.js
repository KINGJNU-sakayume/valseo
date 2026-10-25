// 태그·전술 카드 엔진 (설계 v0.2 3장·7장).
// - tagCounts: 보유 요소의 태그 수 (시너지 가중, 빌드 화면, 공명)
// - damageMods: 명중 1회의 태그·전술 배율 (아무것도 해당하지 않으면 정확히 1 → 기존 결과 불변)
// - updateTactics: 매 틱 상태 (정지 시간, 런앤건, 위기 대응, 내부 쿨다운)
// - processTriggers: 이번 틱 이벤트에 반응하는 조건부 효과 (연쇄 깊이 제한)
import { UTILS } from '../../data/utils.js';
import { RELICS } from '../../data/relics.js';
import { DT } from '../../data/balance.js';
import { TACTICS } from '../../data/tactics.js';
import { PASSIVES } from '../../data/passives.js';
import { SOURCE_TAGS, SKILL_SOURCES } from '../../data/tags.js';
import { SKILLS } from '../../data/skills.js';
import { GUNS } from '../../data/guns.js';
import { STATUS } from '../../data/agents.js';
import { maxHp } from '../stats.js';
import { nextFloat } from '../rng.js';
import { addField, fieldSlow } from './fields.js';

export const has = (p, id) => !!p.tactics[id];
export const sourceTags = (source) => SOURCE_TAGS[source] ?? [];
const hasTag = (source, tag) => sourceTags(source).includes(tag);

/**
 * 보유 요소의 태그별 개수.
 * withKit: 해금한 스킬·장착한 총의 태그도 센다 (카드 시너지 가중용). false 면 공명용 (카드·패시브만).
 */
export function tagCounts(state, withKit = true) {
  const p = state.player;
  const n = {};
  const addAll = (tags, k = 1) => {
    for (const t of tags) n[t] = (n[t] ?? 0) + k;
  };
  for (const id of Object.keys(p.tactics)) addAll(TACTICS[id].tags);
  // 형태·숙련 증강 (공명에도 들어간다)
  for (const s of Object.values(p.skills)) {
    const def = SKILLS[s.id];
    if (s.branch) addAll(def.branches[s.branch]?.tags ?? []);
    if (s.mastery) addAll(def.masteries?.[s.mastery]?.tags ?? []);
  }
  for (const [key, stacks] of Object.entries(p.passives)) if (PASSIVES[key]?.tag && stacks > 0) addAll([PASSIVES[key].tag]);
  // 용병 계약·유물도 태그 공명에 기여한다 (설계 9·10장)
  for (const u of p.utils ?? []) addAll(UTILS[u.id].tags);
  for (const r of p.relics ?? []) addAll(RELICS[r].tags);
  if (withKit) {
    for (const s of Object.values(p.skills)) if (s.level > 0) addAll(SKILLS[s.id].tags ?? []);
    for (const g of p.guns) if (g) addAll(GUNS[g.id].tags ?? []);
  }
  return n;
}

/** 카드가 가진 태그 (시너지 판정·표시용). */
export function cardTags(state, card) {
  if (card.type === 'skill') return SKILLS[state.player.skills[card.key].id].tags ?? [];
  if (card.type === 'tactic') return TACTICS[card.key].tags;
  if (card.type === 'passive') return PASSIVES[card.key].tag ? [PASSIVES[card.key].tag] : [];
  if (card.type === 'gunMod') return GUNS[card.gunId].tags ?? [];
  return [];
}

/** 크리 배율에 더하는 값 (냉혹). */
export function critBonus(state) {
  return has(state.player, 'ruthless') ? TACTICS.ruthless.critBonus : 0;
}

/** 명중 1회 배율: 태그 피해 패시브, 전술 카드, 표식. 해당 없으면 1. */
export function damageMods(state, e, source, isCrit) {
  const p = state.player;
  let m = 1;
  // 태그형 패시브 (폭발 피해 +20% 등)
  for (const tag of sourceTags(source)) {
    for (const [key, def] of Object.entries(PASSIVES)) {
      if (def.tag === tag && p.passives[key]) m *= 1 + p.passives[key] * def.perStack;
    }
  }
  if (e.mark > 0) m *= STATUS.markMult;
  const t = p.tactics;
  if (t.ruthless && !isCrit) m *= TACTICS.ruthless.nonCrit;
  if (t.standStill && p.stillT >= TACTICS.standStill.still && hasTag(source, 'gun')) m *= 1 + TACTICS.standStill.bonus;
  if (t.opener && state.roundTime < TACTICS.opener.time) m *= 1 + TACTICS.opener.bonus;
  if (t.slowAmp) {
    const slow = enemySlow(state, e);
    if (slow > 0) m *= 1 + slow * TACTICS.slowAmp.k;
  }
  if (t.focus && hasTag(source, 'gun')) {
    const f = p.focus;
    if (f.id === e.id) f.n = Math.min(TACTICS.focus.max, f.n + 1);
    else {
      f.id = e.id;
      f.n = 0;
    }
    if (f.n > 0) m *= 1 + f.n * TACTICS.focus.per;
  }
  return m;
}

function enemySlow(state, e) {
  const fs = fieldSlow(state, e.x, e.y);
  return e.chillTime > 0 ? 1 - (1 - fs) * (1 - e.chill) : fs;
}

/** 이동속도 배율 (정리 전문가). */
export function moveMult(state) {
  return has(state.player, 'cleaner') && state.cleanup ? 1 + TACTICS.cleaner.speed : 1;
}

/** 처치 크레딧 배율 (정리 전문가). */
export function creditMult(state) {
  return has(state.player, 'cleaner') && state.cleanup ? TACTICS.cleaner.credit : 1;
}

/** 연사 배율 (런앤건). */
export function fireRateMult(state) {
  return state.player.runGun > 0 ? 1 + TACTICS.runAndGun.fireRate : 1;
}

/** 매 틱: 정지 시간은 player.js 가 센다. 여기서는 타이머와 위기 대응. */
export function updateTactics(state) {
  const p = state.player;
  if (p.runGun > 0) p.runGun = Math.max(0, p.runGun - DT);
  for (const k of Object.keys(state.tacticCd)) if (state.tacticCd[k] > 0) state.tacticCd[k] = Math.max(0, state.tacticCd[k] - DT);
  // 위기 대응: 쿨다운이 1/(1−cdr) 배 빨리 돈다
  if (p.tactics.crisis && p.hp < maxHp(p) * TACTICS.crisis.hpPct) {
    const extra = DT * (1 / (1 - TACTICS.crisis.cdr) - 1);
    for (const s of Object.values(p.skills)) if (s.cd > 0) s.cd = Math.max(0, s.cd - extra);
  }
}

/**
 * events[from..] 에 반응한다. 반응이 새로 만든 처치 이벤트는 호출 측(game.js)이 depth+1 로 다시 넘긴다.
 * @returns 처리한 마지막 이벤트 다음 index
 */
export function processTriggers(state, from, depth, blastAt) {
  const p = state.player;
  const t = p.tactics;
  const evs = state.events;
  const end = evs.length;
  for (let i = from; i < end; i++) {
    const ev = evs[i];
    if (ev.type === 'teleport' && t.runAndGun) p.runGun = TACTICS.runAndGun.duration;
    if (ev.type !== 'kill' || ev.by === 'sweep') continue;
    if (t.chainReaction && ev.crit && !(state.tacticCd.chainReaction > 0)) {
      const c = TACTICS.chainReaction;
      addField(state, ev.x, ev.y, c.r, c.duration, c.slow);
      state.tacticCd.chainReaction = c.icd;
      evs.push({ type: 'tactic', id: 'chainReaction', x: ev.x, y: ev.y, r: c.r });
    }
    if (t.vulnSpread && ev.vuln) {
      const c = TACTICS.vulnSpread;
      const near = state.enemies
        .filter((e) => e.hp > 0 && (e.x - ev.x) ** 2 + (e.y - ev.y) ** 2 <= c.range * c.range)
        .sort((a, b) => (a.x - ev.x) ** 2 + (a.y - ev.y) ** 2 - ((b.x - ev.x) ** 2 + (b.y - ev.y) ** 2) || a.id - b.id)
        .slice(0, c.count);
      for (const e of near) e.vulnerable = Math.max(e.vulnerable ?? 0, c.duration);
      if (near.length) evs.push({ type: 'tactic', id: 'vulnSpread', x: ev.x, y: ev.y, r: c.range });
    }
    if (t.blastChain && depth < 3 && hasTag(ev.by, 'blast') && nextFloat(state.rng) < TACTICS.blastChain.chance) {
      const c = TACTICS.blastChain;
      blastAt(state, ev.x, ev.y, c.r, c.damage, 'chainBlast');
      evs.push({ type: 'tactic', id: 'blastChain', x: ev.x, y: ev.y, r: c.r });
    }
    if (t.cdCycle && SKILL_SOURCES.includes(ev.by)) {
      for (const s of Object.values(p.skills)) if (s.cd > 0) s.cd = Math.max(0, s.cd - TACTICS.cdCycle.amount);
    }
  }
  return end;
}
