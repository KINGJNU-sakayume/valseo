// 브림스톤 (설계 v0.2.3 24장): 자극제 신호기(C) · 연막(E) · 소이탄(Q) · 궤도 일격(X), 고유 패시브 거점 사령관.
// 구역(신호기·연막·화염 장판) 안에서 강해지는 요원. 처치로 충전·연장되는 효과는 없다 (모두 시간 쿨다운).
import { DT, WORLD } from '../../../data/balance.js';
import { SKILLS } from '../../../data/skills.js';
import { COMMANDER } from '../../../data/agents.js';
import { SYNTHS } from '../../../data/synth.js';
import { isBig } from '../../../data/enemies.js';
import { nextFloat } from '../../rng.js';
import { maxHp } from '../../stats.js';
import { clampToFloor, pushOut } from '../map.js';
import { damageEnemy } from '../combat.js';
import {
  skillValue, branchOf, masteryOf, masteryAlt, manualAuto, cooldownOf, ultCost, aimPoint, recharge, spendCharge, durationMult,
} from '../skillutil.js';

const BC = SKILLS.beacon;
const SM = SKILLS.skysmoke;
const EM = SKILLS.ember;
const OR = SKILLS.orbital;

export function initSkills(level) {
  return {
    c: { id: 'beacon', level: level('beacon'), branch: null, mastery: null, charges: BC.maxCharges, cd: 0, held: false },
    e: { id: 'skysmoke', level: level('skysmoke'), branch: null, mastery: null, charges: SM.maxCharges, cd: 0, held: false },
    q: { id: 'ember', level: level('ember'), branch: null, mastery: null, charges: EM.maxCharges, cd: 0, held: false },
    x: { id: 'orbital', level: level('orbital'), branch: null, mastery: null, held: false },
  };
}

const growth = (state) => 1 + 0.1 * (state.round - 1);
const inCircle = (z, x, y, pad = 0) => (z.x - x) ** 2 + (z.y - y) ** 2 <= (z.r + pad) ** 2;
const alive = (e) => e.hp > 0 && !e.gone;
const smokeMax = (p) => branchOf(p, 'e')?.maxCharges ?? SM.maxCharges;
const lvl = (p, slot) => Math.max(1, p.skills[slot].level);

export function update(state, input) {
  const keys = input.keys ?? {};
  const p = state.player;
  const edge = (slot) => {
    const s = p.skills[slot];
    const e = !!keys[slot] && !s.held;
    s.held = !!keys[slot];
    return e;
  };
  const inBeacon = (state.beacons ?? []).some((b) => inCircle(b, p.x, p.y));
  // 지휘 (신호기 숙련): 신호기 안에서 연막·소이탄 쿨다운이 빨리 돈다
  const accel = inBeacon && p.skills.c.mastery === 'command' ? BC.masteries.command.accel * DT : 0;
  updateBeaconSkill(state, input, edge('c'));
  updateSmokeSkill(state, input, edge('e'), accel);
  updateEmberSkill(state, input, edge('q'), accel, inBeacon);
  updateOrbitalSkill(state, input, edge('x'));
  updateBeacons(state);
  updateSmokes(state);
  updateFlames(state);
  updateBurn(state);
  updateStrikes(state);
  applyBuffs(state);
}

/** 거점 사령관: 내 구역 (신호기·연막·화염 장판) 안인가. */
export function inMyZone(state, x, y) {
  for (const b of state.beacons ?? []) if (inCircle(b, x, y)) return true;
  for (const s of state.smokes ?? []) if (inCircle(s, x, y)) return true;
  for (const f of state.flames ?? []) if (inCircle(f, x, y)) return true;
  return false;
}

