// UI 레이어 (픽셀 버퍼 좌표). HUD, 레벨업/분기/상점 오버레이, 일시정지, 타이틀, 결과.
import { GUNS, TIERS } from '../data/guns.js';
import { ROUNDS } from '../data/rounds.js';
import { SKILLS, ULT } from '../data/skills.js';
import { AGENTS } from '../data/agents.js';
import { BOSS } from '../data/enemies.js';
import { maxHp } from '../core/stats.js';
import { xpNeed } from '../core/systems/progression.js';
import { abilityStatus } from '../core/systems/skills.js';
import { evolutionHint } from '../core/systems/evolution.js';
import { bossPhase } from '../core/systems/enemies.js';
import { C, PAL } from './palette.js';
import { rect, panel, text, wrap, textWidth, line } from './pixel.js';
import { bx, by } from './camera.js';
import { drawSprite } from './sprites.js';
import { SETTING_ITEMS } from './settings.js';

// 스킬 id → 아이콘 스프라이트
const SKILL_ICON = {
  trademark: 'trap', rendezvous: 'anchor', headhunter: 'gun_headhunter', tourDeForce: 'gun_tourdeforce',
  alarmbot: 'alarmbot0', nanoswarm: 'nanoswarm', turret: 'turret', lockdown: 'lockdown',
};
const slotIcon = (state, slot) => SKILL_ICON[state.player.skills[slot].id];
const slotSkill = (state, slot) => SKILLS[state.player.skills[slot].id];
const PASSIVE_ICON = {
  maxHp: 'heart', moveSpeed: 'boot', magnetRadius: 'magnet', xpGain: 'p_xp', creditGain: 'p_coin', critDamage: 'p_crit',
  cooldown: 'p_clock', armor: 'p_armor', killHeal: 'p_heal', duration: 'p_hourglass', orbDrop: 'p_orb', invuln: 'p_bubble',
};
const CARD_TAG = {
  skill: { label: '스킬', color: C.gold },
  gunMod: { label: '총기 개조', color: C.teal },
  passive: { label: '패시브', color: C.shield },
  heal: { label: '회복', color: C.hp },
};

// ───────────────────────── HUD ─────────────────────────

export function drawHud(ctx, state, W, H, view) {
  const { feel, now } = view;
  drawTop(ctx, state, W);
  drawHealth(ctx, state, H);
  drawAbilities(ctx, state, W, H, now);
  drawWeapons(ctx, state, W, H);
  drawOffscreen(ctx, state, W, H, view.cam, now);
  // 저체력·피격 비네트
  const p = state.player;
  const low = p.hp / maxHp(p) < 0.3 ? 0.35 + 0.2 * Math.sin(now * 6) : 0;
  const v = Math.max(low, feel.hurt * 0.6);
  if (v > 0) vignette(ctx, W, H, v);
  drawBanners(ctx, feel, W, H, now);
}

