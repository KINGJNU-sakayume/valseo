import { CRIT } from '../../data/balance.js';
import { STATUS } from '../../data/agents.js';
import { passiveCrit } from './skills.js';
import { passiveAdd } from '../stats.js';
import { damageMods, critBonus } from './tactics.js';
import { defenseMult, absorbShield, onDamaged } from './mutants.js';

/**
 * 적에게 피해를 준다. 에이전트 고유 패시브가 크리 여부를 정하고(체임버 집중포화, 킬조이 천재성),
 * 취약 상태 적은 피해 배율을 더 받는다.
 * 처치는 hp <= 0 으로 표시만 하고, 실제 제거·드롭은 game.js 의 사망 처리에서 한다.
 * 변이체 방어: 껍질(앞쪽 직접 피해 감소, from = 날아온 지점), 결정 기둥, 보호막(HP 보다 먼저), 무적.
 * 크리티컬이었으면 true.
 */
export function damageEnemy(state, e, base, crit, source, from = null) {
  if (e.invuln > 0 || e.gone) return false;
  const crossfire = !crit && passiveCrit(state, e, source);
  const isCrit = crit || crossfire;
  let damage = base * (isCrit ? CRIT.multiplier + passiveAdd(state.player, 'critDamage') + critBonus(state) : 1);
  damage *= damageMods(state, e, source, isCrit);
  if (e.vulnerable > 0) damage *= STATUS.vulnerableMult;
  damage *= defenseMult(state, e, source, from);
  e.lastCrit = isCrit;
  e.hp -= damage - absorbShield(e, damage);
  onDamaged(state, e, damage, source);
  state.stats.damage += damage;
  if (e.hp <= 0 && !e.killedBy) e.killedBy = source;
  state.events.push({ type: 'hit', id: e.id, x: e.x, y: e.y, damage, crit: isCrit, crossfire, source });
  return isCrit;
}
