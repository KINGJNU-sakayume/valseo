// 천상계 형상 화면 (아스트라, 설계 28장): 몸을 빠져나와 맵 전체를 내려다보며 별을 배치·회수하고 우주 장벽을 조준한다.
// 배치(astralLayout)는 입력(main.js: 화면 → 월드)과 그리기가 같이 쓴다.
import { WORLD } from '../data/balance.js';
import { STAR } from '../data/agents.js';
import { SKILLS } from '../data/skills.js';
import { C, PAL } from './palette.js';
import { rect, text, line, ring, disc } from './pixel.js';
import { WALL } from './tiles.js';
import { drawSprite } from './sprites.js';
import { isBig } from '../data/enemies.js';
import { sideOf } from '../core/systems/divide.js';
import { ultCost } from '../core/systems/skillutil.js';

const R = Math.round;

/** 맵 전체가 들어가는 정사각형 (버퍼 px). s = 월드 단위 / px. */
export function astralLayout(W, H) {
  const top = 30;
  const size = Math.min(W - 24, H - top - 34);
  return { x: Math.round((W - size) / 2), y: top, size, s: WORLD.width / size };
}

/** 지도 아래 "돌아가기 / 전투 시작" 버튼 (모바일 탭, PC 클릭). */
export function astralExitRect(W, H) {
  const L = astralLayout(W, H);
  return { x: Math.round(W / 2 - 50), y: L.y + L.size + 12, w: 100, h: 16 };
}
/** 우주 장벽 버튼 (오브가 차 있을 때, 나가기 버튼 왼쪽). 모바일은 우클릭이 없어서 이것으로. */
export function astralDivideRect(W, H) {
  const X = astralExitRect(W, H);
  return { x: X.x - 108, y: X.y, w: 100, h: 16 };
}
export const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** 버퍼 좌표 → 월드 좌표 (지도 밖이면 가장자리로). */
export function astralToWorld(L, bx, by) {
  return {
    x: Math.min(WORLD.width, Math.max(0, (bx - L.x) * L.s)),
    y: Math.min(WORLD.height, Math.max(0, (by - L.y) * L.s)),
  };
}

const toPx = (L, wx, wy) => ({ x: R(L.x + wx / L.s), y: R(L.y + wy / L.s) });

