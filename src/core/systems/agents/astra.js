// 아스트라 (설계 28장): 천상계 형상(X)으로 맵 어디든 별을 깔고, 몸으로 돌아와 C/Q/E 로 조준점에 가장 가까운 별을 변환한다.
// C 중력의 샘(끌어당긴 뒤 폭발·취약) · Q 신성 파동(기절) · E 성운(연막) · 궁극기 우주 장벽(두 세계), 고유 패시브 별빛.
// 쓴 별은 사라졌다가 같은 자리에 다시 생긴다. 처치로 얻는 자원은 없다 (모두 시간 쿨다운).
import { DT, WORLD } from '../../../data/balance.js';
import { SKILLS } from '../../../data/skills.js';
import { STAR, ASTRAL, STATUS } from '../../../data/agents.js';
import { ENEMIES, isBig } from '../../../data/enemies.js';
import { blocked, pushOut } from '../map.js';
import { damageEnemy } from '../combat.js';
import { addField } from '../fields.js';
import { maxHp } from '../../stats.js';
import {
  skillValue, branchOf, masteryOf, masteryAlt, manualAuto, cooldownOf, ultCost, recharge, spendCharge, durationMult,
} from '../skillutil.js';

const GW = SKILLS.gravityWell;
const NP = SKILLS.novaPulse;
const NB = SKILLS.nebula;
const AF = SKILLS.astralForm;

export function initSkills(level) {
  return {
    c: { id: 'gravityWell', level: level('gravityWell'), branch: null, mastery: null, charges: GW.maxCharges, cd: 0, held: false },
    e: { id: 'nebula', level: level('nebula'), branch: null, mastery: null, charges: NB.maxCharges, cd: 0, held: false },
    q: { id: 'novaPulse', level: level('novaPulse'), branch: null, mastery: null, charges: NP.maxCharges, cd: 0, held: false },
    x: { id: 'astralForm', level: level('astralForm'), branch: null, mastery: null, held: false, mHeld: false, uHeld: false, divideMode: 0, divA: null, cd: 0 },
  };
}

const growth = (state) => 1 + 0.1 * (state.round - 1);
const alive = (e) => e.hp > 0 && !e.gone;
const lvl = (p, slot) => Math.max(1, p.skills[slot].level);
const near = (a, x, y, r) => (a.x - x) ** 2 + (a.y - y) ** 2 <= r * r;
const gwMax = (p) => GW.maxCharges + (masteryAlt(p, 'c')?.charges ?? 0);

/** 최대 별 수 (천상계 형상 레벨). */
export const maxStars = (p) => skillValue('astralForm', 'stars', lvl(p, 'x'));
/** 지금 더 놓을 수 있는 별 수 (회수 직후 잠긴 칸 제외). */
export const freeStars = (state) => maxStars(state.player) - (state.stars ?? []).length - (state.starLocks ?? []).length;
const reformTime = (p) => STAR.reform * (masteryOf(p, 'x')?.reformMult ?? 1);

function detain(e, t) {
  const resist = e.type === 'boss' ? STATUS.bossDetainResist : ENEMIES[e.type].elite ? STATUS.eliteDetainResist : 1;
  e.detained = Math.max(e.detained ?? 0, t * resist);
}

export function update(state, input) {
  const keys = input.keys ?? {};
  const p = state.player;
  const s = p.skills.x;
  const edge = (slot) => {
    const k = p.skills[slot];
    const e = !!keys[slot] && !k.held;
    k.held = !!keys[slot];
    return e;
  };
  const xPress = edge('x');
  const click = !!keys.m && !s.mHeld;
  s.mHeld = !!keys.m;
  const right = !!keys.u && !s.uHeld;
  s.uHeld = !!keys.u;
  if (s.cd > 0) s.cd = Math.max(0, s.cd - DT);
  updateStars(state);
  if (p.astral > 0) {
    // 천상계: 몸은 멈추고(총·이동 정지), 클릭으로 별 배치·회수, 우클릭으로 장벽 조준
    keys.u = false; // 우클릭은 유틸 대신 장벽 (같은 틱의 updateUtils 가 읽지 않게)
    p.astral -= DT;
    astralInput(state, input, click, right);
    if (xPress || p.astral <= 0) leaveAstral(state);
  } else {
    if (xPress && !(s.cd > 0)) enterAstral(state);
    const c = edge('c');
    const q = edge('q');
    const e = edge('e');
    updateWellSkill(state, input, c);
    updateNovaSkill(state, input, q);
    updateNebulaSkill(state, input, e);
    autoDivide(state);
  }
  updateWells(state);
  updateNovas(state);
  updateDivide(state);
  applyStarlight(state);
}

