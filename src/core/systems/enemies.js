import { DT, WORLD, SPAWN } from '../../data/balance.js';
import { ENEMIES } from '../../data/enemies.js';
import { nextFloat, range } from '../rng.js';

export function updateSpawns(state) {
  state.spawnAcc += SPAWN.budgetPerSec * DT;
  const def = ENEMIES.chaser; // M1: 추격형만
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
    state.enemies.push({
      id: state.nextId++,
      type,
      x,
      y,
      r: def.radius,
      hp: def.hp,
      maxHp: def.hp,
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
      e.x += (dx / d) * e.speed * DT;
      e.y += (dy / d) * e.speed * DT;
    }
  }
}
