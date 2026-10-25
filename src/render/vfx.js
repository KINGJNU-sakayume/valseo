// 스킬 연출 어휘 (설계 27장): 반투명 단색 원 대신 바닥 데칼, 분절 고리, 조준틀, 광주, 불꽃 꼬리를 조합한다.
// 모든 함수는 버퍼 픽셀 좌표를 받고 정수 격자에 맞춰 그린다. 상태를 갖지 않는다(시간 now 로만 움직인다).
import { C, PAL } from './palette.js';
import { disc, line } from './pixel.js';

const R = Math.round;
const TAU = Math.PI * 2;

/** 작은 반복 무늬 하나로 만든 패턴 (원 안을 이 무늬로 채워 바닥 데칼처럼 보이게 한다). */
const patterns = new Map();
function pattern(ctx, key, rows, color) {
  const id = `${key}${color}`;
  if (patterns.has(id)) return patterns.get(id);
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d');
  g.fillStyle = color;
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === 'x' && g.fillRect(x, y, 1, 1)));
  const p = ctx.createPattern(c, 'repeat');
  patterns.set(id, p);
  return p;
}
const DIAMOND = ['x....x', '.x..x.', '..xx..', '..xx..', '.x..x.', 'x....x'];

/** 분절 고리: 일정 간격으로 끊어진 고리가 천천히 돈다. */
export function segRing(ctx, x, y, r, color, now, { n = 18, speed = 0.4, dir = 1, size = 1, duty = 0.55 } = {}) {
  ctx.fillStyle = color;
  const steps = Math.max(32, R(r * 7));
  const rot = now * speed * dir * TAU;
  for (let i = 0; i < steps; i++) {
    if (((i / steps) * n) % 1 > duty) continue;
    const a = rot + (i / steps) * TAU;
    ctx.fillRect(R(x + Math.cos(a) * r), R(y + Math.sin(a) * r), size, size);
  }
}

/** 조준틀: 네 모서리에 ㄱ 자 표시. */
export function brackets(ctx, x, y, r, color, len = 3) {
  ctx.fillStyle = color;
  const k = r * 0.78;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const cx = R(x + sx * k);
    const cy = R(y + sy * k);
    ctx.fillRect(sx > 0 ? cx - len : cx, cy, len + 1, 1);
    ctx.fillRect(cx, sy > 0 ? cy - len : cy, 1, len + 1);
  }
}

/** 퍼져 나가는 가는 맥동 고리 (주기 period 초). 호출 전 투명도를 기준으로 옅어진다. */
export function pulseRing(ctx, x, y, r, color, now, { period = 1.4, phase = 0 } = {}) {
  const base = ctx.globalAlpha;
  const k = (((now / period + phase) % 1) + 1) % 1;
  ctx.globalAlpha = base * (1 - k);
  segRing(ctx, x, y, r * (0.2 + 0.8 * k), color, now, { n: 40, duty: 0.8, speed: 0 });
  ctx.globalAlpha = base;
}

/** 원 안에서 떠오르는 점들 (상태 없이 시간으로 위치를 정한다). */
export function motes(ctx, x, y, r, color, now, { n = 10, rise = 14, speed = 0.6 } = {}) {
  const base = ctx.globalAlpha;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = (i * 2.399) % TAU;
    const d = r * (0.2 + 0.75 * ((i * 0.618) % 1));
    const t = (now * speed + i * 0.37) % 1;
    ctx.globalAlpha = base * Math.sin(t * Math.PI);
    ctx.fillRect(R(x + Math.cos(a) * d), R(y + Math.sin(a) * d * 0.9 - t * rise), 1, 1);
  }
  ctx.globalAlpha = base;
}

