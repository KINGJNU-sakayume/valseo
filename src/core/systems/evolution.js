import { GUNS, TIERS } from '../../data/guns.js';

/** 총 티어 3 + 지정 스킬 레벨 달성 시 즉시 진화. 카드·구매·라운드 시작 때 호출. */
export function checkEvolutions(state) {
  const p = state.player;
  for (const slot of p.guns) {
    if (!slot || slot.evolved) continue;
    const ev = GUNS[slot.id].evolution;
    if (!ev || slot.tier < TIERS.max || p.skills[ev.skill].level < ev.level) continue;
    slot.evolved = true;
    state.events.push({ type: 'evolve', gun: slot.id, name: ev.name, x: p.x, y: p.y });
  }
}

/** 진화 조건 요약 (UI용): 이미 진화했으면 null. */
export function evolutionHint(state, slot) {
  const ev = GUNS[slot.id].evolution;
  if (!ev || slot.evolved) return null;
  const s = state.player.skills[ev.skill];
  return { tierOk: slot.tier >= TIERS.max, skillOk: s.level >= ev.level, skill: ev.skill, level: ev.level, name: ev.name };
}

/** 총탄 명중 후: 관통 오퍼레이터는 다음 대상 피해 증가, 집행자 셰리프는 크리 연속 카운트. */
export function onGunHit(state, b, crit) {
  const slot = state.player.guns.find((s) => s && s.id === b.source);
  if (!slot || !slot.evolved) return;
  const ev = GUNS[slot.id].evolution;
  if (ev.pierceRamp) b.damage *= 1 + ev.pierceRamp;
  if (!ev.streak) return;
  slot.critStreak = crit ? slot.critStreak + 1 : 0;
  if (slot.critStreak >= ev.streak) {
    slot.critStreak = 0;
    slot.cooldown = 0;
    state.events.push({ type: 'evoProc', gun: slot.id });
  }
}

/** 처형 저지: 이 총으로 처치하면 다음 사격 펠릿 추가 (재충전 대기 있음). */
export function onGunKill(state, e) {
  const slot = state.player.guns.find((s) => s && s.id === e.killedBy);
  const ev = slot?.evolved ? GUNS[slot.id].evolution : null;
  if (!ev?.pelletBonus || slot.primed || slot.primeCd > 0) return;
  slot.primed = true;
  slot.primeCd = ev.primeCooldown;
}