/**
 * 라운드 시작 무료 배치 (설계 28.4): 시간이 멈춘 채 천상계에 있다. X 로 전투 시작.
 * step 이 COMBAT 갱신 대신 이것만 부른다. 계속 계획 중이면 true.
 */
export function plan(state, input) {
  const p = state.player;
  const s = p.skills.x;
  const keys = input.keys ?? {};
  const xPress = !!keys.x && !s.held;
  s.held = !!keys.x;
  const click = !!keys.m && !s.mHeld;
  s.mHeld = !!keys.m;
  s.uHeld = !!keys.u;
  state.planTick = (state.planTick ?? 0) + 1;
  if (click) placeOrRecall(state, input.aim);
  if (xPress || state.planTick >= ASTRAL.planMax) {
    state.planning = false;
    state.events.push({ type: 'astralOut', x: p.x, y: p.y, plan: true });
    return false;
  }
  return true;
}

/** 라운드 시작 시 계획 단계를 열지. */
export const wantsPlan = () => ASTRAL.plan;

function enterAstral(state) {
  const p = state.player;
  p.astral = ASTRAL.limit * (masteryOf(p, 'x')?.astralMult ?? 1);
  p.astralMax = p.astral;
  p.skills.x.divideMode = 0;
  state.events.push({ type: 'astralIn', x: p.x, y: p.y });
}

function leaveAstral(state) {
  const p = state.player;
  p.astral = 0;
  p.skills.x.divideMode = 0;
  p.skills.x.divA = null;
  p.skills.x.cd = ASTRAL.cooldown;
  state.events.push({ type: 'astralOut', x: p.x, y: p.y });
}

function astralInput(state, input, click, right) {
  const p = state.player;
  const s = p.skills.x;
  // 우클릭: 오브가 차 있으면 장벽 조준 시작 / 취소
  if (right) {
    if (s.divideMode) s.divideMode = 0;
    else if (state.ultOrbs >= ultCost(p) && !state.divide) s.divideMode = 1;
  }
  if (!click || !input.aim) return;
  if (s.divideMode === 1) {
    s.divA = { x: input.aim.x, y: input.aim.y };
    s.divideMode = 2;
  } else if (s.divideMode === 2) {
    if (Math.hypot(input.aim.x - s.divA.x, input.aim.y - s.divA.y) > 20) castDivide(state, s.divA, input.aim);
  } else placeOrRecall(state, input.aim);
}

// ── 별 ────────────────────────────────────────────────────────────────

/** 클릭: 별 위면 회수, 아니면 빈 바닥에 새 별. */
function placeOrRecall(state, at) {
  if (!at) return;
  const p = state.player;
  const stars = (state.stars ??= []);
  const hit = stars.find((st) => near(st, at.x, at.y, STAR.pick));
  if (hit) {
    stars.splice(stars.indexOf(hit), 1);
    (state.starLocks ??= []).push(STAR.recallLock);
    state.events.push({ type: 'starRecall', x: hit.x, y: hit.y });
    return;
  }
  const x = Math.min(WORLD.width - 10, Math.max(10, at.x));
  const y = Math.min(WORLD.height - 10, Math.max(10, at.y));
  if (freeStars(state) <= 0 || blocked(state.map, x, y) || stars.some((st) => near(st, x, y, STAR.minGap))) {
    state.events.push({ type: 'starDenied', x, y });
    return;
  }
  stars.push({ id: (state.nextStarId = (state.nextStarId ?? 0) + 1), x, y, reform: 0 });
  state.events.push({ type: 'starPlaced', x, y });
  const fall = masteryOf(p, 'x')?.placeDamage;
  if (fall) for (const e of state.enemies) if (alive(e) && near(e, x, y, 70 + e.r)) damageEnemy(state, e, fall * growth(state), false, 'astralForm');
}

