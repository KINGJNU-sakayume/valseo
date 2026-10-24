import { WORLD } from '../data/balance.js';
import { THEME } from './theme.js';

export function render(ctx, state, cam) {
  const { w, h } = cam;
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawGrid(ctx, cam);

  ctx.strokeStyle = THEME.border;
  ctx.lineWidth = THEME.borderWidth;
  ctx.strokeRect(0, 0, WORLD.width, WORLD.height);

  for (const k of state.pickups) {
    ctx.fillStyle = k.kind === 'xp' ? THEME.xp : THEME.credit;
    diamond(ctx, k.x, k.y, k.r);
  }

  ctx.fillStyle = THEME.enemy;
  for (const e of state.enemies) circle(ctx, e.x, e.y, e.r);

  for (const b of state.bullets) {
    ctx.fillStyle = b.crit ? THEME.bulletCrit : THEME.bullet;
    circle(ctx, b.x, b.y, b.r);
  }

  const p = state.player;
  ctx.strokeStyle = THEME.aimLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(p.aim) * THEME.aimLineLength, p.y + Math.sin(p.aim) * THEME.aimLineLength);
  ctx.stroke();
  ctx.fillStyle = p.invuln > 0 && Math.floor(state.tick / 4) % 2 ? THEME.playerHit : THEME.player;
  circle(ctx, p.x, p.y, p.r);
  ctx.restore();

}

function drawGrid(ctx, cam) {
  const g = THEME.gridSize;
  ctx.strokeStyle = THEME.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const x0 = Math.max(0, Math.floor(cam.x / g) * g);
  const x1 = Math.min(WORLD.width, cam.x + cam.w);
  const y0 = Math.max(0, Math.floor(cam.y / g) * g);
  const y1 = Math.min(WORLD.height, cam.y + cam.h);
  for (let x = x0; x <= x1; x += g) {
    ctx.moveTo(x, Math.max(0, cam.y));
    ctx.lineTo(x, y1);
  }
  for (let y = y0; y <= y1; y += g) {
    ctx.moveTo(Math.max(0, cam.x), y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
}

export function drawCrosshair(ctx, x, y) {
  const s = THEME.crosshairSize;
  ctx.strokeStyle = THEME.crosshair;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x + s, y);
  ctx.moveTo(x, y - s);
  ctx.lineTo(x, y + s);
  ctx.stroke();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function diamond(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}
