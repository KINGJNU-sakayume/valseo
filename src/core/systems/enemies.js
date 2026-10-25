import { DT, WORLD, SPAWN } from '../../data/balance.js';
import { ENEMIES, ENEMY_BULLET } from '../../data/enemies.js';
import { SPAWN_BUDGET, ENEMY_SCALING, SPAWN_MIX, ROUNDS, ELITE_BY_ROUND, MUTATIONS } from '../../data/rounds.js';
import { defendGoal } from './objectives.js';
import { nextFloat, range } from '../rng.js';
import { fieldSlow } from './fields.js';
import { damagePlayer } from './player.js';
import { removeAt } from './weapons.js';
import { MAP } from '../../data/maps.js';
import { blocked, pushOut, navTarget, gatePoint, clampToFloor } from './map.js';
import {
  initMutant, tickMutant, wander, updateStealth, updateSupport, updateFuse, updateAbilities,
  spawnPillars, pillarCount, purgeGone,
} from './mutants.js';

/** S(R) = S0 + g·(R − 1) */
export const spawnBudget = (R) => SPAWN_BUDGET.S0 + SPAWN_BUDGET.g * (R - 1);

/** h(R) = 1 + k·(R − 1) */
export const hpScale = (R) => 1 + ENEMY_SCALING.k * (R - 1);

export function spawnWeights(R) {
  let w = SPAWN_MIX[0].weights;
  for (const m of SPAWN_MIX) if (R >= m.fromRound) w = m.weights;
  return w;
}

function pickType(state) {
  const entries = Object.entries(spawnWeights(state.round));
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = nextFloat(state.rng) * total;
  for (const [type, w] of entries) {
    if (roll < w) return type;
    roll -= w;
  }
  return entries[entries.length - 1][0];
}

/**
 * 스폰 예산: 초당 S(R)씩 쌓고, 다음에 나올 적(state.nextSpawn)의 cost 가 모이면 스폰.
 * 다음 적을 미리 정해 두어야 비싼 적이 싼 적에게 계속 밀리지 않는다.
 */
export function updateSpawns(state) {
  if (state.round === ROUNDS.bossRound && !state.bossSpawned && state.roundTime >= ROUNDS.bossSpawnTime) {
    state.bossSpawned = true;
    const site = state.map?.sites?.B;
    const boss = spawn(state, 'boss', site ? { x: site.x, y: site.y } : null);
    if (boss) state.events.push({ type: 'bossSpawn', x: boss.x, y: boss.y });
  }
  if (ROUNDS.eliteRounds.includes(state.round) && !state.eliteSpawned && state.roundTime >= ROUNDS.eliteSpawnTime) {
    state.eliteSpawned = true;
    const el = spawn(state, ELITE_BY_ROUND[state.round] ?? 'elite');
    if (el) state.events.push({ type: 'eliteSpawn', enemy: el.type, x: el.x, y: el.y });
  }
  if (state.cleanup || state.roundWon) return; // 정리 페이즈: 일반 스폰 정지
  state.spawnAcc += spawnBudget(state.round) * DT;
  if (!state.nextSpawn) state.nextSpawn = pickType(state);
  while (state.spawnAcc >= ENEMIES[state.nextSpawn].cost && state.enemies.length < SPAWN.maxEnemies) {
    state.spawnAcc -= ENEMIES[state.nextSpawn].cost;
    spawn(state, state.nextSpawn);
    state.nextSpawn = pickType(state);
  }
}

