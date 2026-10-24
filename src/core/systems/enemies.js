import { DT, WORLD, SPAWN } from '../../data/balance.js';
import { ENEMIES } from '../../data/enemies.js';
import { SPAWN_BUDGET, ENEMY_SCALING } from '../../data/rounds.js';
import { nextFloat, range } from '../rng.js';
import { fieldSlow } from './fields.js';

/** S(R) = S0 + g·(R − 1) */
export const spawnBudget = (R) => SPAWN_BUDGET.S0 + SPAWN_BUDGET.g * (R - 1);

/** h(R) = 1 + k·(R − 1) */
export const hpScale = (R) => 1 + ENEMY_SCALING.k * (R - 1);

export function updateSpawns(state) {
  state.spawnAcc += spawnBudget(state.round) * DT;
  const def = ENEMIES.chaser; // M5 전까지 추격형만
  while (state.spawnAcc >= def.cost && state.enemies.length < SPAWN.maxEnemies) {
    state.spawnAcc -= def.cost;
    spawn(state, 'chaser');
  }
}

function spawn(state, type) {
  const def = ENEMIES[type];
  const p = state.player;
  for (let t = 0; t < SPAWN.maxTries; t++) {
    const ang = nextFloat(state.rng) * Math.PI * 2;
    const dist = range(state.rng, SPAWN.safeRadius, SPAWN.safeRadius + SPAWN.ringWidth);
    const x = p.x + Math.cos(ang) * dist;
    const y = p.y + Math.sin(ang) * dist;
    if (x < def.radius || y < def.radius || x > WORLD.width - def.radius || y > WORLD.height - def.radius) continue;
    const hp = def.hp * hpScale(state.round);
    state.enemies.push({
      id: state.nextId++,
      type,
      x,
      y,
      r: def.radius,
      hp,
      maxHp: hp,
      speed: def.speed,
      damage: def.contactDamage,
    });
    return;
  }
}

export function updateEnemies(state) {
  const p = state.player;
  for (const e of state.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 0) {
      const speed = e.speed * (1 - fieldSlow(state, e.x, e.y));
      e.x += (dx / d) * speed * DT;
      e.y += (dy / d) * speed * DT;
    }
  }
}