function vignette(ctx, W, H, a) {
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(255,40,60,${(a * (10 - i)) / 40})`;
    ctx.fillRect(i * 2, i * 2, W - i * 4, 2);
    ctx.fillRect(i * 2, H - i * 2 - 2, W - i * 4, 2);
    ctx.fillRect(i * 2, i * 2, 2, H - i * 4);
    ctx.fillRect(W - i * 2 - 2, i * 2, 2, H - i * 4);
  }
}

function drawTop(ctx, state, W) {
  const p = state.player;
  const cx = Math.round(W / 2);
  // XP 바 (최상단 전체)
  rect(ctx, 0, 0, W, 3, '#0b1118');
  rect(ctx, 0, 0, W * Math.min(1, p.xp / xpNeed(p.level)), 2, C.xp);

  // 중앙 라운드 패널
  panel(ctx, cx - 56, 6, 112, 34, { fill: C.panel, edge: C.panelEdge, cut: 4 });
  const bossRound = state.round === ROUNDS.bossRound;
  const left = Math.max(0, ROUNDS.combatTime - state.roundTime);
  const timer = state.phase !== 'COMBAT' ? '--:--' : bossRound ? 'BOSS' : fmt(left);
  text(ctx, timer, cx, 9, { font: 'big', align: 'center', color: !bossRound && left < 10 && state.phase === 'COMBAT' ? C.red : C.white });
  text(ctx, `라운드 ${state.round} / ${ROUNDS.count}`, cx, 30, { font: 'small', align: 'center', color: C.dim });
  // 라운드 진행 눈금
  for (let i = 0; i < ROUNDS.count; i++) {
    const x = cx - 54 + i * 9;
    rect(ctx, x, 42, 7, 2, i < state.round - 1 ? C.teal : i === state.round - 1 ? C.red : C.dim2);
  }

  // 왼쪽: 레벨, 처치
  panel(ctx, 6, 6, 74, 24, { fill: C.panel, edge: C.panelEdge, accent: C.teal });
  text(ctx, `Lv ${p.level}`, 12, 9, { font: 'bold', color: C.teal });
  text(ctx, `처치 ${state.stats.kills}`, 12, 20, { font: 'small', color: C.dim });

  // 오른쪽: 크레딧
  panel(ctx, W - 86, 6, 80, 24, { fill: C.panel, edge: C.panelEdge, accent: C.gold });
  drawSprite(ctx, 'coin', W - 72, 18);
  text(ctx, `${state.credits}`, W - 12, 12, { font: 'bold', align: 'right', color: C.goldLight });

  const boss = state.enemies.find((e) => e.type === 'boss');
  if (boss) {
    const bw = Math.min(300, W - 200);
    const x = cx - bw / 2;
    const y = 60;
    const enraged = boss.age >= BOSS.enrageTime;
    text(ctx, `${BOSS.name} · ${bossPhase(BOSS, boss) + 1}단계${enraged ? ' · 격노' : ''}`, cx, y - 2, { font: 'small', align: 'center', base: 'bottom', color: enraged ? C.red : C.white });
    rect(ctx, x - 1, y - 1, bw + 2, 7, PAL.k);
    rect(ctx, x, y, bw, 5, '#3a1018');
    rect(ctx, x, y, bw * Math.max(0, boss.hp / boss.maxHp), 5, C.red);
    rect(ctx, x, y, bw * Math.max(0, boss.hp / boss.maxHp), 1, '#ff8a93');
    for (const ph of BOSS.phases) if (ph.until > 0) rect(ctx, x + bw * ph.until, y - 1, 1, 7, C.white);
  }
}

function drawHealth(ctx, state, H) {
  const p = state.player;
  const mh = maxHp(p);
  const x = 6;
  const y = H - 40;
  panel(ctx, x, y, 128, 34, { fill: C.panel, edge: C.panelEdge, cut: 4 });
  const low = p.hp / mh < 0.3;
  text(ctx, `${Math.ceil(p.hp)}`, x + 8, y + 4, { font: 'big', color: low ? C.red : C.white });
  const hpW = textWidth(ctx, `${Math.ceil(p.hp)}`, 'big');
  if (p.shield > 0) {
    drawSprite(ctx, 'shield', x + 16 + hpW, y + 13);
    text(ctx, `${Math.ceil(p.shield)}`, x + 23 + hpW, y + 9, { font: 'bold', color: C.shield });
  }
  const bw = 112;
  rect(ctx, x + 8, y + 26, bw, 4, '#0b1118');
  rect(ctx, x + 8, y + 26, bw * Math.max(0, p.hp / mh), 4, low ? C.red : C.hp);
  if (p.shieldMax > 0) rect(ctx, x + 8, y + 24, bw * (p.shield / p.shieldMax), 1, C.shield);
}

function drawAbilities(ctx, state, W, H, now) {
  const p = state.player;
  const keys = ['c', 'q', 'e', 'x'];
  const box = 26;
  const gap = 6;
  const total = keys.length * box + (keys.length - 1) * gap;
  const x0 = Math.round(W / 2 - total / 2);
  const y = H - 38;
  keys.forEach((k, i) => {
    const x = x0 + i * (box + gap);
    const s = p.skills[k];
    const locked = s.level <= 0;
    const { ready, pips, label } = abilityStatus(state, k);
    const isReady = !locked && ready >= 1;
    panel(ctx, x, y, box, box, { fill: C.panelSolid, edge: isReady ? (k === 'x' ? C.gold : C.white) : C.panelEdge, cut: 3 });
    if (!locked) {
      ctx.globalAlpha = isReady ? 1 : 0.45;
      drawSprite(ctx, slotIcon(state, k), x + box / 2, y + box / 2 - 1);
      ctx.globalAlpha = 1;
      if (ready < 1) rect(ctx, x + 1, y + 1, box - 2, Math.round((box - 2) * (1 - ready)), 'rgba(0,0,0,0.55)');
      if (label) text(ctx, label, x + box / 2, y + box / 2, { font: 'bold', align: 'center', base: 'middle' });
      if (k === 'x' && isReady) {
        const glow = 0.4 + 0.3 * Math.sin(now * 6);
        ctx.globalAlpha = glow;
        rect(ctx, x - 1, y - 1, box + 2, 1, C.goldLight);
        rect(ctx, x - 1, y + box, box + 2, 1, C.goldLight);
        ctx.globalAlpha = 1;
      }
      if (s.branch) text(ctx, s.branch, x + box - 3, y + 2, { font: 'small', align: 'right', color: C.gold });
    } else {
      text(ctx, '잠김', x + box / 2, y + box / 2, { font: 'small', align: 'center', base: 'middle', color: C.dim2 });
    }
    text(ctx, k.toUpperCase(), x + box / 2, y + box + 2, { font: 'small', align: 'center', color: locked ? C.dim2 : C.dim });
    // 충전/탄창/오브 핍
    if (!locked && pips.length) {
      const pw = pips.length > 6 ? 2 : 3;
      const tw = pips.length * (pw + 1) - 1;
      pips.forEach((on, j) => rect(ctx, x + box / 2 - tw / 2 + j * (pw + 1), y - 4, pw, 2, on ? (k === 'x' ? C.gold : C.teal) : C.dim2));
    }
  });
}

function drawWeapons(ctx, state, W, H) {
  const p = state.player;
  const w = 132;
  const h = 23;
  const x = W - w - 6;
  [1, 0].forEach((slotIdx, row) => {
    const slot = p.guns[slotIdx];
    const y = H - 54 + row * (h + 3);
    const active = slot && !(slotIdx === 0 && p.precision);
    panel(ctx, x, y, w, h, { fill: C.panel, edge: slot?.evolved ? C.gold : C.panelEdge, cut: 3 });
    if (!slot) {
      text(ctx, slotIdx === 0 ? '주무기 없음' : '보조 없음', x + w / 2, y + h / 2, { font: 'small', align: 'center', base: 'middle', color: C.dim2 });
      return;
    }
    ctx.globalAlpha = active ? 1 : 0.4;
    drawSprite(ctx, `gun_${slot.id}`, x + 15, y + h / 2);
    ctx.globalAlpha = 1;
    const name = slot.evolved ? GUNS[slot.id].evolution.name : GUNS[slot.id].name;
    text(ctx, name, x + 30, y + 3, { font: 'small', color: slot.evolved ? C.goldLight : C.white });
    for (let t = 0; t < TIERS.max; t++) rect(ctx, x + w - 22 + t * 6, y + 4, 4, 3, t < slot.tier ? C.gold : C.dim2);
    const hint = evolutionHint(state, slot);
    if (hint) {
      const s = `진화 T3${hint.tierOk ? '✓' : ''} ${hint.skill.toUpperCase()}${hint.level}${hint.skillOk ? '✓' : ''}`;
      text(ctx, s, x + 30, y + 12, { font: 'small', color: C.dim, shadow: false });
    }
  });
}

/** 화면 밖 엘리트·보스 방향 표시. */
function drawOffscreen(ctx, state, W, H, cam, now) {
  for (const e of state.enemies) {
    if (e.type !== 'elite' && e.type !== 'boss') continue;
    const x = bx(cam, e.x);
    const y = by(cam, e.y);
    if (x > 10 && y > 10 && x < W - 10 && y < H - 10) continue;
    const cx = W / 2;
    const cy = H / 2;
    const a = Math.atan2(y - cy, x - cx);
    const m = 18;
    const t = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
    const ax = cx + Math.cos(a) * t;
    const ay = cy + Math.sin(a) * t;
    const col = Math.floor(now * 4) % 2 ? C.red : '#ff8a93';
    line(ctx, ax, ay, ax - Math.cos(a - 0.5) * 7, ay - Math.sin(a - 0.5) * 7, col, 2);
    line(ctx, ax, ay, ax - Math.cos(a + 0.5) * 7, ay - Math.sin(a + 0.5) * 7, col, 2);
  }
}

function drawBanners(ctx, feel, W, H, now) {
  const b = feel.banners[feel.banners.length - 1];
  if (!b) return;
  const k = (now - b.t0) / b.dur;
  const slide = k < 0.12 ? 1 - k / 0.12 : k > 0.85 ? (k - 0.85) / 0.15 : 0;
  const y = Math.round(H * 0.3);
  const off = Math.round(slide * W * 0.6) * (k > 0.5 ? -1 : 1);
  ctx.globalAlpha = 1 - Math.max(0, (k - 0.85) / 0.15);
  rect(ctx, 0 + off, y - 2, W, 32, 'rgba(15,25,35,0.85)');
  rect(ctx, 0 + off, y - 2, W, 2, b.color);
  rect(ctx, 0 + off, y + 28, W, 1, b.color);
  text(ctx, b.text, W / 2 + off, y + 1, { font: 'bigBold', align: 'center', color: C.white });
  if (b.sub) text(ctx, b.sub, W / 2 + off, y + 20, { font: 'small', align: 'center', color: b.color });
  ctx.globalAlpha = 1;
}

export function drawCrosshair(ctx, x, y, precision) {
  const col = precision ? C.goldLight : '#7cff9e';
  x = Math.round(x);
  y = Math.round(y);
  rect(ctx, x - 6, y, 4, 1, 'rgba(0,0,0,0.6)');
  for (const [dx, dy, w, h] of [[-6, 0, 4, 1], [3, 0, 4, 1], [0, -6, 1, 4], [0, 3, 1, 4]]) {
    rect(ctx, x + dx + 1, y + dy + 1, w, h, 'rgba(0,0,0,0.6)');
    rect(ctx, x + dx, y + dy, w, h, col);
  }
  rect(ctx, x, y, 1, 1, col);
  if (precision) {
    rect(ctx, x - 9, y - 9, 3, 1, col);
    rect(ctx, x - 9, y - 9, 1, 3, col);
    rect(ctx, x + 7, y - 9, 3, 1, col);
    rect(ctx, x + 9, y - 9, 1, 3, col);
    rect(ctx, x - 9, y + 9, 3, 1, col);
    rect(ctx, x - 9, y + 7, 1, 3, col);
    rect(ctx, x + 7, y + 9, 3, 1, col);
    rect(ctx, x + 9, y + 7, 1, 3, col);
  }
}

// ───────────────────────── 오버레이 레이아웃 ─────────────────────────

const CARD = { w: 124, h: 150, gap: 10 };

/** pending 오버레이의 클릭 영역 (option index 순). */
export function overlayLayout(state, W, H) {
  const pending = state.pending;
  if (!pending) return [];
  const n = pending.options.length;
  if (pending.kind === 'levelup' || pending.kind === 'branch') {
    const w = pending.kind === 'branch' ? 150 : CARD.w;
    const total = n * w + (n - 1) * CARD.gap;
    const x0 = Math.round(W / 2 - total / 2);
    const y = Math.round(H / 2 - CARD.h / 2 + 10);
    return pending.options.map((_, i) => ({ x: x0 + i * (w + CARD.gap), y, w, h: CARD.h }));
  }
  return shopLayout(state, W, H).rects;
}

export function overlayHit(state, W, H, mx, my) {
  return overlayLayout(state, W, H).findIndex((r) => r && mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h);
}

export function drawOverlay(ctx, state, W, H, mouse, now) {
  const pending = state.pending;
  if (!pending) return;
  ctx.fillStyle = 'rgba(6,9,13,0.82)';
  ctx.fillRect(0, 0, W, H);
  const hover = overlayHit(state, W, H, mouse.x, mouse.y);
  if (pending.kind === 'shop') return drawShop(ctx, state, W, H, hover);
  const rects = overlayLayout(state, W, H);
  const head = pending.kind === 'branch' ? `분기 선택 · ${slotSkill(state, pending.key).name}` : '레벨 업';
  const sub = pending.kind === 'branch' ? '하나만 고를 수 있습니다' : `Lv ${state.player.level - state.levelUpsQueued + 1} · 보상을 하나 선택`;
  stripeTitle(ctx, W, rects[0].y - 54, head, sub, pending.kind === 'branch' ? C.gold : C.teal);
  pending.options.forEach((opt, i) => drawCard(ctx, state, opt, rects[i], i, i === hover, pending.kind, now));
}

function stripeTitle(ctx, W, y, title, sub, color) {
  rect(ctx, W / 2 - 90, y + 30, 180, 1, color);
  text(ctx, title, W / 2, y, { font: 'bigBold', align: 'center' });
  text(ctx, sub, W / 2, y + 34, { font: 'small', align: 'center', color: C.dim });
}

function drawCard(ctx, state, opt, r, i, hover, kind, now) {
  const y = r.y - (hover ? 3 : 0);
  const tag = kind === 'branch' ? { label: `분기 ${opt.branch}`, color: C.gold } : CARD_TAG[opt.type] ?? CARD_TAG.heal;
  panel(ctx, r.x, y, r.w, r.h, { fill: hover ? '#16222e' : C.panelSolid, edge: hover ? tag.color : C.panelEdge, cut: 6 });
  rect(ctx, r.x + 6, y + 1, r.w - 7, 2, tag.color);
  text(ctx, tag.label, r.x + 8, y + 8, { font: 'small', color: tag.color });
  text(ctx, `${i + 1}`, r.x + r.w - 8, y + 8, { font: 'small', align: 'right', color: C.dim });
  // 아이콘 영역
  rect(ctx, r.x + r.w / 2 - 20, y + 24, 40, 30, '#0b1118');
  const icon = kind === 'branch' ? slotIcon(state, state.pending.key) : cardIcon(state, opt);
  const bobY = hover ? Math.round(Math.sin(now * 8)) : 0;
  if (icon) drawSprite(ctx, icon, r.x + r.w / 2, y + 39 + bobY, { scale: 2 });
  if (kind === 'branch') text(ctx, opt.branch, r.x + r.w / 2 + 26, y + 44, { font: 'bigBold', align: 'center', base: 'middle', color: C.gold });
  const title = kind === 'branch' ? opt.title.replace(/^\[.\]\s*/, '') : opt.title;
  const lines = wrap(ctx, title, r.x + r.w / 2, y + 62, r.w - 14, 12, { font: 'bold', align: 'center' });
  wrap(ctx, opt.desc ?? '', r.x + r.w / 2, y + 66 + lines * 12, r.w - 14, 11, { font: 'small', align: 'center', color: kind === 'branch' ? C.white : C.goldLight });
  // 레벨 핍
  if (kind === 'levelup' && opt.level) {
    const m = /^(\d+)\/(\d+)$/.exec(opt.level);
    if (m) {
      const cur = Number(m[1]);
      const max = Number(m[2]);
      const tw = max * 7 - 2;
      for (let k = 0; k < max; k++) rect(ctx, r.x + r.w / 2 - tw / 2 + k * 7, y + r.h - 12, 5, 3, k < cur - 1 ? C.dim : k === cur - 1 ? tag.color : C.dim2);
    }
  }
}

function cardIcon(state, opt) {
  if (opt.type === 'skill') return slotIcon(state, opt.key);
  if (opt.type === 'gunMod') return `gun_${opt.gunId}`;
  if (opt.type === 'passive') return PASSIVE_ICON[opt.key];
  return 'medkit';
}

// ───────────────────────── 상점 (구매 페이즈) ─────────────────────────

const SHOP_COLS = [
  { title: '무기', kinds: ['buyGun'] },
  { title: '강화', kinds: ['tierUp'] },
  { title: '방어구', kinds: ['armor'] },
  { title: '유틸리티', kinds: ['ultOrb', 'card'] },
];

function shopLayout(state, W, H) {
  const opts = state.pending.options;
  const colW = Math.min(124, Math.floor((W - 12 - 156 - 18) / 4));
  const itemH = 52;
  const x0 = 12;
  const y0 = 62;
  const rects = new Array(opts.length).fill(null);
  SHOP_COLS.forEach((col, c) => {
    let k = 0;
    opts.forEach((o, i) => {
      if (!col.kinds.includes(o.kind)) return;
      rects[i] = { x: x0 + c * (colW + 6), y: y0 + k * (itemH + 5), w: colW, h: itemH };
      k++;
    });
  });
  const next = opts.findIndex((o) => o.kind === 'next');
  rects[next] = { x: W - 150, y: H - 44, w: 138, h: 30 };
  return { rects, colW, x0, y0 };
}

function drawShop(ctx, state, W, H, hover) {
  const { rects, colW, x0, y0 } = shopLayout(state, W, H);
  const opts = state.pending.options;
  // 헤더
  rect(ctx, 0, 0, W, 40, 'rgba(15,25,35,0.95)');
  rect(ctx, 0, 40, W, 1, C.red);
  text(ctx, '구매 페이즈', 12, 8, { font: 'bigBold' });
  text(ctx, `라운드 ${state.round} 클리어 · 다음: 라운드 ${state.round + 1}${state.round + 1 === ROUNDS.bossRound ? ' (보스)' : ''}`, 12, 29, { font: 'small', color: C.dim });
  drawSprite(ctx, 'coin', W - 100, 20);
  text(ctx, `${state.credits}`, W - 14, 11, { font: 'bigBold', align: 'right', color: C.goldLight });

  SHOP_COLS.forEach((col, c) => text(ctx, col.title, x0 + c * (colW + 6) + 2, y0 - 13, { font: 'small', color: C.dim }));

  opts.forEach((o, i) => {
    const r = rects[i];
    if (!r || o.kind === 'next') return;
    const on = o.enabled;
    const hov = i === hover && on;
    panel(ctx, r.x, r.y, r.w, r.h, { fill: hov ? '#1b2a38' : on ? C.panelSolid : '#0b1118', edge: hov ? C.white : C.panelEdge, cut: 4 });
    ctx.globalAlpha = on ? 1 : 0.45;
    const icon = shopIcon(state, o);
    if (icon) drawSprite(ctx, icon, r.x + r.w - 14, r.y + 10);
    text(ctx, shortTitle(o), r.x + 6, r.y + 5, { font: 'bold', color: on ? C.white : C.dim });
    wrap(ctx, o.desc, r.x + 6, r.y + 18, r.w - 12, 9, { font: 'small', color: C.dim, shadow: false });
    ctx.globalAlpha = 1;
    rect(ctx, r.x + 1, r.y + r.h - 13, r.w - 2, 12, 'rgba(0,0,0,0.35)');
    drawSprite(ctx, 'coin', r.x + r.w - 8, r.y + r.h - 7);
    text(ctx, o.blocked ? (o.kind === 'armor' ? '보유 중' : '구매 불가') : `${o.price}`, r.x + r.w - 14, r.y + r.h - 12, { font: 'bold', align: 'right', color: on ? C.goldLight : o.blocked ? C.dim2 : C.red });
    text(ctx, `${i + 1}`, r.x + 6, r.y + r.h - 11, { font: 'small', color: C.dim2 });
  });

  // 오른쪽: 내 장비
  const px = W - 150;
  panel(ctx, px, y0 - 14, 138, 150, { fill: C.panel, edge: C.panelEdge, cut: 4 });
  text(ctx, '내 장비', px + 8, y0 - 9, { font: 'small', color: C.dim });
  const p = state.player;
  let ly = y0 + 6;
  p.guns.forEach((slot, idx) => {
    text(ctx, idx === 0 ? '주무기' : '보조', px + 8, ly, { font: 'small', color: C.dim2 });
    if (slot) {
      drawSprite(ctx, `gun_${slot.id}`, px + 30, ly + 16);
      text(ctx, slot.evolved ? GUNS[slot.id].evolution.name : `${GUNS[slot.id].name} T${slot.tier}`, px + 52, ly + 11, { font: 'small', color: slot.evolved ? C.goldLight : C.white });
    } else text(ctx, '없음', px + 52, ly + 11, { font: 'small', color: C.dim2 });
    ly += 28;
  });
  drawSprite(ctx, 'shield', px + 14, ly + 6);
  text(ctx, `실드 ${p.shield}`, px + 24, ly + 2, { font: 'small', color: C.shield });
  ly += 16;
  text(ctx, `궁극기 오브 ${state.ultOrbs}/${ULT.orbsNeeded}`, px + 8, ly, { font: 'small', color: C.gold });
  ly += 14;
  const skills = Object.entries(p.skills).filter(([, s]) => s.level > 0).map(([k, s]) => `${k.toUpperCase()}${s.level}${s.branch ?? ''}`).join(' ');
  text(ctx, `스킬 ${skills}`, px + 8, ly, { font: 'small', color: C.white });

  // 다음 라운드 버튼
  const ni = opts.findIndex((o) => o.kind === 'next');
  const r = rects[ni];
  const hov = hover === ni;
  panel(ctx, r.x, r.y, r.w, r.h, { fill: hov ? C.red : C.redDark, edge: hov ? C.white : C.red, cut: 5 });
  text(ctx, '다음 라운드 ▶', r.x + r.w / 2, r.y + 6, { font: 'bold', align: 'center' });
  text(ctx, 'Enter', r.x + r.w / 2, r.y + 19, { font: 'small', align: 'center', color: '#ffd0d5' });
}

function shortTitle(o) {
  if (o.kind === 'card') return '무작위 카드';
  return o.title;
}

function shopIcon(state, o) {
  if (o.kind === 'buyGun') return `gun_${o.id}`;
  if (o.kind === 'tierUp') return `gun_${state.player.guns[o.slot].id}`;
  if (o.kind === 'armor') return 'shield';
  if (o.kind === 'ultOrb') return 'orb';
  if (o.kind === 'card') return 'card';
  return null;
}

// ───────────────────────── 일시정지 / 타이틀 / 결과 ─────────────────────────

const MENU = { w: 200, h: 20, gap: 4 };

function menuRects(W, H) {
  const n = SETTING_ITEMS.length + 1;
  const total = n * MENU.h + (n - 1) * MENU.gap;
  const x = Math.round(W / 2 - MENU.w / 2);
  const y0 = Math.round(H / 2 - total / 2 + 14);
  return Array.from({ length: n }, (_, i) => ({ x, y: y0 + i * (MENU.h + MENU.gap), w: MENU.w, h: MENU.h }));
}

export function pauseHit(W, H, mx, my) {
  return menuRects(W, H).findIndex((r) => mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h);
}

export function drawPause(ctx, W, H, settings, mouse) {
  ctx.fillStyle = 'rgba(6,9,13,0.85)';
  ctx.fillRect(0, 0, W, H);
  const rects = menuRects(W, H);
  const hover = pauseHit(W, H, mouse.x, mouse.y);
  stripeTitle(ctx, W, rects[0].y - 46, '일시정지', '숫자 키 또는 클릭으로 설정 변경', C.red);
  rects.forEach((r, i) => {
    const item = SETTING_ITEMS[i];
    panel(ctx, r.x, r.y, r.w, r.h, { fill: i === hover ? '#1b2a38' : C.panelSolid, edge: i === hover ? C.white : C.panelEdge, cut: 3 });
    if (item) {
      text(ctx, `${i + 1}`, r.x + 8, r.y + 5, { font: 'small', color: C.dim });
      text(ctx, item.label, r.x + 22, r.y + 4, { font: 'body' });
      const v = settings[item.key];
      const label = typeof v === 'number' ? `${Math.round(v * 100)}%` : v ? '켜짐' : '꺼짐';
      text(ctx, label, r.x + r.w - 8, r.y + 4, { font: 'bold', align: 'right', color: v ? C.goldLight : C.dim });
    } else {
      text(ctx, '계속하기  (P / Esc)', r.x + r.w / 2, r.y + 4, { font: 'bold', align: 'center', color: C.red });
    }
  });
}

export function drawTitle(ctx, W, H, now) {
  ctx.fillStyle = 'rgba(6,9,13,0.6)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const y = Math.round(H * 0.22);
  // 로고
  rect(ctx, cx - 110, y + 46, 220, 2, C.red);
  rect(ctx, cx - 110 + ((now * 60) % 200), y + 46, 20, 2, C.white);
  text(ctx, '집중포화', cx, y, { font: 'huge', align: 'center' });
  text(ctx, 'C R O S S F I R E', cx, y + 36, { font: 'small', align: 'center', color: C.red });
  const lines = [
    ['WASD', '이동'],
    ['마우스', '조준 (발사는 자동)'],
    ['C · Q · E', '스킬'],
    ['X', '궁극기 (오브 3개)'],
    ['1~9 · 클릭', '카드·상점 선택'],
    ['P / Esc', '일시정지 · 설정'],
  ];
  const ly = y + 64;
  lines.forEach(([k, v], i) => {
    text(ctx, k, cx - 8, ly + i * 13, { font: 'bold', align: 'right', color: C.goldLight });
    text(ctx, v, cx + 6, ly + i * 13, { font: 'body', color: C.white });
  });
  text(ctx, '12라운드를 버티고 보스를 쓰러뜨려라', cx, ly + lines.length * 13 + 8, { font: 'small', align: 'center', color: C.teal });
  if (Math.floor(now * 2) % 2 === 0) text(ctx, '클릭 또는 Enter 로 시작', cx, H - 34, { font: 'bigBold', align: 'center', color: C.red });
}

export function drawResult(ctx, state, W, H, now) {
  const p = state.player;
  const win = state.phase === 'VICTORY';
  ctx.fillStyle = 'rgba(6,9,13,0.88)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const color = win ? C.gold : C.red;
  rect(ctx, 0, 30, W, 46, 'rgba(15,25,35,0.95)');
  rect(ctx, 0, 30, W, 2, color);
  rect(ctx, 0, 75, W, 1, color);
  text(ctx, win ? '승리' : '패배', cx, 36, { font: 'huge', align: 'center', color });

  const stats = [
    ['라운드', `${state.round}`],
    ['레벨', `${p.level}`],
    ['처치', `${state.stats.kills}`],
    ['시간', fmt(state.time)],
    ['총 피해', Math.round(state.stats.damage).toLocaleString()],
    ['크레딧', state.stats.creditsEarned.toLocaleString()],
  ];
  const bw = 78;
  const sx = Math.round(cx - (stats.length * (bw + 4)) / 2);
  stats.forEach(([k, v], i) => {
    const x = sx + i * (bw + 4);
    panel(ctx, x, 90, bw, 36, { fill: C.panelSolid, edge: C.panelEdge, cut: 3 });
    text(ctx, k, x + bw / 2, 95, { font: 'small', align: 'center', color: C.dim });
    text(ctx, v, x + bw / 2, 107, { font: 'bold', align: 'center' });
  });

  // 빌드
  const bxp = Math.round(cx - 200);
  panel(ctx, bxp, 136, 400, 112, { fill: C.panel, edge: C.panelEdge, cut: 4 });
  text(ctx, `최종 빌드 · ${AGENTS[state.agent].name}`, bxp + 8, 141, { font: 'small', color: C.dim });
  p.guns.forEach((slot, i) => {
    const y = 158 + i * 20;
    if (!slot) return;
    drawSprite(ctx, `gun_${slot.id}`, bxp + 22, y + 5);
    text(ctx, slot.evolved ? GUNS[slot.id].evolution.name : `${GUNS[slot.id].name} T${slot.tier}`, bxp + 42, y, { font: 'body', color: slot.evolved ? C.goldLight : C.white });
  });
  let sxp = bxp + 200;
  Object.entries(p.skills).forEach(([k, s], i) => {
    const y = 156 + i * 21;
    ctx.globalAlpha = s.level > 0 ? 1 : 0.3;
    drawSprite(ctx, SKILL_ICON[s.id], sxp + 12, y + 6);
    ctx.globalAlpha = 1;
    const def = SKILLS[s.id];
    const br = s.branch ? ` ${def.branches[s.branch].name}` : '';
    text(ctx, s.level > 0 ? `${def.name} Lv${s.level}${br}` : `${def.name} -`, sxp + 30, y + 1, { font: 'small', color: s.level > 0 ? C.white : C.dim2 });
  });
  const pas = Object.entries(p.passives);
  pas.forEach(([k, n], i) => {
    drawSprite(ctx, PASSIVE_ICON[k], bxp + 16 + i * 60, 232);
    text(ctx, `×${n}`, bxp + 26 + i * 60, 227, { font: 'small', color: C.white });
  });
  if (!pas.length) text(ctx, '패시브 없음', bxp + 8, 228, { font: 'small', color: C.dim2 });
  if (Math.floor(now * 2) % 2 === 0) text(ctx, 'R 키로 다시 시작', cx, H - 30, { font: 'bigBold', align: 'center', color });
}

// ───────────────────────── 에이전트 선택 ─────────────────────────

export const AGENT_LIST = Object.keys(AGENTS);
const AGENT_CARD = { w: 210, h: 222, gap: 14 };
const AGENT_SLOTS = ['c', 'q', 'e', 'x'];
const AGENT_TINT = { chamber: C.gold, killjoy: '#f6e05e' };

function agentRects(W, H) {
  const n = AGENT_LIST.length;
  const total = n * AGENT_CARD.w + (n - 1) * AGENT_CARD.gap;
  const x0 = Math.round(W / 2 - total / 2);
  const y = Math.round(H / 2 - AGENT_CARD.h / 2 + 16);
  return AGENT_LIST.map((_, i) => ({ x: x0 + i * (AGENT_CARD.w + AGENT_CARD.gap), y, w: AGENT_CARD.w, h: AGENT_CARD.h }));
}

export function agentSelectHit(W, H, mx, my) {
  return agentRects(W, H).findIndex((r) => mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h);
}

export function drawAgentSelect(ctx, W, H, mouse, now) {
  ctx.fillStyle = 'rgba(6,9,13,0.8)';
  ctx.fillRect(0, 0, W, H);
  const rects = agentRects(W, H);
  const hover = agentSelectHit(W, H, mouse.x, mouse.y);
  stripeTitle(ctx, W, rects[0].y - 50, '에이전트 선택', '1 / 2 키 또는 클릭', C.red);
  AGENT_LIST.forEach((id, i) => {
    const a = AGENTS[id];
    const r = rects[i];
    const hov = i === hover;
    const tint = AGENT_TINT[id] ?? C.gold;
    const y = r.y - (hov ? 3 : 0);
    panel(ctx, r.x, y, r.w, r.h, { fill: hov ? '#16222e' : C.panelSolid, edge: hov ? tint : C.panelEdge, cut: 6 });
    rect(ctx, r.x + 6, y + 1, r.w - 7, 2, tint);
    // 초상 (스프라이트 3배)
    rect(ctx, r.x + 10, y + 12, 52, 62, '#0b1118');
    drawSprite(ctx, `${a.sprite}${hov && Math.floor(now * 6) % 2 ? 1 : 0}`, r.x + 36, y + 43, { scale: 3 });
    text(ctx, `${i + 1}`, r.x + r.w - 8, y + 8, { font: 'small', align: 'right', color: C.dim });
    text(ctx, a.name, r.x + 70, y + 14, { font: 'bigBold', color: C.white });
    text(ctx, a.role, r.x + 70, y + 38, { font: 'small', color: tint });
    wrap(ctx, a.desc, r.x + 70, y + 52, r.w - 78, 10, { font: 'small', color: C.dim });
    // 스킬 4개
    AGENT_SLOTS.forEach((slot, j) => {
      const sid = a.slots[slot];
      const sy = y + 82 + j * 26;
      rect(ctx, r.x + 10, sy, 22, 22, '#0b1118');
      drawSprite(ctx, SKILL_ICON[sid], r.x + 21, sy + 11);
      text(ctx, `${slot.toUpperCase()} ${SKILLS[sid].name}`, r.x + 38, sy + 1, { font: 'bold', color: C.white });
      text(ctx, SKILLS[sid].brief, r.x + 38, sy + 13, { font: 'small', color: C.dim, shadow: false });
    });
    // 고유 패시브
    const py = y + r.h - 32;
    rect(ctx, r.x + 6, py - 4, r.w - 12, 1, C.panelEdge);
    text(ctx, `패시브 · ${a.passive.name}`, r.x + 10, py, { font: 'small', color: tint });
    wrap(ctx, a.passive.desc, r.x + 10, py + 11, r.w - 20, 9, { font: 'small', color: C.white, shadow: false });
  });
}

function fmt(t) {
  const s = Math.ceil(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