/** 거점 사령관: 받는 피해 배율 (철벽 요새는 연막과 신호기가 겹친 곳). */
export function takenMult(state) {
  const p = state.player;
  if (!inMyZone(state, p.x, p.y)) return 1;
  let m = COMMANDER.takenMult;
  if (p.synths?.fortress && (state.beacons ?? []).some((b) => inCircle(b, p.x, p.y)) && (state.smokes ?? []).some((s) => inCircle(s, p.x, p.y))) {
    m = Math.min(m, SYNTHS.fortress.takenMult);
  }
  return m;
}

/** 거점 사령관: 구역 안에서는 이동 사격도 정지 정확도. */
export const steady = (state) => inMyZone(state, state.player.x, state.player.y);

export const passiveCrit = () => false;
export const onBulletHit = () => {};
export const onKilled = () => {};

// ── C 자극제 신호기 ──────────────────────────────────────────────────────

function updateBeaconSkill(state, input, pressed) {
  const p = state.player;
  const s = p.skills.c;
  if (s.level <= 0) return;
  recharge(s, BC.maxCharges, cooldownOf(p, 'beacon', s.level), DT);
  let at = null;
  if (!pressed && manualAuto(p, 'c', 'autoBeacon') && s.charges > 0) {
    const [r, n] = BC.masteries.autoBeacon.surround;
    if (state.enemies.filter((e) => alive(e) && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= r * r).length >= n) {
      pressed = true;
      at = { x: p.x, y: p.y };
    }
  }
  if (!pressed || s.charges <= 0) return;
  const to = at ?? clampToFloor(state.map, p, aimPoint(p, input, BC.range, WORLD));
  placeBeacon(state, to.x, to.y);
  spendCharge(s, BC.maxCharges, cooldownOf(p, 'beacon', s.level));
}

function placeBeacon(state, x, y) {
  const p = state.player;
  const br = branchOf(p, 'c');
  const lv = lvl(p, 'c');
  const r = skillValue('beacon', 'radius', lv) * (br?.radiusMult ?? 1);
  const life = (skillValue('beacon', 'duration', lv) + (masteryAlt(p, 'c')?.durationBonus ?? 0)) * (br?.durationMult ?? 1) * durationMult(p);
  (state.beacons ??= []).push({ x, y, r, life, maxLife: life, follow: !!br?.follow });
  state.events.push({ type: 'beacon', x, y, r });
  if (p.skills.c.mastery === 'flare') {
    // 신호탄: 설치 순간 반경 안 적을 밀어낸다 (엘리트·보스 제외)
    for (const e of state.enemies) {
      if (!alive(e) || isBig(e) || !inCircle({ x, y, r }, e.x, e.y, e.r)) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * BC.masteries.flare.push;
      e.y += (dy / d) * BC.masteries.flare.push;
      if (state.map) pushOut(state.map, e);
    }
  }
}

function updateBeacons(state) {
  const p = state.player;
  const list = state.beacons ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    if (b.follow) {
      b.x = p.x;
      b.y = p.y;
    }
    b.life -= DT;
    if (b.life <= 0) list.splice(i, 1);
  }
}

/** 신호기 효과 배율: 광역(-20%) · 강화(+50%). */
function beaconPower(p) {
  return (branchOf(p, 'c')?.effectMult ?? 1) * (p.skills.c.mastery === 'amplify' ? BC.masteries.amplify.effectMult : 1);
}

/** 신호기 버프를 weapons.js·player.js 가 읽는 필드로 옮긴다. 응급 신호기는 회복. */
function applyBuffs(state) {
  const p = state.player;
  const lv = lvl(p, 'c');
  const br = branchOf(p, 'c');
  const inB = (state.beacons ?? []).some((b) => inCircle(b, p.x, p.y));
  const m = beaconPower(p);
  p.fireRateBuff = inB && !br?.noFireRate ? skillValue('beacon', 'fireRate', lv) * m : 0;
  p.speedBuff = inB ? skillValue('beacon', 'speed', lv) * m : 0;
  p.reloadMult = inB && br?.reloadMult ? br.reloadMult : 1;
  if (inB && br?.healPct && p.hp > 0 && p.hp < maxHp(p)) {
    const fort = p.synths?.fortress && (state.smokes ?? []).some((s) => inCircle(s, p.x, p.y)) ? SYNTHS.fortress.healMult : 1;
    p.hp = Math.min(maxHp(p), p.hp + maxHp(p) * br.healPct * fort * DT);
  }
}

