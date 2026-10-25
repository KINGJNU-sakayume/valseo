// 저해상도 픽셀 버퍼와 선명한 픽셀 도형. 모든 좌표는 버퍼 픽셀 단위(정수로 스냅).

// 화면 높이가 대략 이 픽셀 수가 되도록 정수 배율을 고른다.
export const VIEW = { targetHeight: 360, minScale: 2, worldPerPx: 1.5, mobileHeight: 300 };

/**
 * 화면(기기 픽셀) 높이 → 버퍼 1px 당 기기 픽셀 수.
 * 데스크톱은 정수 배율. 모바일은 화면이 작아 글자가 읽히도록 버퍼 높이를 mobileHeight 로 고정한다
 * (고해상도 폰이라 소수 배율의 픽셀 불균일은 거의 보이지 않는다).
 */
export function pixelScale(screenH, mobile = false) {
  if (mobile) return screenH / VIEW.mobileHeight;
  return Math.max(VIEW.minScale, Math.round(screenH / VIEW.targetHeight));
}

export function createBuffer() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, w: 0, h: 0 };
}

export function resizeBuffer(buf, w, h) {
  if (buf.w === w && buf.h === h) return;
  buf.canvas.width = buf.w = w;
  buf.canvas.height = buf.h = h;
  buf.ctx.imageSmoothingEnabled = false;
}

const R = Math.round;

export function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(R(x), R(y), R(w), R(h));
}

/** 계단식 픽셀 원 (안티앨리어싱 없음). color 는 색 문자열 또는 패턴. */
export function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  cx = R(cx);
  cy = R(cy);
  r = Math.max(0, R(r));
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8));
    ctx.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
  }
}

/** 픽셀 원 테두리. */
export function ring(ctx, cx, cy, r, color, thick = 1) {
  ctx.fillStyle = color;
  cx = R(cx);
  cy = R(cy);
  r = R(r);
  const inner = Math.max(0, r - thick);
  for (let dy = -r; dy <= r; dy++) {
    const o = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8));
    const i2 = inner * inner - dy * dy;
    const i = i2 > 0 ? Math.floor(Math.sqrt(i2 + inner * 0.8)) : -1;
    if (i < 0) ctx.fillRect(cx - o, cy + dy, o * 2 + 1, 1);
    else {
      ctx.fillRect(cx - o, cy + dy, o - i, 1);
      ctx.fillRect(cx + i + 1, cy + dy, o - i, 1);
    }
  }
}

/** 브레젠험 직선 (두께는 정사각 스탬프). */
export function line(ctx, x0, y0, x1, y1, color, thick = 1) {
  ctx.fillStyle = color;
  x0 = R(x0);
  y0 = R(y0);
  x1 = R(x1);
  y1 = R(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const h = Math.floor(thick / 2);
  for (let n = 0; n < 4000; n++) {
    ctx.fillRect(x0 - h, y0 - h, thick, thick);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** 점선 직선 (on/off 픽셀 수). */
export function dashed(ctx, x0, y0, x1, y1, color, on = 3, off = 3) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  ctx.fillStyle = color;
  for (let t = 0; t < len; t += on + off) {
    for (let k = 0; k < on && t + k < len; k++) ctx.fillRect(R(x0 + ux * (t + k)), R(y0 + uy * (t + k)), 1, 1);
  }
}

/**
 * 발로란트풍 패널: 단색 바탕 + 1px 테두리 + 모서리 컷.
 * accent 가 있으면 왼쪽에 굵은 색 띠.
 */
export function panel(ctx, x, y, w, h, { fill = '#0f1923', edge = '#2e3d4f', accent = null, cut = 3 } = {}) {
  x = R(x);
  y = R(y);
  w = R(w);
  h = R(h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + cut, y, w - cut, h);
  ctx.fillRect(x, y + cut, cut, h - cut);
  for (let i = 0; i < cut; i++) ctx.fillRect(x + cut - i, y + i, 1, 1);
  ctx.fillStyle = edge;
  ctx.fillRect(x + cut, y, w - cut, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y + cut, 1, h - cut);
  ctx.fillRect(x + w - 1, y, 1, h);
  for (let i = 0; i < cut; i++) ctx.fillRect(x + cut - 1 - i, y + i + 1, 1, 1);
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(x + 1, y + cut + 1, 2, h - cut - 2);
  }
}

/** 텍스트 (픽셀 폰트). align: left/center/right, base: top/middle/bottom. */
export function text(ctx, str, x, y, { color = '#ece8e1', font = 'body', align = 'left', base = 'top', shadow = true } = {}) {
  ctx.font = FONTS[font];
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(str, R(x) + 1, R(y) + 1);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, R(x), R(y));
}

export function textWidth(ctx, str, font = 'body') {
  ctx.font = FONTS[font];
  return ctx.measureText(str).width;
}

export const FONTS = {
  small: '9px Galmuri9, monospace',
  body: '11px Galmuri11, monospace',
  bold: 'bold 11px "Galmuri11 Bold", Galmuri11, monospace',
  big: '22px Galmuri11, monospace',
  bigBold: 'bold 22px "Galmuri11 Bold", Galmuri11, monospace',
  huge: 'bold 33px "Galmuri11 Bold", Galmuri11, monospace',
};

/** 공백 단위 줄바꿈. 그린 줄 수를 돌려준다. */
export function wrap(ctx, str, x, y, maxW, lineH, opts = {}) {
  const words = str.split(' ');
  let lineStr = '';
  let n = 0;
  const max = opts.maxLines ?? Infinity;
  for (const w of words) {
    const next = lineStr ? `${lineStr} ${w}` : w;
    if (textWidth(ctx, next, opts.font) > maxW && lineStr) {
      if (n === max - 1) {
        text(ctx, `${lineStr}…`, x, y + n * lineH, opts); // 줄 수 제한: 말줄임
        return n + 1;
      }
      text(ctx, lineStr, x, y + n * lineH, opts);
      n++;
      lineStr = w;
    } else lineStr = next;
  }
  if (lineStr) {
    text(ctx, lineStr, x, y + n * lineH, opts);
    n++;
  }
  return n;
}
