// UI 레이어 (픽셀 버퍼 좌표). HUD, 레벨업/분기/상점 오버레이, 일시정지, 타이틀, 결과.
import { ROUND_TYPES, MUTATIONS } from '../data/rounds.js';
import { UTILS, UTIL } from '../data/utils.js';
import { RELICS } from '../data/relics.js';
import { isBig } from '../data/enemies.js';
import { GUNS, TIERS } from '../data/guns.js';
import { ROUNDS } from '../data/rounds.js';
import { SKILLS, ULT, SKILL_MAX_LEVEL, BRANCH_LEVEL } from '../data/skills.js';
import { AGENTS } from '../data/agents.js';
import { BOSS } from '../data/enemies.js';
import { maxHp, gunStats, evoOf } from '../core/stats.js';
import { xpNeed } from '../core/systems/progression.js';
import { abilityStatus } from '../core/systems/skills.js';
import { evolutionHint } from '../core/systems/evolution.js';
import { bossPhase } from '../core/systems/enemies.js';
import { C, PAL } from './palette.js';
import { rect, panel, text, wrap, textWidth, line, ring, disc } from './pixel.js';
import { bx, by } from './camera.js';
import { drawSprite, sprites } from './sprites.js';
import { SETTING_ITEMS } from './settings.js';
import { recordOf } from './records.js';
import { TAGS, RESONANCE } from '../data/tags.js';
import { TACTICS } from '../data/tactics.js';
import { PASSIVES, RARITY } from '../data/passives.js';
import { tagCounts } from '../core/systems/tactics.js';

// 스킬 id → 아이콘 스프라이트
const SKILL_ICON = {
  trademark: 'trap', rendezvous: 'anchor', headhunter: 'gun_headhunter', tourDeForce: 'gun_tourdeforce',
  alarmbot: 'alarmbot0', nanoswarm: 'nanoswarm', turret: 'turret', lockdown: 'lockdown',
  leer: 'leerEye', devour: 'soul', dismiss: 'u_tailwind', empress: 'crown',
  moshpit: 'moshIcon', wingman: 'wingIcon', dizzy: 'dizzyIcon', thrash: 'thrashIcon',
  beacon: 'beacon', skysmoke: 'u_smoke', ember: 'u_incendiary', orbital: 'orbitalIcon',
};
const slotIcon = (state, slot) => SKILL_ICON[state.player.skills[slot].id];
const slotSkill = (state, slot) => SKILLS[state.player.skills[slot].id];
const PASSIVE_ICON = {
  maxHp: 'heart', moveSpeed: 'boot', magnetRadius: 'magnet', xpGain: 'p_xp', creditGain: 'p_coin', critDamage: 'p_crit',
  cooldown: 'p_clock', armor: 'p_armor', killHeal: 'p_heal', duration: 'p_hourglass', orbDrop: 'p_orb', invuln: 'p_bubble',
  blastDamage: 'alarmbot0', zoneDamage: 'nanoswarm', gadgetDamage: 'trap', sniperDamage: 'gun_headhunter',
};
const CARD_TAG = {
  skill: { label: '스킬', color: C.gold },
  gunMod: { label: '총기 개조', color: C.teal },
  passive: { label: '패시브', color: C.shield },
  tactic: { label: '전술', color: C.purple },
  heal: { label: '회복', color: C.hp },
};
const RARITY_COLOR = { common: C.purple, rare: C.orange, legendary: C.goldLight };

// ───────────────────────── HUD ─────────────────────────