// ── E 연막 ───────────────────────────────────────────────────────────

function updateSmokeSkill(state, input, pressed, accel) {
  const p = state.player;
  const s = p.skills.e;
  if (s.level <= 0) return;
  recharge(s, smokeMax(p), cooldownOf(p, 'skysmoke', s.level), DT + accel);
  let at = null;
  if (!pressed && manualAuto(p, 'e', 'autoSmoke') && s.charges > 0) {
    const [r, n] = [400, 3];
    const ranged = state.enemies.filter((e) => (e.type === 'ranged' || e.type === 'elite') && alive(e) && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= r * r).length;
    if (ranged >= n || p.hp < maxHp(p) * 0.5) {
      pressed = true;
      at = { x: p.x, y: p.y };
    }
  }
  if (!pressed || s.charges <= 0) return;
  const to = at ?? clampToFloor(state.map, p, aimPoint(p, input, SM.range, WORLD));
  const br = branchOf(p, 'e');
  const lv = lvl(p, 'e');
  const r = skillValue('skysmoke', 'radius', lv);
  const life = skillValue('skysmoke', 'duration', lv) * (br?.durationMult ?? 1) * (masteryAlt(p, 'e')?.durationMult ?? 1) * durationMult(p);
  (state.smokes ??= []).push({
    x: to.x, y: to.y, r, life, maxLife: life, owner: 'brim', tick: 0,
    choke: br?.chokeDps ?? 0, slow: br?.slow ?? 0, cloak: !!br?.cloak, burst: s.mastery === 'burst',
  });
  state.events.push({ type: 'smoke', x: to.x, y: to.y, r });
  spendCharge(s, smokeMax(p), cooldownOf(p, 'skysmoke', s.level));
}

/** 내 연막의 부가 효과: 질식 피해, 감속, 끝날 때 실명, 방호 실드. (수명은 utils.js updateSmokes 가 깎는다) */
function updateSmokes(state) {
  const p = state.player;
  for (const z of state.smokes ?? []) {
    if (z.owner !== 'brim') continue;
    z.tick -= DT;
    const tickNow = z.tick <= 0;
    if (tickNow) z.tick += 0.25;
    const ending = z.life - DT <= 0;
    for (const e of state.enemies) {
      if (!alive(e) || !inCircle(z, e.x, e.y, e.r)) continue;
      if (z.slow) {
        e.chill = Math.max(e.chill ?? 0, z.slow);
        e.chillTime = Math.max(e.chillTime ?? 0, 0.25);
      }
      if (z.choke && tickNow) damageEnemy(state, e, z.choke * 0.25 * growth(state), false, 'skysmoke');
      if (z.burst && ending && e.type !== 'boss') e.blind = Math.max(e.blind ?? 0, SM.masteries.burst.blind);
    }
    if (p.skills.e.mastery === 'ward' && inCircle(z, p.x, p.y) && p.shield < SM.masteries.ward.shieldCap) {
      p.shield = Math.min(SM.masteries.ward.shieldCap, p.shield + SM.masteries.ward.shieldPerSec * DT);
      p.shieldMax = Math.max(p.shieldMax ?? 0, p.shield);
    }
  }
}

// ── Q 소이탄 / 화염 장판 ─────────────────────────────────────────────

