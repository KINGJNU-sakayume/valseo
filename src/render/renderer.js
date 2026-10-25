// 월드 레이어: 픽셀 버퍼에 바닥·설치물·캐릭터·탄·파티클·조명을 그린다.
import { SKILLS } from '../data/skills.js';
import { AGENTS } from '../data/agents.js';
import { C, PAL } from './palette.js';
import { disc, ring, line, dashed, rect, text } from './pixel.js';
import { bx, by } from './camera.js';
import { WALL } from './tiles.js';
import { drawSprite, drawGun } from './sprites.js';
import { drawParticles } from './particles.js';
import { isFlashing, heldGun } from './feel.js';

const SPRITE_OF = { chaser: 'chaser', charger: 'charger', ranged: 'ranged' };
const LIGHT = { ambient: 'rgba(3,5,9,0.46)', player: 95 };

export function createRenderState() {
  return { walk: 0, lastX: 0, lastY: 0, moving: false, light: null, eliteCache: new Map(), bossCache: new Map() };
}

export function render(buf, state, cam, view) {
  const { ctx } = buf;
  const { arena, ps, feel, now, rs } = view;
  const S = cam.S;
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, buf.w, buf.h);
  ctx.drawImage(arena.canvas, Math.round(-cam.x / S - WALL), Math.round(-cam.y / S - WALL));

  drawFields(ctx, state, cam, now);
  drawZones(ctx, state, cam, now);
  drawLockdowns(ctx, state, cam, now);
  drawTraps(ctx, state, cam, now);
  drawDevices(ctx, state, cam, now);
  drawPickups(ctx, state, cam, now);

  // 그림자 → y 정렬 캐릭터
  const p = state.player;
  const actors = [...state.enemies.map((e) => ({ y: e.y, e })), { y: p.y, player: true }];
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) {
    const x = a.player ? p.x : a.e.x;
    const r = a.player ? p.r : a.e.r;
    shadow(ctx, bx(cam, x), by(cam, a.y) + r / S * 0.9, Math.max(4, Math.round(r / S)));
  }
  updateWalk(rs, p, now);
  for (const a of actors) {
    if (a.player) drawPlayer(ctx, state, cam, view);
    else drawEnemy(ctx, a.e, state, cam, view);
  }

  drawBullets(ctx, state, cam);
  drawParticles(ctx, ps, cam);
  drawBeamsAndRings(ctx, feel, cam, now);
  if (view.settings.lighting !== false) drawLighting(buf, state, cam, view);
  drawNumbers(ctx, feel, cam, now);
}

function shadow(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  const h = Math.max(1, Math.round(r * 0.4));
  for (let dy = -h; dy <= h; dy++) {
    const w = Math.round(r * Math.sqrt(1 - (dy * dy) / (h * h + 0.01)));
    ctx.fillRect(Math.round(x - w), Math.round(y + dy), w * 2, 1);
  }
}

function updateWalk(rs, p, now) {
  const moved = Math.hypot(p.x - rs.lastX, p.y - rs.lastY);
  rs.moving = moved > 0.3;
  rs.lastX = p.x;
  rs.lastY = p.y;
  if (rs.moving) rs.walk = now;
}