export function drawHud(ctx, state, W, H, view) {
  const { feel, now, mobile } = view;
  drawTop(ctx, state, W, mobile, feel);
  drawHealth(ctx, state, H);
  drawAbilities(ctx, state, W, H, now, mobile);
  drawWeapons(ctx, state, W, H, mobile);
  if (mobile) {
    drawPauseButton(ctx, W);
    drawBuildButton(ctx);
  }
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

function drawTop(ctx, state, W, mobile, feel) {
  const p = state.player;
  const cx = Math.round(W / 2);
  const xpK = Math.min(1, p.xp / xpNeed(p.level));
  // XP 바 (최상단 전체). 조각을 먹으면 잠깐 밝아진다
  rect(ctx, 0, 0, W, 5, '#0b1118');
  rect(ctx, 0, 0, W * xpK, 4, feel.xpFlash > 0 ? '#c9fff6' : C.xp);
  rect(ctx, 0, 0, W * xpK, 1, '#c9fff6');

  // 중앙 라운드 패널
  panel(ctx, cx - 56, 6, 112, 34, { fill: C.panel, edge: C.panelEdge, cut: 4 });
  const bossRound = state.round === ROUNDS.bossRound;
  const combat = state.phase === 'COMBAT';
  if (combat && state.roundWon) {
    text(ctx, '클리어', cx, 9, { font: 'bigBold', align: 'center', color: C.teal });
    text(ctx, `라운드 ${state.round} / ${ROUNDS.count}`, cx, 30, { font: 'small', align: 'center', color: C.dim });
  } else if (combat && state.cleanup) {
    // 정리 페이즈: 남은 적 수가 주인공, 시간은 보조
    const left = Math.max(0, ROUNDS.combatTime - state.roundTime);
    text(ctx, `남은 적 ${state.enemies.length}`, cx, 9, { font: 'bigBold', align: 'center', color: C.gold });
    text(ctx, `정리 · ${fmt(left)}`, cx, 30, { font: 'small', align: 'center', color: left < 6 ? C.red : C.goldLight });
  } else {
    const left = Math.max(0, ROUNDS.spawnStopTime - state.roundTime);
    const timer = !combat ? '--:--' : bossRound ? 'BOSS' : fmt(left);
    text(ctx, timer, cx, 9, { font: 'big', align: 'center', color: C.white });
    text(ctx, `라운드 ${state.round} / ${ROUNDS.count}`, cx, 30, { font: 'small', align: 'center', color: C.dim });
  }
  drawObjectiveLine(ctx, state, cx);
  // 라운드 진행 눈금
  for (let i = 0; i < ROUNDS.count; i++) {
    const x = cx - 54 + i * 9;
    rect(ctx, x, 42, 7, 2, i < state.round - 1 ? C.teal : i === state.round - 1 ? C.red : C.dim2);
  }

  // 왼쪽: 레벨(크게) + XP 진행 + 처치
  panel(ctx, 6, 8, 100, 32, { fill: C.panel, edge: C.panelEdge, accent: C.teal });
  text(ctx, 'Lv', 12, 13, { font: 'small', color: C.dim });
  text(ctx, `${p.level}`, 26, 9, { font: 'bigBold', color: C.teal });
  text(ctx, `처치 ${state.stats.kills}`, 100, 11, { font: 'small', align: 'right', color: C.dim });
  text(ctx, `XP ${Math.floor(p.xp)}/${Math.ceil(xpNeed(p.level))}`, 100, 22, { font: 'small', align: 'right', color: C.xp });
  rect(ctx, 12, 34, 88, 3, '#0b1118');
  rect(ctx, 12, 34, 88 * xpK, 3, C.xp);
  // 첫 라운드 조작 안내
  if (state.round === 1 && state.roundTime < 20 && state.phase === 'COMBAT') {
    const hint = mobile ? '왼쪽 드래그: 이동 · 조준·스킬 자동 · 스킬 칸 탭: 직접 사용' : 'WASD 이동 · 마우스 조준 · C Q E X 스킬 · 우클릭/F 유틸 · Tab 빌드 · P 일시정지';
    text(ctx, hint, 8, 46, { font: 'small', color: C.dim });
  }

  // 오른쪽: 크레딧
  panel(ctx, W - 86, 6, 80, 24, { fill: C.panel, edge: C.panelEdge, accent: C.gold });
  // 크레딧: 처치마다 숫자가 올라가는 연출 (쓴 돈은 바로 반영)
  const gap = state.credits - feel.creditShown;
  feel.creditShown = gap > 0 ? Math.min(state.credits, feel.creditShown + Math.max(1, Math.ceil(gap * 0.15))) : state.credits;
  const flash = feel.creditFlash > 0;
  drawSprite(ctx, 'coin', W - 72, 18, { scale: flash ? 2 : 1 });
  text(ctx, `${feel.creditShown}`, W - 12, 12, { font: 'bold', align: 'right', color: flash ? C.white : C.goldLight });

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

// 스킬 칸 배치. HUD 그리기와 모바일 탭 판정이 같은 값을 쓴다.
const ABIL = { box: 34, col: 56, mBox: 40, mCol: 56, mRow: 62 };
const ABIL_KEYS = ['c', 'q', 'e', 'x'];
// 모바일: 오른손 엄지 기준 2×2 (자주 쓰는 C가 오른쪽 아래)
const MOBILE_GRID = { q: [0, 0], x: [1, 0], e: [0, 1], c: [1, 1] };

export function abilityLayout(W, H, mobile) {
  if (!mobile) {
    const x0 = Math.round(W / 2 - (ABIL_KEYS.length * ABIL.col) / 2);
    const y = H - 64;
    return ABIL_KEYS.map((k, i) => ({ k, x: x0 + i * ABIL.col + (ABIL.col - ABIL.box) / 2, y, w: ABIL.box, h: ABIL.box }));
  }
  const x0 = W - 6 - ABIL.mCol * 2;
  const y0 = H - 14 - ABIL.mRow * 2;
  return ABIL_KEYS.map((k) => {
    const [cx, cy] = MOBILE_GRID[k];
    return { k, x: x0 + cx * ABIL.mCol + (ABIL.mCol - ABIL.mBox) / 2, y: y0 + cy * ABIL.mRow + 6, w: ABIL.mBox, h: ABIL.mBox };
  });
}

/** 유틸 칸 (계약 수만큼, 키 u = 우클릭, f). 데스크톱은 스킬 오른쪽, 모바일은 2×2 왼쪽 위 대각선. */
export function utilLayout(W, H, mobile, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = i === 0 ? 'u' : 'f';
    if (!mobile) {
      // 스킬 칸 왼쪽 (오른쪽은 총기 패널)
      const x0 = Math.round(W / 2 - (ABIL_KEYS.length * ABIL.col) / 2) - 42;
      out.push({ k, x: x0 - i * 46, y: H - 64 + 4, w: 30, h: 30 });
    } else {
      const x0 = W - 6 - ABIL.mCol * 2;
      const y0 = H - 14 - ABIL.mRow * 2;
      out.push({ k, x: x0 - 30 - i * 40, y: y0 - 12 + i * 46, w: 34, h: 34 });
    }
  }
  return out;
}

/** 좌표가 스킬·유틸 칸 위면 슬롯 키('c'|'q'|'e'|'x'|'u'|'f'), 아니면 null. 손가락용 여유 pad. */
export function abilityHit(W, H, mobile, mx, my, pad = 6, utils = 0) {
  const r = [...abilityLayout(W, H, mobile), ...utilLayout(W, H, mobile, utils)]
    .find((a) => mx >= a.x - pad && mx < a.x + a.w + pad && my >= a.y - pad && my < a.y + a.h + pad + 14);
  return r ? r.k : null;
}

// 레벨이 오른 슬롯을 잠깐 반짝이게 하려고 직전 레벨을 기억한다 (렌더 전용)
const levelSeen = new WeakMap();

function drawAbilities(ctx, state, W, H, now, mobile) {
  const p = state.player;
  let seen = levelSeen.get(state);
  if (!seen) levelSeen.set(state, (seen = { lv: {}, at: {} }));
  for (const r of abilityLayout(W, H, mobile)) {
    const k = r.k;
    const lv = p.skills[k].level;
    if (seen.lv[k] !== undefined && lv > seen.lv[k]) seen.at[k] = now;
    seen.lv[k] = lv;
    drawAbility(ctx, state, r, now, mobile, now - (seen.at[k] ?? -99));
  }
  const utils = p.utils ?? [];
  utilLayout(W, H, mobile, utils.length).forEach((r, i) => drawUtil(ctx, utils[i], r, mobile, utils.length));
}

/** 용병 계약 칸: 아이콘, 충전 핍, 레벨, 키 배지 (우클릭 / F). */
function drawUtil(ctx, u, r, mobile, n) {
  const def = UTILS[u.id];
  const { x, y, w: box } = r;
  const ready = u.charges > 0 && !(u.cd > 0);
  panel(ctx, x, y, box, box, { fill: C.panelSolid, edge: ready ? C.teal : C.panelEdge, cut: 3 });
  ctx.globalAlpha = ready ? 1 : 0.4;
  drawSprite(ctx, `u_${u.id}`, x + box / 2, y + box / 2, { scale: 2 });
  ctx.globalAlpha = 1;
  if (u.cd > 0) rect(ctx, x + 1, y + 1, box - 2, Math.round((box - 2) * (u.cd / UTIL.useCooldown)), 'rgba(0,0,0,0.55)');
  for (let j = 0; j < UTIL.maxCharges; j++) rect(ctx, x + box / 2 - 7 + j * 5, y - 5, 4, 3, j < u.charges ? C.teal : C.dim2);
  if (u.level > 1) text(ctx, `Lv${u.level}`, x + box - 2, y + box - 10, { font: 'small', align: 'right', color: C.gold });
  text(ctx, def.name, x + box / 2, y + box + 3, { font: 'small', align: 'center', color: C.white });
  if (!mobile) {
    const key = r.k === 'u' ? (n > 1 ? '우' : '우/F') : 'F';
    const kw = key.length > 1 ? 24 : 14;
    rect(ctx, x - 4, y - 4, kw, 14, ready ? C.white : C.dim);
    rect(ctx, x - 3, y - 3, kw - 2, 12, PAL.k);
    text(ctx, key, x - 4 + kw / 2, y + 4, { font: 'bold', align: 'center', base: 'middle', color: C.white, shadow: false });
  }
}

function drawAbility(ctx, state, r, now, mobile, sinceUp) {
  const p = state.player;
  const { k, x, y, w: box } = r;
  const s = p.skills[k];
  const def = SKILLS[s.id];
  const locked = s.level <= 0;
  const { ready, pips, label } = abilityStatus(state, k);
  const isReady = !locked && ready >= 1;
  const held = k === 'q' && p.precision;
  const flash = sinceUp < 1.2 && Math.floor(sinceUp * 8) % 2 === 0;
  const edge = flash ? C.teal : held ? C.goldLight : isReady ? (k === 'x' ? C.gold : C.white) : C.panelEdge;
  panel(ctx, x, y, box, box, { fill: held ? '#2a2412' : C.panelSolid, edge, cut: 3 });
  const icon = slotIcon(state, k);
  const scale = sprites()[icon].w <= 13 ? 2 : 1;
  ctx.globalAlpha = locked ? 0.18 : isReady ? 1 : 0.45;
  drawSprite(ctx, icon, x + box / 2, y + box / 2, { scale });
  ctx.globalAlpha = 1;
  if (!locked) {
    if (ready < 1) rect(ctx, x + 1, y + 1, box - 2, Math.round((box - 2) * (1 - ready)), 'rgba(0,0,0,0.55)');
    if (label) text(ctx, label, x + box / 2, y + box / 2 + 1, { font: 'bigBold', align: 'center', base: 'middle' });
    if (k === 'x' && isReady) {
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(now * 6);
      rect(ctx, x - 1, y - 1, box + 2, 1, C.goldLight);
      rect(ctx, x - 1, y + box, box + 2, 1, C.goldLight);
      ctx.globalAlpha = 1;
    }
    if (s.branch) text(ctx, def.branches[s.branch].name[0], x + box - 3, y + 2, { font: 'bold', align: 'right', color: C.gold });
    if (s.mastery) {
      rect(ctx, x + box - 7, y + box - 7, 5, 5, PAL.k);
      rect(ctx, x + box - 6, y + box - 6, 3, 3, C.purple);
    }
  } else {
    text(ctx, '잠김', x + box / 2, y + box / 2, { font: 'small', align: 'center', base: 'middle', color: C.dim });
  }
  // 키 배지 (데스크톱)
  if (!mobile) {
    rect(ctx, x - 4, y - 4, 14, 14, locked ? C.dim2 : isReady ? C.white : C.dim);
    rect(ctx, x - 3, y - 3, 12, 12, PAL.k);
    text(ctx, k.toUpperCase(), x + 3, y + 4, { font: 'bold', align: 'center', base: 'middle', color: locked ? C.dim : C.white, shadow: false });
  }
  // 충전/탄창/오브 핍
  if (!locked && pips.length) {
    const pw = pips.length > 6 ? 2 : 3;
    const tw = pips.length * (pw + 1) - 1;
    pips.forEach((on, j) => rect(ctx, x + box / 2 - tw / 2 + j * (pw + 1), y - 5, pw, 3, on ? (k === 'x' ? C.gold : C.teal) : C.dim2));
  }
  // 레벨 막대 (5칸) + 이름
  const segs = SKILL_MAX_LEVEL;
  const sw = Math.floor((box + 2) / segs) - 1;
  const lx = Math.round(x + box / 2 - (segs * (sw + 1) - 1) / 2);
  for (let j = 0; j < segs; j++) rect(ctx, lx + j * (sw + 1), y + box + 3, sw, 3, j < s.level ? (j >= BRANCH_LEVEL - 1 && s.branch ? C.gold : C.teal) : C.dim2);
  text(ctx, def.name, x + box / 2, y + box + 8, { font: 'small', align: 'center', color: locked ? C.dim2 : C.white });
  if (sinceUp < 1.2) {
    const up = Math.round(sinceUp * 10);
    text(ctx, s.level === 1 ? '해금!' : `Lv ${s.level}!`, x + box / 2, y - 14 - up, { font: 'bold', align: 'center', color: C.teal });
  }
}

function drawWeapons(ctx, state, W, H, mobile) {
  const p = state.player;
  const w = 132;
  const h = 23;
  const x = W - w - 6;
  [1, 0].forEach((slotIdx, row) => {
    const slot = p.guns[slotIdx];
    const y = (mobile ? 34 : H - 54) + row * (h + 3);
    const prim = p.guns[0];
    const primFiring = !!prim && !p.precision && !(prim.reload > 0);
    const active = slot && (slotIdx === 0 ? primFiring : !primFiring);
    panel(ctx, x, y, w, h, { fill: C.panel, edge: slot?.evolved ? C.gold : C.panelEdge, cut: 3 });
    if (!slot) {
      text(ctx, slotIdx === 0 ? '주무기 없음' : '보조 없음', x + w / 2, y + h / 2, { font: 'small', align: 'center', base: 'middle', color: C.dim2 });
      return;
    }
    ctx.globalAlpha = active ? 1 : 0.4;
    drawSprite(ctx, `gun_${slot.id}`, x + 15, y + h / 2);
    ctx.globalAlpha = 1;
    const name = slot.evolved ? evoOf(slot).name : GUNS[slot.id].name;
    text(ctx, name, x + 30, y + 3, { font: 'small', color: slot.evolved ? C.goldLight : C.white });
    for (let t = 0; t < TIERS.max; t++) rect(ctx, x + w - 22 + t * 6, y + 4, 4, 3, t < slot.tier ? C.gold : C.dim2);
    const hint = slot.reload > 0 ? null : evolutionHint(state, slot); // 재장전 중엔 그 줄에 재장전 표시
    if (hint) {
      const s = `진화 T3${hint.tierOk ? '✓' : ''} ${TAGS[hint.tag].name} ${hint.n}/${hint.need}`;
      text(ctx, s, x + 30, y + 12, { font: 'small', color: hint.n >= hint.need ? C.goldLight : C.dim, shadow: false });
    }
    // 탄창 / 재장전 (주무기)
    const g = gunStats(slot, {}, state.player);
    if (g.magazine > 0) {
      const bw = w - 34;
      rect(ctx, x + 30, y + h - 4, bw, 2, '#0b1118');
      if (slot.reload > 0) {
        rect(ctx, x + 30, y + h - 4, bw * (1 - slot.reload / g.reloadTime), 2, C.orange);
        text(ctx, `재장전 · ${slotIdx === 0 && p.guns[1] ? '보조무기 사격 중' : ''}`, x + 30, y + 12, { font: 'small', color: C.orange, shadow: false });
      } else {
        rect(ctx, x + 30, y + h - 4, bw * ((slot.ammo ?? g.magazine) / g.magazine), 2, C.teal);
      }
    }
  });
}

// ───────────────────────── 모바일 ─────────────────────────

const PAUSE_BTN = { x: 110, y: 8, w: 28, h: 32 };

export function pauseButtonHit(mx, my, pad = 6) {
  const r = PAUSE_BTN;
  return mx >= r.x - pad && mx < r.x + r.w + pad && my >= r.y - pad && my < r.y + r.h + pad;
}

function drawPauseButton(ctx) {
  const r = PAUSE_BTN;
  panel(ctx, r.x, r.y, r.w, r.h, { fill: C.panel, edge: C.panelEdge, cut: 3 });
  rect(ctx, r.x + 9, r.y + 9, 3, 14, C.white);
  rect(ctx, r.x + 16, r.y + 9, 3, 14, C.white);
}

export const JOY = { radius: 28, knob: 11 };

/** 가상 조이스틱. joy: { ox, oy, x, y } (버퍼 좌표) 또는 null. 비어 있으면 첫 라운드에만 위치 안내. */
export function drawTouch(ctx, state, W, H, joy, now) {
  if (joy) {
    ctx.globalAlpha = 0.35;
    ring(ctx, joy.ox, joy.oy, JOY.radius, C.white, 2);
    ctx.globalAlpha = 0.6;
    disc(ctx, joy.x, joy.y, JOY.knob, C.white);
    ctx.globalAlpha = 1;
  } else if (state.round === 1 && state.phase === 'COMBAT' && state.roundTime < 20) {
    const x = 70;
    const y = H - 96;
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now * 4);
    ring(ctx, x, y, JOY.radius, C.white, 2);
    disc(ctx, x, y, JOY.knob, C.white);
    ctx.globalAlpha = 1;
    text(ctx, '드래그해서 이동', x, y + JOY.radius + 6, { font: 'small', align: 'center', color: C.dim });
  }
}

