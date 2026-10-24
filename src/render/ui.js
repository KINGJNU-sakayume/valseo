import { THEME } from './theme.js';

const HP_BAR = { w: 260, h: 14, bottom: 32 };

export function drawHud(ctx, state, cam) {
  const p = state.player;
  const x = (cam.w - HP_BAR.w) / 2;
  const y = cam.h - HP_BAR.bottom;
  ctx.fillStyle = THEME.hpBarBg;
  ctx.fillRect(x, y, HP_BAR.w, HP_BAR.h);
  ctx.fillStyle = THEME.hpBar;
  ctx.fillRect(x, y, HP_BAR.w * (p.hp / p.maxHp), HP_BAR.h);

  ctx.fillStyle = THEME.text;
  ctx.font = THEME.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`HP ${Math.ceil(p.hp)} / ${p.maxHp}`, cam.w / 2, y - 4);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`시간 ${formatTime(state.time)}   처치 ${state.stats.kills}   적 ${state.enemies.length}`, 12, 12);

  if (state.phase === 'DEFEAT') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, cam.w, cam.h);
    ctx.fillStyle = THEME.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = THEME.bigFont;
    ctx.fillText('DEFEAT', cam.w / 2, cam.h / 2 - 24);
    ctx.font = THEME.font;
    ctx.fillText(`생존 ${formatTime(state.time)} · 처치 ${state.stats.kills} · R 키로 재시작`, cam.w / 2, cam.h / 2 + 20);
  }
}

function formatTime(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
