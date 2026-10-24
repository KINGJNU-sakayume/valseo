import { screenToWorld } from '../render/camera.js';

const MOVE_KEYS = { KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right' };
const SKILL_KEYS = { KeyC: 'c', KeyQ: 'q', KeyE: 'e', KeyX: 'x' };

export function createInput(target) {
  const held = new Set();
  const pressed = new Set(); // 다음 틱까지 남는 엣지 입력
  const mouse = { x: 0, y: 0 };
  const listeners = new Map();
  let clickHandler = null;

  target.addEventListener('keydown', (ev) => {
    if (!held.has(ev.code)) {
      pressed.add(ev.code);
      listeners.get(ev.code)?.();
      listeners.get('*')?.(ev.code);
    }
    held.add(ev.code);
    if (MOVE_KEYS[ev.code] || SKILL_KEYS[ev.code]) ev.preventDefault();
  });
  target.addEventListener('keyup', (ev) => held.delete(ev.code));
  target.addEventListener('blur', () => held.clear());
  target.addEventListener('mousedown', (ev) => {
    if (ev.button === 0) clickHandler?.(ev.clientX, ev.clientY);
  });
  target.addEventListener('mousemove', (ev) => {
    mouse.x = ev.clientX;
    mouse.y = ev.clientY;
  });

  return {
    mouse,
    /** 특정 키가 새로 눌렸을 때 호출 (UI용: 재시작 등). */
    onPress(code, fn) {
      listeners.set(code, fn);
    },
    /** 모든 키의 새 입력을 받는다 (UI용: 숫자 키 선택 등). */
    onAnyPress(fn) {
      listeners.set('*', fn);
    },
    onClick(fn) {
      clickHandler = fn;
    },
    /** 4장 input 형식으로 변환. 엣지 입력은 한 번 읽으면 소모된다. */
    sample(cam) {
      const keys = {};
      for (const [code, k] of Object.entries(SKILL_KEYS)) {
        keys[k] = k === 'q' ? held.has(code) : pressed.has(code);
      }
      pressed.clear();
      return {
        move: {
          x: (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0),
          y: (held.has('KeyS') ? 1 : 0) - (held.has('KeyW') ? 1 : 0),
        },
        aim: screenToWorld(cam, mouse.x, mouse.y),
        keys,
      };
    },
  };
}