export function drawRotate(ctx, W, H, now) {
  ctx.fillStyle = 'rgba(6,9,13,0.94)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;
  const t = Math.min(1, (now % 2) / 1.2);
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy - 30));
  ctx.rotate(-t * Math.PI / 2);
  rect(ctx, -11, -18, 22, 36, C.white);
  rect(ctx, -9, -15, 18, 28, PAL.k);
  ctx.restore();
  text(ctx, '가로로 돌려주세요', cx, cy + 6, { font: 'bold', align: 'center' });
  text(ctx, '집중포화는 가로 화면에서 플레이합니다', cx, cy + 22, { font: 'small', align: 'center', color: C.dim });
}

/** 라운드 목표 한 줄 (중앙 패널 아래): 유형·진행도·변이. */
function drawObjectiveLine(ctx, state, cx) {
  const o = state.objective;
  if (state.phase !== 'COMBAT' || !o) return;
  const T = ROUND_TYPES[o.type];
  let s = null;
  let color = C.goldLight;
  if (o.type === 'defuse') {
    s = o.done ? '해체 완료' : `해체 ${o.progress.toFixed(1)} / ${T.hold}초 · 붉은 지점에 머물기`;
    color = o.done ? C.teal : C.red;
  } else if (o.type === 'defend') {
    const pct = o.total > 0 ? Math.round((o.inside / o.total) * 100) : 0;
    s = `방어 ${o.site} 사이트 · 안에 머문 시간 ${pct}%`;
  } else if (o.type === 'hunt') {
    const left = o.ids.filter((id) => state.enemies.some((e) => e.id === id)).length;
    s = o.done ? '사냥 완료' : `사냥 · 은신 표적 ${left}/${o.ids.length}`;
    color = o.done ? C.teal : C.teal;
  }
  const mut = state.mutation ? MUTATIONS[state.mutation].name : null;
  const line = [s, mut && `변이: ${mut}`].filter(Boolean).join(' · ');
  if (line) text(ctx, line, cx, 47, { font: 'small', align: 'center', color });
}