function updateEmberSkill(state, input, pressed, accel, inBeacon) {
  const p = state.player;
  const s = p.skills.q;
  if (s.level <= 0) return;
  recharge(s, EM.maxCharges, cooldownOf(p, 'ember', s.level), DT + accel);
  let at = null;
  if (!pressed && manualAuto(p, 'q', 'autoEmber') && s.charges > 0) {
    const pt = densest(state, p, 450, 220, 6);
    if (pt) {
      pressed = true;
      at = pt;
    }
  }
  if (!pressed || s.charges <= 0) return;
  const to = at ?? clampToFloor(state.map, p, aimPoint(p, input, EM.range, WORLD));
  throwEmber(state, to, inBeacon);
  spendCharge(s, EM.maxCharges, cooldownOf(p, 'ember', s.level));
}

function throwEmber(state, to, inBeacon) {
  const p = state.player;
  const s = p.skills.q;
  const br = branchOf(p, 'q');
  const lv = lvl(p, 'q');
  const fuel = s.mastery === 'fuel' && inBeacon ? EM.masteries.fuel.durationMult : 1;
  const life = skillValue('ember', 'duration', lv) * (br?.durationMult ?? 1) * fuel * durationMult(p);
  const dps = skillValue('ember', 'dps', lv) * (br?.dpsMult ?? 1) * (masteryAlt(p, 'q')?.dpsMult ?? 1) * growth(state);
  const r = skillValue('ember', 'radius', lv) * (br?.radiusMult ?? 1);
  const burn = Math.max(br?.burn ?? 0, s.mastery === 'scald' ? EM.masteries.scald.burn : 0);
  const spots = [to];
  if (br?.count) {
    // 확산 소이: 삼각 배치
    spots.length = 0;
    for (let k = 0; k < br.count; k++) {
      const a = (k / br.count) * Math.PI * 2 - Math.PI / 2;
      spots.push(clampToFloor(state.map, to, { x: to.x + Math.cos(a) * r * 0.9, y: to.y + Math.sin(a) * r * 0.9 }));
    }
  }
  for (const pt of spots) addFlame(state, { x: pt.x, y: pt.y, r, life, dps, src: 'ember', vuln: !!br?.vulnerable, burn });
  state.events.push({ type: 'incendiary', x: to.x, y: to.y, r });
  if (br?.blastDamage) blast(state, to, r, br.blastDamage * growth(state), 'ember');
}

function addFlame(state, f) {
  (state.flames ??= []).push({ tick: 0, follow: false, vuln: false, burn: 0, ...f, maxLife: f.life });
}

/** 즉시 폭발: 반경 안 모든 적에게 한 번. */
function blast(state, c, r, damage, source) {
  state.events.push({ type: 'fragBlast', x: c.x, y: c.y, r, big: false });
  for (const e of state.enemies) if (alive(e) && inCircle({ x: c.x, y: c.y, r }, e.x, e.y, e.r)) damageEnemy(state, e, damage, false, source);
}

const smokeOver = (state, f) => (state.smokes ?? []).some((s) => (s.x - f.x) ** 2 + (s.y - f.y) ** 2 <= s.r * s.r);

function updateFlames(state) {
  const p = state.player;
  const list = state.flames ?? [];
  const kindling = p.skills.q.mastery === 'kindling';
  const synergy = p.skills.e.mastery === 'synergy';
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    if (f.follow) {
      f.x = p.x;
      f.y = p.y;
    }
    f.life -= DT;
    f.tick -= DT;
    if (f.tick <= 0) {
      f.tick += 0.25;
      const syn = synergy && smokeOver(state, f) ? SM.masteries.synergy.mult : 1;
      for (const e of state.enemies) {
        if (!alive(e) || !inCircle(f, e.x, e.y, e.r)) continue;
        if (f.vuln) e.vulnerable = Math.max(e.vulnerable, 0.5);
        let d = f.dps * 0.25 * syn;
        if (kindling && e.vulnerable > 0) d *= EM.masteries.kindling.mult;
        if (f.burn) {
          e.burnT = Math.max(e.burnT ?? 0, f.burn);
          e.burnDps = Math.max(e.burnDps ?? 0, f.dps * 0.4);
        }
        damageEnemy(state, e, d, false, f.src);
      }
    }
    if (f.life <= 0) list.splice(i, 1);
  }
}

