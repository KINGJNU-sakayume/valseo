import { THEME } from './theme.js';
import { GUNS } from '../data/guns.js';
import { ROUNDS } from '../data/rounds.js';
import { maxHp } from '../core/stats.js';
import { xpNeed } from '../core/systems/progression.js';
import { SKILLS } from '../data/skills.js';
import { skillValue, qMagazine } from '../core/systems/skills.js';
import { evolutionHint } from '../core/systems/evolution.js';
import { BOSS } from '../data/enemies.js';
import { PASSIVES } from '../data/passives.js';
import { bossPhase } from '../core/systems/enemies.js';
import { SETTING_ITEMS } from './settings.js';

const HP_BAR = { w: 300, h: 14, bottom: 34 };
const GUN_BOX = { w: 132, h: 38, gap: 16 };
const XP_BAR_H = 6;
const LEVELUP_CARD = { w: 210, h: 130, gap: 20 };
const SHOP_ROW = { w: 480, h: 50, gap: 8, top: 120 };
const MENU_ROW = { w: 320, h: 44, gap: 10 };

export function drawHud(ctx, state, cam) {
  const p = state.player;

  // 상단: XP 바 + 라운드/시간/크레딧/레벨
  ctx.fillStyle = THEME.barBg;
  ctx.fillRect(0, 0, cam.w, XP_BAR_H);
  ctx.fillStyle = THEME.xpBar;
  ctx.fillRect(0, 0, cam.w * Math.min(1, p.xp / xpNeed(p.level)), XP_BAR_H);

  const left = Math.max(0, ROUNDS.combatTime - state.roundTime);
  ctx.font = THEME.titleFont;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = THEME.text;
  ctx.fillText(`라운드 ${state.round}/${ROUNDS.count}`, 12, 14);
  ctx.textAlign = 'center';
  const bossRound = state.round === ROUNDS.bossRound;
  ctx.fillText(state.phase !== 'COMBAT' ? '' : bossRound ? '보스전' : formatTime(left), cam.w / 2, 14);
  ctx.textAlign = 'right';
  ctx.fillStyle = THEME.accent;
  ctx.fillText(`¤ ${state.credits}`, cam.w - 12, 14);
  ctx.fillStyle = THEME.text;
  ctx.fillText(`Lv ${p.level}`, cam.w - 12, 36);
  ctx.textAlign = 'left';
  ctx.font = THEME.smallFont;
  ctx.fillStyle = THEME.dim;
  ctx.fillText(`처치 ${state.stats.kills} · 적 ${state.enemies.length}`, 12, 36);

  const boss = state.enemies.find((e) => e.type === 'boss');
  if (boss) drawBossBar(ctx, boss, cam);

  // 하단: HP/실드 바 + 총 2개
  const mh = maxHp(p);
  const x = (cam.w - HP_BAR.w) / 2;
  const y = cam.h - HP_BAR.bottom;
  ctx.fillStyle = THEME.barBg;
  ctx.fillRect(x, y, HP_BAR.w, HP_BAR.h);
  ctx.fillStyle = THEME.hpBar;
  ctx.fillRect(x, y, HP_BAR.w * (p.hp / mh), HP_BAR.h);
  if (p.shieldMax > 0) {
    ctx.fillStyle = THEME.shieldBar;
    ctx.fillRect(x, y - 6, HP_BAR.w * (p.shield / p.shieldMax), 4);
  }
  ctx.fillStyle = THEME.text;
  ctx.font = THEME.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const shield = p.shield > 0 ? `  ◆ ${Math.ceil(p.shield)}` : '';
  ctx.fillText(`HP ${Math.ceil(p.hp)} / ${Math.round(mh)}${shield}`, cam.w / 2, y - 8);

  drawSkills(ctx, state, cam);

  p.guns.forEach((slot, i) => {
    const bx = i === 0 ? x - GUN_BOX.gap - GUN_BOX.w : x + HP_BAR.w + GUN_BOX.gap;
    const by = cam.h - HP_BAR.bottom - GUN_BOX.h + HP_BAR.h;
    ctx.strokeStyle = slot?.evolved ? THEME.accent : THEME.cardBorder;
    ctx.lineWidth = slot?.evolved ? 2 : 1;
    ctx.strokeRect(bx, by, GUN_BOX.w, GUN_BOX.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = THEME.smallFont;
    if (!slot) {
      ctx.fillStyle = THEME.dim;
      ctx.fillText(i === 0 ? '주무기 없음' : '보조 없음', bx + GUN_BOX.w / 2, by + GUN_BOX.h / 2);
      return;
    }
    if (slot.evolved) {
      ctx.fillStyle = THEME.accent;
      ctx.fillText(GUNS[slot.id].evolution.name, bx + GUN_BOX.w / 2, by + GUN_BOX.h / 2);
      return;
    }
    ctx.fillStyle = THEME.text;
    ctx.fillText(`${GUNS[slot.id].name}  T${slot.tier}`, bx + GUN_BOX.w / 2, by + 13);
    // 진화 조건: 충족한 항목은 밝게
    const h = evolutionHint(state, slot);
    if (h) {
      ctx.fillStyle = h.tierOk && !h.skillOk ? THEME.text : THEME.dim;
      ctx.fillText(`진화: T3${h.tierOk ? '✓' : ''} + ${SKILLS[h.skill].key}${h.level}${h.skillOk ? '✓' : ''}`, bx + GUN_BOX.w / 2, by + 28);
    }
  });

  if (state.phase === 'DEFEAT' || state.phase === 'VICTORY') drawResult(ctx, state, cam);
}

function drawBossBar(ctx, boss, cam) {
  const B = THEME.bossBar;
  const x = (cam.w - B.w) / 2;
  ctx.fillStyle = THEME.barBg;
  ctx.fillRect(x, B.top, B.w, B.h);
  ctx.fillStyle = THEME.boss;
  ctx.fillRect(x, B.top, B.w * Math.max(0, boss.hp / boss.maxHp), B.h);
  // 단계 경계 눈금
  ctx.fillStyle = THEME.text;
  for (const ph of BOSS.phases) if (ph.until > 0) ctx.fillRect(x + B.w * ph.until - 1, B.top, 2, B.h);
  ctx.font = THEME.smallFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const enraged = boss.age >= BOSS.enrageTime ? ' · 격노' : '';
  ctx.fillText(`${BOSS.name} — ${bossPhase(BOSS, boss) + 1}단계${enraged}`, cam.w / 2, B.top - 3);
}

/** 결과 화면: 라운드, 레벨, 처치, 시간, 피해, 최종 빌드. */
function drawResult(ctx, state, cam) {
  const p = state.player;
  ctx.fillStyle = THEME.panel;
  ctx.fillRect(0, 0, cam.w, cam.h);
  const cx = cam.w / 2;
  let y = cam.h / 2 - 150;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = THEME.bigFont;
  ctx.fillStyle = state.phase === 'VICTORY' ? THEME.accent : THEME.text;
  ctx.fillText(state.phase === 'VICTORY' ? '승리' : '패배', cx, y);
  y += 50;
  ctx.font = THEME.titleFont;
  ctx.fillStyle = THEME.text;
  ctx.fillText(`라운드 ${state.round} · 레벨 ${p.level} · 처치 ${state.stats.kills} · ${formatTime(state.time)}`, cx, y);
  y += 26;
  ctx.font = THEME.font;
  ctx.fillStyle = THEME.dim;
  ctx.fillText(`총 피해 ${Math.round(state.stats.damage).toLocaleString()} · 획득 크레딧 ${state.stats.creditsEarned.toLocaleString()}`, cx, y);

  y += 44;
  const rows = [
    ['총기', p.guns.filter(Boolean).map((s) => (s.evolved ? `${GUNS[s.id].evolution.name}` : `${GUNS[s.id].name} T${s.tier}`)).join(' / ') || '-'],
    ['스킬', Object.entries(p.skills).filter(([, s]) => s.level > 0).map(([k, s]) => `${SKILLS[k].key} Lv${s.level}${s.branch ? ` ${SKILLS[k].branches[s.branch].name}` : ''}`).join(' · ') || '-'],
    ['패시브', Object.entries(p.passives).map(([k, n]) => `${PASSIVES[k].name} ×${n}`).join(' · ') || '-'],
  ];
  for (const [label, text] of rows) {
    ctx.font = THEME.smallFont;
    ctx.fillStyle = THEME.dim;
    ctx.fillText(label, cx, y);
    ctx.font = THEME.font;
    ctx.fillStyle = THEME.text;
    ctx.fillText(text, cx, y + 20);
    y += 50;
  }
  ctx.fillStyle = THEME.accent;
  ctx.font = THEME.titleFont;
  ctx.fillText('R 키로 다시 시작', cx, y + 14);
}

/** 시작 화면. */
export function drawTitle(ctx, cam) {
  ctx.fillStyle = THEME.panel;
  ctx.fillRect(0, 0, cam.w, cam.h);
  const cx = cam.w / 2;
  let y = cam.h / 2 - 150;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = THEME.bigFont;
  ctx.fillStyle = THEME.accent;
  ctx.fillText('집중포화', cx, y);
  y += 36;
  ctx.font = THEME.titleFont;
  ctx.fillStyle = THEME.dim;
  ctx.fillText('CROSSFIRE', cx, y);
  y += 50;
  ctx.font = THEME.font;
  ctx.fillStyle = THEME.text;
  const lines = [
    'WASD 이동 · 마우스 조준 · 발사는 자동',
    'C 함정 · E 앵커/귀환 · Q(누르기) 정조준 · X 궁극기',
    '감속 필드 안의 적은 모든 피해가 크리티컬',
    '12라운드를 버티고 보스를 쓰러뜨리세요',
    'P / Esc: 일시정지·설정',
  ];
  for (const l of lines) {
    ctx.fillText(l, cx, y);
    y += 26;
  }
  ctx.font = THEME.headFont;
  ctx.fillStyle = THEME.accent;
  ctx.fillText('클릭 또는 Enter 로 시작', cx, y + 30);
}

function menuLayout(cam) {
  const n = SETTING_ITEMS.length + 1; // + 계속하기
  const total = n * MENU_ROW.h + (n - 1) * MENU_ROW.gap;
  const x = (cam.w - MENU_ROW.w) / 2;
  const y0 = (cam.h - total) / 2 + 20;
  return Array.from({ length: n }, (_, i) => ({ x, y: y0 + i * (MENU_ROW.h + MENU_ROW.gap), w: MENU_ROW.w, h: MENU_ROW.h }));
}

/** 일시정지 메뉴 클릭: 설정 index, 마지막은 계속하기. 빈 곳이면 -1. */
export function pauseHitTest(cam, mx, my) {
  return menuLayout(cam).findIndex((r) => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h);
}

export function drawPause(ctx, cam, settings, mouse) {
  ctx.fillStyle = THEME.panel;
  ctx.fillRect(0, 0, cam.w, cam.h);
  const rects = menuLayout(cam);
  const hover = pauseHitTest(cam, mouse.x, mouse.y);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = THEME.headFont;
  ctx.fillStyle = THEME.text;
  ctx.fillText('일시정지', cam.w / 2, rects[0].y - 40);
  rects.forEach((r, i) => {
    card(ctx, r, i === hover, true);
    ctx.textBaseline = 'middle';
    const item = SETTING_ITEMS[i];
    if (item) {
      ctx.textAlign = 'left';
      ctx.font = THEME.font;
      ctx.fillStyle = THEME.dim;
      ctx.fillText(`[${i + 1}]`, r.x + 14, r.y + r.h / 2);
      ctx.fillStyle = THEME.text;
      ctx.fillText(item.label, r.x + 50, r.y + r.h / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = settings[item.key] ? THEME.accent : THEME.dim;
      ctx.fillText(settings[item.key] ? '켜짐' : '꺼짐', r.x + r.w - 14, r.y + r.h / 2);
    } else {
      ctx.textAlign = 'center';
      ctx.font = THEME.titleFont;
      ctx.fillStyle = THEME.accent;
      ctx.fillText('계속하기 (P / Esc)', r.x + r.w / 2, r.y + r.h / 2);
    }
  });
}

/** 스킬 4칸: 키, 레벨, 쿨다운(아래에서 차오름), 충전/탄창/오브 수. */
function drawSkills(ctx, state, cam) {
  const p = state.player;
  const B = THEME.skillBox;
  const keys = Object.keys(SKILLS);
  const total = keys.length * B.w + (keys.length - 1) * B.gap;
  const x0 = (cam.w - total) / 2;
  const y = cam.h - HP_BAR.bottom - B.aboveHp;
  keys.forEach((k, i) => {
    const def = SKILLS[k];
    const s = p.skills[k];
    const x = x0 + i * (B.w + B.gap);
    const locked = s.level <= 0;
    let ready = 1; // 0~1
    let count = '';
    if (k === 'c') {
      ready = s.charges > 0 ? 1 : 1 - s.cd / skillValue('c', 'cooldown', s.level);
      count = `${s.charges}`;
    } else if (k === 'e') {
      ready = s.cd > 0 ? 1 - s.cd / skillValue('e', 'cooldown', s.level) : 1;
      count = s.anchor ? '귀환' : '';
    } else if (k === 'q') {
      ready = s.ammo > 0 ? 1 : 0;
      count = `${s.ammo}/${qMagazine(p)}`;
    } else if (k === 'x') {
      ready = s.extra > 0 ? 1 : state.ultOrbs / SKILLS.x.orbsNeeded;
      count = s.extra > 0 ? `+${s.extra}발` : `${state.ultOrbs}/${SKILLS.x.orbsNeeded}`;
    }
    ctx.fillStyle = THEME.card;
    ctx.fillRect(x, y, B.w, B.h);
    if (!locked && ready < 1) {
      ctx.fillStyle = THEME.barBg;
      ctx.fillRect(x, y, B.w, B.h * (1 - ready));
    }
    ctx.strokeStyle = !locked && ready >= 1 ? THEME.accent : THEME.cardBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, B.w, B.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = THEME.titleFont;
    ctx.fillStyle = locked ? THEME.dim : THEME.text;
    ctx.fillText(def.key, x + B.w / 2, y + 16);
    ctx.font = THEME.smallFont;
    ctx.fillStyle = THEME.dim;
    ctx.fillText(locked ? '잠김' : `Lv${s.level}${s.branch ?? ''} ${count}`, x + B.w / 2, y + 35);
  });
}

/** pending 오버레이의 클릭 영역. drawOverlay 와 hitTest 가 같이 쓴다. */
function layout(state, cam) {
  const pending = state.pending;
  if (!pending) return [];
  const n = pending.options.length;
  if (pending.kind === 'levelup' || pending.kind === 'branch') {
    const total = n * LEVELUP_CARD.w + (n - 1) * LEVELUP_CARD.gap;
    const x0 = (cam.w - total) / 2;
    const y = (cam.h - LEVELUP_CARD.h) / 2;
    return pending.options.map((_, i) => ({ x: x0 + i * (LEVELUP_CARD.w + LEVELUP_CARD.gap), y, w: LEVELUP_CARD.w, h: LEVELUP_CARD.h }));
  }
  const x = (cam.w - SHOP_ROW.w) / 2;
  return pending.options.map((_, i) => ({ x, y: SHOP_ROW.top + i * (SHOP_ROW.h + SHOP_ROW.gap), w: SHOP_ROW.w, h: SHOP_ROW.h }));
}

export function hitTest(state, cam, mx, my) {
  return layout(state, cam).findIndex((r) => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h);
}

export function drawOverlay(ctx, state, cam, mouse) {
  const pending = state.pending;
  if (!pending) return;
  ctx.fillStyle = THEME.panel;
  ctx.fillRect(0, 0, cam.w, cam.h);
  const rects = layout(state, cam);
  const hover = mouse ? hitTest(state, cam, mouse.x, mouse.y) : -1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = THEME.headFont;
  ctx.fillStyle = THEME.text;

  if (pending.kind === 'levelup' || pending.kind === 'branch') {
    const head = pending.kind === 'branch'
      ? `분기 선택 — ${SKILLS[pending.key].name}`
      : `레벨 업! (Lv ${state.player.level - state.levelUpsQueued + 1})`;
    ctx.fillText(head, cam.w / 2, rects[0].y - 40);
    pending.options.forEach((c, i) => {
      const r = rects[i];
      card(ctx, r, i === hover, true);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = THEME.smallFont;
      ctx.fillStyle = THEME.dim;
      ctx.fillText(`[${i + 1}]`, r.x + 12, r.y + 10);
      ctx.textAlign = 'right';
      ctx.fillText(c.level, r.x + r.w - 12, r.y + 10);
      ctx.textAlign = 'center';
      ctx.font = THEME.titleFont;
      ctx.fillStyle = THEME.text;
      ctx.fillText(c.title, r.x + r.w / 2, r.y + 40);
      ctx.font = THEME.font;
      ctx.fillStyle = THEME.accent;
      wrapText(ctx, c.desc, r.x + r.w / 2, r.y + 70, r.w - 24, 18);
    });
    return;
  }

  ctx.fillText(`구매 페이즈 — 라운드 ${state.round} 클리어`, cam.w / 2, SHOP_ROW.top - 64);
  ctx.font = THEME.titleFont;
  ctx.fillStyle = THEME.accent;
  ctx.fillText(`보유 크레딧 ¤ ${state.credits}`, cam.w / 2, SHOP_ROW.top - 30);
  pending.options.forEach((o, i) => {
    const r = rects[i];
    card(ctx, r, i === hover && o.enabled, o.enabled);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = THEME.smallFont;
    ctx.fillStyle = THEME.dim;
    ctx.fillText(`[${i + 1}]`, r.x + 12, r.y + r.h / 2);
    ctx.font = THEME.titleFont;
    ctx.fillStyle = o.enabled ? THEME.text : THEME.dim;
    ctx.fillText(o.title, r.x + 48, r.y + 17);
    ctx.font = THEME.smallFont;
    ctx.fillStyle = THEME.dim;
    ctx.fillText(o.desc, r.x + 48, r.y + 35);
    if (o.price > 0) {
      ctx.textAlign = 'right';
      ctx.font = THEME.titleFont;
      ctx.fillStyle = o.enabled ? THEME.accent : THEME.dim;
      ctx.fillText(`¤ ${o.price}`, r.x + r.w - 14, r.y + r.h / 2);
    }
  });
  ctx.textAlign = 'center';
  ctx.font = THEME.smallFont;
  ctx.fillStyle = THEME.dim;
  const last = rects[rects.length - 1];
  ctx.fillText('클릭 또는 숫자 키로 구매 · Enter 로 다음 라운드', cam.w / 2, last.y + last.h + 24);
}

function card(ctx, r, hover, enabled) {
  ctx.fillStyle = !enabled ? THEME.cardDisabled : hover ? THEME.cardHover : THEME.card;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = hover ? THEME.accent : THEME.cardBorder;
  ctx.lineWidth = hover ? 2 : 1;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
}

function formatTime(t) {
  const s = Math.ceil(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 가운데 정렬 줄바꿈 (공백 단위). */
function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) {
      ctx.fillText(line, cx, y);
      line = w;
      y += lineH;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, cx, y);
}
