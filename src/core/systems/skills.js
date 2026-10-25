// 스킬 디스패치: 에이전트별 모듈(agents/*.js)에 위임하고, 오브 적립·라운드 정리 같은 공통부만 여기서 한다.
import { updateUtils } from './utils.js';
import { relicOf } from './relics.js';
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
  const heat = relicOf(state.player, 'overheat');
  const before = useSnapshot(state);
  impl(state).update(state, input);
  const used = countUses(state, before);
  if (used > 0) {
    state.events.push({ type: 'skillUsed', n: used }); // 설치 동기화 등
    if (heat) {
      // 과열 칩: 스킬을 쓸 때마다 HP 소모 (죽지는 않는다)
      const p = state.player;
      p.hp = Math.max(1, p.hp - heat.hpCost * used);
      state.events.push({ type: 'overheat', x: p.x, y: p.y, n: used });
    }
  }
  updateUtils(state, input);
  updateFields(state);
}

/** 스킬 사용 감지용 스냅샷: 충전 수, 쿨다운 시작, 궁극기 오브. */
function useSnapshot(state) {
  const snap = { orbs: state.ultOrbs };
  for (const [k, s] of Object.entries(state.player.skills)) snap[k] = { charges: s.charges, cdOn: s.cd > 0 };
  return snap;
}
function countUses(state, b) {
  let n = state.ultOrbs < b.orbs ? 1 : 0;
  for (const [k, s] of Object.entries(state.player.skills)) {
    const o = b[k];
    if (k === 'x' || k === 'q') continue; // 궁극기는 오브로, 헤드헌터는 탄 소모라 제외
    if (o.charges !== undefined && s.charges < o.charges) n++;
    else if (o.charges === undefined && !o.cdOn && s.cd > 0) n++;
  }
  return n;
}

/** 고유 패시브 크리 판정 (combat.js 에서 호출). */
export const passiveCrit = (state, e, source) => impl(state).passiveCrit(state, e, source);

/** 탄 명중 후처리 (연쇄 헤드샷, 냉각탄 등). */
export const onBulletHit = (state, b, e) => impl(state).onBulletHit(state, b, e);

/** HUD 용 스킬 상태. */
export const abilityStatus = (state, slot) => impl(state).abilityStatus(state, slot);

/** 요원의 C 설치물 1개를 무료로 (공학 탄창 스펙터, 덫 각인 오퍼레이터). */
export const freeGadget = (state, x, y) => impl(state).freeGadget(state, x, y);

/** 처치 크레딧 배율 (체임버 금괴 탄 등). */
export const killCreditMult = (state, e) => impl(state).creditMult?.(state, e) ?? 1;

/** 적 처치 시: 엘리트 오브, 에이전트별 처치 효과, 처치 수 오브 적립. */
export function onEnemyKilled(state, e) {
  if (ENEMIES[e.type].ultOrb) addUltOrb(state);
  if (ENEMIES[e.type].elite) {
    state.stats.eliteKills = (state.stats.eliteKills ?? 0) + 1;
    state.relicQueue = (state.relicQueue ?? 0) + 1; // 엘리트 처치 → 유물 3지선다
  }
  impl(state).onKilled(state, e);
  // 처치 회복 (라운드당 상한)
  const vamp = relicOf(state.player, 'vampCore');
  const heal = passiveAdd(state.player, 'killHeal') + (vamp?.killHeal ?? 0);
  if (heal) {
    const room = vamp ? Infinity : PASSIVES.killHeal.roundCap - state.roundHealed; // 흡혈 코어: 상한 없음
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
  p.dash = null;
  state.utilShots = [];
  state.utilFx = [];
  impl(state).resetRound(state);
}