/** 마름모 격자로 채운 바닥 데칼 + 분절 이중 고리 + 조준틀 + 맥동. 감속 필드 같은 "영역"의 기본형. */
export function fieldDecal(ctx, x, y, r, now, { fade = 1, color = C.gold, pulse = C.goldLight, tint = 'rgba(246,215,126,0.07)', stack = false } = {}) {
  ctx.globalAlpha = fade;
  disc(ctx, x, y, r, tint);
  const pat = pattern(ctx, 'diamond', DIAMOND, color);
  pat.setTransform?.(new DOMMatrix([1, 0, 0, 1, Math.floor(now * 4) % 6, Math.floor(now * 2) % 6]));
  ctx.globalAlpha = (stack ? 0.5 : 0.36) * fade;
  disc(ctx, x, y, r, pat);
  ctx.globalAlpha = 0.9 * fade;
  segRing(ctx, x, y, r, color, now, { n: 16, speed: 0.08, size: 1, duty: 0.6 });
  ctx.globalAlpha = 0.5 * fade;
  segRing(ctx, x, y, r - 3, pulse, now, { n: 24, speed: 0.12, dir: -1, duty: 0.35 });
  ctx.globalAlpha = 0.8 * fade;
  brackets(ctx, x, y, r + 2, color, 3);
  ctx.globalAlpha = fade;
  pulseRing(ctx, x, y, r, pulse, now, { period: 1.6 });
  pulseRing(ctx, x, y, r, pulse, now, { period: 1.6, phase: 0.5 });
  ctx.globalAlpha = 0.9 * fade;
  motes(ctx, x, y, r * 0.9, pulse, now, { n: 12, rise: 12 });
  ctx.globalAlpha = 1;
}

/** 바닥에서 솟는 빛기둥: 위로 갈수록 옅어진다. */
export function pillar(ctx, x, y, h, color, alpha = 0.5, w = 3) {
  ctx.fillStyle = color;
  for (let i = 0; i < h; i += 2) {
    ctx.globalAlpha = alpha * (1 - i / h);
    ctx.fillRect(R(x - w / 2), R(y - i - 2), w, 2);
  }
  ctx.globalAlpha = 1;
}

/** 은은한 발광: 밝은 색을 겹쳐 더하는 동심 원 (가산 합성). */
export function glow(ctx, x, y, r, color, alpha = 0.3) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 3; i >= 1; i--) {
    ctx.globalAlpha = alpha * (1 - i / 4) * 0.8;
    disc(ctx, x, y, R((r * i) / 3), color);
  }
  ctx.restore();
}

/** 불꽃 꼬리: 진행 방향 반대로 보라→분홍→주황→노랑 순으로 짧게 흩날린다 (체임버 총탄·역작). */
export function flameTrail(ctx, x, y, ux, uy, len, now, { thick = 1 } = {}) {
  const cols = [PAL.y, PAL.o, PAL.c, PAL.P];
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const col = cols[Math.min(3, Math.floor(t * 4))];
    const wob = Math.sin(now * 40 + i * 1.7) * (0.5 + t * 1.2);
    ctx.globalAlpha = 1 - t * 0.85;
    ctx.fillStyle = col;
    ctx.fillRect(R(x - ux * i - uy * wob), R(y - uy * i + ux * wob), thick, thick);
  }
  ctx.globalAlpha = 1;
}

// ── 균열 데칼: "지형이 불안정해진다" (체임버 감속 필드) ────────────────────────
const fractures = new WeakMap();
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 영역마다 한 번만 만드는 균열 모양 (중심에서 뻗는 꺾인 선, 곁가지, 떠다니는 파편). 객체 키로 캐시한다. */
function fractureShape(key, seed, r) {
  let f = fractures.get(key);
  if (f && f.r === r) return f;
  const rand = seeded(seed);
  const cracks = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU + (rand() - 0.5) * 0.5;
    const len = r * (0.55 + 0.45 * rand());
    const pts = [[0, 0]];
    const steps = 5;
    let a = a0;
    for (let k = 1; k <= steps; k++) {
      a += (rand() - 0.5) * 0.55;
      const d = (len * k) / steps;
      pts.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    const branches = [];
    if (rand() < 0.7) {
      const k = 2 + Math.floor(rand() * 2);
      const ba = a0 + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.5);
      const [bx0, by0] = pts[k];
      branches.push([[bx0, by0], [bx0 + Math.cos(ba) * len * 0.22, by0 + Math.sin(ba) * len * 0.22], [bx0 + Math.cos(ba + 0.3) * len * 0.4, by0 + Math.sin(ba + 0.3) * len * 0.4]]);
    }
    cracks.push({ pts, branches });
  }
  const shards = [];
  for (let j = 0; j < 14; j++) {
    const a = rand() * TAU;
    const d = r * (0.25 + 0.7 * Math.sqrt(rand()));
    shards.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.9, ph: rand() * TAU, big: rand() < 0.3 });
  }
  f = { r, cracks, shards };
  fractures.set(key, f);
  return f;
}