/** 잔불·화상: 장판을 벗어난 적이 잠깐 더 탄다. */
function updateBurn(state) {
  for (const e of state.enemies) {
    if (!(e.burnT > 0)) continue;
    e.burnT -= DT;
    e.burnTick = (e.burnTick ?? 0) - DT;
    if (e.burnTick <= 0) {
      e.burnTick += 0.5;
      if (alive(e)) damageEnemy(state, e, e.burnDps * 0.5, false, 'burn');
    }
  }
}

// ── X 궤도 일격 ──────────────────────────────────────────────────────

function updateOrbitalSkill(state, input, pressed) {
  const p = state.player;
  const s = p.skills.x;
  if (s.level <= 0) return;
  const cost = ultCost(p);
  let at = null;
  if (!pressed && manualAuto(p, 'x', 'autoStrike') && state.ultOrbs >= cost) {
    const big = state.enemies.find((e) => alive(e) && isBig(e) && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= 500 * 500);
    const crowd = densest(state, p, 450, 300, 12);
    if (big || crowd) {
      pressed = true;
      at = big ? { x: big.x, y: big.y } : crowd;
    }
  }
  if (!pressed || state.ultOrbs < cost) return;
  state.ultOrbs -= cost;
  const br = branchOf(p, 'x');
  const lv = lvl(p, 'x');
  const to = at ?? clampToFloor(state.map, p, aimPoint(p, input, OR.range, WORLD));
  const windup = br?.windup ?? OR.windup;
  const r = skillValue('orbital', 'radius', lv) * (br?.radiusMult ?? 1);
  const spots = [br?.follow ? { x: p.x, y: p.y } : to];
  for (let k = 1; k < (br?.count ?? 1); k++) {
    const a = nextFloat(state.rng) * Math.PI * 2;
    const d = 60 + nextFloat(state.rng) * 120;
    spots.push(clampToFloor(state.map, to, { x: to.x + Math.cos(a) * d, y: to.y + Math.sin(a) * d }));
  }
  const strikes = (state.strikes ??= []);
  spots.forEach((pt, k) => {
    const t = windup + k * (br?.gap ?? 0);
    const base = { x: pt.x, y: pt.y, r, follow: !!br?.follow, retarget: s.mastery === 'tracking' && k === 0, retargeted: false };
    strikes.push({ ...base, t, total: t });
    // 이중 호출: 같은 지점에 한 번 더
    if (s.mastery === 'twin') strikes.push({ ...base, retarget: false, t: t + OR.masteries.twin.again, total: t + OR.masteries.twin.again });
    state.events.push({ type: 'strikeWarn', x: pt.x, y: pt.y, r, t });
  });
}

function updateStrikes(state) {
  const p = state.player;
  const list = state.strikes ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const st = list[i];
    st.t -= DT;
    if (st.follow) {
      st.x = p.x;
      st.y = p.y;
    }
    if (st.retarget && !st.retargeted && st.t <= st.total * 0.5) {
      // 추적 보정: 가장 밀집한 곳으로 1회
      st.retargeted = true;
      const pt = densest(state, st, OR.masteries.tracking.range, 250, 3);
      if (pt) {
        const to = clampToFloor(state.map, st, pt);
        st.x = to.x;
        st.y = to.y;
      }
    }
    if (st.t > 0) continue;
    list.splice(i, 1);
    landStrike(state, st);
  }
}

