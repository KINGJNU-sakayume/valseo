// 절차적 픽셀 바닥(타일·이음새·금속판·통풍구·라디아나이트 균열) + 맵(벽 블록·사이트·게이트·스파이크·텔레포터·스위치).
// 결정적 해시를 써서 같은 맵은 매번 같게 나온다. 데칼(그을음·탄피)은 이 캔버스에 직접 칠한다.
// 철문 셔터와 텔레포터 빛은 상태에 따라 바뀌므로 renderer.js 가 매 프레임 그린다.
import { WORLD } from '../data/balance.js';
import { MAPS, MAP } from '../data/maps.js';
import { C } from './palette.js';
import { VIEW, FONTS } from './pixel.js';

export const WALL = 26; // 버퍼 px, 바닥 바깥 벽 두께
const TILE = 16;

const hash = (x, y, s = 0) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

export function buildArena(mapId = 'ascent') {
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

  // 맵: 사이트 바닥 색, 벽 블록, 게이트, 스파이크, 텔레포터·스위치 패드, 문틀
  const def = MAPS[mapId];
  const cellPx = MAP.cell / VIEW.worldPerPx;
  const cx0 = (gx) => Math.round(gx * cellPx);
  const siteCells = {};
  def.grid.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      const ch = row[gx];
      const x = cx0(gx);
      const y = cx0(gy);
      const w = cx0(gx + 1) - x;
      const h = cx0(gy + 1) - y;
      if ('ABCS'.includes(ch)) {
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = C.gold;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        if (ch !== 'S') (siteCells[ch] ??= []).push([x + w / 2, y + h / 2]);
      }
      if (ch === 'S') {
        // 스파이크 지점: 붉은 마름모
        const mx = x + w / 2;
        const my = y + h / 2;
        for (let k = 0; k <= 8; k++) {
          ctx.fillStyle = k === 8 ? '#ff8a93' : C.redDark;
          ctx.fillRect(Math.round(mx - (8 - k)), Math.round(my - k), (8 - k) * 2 + 1, 1);
          ctx.fillRect(Math.round(mx - (8 - k)), Math.round(my + k), (8 - k) * 2 + 1, 1);
        }
      } else if (ch === 'G') {
        // 게이트: 어두운 통풍 격자 + 붉은 테
        ctx.fillStyle = '#0b0f14';
        ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
        ctx.fillStyle = '#3a1018';
        for (let k = y + 9; k < y + h - 9; k += 4) ctx.fillRect(x + 9, k, w - 18, 1);
        ctx.strokeStyle = C.redDark;
        ctx.strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
      } else if ('TtUu'.includes(ch)) {
        // 텔레포터 패드 (빛은 renderer)
        ctx.fillStyle = '#1d1430';
        ctx.fillRect(x + 12, y + 12, w - 24, h - 24);
        ctx.strokeStyle = '#6a3fc0';
        ctx.strokeRect(x + 12.5, y + 12.5, w - 25, h - 25);
      } else if (ch === 's') {
        // 문 스위치 패드
        ctx.fillStyle = '#2a2412';
        ctx.fillRect(x + 20, y + 20, w - 40, h - 40);
        ctx.strokeStyle = C.gold;
        ctx.strokeRect(x + 20.5, y + 20.5, w - 41, h - 41);
      } else if (ch === 'D') {
        // 문틀 (셔터는 renderer)
        ctx.fillStyle = '#3a4757';
        ctx.fillRect(x, y, 3, h);
        ctx.fillRect(x + w - 3, y, 3, h);
      }
    }
  });
  // 벽 블록: 이웃이 벽이면 이어 그리고, 바닥 쪽 테두리만 밝게. 아래가 바닥이면 앞면(어두운 벽돌)을 보여 준다.
  const isWall = (gx, gy) => def.grid[gy]?.[gx] === '#';
  def.grid.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      if (row[gx] !== '#') continue;
      const x = cx0(gx);
      const y = cx0(gy);
      const w = cx0(gx + 1) - x;
      const h = cx0(gy + 1) - y;
      const front = !isWall(gx, gy + 1) && gy + 1 < def.grid.length;
      const fh2 = front ? Math.round(h * 0.28) : 0;
      // 윗면
      ctx.fillStyle = '#3a4757';
      ctx.fillRect(x, y, w, h - fh2);
      for (let k = 0; k < 10; k++) {
        const px = Math.floor(hash(gx, gy, k + 40) * w);
        const py = Math.floor(hash(gx, gy, k + 50) * (h - fh2));
        ctx.fillStyle = hash(gx, gy, k + 60) < 0.5 ? '#334050' : '#425063';
        ctx.fillRect(x + px, y + py, 2, 1);
      }
      // 앞면
      if (front) {
        ctx.fillStyle = C.wallFace;
        ctx.fillRect(x, y + h - fh2, w, fh2);
        ctx.fillStyle = C.wallDark;
        for (let k = y + h - fh2 + 4; k < y + h; k += 5) ctx.fillRect(x, k, w, 1);
        for (let k = 0; k < w; k += 12) ctx.fillRect(x + k + ((Math.floor((y + h) / 5)) % 2) * 6, y + h - fh2, 1, fh2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x, y + h, w, 4);
      }
      // 바닥과 맞닿은 테두리
      ctx.fillStyle = '#6b7c90';
      if (!isWall(gx, gy - 1) && gy > 0) ctx.fillRect(x, y, w, 2);
      if (!isWall(gx - 1, gy) && gx > 0) ctx.fillRect(x, y, 2, h - fh2);
      if (!isWall(gx + 1, gy) && gx + 1 < row.length) ctx.fillRect(x + w - 2, y, 2, h - fh2);
      if (front) ctx.fillRect(x, y + h - fh2 - 1, w, 1);
    }
  });
  // 사이트 글자
  for (const [L, cells] of Object.entries(siteCells)) {
    // 사이트 왼쪽 위 (가운데 스파이크와 겹치지 않게)
    const mx = Math.min(...cells.map((c) => c[0])) + cellPx * 0.5;
    const my = Math.min(...cells.map((c) => c[1])) + cellPx * 0.5;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = C.gold;
    ctx.font = FONTS.huge.replace('33px', '66px');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(L, Math.round(mx), Math.round(my));
    ctx.globalAlpha = 1;
  }

  ctx.restore();
  return { canvas, ctx, fw, fh, decals: 0, mapId };
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