export function spawn(state, type, at = null) {
  const def = ENEMIES[type];
  const p = state.player;
  for (let t = 0; t < SPAWN.maxTries; t++) {
    let x;
    let y;
    if (at) {
      ({ x, y } = at);
    } else {
      // 게이트 70% + 시야 밖 무작위 30% (맵이 있을 때). 게이트가 모두 가까우면 무작위
      const roll = nextFloat(state.rng);
      const gate = state.map && roll < MAP.gateSpawn
        ? gatePoint(state, nextFloat(state.rng), nextFloat(state.rng) * 2 - 1, nextFloat(state.rng) * 2 - 1)
        : null;
      if (gate) {
        ({ x, y } = gate);
      } else {
        const ang = nextFloat(state.rng) * Math.PI * 2;
        const dist = range(state.rng, SPAWN.safeRadius, SPAWN.safeRadius + SPAWN.ringWidth);
        x = p.x + Math.cos(ang) * dist;
        y = p.y + Math.sin(ang) * dist;
        if (x < def.radius || y < def.radius || x > WORLD.width - def.radius || y > WORLD.height - def.radius) continue;
        if (blocked(state.map, x, y)) continue;
      }
    }
    const hp = def.ai === 'boss' || def.fixedHp ? def.hp : def.hp * hpScale(state.round);
    const e = {
      id: state.nextId++,
      type,
      x,
      y,
      r: def.radius,
      hp,
      maxHp: hp,
      speed: def.speed,
      damage: def.contactDamage,
      mode: 'move', // charge: move → telegraph → dash → recover
      t: 0,
      dirX: 0,
      dirY: 0,
      fireCd: def.fireInterval ?? 0,
      // 상태이상 (남은 시간)
      vulnerable: 0,
      detained: 0,
      chill: 0,
      chillTime: 0,
      // 보스 전용
      phase: 0,
      age: 0,
      dashCd: 0,
      summonCd: 0,
      spin: 0,
      // 변이체
      shield: 0,
      suppressed: 0,
      blind: 0,
      hidden: !!def.stealth,
    };
    if (state.mutation === 'overcharge') e.speed *= MUTATIONS.overcharge.speedMult;
    state.enemies.push(e);
    initMutant(state, e);
    return e;
  }
  return null;
}

/** 상태이상 시간 감소: 취약(받는 피해 증가), 구금(행동 정지), 냉각(감속). */
function tickStatus(state, e) {
  if (e.vulnerable > 0) e.vulnerable = Math.max(0, e.vulnerable - DT);
  if (e.detained > 0) e.detained = Math.max(0, e.detained - DT);
  if (e.chillTime > 0) e.chillTime = Math.max(0, e.chillTime - DT);
  if (e.mark > 0) e.mark = Math.max(0, e.mark - DT);
  if (e.tpCd > 0) e.tpCd = Math.max(0, e.tpCd - DT);
  if (e.suppressed > 0) e.suppressed = Math.max(0, e.suppressed - DT);
  tickMutant(state, e);
}

/** 감속률: 감속 필드 + 냉각. 냉각이 없으면 필드 값 그대로 (부동소수 결과를 바꾸지 않게). */
function slowAt(state, e) {
  const fs = fieldSlow(state, e.x, e.y);
  if (!(e.chillTime > 0)) return fs;
  return 1 - (1 - fs) * (1 - e.chill);
}

export function updateEnemies(state) {
  // 잔상(랑데뷰 형태): 분신이 있는 동안 일반 적은 분신을 노린다 (보스 제외)
  const aimAt = state.decoy ?? state.player;
  const m = state.map;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.gone) continue;
    tickStatus(state, e);
    if (e.detained > 0) continue; // 구금: 이동·사격·돌진 정지
    const def = ENEMIES[e.type];
    const slow = 1 - slowAt(state, e);
    if (e.blind > 0 && def.ai !== 'boss') {
      // 실명: 사격·능력 없이 무작위로 걷는다
      wander(state, e, e.speed * slow * 0.6);
      if (m) pushOut(m, e);
      clampToWorld(e);
      continue;
    }
    // 이동 목표: 맵이 있으면 경로(flow field)의 다음 지점, 분신은 직선
    const goal = state.decoy ? null : defendGoal(state, e); // 방어 라운드: 사이트로
    const walk = state.decoy || !m ? aimAt : navTarget(state, e, goal ?? state.player);
    if (def.ai === 'boss') updateBoss(state, e, def);
    else if (def.ai === 'charge') updateCharger(state, e, def, slow, aimAt, walk);
    else if (def.ai === 'ranged') updateRanged(state, e, def, slow, aimAt, walk);
    else if (def.ai === 'stealth') updateStealth(state, e, def, slow, aimAt, walk);
    else if (def.ai === 'support') updateSupport(state, e, def, slow, aimAt, walk);
    else if (def.ai === 'fuse') updateFuse(state, e, def, slow, aimAt, walk);
    else if (def.ai !== 'pillar') moveToward(e, walk, e.speed * slow);
    if (def.ai !== 'boss') updateAbilities(state, e, def, aimAt);
    if (m && pushOut(m, e) && (e.mode === 'dash' || e.mode === 'ambush')) {
      e.mode = e.mode === 'ambush' ? 'move' : 'recover'; // 벽에 부딪히면 돌진 끝
      e.t = def.recover ?? 0;
    }
    clampToWorld(e);
  }
  purgeGone(state);
  updateEnemyBullets(state);
}

