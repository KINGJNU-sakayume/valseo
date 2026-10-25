// 스킬 디스패치: 에이전트별 모듈(agents/*.js)에 위임하고, 오브 적립·라운드 정리 같은 공통부만 여기서 한다.
import { SKILLS, ULT } from '../../data/skills.js';
import { ENEMIES } from '../../data/enemies.js';
import { updateFields } from './fields.js';
import { addUltOrb } from './skillutil.js';
import { passiveMult, passiveAdd, maxHp } from '../stats.js';
import { PASSIVES } from '../../data/passives.js';
import * as chamber from './agents/chamber.js';
import * as killjoy from './agents/killjoy.js';

export { skillValue, skillOf, branchOf, addUltOrb } from './skillutil.js';
export { qMagazine } from './agents/chamber.js';

const IMPL = { chamber, killjoy };
const impl = (state) => IMPL[state.agent];

/** 에이전트의 시작 스킬 상태 (슬롯 c/e/q/x, 각 항목에 스킬 id). */
export function initSkills(agent) {
  return IMPL[agent].initSkills((id) => SKILLS[id].startLevel);
}

export function updateSkills(state, input) {
  impl(state).update(state, input);
  updateFields(state);
}

/** 고유 패시브 크리 판정 (combat.js 에서 호출). */
export const passiveCrit = (state, e, source) => impl(state).passiveCrit(state, e, source);

/** 탄 명중 후처리 (연쇄 헤드샷, 냉각탄 등). */
export const onBulletHit = (state, b, e) => impl(state).onBulletHit(state, b, e);

/** HUD 용 스킬 상태. */
export const abilityStatus = (state, slot) => impl(state).abilityStatus(state, slot);

/** 적 처치 시: 엘리트 오브, 에이전트별 처치 효과, 처치 수 오브 적립. */
export function onEnemyKilled(state, e) {
  if (ENEMIES[e.type].ultOrb) addUltOrb(state);
  impl(state).onKilled(state, e);
  // 처치 회복 (라운드당 상한)
  const heal = passiveAdd(state.player, 'killHeal');
  if (heal) {
    const room = PASSIVES.killHeal.roundCap - state.roundHealed;
    const p = state.player;
    const amount = Math.max(0, Math.min(heal, room, maxHp(p) - p.hp));
    p.hp += amount;
    state.roundHealed += amount;
  }
  if (++state.killsSinceOrb >= ULT.killsPerOrb / passiveMult(state.player, 'orbDrop')) {
    state.killsSinceOrb = 0;
    addUltOrb(state);
  }
}

/** 라운드 종료 시 설치물 정리, 충전 회복. */
export function resetSkillsForRound(state) {
  const p = state.player;
  state.traps.length = 0;
  state.fields.length = 0;
  state.devices.length = 0;
  state.zones.length = 0;
  state.lockdowns.length = 0;
  p.precision = false;
  p.rush = 0;
  impl(state).resetRound(state);
}

