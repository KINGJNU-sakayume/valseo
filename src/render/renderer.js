import { WORLD } from '../data/balance.js';
import { THEME } from './theme.js';
import { drawEffects } from './effects.js';

export function render(ctx, state, cam, fx, now) {
  const { w, h } = cam;
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawGrid(ctx, cam);

  ctx.strokeStyle = THEME.border;
  ctx.lineWidth = THEME.borderWidth;
  ctx.strokeRect(0, 0, WORLD.width, WORLD.height);

  for (const f of state.fields) {
    ctx.globalAlpha = Math.min(1, f.life / 0.5); // 끝날 때 서서히 사라짐
    ctx.fillStyle = THEME.field;
    circle(ctx, f.x, f.y, f.r);
    ctx.strokeStyle = THEME.fieldEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 함정: 속이 빈 사각형 + 중심 점 (XP 조각 마름모와 구분)
  const ts = THEME.trapSize;
  for (const t of state.traps) {
    const color = t.arm > 0 ? THEME.trapArming : THEME.trap;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(t.x - ts / 2, t.y - ts / 2, ts, ts);
    ctx.fillStyle = color;
    circle(ctx, t.x, t.y, 2);
  }

  const anchor = state.player.skills.e.anchor;
  if (anchor) {
    ctx.strokeStyle = THEME.anchor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, THEME.anchorRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

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
  if (p.precision) {
    // 정조준: 관통 궤적 미리보기
    ctx.strokeStyle = THEME.precisionLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.aim) * THEME.precisionLength, p.y + Math.sin(p.aim) * THEME.precisionLength);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = THEME.aimLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(p.aim) * THEME.aimLineLength, p.y + Math.sin(p.aim) * THEME.aimLineLength);
  ctx.stroke();
  ctx.fillStyle = p.invuln > 0 && Math.floor(state.tick / 4) % 2 ? THEME.playerHit : THEME.player;
  circle(ctx, p.x, p.y, p.r);
  if (fx) drawEffects(ctx, fx, now);
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
