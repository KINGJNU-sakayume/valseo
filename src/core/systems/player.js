import { DT, WORLD, PLAYER } from '../../data/balance.js';

export function updatePlayer(state, input) {
  const p = state.player;
  const mx = input.move?.x ?? 0;
  const my = input.move?.y ?? 0;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    p.x += (mx / len) * PLAYER.speed * DT;
    p.y += (my / len) * PLAYER.speed * DT;
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

export function damagePlayer(state, amount, source) {
  const p = state.player;
  if (p.invuln > 0 || state.phase !== 'COMBAT') return;
  p.hp = Math.max(0, p.hp - amount);
  p.invuln = PLAYER.invulnTime;
  state.events.push({ type: 'playerHit', amount, source });
  if (p.hp <= 0) {
    state.phase = 'DEFEAT';
    state.events.push({ type: 'defeat', time: state.time, kills: state.stats.kills });
  }
}