function drawPlayer(ctx, state, cam, view) {
  const { feel, now, rs } = view;
  const p = state.player;
  const x = bx(cam, p.x);
  const y = by(cam, p.y);
  const right = Math.cos(p.aim) >= 0;
  const base = AGENTS[state.agent].sprite;
  const frame = `${base}${rs.moving && Math.floor(now * 8) % 2 ? 1 : 0}`;
  const bob = rs.moving && Math.floor(now * 8) % 2 ? -1 : 0;
  const blink = p.invuln > 0 && Math.floor(now * 20) % 2 === 0;
  const gun = heldGun(state);
  const handX = x + (right ? 2 : -2);
  const handY = y + 3 + bob;
  // 위를 조준하면 총을 몸 뒤에
  const gunBehind = Math.sin(p.aim) < -0.3;
  if (gun && gunBehind) drawGun(ctx, gun, handX, handY, p.aim, feel.kick);
  if (!blink) drawSprite(ctx, frame, x, y - 4 + bob, { flip: !right });
  else drawSprite(ctx, frame, x, y - 4 + bob, { flip: !right, alpha: 0.4 });
  if (gun && !gunBehind) drawGun(ctx, gun, handX, handY, p.aim, feel.kick);
  if (p.precision) {
    // 정조준: 관통 궤적 미리보기
    const len = 260;
    dashed(ctx, x + Math.cos(p.aim) * 14, y + Math.sin(p.aim) * 14, x + Math.cos(p.aim) * len, y + Math.sin(p.aim) * len, 'rgba(246,215,126,0.55)', 2, 3);
  }
}

function drawEnemy(ctx, e, state, cam, view) {
  const { feel, now } = view;
  const x = bx(cam, e.x);
  const y = by(cam, e.y);
  const white = isFlashing(feel, e.id, now);
  const right = state.player.x >= e.x;
  if (e.type === 'boss') return drawBoss(ctx, e, x, y, view, white);
  if (e.type === 'elite') return drawElite(ctx, e, x, y, view, white, right);
  if (e.type === 'charger' && e.mode === 'telegraph') {
    const len = 240;
    const blinkOn = Math.floor(now * 12) % 2 === 0;
    dashed(ctx, x, y, x + e.dirX * len, y + e.dirY * len, blinkOn ? C.red : C.orange, 4, 2);
  }
  const base = SPRITE_OF[e.type] ?? 'chaser';
  const frame = `${base}${Math.floor(now * 6 + e.id * 0.37) % 2}`;
  const hover = e.type === 'ranged' ? Math.round(Math.sin(now * 4 + e.id) * 1.5) - 2 : 0;
  drawSprite(ctx, frame, x, y - 2 + hover, { flip: e.type === 'charger' && e.mode !== 'move' && e.mode !== 'recover' ? e.dirX < 0 : !right, white });
  drawStatus(ctx, e, x, y, cam, now);
}

/** 상태이상 표시: 취약(노란 마름모), 구금(청색 테두리), 냉각(하늘색 점). */
function drawStatus(ctx, e, x, y, cam, now) {
  const r = Math.round(e.r / cam.S);
  if (e.detained > 0) {
    const on = e.detained > 1 || Math.floor(now * 10) % 2 === 0;
    if (on) {
      ctx.strokeStyle = C.shield;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x - r - 2) + 0.5, Math.round(y - r - 4) + 0.5, r * 2 + 4, r * 2 + 4);
      rect(ctx, x - r - 2, y - r - 4, 3, 1, C.white);
      rect(ctx, x + r - 1, y + r - 1, 3, 1, C.white);
    }
  }
  if (e.vulnerable > 0) {
    const yy = y - r - 8 + Math.round(Math.sin(now * 6 + e.id) * 1);
    rect(ctx, x, yy - 2, 1, 1, PAL.k);
    rect(ctx, x - 1, yy - 1, 3, 1, C.goldLight);
    rect(ctx, x - 2, yy, 5, 1, C.gold);
    rect(ctx, x - 1, yy + 1, 3, 1, C.gold);
    rect(ctx, x, yy + 2, 1, 1, PAL.k);
  }
  if (e.chillTime > 0) rect(ctx, x + r, y - r, 2, 2, '#bfe6ff');
}

