import { relicOf } from './relics.js';
import { DT, WORLD, PLAYER } from '../../data/balance.js';
import { playerStat, passiveMult, invulnTime } from '../stats.js';
import { skillOf, manualAuto, precisionSpeedMult } from './skillutil.js';
import { moveMult } from './tactics.js';
import { SKILLS } from '../../data/skills.js';

export function updatePlayer(state, input) {
  const p = state.player;
  p.autoMode = !!input.autoSkills; // 스킬 자동 사용 (자동화 숙련 효과가 바뀐다)
  p.autoAim = !!input.autoAim; // 자동 조준 (헤드샷 판정이 확률로)
  const q = skillOf(p, 'q');
  // 정지 사수(수동): 멈춰 있으면 Q 없이도 정조준
  const stillAim = manualAuto(p, 'q', 'stillAim') && p.stillT >= SKILLS.headhunter.masteries.stillAim.still;
  p.precision = !!q.holdPrecision && p.skills.q.level > 0 && (!!input.keys?.q || stillAim);
  const mx = input.move?.x ?? 0;
  const my = input.move?.y ?? 0;
  const len = Math.hypot(mx, my);
  p.stillT = len > 0 ? 0 : (p.stillT ?? 0) + DT; // 정지 사격·정지 사수
  if (len > 0) {
    const speed = playerStat(p, 'moveSpeed') * (p.precision ? precisionSpeedMult(p) : 1) * moveMult(state) * (p.speedBuff ? 1 + p.speedBuff : 1);
    p.x += (mx / len) * speed * DT;
    p.y += (my / len) * speed * DT;
  }
  p.x = Math.min(WORLD.width - p.r, Math.max(p.r, p.x));
  p.y = Math.min(WORLD.height - p.r, Math.max(p.r, p.y));

  if (input.aim) {
    p.aimX = input.aim.x;
    p.aimY = input.aim.y;
    const dx = input.aim.x - p.x;
    const dy = input.aim.y - p.y;
    if (dx !== 0 || dy !== 0) p.aim = Math.atan2(dy, dx);
  }

  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - DT);
  if (p.reflexCd > 0) p.reflexCd = Math.max(0, p.reflexCd - DT);
  if (p.pierceBuff > 0) p.pierceBuff = Math.max(0, p.pierceBuff - DT);
}

/** 실드가 먼저 피해를 흡수하고, 남은 피해가 HP로 간다. */
export function damagePlayer(state, amount, source) {
  const p = state.player;
  if (p.invuln > 0 || state.phase !== 'COMBAT') return;
  // 반사 신경 (헤드헌터 숙련): 정조준 중 첫 피격 무효
  if (p.precision && p.skills.q.mastery === 'reflex' && !(p.reflexCd > 0)) {
    p.reflexCd = SKILLS.headhunter.masteries.reflex.cooldown;
    p.invuln = PLAYER.invulnTime;
    state.events.push({ type: 'reflex', x: p.x, y: p.y });
    return;
  }
  // 무거운 손 (유물): 멈춰 있으면 받는 피해 감소
  const heavy = relicOf(p, 'heavyHand');
  if (heavy && (p.stillT ?? 0) >= heavy.stillTime) amount *= heavy.stillDamageMult;
  // 방어구 효율: 실드 1이 피해 armor배를 막는다
  const armor = passiveMult(p, 'armor');
  const absorbed = Math.min(p.shield * armor, amount);
  p.shield -= armor === 1 ? absorbed : absorbed / armor;
  p.hp = Math.max(0, p.hp - (amount - absorbed));
  p.invuln = invulnTime(p);
  state.events.push({ type: 'playerHit', amount, absorbed, source });
  if (p.hp <= 0) {
    state.phase = 'DEFEAT';
    state.events.push({ type: 'defeat', round: state.round, time: state.time, kills: state.stats.kills });
  }
}