/** 화면 밖 엘리트·보스 방향 표시. 정리 페이즈에는 남은 적 전부 (화면 안이면 머리 위 표시). */
function drawOffscreen(ctx, state, W, H, cam, now) {
  // 라운드 목표 지점 (해체·방어·무기 상자)
  const o = state.objective;
  const goals = [];
  if (o && !o.done && (o.type === 'defuse' || (o.type === 'defend' && !state.cleanup))) goals.push(o);
  for (const b of state.boxes ?? []) goals.push(b);
  for (const g of goals) {
    const x = bx(cam, g.x);
    const y = by(cam, g.y);
    if (x > 10 && y > 10 && x < W - 10 && y < H - 10) continue;
    const a = Math.atan2(y - H / 2, x - W / 2);
    const t = Math.min((W / 2 - 22) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 22) / Math.abs(Math.sin(a) || 1e-6));
    const ax = W / 2 + Math.cos(a) * t;
    const ay = H / 2 + Math.sin(a) * t;
    disc(ctx, ax, ay, 4, Math.floor(now * 3) % 2 ? C.gold : C.goldLight);
    disc(ctx, ax, ay, 2, PAL.k);
  }
  const cleanup = state.phase === 'COMBAT' && state.cleanup && !state.roundWon;
  let arrows = 0;
  for (const e of state.enemies) {
    const big = isBig(e);
    if (!big && !cleanup) continue;
    const x = bx(cam, e.x);
    const y = by(cam, e.y);
    if (x > 10 && y > 10 && x < W - 10 && y < H - 10) {
      if (cleanup && !big) {
        const ty = Math.round(y - e.r / cam.S - 7 + Math.sin(now * 8) * 1.5);
        rect(ctx, x - 2, ty, 5, 1, C.gold);
        rect(ctx, x - 1, ty + 1, 3, 1, C.gold);
        rect(ctx, x, ty + 2, 1, 1, C.gold);
      }
      continue;
    }
    if (!big && ++arrows > 16) continue;
    const cx = W / 2;
    const cy = H / 2;
    const a = Math.atan2(y - cy, x - cx);
    const m = 18;
    const t = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
    const ax = cx + Math.cos(a) * t;
    const ay = cy + Math.sin(a) * t;
    const col = !big ? C.gold : Math.floor(now * 4) % 2 ? C.red : '#ff8a93';
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

const CARD = { w: 124, h: 150, augH: 168, gap: 10 };

/** pending 오버레이의 클릭 영역 (option index 순). */
export function overlayLayout(state, W, H) {
  const pending = state.pending;
  if (!pending) return [];
  const n = pending.options.length;
  if (pending.kind === 'levelup' || pending.kind === 'branch' || pending.kind === 'mastery' || pending.kind === 'evolve' || pending.kind === 'relic' || pending.kind === 'reward' || pending.kind === 'weaponBox') {
    const aug = pending.kind !== 'levelup' && pending.kind !== 'reward';
    const w = aug ? 150 : CARD.w;
    const h = aug ? CARD.augH : CARD.h;
    const total = n * w + (n - 1) * CARD.gap;
    const x0 = Math.round(W / 2 - total / 2);
    const y = Math.round(H / 2 - h / 2 + 10);
    return pending.options.map((_, i) => ({ x: x0 + i * (w + CARD.gap), y, w, h }));
  }
  return shopLayout(state, W, H).rects;
}

export function overlayHit(state, W, H, mx, my) {
  return overlayLayout(state, W, H).findIndex((r) => r && mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h);
}

/** 레벨업 화면의 리롤·추방 버튼 영역. */
export function levelupButtons(state, W, H) {
  if (state.pending?.kind !== 'levelup') return [];
  const rects = overlayLayout(state, W, H);
  const y = rects[0].y + CARD.h + 8;
  const w = 118;
  const gap = 10;
  const x0 = Math.round(W / 2 - w - gap / 2);
  return [
    { id: 'reroll', x: x0, y, w, h: 20 },
    { id: 'banish', x: x0 + w + gap, y, w, h: 20 },
  ];
}

export function levelupButtonHit(state, W, H, mx, my) {
  return levelupButtons(state, W, H).find((r) => mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h)?.id ?? null;
}

export function drawOverlay(ctx, state, W, H, mouse, now, mobile = false, banishMode = false) {
  const pending = state.pending;
  if (!pending) return;
  ctx.fillStyle = 'rgba(6,9,13,0.82)';
  ctx.fillRect(0, 0, W, H);
  const hover = overlayHit(state, W, H, mouse.x, mouse.y);
  if (pending.kind === 'shop') return drawShop(ctx, state, W, H, hover, mobile);
  const rects = overlayLayout(state, W, H);
  const banishing = banishMode && pending.kind === 'levelup';
  const aug = pending.kind === 'branch' || pending.kind === 'mastery' || pending.kind === 'evolve' || pending.kind === 'relic' || pending.kind === 'weaponBox';
  const head = pending.kind === 'relic' ? '유물' : pending.kind === 'reward' ? '해체 보상' : pending.kind === 'weaponBox' ? '무기 상자'
    : pending.kind === 'evolve' ? `무기 진화 · ${GUNS[state.player.guns[pending.slot].id].name}`
    : pending.kind === 'branch' ? `형태 증강 · ${slotSkill(state, pending.key).name}`
    : pending.kind === 'mastery' ? `숙련 증강 · ${slotSkill(state, pending.key).name}`
      : banishing ? '추방할 카드 선택' : '레벨 업';
  const sub = pending.kind === 'relic' ? '엘리트 처치 보상 · 장점과 단점이 함께 있습니다'
    : pending.kind === 'reward' ? '전술 카드 하나를 고르세요'
    : pending.kind === 'weaponBox' ? '엘리트가 떨어뜨린 주무기'
    : pending.kind === 'evolve' ? '공명한 태그가 둘 이상 · 진화 경로를 하나 고르세요'
    : pending.kind === 'branch' ? '스킬의 동작 방식이 바뀝니다 · 하나만 고를 수 있습니다'
    : pending.kind === 'mastery' ? '스킬의 마지막 강화 · 하나만 고를 수 있습니다'
      : banishing ? '추방한 카드는 이번 판에 다시 나오지 않습니다'
        : `Lv ${state.player.level - state.levelUpsQueued + 1} · 보상을 하나 선택`;
  stripeTitle(ctx, W, rects[0].y - 54, head, sub, pending.kind === 'relic' ? C.purple : aug ? C.gold : banishing ? C.red : C.teal);
  pending.options.forEach((opt, i) => drawCard(ctx, state, opt, rects[i], i, i === hover, pending.kind, now, banishing));
  // 리롤·추방
  const btnHover = levelupButtonHit(state, W, H, mouse.x, mouse.y);
  for (const b of levelupButtons(state, W, H)) {
    const left = b.id === 'reroll' ? state.rerolls : state.banishes;
    const on = left > 0;
    const active = b.id === 'banish' && banishing;
    const hov = !mobile && btnHover === b.id && on;
    panel(ctx, b.x, b.y, b.w, b.h, { fill: active ? C.redDark : hov ? '#1b2a38' : C.panelSolid, edge: active ? C.red : hov ? C.white : C.panelEdge, cut: 3 });
    const label = b.id === 'reroll' ? `리롤 ${left}${mobile ? '' : '  (R)'}` : active ? '추방 취소' : `추방 ${left}${mobile ? '' : '  (B)'}`;
    text(ctx, label, b.x + b.w / 2, b.y + 4, { font: 'bold', align: 'center', color: on || active ? C.white : C.dim2 });
  }
}

function stripeTitle(ctx, W, y, title, sub, color) {
  rect(ctx, W / 2 - 90, y + 30, 180, 1, color);
  text(ctx, title, W / 2, y, { font: 'bigBold', align: 'center' });
  text(ctx, sub, W / 2, y + 34, { font: 'small', align: 'center', color: C.dim });
}

function drawCard(ctx, state, opt, r, i, hover, kind, now, banishing = false) {
  const y = r.y - (hover ? 3 : 0);
  const base = kind === 'branch' ? { label: '형태', color: C.gold }
    : kind === 'mastery' ? { label: opt.auto ? '숙련 · 자동화' : '숙련', color: C.goldLight }
      : kind === 'evolve' ? { label: '진화', color: C.gold }
      : kind === 'relic' ? { label: '유물', color: C.purple }
      : kind === 'weaponBox' ? { label: opt.take ? '교체' : '유지', color: C.gold }
      : CARD_TAG[opt.type] ?? CARD_TAG.heal;
  const tag = opt.type === 'skill' ? { ...base, label: `스킬 · ${opt.key.toUpperCase()}` }
    : opt.type === 'tactic' ? { label: `전술 · ${RARITY[opt.rarity].name}`, color: RARITY_COLOR[opt.rarity] }
      : opt.type === 'synth' ? { label: '합성 · 전설', color: RARITY_COLOR.legendary }
      : base;
  const edge = banishing ? (hover ? C.red : C.redDark) : hover ? tag.color : C.panelEdge;
  panel(ctx, r.x, y, r.w, r.h, { fill: hover ? '#16222e' : C.panelSolid, edge, cut: 6 });
  rect(ctx, r.x + 6, y + 1, r.w - 7, 2, tag.color);
  text(ctx, tag.label, r.x + 8, y + 8, { font: 'small', color: tag.color });
  text(ctx, `${i + 1}`, r.x + r.w - 8, y + 8, { font: 'small', align: 'right', color: C.dim });
  // 태그 (카드 아래쪽)
  if (opt.tags?.length) {
    text(ctx, opt.tags.slice(0, 3).map((t) => TAGS[t].name).join(' · '), r.x + r.w / 2, y + r.h - 24, { font: 'small', align: 'center', color: C.dim, shadow: false });
  }
  // 아이콘 영역
  rect(ctx, r.x + r.w / 2 - 20, y + 24, 40, 30, '#0b1118');
  const augKind = kind === 'branch' || kind === 'mastery' || kind === 'evolve' || kind === 'weaponBox';
  const icon = kind === 'weaponBox' ? (opt.take ? `gun_${opt.gun}` : (state.player.guns[0] ? `gun_${state.player.guns[0].id}` : null)) : kind === 'relic' ? 'relic' : kind === 'evolve' ? `gun_${state.player.guns[opt.slot].id}` : augKind ? slotIcon(state, state.pending.key) : cardIcon(state, opt);
  const bobY = hover ? Math.round(Math.sin(now * 8)) : 0;
  if (icon) drawSprite(ctx, icon, r.x + r.w / 2, y + 39 + bobY, { scale: 2 });
  // 시너지: 보유 태그와 겹치는 수
  if (opt.synergy > 0) {
    const label = `시너지 +${opt.synergy}`;
    const tw = Math.ceil(textWidth(ctx, label, 'small')) + 6;
    rect(ctx, r.x + r.w - tw - 4, y + 56 - 11, tw, 11, C.tealDark);
    text(ctx, label, r.x + r.w - 7, y + 56 - 10, { font: 'small', align: 'right', color: C.white, shadow: false });
  }
  const title = augKind ? opt.title.replace(/^\[.\]\s*/, '') : opt.title;
  const lines = wrap(ctx, title, r.x + r.w / 2, y + 62, r.w - 14, 12, { font: 'bold', align: 'center' });
  wrap(ctx, opt.desc ?? '', r.x + r.w / 2, y + 66 + lines * 12, r.w - 14, 11, { font: 'small', align: 'center', color: augKind || opt.type === 'tactic' ? C.white : C.goldLight });
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
  if (opt.type === 'tactic') return 'card';
  if (opt.type === 'synth') return 'relic';
  return 'medkit';
}

// ───────────────────────── 빌드 화면 (Tab / 모바일 빌드 버튼) ─────────────────────────

const BUILD_BTN = { x: 142, y: 8, w: 32, h: 32 };

export function buildButtonHit(mx, my, pad = 4) {
  const r = BUILD_BTN;
  return mx >= r.x - pad && mx < r.x + r.w + pad && my >= r.y - pad && my < r.y + r.h + pad;
}

export function drawBuildButton(ctx) {
  const r = BUILD_BTN;
  panel(ctx, r.x, r.y, r.w, r.h, { fill: C.panel, edge: C.panelEdge, cut: 3 });
  for (let k = 0; k < 3; k++) rect(ctx, r.x + 8, r.y + 9 + k * 6, 16, 2, k === 0 ? C.purple : C.white);
}

/** 보유 스킬·총·전술·패시브와 태그 공명 진행도. */
export function drawBuild(ctx, state, W, H, mobile) {
  ctx.fillStyle = 'rgba(6,9,13,0.9)';
  ctx.fillRect(0, 0, W, H);
  const p = state.player;
  const w = Math.min(W - 20, 520);
  const x = Math.round(W / 2 - w / 2);
  const top = 12;
  stripeTitle(ctx, W, top, '빌드', mobile ? '탭해서 닫기' : 'Tab 으로 닫기', C.purple);
  const y0 = top + 50;
  const colW = Math.floor((w - 12) / 2);
  // 왼쪽: 스킬·총·전술·패시브
  let y = y0;
  const head = (label, yy) => text(ctx, label, x, yy, { font: 'small', color: C.dim });
  head('스킬', y);
  y += 11;
  for (const k of ['c', 'q', 'e', 'x']) {
    const s = p.skills[k];
    const def = SKILLS[s.id];
    const br = s.branch ? ` · ${def.branches[s.branch].name}` : '';
    const ms = s.mastery ? ` · ${def.masteries[s.mastery].name}` : '';
    text(ctx, `${k.toUpperCase()} ${def.name} ${s.level > 0 ? `Lv${s.level}${br}${ms}` : '잠김'}`, x + 4, y, { font: 'small', color: s.level > 0 ? C.white : C.dim2 });
    y += 11;
  }
  y += 4;
  head('총기', y);
  y += 11;
  for (const g of p.guns) {
    if (!g) continue;
    text(ctx, g.evolved ? evoOf(g).name : `${GUNS[g.id].name} T${g.tier}`, x + 4, y, { font: 'small', color: g.evolved ? C.goldLight : C.white });
    y += 11;
  }
  if (p.utils?.length) {
    y += 4;
    head('용병 계약', y);
    y += 11;
    for (const u of p.utils) {
      text(ctx, `${UTILS[u.id].name} Lv${u.level} · 충전 ${u.charges}`, x + 4, y, { font: 'small', color: C.teal });
      y += 11;
    }
  }
  if (p.relics?.length) {
    y += 4;
    head('유물', y);
    y += 11;
    for (const r of p.relics) {
      text(ctx, `${RELICS[r].name} — ${RELICS[r].desc}`, x + 4, y, { font: 'small', color: C.purple });
      y += 11;
    }
  }
  y += 4;
  const tactics = Object.keys(p.tactics);
  head(`전술 카드 ${tactics.length}`, y);
  y += 11;
  for (const id of tactics) {
    text(ctx, TACTICS[id].name, x + 4, y, { font: 'small', color: RARITY_COLOR[TACTICS[id].rarity] });
    y += 11;
  }
  if (!tactics.length) {
    text(ctx, '없음', x + 4, y, { font: 'small', color: C.dim2 });
    y += 11;
  }
  y += 4;
  const pas = Object.entries(p.passives).filter(([, n]) => n > 0);
  head('패시브', y);
  y += 11;
  text(ctx, pas.length ? pas.map(([k, n]) => `${PASSIVES[k].name} ×${n}`).join(' · ') : '없음', x + 4, y, { font: 'small', color: pas.length ? C.white : C.dim2 });
  // 오른쪽: 태그 공명 (카드·패시브 기준, 4개면 공명 → 총기 진화는 M14)
  const rx = x + colW + 12;
  let ry = y0;
  text(ctx, `태그 공명 (${RESONANCE}개면 공명)`, rx, ry, { font: 'small', color: C.dim });
  ry += 13;
  const counts = Object.entries(tagCounts(state, false)).sort((a, b) => b[1] - a[1]);
  if (!counts.length) text(ctx, '전술 카드·태그 패시브를 모으면 표시됩니다', rx, ry, { font: 'small', color: C.dim2 });
  for (const [tag, n] of counts.slice(0, 12)) {
    const full = n >= RESONANCE;
    text(ctx, TAGS[tag].name, rx, ry, { font: 'small', color: full ? C.goldLight : C.white });
    for (let k = 0; k < RESONANCE; k++) rect(ctx, rx + 46 + k * 14, ry + 2, 12, 5, k < n ? (full ? C.gold : C.purple) : C.dim2);
    text(ctx, `${n}/${RESONANCE}`, rx + 46 + RESONANCE * 14 + 4, ry, { font: 'small', color: full ? C.goldLight : C.dim });
    ry += 12;
  }
}

// ───────────────────────── 상점 (구매 페이즈) ─────────────────────────

const SHOP_COLS = [
  { title: '무기', kinds: ['buyGun'] },
  { title: '강화 · 방어구', kinds: ['tierUp', 'armor', 'ultOrb'] },
  { title: '용병 계약', kinds: ['contract', 'utilUpgrade', 'utilCharge'] },
  { title: '무작위 · 리롤', kinds: ['card', 'relic', 'shopReroll', 'rerollTicket'] },
];

function shopLayout(state, W, H) {
  const opts = state.pending.options;
  const colW = Math.min(124, Math.floor((W - 12 - 156 - 18) / 4));
  const x0 = 12;
  const y0 = 62;
  // 가장 긴 열이 화면에 들어가게 칸 높이를 줄인다
  const most = Math.max(1, ...SHOP_COLS.map((col) => opts.filter((o) => col.kinds.includes(o.kind)).length));
  const itemH = Math.max(34, Math.min(52, Math.floor((H - y0 - 8 - 4 * (most - 1)) / most)));
  const rects = new Array(opts.length).fill(null);
  SHOP_COLS.forEach((col, c) => {
    let k = 0;
    opts.forEach((o, i) => {
      if (!col.kinds.includes(o.kind)) return;
      rects[i] = { x: x0 + c * (colW + 6), y: y0 + k * (itemH + 4), w: colW, h: itemH };
      k++;
    });
  });
  const next = opts.findIndex((o) => o.kind === 'next');
  rects[next] = { x: W - 150, y: H - 44, w: 138, h: 30 };
  return { rects, colW, x0, y0 };
}

function drawShop(ctx, state, W, H, hover, mobile) {
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
    if (r.h >= 42) wrap(ctx, o.desc, r.x + 6, r.y + 17, r.w - 12, 9, { font: 'small', color: C.dim, shadow: false, maxLines: Math.max(1, Math.floor((r.h - 30) / 9)) });
    ctx.globalAlpha = 1;
    rect(ctx, r.x + 1, r.y + r.h - 13, r.w - 2, 12, 'rgba(0,0,0,0.35)');
    drawSprite(ctx, 'coin', r.x + r.w - 8, r.y + r.h - 7);
    text(ctx, o.blocked ? (o.kind === 'armor' ? '보유 중' : '구매 불가') : `${o.price}`, r.x + r.w - 14, r.y + r.h - 12, { font: 'bold', align: 'right', color: on ? C.goldLight : o.blocked ? C.dim2 : C.red });
    text(ctx, `${i + 1}`, r.x + 6, r.y + r.h - 11, { font: 'small', color: C.dim2 });
  });

  // 오른쪽: 내 장비
  const px = W - 150;
  panel(ctx, px, y0 - 14, 138, 182, { fill: C.panel, edge: C.panelEdge, cut: 4 });
  text(ctx, '내 장비', px + 8, y0 - 9, { font: 'small', color: C.dim });
  const p = state.player;
  let ly = y0 + 6;
  p.guns.forEach((slot, idx) => {
    text(ctx, idx === 0 ? '주무기' : '보조', px + 8, ly, { font: 'small', color: C.dim2 });
    if (slot) {
      drawSprite(ctx, `gun_${slot.id}`, px + 30, ly + 16);
      text(ctx, slot.evolved ? evoOf(slot).name : `${GUNS[slot.id].name} T${slot.tier}`, px + 52, ly + 11, { font: 'small', color: slot.evolved ? C.goldLight : C.white });
    } else text(ctx, '없음', px + 52, ly + 11, { font: 'small', color: C.dim2 });
    ly += 28;
  });
  drawSprite(ctx, 'shield', px + 14, ly + 6);
  text(ctx, `실드 ${p.shield}`, px + 24, ly + 2, { font: 'small', color: C.shield });
  ly += 16;
  text(ctx, `궁극기 오브 ${state.ultOrbs}/${ULT.orbsNeeded}`, px + 8, ly, { font: 'small', color: C.gold });
  ly += 14;
  const skills = Object.entries(p.skills).filter(([, s]) => s.level > 0).map(([k, s]) => `${k.toUpperCase()}${s.level}${s.branch ? SKILLS[s.id].branches[s.branch].name[0] : ''}`).join(' ');
  text(ctx, `스킬 ${skills}`, px + 8, ly, { font: 'small', color: C.white });
  ly += 12;
  for (const u of p.utils ?? []) {
    text(ctx, `계약 ${UTILS[u.id].name} Lv${u.level} · 충전 ${u.charges}`, px + 8, ly, { font: 'small', color: C.teal });
    ly += 11;
  }
  if (p.relics?.length) wrap(ctx, `유물 ${p.relics.map((r) => RELICS[r].name).join(', ')}`, px + 8, ly, 122, 10, { font: 'small', color: C.purple, maxLines: 2 });

  // 다음 라운드 버튼
  const ni = opts.findIndex((o) => o.kind === 'next');
  const r = rects[ni];
  const hov = hover === ni;
  panel(ctx, r.x, r.y, r.w, r.h, { fill: hov ? C.red : C.redDark, edge: hov ? C.white : C.red, cut: 5 });
  text(ctx, '다음 라운드 ▶', r.x + r.w / 2, r.y + 6, { font: 'bold', align: 'center' });
  text(ctx, mobile ? '탭' : 'Enter', r.x + r.w / 2, r.y + 19, { font: 'small', align: 'center', color: '#ffd0d5' });
}

