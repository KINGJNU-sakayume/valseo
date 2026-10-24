export function createCamera() {
  return { x: 0, y: 0, w: 0, h: 0 };
}

/** 플레이어를 화면 중앙에 둔다. */
export function follow(cam, target, w, h) {
  cam.w = w;
  cam.h = h;
  cam.x = target.x - w / 2;
  cam.y = target.y - h / 2;
}

export function screenToWorld(cam, sx, sy) {
  return { x: sx + cam.x, y: sy + cam.y };
}

export function worldToScreen(cam, wx, wy) {
  return { x: wx - cam.x, y: wy - cam.y };
}
