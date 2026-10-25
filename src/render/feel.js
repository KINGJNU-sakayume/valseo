// 게임 필: core 이벤트 → 파티클·데칼·흔들림·히트스톱·반동·배너·효과음. 전부 렌더 전용(결정성 무관).
import { ENEMIES } from '../data/enemies.js';

const ELITE_SUB = {
  lord: '앞쪽 껍질 · 충격파 · 호위 — 뒤로 돌아라',
  stalker: '은신 · 분신 — 표식으로 찾아라',
  brood: '산란 · 보호막 — 둥지를 깨라',
};
import { C, PAL } from './palette.js';
import { emit, burst } from './particles.js';
import { scorch } from './tiles.js';
import { play } from './audio.js';
import { ROUNDS } from '../data/rounds.js';
import { MAPS, ACTS, mapForRound } from '../data/maps.js';

const SHAKE = { playerHit: 5, ult: 9, bossPhase: 12, bossSpawn: 10, evolve: 5, bossEnrage: 10, eliteKill: 7, decay: 9, max: 16 };
const HITSTOP = { playerHit: 0.05, ult: 0.07, bossPhase: 0.12, eliteKill: 0.09, bossKill: 0.3 };
const DEBRIS = {
  chaser: [PAL.r, PAL.R, PAL.q, PAL.M],
  charger: [PAL.o, PAL.O, PAL.M, PAL.k],
  ranged: [PAL.p, PAL.P, PAL.t, PAL.w],
  elite: [PAL.r, PAL.R, PAL.M, PAL.l],
  boss: [PAL.r, PAL.y, PAL.M, PAL.l],
  carapace: [PAL.x, PAL.X, PAL.R, PAL.q],
  refractor: [PAL.t, PAL.T, PAL.w, PAL.k],
  resonator: [PAL.y, PAL.g, PAL.G, PAL.w],
  spawner: [PAL.c, PAL.C, PAL.R, PAL.q],
  overcharger: [PAL.e, PAL.y, PAL.o, PAL.w],
  lord: [PAL.x, PAL.X, PAL.R, PAL.l],
  stalker: [PAL.t, PAL.T, PAL.w, PAL.l],
  stalkerClone: [PAL.t, PAL.T, PAL.w],
  brood: [PAL.c, PAL.C, PAL.R, PAL.l],
  pillar: [PAL.c, PAL.x, PAL.w, PAL.C],
};

export function createFeel() {
  return {
    shake: 0,
    hitstop: 0,
    kick: 0, // 총 반동 (버퍼 px)
    hurt: 0, // 피격 붉은 화면 0~1
    flash: new Map(), // 적 id → 피격 시각
    rings: [],
    beams: [],
    numbers: [],
    coins: [], // 크레딧 팝업
    banners: [],
    slowmo: 0, // 남은 슬로모 (실시간 초)
    xpFlash: 0,
    chain: 0, // 연속 흡수 수 (효과음 음높이)
    lastPickup: -1,
    creditShown: 0, // HUD 크레딧 표시값 (올라가는 연출)
    creditFlash: 0,
    lastShot: -1,
  };
}

export function banner(feel, now, text, sub = '', color = C.red, dur = 1.8) {
  feel.banners.push({ text, sub, color, t0: now, dur });
}

function addShake(feel, v) {
  feel.shake = Math.min(SHAKE.max, feel.shake + v);
}
function addHitstop(feel, v) {
  feel.hitstop = Math.max(feel.hitstop, v);
}