function landStrike(state, st) {
  const p = state.player;
  const br = branchOf(p, 'x');
  const lv = lvl(p, 'x');
  const dps = skillValue('orbital', 'dps', lv) * (br?.dpsMult ?? 1) * growth(state);
  const life = skillValue('orbital', 'duration', lv) * (br?.durationMult ?? 1) * durationMult(p);
  // 불바다 (합성): 맞은 자리의 내 화염 장판 남은 피해를 한 번에 터뜨린다
  if (p.synths?.inferno) {
    let n = 0;
    for (let i = (state.flames ?? []).length - 1; i >= 0 && n < SYNTHS.inferno.max; i--) {
      const f = state.flames[i];
      if (f.src !== 'ember' || !inCircle(st, f.x, f.y, f.r * 0.5)) continue;
      n++;
      const total = f.dps * Math.max(0, f.life);
      for (const e of state.enemies) if (alive(e) && inCircle(f, e.x, e.y, e.r)) damageEnemy(state, e, total, false, 'orbital');
      state.flames.splice(i, 1);
    }
  }
  blast(state, st, st.r, dps * OR.impact, 'orbital');
  addFlame(state, { x: st.x, y: st.y, r: st.r, life, dps, src: 'orbital', follow: st.follow });
  state.events.push({ type: 'orbital', x: st.x, y: st.y, r: st.r });
  if (p.skills.x.mastery === 'aftermath') {
    // 여파: 소이 장판을 남긴다 (소이탄을 배우지 않았어도 1레벨 수치)
    const ql = lvl(p, 'q');
    addFlame(state, {
      x: st.x, y: st.y, r: skillValue('ember', 'radius', ql), life: skillValue('ember', 'duration', ql),
      dps: skillValue('ember', 'dps', ql) * OR.masteries.aftermath.mult * growth(state), src: 'ember',
    });
  }
}

/** 사거리 안에서 반경 r 안의 적이 n 이상으로 가장 밀집한 지점 (가까운 적 위치를 후보로). */
function densest(state, from, range, r, n) {
  const cands = state.enemies.filter((e) => alive(e) && (e.x - from.x) ** 2 + (e.y - from.y) ** 2 <= range * range).slice(0, 40);
  let best = null;
  let bn = n - 1;
  for (const c of cands) {
    const k = state.enemies.filter((o) => alive(o) && (o.x - c.x) ** 2 + (o.y - c.y) ** 2 <= r * r).length;
    if (k > bn) {
      bn = k;
      best = { x: c.x, y: c.y };
    }
  }
  return best;
}

/** 무료 "설치물" (공학 탄창·덫 각인 진화): 브림스톤은 작은 화염 장판. */
export function freeGadget(state, x, y) {
  addFlame(state, { x, y, r: 80, life: 2.5, dps: 25 * growth(state), src: 'ember' });
}

export function resetRound(state) {
  const p = state.player;
  for (const [slot, max] of [['c', BC.maxCharges], ['e', smokeMax(p)], ['q', EM.maxCharges]]) {
    p.skills[slot].charges = max;
    p.skills[slot].cd = 0;
  }
  state.beacons = [];
  state.flames = [];
  state.strikes = [];
  p.fireRateBuff = 0;
  p.speedBuff = 0;
  p.reloadMult = 1;
}

/** HUD: 신호기·연막·소이탄은 충전, 궤도 일격은 오브. */
export function abilityStatus(state, slot) {
  const p = state.player;
  const s = p.skills[slot];
  if (slot === 'x') {
    const cost = ultCost(p);
    return { ready: Math.min(1, state.ultOrbs / cost), pips: Array.from({ length: cost }, (_, j) => j < state.ultOrbs), label: '' };
  }
  const max = slot === 'e' ? smokeMax(p) : slot === 'c' ? BC.maxCharges : EM.maxCharges;
  return {
    ready: s.charges > 0 ? 1 : 1 - s.cd / cooldownOf(p, s.id, Math.max(1, s.level)),
    pips: Array.from({ length: max }, (_, j) => j < s.charges),
    label: s.charges === 0 ? String(Math.ceil(s.cd)) : '',
  };
}

export { masteryOf };
