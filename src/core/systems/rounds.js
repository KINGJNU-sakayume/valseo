import { DT } from '../../data/balance.js';
import { ROUNDS } from '../../data/rounds.js';
import { maxHp } from '../stats.js';
import { absorbAll } from './pickups.js';
import { clearBonus, gainCredits } from './economy.js';
import { drawCards } from './progression.js';
import { resetSkillsForRound } from './skills.js';
import { checkEvolutions } from './evolution.js';

export function startRound(state, R) {
  const p = state.player;
  state.round = R;
  state.roundTime = 0;
  state.spawnAcc = 0;
  state.nextSpawn = null;
  state.eliteSpawned = false;
  state.bossSpawned = false;
  state.stats.roundKills = 0;
  state.roundHealed = 0;
  state.shopCard = null;
  state.shopCardBought = false;
  state.cleanup = false;
  state.roundWon = false;
  state.winTimer = 0;
  state.sweepT = 0;
  state.phase = 'COMBAT';
  p.hp = Math.min(maxHp(p), p.hp + maxHp(p) * ROUNDS.startHealPct);
  checkEvolutions(state);
  state.events.push({ type: 'roundStart', round: R });
}

/**
 * 라운드 타임라인 (보스 라운드 제외):
 * 0~spawnStopTime 스폰 → 정리 페이즈(스폰 정지) → 전멸하면 클린 라운드(winDelay 후 종료)
 * → combatTime 까지 남은 적이 있으면 섬멸 파동(SWEEP) 후 종료.
 */
export function updateRound(state) {
  state.roundTime += DT;
  // 보스 라운드는 타이머가 없다: 보스 처치(VICTORY) 또는 사망(DEFEAT)으로만 끝난다
  if (state.round === ROUNDS.bossRound) return;
  if (state.roundWon) {
    state.winTimer -= DT;
    if (state.winTimer <= 0) endRound(state, true);
    return;
  }
  if (!state.cleanup && state.roundTime >= ROUNDS.spawnStopTime) {
    state.cleanup = true;
    state.events.push({ type: 'cleanup', round: state.round, left: state.enemies.length });
  }
  if (state.cleanup && state.enemies.length === 0) {
    state.roundWon = true;
    state.winTimer = ROUNDS.winDelay;
    state.enemyBullets.length = 0;
    state.events.push({ type: 'roundWin', round: state.round });
    return;
  }
  if (state.roundTime >= ROUNDS.combatTime) {
    state.phase = 'SWEEP';
    state.sweepT = 0;
    state.enemyBullets.length = 0;
    state.events.push({ type: 'sweep', x: state.player.x, y: state.player.y, left: state.enemies.length });
  }
}

/** 섬멸 파동: 플레이어 중심 고리가 퍼지며 남은 적을 처치(XP만, 크레딧·엘리트 보상 없음). */
export function updateSweep(state) {
  state.sweepT += DT;
  const r = sweepRadius(state);
  const p = state.player;
  for (const e of state.enemies) {
    if (e.hp > 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= r * r) {
      e.hp = 0;
      e.killedBy = 'sweep';
    }
  }
  if (state.sweepT >= ROUNDS.sweepTime) {
    for (const e of state.enemies) {
      e.hp = 0;
      e.killedBy = 'sweep';
    }
  }
}

export const sweepRadius = (state) => ROUNDS.sweepRadius * Math.min(1, state.sweepT / ROUNDS.sweepTime);

/** 남은 적 소멸, 필드 조각 자동 흡수, 클리어 보너스(클린 라운드면 가산) → BUY 또는 VICTORY. */
export function endRound(state, clean = false) {
  const R = state.round;
  state.enemies.length = 0;
  state.bullets.length = 0;
  state.enemyBullets.length = 0;
  resetSkillsForRound(state);
  absorbAll(state);
  const bonus = Math.round(clearBonus(R) * (clean ? 1 + ROUNDS.cleanBonus : 1));
  gainCredits(state, bonus);
  state.events.push({ type: 'roundEnd', round: R, kills: state.stats.roundKills, bonus, clean });
  if (R >= ROUNDS.count) {
    // M9 전까지는 마지막 라운드 생존 = 승리
    state.phase = 'VICTORY';
    state.events.push({ type: 'victory', round: R, kills: state.stats.kills });
    return;
  }
  state.phase = 'BUY';
  state.shopCard = drawCards(state, 1)[0] ?? null;
}
