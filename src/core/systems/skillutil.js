// 스킬 공통 헬퍼 (에이전트 모듈이 함께 쓴다). 다른 시스템을 import 하지 않아 순환 참조가 없다.
import { RELICS } from '../../data/relics.js';
import { SKILLS, ULT } from '../../data/skills.js';
import { PASSIVES } from '../../data/passives.js';

/** 스킬 수치. 배열이면 레벨에 맞는 값, 아니면 공통 값. */
export function skillValue(id, stat, level) {
  const v = SKILLS[id][stat];
  return Array.isArray(v) ? v[Math.max(1, level) - 1] : v;
}

/** 쿨다운 패시브를 반영한 스킬 쿨다운. */
export function cooldownOf(player, id, level) {
  let cd = skillValue(id, 'cooldown', level);
  const n = player.passives.cooldown ?? 0;
  if (n) cd *= 1 - n * PASSIVES.cooldown.perStack;
  return player.relics?.includes('overheat') ? cd * RELICS.overheat.cooldownMult : cd;
}

/** 설치·장판 지속 패시브 배율. */
export function durationMult(player) {
  const n = player.passives.duration ?? 0;
  return n ? 1 + n * PASSIVES.duration.perStack : 1;
}

/** 슬롯(c/q/e/x)에 붙은 스킬 데이터. */
export const skillOf = (player, slot) => SKILLS[player.skills[slot].id];

/** 선택한 형태 증강 데이터 (없으면 null). 코드 이름은 예전 "분기"를 따른다. */
export function branchOf(player, slot) {
  const s = player.skills[slot];
  return s.branch ? SKILLS[s.id].branches[s.branch] : null;
}

/** 선택한 숙련 증강 데이터 (없으면 null). */
export function masteryOf(player, slot) {
  const s = player.skills[slot];
  return s.mastery ? SKILLS[s.id].masteries?.[s.mastery] ?? null : null;
}

/** 자동화 숙련이 "스킬 자동 사용" 중에 대신 주는 효과 (해당 없으면 null). */
export function masteryAlt(player, slot) {
  const m = masteryOf(player, slot);
  return m?.auto && player.autoMode ? m.alt : null;
}

/** 수동 모드에서만 작동하는 자동화 숙련 id 를 가졌는가. */
export const manualAuto = (player, slot, id) => player.skills[slot].mastery === id && !player.autoMode;

/** 정조준(헤드헌터) 중 이동속도 배율: 형태(속사) → 자동 모드 숙련(정지 사수) → 기본. */
export function precisionSpeedMult(player) {
  return branchOf(player, 'q')?.speedMult ?? masteryAlt(player, 'q')?.speedMult ?? skillOf(player, 'q').speedMult;
}

/** 궁극기에 필요한 오브 수 (쪼개 쏘기, 자동 처형 자동 모드). */
export function ultCost(player) {
  const base = branchOf(player, 'x')?.orbs ?? ULT.orbsNeeded;
  const heart = player.relics?.includes('radiantHeart') ? RELICS.radiantHeart.orbDelta : 0;
  return Math.max(1, base + (masteryAlt(player, 'x')?.orbs ?? 0) + heart);
}

/** 설치물 최대 개수 보너스 (유물 설계자). */
export function gadgetBonus(player) {
  return player.relics?.includes('architect') ? RELICS.architect.gadgetBonus : 0;
}

export const atLevel = (arr, level) => arr[Math.max(1, level) - 1] ?? 0;

export function addUltOrb(state) {
  if (state.ultOrbs >= ULT.orbsNeeded) return false;
  state.ultOrbs++;
  state.events.push({ type: 'ultOrb', orbs: state.ultOrbs });
  return true;
}

/** 충전식 스킬: 충전이 모자라면 쿨다운마다 1개씩 회복. */
export function recharge(s, max, cooldown, dt) {
  if (s.charges >= max) return;
  s.cd -= dt;
  if (s.cd <= 0) {
    s.charges++;
    s.cd = s.charges < max ? s.cd + cooldown : 0;
  }
}

/** 충전 1개 사용 (가득 차 있었으면 쿨다운 시작). */
export function spendCharge(s, max, cooldown) {
  if (s.charges === max) s.cd = cooldown;
  s.charges--;
}

/** 조준점을 사거리·월드 경계로 자른 설치 지점. */
export function aimPoint(p, input, range, world) {
  let dx = (input.aim?.x ?? p.x) - p.x;
  let dy = (input.aim?.y ?? p.y) - p.y;
  const d = Math.hypot(dx, dy);
  if (d > range) {
    dx *= range / d;
    dy *= range / d;
  }
  return { x: Math.min(world.width, Math.max(0, p.x + dx)), y: Math.min(world.height, Math.max(0, p.y + dy)) };
}
