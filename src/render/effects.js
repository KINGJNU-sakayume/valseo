// 이벤트 → 짧은 시각 효과. 렌더 시간(실시간) 기준이라 core 결정성과 무관하다.
import { THEME } from './theme.js';

const DURATION = { ult: 0.35, ring: 0.4, teleport: 0.35, crit: 0.15, kill: 0.2 };
const MAX_EFFECTS = 400;

export function createEffects() {
  return { list: [] };
}

export function pushEvents(fx, events, now) {
  for (const ev of events) {
    let e = null;
    switch (ev.type) {
      case 'ult':
        e = { kind: 'beam', dur: DURATION.ult, x1: ev.x1, y1: ev.y1, x2: ev.x2, y2: ev.y2 };
        break;
      case 'ultExplosion':
        e = { kind: 'ring', dur: DURATION.ring, x: ev.x, y: ev.y, r: ev.r, color: THEME.beam };
        break;
      case 'trapTriggered':
        e = { kind: 'ring', dur: DURATION.ring, x: ev.x, y: ev.y, r: 80, color: THEME.trap };
        break;
      case 'teleport':
        fx.list.push({ kind: 'flash', t0: now, dur: DURATION.teleport, x: ev.from.x, y: ev.from.y });
        e = { kind: 'flash', dur: DURATION.teleport, x: ev.to.x, y: ev.to.y };
        break;
      case 'hit':
        if (ev.crit) e = { kind: 'spark', dur: DURATION.crit, x: ev.x, y: ev.y };
        break;
      case 'kill':
        e = { kind: 'pop', dur: DURATION.kill, x: ev.x, y: ev.y };
        break;
    }
    if (e) {
      e.t0 = now;
      fx.list.push(e);
    }
  }
  if (fx.list.length > MAX_EFFECTS) fx.list.splice(0, fx.list.length - MAX_EFFECTS);
}

/** 월드 좌표계(카메라 변환이 걸린 상태)에서 호출. */
export function drawEffects(ctx, fx, now) {
  fx.list = fx.list.filter((e) => now - e.t0 < e.dur);
  for (const e of fx.list) {
    const k = (now - e.t0) / e.dur; // 0 → 1
    ctx.globalAlpha = 1 - k;
    if (e.kind === 'beam') {
      ctx.strokeStyle = THEME.beam;
      ctx.lineWidth = 14 * (1 - k) + 2;
      ctx.beginPath();
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
    } else if (e.kind === 'ring') {
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (0.4 + 0.6 * k), 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.kind === 'flash') {
      ctx.fillStyle = THEME.teleport;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 10 + 30 * k, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'spark') {
      ctx.strokeStyle = THEME.crit;
      ctx.lineWidth = 2;
      const r = 6 + 10 * k;
      ctx.beginPath();
      ctx.moveTo(e.x - r, e.y);
      ctx.lineTo(e.x + r, e.y);
      ctx.moveTo(e.x, e.y - r);
      ctx.lineTo(e.x, e.y + r);
      ctx.stroke();
    } else if (e.kind === 'pop') {
      ctx.strokeStyle = THEME.enemy;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 12 + 10 * k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