// 엘리트: 붉은 대형 기갑 (절차적, 버퍼에서 바로 그림)
function drawElite(ctx, e, x, y, view, white, right) {
  const r = Math.round(e.r / view.cam.S);
  const body = white ? '#ffffff' : PAL.R;
  disc(ctx, x, y - 2, r + 1, PAL.k);
  disc(ctx, x, y - 2, r, body);
  if (!white) {
    disc(ctx, x, y - 3, r - 3, PAL.r);
    rect(ctx, x - r + 2, y - 4, r * 2 - 4, 5, PAL.k);
    const ex = x + (right ? 4 : -4);
    rect(ctx, ex - 3, y - 3, 6, 3, PAL.w);
    rect(ctx, ex - 1, y - 3, 2, 3, PAL.r);
    // 어깨 포
    rect(ctx, x - r - 4, y - 6, 5, 9, PAL.M);
    rect(ctx, x + r - 1, y - 6, 5, 9, PAL.M);
    rect(ctx, x - r - 4, y - 6, 5, 1, PAL.l);
    rect(ctx, x + r - 1, y - 6, 5, 1, PAL.l);
  }
  hpBar(ctx, x, y - r - 8, r * 2 + 6, e.hp / e.maxHp, C.red);
}

// 보스: 회전하는 육각 장갑 + 단계별 코어 (픽셀 단위 렌더, 회전 단계별 캐시)
function drawBoss(ctx, e, x, y, view, white) {
  const r = Math.round(e.r / view.cam.S);
  const steps = 24;
  const rot = ((Math.round((e.spin * 0.2) / ((Math.PI * 2) / steps)) % steps) + steps) % steps;
  const key = `${rot}:${e.phase}:${white ? 1 : 0}`;
  let img = view.rs.bossCache.get(key);
  if (!img) {
    img = bossImage(r, (rot / steps) * Math.PI * 2, e.phase, white);
    view.rs.bossCache.set(key, img);
  }
  if (e.mode === 'telegraph') {
    line(ctx, x, y, x + e.dirX * 400, y + e.dirY * 400, 'rgba(255,70,85,0.35)', 3);
    dashed(ctx, x, y, x + e.dirX * 400, y + e.dirY * 400, C.red, 4, 2);
  }
  ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2 - 3));
  const pulse = 3 + e.phase * 2 + Math.round(Math.sin(view.now * 6) * 1.5);
  disc(ctx, x, y - 3, pulse, white ? '#ffffff' : [PAL.y, PAL.o, PAL.r][e.phase]);
  disc(ctx, x, y - 3, Math.max(1, pulse - 3), PAL.w);
}

function bossImage(r, angle, phase, white) {
  const size = r * 2 + 6;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2;
  const inHex = (px, py, R) => {
    // 정육각형 내부 판정 (회전 포함)
    const dx = px - cx;
    const dy = py - cx;
    const a = Math.atan2(dy, dx) - angle;
    const d = Math.hypot(dx, dy);
    const sector = (Math.PI * 2) / 6;
    const local = ((a % sector) + sector) % sector - sector / 2;
    return d * Math.cos(local) <= R * Math.cos(Math.PI / 6);
  };
  const ringColor = white ? '#ffffff' : [PAL.g, PAL.o, PAL.r][phase];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let col = null;
      if (inHex(px + 0.5, py + 0.5, r + 1)) col = PAL.k;
      if (inHex(px + 0.5, py + 0.5, r - 1)) col = white ? '#ffffff' : ((px + py) % 7 === 0 ? PAL.M : PAL.n);
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cx);
      if (!white && inHex(px + 0.5, py + 0.5, r - 1) && d > r * 0.55 && d < r * 0.62) col = ringColor;
      if (!white && inHex(px + 0.5, py + 0.5, r - 1) && !inHex(px + 0.5, py + 0.5, r - 3)) col = PAL.l;
      if (d < r * 0.5 && inHex(px + 0.5, py + 0.5, r)) col = white ? '#ffffff' : PAL.N;
      if (col) {
        g.fillStyle = col;
        g.fillRect(px, py, 1, 1);
      }
    }
  }
  return c;
}

function hpBar(ctx, cx, y, w, ratio, color) {
  rect(ctx, cx - w / 2 - 1, y - 1, w + 2, 4, PAL.k);
  rect(ctx, cx - w / 2, y, w, 2, '#3a1018');
  rect(ctx, cx - w / 2, y, Math.max(0, w * ratio), 2, color);
}

