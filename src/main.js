import { createGame, step, choose, reroll, banish, DT } from './core/game.js';
import { decide } from './core/autopilot.js';
import { createCamera, follow, screenToWorld } from './render/camera.js';
import { createBuffer, resizeBuffer, pixelScale } from './render/pixel.js';
import { render, createRenderState } from './render/renderer.js';
import {
  drawHud, drawOverlay, overlayHit, drawTitle, drawPause, pauseHit, drawResult, drawCrosshair, drawAgentSelect, agentSelectHit, AGENT_LIST,
  abilityHit, pauseButtonHit, drawTouch, drawRotate, levelupButtonHit, drawBuild, buildButtonHit,
} from './render/ui.js';
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
// 모바일: 터치 기기(호버 없음 + 거친 포인터) 또는 ?mobile=1. 이동은 직접, 조준·스킬은 자동.
const mobile = params.get('mobile') === '1' || matchMedia('(hover: none) and (pointer: coarse)').matches;
settings.autoSkills ??= mobile;
let portrait = false;
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
let endedAt = null; // 결과 화면이 뜬 시각 (모바일: 바로 탭해서 넘기지 않도록)
let banishMode = false; // 레벨업: 추방할 카드를 고르는 중
let buildOpen = false; // 빌드 화면 (게임 정지)

function newGame() {
  fresh = null;
  endedAt = null;
  banishMode = false;
  buildOpen = false;
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
  if (code === 'Tab' && !paused) {
    buildOpen = !buildOpen;
    play(audio, 'click');
    return;
  }
  if (buildOpen) {
    if (code === 'Escape') buildOpen = false;
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
  if (state.pending.kind === 'levelup') {
    if (code === 'KeyR') return levelupAction('reroll');
    if (code === 'KeyB') return levelupAction('banish');
  }
  if (m) pickCard(Number(m[1]) - 1);
  else if (code === 'Enter' && state.pending.kind === 'shop') tryChoose(state.pending.options.findIndex((o) => o.kind === 'next'));
});

/** 레벨업 리롤 / 추방 모드 토글. */
function levelupAction(id) {
  if (id === 'reroll') {
    const ok = reroll(state);
    banishMode = false;
    play(audio, ok ? 'click' : 'deny');
  } else if (banishMode || state.banishes > 0) {
    banishMode = !banishMode;
    play(audio, 'click');
  } else play(audio, 'deny');
}

/** 카드 선택: 추방 모드면 추방, 아니면 선택. */
function pickCard(i) {
  if (banishMode && state.pending?.kind === 'levelup') {
    const ok = banish(state, i);
    banishMode = false;
    play(audio, ok ? 'deny' : 'click');
    return;
  }
  tryChoose(i);
}

input.onClick((x, y) => tap(toBuf(x, y)));

// 터치: 전투 중이면 일시정지 버튼 / 스킬 칸 / 조이스틱, 그 밖에는 클릭과 같이 처리
input.onTouch((x, y) => {
  const b = toBuf(x, y);
  if (portrait) return null;
  if (buildOpen) {
    buildOpen = false;
    return null;
  }
  if (started() && !paused && !state.pending && state.phase === 'COMBAT') {
    if (pauseButtonHit(b.x, b.y)) {
      paused = true;
      input.endTouches();
      play(audio, 'click');
      return null;
    }
    if (buildButtonHit(b.x, b.y)) {
      buildOpen = true;
      input.endTouches();
      play(audio, 'click');
      return null;
    }
    const k = abilityHit(buf.w, buf.h, true, b.x, b.y);
    if (k && state.player.skills[k].level > 0) return `skill:${k}`;
    return 'move';
  }
  if (started() && (state.phase === 'DEFEAT' || state.phase === 'VICTORY') && !paused) {
    if (endedAt === null || performance.now() / 1000 - endedAt < 1.2) return null;
    newGame();
    play(audio, 'round');
    return null;
  }
  tap(b);
  return null;
});

function goFullscreen() {
  // 안드로이드 크롬: 전체 화면 + 가로 고정. iOS 사파리는 지원하지 않으니 조용히 넘어간다 (홈 화면 앱은 manifest 가 가로 고정)
  if (!mobile || document.fullscreenElement || matchMedia('(display-mode: standalone)').matches) return;
  try {
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
      ?.then(() => window.screen.orientation?.lock?.('landscape'))
      .catch(() => {});
  } catch {
    // 지원하지 않는 브라우저
  }
}

function tap(b) {
  ensureAudio();
  if (menu === 'title') {
    goFullscreen();
    return toAgentSelect();
  }
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
  if (buildOpen) {
    buildOpen = false;
    return;
  }
  if (!state.pending) return;
  const btn = levelupButtonHit(state, buf.w, buf.h, b.x, b.y);
  if (btn) return levelupAction(btn);
  const i = overlayHit(state, buf.w, buf.h, b.x, b.y);
  if (i >= 0) pickCard(i);
}