function updateStars(state) {
  for (const st of state.stars ?? []) if (st.reform > 0) st.reform = Math.max(0, st.reform - DT);
  const locks = state.starLocks ?? [];
  for (let i = locks.length - 1; i >= 0; i--) {
    locks[i] -= DT;
    if (locks[i] <= 0) locks.splice(i, 1);
  }
}

/** 조준점에 가장 가까운, 지금 쓸 수 있는 별 (없으면 null). */
export function starNearest(state, at) {
  let best = null;
  let bd = Infinity;
  for (const st of state.stars ?? []) {
    if (st.reform > 0) continue;
    const d = (st.x - at.x) ** 2 + (st.y - at.y) ** 2;
    if (d < bd) {
      bd = d;
      best = st;
    }
  }
  return best;
}
export const readyStars = (state) => (state.stars ?? []).filter((st) => !(st.reform > 0));

/** 별 하나를 쓴다: 사라졌다가 reform 초 뒤 같은 자리에. */
function consume(state, st, reform = reformTime(state.player)) {
  st.reform = reform;
}

/** 스킬 키 → 쓸 별. 조준이 없으면 플레이어 위치 기준. */
function pickStar(state, input) {
  const p = state.player;
  return starNearest(state, input.aim ?? { x: p.x, y: p.y });
}

/** 자동화 숙련(수동 모드): 별 근처(r)에 적이 n 이상 모이면 그 별. */
function crowdedStar(state, r, n, elite = false) {
  for (const st of readyStars(state)) {
    let k = 0;
    for (const e of state.enemies) {
      if (!alive(e) || !near(e, st.x, st.y, r)) continue;
      if (elite && isBig(e)) return st;
      k++;
    }
    if (k >= n) return st;
  }
  return null;
}

// ── C 중력의 샘 ──────────────────────────────────────────────────────

function updateWellSkill(state, input, pressed) {
  const p = state.player;
  const s = p.skills.c;
  if (s.level <= 0) return;
  recharge(s, gwMax(p), cooldownOf(p, 'gravityWell', s.level), DT);
  let st = null;
  if (pressed) st = pickStar(state, input);
  else if (manualAuto(p, 'c', 'autoWell') && s.charges > 0) st = crowdedStar(state, ...GW.masteries.autoWell.crowd);
  if (!st || s.charges <= 0) return;
  spendCharge(s, gwMax(p), cooldownOf(p, 'gravityWell', s.level));
  makeWell(state, st.x, st.y);
  consume(state, st);
}

function makeWell(state, x, y) {
  const p = state.player;
  const br = branchOf(p, 'c');
  const lv = lvl(p, 'c');
  const r = skillValue('gravityWell', 'radius', lv) * (br?.radiusMult ?? 1);
  const t = GW.pullTime * (br?.pullMult ?? 1);
  (state.wells ??= []).push({ x, y, r, t, maxT: t });
  state.events.push({ type: 'wellOn', x, y, r });
}

