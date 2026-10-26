import { screenToWorld } from '../render/camera.js';

const MOVE_KEYS = { KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right' };
const SKILL_KEYS = { KeyC: 'c', KeyQ: 'q', KeyE: 'e', KeyX: 'x' };
const JOY = { radius: 28, dead: 4 }; // 버퍼 px. 손가락이 반경 밖으로 나가면 조이스틱 중심이 따라온다

/**
 * 키보드·마우스·터치 입력. 좌표는 전부 기기 픽셀(캔버스 픽셀) 단위.
 * 터치: onTouch 가 'move'(조이스틱), 'skill:<키>'(스킬 칸), 그 밖(UI가 처리)을 돌려준다.
 */
export function createInput(target) {
  const held = new Set();
  const pressed = new Set(); // 다음 틱까지 남는 엣지 입력
  const mouse = { x: 0, y: 0 };
  const listeners = new Map();
  let clickHandler = null;
  let touchHandler = null;
  let scale = 1; // 버퍼 1px 당 기기 픽셀 (조이스틱 반경 계산용)
  const touch = { joy: null, joyId: null, held: { c: 0, q: 0, e: 0, x: 0, u: 0, f: 0, m: 0 }, pressed: new Set(), skillOf: new Map() };
  const dpr = () => window.devicePixelRatio || 1;

  target.addEventListener('keydown', (ev) => {
    if (!held.has(ev.code)) {
      pressed.add(ev.code);
      listeners.get(ev.code)?.();
      listeners.get('*')?.(ev.code);
    }
    held.add(ev.code);
    if (MOVE_KEYS[ev.code] || SKILL_KEYS[ev.code] || ev.code === 'Tab' || ev.code === 'KeyF') ev.preventDefault();
  });
  target.addEventListener('keyup', (ev) => held.delete(ev.code));
  target.addEventListener('blur', () => {
    held.clear();
    endTouches();
  });

  target.addEventListener('pointerdown', (ev) => {
    const x = ev.clientX * dpr();
    const y = ev.clientY * dpr();
    if (ev.pointerType === 'mouse') {
      mouse.x = x;
      mouse.y = y;
      if (ev.button === 0) {
        pressed.add('Mouse0'); // 천상계 형상: 별 배치·회수 (아스트라)
        clickHandler?.(x, y);
      }
      if (ev.button === 2) pressed.add('Mouse2'); // 우클릭: 유틸
      return;
    }
    ev.preventDefault();
    const r = touchHandler?.(x, y);
    if (typeof r === 'string' && r.startsWith('skill:')) {
      const k = r.slice(6);
      touch.pressed.add(k);
      touch.held[k]++;
      touch.skillOf.set(ev.pointerId, k);
    } else if (r === 'move' && touch.joyId === null) {
      touch.joyId = ev.pointerId;
      touch.joy = { ox: x, oy: y, x, y };
    }
  }, { passive: false });

  target.addEventListener('contextmenu', (ev) => ev.preventDefault());

  target.addEventListener('pointermove', (ev) => {
    const x = ev.clientX * dpr();
    const y = ev.clientY * dpr();
    if (ev.pointerType === 'mouse') {
      mouse.x = x;
      mouse.y = y;
      return;
    }
    if (ev.pointerId !== touch.joyId) return;
    const j = touch.joy;
    j.x = x;
    j.y = y;
    // 떠다니는 조이스틱: 반경 밖으로 끌면 중심이 손가락을 따라온다
    const max = JOY.radius * scale;
    const dx = x - j.ox;
    const dy = y - j.oy;
    const d = Math.hypot(dx, dy);
    if (d > max) {
      j.ox = x - (dx / d) * max;
      j.oy = y - (dy / d) * max;
    }
  });

  const release = (ev) => {
    if (ev.pointerId === touch.joyId) {
      touch.joyId = null;
      touch.joy = null;
    }
    const k = touch.skillOf.get(ev.pointerId);
    if (k) {
      touch.held[k] = Math.max(0, touch.held[k] - 1);
      touch.skillOf.delete(ev.pointerId);
    }
  };
  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);

  function endTouches() {
    touch.joyId = null;
    touch.joy = null;
    touch.skillOf.clear();
    for (const k of Object.keys(touch.held)) touch.held[k] = 0;
  }

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
    /** 터치 시작: (x, y) → 'move' | 'skill:<키>' | 그 밖(소비됨). */
    onTouch(fn) {
      touchHandler = fn;
    },
    setScale(px) {
      scale = px;
    },
    endTouches,
    /** 조이스틱 표시용 (버퍼 좌표) 또는 null. */
    joystick() {
      const j = touch.joy;
      return j && { ox: j.ox / scale, oy: j.oy / scale, x: j.x / scale, y: j.y / scale };
    },
    /** 4장 input 형식으로 변환. 엣지 입력은 한 번 읽으면 소모된다. */
    sample(cam) {
      const keys = {};
      for (const [code, k] of Object.entries(SKILL_KEYS)) {
        keys[k] = k === 'q' ? held.has(code) || touch.held.q > 0 : pressed.has(code) || touch.pressed.has(k);
      }
      keys.u = pressed.has('Mouse2') || touch.pressed.has('u');
      keys.f = pressed.has('KeyF') || touch.pressed.has('f');
      keys.m = pressed.has('Mouse0') || touch.pressed.has('m');
      pressed.clear();
      touch.pressed.clear();
      let mx = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
      let my = (held.has('KeyS') ? 1 : 0) - (held.has('KeyW') ? 1 : 0);
      const j = touch.joy;
      if (!mx && !my && j) {
        const dx = j.x - j.ox;
        const dy = j.y - j.oy;
        const d = Math.hypot(dx, dy);
        if (d > JOY.dead * scale) {
          mx = dx / d; // 방향만 쓴다 (코어가 정규화해 최고 속도로 이동)
          my = dy / d;
        }
      }
      return { move: { x: mx, y: my }, aim: screenToWorld(cam, mouse.x, mouse.y), keys };
    },
  };
}
