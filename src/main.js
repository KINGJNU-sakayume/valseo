import { createGame, step, choose, DT } from './core/game.js';
import { createCamera, follow } from './render/camera.js';
import { render, drawCrosshair } from './render/renderer.js';
import { drawHud, drawOverlay, hitTest, drawTitle, drawPause, pauseHitTest } from './render/ui.js';
import { createInput } from './input/input.js';
import { createEffects, pushEvents, shakeOffset } from './render/effects.js';
import { loadSettings, saveSettings, SETTING_ITEMS } from './render/settings.js';

const MAX_STEPS_PER_FRAME = 5; // 탭 복귀 등으로 프레임이 길어질 때 폭주 방지

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const cam = createCamera();
const input = createInput(window);
const fx = createEffects();
const settings = loadSettings();
let started = false; // 시작 화면 (MENU)
let paused = false;

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const nextSeed = () => (Number.isFinite(seedParam) && seedParam > 0 ? seedParam : (Date.now() >>> 0));

let state = createGame(nextSeed());
input.onPress('KeyR', () => {
  if (state.phase === 'DEFEAT' || state.phase === 'VICTORY') state = createGame(nextSeed());
});

function toggleSetting(i) {
  const item = SETTING_ITEMS[i];
  if (!item) return;
  settings[item.key] = !settings[item.key];
  saveSettings(settings);
}

// 시작(Enter), 일시정지(P/Esc), 레벨업/상점: 숫자 키(1~9), Enter(다음 라운드), 클릭
input.onAnyPress((code) => {
  if (!started) {
    if (code === 'Enter' || code === 'Space') started = true;
    return;
  }
  if (code === 'KeyP' || code === 'Escape') {
    paused = !paused;
    return;
  }
  if (paused) {
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (m) toggleSetting(Number(m[1]) - 1);
    return;
  }
  if (!state.pending) return;
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (m) choose(state, Number(m[1]) - 1);
  else if (code === 'Enter' && state.pending.kind === 'shop') {
    choose(state, state.pending.options.findIndex((o) => o.kind === 'next'));
  }
});
input.onClick((x, y) => {
  if (!started) {
    started = true;
    return;
  }
  if (paused) {
    const i = pauseHitTest(cam, x, y);
    if (i === SETTING_ITEMS.length) paused = false;
    else if (i >= 0) toggleSetting(i);
    return;
  }
  if (!state.pending) return;
  const i = hitTest(state, cam, x, y);
  if (i >= 0) choose(state, i);
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

// 화면 흔들림용 (렌더 전용이라 core 의 시드 RNG 와 무관)
const shakeRand = () => Math.random();

function frame(now) {
  const frameDt = Math.min((now - last) / 1000, MAX_STEPS_PER_FRAME * DT);
  acc += frameDt;
  last = now;
  let steps = 0;
  if (state.pending || !started || paused) acc = 0; // 선택·시작·일시정지 중에는 시간이 쌓이지 않게
  while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
    follow(cam, state.player, innerWidth, innerHeight);
    step(state, input.sample(cam));
    pushEvents(fx, state.events, now / 1000, settings);
    acc -= DT;
    steps++;
  }
  follow(cam, state.player, innerWidth, innerHeight);
  const shake = shakeOffset(fx, frameDt, settings, shakeRand);
  cam.x += shake.x;
  cam.y += shake.y;
  render(ctx, state, cam, fx, now / 1000, settings);
  drawHud(ctx, state, cam);
  drawOverlay(ctx, state, cam, input.mouse);
  if (!started) drawTitle(ctx, cam);
  else if (paused) drawPause(ctx, cam, settings, input.mouse);
  drawCrosshair(ctx, input.mouse.x, input.mouse.y);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 디버그용: 콘솔에서 상태 확인
window.__crossfire = { get state() { return state; } };
