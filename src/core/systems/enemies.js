import { DT, WORLD, SPAWN } from '../../data/balance.js';
import { ENEMIES, ENEMY_BULLET } from '../../data/enemies.js';
import { SPAWN_BUDGET, ENEMY_SCALING, SPAWN_MIX, ROUNDS } from '../../data/rounds.js';
import { nextFloat, range } from '../rng.js';
import { fieldSlow } from './fields.js';
import { damagePlayer } from './player.js';
import { removeAt } from './weapons.js';

/** S(R) = S0 + g·(R − 1) */
export const spawnBudget = (R) => SPAWN_BUDGET.S0 + SPAWN_BUDGET.g * (R - 1);

/** h(R) = 1 + k·(R − 1) */
export const hpScale = (R) => 1 + ENEMY_SCALING.k * (R - 1);

export function spawnWeights(R) {
  let w = SPAWN_MIX[0].weights;
  for (const m of SPAWN_MIX) if (R >= m.fromRound) w = m.weights;
  return w;
}

function pickType(state) {
  const entries = Object.entries(spawnWeights(state.round));
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = nextFloat(state.rng) * total;
  for (const [type, w] of entries) {
    if (roll < w) return type;
    roll -= w;
  }
  return entries[entries.length - 1][0];
}

/**
 * 스폰 예산: 초당 S(R)씩 쌓고, 다음에 나올 적(state.nextSpawn)의 cost 가 모이면 스폰.
 * 다음 적을 미리 정해 두어야 비싼 적이 싼 적에게 계속 밀리지 않는다.
 */
export function updateSpawns(state) {
  if (ROUNDS.eliteRounds.includes(state.round) && !state.eliteSpawned && state.roundTime >= ROUNDS.eliteSpawnTime) {
    state.eliteSpawned = true;
    spawn(state, 'elite');
  }
  state.spawnAcc += spawnBudget(state.round) * DT;
  if (!state.nextSpawn) state.nextSpawn = pickType(state);
  while (state.spawnAcc >= ENEMIES[state.nextSpawn].cost && state.enemies.length < SPAWN.maxEnemies) {
    state.spawnAcc -= ENEMIES[state.nextSpawn].cost;
    spawn(state, state.nextSpawn);
    state.nextSpawn = pickType(state);
  }
}

export function spawn(state, type, at = null) {
  const def = ENEMIES[type];
  const p = state.player;
  for (let t = 0; t < SPAWN.maxTries; t++) {
    let x;
    let y;
    if (at) {
      ({ x, y } = at);
    } else {
      const ang = nextFloat(state.rng) * Math.PI * 2;
      const dist = range(state.rng, SPAWN.safeRadius, SPAWN.safeRadius + SPAWN.ringWidth);
      x = p.x + Math.cos(ang) * dist;
      y = p.y + Math.sin(ang) * dist;
      if (x < def.radius || y < def.radius || x > WORLD.width - def.radius || y > WORLD.height - def.radius) continue;
    }
    const hp = def.hp * hpScale(state.round);
    const e = {
      id: state.nextId++,
      type,
      x,
      y,
      r: def.radius,
      hp,
      maxHp: hp,
      speed: def.speed,
      damage: def.contactDamage,
      mode: 'move', // charge: move → telegraph → dash → recover
      t: 0,
      dirX: 0,
      dirY: 0,
      fireCd: def.fireInterval ?? 0,
    };
    state.enemies.push(e);
    return e;
  }
  return null;
}

export function updateEnemies(state) {
  for (const e of state.enemies) {
    const def = ENEMIES[e.type];
    const slow = 1 - fieldSlow(state, e.x, e.y);
    if (def.ai === 'charge') updateCharger(state, e, def, slow);
    else if (def.ai === 'ranged') updateRanged(state, e, def, slow);
    else moveToward(e, state.player, e.speed * slow);
  }
  updateEnemyBullets(state);
}

function moveToward(e, target, speed, sign = 1) {
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return;
  e.x += (dx / d) * speed * DT * sign;
  e.y += (dy / d) * speed * DT * sign;
}

function clampToWorld(e) {
  e.x = Math.min(WORLD.width - e.r, Math.max(e.r, e.x));
  e.y = Math.min(WORLD.height - e.r, Math.max(e.r, e.y));
}

function updateCharger(state, e, def, slow) {
  const p = state.player;
  e.t -= DT;
  if (e.mode === 'move' || e.mode === 'recover') {
    moveToward(e, p, e.speed * slow);
    if (e.mode === 'recover' && e.t <= 0) e.mode = 'move';
    if (e.mode === 'move' && Math.hypot(p.x - e.x, p.y - e.y) <= def.dashTriggerRange) {
      // 예고선: 이 순간의 방향으로 고정
      const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
      e.dirX = (p.x - e.x) / d;
      e.dirY = (p.y - e.y) / d;
      e.mode = 'telegraph';
      e.t = def.telegraph;
    }
  } else if (e.mode === 'telegraph') {
    if (e.t <= 0) {
      e.mode = 'dash';
      e.t = def.dashDuration;
    }
  } else if (e.mode === 'dash') {
    e.x += e.dirX * def.dashSpeed * slow * DT;
    e.y += e.dirY * def.dashSpeed * slow * DT;
    clampToWorld(e);
    if (e.t <= 0) {
      e.mode = 'recover';
      e.t = def.recover;
    }
  }
}

function updateRanged(state, e, def, slow) {
  const p = state.player;
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  if (d > def.keepDistance + def.distanceBand) moveToward(e, p, e.speed * slow);
  else if (d < def.keepDistance - def.distanceBand) moveToward(e, p, e.speed * slow, -1);
  clampToWorld(e);

  e.fireCd -= DT;
  if (e.fireCd > 0) return;
  e.fireCd += def.fireInterval;
  const s = def.shot;
  const base = Math.atan2(p.y - e.y, p.x - e.x);
  for (let i = 0; i < s.count; i++) {
    if (state.enemyBullets.length >= ENEMY_BULLET.maxBullets) break;
    const a = base + (s.count > 1 ? (i - (s.count - 1) / 2) * s.spread : 0);
    state.enemyBullets.push({
      x: e.x, y: e.y,
      vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
      r: s.radius, damage: s.damage, life: ENEMY_BULLET.lifetime, source: e.type,
    });
  }
  state.events.push({ type: 'enemyShot', enemy: e.type });
}

function updateEnemyBullets(state) {
  const p = state.player;
  const list = state.enemyBullets;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.life -= DT;
    const rr = b.r + p.r;
    if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 <= rr * rr) {
      damagePlayer(state, b.damage, b.source);
      removeAt(list, i);
    } else if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height) {
      removeAt(list, i);
    }
  }
}