function shortTitle(o) {
  if (o.kind === 'card') return '무작위 카드';
  return o.title.replace(/^계약: /, '').replace(/^유물: /, '◆ ');
}

function shopIcon(state, o) {
  if (o.kind === 'buyGun') return `gun_${o.id}`;
  if (o.kind === 'tierUp') return `gun_${state.player.guns[o.slot].id}`;
  if (o.kind === 'armor') return 'shield';
  if (o.kind === 'ultOrb') return 'orb';
  if (o.kind === 'card') return 'card';
  if (o.kind === 'contract' || o.kind === 'utilUpgrade' || o.kind === 'utilCharge') return `u_${o.id}`;
  if (o.kind === 'relic') return 'relic';
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

export function drawPause(ctx, W, H, settings, mouse, mobile = false) {
  ctx.fillStyle = 'rgba(6,9,13,0.85)';
  ctx.fillRect(0, 0, W, H);
  const rects = menuRects(W, H);
  const hover = pauseHit(W, H, mouse.x, mouse.y);
  stripeTitle(ctx, W, rects[0].y - 46, '일시정지', mobile ? '탭해서 설정 변경' : '숫자 키 또는 클릭으로 설정 변경', C.red);
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
      text(ctx, mobile ? '계속하기' : '계속하기  (P / Esc)', r.x + r.w / 2, r.y + 4, { font: 'bold', align: 'center', color: C.red });
    }
  });
}