function moveToward(e, target, speed, sign = 1) {
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return;
  e.x += (dx / d) * speed * DT * sign;
  e.y += (dy / d) * speed * DT * sign;
}

function clampToWorld(e) {
  e.x = Math.min(WORLD.width - e.r, Math.max(e.r, e.x));
  e.y = Math.min(WORLD.height - e.r, Math.max(e.r, e.y));
}

function updateCharger(state, e, def, slow, p = state.player, walk = p) {
  e.t -= DT;
  if (e.mode === 'move' || e.mode === 'recover') {
    moveToward(e, walk, e.speed * slow);
    if (e.mode === 'recover' && e.t <= 0) e.mode = 'move';
    if (e.mode === 'move' && !(e.suppressed > 0) && Math.hypot(p.x - e.x, p.y - e.y) <= def.dashTriggerRange) {
      // 예고선: 이 순간의 방향으로 고정
      const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
      e.dirX = (p.x - e.x) / d;
      e.dirY = (p.y - e.y) / d;
      e.mode = 'telegraph';
      e.t = def.telegraph;
    }
  } else if (e.mode === 'telegraph') {
    if (e.suppressed > 0) e.mode = 'move'; // 제압: 돌진 취소
    else if (e.t <= 0) {
      e.mode = 'dash';
      e.t = def.dashDuration;
    }
  } else if (e.mode === 'dash') {
    e.x += e.dirX * def.dashSpeed * slow * DT;
    e.y += e.dirY * def.dashSpeed * slow * DT;
    clampToWorld(e);
    if (e.t <= 0) {
      e.mode = 'recover';
      e.t = def.recover;
    }
  }
}

function updateRanged(state, e, def, slow, p = state.player, walk = p) {
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  if (d > def.keepDistance + def.distanceBand) moveToward(e, walk, e.speed * slow);
  else if (d < def.keepDistance - def.distanceBand) moveToward(e, p, e.speed * slow, -1);
  clampToWorld(e);

  if (e.suppressed > 0) return; // 제압: 사격 불가
  e.fireCd -= DT;
  if (e.fireCd > 0) return;
  e.fireCd += def.fireInterval;
  const s = def.shot;
  const base = Math.atan2(p.y - e.y, p.x - e.x);
  for (let i = 0; i < s.count; i++) {
    shoot(state, e, base + (s.count > 1 ? (i - (s.count - 1) / 2) * s.spread : 0), s);
  }
  state.events.push({ type: 'enemyShot', enemy: e.type });
}

function shoot(state, e, angle, shot) {
  if (state.enemyBullets.length >= ENEMY_BULLET.maxBullets) return;
  state.enemyBullets.push({
    x: e.x, y: e.y,
    vx: Math.cos(angle) * shot.speed, vy: Math.sin(angle) * shot.speed,
    r: shot.radius, damage: shot.damage, life: ENEMY_BULLET.lifetime, source: e.type,
  });
}

/** 현재 체력 비율에 맞는 보스 단계 index. */
export function bossPhase(def, e) {
  const ratio = e.hp / e.maxHp;
  const i = def.phases.findIndex((ph) => ratio > ph.until);
  return i < 0 ? def.phases.length - 1 : i;
}