function updateWells(state) {
  const p = state.player;
  const list = state.wells ?? [];
  const br = branchOf(p, 'c');
  const grind = masteryOf(p, 'c')?.dps ?? 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    w.t -= DT;
    for (const e of state.enemies) {
      if (!alive(e) || e.type === 'boss' || e.type === 'pillar' || !near(e, w.x, w.y, w.r + e.r)) continue;
      const d = Math.hypot(w.x - e.x, w.y - e.y) || 1;
      const step = Math.min(d, GW.pullSpeed * (isBig(e) ? 0.4 : 1) * DT);
      e.x += ((w.x - e.x) / d) * step;
      e.y += ((w.y - e.y) / d) * step;
      if (state.map) pushOut(state.map, e);
      if (grind) damageEnemy(state, e, grind * DT * growth(state), false, 'gravityWell');
    }
    if (w.t > 0) continue;
    // 폭발: 피해 + 취약
    const lv = lvl(p, 'c');
    const dmg = skillValue('gravityWell', 'damage', lv) * (br?.damageMult ?? 1) * growth(state);
    const vuln = skillValue('gravityWell', 'vulnerable', lv) + (masteryOf(p, 'c')?.bonus ?? 0);
    for (const e of state.enemies) {
      if (!alive(e) || !near(e, w.x, w.y, w.r + e.r)) continue;
      damageEnemy(state, e, dmg, false, 'gravityWell');
      e.vulnerable = Math.max(e.vulnerable ?? 0, vuln);
    }
    if (br?.field) addField(state, w.x, w.y, w.r * 0.8, br.field.duration * durationMult(p), br.field.slow);
    state.events.push({ type: 'wellBlast', x: w.x, y: w.y, r: w.r });
    list.splice(i, 1);
  }
}

// ── Q 신성 파동 ──────────────────────────────────────────────────────

function updateNovaSkill(state, input, pressed) {
  const p = state.player;
  const s = p.skills.q;
  if (s.level <= 0) return;
  recharge(s, NP.maxCharges, cooldownOf(p, 'novaPulse', s.level), DT);
  let st = null;
  if (pressed) st = pickStar(state, input);
  else if (manualAuto(p, 'q', 'autoNova') && s.charges > 0) st = crowdedStar(state, ...NP.masteries.autoNova.crowd, true);
  if (!st || s.charges <= 0) return;
  spendCharge(s, NP.maxCharges, cooldownOf(p, 'novaPulse', s.level));
  makeNova(state, st.x, st.y, 1);
  consume(state, st);
}

function makeNova(state, x, y, power) {
  const p = state.player;
  const br = branchOf(p, 'q');
  const lv = lvl(p, 'q');
  const r = skillValue('novaPulse', 'radius', lv) * (br?.radiusMult ?? 1);
  const t = br?.windup ?? NP.windup;
  (state.novas ??= []).push({ x, y, r, t, maxT: t, power, echo: power === 1 && br?.echo ? br.echo : 0 });
  state.events.push({ type: 'novaCharge', x, y, r, t });
}

function updateNovas(state) {
  const p = state.player;
  const list = state.novas ?? [];
  const br = branchOf(p, 'q');
  const m = masteryOf(p, 'q');
  for (let i = list.length - 1; i >= 0; i--) {
    const n = list[i];
    n.t -= DT;
    if (n.t > 0) continue;
    const lv = lvl(p, 'q');
    const stun = (skillValue('novaPulse', 'stun', lv) * (br?.stunMult ?? 1) + (masteryAlt(p, 'q')?.stunBonus ?? 0)) * n.power;
    const dmg = skillValue('novaPulse', 'damage', lv) * (m?.damageMult ?? 1) * growth(state) * n.power;
    for (const e of state.enemies) {
      if (!alive(e) || !near(e, n.x, n.y, n.r + e.r)) continue;
      detain(e, stun);
      if (m?.vuln) e.vulnerable = Math.max(e.vulnerable ?? 0, stun);
      damageEnemy(state, e, dmg, false, 'novaPulse');
    }
    state.events.push({ type: 'nova', x: n.x, y: n.y, r: n.r });
    list.splice(i, 1);
    if (n.echo) list.push({ x: n.x, y: n.y, r: n.r, t: n.echo, maxT: n.echo, power: 0.5, echo: 0 });
  }
}

// ── E 성운 ───────────────────────────────────────────────────────────

