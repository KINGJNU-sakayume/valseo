// 절차적 픽셀 바닥(타일·이음새·금속판·통풍구·라디아나이트 균열·사이트 마킹) + 경계 벽.
// 결정적 해시를 써서 매번 같은 맵이 나온다. 데칼(그을음·탄피)은 이 캔버스에 직접 칠한다.
import { WORLD } from '../data/balance.js';
import { C } from './palette.js';
import { VIEW, FONTS } from './pixel.js';

export const WALL = 26; // 버퍼 px, 바닥 바깥 벽 두께
const TILE = 16;

const hash = (x, y, s = 0) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

export function buildArena() {
  const fw = Math.round(WORLD.width / VIEW.worldPerPx);
  const fh = Math.round(WORLD.height / VIEW.worldPerPx);
  const canvas = document.createElement('canvas');
  canvas.width = fw + WALL * 2;
  canvas.height = fh + WALL * 2;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // 벽
  ctx.fillStyle = C.wallDark;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = C.wallFace;
  ctx.fillRect(4, 4, canvas.width - 8, canvas.height - 8);
  for (let x = 8; x < canvas.width - 8; x += 24) {
    ctx.fillStyle = C.wallDark;
    ctx.fillRect(x, 6, 1, WALL - 10);
    ctx.fillRect(x, canvas.height - WALL + 4, 1, WALL - 10);
  }
  for (let y = 8; y < canvas.height - 8; y += 24) {
    ctx.fillStyle = C.wallDark;
    ctx.fillRect(6, y, WALL - 10, 1);
    ctx.fillRect(canvas.width - WALL + 4, y, WALL - 10, 1);
  }
  ctx.fillStyle = C.wallTop;
  ctx.fillRect(4, 4, canvas.width - 8, 3);
  // 벽 안쪽 경고 띠
  ctx.save();
  ctx.translate(WALL, WALL);

  // 타일
  for (let ty = 0; ty < fh; ty += TILE) {
    for (let tx = 0; tx < fw; tx += TILE) {
      const i = tx / TILE;
      const j = ty / TILE;
      const h = hash(i, j);
      ctx.fillStyle = (i + j) % 2 ? C.floor : C.floor2;
      ctx.fillRect(tx, ty, TILE, TILE);
      if (h < 0.1) {
        // 금속판 + 리벳
        ctx.fillStyle = '#26313d';
        ctx.fillRect(tx + 2, ty + 2, TILE - 4, TILE - 4);
        ctx.fillStyle = '#34414f';
        ctx.fillRect(tx + 2, ty + 2, TILE - 4, 1);
        ctx.fillStyle = '#4a5767';
        for (const [rx, ry] of [[3, 3], [12, 3], [3, 12], [12, 12]]) ctx.fillRect(tx + rx, ty + ry, 1, 1);
      } else if (h < 0.13) {
        // 통풍구
        ctx.fillStyle = C.seam;
        ctx.fillRect(tx + 3, ty + 4, TILE - 6, TILE - 8);
        ctx.fillStyle = '#2a3542';
        for (let k = 0; k < 4; k++) ctx.fillRect(tx + 4, ty + 5 + k * 2, TILE - 8, 1);
      }
      // 이음새
      ctx.fillStyle = C.seam;
      ctx.fillRect(tx, ty, TILE, 1);
      ctx.fillRect(tx, ty, 1, TILE);
      // 잔 노이즈
      for (let n = 0; n < 6; n++) {
        const px = Math.floor(hash(i, j, n + 1) * TILE);
        const py = Math.floor(hash(i, j, n + 11) * TILE);
        ctx.fillStyle = hash(i, j, n + 21) < 0.5 ? C.floorDark : '#222c37';
        ctx.fillRect(tx + px, ty + py, 1, 1);
      }
    }
  }

  // 라디아나이트 균열 (청록 발광 무작위 보행)
  for (let c = 0; c < 26; c++) {
    let x = Math.floor(hash(c, 3, 9) * fw);
    let y = Math.floor(hash(c, 7, 9) * fh);
    const len = 20 + Math.floor(hash(c, 1, 9) * 40);
    for (let s = 0; s < len; s++) {
      ctx.fillStyle = '#2a1a44';
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillStyle = s % 5 === 0 ? C.crack : '#5b3a8a';
      ctx.fillRect(x, y, 1, 1);
      const r = hash(c, s, 5);
      if (r < 0.4) x++;
      else if (r < 0.6) x--;
      if (hash(c, s, 6) < 0.6) y++;
      else y--;
    }
  }

  // 사이트 마킹 A/B + 중앙 스폰 원
  const mark = (letter, wx, wy) => {
    const x = wx / VIEW.worldPerPx;
    const y = wy / VIEW.worldPerPx;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = C.gold;
    ctx.font = FONTS.huge.replace('33px', '66px');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, Math.round(x), Math.round(y));
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = C.gold;
    ctx.strokeRect(Math.round(x - 60), Math.round(y - 60), 120, 120);
    ctx.globalAlpha = 1;
  };
  mark('A', WORLD.width * 0.25, WORLD.height * 0.28);
  mark('B', WORLD.width * 0.75, WORLD.height * 0.72);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = C.red;
  const cx = fw / 2;
  const cy = fh / 2;
  for (let a = 0; a < 64; a++) {
    if (a % 4 === 3) continue;
    const t = (a / 64) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(t) * 46), Math.round(cy + Math.sin(t) * 46), 2, 2);
  }
  ctx.globalAlpha = 1;

  // 바닥 가장자리 경고 띠
  for (let x = 0; x < fw; x += 1) {
    for (let k = 0; k < 4; k++) {
      const on = Math.floor((x + k) / 4) % 2 === 0;
      ctx.fillStyle = on ? '#6b5320' : '#15191e';
      ctx.fillRect(x, k, 1, 1);
      ctx.fillRect(x, fh - 1 - k, 1, 1);
    }
  }
  for (let y = 0; y < fh; y += 1) {
    for (let k = 0; k < 4; k++) {
      const on = Math.floor((y + k) / 4) % 2 === 0;
      ctx.fillStyle = on ? '#6b5320' : '#15191e';
      ctx.fillRect(k, y, 1, 1);
      ctx.fillRect(fw - 1 - k, y, 1, 1);
    }
  }
  ctx.restore();
  return { canvas, ctx, fw, fh, decals: 0 };
}

const MAX_DECALS = 900; // 넘으면 바닥을 새로 깔지 않고 더 칠하지 않는다

/** 그을음(디더링 원) 데칼. 월드 좌표. */
export function scorch(arena, wx, wy, r, color = 'rgba(0,0,0,0.35)') {
  if (arena.decals++ > MAX_DECALS) return;
  const ctx = arena.ctx;
  const x = Math.round(wx / VIEW.worldPerPx) + WALL;
  const y = Math.round(wy / VIEW.worldPerPx) + WALL;
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      if ((dx + dy) % 2 === 0 || dx * dx + dy * dy < (r * r) / 3) ctx.fillRect(x + dx, y + dy, 1, 1);
    }
  }
}

/** 작은 점 데칼 (탄피 등). */
export function speck(arena, wx, wy, color) {
  if (arena.decals++ > MAX_DECALS) return;
  arena.ctx.fillStyle = color;
  arena.ctx.fillRect(Math.round(wx / VIEW.worldPerPx) + WALL, Math.round(wy / VIEW.worldPerPx) + WALL, 2, 1);
}
