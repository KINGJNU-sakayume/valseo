import { createState } from './state.js';
import { DT, SPATIAL } from '../data/balance.js';
import { createSpatialHash, clearHash, insert, query } from './spatial.js';
import { updatePlayer, damagePlayer } from './systems/player.js';
import { updateWeapons, updateBullets, removeAt } from './systems/weapons.js';
import { updateSpawns, updateEnemies } from './systems/enemies.js';

// 공간 해시와 질의 버퍼는 매 틱 재구성되는 캐시라 state 밖에 둔다 (결정성에 영향 없음).
const hash = createSpatialHash(SPATIAL.cellSize);
const near = [];

export { DT };

export function createGame(seed = 1) {
  return createState(seed);
}

/** 1틱(DT) 진행. */
export function step(state, input = {}) {
  state.events.length = 0;
  if (state.pending || state.phase !== 'COMBAT') return state;

  updatePlayer(state, input);
  updateWeapons(state);
  updateBullets(state);
  updateSpawns(state);
  updateEnemies(state);
  resolveCollisions(state);

  state.tick++;
  state.time = state.tick * DT;
  return state;
}

/** state.pending 에 대한 응답. M1에서는 선택지가 생기지 않는다. */
export function choose(state, index) {
  if (!state.pending) return false;
  void index;
  return false;
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
      e.hp -= b.damage;
      b.hitIds.push(e.id);
      state.events.push({ type: 'hit', x: e.x, y: e.y, damage: b.damage, crit: false });
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

  // 사망 처리
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.hp > 0) continue;
    state.stats.kills++;
    state.events.push({ type: 'kill', x: e.x, y: e.y, enemy: e.type });
    removeAt(enemies, i);
  }
}
