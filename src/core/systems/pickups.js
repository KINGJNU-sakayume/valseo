import { DT, PICKUP } from '../../data/balance.js';
import { range } from '../rng.js';
import { playerStat } from '../stats.js';
import { gainXp } from './progression.js';
import { gainCredits } from './economy.js';
import { removeAt } from './weapons.js';

export function dropPickup(state, kind, x, y, value) {
  if (value <= 0) return;
  if (state.pickups.length >= PICKUP.maxPickups) {
    collect(state, kind, value);
    return;
  }
  const j = PICKUP.dropJitter;
  state.pickups.push({ kind, x: x + range(state.rng, -j, j), y: y + range(state.rng, -j, j), r: PICKUP.radius, value });
}

export function updatePickups(state) {
  const p = state.player;
  const magnet = playerStat(p, 'magnetRadius');
  const list = state.pickups;
  for (let i = list.length - 1; i >= 0; i--) {
    const k = list[i];
    const dx = p.x - k.x;
    const dy = p.y - k.y;
    const d = Math.hypot(dx, dy);
    if (d <= p.r + k.r) {
      collect(state, k.kind, k.value);
      removeAt(list, i);
    } else if (d <= magnet) {
      const s = Math.min(d, PICKUP.pullSpeed * DT);
      k.x += (dx / d) * s;
      k.y += (dy / d) * s;
    }
  }
}

/** 라운드 종료 시 필드의 조각을 전부 흡수. */
export function absorbAll(state) {
  for (const k of state.pickups) collect(state, k.kind, k.value);
  state.pickups.length = 0;
}

function collect(state, kind, value) {
  if (kind === 'xp') gainXp(state, value);
  else gainCredits(state, value);
}