function updateNebulaSkill(state, input, pressed) {
  const p = state.player;
  const s = p.skills.e;
  if (s.level <= 0) return;
  recharge(s, NB.maxCharges, cooldownOf(p, 'nebula', s.level), DT);
  let st = null;
  if (pressed) st = pickStar(state, input);
  else if (manualAuto(p, 'e', 'autoNebula') && s.charges > 0 && p.hp < maxHp(p) * 0.5) st = starNearest(state, p);
  if (!st || s.charges <= 0) return;
  spendCharge(s, NB.maxCharges, cooldownOf(p, 'nebula', s.level));
  const br = branchOf(p, 'e');
  const lv = lvl(p, 'e');
  const r = skillValue('nebula', 'radius', lv);
  const life = skillValue('nebula', 'duration', lv) * (br?.durationMult ?? 1) * (masteryAlt(p, 'e')?.durationMult ?? 1) * durationMult(p);
  (state.smokes ??= []).push({ x: st.x, y: st.y, r, life, maxLife: life, owner: 'astra', star: st.id, slow: br?.slow ?? 0, dps: br?.dps ?? 0 });
  state.events.push({ type: 'nebula', x: st.x, y: st.y, r });
  // 소산 (숙련): 성운이 끝나면 별이 곧바로 다시 생긴다 → 지속 동안만 잠근다
  consume(state, st, s.mastery === 'dissipate' ? life : Math.max(reformTime(p), life));
}

/** 성운 안의 적: 짙은 성운 감속, 독성 성운 피해. */
function updateNebulaZones(state) {
  for (const z of state.smokes ?? []) {
    if (z.owner !== 'astra' || (!z.slow && !z.dps)) continue;
    for (const e of state.enemies) {
      if (!alive(e) || !near(e, z.x, z.y, z.r + e.r)) continue;
      if (z.slow) {
        e.chill = Math.max(e.chill ?? 0, z.slow);
        e.chillTime = Math.max(e.chillTime ?? 0, 0.25);
      }
      if (z.dps) damageEnemy(state, e, z.dps * DT * growth(state), false, 'nebula');
    }
  }
}

/** 장막 (성운 숙련): 성운 안에서 받는 피해. */
export function takenMult(state) {
  const p = state.player;
  if (p.skills.e.mastery !== 'veil') return 1;
  return (state.smokes ?? []).some((z) => z.owner === 'astra' && near(z, p.x, p.y, z.r)) ? NB.masteries.veil.takenMult : 1;
}

// ── 궁극기 우주 장벽: 두 세계 ──────────────────────────────────────────

function castDivide(state, a, b) {
  const p = state.player;
  const s = p.skills.x;
  const cost = ultCost(p);
  if (state.ultOrbs < cost || state.divide) return;
  state.ultOrbs -= cost;
  const br = branchOf(p, 'x');
  const life = skillValue('astralForm', 'divide', lvl(p, 'x')) * (br?.divideMult ?? 1) * durationMult(p);
  state.divide = { ax: a.x, ay: a.y, bx: b.x, by: b.y, life, maxLife: life, seal: br?.seal ?? 0 };
  if (br?.rebirth) for (const st of state.stars ?? []) st.reform = 0;
  s.divideMode = 0;
  s.divA = null;
  state.events.push({ type: 'divide', ax: a.x, ay: a.y, bx: b.x, by: b.y });
}

function updateDivide(state) {
  const d = state.divide;
  if (!d) return;
  d.life -= DT;
  if (d.life > 0) return;
  if (d.seal) {
    // 차원 봉합 (형태): 벽 선을 따라 폭발
    const len = Math.hypot(d.bx - d.ax, d.by - d.ay) || 1;
    for (const e of state.enemies) {
      if (!alive(e)) continue;
      const dist = Math.abs((d.bx - d.ax) * (e.y - d.ay) - (d.by - d.ay) * (e.x - d.ax)) / len;
      if (dist <= 70 + e.r) damageEnemy(state, e, d.seal * growth(state), false, 'astralForm');
    }
  }
  state.events.push({ type: 'divideEnd', ax: d.ax, ay: d.ay, bx: d.bx, by: d.by, seal: !!d.seal });
  state.divide = null;
}

/** 자동 장벽 (수동 모드 숙련): 오브가 차고 한쪽에서 무리가 몰려오면 플레이어와 무리 사이에. */
function autoDivide(state) {
  const p = state.player;
  if (!manualAuto(p, 'x', 'autoDivide') || state.divide || state.ultOrbs < ultCost(p)) return;
  const line = divideLine(state, 14);
  if (line) castDivide(state, line.a, line.b);
}

