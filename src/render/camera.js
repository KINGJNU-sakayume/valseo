// 카메라: 월드 좌표(좌상단 x, y) + 픽셀 버퍼 크기. 버퍼 1px = S 월드 단위, 화면 px 픽셀 = 버퍼 1px.
import { VIEW } from './pixel.js';

const LEAD = { amount: 0.16, max: 70, smooth: 10 }; // 조준 방향으로 화면을 살짝 앞당김
const SCOPE = { amount: 0.34, max: 170 }; // 오퍼레이터를 들고 멈춰 있으면 더 멀리 (줌 대용)

export function createCamera() {
  return { x: 0, y: 0, bw: 0, bh: 0, S: VIEW.worldPerPx, px: 2, leadX: 0, leadY: 0, shakeX: 0, shakeY: 0 };
}

/** 플레이어 + 조준 방향 리드 + 흔들림. frameDt 는 실제 프레임 시간. scope: 오퍼레이터 정지 조준 (더 멀리 앞당김). */
export function follow(cam, player, aim, frameDt, scope = false) {
  const L = scope ? SCOPE : LEAD;
  let lx = (aim.x - player.x) * L.amount;
  let ly = (aim.y - player.y) * L.amount;
  const d = Math.hypot(lx, ly);
  if (d > L.max) {
    lx *= L.max / d;
    ly *= L.max / d;
  }
  const k = Math.min(1, frameDt * LEAD.smooth);
  cam.leadX += (lx - cam.leadX) * k;
  cam.leadY += (ly - cam.leadY) * k;
  cam.x = player.x + cam.leadX - (cam.bw * cam.S) / 2 + cam.shakeX * cam.S;
  cam.y = player.y + cam.leadY - (cam.bh * cam.S) / 2 + cam.shakeY * cam.S;
}

/** 화면(CSS px) → 월드 */
export function screenToWorld(cam, sx, sy) {
  return { x: cam.x + (sx / cam.px) * cam.S, y: cam.y + (sy / cam.px) * cam.S };
}

/** 월드 → 버퍼 px */
export const bx = (cam, wx) => (wx - cam.x) / cam.S;
export const by = (cam, wy) => (wy - cam.y) / cam.S;