/** step 한 번의 이벤트를 소비. */
export function onEvents(feel, ctx, state, events, now) {
  const { ps, arena, audio, settings, rand } = ctx;
  const fx = settings.effects;
  const p = state.player;
  for (const ev of events) {
    switch (ev.type) {
      case 'shot': {
        feel.kick = ev.source === 'operator' ? 6 : ev.source === 'judge' ? 5 : 3;
        if (ev.source === 'operator') addShake(feel, 3);
        feel.lastShot = now;
        const gun = ev.source;
        play(audio, `shot_${gun === 'headhunter' ? 'headhunter' : gun}`, { pitch: 0.95 + rand() * 0.1 });
        if (!fx) break;
        const a = p.aim;
        const tipX = p.x + Math.cos(a) * 22;
        const tipY = p.y + Math.sin(a) * 22 + 3;
        for (let i = 0; i < 3; i++) emit(ps, { x: tipX, y: tipY, vx: Math.cos(a) * (80 + rand() * 120), vy: Math.sin(a) * (80 + rand() * 120), life: 0.06, color: i ? PAL.y : PAL.w, size: 2, drag: 10 });
        // 탄피: 조준 수직 방향으로 튀고 바닥에 남는다
        const side = Math.cos(a) >= 0 ? -1 : 1;
        emit(ps, {
          x: p.x, y: p.y + 2,
          vx: -Math.sin(a) * 60 * side + (rand() - 0.5) * 30, vy: Math.cos(a) * 60 * side - 30 + (rand() - 0.5) * 20,
          life: 0.35, color: PAL.g, size: 1, drag: 6, decal: '#5a4618', fade: false,
        });
        break;
      }
      case 'hit': {
        feel.flash.set(ev.id, now);
        play(audio, ev.crit ? 'crit' : 'hit');
        if (!fx) break;
        burst(ps, rand, ev.x, ev.y, ev.crit ? 5 : 2, ev.crit ? [PAL.y, PAL.g, PAL.w] : [PAL.w, PAL.l], { speed: 140, life: 0.18, drag: 8 });
        if (ev.crit && settings.damageNumbers && feel.numbers.length < 50) {
          feel.numbers.push({ x: ev.x + (rand() - 0.5) * 10, y: ev.y - 10, text: String(Math.round(ev.damage)), color: ev.crossfire ? C.teal : C.goldLight, t0: now });
        }
        break;
      }
      case 'kill': {
        const big = !!ENEMIES[ev.enemy]?.elite || ev.enemy === 'boss';
        play(audio, big ? 'boom' : 'kill');
        if (ENEMIES[ev.enemy]?.elite) {
          addShake(feel, SHAKE.eliteKill);
          addHitstop(feel, HITSTOP.eliteKill);
        }
        if (ev.enemy === 'boss') addHitstop(feel, HITSTOP.bossKill);
        if (!fx) break;
        const colors = DEBRIS[ev.enemy] ?? DEBRIS.chaser;
        burst(ps, rand, ev.x, ev.y, big ? 40 : 10, colors, { speed: big ? 220 : 130, life: big ? 0.9 : 0.5, size: big ? 2 : 1, drag: 4, decal: '#1b1f25' });
        scorch(arena, ev.x, ev.y, big ? 14 : Math.round((ENEMIES[ev.enemy]?.radius ?? 12) / 2.5));
        if (big) feel.rings.push({ x: ev.x, y: ev.y, r: 120, color: C.red, t0: now, dur: 0.5 });
        break;
      }
      case 'playerHit':
        addShake(feel, SHAKE.playerHit);
        addHitstop(feel, HITSTOP.playerHit);
        feel.hurt = 1;
        play(audio, 'hurt');
        if (fx) burst(ps, rand, p.x, p.y, 8, [PAL.r, PAL.R, PAL.w], { speed: 120, life: 0.3 });
        break;
      case 'enemyShot':
        play(audio, 'enemyShot', { gain: ev.enemy === 'boss' ? 2 : 1, pitch: ev.enemy === 'boss' ? 0.6 : 1 });
        break;
      case 'trapPlaced':
        play(audio, 'trapPlace');
        break;
      case 'trapTriggered':
        play(audio, 'trapTrigger');
        if (fx) {
          feel.rings.push({ x: ev.x, y: ev.y, r: 90, color: C.teal, t0: now, dur: 0.4 });
          burst(ps, rand, ev.x, ev.y, 16, [PAL.t, PAL.T, PAL.w], { speed: 160, life: 0.4 });
        }
        break;
      case 'anchorPlaced':
        play(audio, 'anchor');
        break;
      // ── 킬조이 ──
      case 'alarmbotPlaced':
      case 'turretPlaced':
        play(audio, 'trapPlace');
        if (fx) burst(ps, rand, ev.x, ev.y, 6, [PAL.y, PAL.g], { speed: 60, life: 0.3 });
        break;
      case 'alarmbotBlast':
        play(audio, 'boom', { gain: 0.7, pitch: 1.3 });
        addShake(feel, 2);
        if (fx) {
          feel.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: C.goldLight, t0: now, dur: 0.35 });
          burst(ps, rand, ev.x, ev.y, 16, [PAL.y, PAL.g, PAL.w, PAL.r], { speed: 170, life: 0.4, decal: '#2a2414' });
        }
        break;
      case 'nanoThrow':
        play(audio, 'throw');
        break;
      case 'nanoLand':
        play(audio, 'hiss');
        if (fx) burst(ps, rand, ev.x, ev.y, 14, [PAL.p, PAL.y], { speed: 90, life: 0.5 });
        break;
      case 'turretShot':
        play(audio, 'turret');
        if (fx) emit(ps, { x: ev.x, y: ev.y - 6, vx: 0, vy: -20, life: 0.05, color: PAL.y, size: 2, drag: 1 });
        break;
      case 'lockdownStart':
        play(audio, 'alarm');
        banner(feel, now, '락다운 기동', `${ev.windup.toFixed(1)}초 후 구금`, C.gold, Math.max(1, ev.windup));
        break;
      case 'lockdownFire':
        play(audio, 'lockdown');
        addShake(feel, 10);
        addHitstop(feel, 0.08);
        feel.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: C.shield, t0: now, dur: 0.7 });
        banner(feel, now, '구금', `${ev.count}명 정지`, C.shield, 1.2);
        break;
      case 'teleport':
        play(audio, 'teleport');
        if (fx) {
          for (const pt of [ev.from, ev.to]) {
            for (let i = 0; i < 14; i++) emit(ps, { x: pt.x + (rand() - 0.5) * 24, y: pt.y + (rand() - 0.5) * 10, vx: 0, vy: -60 - rand() * 120, life: 0.4, color: i % 2 ? PAL.y : PAL.p, size: 1, drag: 2 });
          }
        }
        break;
      case 'ult':
        addShake(feel, SHAKE.ult);
        addHitstop(feel, HITSTOP.ult);
        play(audio, 'ult');
        feel.beams.push({ x1: ev.x1, y1: ev.y1, x2: ev.x2, y2: ev.y2, t0: now, dur: 0.4 });
        if (fx) {
          for (let i = 0; i < 40; i++) {
            const t = rand();
            emit(ps, { x: ev.x1 + (ev.x2 - ev.x1) * t, y: ev.y1 + (ev.y2 - ev.y1) * t, vx: (rand() - 0.5) * 80, vy: (rand() - 0.5) * 80, life: 0.5, color: rand() < 0.5 ? PAL.y : PAL.w, size: 2, drag: 3 });
          }
        }
        break;
      case 'ultExplosion':
      case 'shockwave':
        play(audio, 'boom', { gain: 0.6 });
        if (fx) {
          feel.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: ev.type === 'shockwave' ? C.purple : C.goldLight, t0: now, dur: 0.45 });
          burst(ps, rand, ev.x, ev.y, 20, ev.type === 'shockwave' ? [PAL.p, PAL.P, PAL.w] : [PAL.y, PAL.g, PAL.t], { speed: 200, life: 0.5 });
        }
        break;
      case 'ultOrb':
        play(audio, 'orb');
        break;
      case 'levelUp':
        play(audio, 'levelUp');
        if (fx) burst(ps, rand, p.x, p.y, 18, [PAL.t, PAL.w, PAL.y], { speed: 140, life: 0.6, drag: 3 });
        break;
      case 'evolve':
        addShake(feel, SHAKE.evolve);
        play(audio, 'evolve');
        banner(feel, now, '무기 진화', ev.name, C.gold, 2.2);
        feel.rings.push({ x: ev.x, y: ev.y, r: 150, color: C.gold, t0: now, dur: 0.8 });
        break;
      case 'roundStart':
        play(audio, 'round');
        {
          // 막의 첫 라운드는 맵 이름을 함께 띄운다
          const first = ACTS.some((x) => x.rounds[0] === ev.round);
          const m = MAPS[mapForRound(ev.round)];
          const sub = ev.round === 12 ? '보스전' : first ? `${m.name} · ${m.sub}` : '전투 개시';
          banner(feel, now, `라운드 ${ev.round}`, sub, C.red, first ? 2.6 : 1.8);
        }
        break;
      case 'door':
        play(audio, ev.open ? 'anchor' : 'lockdownShort');
        feel.rings.push({ x: ev.x, y: ev.y, r: 70, color: C.gold, t0: now, dur: 0.4 });
        break;
      case 'teleporter':
        play(audio, 'teleport', { pitch: 1.3 });
        feel.rings.push({ x: ev.to.x, y: ev.to.y, r: 60, color: '#a77bff', t0: now, dur: 0.35 });
        break;
      case 'eliteSpawn':
        addShake(feel, SHAKE.bossSpawn * 0.5);
        play(audio, 'boss', { gain: 0.6, pitch: 1.3 });
        banner(feel, now, ENEMIES[ev.enemy]?.name ?? '엘리트', ELITE_SUB[ev.enemy] ?? '엘리트 출현', C.red, 2.4);
        break;
      case 'lordShock':
        addShake(feel, 4);
        play(audio, 'boom', { gain: 0.7, pitch: 0.7 });
        feel.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: C.red, t0: now, dur: 0.4 });
        if (fx) burst(ps, rand, ev.x, ev.y, 24, [PAL.x, PAL.X, PAL.r], { speed: 260, life: 0.5 });
        break;
      case 'shockTele':
        play(audio, 'tick', { pitch: 0.6 });
        break;
      case 'overcharge':
        addShake(feel, 6);
        play(audio, 'boom', { gain: 0.9 });
        feel.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: '#fff3a0', t0: now, dur: 0.35 });
        if (fx) burst(ps, rand, ev.x, ev.y, 26, [PAL.e, PAL.y, PAL.o, PAL.w], { speed: 300, life: 0.45 });
        scorch(arena, ev.x, ev.y, 12);
        break;
      case 'fuse':
        play(audio, 'alarm', { gain: 0.5, pitch: 1.4 });
        break;
      case 'shellBreak':
        play(audio, 'crit', { pitch: 0.5 });
        if (fx) burst(ps, rand, ev.x, ev.y, ev.big ? 22 : 12, [PAL.x, PAL.X, PAL.w], { speed: 180, life: 0.5 });
        if (ev.big) banner(feel, now, '껍질 파괴', '앞쪽 피해 감소 해제', C.gold, 1.2);
        break;
      case 'reveal':
        if (fx) burst(ps, rand, ev.x, ev.y, ev.big ? 16 : 8, [PAL.t, PAL.w], { speed: 120, life: 0.4 });
        if (ev.big) play(audio, 'hiss', { gain: 0.8 });
        break;
      case 'vanish':
        if (fx) burst(ps, rand, ev.x, ev.y, 6, DEBRIS[ev.enemy] ?? [PAL.w], { speed: 90, life: 0.3 });
        break;
      case 'shieldPulse':
        feel.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: C.shield, t0: now, dur: 0.5 });
        break;
      case 'brood':
        if (fx) burst(ps, rand, ev.x, ev.y, 10, [PAL.c, PAL.C], { speed: 120, life: 0.4 });
        break;
      case 'suppressed':
        if (fx) burst(ps, rand, ev.x, ev.y, 6, [PAL.p, PAL.P], { speed: 80, life: 0.35 });
        break;
      case 'pillars':
        banner(feel, now, '결정 기둥', `사이트 ${ev.count}곳 · 기둥이 있는 동안 보스 피해 -50%`, C.purple, 2.4);
        break;
      case 'pillarBreak':
        addShake(feel, 5);
        play(audio, 'evolve', { gain: 0.5 });
        feel.beams.push({ x1: ev.x, y1: ev.y, x2: ev.bx, y2: ev.by, t0: now, dur: 0.35, color: PAL.c });
        banner(feel, now, '기둥 파괴', '보스 5초 취약', C.gold, 1.2);
        break;
      case 'bossSpawn':
        addShake(feel, SHAKE.bossSpawn);
        play(audio, 'boss');
        banner(feel, now, '보스 출현', '12라운드', C.red, 2.4);
        break;
      case 'bossPhase':
        addShake(feel, SHAKE.bossPhase);
        addHitstop(feel, HITSTOP.bossPhase);
        play(audio, 'boss');
        banner(feel, now, `보스 ${ev.phase + 1}단계`, ev.phase === 1 ? '돌진 패턴' : '나선 탄막 · 소환', C.red, 1.6);
        feel.rings.push({ x: ev.x, y: ev.y, r: 220, color: C.red, t0: now, dur: 0.7 });
        break;
      case 'bossEnrage':
        addShake(feel, SHAKE.bossEnrage);
        banner(feel, now, '격노', '보스 사격 속도 2배', C.red, 1.6);
        break;
      case 'buy':
        play(audio, 'coin');
        break;
      case 'credit':
        if (feel.coins.length < 40) feel.coins.push({ x: ev.x + (rand() - 0.5) * 8, y: ev.y, value: ev.value, t0: now });
        feel.creditFlash = 0.25;
        play(audio, 'tick', { pitch: 1 + rand() * 0.1 });
        break;
      case 'pickup': {
        feel.chain = now - feel.lastPickup < 0.45 ? feel.chain + 1 : 0;
        feel.lastPickup = now;
        feel.xpFlash = 0.15;
        play(audio, 'pickup', { pitch: 1 + Math.min(feel.chain, 14) * 0.06 });
        break;
      }
      case 'reload':
        play(audio, 'reload');
        break;
      case 'headshot':
        if (fx && settings.damageNumbers && feel.numbers.length < 50) feel.numbers.push({ x: ev.x, y: ev.y - 18, text: 'HEAD', color: C.red, t0: now });
        break;
      case 'tactic':
        if (fx) feel.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: C.purple, t0: now, dur: 0.35 });
        if (ev.id === 'blastChain') play(audio, 'boom', { gain: 0.4, pitch: 1.4 });
        break;
      case 'cleanup':
        play(audio, 'round', { pitch: 1.2 });
        banner(feel, now, '정리', ev.left ? `남은 적 ${ev.left} · 전멸하면 보너스 +${Math.round(ROUNDS.cleanBonus * 100)}%` : '', C.gold, 1.6);
        break;
      case 'roundWin':
        feel.slowmo = 0.6;
        play(audio, 'victory', { gain: 0.6 });
        banner(feel, now, 'ROUND WIN', `클린 라운드 · 보너스 +${Math.round(ROUNDS.cleanBonus * 100)}%`, C.teal, 1.4);
        break;
      case 'sweep':
        addShake(feel, 6);
        play(audio, 'boom', { pitch: 0.7 });
        banner(feel, now, '시간 종료', ev.left ? `섬멸 파동 · 남은 적 ${ev.left}` : '', C.red, 1.2);
        feel.rings.push({ x: ev.x, y: ev.y, r: ROUNDS.sweepRadius, color: C.red, t0: now, dur: ROUNDS.sweepTime, grow: true, thick: 3 });
        break;
      case 'card':
      case 'mastery':
      case 'branch':
        play(audio, 'click');
        break;
      case 'victory':
        play(audio, 'victory');
        break;
      case 'defeat':
        play(audio, 'defeat');
        break;
    }
  }
}

