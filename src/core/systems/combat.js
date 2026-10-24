import { CRIT } from '../../data/balance.js';
import { CROSSFIRE } from '../../data/skills.js';
import { inField } from './fields.js';

/**
 * 적에게 피해를 준다. 집중포화: 감속 필드 안의 적은 모든 피해가 크리티컬.
 * 처치는 hp <= 0 으로 표시만 하고, 실제 제거·드롭은 game.js 의 사망 처리에서 한다.
 */
export function damageEnemy(state, e, base, crit, source) {
  const crossfire = !crit && CROSSFIRE.enabled && inField(state, e.x, e.y);
  const isCrit = crit || crossfire;
  const damage = base * (isCrit ? CRIT.multiplier : 1);
  e.hp -= damage;
  if (e.hp <= 0 && !e.killedBy) e.killedBy = source;
  state.events.push({ type: 'hit', x: e.x, y: e.y, damage, crit: isCrit, crossfire, source });
}