let checker = null;
/** 2x2 체커 패턴 (디더링 반투명 바닥용). 캔버스 원점 기준이라 화면에 고정돼 보인다. */
function checkerPattern(ctx) {
  if (checker) return checker;
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const g = c.getContext('2d');
  g.fillStyle = C.teal;
  g.fillRect(0, 0, 1, 1);
  g.fillRect(1, 1, 1, 1);
  checker = ctx.createPattern(c, 'repeat');
  return checker;
}

function drawFields(ctx, state, cam, now) {
  for (const f of state.fields) {
    const x = bx(cam, f.x);
    const y = by(cam, f.y);
    const r = Math.round(f.r / cam.S);
    const fade = Math.min(1, f.life / 0.5);
    // 디더링된 바닥 + 회전하는 점 패턴 + 테두리
    ctx.globalAlpha = (f.stack ? 0.32 : 0.22) * fade;
    disc(ctx, x, y, r, checkerPattern(ctx));
    ctx.globalAlpha = 0.55 * fade;
    const spin = now * 0.6;
    ctx.fillStyle = C.teal;
    for (let k = 0; k < 3; k++) {
      const rr = r * (0.35 + k * 0.25);
      const n = 6 + k * 6;
      for (let i = 0; i < n; i++) {
        const a = spin * (k % 2 ? -1 : 1) + (i / n) * Math.PI * 2;
        ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr), 1, 1);
      }
    }
    ctx.globalAlpha = 0.9 * fade;
    ring(ctx, x, y, r, C.teal, 1);
    ctx.globalAlpha = 1;
  }
}

let nanoChecker = null;
function nanoPattern(ctx) {
  if (nanoChecker) return nanoChecker;
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const g = c.getContext('2d');
  g.fillStyle = PAL.p;
  g.fillRect(0, 0, 1, 1);
  g.fillStyle = PAL.y;
  g.fillRect(1, 1, 1, 1);
  nanoChecker = ctx.createPattern(c, 'repeat');
  return nanoChecker;
}

// 킬조이: 나노스웜 (비행 중 포물선 → 착탄 후 디더링 장판 + 거품)
function drawZones(ctx, state, cam, now) {
  for (const z of state.zones) {
    if (z.flight > 0) {
      const k = 1 - z.flight / z.flightMax;
      const wx = z.fromX + (z.x - z.fromX) * k;
      const wy = z.fromY + (z.y - z.fromY) * k;
      const arc = Math.sin(k * Math.PI) * 18;
      drawSprite(ctx, 'nanoswarm', bx(cam, wx), by(cam, wy) - arc);
      continue;
    }
    const x = bx(cam, z.x);
    const y = by(cam, z.y);
    const r = Math.round(z.r / cam.S);
    const fade = Math.min(1, z.life / 0.4);
    ctx.globalAlpha = 0.35 * fade;
    disc(ctx, x, y, r, nanoPattern(ctx));
    ctx.globalAlpha = 0.9 * fade;
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4 + z.id;
      const rr = r * (0.2 + ((i * 0.37 + now * 0.8 + z.id * 0.13) % 0.8));
      rect(ctx, x + Math.cos(a) * rr, y + Math.sin(a) * rr - ((now * 20 + i * 3) % 4), 1, 1, i % 2 ? PAL.y : PAL.p);
    }
    ring(ctx, x, y, r, z.vulnerable ? C.gold : C.purple, 1);
    ctx.globalAlpha = 1;
  }
}

// 킬조이: 락다운 (장치 + 반경 + 기동 카운트다운 링)
function drawLockdowns(ctx, state, cam, now) {
  for (const l of state.lockdowns) {
    const x = bx(cam, l.x);
    const y = by(cam, l.y);
    const r = Math.round(l.r / cam.S);
    const k = l.t / l.windup;
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(now * 12);
    ring(ctx, x, y, r, C.goldLight, 2);
    ctx.globalAlpha = 0.8;
    ring(ctx, x, y, Math.max(2, r * k), C.teal, 1);
    ctx.globalAlpha = 1;
    drawSprite(ctx, 'lockdown', x, y - 4 + Math.round(Math.sin(now * 8)));
  }
}

