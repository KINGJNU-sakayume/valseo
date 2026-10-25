// 태그 공명 진화 (설계 v0.2 8.5): 총 티어 3 + 그 총의 경로 태그가 RESONANCE 개 이상이면 진화.
// 경로가 둘 이상 열리면 state.evolveQueue 로 선택지를 띄운다. slot.evolved = 공명한 태그.
import { GUNS, TIERS } from '../../data/guns.js';
import { RESONANCE } from '../../data/tags.js';
import { evoOf } from '../stats.js';
import { tagCounts } from './tactics.js';
import { addField } from './fields.js';
import { damageEnemy } from './combat.js';
import { freeGadget } from './skills.js';

/** 열린 진화 경로 (공명한 태그 목록, 데이터 순서). */
export function openRoutes(state, slot, counts = tagCounts(state, false)) {
  return Object.keys(GUNS[slot.id].evolutions ?? {}).filter((tag) => (counts[tag] ?? 0) >= RESONANCE);
}

/** 카드·구매·라운드 시작 때 호출: 하나만 열렸으면 즉시 진화, 여럿이면 선택 대기열. */
export function checkEvolutions(state) {
  const p = state.player;
  const counts = tagCounts(state, false);
  p.guns.forEach((slot, i) => {
    if (!slot || slot.evolved || slot.tier < TIERS.max) return;
    if (state.evolveQueue.includes(i)) return;
    const routes = openRoutes(state, slot, counts);
    if (routes.length === 1) evolve(state, slot, routes[0]);
    else if (routes.length > 1) state.evolveQueue.push(i);
  });
}

export function evolve(state, slot, tag) {
  const p = state.player;
  slot.evolved = tag;
  const ev = evoOf(slot);
  state.events.push({ type: 'evolve', gun: slot.id, route: tag, name: ev.name, x: p.x, y: p.y });
}

/** 진화 선택지 (경로 둘 이상). */
export function evolveOptions(state, index) {
  const slot = state.player.guns[index];
  return openRoutes(state, slot).map((tag) => {
    const ev = GUNS[slot.id].evolutions[tag];
    return { route: tag, slot: index, title: ev.name, desc: ev.desc, tags: [tag], level: '진화' };
  });
}

/** 진화 조건 요약 (UI용): 이미 진화했으면 null. 가장 가까운 경로를 알려준다. */
export function evolutionHint(state, slot) {
  if (slot.evolved) return null;
  const evs = GUNS[slot.id].evolutions ?? {};
  const counts = tagCounts(state, false);
  let best = null;
  for (const tag of Object.keys(evs)) {
    const n = Math.min(RESONANCE, counts[tag] ?? 0);
    if (!best || n > best.n) best = { tag, n };
  }
  return best && { tierOk: slot.tier >= TIERS.max, tag: best.tag, n: best.n, need: RESONANCE, name: evs[best.tag].name };
}

/** 명중 직전 피해 배율 (표식탄 오퍼레이터). */
export function gunHitMult(state, b, e) {
  const slot = state.player.guns.find((s) => s && s.id === b.source);
  const ev = evoOf(slot);
  return ev?.markedMult && e.mark > 0 ? ev.markedMult : 1;
}

/** 총탄 명중 후 진화 효과. consumed: 이 명중으로 관통이 끝났는가. */
export function onGunHit(state, b, crit, e, consumed) {
  const slot = state.player.guns.find((s) => s && s.id === b.source);
  const ev = evoOf(slot);
  if (!ev) return;
  if (ev.pierceRamp) b.damage *= 1 + ev.pierceRamp;
  if (ev.splash && e) {
    for (const o of state.enemies) {
      if (o === e || o.hp <= 0 || (o.x - e.x) ** 2 + (o.y - e.y) ** 2 > (ev.splash.r + o.r) ** 2) continue;
      damageEnemy(state, o, b.damage * ev.splash.mult, false, b.source);
    }
    state.events.push({ type: 'splash', x: e.x, y: e.y, r: ev.splash.r });
  }
  if (e) {
    if (ev.suppressHit) e.suppressed = Math.max(e.suppressed ?? 0, ev.suppressHit);
    if (ev.vulnHit) e.vulnerable = Math.max(e.vulnerable ?? 0, ev.vulnHit);
    if (ev.markHit) e.mark = Math.max(e.mark ?? 0, ev.markHit);
  }
  if (ev.fieldHit && slot.fieldReady && e) {
    slot.fieldReady = false;
    addField(state, e.x, e.y, ev.fieldHit.r, ev.fieldHit.duration, ev.fieldHit.slow);
  }
  if (ev.endGadget && consumed && e && !(slot.gadgetCd > 0)) {
    slot.gadgetCd = ev.endGadget.icd;
    freeGadget(state, e.x, e.y);
  }
  if (ev.streak) {
    slot.critStreak = crit ? slot.critStreak + 1 : 0;
    if (slot.critStreak >= ev.streak) {
      slot.critStreak = 0;
      slot.cooldown = 0;
      state.events.push({ type: 'evoProc', gun: slot.id });
    }
  }
}

/** 이 총으로 처치: 처형 저지 펠릿 추가, 황금 셰리프 크레딧. */
export function onGunKill(state, e) {
  const slot = state.player.guns.find((s) => s && s.id === e.killedBy);
  const ev = evoOf(slot);
  if (!ev) return;
  if (ev.killCredits) {
    state.credits += ev.killCredits;
    state.stats.creditsEarned += ev.killCredits;
  }
  if (!ev.pelletBonus || slot.primed || slot.primeCd > 0) return;
  slot.primed = true;
  slot.primeCd = ev.primeCooldown;
}
