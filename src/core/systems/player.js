import { DT, WORLD, PLAYER } from '../../data/balance.js';
import { playerStat } from '../stats.js';

export function updatePlayer(state, input) {
  const p = state.player;
  const mx = input.move?.x ?? 0;
  const my = input.move?.y ?? 0;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    const speed = playerStat(p, 'moveSpeed');
    p.x += (mx / len) * speed * DT;
    p.y += (my / len) * speed * DT;
  }
  p.x = Math.min(WORLD.width - p.r, Math.max(p.r, p.x));
  p.y = Math.min(WORLD.height - p.r, Math.max(p.r, p.y));

  if (input.aim) {
    const dx = input.aim.x - p.x;
    const dy = input.aim.y - p.y;
    if (dx !== 0 || dy !== 0) p.aim = Math.atan2(dy, dx);
  }

  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - DT);
}

/** 실드가 먼저 피해를 흡수하고, 남은 피해가 HP로 간다. */
export function damagePlayer(state, amount, source) {
  const p = state.player;
  if (p.invuln > 0 || state.phase !== 'COMBAT') return;
  const absorbed = Math.min(p.shield, amount);
  p.shield -= absorbed;
  p.hp = Math.max(0, p.hp - (amount - absorbed));
  p.invuln = PLAYER.invulnTime;
  state.events.push({ type: 'playerHit', amount, absorbed, source });
  if (p.hp <= 0) {
    state.phase = 'DEFEAT';
    state.events.push({ type: 'defeat', round: state.round, time: state.time, kills: state.stats.kills });
  }
}