function updateBoss(state, e, def) {
  const p = state.player;
  const slow = 1 - slowAt(state, e) * (1 - def.slowResist);
  e.age += DT;
  const fireMult = e.age >= def.enrageTime ? def.enrageFireMult : 1;
  if (e.age >= def.enrageTime && e.age - DT < def.enrageTime) state.events.push({ type: 'bossEnrage', x: e.x, y: e.y });

  const idx = bossPhase(def, e);
  if (idx !== e.phase) {
    e.phase = idx;
    e.mode = 'move';
    e.fireCd = 0.5;
    e.dashCd = 0;
    e.summonCd = 0;
    state.events.push({ type: 'bossPhase', phase: idx, x: e.x, y: e.y });
    if (idx === 1) spawnPillars(state, e);
    if (idx === 2) e.invuln = def.phaseInvuln;
  }
  const ph = def.phases[idx];
  e.pillars = pillarCount(state, e);
  // 껍질 방향 (1단계)
  updateAbilities(state, e, def, p);
  // 제압: 패턴 타이머가 절반 속도
  const tdt = e.suppressed > 0 ? DT * def.suppressSlow : DT;

  // 이동 / 돌진 (2단계)
  e.t -= DT;
  if (e.mode === 'telegraph') {
    if (e.t <= 0) {
      e.mode = 'dash';
      e.t = ph.dash.duration;
    }
  } else if (e.mode === 'dash') {
    e.x += e.dirX * ph.dash.speed * slow * DT;
    e.y += e.dirY * ph.dash.speed * slow * DT;
    clampToWorld(e);
    if (e.t <= 0) {
      e.mode = 'move';
      e.dashCd = ph.dash.interval;
    }
  } else {
    moveToward(e, state.map ? navTarget(state, e) : p, ph.speed * slow);
    if (ph.dash) {
      e.dashCd -= tdt;
      if (e.dashCd <= 0) {
        const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
        e.dirX = (p.x - e.x) / d;
        e.dirY = (p.y - e.y) / d;
        e.mode = 'telegraph';
        e.t = ph.dash.telegraph;
      }
    }
  }

  // 사격: 1·2단계 원형 탄막, 3단계 회전 나선
  e.fireCd -= tdt;
  if (e.fireCd <= 0) {
    if (ph.radial) {
      const r = ph.radial;
      e.fireCd += r.interval * fireMult;
      for (let i = 0; i < r.count; i++) shoot(state, e, e.spin + (i / r.count) * Math.PI * 2, r);
      e.spin += Math.PI / r.count; // 다음 탄막은 틈 사이로
      state.events.push({ type: 'enemyShot', enemy: e.type });
    } else if (ph.spiral) {
      const s = ph.spiral;
      e.fireCd += s.interval * fireMult;
      for (let a = 0; a < s.arms; a++) shoot(state, e, e.spin + (a / s.arms) * Math.PI * 2, s);
      e.spin += s.turn;
    }
  }

  // 소환 (3단계)
  if (ph.summon) {
    e.summonCd -= tdt;
    if (e.summonCd <= 0) {
      const sm = ph.summon;
      e.summonCd = sm.interval;
      const alive = state.enemies.filter((o) => o.type === sm.type && o.leader === e.id && !o.gone).length;
      for (let i = 0; i < Math.min(sm.count, (sm.max ?? Infinity) - alive) && state.enemies.length < SPAWN.maxEnemies; i++) {
        const a = (i / sm.count) * Math.PI * 2;
        const at = clampToFloor(state.map, e, { x: e.x + Math.cos(a) * sm.radius, y: e.y + Math.sin(a) * sm.radius });
        const c = spawn(state, sm.type, at);
        if (c) c.leader = e.id;
      }
      state.events.push({ type: 'bossSummon', x: e.x, y: e.y });
    }
  }
}

function updateEnemyBullets(state) {
  const p = state.player;
  const list = state.enemyBullets;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.life -= DT;
    const rr = b.r + p.r;
    if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 <= rr * rr) {
      damagePlayer(state, b.damage, b.source);
      removeAt(list, i);
    } else if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height || blocked(state.map, b.x, b.y)) {
      removeAt(list, i); // 벽은 적 탄을 막는다 (엄폐)
    }
  }
}