/** 프레임마다: 감쇠, 수명 정리. 흔들림 오프셋(버퍼 px)을 돌려준다. */
export function updateFeel(feel, dt, now, settings, rand) {
  feel.shake = Math.max(0, feel.shake - feel.shake * SHAKE.decay * dt - dt * 2);
  feel.kick = Math.max(0, feel.kick - dt * 30);
  feel.hurt = Math.max(0, feel.hurt - dt * 2.5);
  feel.rings = feel.rings.filter((r) => now - r.t0 < r.dur);
  feel.beams = feel.beams.filter((b) => now - b.t0 < b.dur);
  feel.numbers = feel.numbers.filter((n) => now - n.t0 < 0.7);
  feel.coins = feel.coins.filter((c) => now - c.t0 < 0.8);
  feel.slowmo = Math.max(0, feel.slowmo - dt);
  feel.xpFlash = Math.max(0, feel.xpFlash - dt);
  feel.creditFlash = Math.max(0, feel.creditFlash - dt);
  feel.banners = feel.banners.filter((b) => now - b.t0 < b.dur);
  if (feel.flash.size > 3000) feel.flash.clear();
  if (!settings.shake || feel.shake <= 0) return { x: 0, y: 0 };
  return { x: Math.round((rand() * 2 - 1) * feel.shake), y: Math.round((rand() * 2 - 1) * feel.shake) };
}

export const isFlashing = (feel, id, now) => {
  const t = feel.flash.get(id);
  return t !== undefined && now - t < 0.07;
};

/** 현재 손에 든 총 스프라이트 이름. */
export function heldGun(state) {
  const p = state.player;
  if (p.precision) return 'gun_headhunter';
  const slot = p.guns[0] ?? p.guns[1];
  return slot ? `gun_${slot.id}` : null;
}