// 킬조이: 알람봇·포탑
function drawDevices(ctx, state, cam, now) {
  const det = Math.round(SKILLS.alarmbot.detectRadius / cam.S);
  for (const d of state.devices) {
    const x = bx(cam, d.x);
    const y = by(cam, d.y);
    if (d.kind === 'alarmbot') {
      if (d.arm <= 0 && d.mode === 'idle') {
        ctx.globalAlpha = 0.18 + 0.1 * Math.sin(now * 4 + d.id);
        ring(ctx, x, y, det, C.gold, 1);
        ctx.globalAlpha = 1;
      }
      const frame = d.mode === 'roll' ? Math.floor(now * 14) % 2 : 0;
      drawSprite(ctx, `alarmbot${frame}`, x, y - 2, { alpha: d.arm > 0 ? 0.6 : 1 });
    } else {
      drawSprite(ctx, 'turret', x, y - 3);
      drawGun(ctx, 'turret_barrel', x, y - 5, d.aim, d.fireCd > 0.25 ? 1 : 0);
      rect(ctx, x - 1, y - 6, 2, 2, Math.floor(now * 4) % 2 ? C.teal : C.tealDark);
    }
  }
}

function drawTraps(ctx, state, cam, now) {
  const tr = Math.round(SKILLS.trademark.triggerRadius / cam.S);
  for (const t of state.traps) {
    const x = bx(cam, t.x);
    const y = by(cam, t.y);
    if (t.arm <= 0) {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now * 5);
      ring(ctx, x, y, tr, C.gold, 1);
      ctx.globalAlpha = 1;
    }
    drawSprite(ctx, t.arm > 0 ? 'trapArming' : 'trap', x, y);
    if (t.arm <= 0 && Math.floor(now * 3) % 2) rect(ctx, x - 1, y - 1, 2, 2, C.teal);
  }
  const anchor = state.player.skills.e.anchor;
  if (anchor) {
    const x = bx(cam, anchor.x);
    const y = by(cam, anchor.y);
    ctx.globalAlpha = 0.35;
    rect(ctx, x - 1, y - 40, 2, 36, C.goldLight);
    ctx.globalAlpha = 1;
    drawSprite(ctx, 'anchor', x, y - 4 + Math.round(Math.sin(now * 3) * 1.5));
  }
}

function drawPickups(ctx, state, cam, now) {
  for (const k of state.pickups) {
    const x = bx(cam, k.x);
    const y = by(cam, k.y) + Math.round(Math.sin(now * 5 + k.x) * 1);
    drawSprite(ctx, k.kind === 'xp' ? 'xp' : 'credit', x, y);
  }
}

function drawBullets(ctx, state, cam) {
  for (const b of state.bullets) {
    const x = bx(cam, b.x);
    const y = by(cam, b.y);
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const tail = b.source === 'operator' ? 22 : b.source === 'headhunter' ? 9 : b.source === 'judge' ? 3 : 6;
    const color = b.source === 'headhunter' ? PAL.y : b.crit ? PAL.g : PAL.w;
    line(ctx, x - (b.vx / sp) * tail, y - (b.vy / sp) * tail, x, y, b.source === 'headhunter' ? PAL.g : 'rgba(236,232,225,0.45)', 1);
    rect(ctx, x - 1, y - 1, 2, 2, color);
  }
  for (const b of state.enemyBullets) {
    const x = bx(cam, b.x);
    const y = by(cam, b.y);
    const r = Math.max(2, Math.round(b.r / cam.S));
    const boss = b.source === 'boss';
    disc(ctx, x, y, r + 1, PAL.k);
    disc(ctx, x, y, r, boss ? PAL.r : PAL.p);
    rect(ctx, x - 1, y - 1, 1, 1, PAL.w);
  }
}

