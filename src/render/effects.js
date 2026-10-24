// 이벤트 → 짧은 시각 효과. 렌더 시간(실시간) 기준이라 core 결정성과 무관하다.
import { THEME } from './theme.js';

const DURATION = { ult: 0.35, ring: 0.4, teleport: 0.35, crit: 0.15, kill: 0.2, number: 0.6, flash: 0.08 };
const MAX_EFFECTS = 400;
const MAX_NUMBERS = 60;
// 화면 흔들림 세기(px), 초당 감쇠 비율
const SHAKE = { playerHit: 6, ult: 10, bossPhase: 14, bossSpawn: 10, evolve: 6, bossEnrage: 12, decay: 8, max: 18 };

export function createEffects() {
  return { list: [], flash: new Map(), shake: 0, numbers: 0 };
}

export function pushEvents(fx, events, now, settings) {
  for (const ev of events) {
    if (SHAKE[ev.type]) fx.shake = Math.min(SHAKE.max, fx.shake + SHAKE[ev.type]);
    if (ev.type === 'hit') fx.flash.set(ev.id, now);
    if (!settings.effects) continue;
    let e = null;
    switch (ev.type) {
      case 'ult':
        e = { kind: 'beam', dur: DURATION.ult, x1: ev.x1, y1: ev.y1, x2: ev.x2, y2: ev.y2 };
        break;
      case 'shockwave':
        e = { kind: 'ring', dur: DURATION.ring, x: ev.x, y: ev.y, r: ev.r, color: THEME.teleport };
        break;
      case 'evolve':
        e = { kind: 'ring', dur: DURATION.ring * 2, x: ev.x, y: ev.y, r: 160, color: THEME.accent };
        break;
      case 'bossPhase':
      case 'bossSpawn':
      case 'bossEnrage':
        e = { kind: 'ring', dur: DURATION.ring * 2, x: ev.x, y: ev.y, r: 260, color: THEME.elite };
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
        if (!ev.crit) break;
        e = { kind: 'spark', dur: DURATION.crit, x: ev.x, y: ev.y };
        if (settings.damageNumbers && fx.numbers < MAX_NUMBERS) {
          fx.numbers++;
          fx.list.push({ kind: 'number', t0: now, dur: DURATION.number, x: ev.x, y: ev.y - 14, text: String(Math.round(ev.damage)), crossfire: ev.crossfire });
        }
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

/** 이번 프레임의 화면 흔들림 오프셋. 시간에 따라 감쇠. */
export function shakeOffset(fx, frameDt, settings, rand) {
  fx.shake = Math.max(0, fx.shake - fx.shake * SHAKE.decay * frameDt - frameDt);
  if (!settings.shake || fx.shake <= 0) return { x: 0, y: 0 };
  return { x: (rand() * 2 - 1) * fx.shake, y: (rand() * 2 - 1) * fx.shake };
}

/** 최근 피격된 적인가 (깜빡임). */
export function isFlashing(fx, id, now) {
  const t = fx.flash.get(id);
  return t !== undefined && now - t < DURATION.flash;
}

/** 월드 좌표계(카메라 변환이 걸린 상태)에서 호출. */
export function drawEffects(ctx, fx, now) {
  fx.list = fx.list.filter((e) => now - e.t0 < e.dur);
  fx.numbers = 0;
  if (fx.flash.size > 2000) fx.flash.clear();
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
    } else if (e.kind === 'number') {
      fx.numbers++;
      ctx.fillStyle = e.crossfire ? THEME.trap : THEME.crit;
      ctx.font = THEME.titleFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.text, e.x, e.y - 24 * k);
    }
  }
  ctx.globalAlpha = 1;
}