/**
 * 플레이어와 가까운 적 무리(500 안) 사이를 가르는 장벽 두 점. 무리가 min 보다 작으면 null.
 * 자동 사용(봇·모바일)과 자동 장벽 숙련이 같이 쓴다.
 */
export function divideLine(state, min) {
  const p = state.player;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const e of state.enemies) {
    if (!alive(e) || !near(e, p.x, p.y, 500)) continue;
    sx += e.x;
    sy += e.y;
    n++;
  }
  if (n < min) return null;
  const cx = sx / n;
  const cy = sy / n;
  const dx = cx - p.x;
  const dy = cy - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const mx = p.x + dx * 0.45;
  const my = p.y + dy * 0.45;
  return { a: { x: mx - (dy / d) * 120, y: my + (dx / d) * 120 }, b: { x: mx + (dy / d) * 120, y: my - (dx / d) * 120 } };
}

// ── 패시브 별빛 ──────────────────────────────────────────────────────

const nearStar = (state, e) => (state.stars ?? []).some((st) => near(st, e.x, e.y, STAR.passiveRadius + e.r));

/** 별 근처의 적은 은신이 풀린다 (다시 숨으려면 잠깐 걸린다). */
function applyStarlight(state) {
  updateNebulaZones(state);
  if (!(state.stars ?? []).length) return;
  for (const e of state.enemies) {
    if (alive(e) && ENEMIES[e.type].stealth && nearStar(state, e)) e.revealT = Math.max(e.revealT ?? 0, 0.3);
  }
}

/** 별빛: 별 근처의 적은 받는 피해 +10%. */
export function damageMult(state, e) {
  return e && nearStar(state, e) ? STAR.passiveMult : 1;
}

export const passiveCrit = () => false;
export const onBulletHit = () => {};
export const onKilled = () => {};

/** 설치물 1개 무료 (공학 탄창 스펙터 등): 그 자리에 별 없이 중력의 샘. */
export function freeGadget(state, x, y) {
  makeWell(state, x, y);
}

export function resetRound(state) {
  const p = state.player;
  state.stars = [];
  state.starLocks = [];
  state.wells = [];
  state.novas = [];
  state.divide = null;
  p.astral = 0;
  const s = p.skills.x;
  s.divideMode = 0;
  s.divA = null;
  s.cd = 0;
  for (const k of ['c', 'q', 'e']) {
    const sk = p.skills[k];
    sk.charges = k === 'c' ? gwMax(p) : k === 'q' ? NP.maxCharges : NB.maxCharges;
    sk.cd = 0;
  }
}

/** 별 변환 스킬이 지금 쓸 수 있는가 (충전 + 쓸 수 있는 별). 자동 사용 판단용. */
export const canCast = (state, slot) => state.player.skills[slot].charges > 0 && readyStars(state).length > 0;

/** HUD 용 스킬 상태. C/Q/E 는 쓸 별이 없으면 어둡게, X 는 별 수와 오브. */
export function abilityStatus(state, slot) {
  const p = state.player;
  const s = p.skills[slot];
  if (slot === 'x') {
    const cost = ultCost(p);
    const n = readyStars(state).length;
    return {
      ready: p.astral > 0 || state.planning ? 1 : s.cd > 0 ? 1 - s.cd / ASTRAL.cooldown : 1,
      pips: Array.from({ length: cost }, (_, j) => j < state.ultOrbs),
      label: '',
      tag: `★${n}/${maxStars(p)}`,
    };
  }
  const max = slot === 'c' ? gwMax(p) : slot === 'q' ? NP.maxCharges : NB.maxCharges;
  const cd = cooldownOf(p, s.id, s.level);
  const starOk = readyStars(state).length > 0;
  return {
    ready: s.charges > 0 ? (starOk ? 1 : 0.35) : 1 - s.cd / cd,
    pips: Array.from({ length: max }, (_, j) => j < s.charges),
    label: s.charges === 0 ? String(Math.ceil(s.cd)) : '',
  };
}