function tryChoose(i) {
  const ok = choose(state, i);
  play(audio, ok ? 'click' : 'deny');
  onEvents(feel, { ps, arena, audio, settings, rand }, state, state.events, performance.now() / 1000);
  state.events.length = 0;
}

function resize() {
  // 캔버스는 기기 픽셀 해상도 (고해상도 화면에서도 선명하게). 입력 좌표도 기기 픽셀.
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  // 모바일은 짧은 변 기준 (세로로 들어도 '돌려주세요' 안내가 화면에 맞게)
  cam.px = pixelScale(mobile ? Math.min(canvas.width, canvas.height) : canvas.height, mobile);
  input.setScale(cam.px);
  portrait = mobile && innerHeight > innerWidth;
  resizeBuffer(buf, Math.ceil(canvas.width / cam.px), Math.ceil(canvas.height / cam.px));
  cam.bw = buf.w;
  cam.bh = buf.h;
}
addEventListener('resize', resize);
addEventListener('orientationchange', resize);
resize();

// 탭을 떠나거나 앱을 내리면 자동 일시정지
document.addEventListener('visibilitychange', () => {
  if (document.hidden && started() && state.phase === 'COMBAT' && !state.pending) paused = true;
  input.endTouches();
});

/** 전투 입력: 모바일은 조준을, 스킬 자동 사용이 켜져 있으면 스킬을 자동 판단과 합친다. */
function combatInput() {
  const inp = input.sample(cam);
  inp.autoSkills = !!settings.autoSkills; // 자동화 숙련 효과 판정
  if (!mobile && !settings.autoSkills) return inp;
  const ai = decide(state, { gentle: mobile });
  if (mobile) {
    inp.aim = ai.aim;
    inp.autoAim = true;
  }
  if (settings.autoSkills) for (const k of Object.keys(inp.keys)) inp.keys[k] = inp.keys[k] || ai.keys[k];
  return inp;
}

let last = performance.now();
let acc = 0;

function frame(nowMs) {
  const now = nowMs / 1000;
  const frameDt = Math.min((nowMs - last) / 1000, MAX_STEPS_PER_FRAME * DT);
  last = nowMs;
  acc += frameDt * (feel.slowmo > 0 ? 0.35 : 1); // 클린 라운드 슬로모
  if (state.pending || !started() || paused || portrait || buildOpen) acc = 0; // 선택·시작·일시정지·빌드 화면 중에는 시간이 쌓이지 않게
  if (feel.hitstop > 0) {
    // 히트스톱: 잠깐 시뮬레이션을 멈춰 타격감을 준다 (입력은 그대로 다음 틱에 반영)
    feel.hitstop -= frameDt;
    acc = 0;
  }
  let steps = 0;
  while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
    step(state, combatInput());
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
  } else follow(cam, state.player, mobile ? { x: state.player.aimX ?? state.player.x, y: state.player.aimY ?? state.player.y } : aim, frameDt);
  updateParticles(ps, frameDt, arena);

  const view = { arena, ps, feel, now, rs, cam, settings, mobile };
  render(buf, state, cam, view);
  const ctx = buf.ctx;
  const mouse = toBuf(input.mouse.x, input.mouse.y);
  if (menu === 'title') drawTitle(ctx, buf.w, buf.h, now, mobile);
  else if (menu === 'agent') drawAgentSelect(ctx, buf.w, buf.h, mouse, now, records, mobile);
  else {
    drawHud(ctx, state, buf.w, buf.h, view);
    if (mobile && !paused && !state.pending) drawTouch(ctx, state, buf.w, buf.h, input.joystick(), now);
    drawOverlay(ctx, state, buf.w, buf.h, mouse, now, mobile, banishMode);
    if (buildOpen) drawBuild(ctx, state, buf.w, buf.h, mobile);
    if (state.phase === 'DEFEAT' || state.phase === 'VICTORY') {
      endedAt ??= now;
      fresh ??= submitRun(records, { agent: state.agent, win: state.phase === 'VICTORY', round: state.round, kills: state.stats.kills, time: state.time });
      drawResult(ctx, state, buf.w, buf.h, now, fresh, mobile);
    }
    if (paused) drawPause(ctx, buf.w, buf.h, settings, mouse, mobile);
  }
  if (portrait) drawRotate(ctx, buf.w, buf.h, now);
  // 오버레이 위 마우스 호버 효과음
  const hover = mobile ? -1 : menu === 'agent' ? agentSelectHit(buf.w, buf.h, mouse.x, mouse.y)
    : paused ? pauseHit(buf.w, buf.h, mouse.x, mouse.y)
      : state.pending ? overlayHit(state, buf.w, buf.h, mouse.x, mouse.y) : -1;
  if (hover !== lastHover && hover >= 0) play(audio, 'hover');
  lastHover = hover;
  if (!mobile) drawCrosshair(ctx, mouse.x, mouse.y, started() && !paused && !state.pending && state.player.precision);

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
