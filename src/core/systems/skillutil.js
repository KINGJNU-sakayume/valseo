// 스킬 공통 헬퍼 (에이전트 모듈이 함께 쓴다). 다른 시스템을 import 하지 않아 순환 참조가 없다.
import { SKILLS, ULT } from '../../data/skills.js';
import { PASSIVES } from '../../data/passives.js';

/** 스킬 수치. 배열이면 레벨에 맞는 값, 아니면 공통 값. */
export function skillValue(id, stat, level) {
  const v = SKILLS[id][stat];
  return Array.isArray(v) ? v[Math.max(1, level) - 1] : v;
}

/** 쿨다운 패시브를 반영한 스킬 쿨다운. */
export function cooldownOf(player, id, level) {
  const cd = skillValue(id, 'cooldown', level);
  const n = player.passives.cooldown ?? 0;
  return n ? cd * (1 - n * PASSIVES.cooldown.perStack) : cd;
}

/** 설치·장판 지속 패시브 배율. */
export function durationMult(player) {
  const n = player.passives.duration ?? 0;
  return n ? 1 + n * PASSIVES.duration.perStack : 1;
}

/** 슬롯(c/q/e/x)에 붙은 스킬 데이터. */
export const skillOf = (player, slot) => SKILLS[player.skills[slot].id];

/** 선택한 분기 데이터 (없으면 null). */
export function branchOf(player, slot) {
  const s = player.skills[slot];
  return s.branch ? SKILLS[s.id].branches[s.branch] : null;
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
