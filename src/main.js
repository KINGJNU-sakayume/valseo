import { createGame, step, DT } from './core/game.js';
import { createCamera, follow } from './render/camera.js';
import { render } from './render/renderer.js';
import { drawHud } from './render/ui.js';
import { createInput } from './input/input.js';

const MAX_STEPS_PER_FRAME = 5; // 탭 복귀 등으로 프레임이 길어질 때 폭주 방지

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const cam = createCamera();
const input = createInput(window);

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const nextSeed = () => (Number.isFinite(seedParam) && seedParam > 0 ? seedParam : (Date.now() >>> 0));

let state = createGame(nextSeed());
input.onPress('KeyR', () => {
  if (state.phase === 'DEFEAT') state = createGame(nextSeed());
});

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

let last = performance.now();
let acc = 0;

function frame(now) {
  acc += Math.min((now - last) / 1000, MAX_STEPS_PER_FRAME * DT);
  last = now;
  let steps = 0;
  while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
    follow(cam, state.player, innerWidth, innerHeight);
    step(state, input.sample(cam));
    acc -= DT;
    steps++;
  }
  follow(cam, state.player, innerWidth, innerHeight);
  render(ctx, state, cam, input.mouse);
  drawHud(ctx, state, cam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 디버그용: 콘솔에서 상태 확인
window.__crossfire = { get state() { return state; } };
