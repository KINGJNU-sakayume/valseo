import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, choose } from '../src/core/game.js';
import { PASSIVES } from '../src/data/passives.js';
import { CRIT, PLAYER, DT } from '../src/data/balance.js';
import { ULT, SKILLS } from '../src/data/skills.js';
import { gainXp } from '../src/core/systems/progression.js';
import { gainCredits } from '../src/core/systems/economy.js';
import { damageEnemy } from '../src/core/systems/combat.js';
import { damagePlayer } from '../src/core/systems/player.js';
import { cooldownOf } from '../src/core/systems/skillutil.js';
import { spawn } from '../src/core/systems/enemies.js';
import { startRound } from '../src/core/systems/rounds.js';
import { maxHp } from '../src/core/stats.js';

function quiet(agent = 'chamber') {
  const s = createGame(1, agent);
  s.spawnAcc = -1e9;
  s.player.guns = [null, null];
  return s;
}
const per = (k) => PASSIVES[k].perStack;

test('패시브 12종, 레벨업 카드로 획득하면 설명에 변화량이 표시된다', () => {
  assert.equal(Object.keys(PASSIVES).length, 12);
  const s = quiet();
  for (const key of Object.keys(PASSIVES)) {
    s.pending = { kind: 'levelup', options: [{ type: 'passive', key }] };
    s.levelUpsQueued = 1;
    choose(s, 0);
    assert.equal(s.player.passives[key], 1, key);
  }
  s.levelUpsQueued = 1;
  step(s, {});
  for (const o of s.pending.options) if (o.type === 'passive') assert.ok(o.desc.includes('→'), o.desc);
});

test('XP·크레딧 획득 증가', () => {
  const s = quiet();
  s.player.passives.xpGain = 2;
  gainXp(s, 1);
  assert.ok(Math.abs(s.player.xp - (1 + 2 * per('xpGain'))) < 1e-9);
  s.player.passives.creditGain = 3;
  const c = s.credits;
  gainCredits(s, 100);
  assert.equal(s.credits - c, Math.round(100 * (1 + 3 * per('creditGain'))));
});

test('크리티컬 피해 증가', () => {
  const s = quiet();
  s.player.passives.critDamage = 2;
  const e = spawn(s, 'chaser', { x: 100, y: 100 });
  e.hp = e.maxHp = 1e6;
  damageEnemy(s, e, 10, true, 'classic');
  assert.ok(Math.abs(e.maxHp - e.hp - 10 * (CRIT.multiplier + 2 * per('critDamage'))) < 1e-6);
});

test('스킬 쿨다운 감소는 두 에이전트 모두에 적용', () => {
  for (const [agent, id] of [['chamber', 'trademark'], ['killjoy', 'alarmbot']]) {
    const s = quiet(agent);
    s.player.passives.cooldown = 3;
    const base = SKILLS[id].cooldown[0];
    assert.ok(Math.abs(cooldownOf(s.player, id, 1) - base * (1 - 3 * per('cooldown'))) < 1e-9);
    step(s, { keys: { c: true }, aim: { x: s.player.x + 100, y: s.player.y } });
    assert.ok(Math.abs(s.player.skills.c.cd - base * (1 - 3 * per('cooldown'))) < DT * 2, agent);
  }
});

test('방어구 효율: 같은 실드로 더 많이 막는다, 피격 후 무적 증가', () => {
  const s = quiet();
  s.player.passives.armor = 2;
  s.player.passives.invuln = 2;
  s.player.shield = s.player.shieldMax = 20;
  damagePlayer(s, 20, 'test');
  const mult = 1 + 2 * per('armor');
  assert.ok(Math.abs(s.player.shield - (20 - 20 / mult)) < 1e-9);
  assert.equal(s.player.hp, maxHp(s.player));
  assert.ok(Math.abs(s.player.invuln - (PLAYER.invulnTime + 2 * per('invuln'))) < 1e-9);
});

test('처치 회복: 처치당 회복, 라운드당 상한, 다음 라운드에 초기화', () => {
  const s = quiet();
  s.player.passives.killHeal = 5;
  s.player.hp = 10;
  for (let i = 0; i < 20; i++) {
    const e = spawn(s, 'chaser', { x: 100 + i, y: 100 });
    e.hp = -1;
  }
  step(s, {});
  assert.equal(s.player.hp, 10 + PASSIVES.killHeal.roundCap, '상한');
  startRound(s, 2);
  assert.equal(s.roundHealed, 0);
});

test('설치·장판 지속 증가 (트레이드마크 필드, 나노스웜)', () => {
  const s = quiet();
  s.player.passives.duration = 2;
  const p = s.player;
  const e = spawn(s, 'chaser', { x: p.x + 200, y: p.y });
  e.speed = 0;
  step(s, { keys: { c: true }, aim: { x: p.x + 200, y: p.y } });
  for (let i = 0; i < 60 && !s.fields.length; i++) step(s, {});
  assert.ok(Math.abs(s.fields[0].maxLife - SKILLS.trademark.fieldDuration[0] * (1 + 2 * per('duration'))) < 1e-9);
  const k = quiet('killjoy');
  k.player.passives.duration = 2;
  k.player.skills.q.level = 1;
  step(k, { keys: { q: true }, aim: { x: k.player.x + 100, y: k.player.y } });
  assert.ok(Math.abs(k.zones[0].maxLife - SKILLS.nanoswarm.duration * (1 + 2 * per('duration'))) < 1e-9);
});

test('궁극기 오브 드롭: 더 적은 처치로 오브', () => {
  const s = quiet();
  s.player.passives.orbDrop = 5;
  const need = Math.ceil(ULT.killsPerOrb / (1 + 5 * per('orbDrop')));
  for (let i = 0; i < need; i++) {
    const e = spawn(s, 'chaser', { x: 100 + i, y: 100 });
    e.hp = -1;
  }
  step(s, {});
  assert.equal(s.ultOrbs, 1);
});
