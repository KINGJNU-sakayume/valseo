import { createState } from './state.js';
import { DT, SPATIAL } from '../data/balance.js';
import { ENEMIES } from '../data/enemies.js';
import { createSpatialHash, clearHash, insert, query } from './spatial.js';
import { updatePlayer, damagePlayer } from './systems/player.js';
import { updateWeapons, updateBullets, removeAt } from './systems/weapons.js';
import { updateSpawns, updateEnemies } from './systems/enemies.js';
import { dropPickup, updatePickups } from './systems/pickups.js';
import { levelUpOptions, applyCard } from './systems/progression.js';
import { shopOptions, buy } from './systems/economy.js';
import { startRound, updateRound } from './systems/rounds.js';
import { updateSkills, onEnemyKilled, onHeadhunterHit } from './systems/skills.js';
import { checkEvolutions, onGunHit } from './systems/evolution.js';
import { branchOptions } from './systems/progression.js';
import { damageEnemy } from './systems/combat.js';

// 공간 해시와 질의 버퍼는 매 틱 재구성되는 캐시라 state 밖에 둔다 (결정성에 영향 없음).
const hash = createSpatialHash(SPATIAL.cellSize);
const near = [];

export { DT };

export function createGame(seed = 1) {
  const state = createState(seed);
  startRound(state, 1);
  state.events.length = 0;
  return state;
}

/** 1틱(DT) 진행. pending 이 있거나 전투 중이 아니면 no-op. */
export function step(state, input = {}) {
  state.events.length = 0;
  if (state.pending) return state;
  if (state.phase !== 'COMBAT') {
    refreshPending(state); // BUY 인데 상점이 아직 안 열렸으면 연다
    return state;
  }

  updatePlayer(state, input);
  updateSkills(state, input);
  updateWeapons(state);
  updateBullets(state);
  updateSpawns(state);
  updateEnemies(state);
  resolveCollisions(state);
  if (state.phase === 'COMBAT') {
    updatePickups(state);
    updateRound(state);
  }
  refreshPending(state);

  state.tick++;
  state.time = state.tick * DT;
  return state;
}

/**
 * state.pending 에 대한 응답. 성공하면 true.
 * - levelup: 카드 index 적용
 * - branch: 스킬 분기 A/B
 * - shop: 상점 항목 index 구매 ('다음 라운드' 포함)
 */
export function choose(state, index) {
  const pending = state.pending;
  if (!pending) return false;
  const opt = pending.options[index];
  if (!opt) return false;

  if (pending.kind === 'levelup') {
    applyCard(state, opt);
    state.levelUpsQueued--;
  } else if (pending.kind === 'branch') {
    state.player.skills[pending.key].branch = opt.branch;
    state.branchQueue.shift();
    state.events.push({ type: 'branch', skill: pending.key, branch: opt.branch });
  } else if (pending.kind === 'shop') {
    if (!opt.enabled) return false;
    if (opt.kind === 'next') startRound(state, state.round + 1);
    else buy(state, opt);
  }
  state.pending = null;
  checkEvolutions(state);
  refreshPending(state);
  return true;
}

/** 분기 선택 → 레벨업 → 구매 페이즈 상점 순. */
function refreshPending(state) {
  if (state.pending) return;
  if (state.phase !== 'COMBAT' && state.phase !== 'BUY') return;
  if (state.branchQueue.length > 0) {
    const key = state.branchQueue[0];
    state.pending = { kind: 'branch', key, options: branchOptions(key) };
  } else if (state.levelUpsQueued > 0) {
    state.pending = { kind: 'levelup', options: levelUpOptions(state) };
  } else if (state.phase === 'BUY') {
    state.pending = { kind: 'shop', options: shopOptions(state) };
  }
}

function resolveCollisions(state) {
  const { enemies, bullets, player } = state;
  clearHash(hash);
  for (const e of enemies) insert(hash, e);

  // 투사체 vs 적
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    query(hash, b.x, b.y, b.r, near);
    let consumed = false;
    for (const e of near) {
      if (e.hp <= 0 || b.hitIds.includes(e.id)) continue;
      const rr = e.r + b.r;
      const dx = e.x - b.x;
      const dy = e.y - b.y;
      if (dx * dx + dy * dy > rr * rr) continue;
      const crit = damageEnemy(state, e, b.damage, b.crit, b.source);
      b.hitIds.push(e.id);
      if (b.source === 'headhunter') onHeadhunterHit(state);
      else onGunHit(state, b.source, crit);
      if (b.pierce-- <= 0) {
        consumed = true;
        break;
      }
    }
    if (consumed) removeAt(bullets, i);
  }

  // 적 vs 플레이어 (접촉 피해)
  query(hash, player.x, player.y, player.r, near);
  for (const e of near) {
    if (e.hp <= 0) continue;
    const rr = e.r + player.r;
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    if (dx * dx + dy * dy <= rr * rr) damagePlayer(state, e.damage, e.type);
  }

  // 사망 처리 → XP 조각, 크레딧 드롭
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.hp > 0) continue;
    const def = ENEMIES[e.type];
    state.stats.kills++;
    state.stats.roundKills++;
    state.events.push({ type: 'kill', x: e.x, y: e.y, enemy: e.type, by: e.killedBy });
    dropPickup(state, 'xp', e.x, e.y, def.xp);
    dropPickup(state, 'credit', e.x, e.y, def.credits);
    onEnemyKilled(state, e);
    removeAt(enemies, i);
  }
}