/**
 * 균열 데칼: 중심에서 금빛 균열이 뻗고, 파편이 떠오르며, 가장자리는 분절 고리와 조준틀로 맺힌다.
 * 둥근 단색 원 대신 "금이 간 지면"으로 읽히게 하는 영역 표현이다.
 */
export function fractureDecal(ctx, x, y, r, now, { key, seed = 1, fade = 1, color = C.gold, hot = C.goldLight, stack = false } = {}) {
  const sh = fractureShape(key ?? {}, seed, r);
  ctx.globalAlpha = 0.07 * fade;
  disc(ctx, x, y, r, color);
  // 균열 (중심이 밝고 끝으로 갈수록 어둡다), 천천히 맥동
  for (let i = 0; i < sh.cracks.length; i++) {
    const cr = sh.cracks[i];
    const pulse = 0.65 + 0.35 * Math.sin(now * 3 + i * 1.3);
    const drawPath = (pts, base) => {
      for (let k = 1; k < pts.length; k++) {
        const t = k / (pts.length - 1);
        ctx.globalAlpha = fade * base * pulse * (1 - t * 0.5);
        line(ctx, x + pts[k - 1][0], y + pts[k - 1][1], x + pts[k][0], y + pts[k][1], t < 0.5 ? hot : color, 1);
      }
    };
    drawPath(cr.pts, stack ? 1 : 0.85);
    for (const br of cr.branches) drawPath(br, 0.6);
  }
  // 떠오르는 파편
  ctx.fillStyle = color;
  for (const s of sh.shards) {
    const lift = Math.sin(now * 2 + s.ph) * 2 + 1;
    ctx.globalAlpha = fade * (0.5 + 0.3 * Math.sin(now * 3 + s.ph));
    ctx.fillRect(R(x + s.x), R(y + s.y - lift), s.big ? 2 : 1, s.big ? 2 : 1);
  }
  // 가장자리: 분절 고리 + 조준틀 + 맥동
  ctx.globalAlpha = 0.85 * fade;
  segRing(ctx, x, y, r, color, now, { n: 20, speed: 0.05, duty: 0.65 });
  segRing(ctx, x, y, r - 1, hot, now, { n: 20, speed: 0.05, duty: 0.2 });
  ctx.globalAlpha = 0.45 * fade;
  segRing(ctx, x, y, r - 4, color, now, { n: 28, speed: 0.1, dir: -1, duty: 0.3 });
  ctx.globalAlpha = 0.8 * fade;
  brackets(ctx, x, y, r + 2, color, 3);
  ctx.globalAlpha = fade;
  pulseRing(ctx, x, y, r, hot, now, { period: 2 });
  ctx.globalAlpha = 1;
}

// ── 킬조이 ───────────────────────────────────────────────────────────────────

/** 나노봇 떼: 중심이 짙고 가장자리는 성긴 점들이 제각기 궤도를 돌며 떤다 (나노스웜). */
export function swarmDecal(ctx, x, y, r, now, { seed = 0, fade = 1, vulnerable = false } = {}) {
  ctx.globalAlpha = 0.24 * fade;
  disc(ctx, x, y, r, '#1a1030');
  const n = Math.max(70, Math.min(220, R(r * 2.6)));
  const cols = [PAL.Y, PAL.p, PAL.l, PAL.y];
  for (let i = 0; i < n; i++) {
    const f1 = (i * 0.6180339 + seed * 0.137) % 1;
    const f2 = (i * 0.7548777) % 1;
    const dr = r * Math.sqrt(f1) * 0.98;
    const a = i * 2.39996 + (i % 2 ? 1 : -1) * (0.5 + f2) * now;
    const wob = Math.sin(now * 9 + i * 1.7);
    ctx.globalAlpha = fade * (0.7 + 0.3 * f2);
    ctx.fillStyle = cols[i % 4];
    const s = i % 6 === 0 ? 2 : 1;
    ctx.fillRect(R(x + Math.cos(a) * dr + wob), R(y + Math.sin(a) * dr * 0.9 + Math.cos(now * 8 + i)), s, s);
  }
  ctx.globalAlpha = 0.8 * fade;
  segRing(ctx, x, y, r, vulnerable ? C.gold : C.purple, now, { n: 14, speed: 0.1, duty: 0.45 });
  ctx.globalAlpha = 1;
}

