import { createGame, step, choose, DT } from './core/game.js';
import { createCamera, follow, screenToWorld } from './render/camera.js';
import { createBuffer, resizeBuffer, pixelScale } from './render/pixel.js';
import { render, createRenderState } from './render/renderer.js';
import { drawHud, drawOverlay, overlayHit, drawTitle, drawPause, pauseHit, drawResult, drawCrosshair, drawAgentSelect, agentSelectHit, AGENT_LIST } from './render/ui.js';
import { createInput } from './input/input.js';
import { buildArena } from './render/tiles.js';
import { createParticles, updateParticles } from './render/particles.js';
import { createFeel, onEvents, updateFeel } from './render/feel.js';
import { createAudio, unlock, setVolume, play } from './render/audio.js';
import { loadSettings, toggleSetting, SETTING_ITEMS } from './render/settings.js';
import { loadRecords, submitRun } from './render/records.js';

const MAX_STEPS_PER_FRAME = 5; // 탭 복귀 등으로 프레임이 길어질 때 폭주 방지

const canvas = document.getElementById('game');
const screen = canvas.getContext('2d');
const buf = createBuffer();
const cam = createCamera();
const input = createInput(window);
const settings = loadSettings();
const audio = createAudio();
const rand = () => Math.random(); // 렌더 전용 난수 (core 결정성과 무관)

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const nextSeed = () => (Number.isFinite(seedParam) && seedParam > 0 ? seedParam : (Date.now() >>> 0));

let agent = AGENT_LIST.includes(params.get('agent')) ? params.get('agent') : 'chamber';
let state = createGame(nextSeed(), agent);
let arena = null;
let ps = createParticles();
let feel = createFeel();
let rs = createRenderState();
let menu = 'title'; // 'title' → 'agent' → 'game'
let paused = false;
let lastHover = -1;
const records = loadRecords();
let fresh = null; // 이번 판 결과로 갱신된 기록 (판이 끝날 때 한 번만 저장)

function newGame() {
  fresh = null;
  state = createGame(nextSeed(), agent);
  arena = buildArena();
  ps = createParticles();
  feel = createFeel();
  rs = createRenderState();
}

const applyAudio = () => setVolume(audio, settings.volume, settings.sound);
const ensureAudio = () => {
  unlock(audio);
  applyAudio();
};

input.onPress('KeyR', () => {
  if (state.phase === 'DEFEAT' || state.phase === 'VICTORY') newGame();
});

/** 화면 좌표 → 버퍼 좌표 */
const toBuf = (x, y) => ({ x: x / cam.px, y: y / cam.px });

const started = () => menu === 'game';

function toAgentSelect() {
  menu = 'agent';
  ensureAudio();
  play(audio, 'click');
}

function start(i) {
  agent = AGENT_LIST[i];
  newGame();
  menu = 'game';
  play(audio, 'round');
}

// 시작(Enter), 일시정지(P/Esc), 레벨업/상점: 숫자 키(1~9), Enter(다음 라운드)
input.onAnyPress((code) => {
  ensureAudio();
  if (menu === 'title') {
    if (code === 'Enter' || code === 'Space') toAgentSelect();
    return;
  }
  if (menu === 'agent') {
    const k = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (k && Number(k[1]) <= AGENT_LIST.length) start(Number(k[1]) - 1);
    else if (code === 'Escape') menu = 'title';
    return;
  }
  if (code === 'KeyP' || code === 'Escape') {
    paused = !paused;
    play(audio, 'click');
    return;
  }
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (paused) {
    if (m) {
      toggleSetting(settings, Number(m[1]) - 1);
      applyAudio();
      play(audio, 'click');
    }
    return;
  }
  if (!state.pending) return;
  if (m) tryChoose(Number(m[1]) - 1);
  else if (code === 'Enter' && state.pending.kind === 'shop') tryChoose(state.pending.options.findIndex((o) => o.kind === 'next'));
});

input.onClick((x, y) => {
  ensureAudio();
  const b = toBuf(x, y);
  if (menu === 'title') return toAgentSelect();
  if (menu === 'agent') {
    const i = agentSelectHit(buf.w, buf.h, b.x, b.y);
    if (i >= 0) start(i);
    return;
  }
  if (paused) {
    const i = pauseHit(buf.w, buf.h, b.x, b.y);
    if (i === SETTING_ITEMS.length) paused = false;
    else if (i >= 0) {
      toggleSetting(settings, i);
      applyAudio();
    }
    if (i >= 0) play(audio, 'click');
    return;
  }
  if (!state.pending) return;
  const i = overlayHit(state, buf.w, buf.h, b.x, b.y);
  if (i >= 0) tryChoose(i);
});