export function drawTitle(ctx, W, H, now, mobile = false) {
  ctx.fillStyle = 'rgba(6,9,13,0.6)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const y = Math.round(H * 0.22);
  // 로고
  rect(ctx, cx - 110, y + 46, 220, 2, C.red);
  rect(ctx, cx - 110 + ((now * 60) % 200), y + 46, 20, 2, C.white);
  text(ctx, '집중포화', cx, y, { font: 'huge', align: 'center' });
  text(ctx, 'C R O S S F I R E', cx, y + 36, { font: 'small', align: 'center', color: C.red });
  const lines = mobile
    ? [
      ['왼쪽 드래그', '이동'],
      ['자동', '조준 · 발사 · 스킬'],
      ['스킬 칸 탭', '스킬 직접 사용 (Q는 누르고 있기)'],
      ['탭', '카드·상점 선택'],
      ['왼쪽 위 Ⅱ', '일시정지 · 설정'],
    ]
    : [
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
  if (Math.floor(now * 2) % 2 === 0) text(ctx, mobile ? '탭해서 시작' : '클릭 또는 Enter 로 시작', cx, H - 34, { font: 'bigBold', align: 'center', color: C.red });
}

export function drawResult(ctx, state, W, H, now, fresh = [], mobile = false) {
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
    ['라운드', `${state.round}`, 'round'],
    ['레벨', `${p.level}`],
    ['처치', `${state.stats.kills}`, 'kills'],
    ['시간', fmt(state.time), 'time'],
    ['총 피해', Math.round(state.stats.damage).toLocaleString()],
    ['크레딧', state.stats.creditsEarned.toLocaleString()],
  ];
  const bw = 78;
  const sx = Math.round(cx - (stats.length * (bw + 4)) / 2);
  stats.forEach(([k, v, rec], i) => {
    const x = sx + i * (bw + 4);
    const isNew = rec && fresh.includes(rec);
    panel(ctx, x, 90, bw, 36, { fill: C.panelSolid, edge: isNew ? C.gold : C.panelEdge, cut: 3 });
    text(ctx, k, x + bw / 2, 95, { font: 'small', align: 'center', color: C.dim });
    text(ctx, v, x + bw / 2, 107, { font: 'bold', align: 'center', color: isNew ? C.goldLight : C.white });
    if (isNew && Math.floor(now * 3) % 2 === 0) {
      rect(ctx, x + bw - 22, 86, 22, 9, C.gold);
      text(ctx, 'NEW', x + bw - 11, 86, { font: 'small', align: 'center', color: PAL.k, shadow: false });
    }
  });

  // 빌드
  const bxp = Math.round(cx - 200);
  panel(ctx, bxp, 136, 400, 112, { fill: C.panel, edge: C.panelEdge, cut: 4 });
  text(ctx, `최종 빌드 · ${AGENTS[state.agent].name}`, bxp + 8, 141, { font: 'small', color: C.dim });
  p.guns.forEach((slot, i) => {
    const y = 158 + i * 20;
    if (!slot) return;
    drawSprite(ctx, `gun_${slot.id}`, bxp + 22, y + 5);
    text(ctx, slot.evolved ? evoOf(slot).name : `${GUNS[slot.id].name} T${slot.tier}`, bxp + 42, y, { font: 'body', color: slot.evolved ? C.goldLight : C.white });
  });
  let sxp = bxp + 200;
  Object.entries(p.skills).forEach(([k, s], i) => {
    const y = 156 + i * 21;
    ctx.globalAlpha = s.level > 0 ? 1 : 0.3;
    drawSprite(ctx, SKILL_ICON[s.id], sxp + 12, y + 6);
    ctx.globalAlpha = 1;
    const def = SKILLS[s.id];
    const br = (s.branch ? ` ${def.branches[s.branch].name}` : '') + (s.mastery ? ` · ${def.masteries[s.mastery].name}` : '');
    text(ctx, s.level > 0 ? `${def.name} Lv${s.level}${br}` : `${def.name} -`, sxp + 30, y + 1, { font: 'small', color: s.level > 0 ? C.white : C.dim2 });
  });
  const pas = Object.entries(p.passives);
  pas.forEach(([k, n], i) => {
    drawSprite(ctx, PASSIVE_ICON[k], bxp + 16 + i * 60, 232);
    text(ctx, `×${n}`, bxp + 26 + i * 60, 227, { font: 'small', color: C.white });
  });
  if (!pas.length) text(ctx, '패시브 없음', bxp + 8, 228, { font: 'small', color: C.dim2 });
  if (Math.floor(now * 2) % 2 === 0) text(ctx, mobile ? '탭해서 다시 시작' : 'R 키로 다시 시작', cx, H - 30, { font: 'bigBold', align: 'center', color });
}