function drawBeamsAndRings(ctx, feel, cam, now) {
  for (const b of feel.beams) {
    const k = (now - b.t0) / b.dur;
    const w = Math.max(1, Math.round(9 * (1 - k)));
    line(ctx, bx(cam, b.x1), by(cam, b.y1), bx(cam, b.x2), by(cam, b.y2), PAL.g, w + 2);
    line(ctx, bx(cam, b.x1), by(cam, b.y1), bx(cam, b.x2), by(cam, b.y2), PAL.y, w);
    line(ctx, bx(cam, b.x1), by(cam, b.y1), bx(cam, b.x2), by(cam, b.y2), PAL.w, Math.max(1, w - 4));
  }
  for (const r of feel.rings) {
    const k = (now - r.t0) / r.dur;
    ctx.globalAlpha = 1 - k;
    ring(ctx, bx(cam, r.x), by(cam, r.y), (r.r / cam.S) * (0.3 + 0.7 * k), r.color, 2);
  }
  ctx.globalAlpha = 1;
}

function drawNumbers(ctx, feel, cam, now) {
  for (const n of feel.numbers) {
    const k = (now - n.t0) / 0.7;
    ctx.globalAlpha = 1 - k * k;
    text(ctx, n.text, bx(cam, n.x), by(cam, n.y) - k * 14, { color: n.color, font: 'small', align: 'center', base: 'middle' });
  }
  ctx.globalAlpha = 1;
}

// 조명: 어둠을 깔고 광원 자리를 지운다 (픽셀 버퍼라 자연스럽게 계단진다)
function drawLighting(buf, state, cam, view) {
  const { rs, feel, now } = view;
  if (!rs.light) rs.light = document.createElement('canvas');
  const L = rs.light;
  if (L.width !== buf.w || L.height !== buf.h) {
    L.width = buf.w;
    L.height = buf.h;
  }
  const g = L.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, L.width, L.height);
  g.fillStyle = LIGHT.ambient;
  g.fillRect(0, 0, L.width, L.height);
  g.globalCompositeOperation = 'destination-out';
  const hole = (wx, wy, r, strength = 1) => {
    const x = bx(cam, wx);
    const y = by(cam, wy);
    if (x < -r || y < -r || x > L.width + r || y > L.height + r) return;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(0,0,0,${strength})`);
    grad.addColorStop(0.6, `rgba(0,0,0,${strength * 0.6})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const p = state.player;
  hole(p.x, p.y, LIGHT.player);
  if (now - feel.lastShot < 0.05) hole(p.x + Math.cos(p.aim) * 22, p.y + Math.sin(p.aim) * 22, 45);
  for (const f of state.fields) hole(f.x, f.y, (f.r / cam.S) * 1.15, 0.8);
  for (const t of state.traps) hole(t.x, t.y, 14, 0.6);
  for (const d of state.devices) hole(d.x, d.y, d.kind === 'turret' ? 26 : 14, 0.7);
  for (const z of state.zones) if (z.flight <= 0) hole(z.x, z.y, (z.r / cam.S) * 1.1, 0.6);
  for (const l of state.lockdowns) hole(l.x, l.y, 40, 0.9);
  for (const e of state.enemies) if (e.type === 'boss' || e.type === 'elite') hole(e.x, e.y, e.type === 'boss' ? 60 : 30, 0.8);
  let n = 0;
  for (const b of state.enemyBullets) {
    if (n++ > 80) break;
    hole(b.x, b.y, 9, 0.7);
  }
  for (const b of feel.beams) {
    for (let t = 0; t <= 1; t += 0.1) hole(b.x1 + (b.x2 - b.x1) * t, b.y1 + (b.y2 - b.y1) * t, 40);
  }
  for (const r of feel.rings) hole(r.x, r.y, r.r / cam.S, 0.7);
  const anchor = p.skills.e.anchor;
  if (anchor) hole(anchor.x, anchor.y, 22, 0.7);
  buf.ctx.drawImage(L, 0, 0);
}
