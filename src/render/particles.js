// 렌더 전용 파티클 (월드 좌표). 사각 픽셀, 감쇠, 수명.
import { bx, by } from './camera.js';
import { speck } from './tiles.js';

const MAX = 1400;

export function createParticles() {
  return { list: [] };
}

/**
 * p: { x, y, vx, vy, life, color, size=1, drag=4, grow=0, shrink=false, decal=null, glow=false }
 */
export function emit(ps, p) {
  if (ps.list.length >= MAX) ps.list.shift();
  ps.list.push({ size: 1, drag: 4, ...p, max: p.life });
}

/** 한 점에서 사방으로 튀는 파편. rand 는 렌더 전용 난수. */
export function burst(ps, rand, x, y, n, colors, { speed = 120, life = 0.4, size = 1, drag = 5, decal = null, spread = Math.PI * 2, dir = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = dir + (rand() - 0.5) * spread;
    const v = speed * (0.3 + rand() * 0.7);
    emit(ps, {
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: life * (0.6 + rand() * 0.6), color: colors[Math.floor(rand() * colors.length)], size, drag, decal,
    });
  }
}

export function updateParticles(ps, dt, arena) {
  const out = [];
  for (const p of ps.list) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const k = Math.max(0, 1 - p.drag * dt);
    p.vx *= k;
    p.vy *= k;
    if (p.life > 0) out.push(p);
    else if (p.decal && arena) speck(arena, p.x, p.y, p.decal);
  }
  ps.list = out;
}

export function drawParticles(ctx, ps, cam) {
  for (const p of ps.list) {
    const t = p.life / p.max;
    ctx.globalAlpha = p.fade === false ? 1 : Math.min(1, t * 1.6);
    ctx.fillStyle = p.color;
    const s = p.shrink ? Math.max(1, Math.round(p.size * t)) : p.size;
    ctx.fillRect(Math.round(bx(cam, p.x) - s / 2), Math.round(by(cam, p.y) - s / 2), s, s);
  }
  ctx.globalAlpha = 1;
}
