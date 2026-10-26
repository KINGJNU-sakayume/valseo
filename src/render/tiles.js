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

// 맵별 테마 (설계 27장): 바닥 질감·색, 벽 윗면·앞면·테두리. 어둠 조명이 위에 깔리므로 조금 밝게 잡는다.
// 어센트: 이탈리아풍 광장 - 따뜻한 돌바닥(자갈), 크림색 석벽 / 바인드: 사막 도시 - 큰 사암 판석과 청록 모자이크, 황토 벽
// 헤이븐: 산사 - 나무 마루, 짙은 기와 지붕, 흰 회벽과 붉은 띠·금 장식
export const THEMES = {
  ascent: { floor: ['#3b342e', '#383029'], seam: '#231d18', dark: '#2a231d', light: '#4a4138', style: 'cobble',
    top: '#8b7d6b', topDots: ['#7d705f', '#9a8c78'], face: '#5d4d3e', faceLine: '#3e3228', edge: '#c4b59c', frame: '#2b231c', accent: '#4f7a3a' },
  bind: { floor: ['#4a3b27', '#463825'], seam: '#2c2216', dark: '#352a1b', light: '#5a4830', style: 'slab',
    top: '#a07a4a', topDots: ['#8e6b40', '#b38a56'], face: '#6e4f2e', faceLine: '#4a341e', edge: '#d8ab6c', frame: '#2e2214', accent: '#2f8aa0' },
  haven: { floor: ['#3f2d22', '#3a2a20'], seam: '#22170f', dark: '#2c1f17', light: '#4e392b', style: 'plank',
    top: '#4c525c', topDots: ['#3e434b', '#5c626c'], face: '#7e2e24', faceLine: '#561d16', edge: '#e2dacb', frame: '#24160f', accent: '#d9a441', plaster: '#cdc5b6' },
};