function tryChoose(i) {
  const ok = choose(state, i);
  play(audio, ok ? 'click' : 'deny');
  onEvents(feel, { ps, arena, audio, settings, rand }, state, state.events, performance.now() / 1000);
  state.events.length = 0;
}

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  cam.px = pixelScale(innerHeight);
  resizeBuffer(buf, Math.ceil(innerWidth / cam.px), Math.ceil(innerHeight / cam.px));
  cam.bw = buf.w;
  cam.bh = buf.h;
}
addEventListener('resize', resize);
resize();

let last = performance.now();
let acc = 0;

function frame(nowMs) {
  const now = nowMs / 1000;
  const frameDt = Math.min((nowMs - last) / 1000, MAX_STEPS_PER_FRAME * DT);
  last = nowMs;
  acc += frameDt;
  if (state.pending || !started() || paused) acc = 0; // 선택·시작·일시정지 중에는 시간이 쌓이지 않게
  if (feel.hitstop > 0) {
    // 히트스톱: 잠깐 시뮬레이션을 멈춰 타격감을 준다 (입력은 그대로 다음 틱에 반영)
    feel.hitstop -= frameDt;
    acc = 0;
  }
  let steps = 0;
  while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
    step(state, input.sample(cam));
    onEvents(feel, { ps, arena, audio, settings, rand }, state, state.events, now);
    acc -= DT;
    steps++;
  }

  const shake = updateFeel(feel, frameDt, now, settings, rand);
  cam.shakeX = shake.x;
  cam.shakeY = shake.y;
  const aim = screenToWorld(cam, input.mouse.x, input.mouse.y);
  if (!started()) {
    // 메뉴: 아레나를 천천히 가로지르는 카메라
    const t = now * 0.05;
    follow(cam, { x: 1000 + Math.cos(t) * 500, y: 1000 + Math.sin(t * 1.3) * 400 }, { x: 0, y: 0 }, 0);
  } else follow(cam, state.player, aim, frameDt);
  updateParticles(ps, frameDt, arena);

  const view = { arena, ps, feel, now, rs, cam, settings };
  render(buf, state, cam, view);
  const ctx = buf.ctx;
  const mouse = toBuf(input.mouse.x, input.mouse.y);
  if (menu === 'title') drawTitle(ctx, buf.w, buf.h, now);
  else if (menu === 'agent') drawAgentSelect(ctx, buf.w, buf.h, mouse, now, records);
  else {
    drawHud(ctx, state, buf.w, buf.h, view);
    drawOverlay(ctx, state, buf.w, buf.h, mouse, now);
    if (state.phase === 'DEFEAT' || state.phase === 'VICTORY') {
      fresh ??= submitRun(records, { agent: state.agent, win: state.phase === 'VICTORY', round: state.round, kills: state.stats.kills, time: state.time });
      drawResult(ctx, state, buf.w, buf.h, now, fresh);
    }
    if (paused) drawPause(ctx, buf.w, buf.h, settings, mouse);
  }
  // 오버레이 위 마우스 호버 효과음
  const hover = menu === 'agent' ? agentSelectHit(buf.w, buf.h, mouse.x, mouse.y)
    : paused ? pauseHit(buf.w, buf.h, mouse.x, mouse.y)
      : state.pending ? overlayHit(state, buf.w, buf.h, mouse.x, mouse.y) : -1;
  if (hover !== lastHover && hover >= 0) play(audio, 'hover');
  lastHover = hover;
  drawCrosshair(ctx, mouse.x, mouse.y, started() && !paused && !state.pending && state.player.precision);

  screen.imageSmoothingEnabled = false;
  screen.drawImage(buf.canvas, 0, 0, buf.w * cam.px, buf.h * cam.px);
  requestAnimationFrame(frame);
}

// 픽셀 폰트를 먼저 불러와야 바닥 마킹·UI 글자가 제대로 그려진다
Promise.all(['11px Galmuri11', 'bold 11px "Galmuri11 Bold"', '9px Galmuri9'].map((f) => document.fonts.load(f)))
  .catch(() => {})
  .finally(() => {
    arena = buildArena();
    requestAnimationFrame(frame);
  });

// 디버그용: 콘솔에서 상태 확인
window.__crossfire = { get state() { return state; }, start: (a = 'chamber') => start(Math.max(0, AGENT_LIST.indexOf(a))) };