// ───────────────────────── 에이전트 선택 ─────────────────────────

export const AGENT_LIST = Object.keys(AGENTS);
const AGENT_CARD = { w: 172, h: 238, gap: 8 };
const AGENT_SLOTS = ['c', 'q', 'e', 'x'];
const AGENT_TINT = { chamber: C.gold, killjoy: '#f6e05e', reyna: C.purple, brimstone: C.orange, gecko: C.hp };

function agentRects(W, H) {
  const n = AGENT_LIST.length;
  const w = Math.min(AGENT_CARD.w, Math.floor((W - 16 - (n - 1) * AGENT_CARD.gap) / n)); // 화면이 좁으면 카드를 줄인다
  const total = n * w + (n - 1) * AGENT_CARD.gap;
  const x0 = Math.round(W / 2 - total / 2);
  const y = Math.round(H / 2 - AGENT_CARD.h / 2 + 16);
  return AGENT_LIST.map((_, i) => ({ x: x0 + i * (w + AGENT_CARD.gap), y, w, h: AGENT_CARD.h }));
}

export function agentSelectHit(W, H, mx, my) {
  return agentRects(W, H).findIndex((r) => mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h);
}

export function drawAgentSelect(ctx, W, H, mouse, now, records = {}, mobile = false) {
  ctx.fillStyle = 'rgba(6,9,13,0.8)';
  ctx.fillRect(0, 0, W, H);
  const rects = agentRects(W, H);
  const hover = agentSelectHit(W, H, mouse.x, mouse.y);
  stripeTitle(ctx, W, rects[0].y - 50, '에이전트 선택', mobile ? '탭해서 선택' : `${AGENT_LIST.map((_, i) => i + 1).join(' / ')} 키 또는 클릭`, C.red);
  AGENT_LIST.forEach((id, i) => {
    const a = AGENTS[id];
    const r = rects[i];
    const hov = i === hover;
    const tint = AGENT_TINT[id] ?? C.gold;
    const y = r.y - (hov ? 3 : 0);
    panel(ctx, r.x, y, r.w, r.h, { fill: hov ? '#16222e' : C.panelSolid, edge: hov ? tint : C.panelEdge, cut: 6 });
    rect(ctx, r.x + 6, y + 1, r.w - 7, 2, tint);
    // 카드가 좁으면(에이전트 5명 이상) 설명·스킬 한 줄 설명을 줄이고 초상을 작게 (compact)
    const compact = r.w < 150;
    const pw = compact ? 36 : 52;
    const ph = compact ? 44 : 62;
    const px = compact ? 8 : 10;
    rect(ctx, r.x + px, y + 12, pw, ph, '#0b1118');
    drawSprite(ctx, `${a.sprite}${hov && Math.floor(now * 6) % 2 ? 1 : 0}`, r.x + px + pw / 2, y + 43, { scale: compact ? 2 : 3 });
    text(ctx, `${i + 1}`, r.x + r.w - 8, y + 8, { font: 'small', align: 'right', color: C.dim });
    const tx = r.x + (compact ? 50 : 70);
    text(ctx, a.name, tx, y + 14, { font: r.w < 160 ? 'bold' : 'bigBold', color: C.white }); // 카드가 좁으면 작은 글꼴
    if (compact) {
      wrap(ctx, a.role, tx, y + 30, r.w - (tx - r.x) - 4, 10, { font: 'small', color: tint });
    } else {
      text(ctx, a.role, tx, y + 38, { font: 'small', color: tint });
      wrap(ctx, a.desc, tx, y + 52, r.w - 78, 10, { font: 'small', color: C.dim });
    }
    // 스킬 4개
    const rowH = compact ? 22 : 26;
    const row0 = compact ? 64 : 82;
    AGENT_SLOTS.forEach((slot, j) => {
      const sid = a.slots[slot];
      const sy = y + row0 + j * rowH;
      rect(ctx, r.x + (compact ? 6 : 10), sy, compact ? 20 : 22, compact ? 20 : 22, '#0b1118');
      drawSprite(ctx, SKILL_ICON[sid], r.x + (compact ? 16 : 21), sy + (compact ? 10 : 11));
      const label = `${slot.toUpperCase()} ${SKILLS[sid].name}`;
      if (compact) {
        text(ctx, label, r.x + 29, sy + 5, { font: 'small', color: C.white });
      } else {
        text(ctx, label, r.x + 38, sy + 1, { font: 'bold', color: C.white });
        text(ctx, SKILLS[sid].brief, r.x + 38, sy + 13, { font: 'small', color: C.dim, shadow: false });
      }
    });
    // 최고 기록
    const rec = recordOf(records, id);
    const recText = rec.runs
      ? `최고 R${rec.bestRound} · 승리 ${rec.wins}/${rec.runs}${rec.fastestWin != null ? ` · 최단 ${fmt(rec.fastestWin)}` : ''}`
      : '기록 없음';
    text(ctx, recText, r.x + r.w / 2, y + r.h + 4, { font: 'small', align: 'center', color: rec.runs ? C.dim : C.dim2 });
    // 고유 패시브
    const py = y + r.h - (compact ? 74 : 46);
    rect(ctx, r.x + 6, py - 4, r.w - 12, 1, C.panelEdge);
    text(ctx, `패시브 · ${a.passive.name}`, r.x + 10, py, { font: 'small', color: tint });
    wrap(ctx, a.passive.desc, r.x + 10, py + 11, r.w - 18, 9, { font: 'small', color: C.white, shadow: false });
  });
}

function fmt(t) {
  const s = Math.ceil(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