export function buildArena(mapId = 'ascent') {
  const T = THEMES[mapId] ?? THEMES.ascent;
  const fw = Math.round(WORLD.width / VIEW.worldPerPx);
  const fh = Math.round(WORLD.height / VIEW.worldPerPx);
  const canvas = document.createElement('canvas');
  canvas.width = fw + WALL * 2;
  canvas.height = fh + WALL * 2;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // 바깥 벽: 테마 색의 석벽 + 벽돌 줄
  ctx.fillStyle = T.frame;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = T.face;
  ctx.fillRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.fillStyle = T.faceLine;
  for (let y = 8; y < canvas.height - 4; y += 6) {
    ctx.fillRect(4, y, WALL - 6, 1);
    ctx.fillRect(canvas.width - WALL + 2, y, WALL - 6, 1);
  }
  for (let x = 8; x < canvas.width - 4; x += 6) {
    ctx.fillRect(x, 4, 1, WALL - 6);
    ctx.fillRect(x, canvas.height - WALL + 2, 1, WALL - 6);
  }
  ctx.fillStyle = T.top;
  ctx.fillRect(4, 4, canvas.width - 8, 4);
  ctx.save();
  ctx.translate(WALL, WALL);

  // 바닥
  for (let ty = 0; ty < fh; ty += TILE) {
    for (let tx = 0; tx < fw; tx += TILE) {
      const i = tx / TILE;
      const j = ty / TILE;
      const h = hash(i, j);
      ctx.fillStyle = T.floor[(i + j) % 2];
      ctx.fillRect(tx, ty, TILE, TILE);
      if (T.style === 'cobble') {
        // 자갈: 타일 하나에 둥근 돌 네 개, 윗변이 밝고 아랫변이 어둡다
        for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
          const sh = Math.floor(hash(i * 2 + ox, j * 2 + oy, 3) * 2);
          const x = tx + ox + (oy ? 4 * ((j + ox / 8) % 2) : 0);
          ctx.fillStyle = sh ? T.light : T.floor[(i + j + 1) % 2];
          ctx.fillRect(x + 1, ty + oy + 1, 6, 6);
          ctx.fillStyle = T.light;
          ctx.fillRect(x + 2, ty + oy + 1, 4, 1);
          ctx.fillStyle = T.dark;
          ctx.fillRect(x + 1, ty + oy + 7, 6, 1);
        }
        if (h < 0.04) {
          // 틈새에 자란 이끼
          ctx.fillStyle = T.accent;
          for (let k = 0; k < 5; k++) ctx.fillRect(tx + Math.floor(hash(i, j, k + 70) * 14), ty + Math.floor(hash(i, j, k + 80) * 14), 1, 1);
        }
      } else if (T.style === 'slab') {
        // 큰 사암 판석 (2x2 타일 하나), 가끔 청록 모자이크 타일
        const big = (i % 2 === 0 && j % 2 === 0);
        if (big) {
          ctx.fillStyle = T.light;
          ctx.fillRect(tx + 1, ty + 1, TILE * 2 - 2, 1);
        }
        if (hash(Math.floor(i / 2), Math.floor(j / 2), 7) < 0.035) {
          ctx.fillStyle = T.accent;
          ctx.fillRect(tx + 2, ty + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = '#8fd6e0';
          for (let k = 0; k < 3; k++) ctx.fillRect(tx + 4 + k * 3, ty + 4 + k * 3, 2, 2);
          ctx.fillStyle = T.seam;
          ctx.fillRect(tx + 7, ty + 2, 1, TILE - 4);
          ctx.fillRect(tx + 2, ty + 7, TILE - 4, 1);
        }
        for (let n = 0; n < 4; n++) {
          ctx.fillStyle = T.dark;
          ctx.fillRect(tx + Math.floor(hash(i, j, n + 30) * TILE), ty + Math.floor(hash(i, j, n + 40) * TILE), 2, 1);
        }
      } else {
        // 나무 마루: 가로 널판 (4px), 널판 끝이 엇갈린다
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = hash(i, j * 4 + k, 5) < 0.5 ? T.floor[0] : T.light;
          ctx.fillRect(tx, ty + k * 4, TILE, 3);
          ctx.fillStyle = T.seam;
          ctx.fillRect(tx, ty + k * 4 + 3, TILE, 1);
          if ((i + k) % 3 === 0) ctx.fillRect(tx + ((k * 5) % TILE), ty + k * 4, 1, 3);
          ctx.fillStyle = T.dark;
          ctx.fillRect(tx + Math.floor(hash(i, j, k + 50) * TILE), ty + k * 4 + 1, 2, 1);
        }
      }
      // 이음새 (자갈·판석)
      if (T.style !== 'plank') {
        ctx.fillStyle = T.seam;
        if (T.style === 'cobble' || j % 2 === 0) ctx.fillRect(tx, ty, TILE, 1);
        if (T.style === 'cobble' || i % 2 === 0) ctx.fillRect(tx, ty, 1, TILE);
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
  // 벽 블록: 이웃이 벽이면 이어 그리고, 바닥 쪽 테두리만 밝게. 아래가 바닥이면 높은 앞면(벽돌·띠)과 긴 그림자를 보여 준다.
  const isWall = (gx, gy) => def.grid[gy]?.[gx] === '#';
  def.grid.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      if (row[gx] !== '#') continue;
      const x = cx0(gx);
      const y = cx0(gy);
      const w = cx0(gx + 1) - x;
      const h = cx0(gy + 1) - y;
      const front = !isWall(gx, gy + 1) && gy + 1 < def.grid.length;
      const fh2 = front ? Math.round(h * 0.42) : 0;
      // 바닥에 드리운 그림자 (오른쪽 아래로, 점점 옅게)
      if (front) {
        for (let k = 0; k < 8; k++) {
          ctx.fillStyle = `rgba(0,0,0,${0.42 - k * 0.05})`;
          ctx.fillRect(x + 2, y + h + k, w, 1);
        }
      }
      if (!isWall(gx + 1, gy) && gx + 1 < row.length) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x + w, y + 3, 3, h);
      }
      // 윗면
      ctx.fillStyle = T.top;
      ctx.fillRect(x, y, w, h - fh2);
      // 윗면 무늬: 어센트 석판, 바인드 회반죽 금, 헤이븐 기와 줄 (월드 좌표에 맞춰 이웃 블록과 이어진다)
      const th = h - fh2;
      ctx.fillStyle = T.topDots[0];
      if (T.style === 'cobble') {
        for (let yy = y - (y % 10); yy < y + th; yy += 10) {
          if (yy >= y) ctx.fillRect(x, yy, w, 1);
          const off = (yy / 10) % 2 ? 7 : 0;
          for (let xx = x - (x % 14) + off; xx < x + w; xx += 14) if (xx >= x) ctx.fillRect(xx, Math.max(y, yy), 1, Math.min(10, y + th - Math.max(y, yy)));
        }
      } else if (T.style === 'plank') {
        for (let yy = y - (y % 5); yy < y + th; yy += 5) {
          if (yy < y) continue;
          ctx.fillStyle = T.topDots[0];
          ctx.fillRect(x, yy, w, 1);
          ctx.fillStyle = T.topDots[1];
          for (let xx = x - (x % 6) + ((yy / 5) % 2) * 3; xx < x + w; xx += 6) if (xx >= x) ctx.fillRect(xx, yy + 1, 2, 1);
        }
      }
      for (let k = 0; k < 10; k++) {
        const px = Math.floor(hash(gx, gy, k + 40) * (w - 2));
        const py = Math.floor(hash(gx, gy, k + 50) * Math.max(1, th - 1));
        ctx.fillStyle = T.topDots[k % 2];
        ctx.fillRect(x + px, y + py, T.style === 'slab' ? 3 : 2, 1);
        if (T.style === 'slab' && k < 4) ctx.fillRect(x + px + 2, y + py + 1, 2, 1);
      }
      // 앞면: 벽돌(어센트·바인드) 또는 붉은 띠와 흰 회벽(헤이븐)
      if (front) {
        const fy = y + h - fh2;
        ctx.fillStyle = T.face;
        ctx.fillRect(x, fy, w, fh2);
        ctx.fillStyle = T.faceLine;
        if (T.style === 'plank') {
          ctx.fillStyle = T.plaster;
          ctx.fillRect(x, fy, w, Math.round(fh2 * 0.35));
          ctx.fillStyle = T.accent;
          ctx.fillRect(x, fy + Math.round(fh2 * 0.35), w, 2);
          ctx.fillStyle = T.faceLine;
          for (let k = 3; k < w; k += 8) ctx.fillRect(x + k, fy + Math.round(fh2 * 0.35) + 3, 1, fh2);
        } else {
          for (let k = fy + 4; k < y + h; k += 5) ctx.fillRect(x, k, w, 1);
          for (let r = 0, k = fy; k < y + h; k += 5, r++) {
            for (let q = (r % 2) * 6; q < w; q += 12) ctx.fillRect(x + q, k, 1, 4);
          }
        }
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, y + h - 2, w, 2);
      }
      // 바닥과 맞닿은 테두리
      ctx.fillStyle = T.edge;
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
