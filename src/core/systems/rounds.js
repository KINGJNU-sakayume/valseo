import { DT } from '../../data/balance.js';
import { ROUNDS } from '../../data/rounds.js';
import { maxHp } from '../stats.js';
import { absorbAll } from './pickups.js';
import { clearBonus, gainCredits } from './economy.js';
import { drawCards } from './progression.js';

export function startRound(state, R) {
  const p = state.player;
  state.round = R;
  state.roundTime = 0;
  state.spawnAcc = 0;
  state.stats.roundKills = 0;
  state.shopCard = null;
  state.shopCardBought = false;
  state.phase = 'COMBAT';
  p.hp = Math.min(maxHp(p), p.hp + maxHp(p) * ROUNDS.startHealPct);
  state.events.push({ type: 'roundStart', round: R });
}

export function updateRound(state) {
  state.roundTime += DT;
  if (state.roundTime >= ROUNDS.combatTime) endRound(state);
}

/** 남은 적 소멸, 필드 조각 자동 흡수, 클리어 보너스 → BUY 또는 VICTORY. */
export function endRound(state) {
  const R = state.round;
  state.enemies.length = 0;
  state.bullets.length = 0;
  absorbAll(state);
  const bonus = clearBonus(R);
  gainCredits(state, bonus);
  state.events.push({ type: 'roundEnd', round: R, kills: state.stats.roundKills, bonus });
  if (R >= ROUNDS.count) {
    // M9 전까지는 마지막 라운드 생존 = 승리
    state.phase = 'VICTORY';
    state.events.push({ type: 'victory', round: R, kills: state.stats.kills });
    return;
  }
  state.phase = 'BUY';
  state.shopCard = drawCards(state, 1)[0] ?? null;
}