/** 봉쇄 돔: 방사 선과 이중 분절 고리, 기동까지 줄어드는 카운트다운 고리. k = 남은 비율(1→0). */
export function domeDecal(ctx, x, y, r, now, { k = 1, fade = 1, color = C.gold, hot = PAL.Y } = {}) {
  ctx.globalAlpha = 0.08 * fade;
  disc(ctx, x, y, r, color);
  ctx.globalAlpha = 0.35 * fade;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + now * 0.08;
    line(ctx, x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, x + Math.cos(a) * r * 0.96, y + Math.sin(a) * r * 0.96, color, 1);
  }
  ctx.globalAlpha = 0.9 * fade;
  segRing(ctx, x, y, r, color, now, { n: 12, size: 2, duty: 0.6, speed: 0.05 });
  ctx.globalAlpha = 0.55 * fade;
  segRing(ctx, x, y, r * 0.66, color, now, { n: 18, duty: 0.5, speed: 0.1, dir: -1 });
  ctx.globalAlpha = 0.95 * fade;
  segRing(ctx, x, y, Math.max(3, r * k), hot, now, { n: 36, duty: 0.75, speed: 0 });
  ctx.globalAlpha = 1;
}

/** 별무늬 폭발: 중심에서 뻗는 방사 줄기. k 는 진행도 0→1. */
export function starBurst(ctx, x, y, r, color, k, { spokes = 8 } = {}) {
  ctx.fillStyle = color;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU + 0.2;
    const r0 = r * (0.15 + 0.5 * k);
    const r1 = r * (0.35 + 0.65 * k);
    line(ctx, x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, color, i % 2 ? 1 : 2);
  }
}

// ── 레이나 ───────────────────────────────────────────────────────────────────

/** 눈총의 시선: 바닥에 흐린 보랏빛, 바깥으로 뻗는 속눈썹 같은 눈금, 반대로 도는 분홍 고리. */
export function eyeDecal(ctx, x, y, r, now, { fade = 1 } = {}) {
  ctx.globalAlpha = 0.12 * fade;
  disc(ctx, x, y, r, PAL.K);
  ctx.globalAlpha = 0.85 * fade;
  segRing(ctx, x, y, r, PAL.p, now, { n: 18, speed: 0.07, duty: 0.55, size: 2 });
  ctx.globalAlpha = 0.6 * fade;
  segRing(ctx, x, y, r - 4, PAL.c, now, { n: 12, speed: 0.1, dir: -1, duty: 0.3 });
  // 눈금: 바깥쪽으로 짧게 뻗는 속눈썹 모양
  ctx.fillStyle = PAL.L;
  ctx.globalAlpha = 0.7 * fade;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + now * 0.05;
    const len = i % 2 ? 2 : 4;
    for (let k = 0; k < len; k++) ctx.fillRect(R(x + Math.cos(a) * (r + 2 + k)), R(y + Math.sin(a) * (r + 2 + k)), 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** 영혼 구슬 둘레의 흩날리는 보랏빛 꼬리. */
export function soulWisps(ctx, x, y, now, seed = 0) {
  for (let i = 0; i < 4; i++) {
    const t = (now * 1.4 + i * 0.25 + seed) % 1;
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.fillStyle = i % 2 ? PAL.p : PAL.c;
    ctx.fillRect(R(x + Math.sin(now * 5 + i * 2 + seed) * 2), R(y - t * 9), 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** 여제의 발밑 문양: 8갈래 별 + 도는 보랏빛 고리와 피어오르는 불꽃 점. */
export function empressSigil(ctx, x, y, now) {
  ctx.globalAlpha = 0.6;
  segRing(ctx, x, y, 16, PAL.p, now, { n: 10, speed: 0.3, duty: 0.55, size: 2 });
  ctx.globalAlpha = 0.5;
  segRing(ctx, x, y, 10, PAL.c, now, { n: 8, speed: 0.4, dir: -1, duty: 0.45 });
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + now * 0.5;
    line(ctx, x + Math.cos(a) * 5, y + Math.sin(a) * 5 * 0.8, x + Math.cos(a) * 15, y + Math.sin(a) * 15 * 0.8, PAL.L, 1);
  }
  ctx.globalAlpha = 1;
  motes(ctx, x, y - 2, 12, PAL.c, now, { n: 10, rise: 22, speed: 0.9 });
}