// 별 하늘 (고정 무작위)
const SKY = Array.from({ length: 140 }, (_, i) => {
  const h = (n) => {
    const v = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  return { x: h(1), y: h(2), t: h(3) * 6, b: h(4) };
});

/** 직선 (a→b 방향)을 지도 사각형 끝까지 늘린 두 점 (픽셀). */
function spanLine(L, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const k = (WORLD.width * 1.5) / len;
  const p = toPx(L, ax - dx * k, ay - dy * k);
  const q = toPx(L, ax + dx * k, ay + dy * k);
  return { p, q };
}

/**
 * 천상계 화면. mouse: 버퍼 좌표의 커서(모바일은 마지막 탭).
 * planning: 라운드 시작 배치 (시간 정지) 이면 안내 문구가 달라진다.
 */
export function drawAstral(ctx, state, arena, W, H, now, mouse, mobile) {
  const L = astralLayout(W, H);
  const p = state.player;
  const sx = p.skills.x;
  ctx.fillStyle = 'rgba(7,5,18,0.94)';
  ctx.fillRect(0, 0, W, H);
  // 우주 배경
  for (const st of SKY) {
    ctx.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(now * 1.5 + st.t)) * st.b;
    rect(ctx, R(st.x * W), R(st.y * H), st.b > 0.8 ? 2 : 1, 1, st.b > 0.6 ? PAL.e : PAL.x);
  }
  ctx.globalAlpha = 1;
  // 맵 (바닥 캔버스를 줄여서) + 보랏빛
  if (arena) {
    ctx.save();
    ctx.imageSmoothingEnabled = true; // 줄인 지도는 부드럽게 (도트가 깨져 보이지 않게)
    ctx.globalAlpha = 0.6;
    ctx.drawImage(arena.canvas, WALL, WALL, arena.fw, arena.fh, L.x, L.y, L.size, L.size);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(70,40,150,0.32)';
  ctx.fillRect(L.x, L.y, L.size, L.size);
  ctx.strokeStyle = '#b8a2ff';
  ctx.globalAlpha = 0.6;
  ctx.strokeRect(L.x - 0.5, L.y - 0.5, L.size + 1, L.size + 1);
  ctx.globalAlpha = 1;

  // 우주 장벽 (세워진 것 / 조준 중)
  const d = state.divide;
  if (d) drawDivideLine(ctx, L, d.ax, d.ay, d.bx, d.by, now, 1);
  const aimW = astralToWorld(L, mouse.x, mouse.y);
  if (sx.divideMode === 2 && sx.divA) {
    drawDivideLine(ctx, L, sx.divA.x, sx.divA.y, aimW.x, aimW.y, now, 0.6);
    const a = toPx(L, sx.divA.x, sx.divA.y);
    ring(ctx, a.x, a.y, 3, PAL.L, 1);
  }

  // 적: 점 (엘리트·보스는 크게). 은신은 안 보인다
  for (const e of state.enemies) {
    if (e.hp <= 0 || e.gone || e.hidden) continue;
    const q = toPx(L, e.x, e.y);
    const big = e.type === 'boss' ? 3 : isBig(e) ? 2 : 1;
    const other = d && sideOf(d, e.x, e.y) !== sideOf(d, p.x, p.y);
    rect(ctx, q.x - (big >> 1), q.y - (big >> 1), big + 1, big + 1, other ? '#6b4a8a' : big > 1 ? PAL.y : PAL.r);
  }
  // 별: 별빛 반경, 다시 생기는 중이면 어둡게 + 진행 고리
  const rPx = STAR.passiveRadius / L.s;
  let hover = null;
  for (const st of state.stars ?? []) {
    const q = toPx(L, st.x, st.y);
    ctx.globalAlpha = 0.18;
    ring(ctx, q.x, q.y, R(rPx), '#d8c8ff', 1);
    ctx.globalAlpha = 1;
    const under = (aimW.x - st.x) ** 2 + (aimW.y - st.y) ** 2 <= STAR.pick ** 2;
    if (under) hover = st;
    if (st.reform > 0) {
      ctx.globalAlpha = 0.45;
      drawSprite(ctx, 'star_s', q.x, q.y);
      ctx.globalAlpha = 1;
    } else drawSprite(ctx, 'star_s', q.x, q.y - R(Math.sin(now * 3 + st.id) * 0.6), { white: under && Math.floor(now * 8) % 2 === 0 });
  }
  // 몸 (반투명) + 위치 고리
  const me = toPx(L, p.x, p.y);
  ctx.globalAlpha = 0.5 + 0.3 * Math.sin(now * 4);
  ring(ctx, me.x, me.y, 5, C.teal, 1);
  ctx.globalAlpha = 1;
  disc(ctx, me.x, me.y, 2, C.teal);

  // 커서: 별 모양 조준점 (회수할 별 위면 분홍)
  if (!mobile || sx.divideMode) {
    const col = sx.divideMode ? PAL.L : hover ? PAL.c : PAL.e;
    for (const [dx, dy] of [[0, -4], [0, 4], [-4, 0], [4, 0]]) line(ctx, mouse.x, mouse.y, mouse.x + dx, mouse.y + dy, col, 1);
    rect(ctx, mouse.x, mouse.y, 1, 1, PAL.w);
  }

  // 안내 + 남은 시간
  const stars = state.stars ?? [];
  const max = SKILLS.astralForm.stars[Math.max(1, sx.level) - 1];
  const free = max - stars.length - (state.starLocks ?? []).length;
  const title = state.planning ? '라운드 시작 · 별을 배치하세요' : '천상계 형상';
  text(ctx, title, W / 2, 6, { font: 'bold', align: 'center', color: '#d8c8ff' });
  const verb = mobile ? '탭' : '클릭';
  const ultReady = !state.planning && state.ultOrbs >= ultCost(p) && !state.divide;
  const hint = sx.divideMode === 1 ? `우주 장벽: 첫 점을 ${verb}` : sx.divideMode === 2 ? `우주 장벽: 둘째 점을 ${verb} (이 선으로 맵이 나뉜다)`
    : `${verb}: 별 놓기·회수  ·  남은 별 ${Math.max(0, free)}/${max}${ultReady && !mobile ? '  ·  우클릭: 우주 장벽' : ''}  ·  X: ${state.planning ? '전투 시작' : '돌아가기'}`;
  text(ctx, hint, W / 2, 18, { font: 'small', align: 'center', color: C.white });
  // 우주 장벽 버튼 (오브가 차 있으면)
  if (ultReady || sx.divideMode) {
    const D = astralDivideRect(W, H);
    const on = sx.divideMode > 0;
    ctx.fillStyle = on ? PAL.L : 'rgba(20,14,40,0.9)';
    ctx.fillRect(D.x, D.y, D.w, D.h);
    ctx.strokeStyle = PAL.L;
    ctx.strokeRect(D.x + 0.5, D.y + 0.5, D.w - 1, D.h - 1);
    text(ctx, on ? '장벽 취소' : mobile ? '우주 장벽' : '우주 장벽 (우클릭)', D.x + D.w / 2, D.y + D.h / 2, { font: 'small', align: 'center', base: 'middle', color: on ? '#0b1118' : C.white, shadow: false });
  }
  // 나가기 버튼
  const X = astralExitRect(W, H);
  const hov = inRect(X, mouse.x, mouse.y);
  ctx.fillStyle = hov ? '#b8a2ff' : 'rgba(20,14,40,0.9)';
  ctx.fillRect(X.x, X.y, X.w, X.h);
  ctx.strokeStyle = '#b8a2ff';
  ctx.strokeRect(X.x + 0.5, X.y + 0.5, X.w - 1, X.h - 1);
  text(ctx, state.planning ? '전투 시작 (X)' : '돌아가기 (X)', X.x + X.w / 2, X.y + X.h / 2, { font: 'bold', align: 'center', base: 'middle', color: hov ? '#0b1118' : C.white, shadow: false });
  if (!state.planning) {
    const k = Math.max(0, p.astral) / Math.max(0.01, p.astralMax ?? 1.5);
    rect(ctx, L.x, L.y + L.size + 6, L.size, 3, '#1a1430');
    rect(ctx, L.x, L.y + L.size + 6, R(L.size * k), 3, '#b8a2ff');
  }
}

/** 우주 장벽 선: 지도 끝까지 이어진 빛 + 흔들리는 별가루. */
function drawDivideLine(ctx, L, ax, ay, bx, by, now, alpha) {
  const { p, q } = spanLine(L, ax, ay, bx, by);
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.x, L.y, L.size, L.size);
  ctx.clip();
  ctx.globalAlpha = 0.35 * alpha;
  line(ctx, p.x, p.y, q.x, q.y, '#8f6cff', 5);
  ctx.globalAlpha = 0.9 * alpha;
  line(ctx, p.x, p.y, q.x, q.y, '#e9ddff', 1);
  ctx.restore();
  ctx.globalAlpha = 1;
}
