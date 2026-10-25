import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, choose } from '../src/core/game.js';
import { SKILLS, ULT, BRANCH_LEVEL } from '../src/data/skills.js';
import { AGENTS, STATUS } from '../src/data/agents.js';
import { CRIT, DT } from '../src/data/balance.js';
import { skillValue } from '../src/core/systems/skills.js';
import { damageEnemy } from '../src/core/systems/combat.js';
import { endRound } from '../src/core/systems/rounds.js';
import { spawn } from '../src/core/systems/enemies.js';

function kj(seed = 1) {
  const s = createGame(seed, 'killjoy');
  s.spawnAcc = -1e9;
  s.player.guns = [null, null];
  return s;
}
function enemy(s, x, y, hp = 1e6, speed = 0) {
  const e = spawn(s, 'chaser', { x, y });
  e.hp = e.maxHp = hp;
  e.speed = speed;
  return e;
}
const idle = (s, n, input = {}) => {
  for (let i = 0; i < n; i++) step(s, input);
};
const press = (k, extra = {}) => ({ keys: { [k]: true }, ...extra });
const unlock = (s, ...slots) => slots.forEach((k) => (s.player.skills[k].level = Math.max(1, s.player.skills[k].level)));

test('에이전트별 슬롯 매핑과 시작 스킬', () => {
  for (const [agent, def] of Object.entries(AGENTS)) {
    const s = createGame(1, agent);
    assert.equal(s.agent, agent);
    for (const [slot, id] of Object.entries(def.slots)) {
      assert.equal(s.player.skills[slot].id, id);
      assert.equal(s.player.skills[slot].level, SKILLS[id].startLevel);
    }
  }
  assert.equal(createGame(1).agent, 'chamber', '기본은 체임버');
});

test('레벨업 카드·분기 선택지는 킬조이 스킬 이름을 쓴다', () => {
  const s = kj();
  s.player.skills.q.level = BRANCH_LEVEL - 1;
  s.pending = { kind: 'levelup', options: [{ type: 'skill', key: 'q' }] };
  s.levelUpsQueued = 1;
  choose(s, 0);
  assert.equal(s.pending.kind, 'branch');
  assert.ok(s.pending.options[0].title.includes(SKILLS.nanoswarm.branches.A.name));
});

test('알람봇: 다가온 적에게 굴러가 폭발, 피해 후 취약', () => {
  const s = kj();
  const p = s.player;
  const e = enemy(s, p.x + 300, p.y);
  step(s, press('c', { aim: { x: p.x + 200, y: p.y } }));
  assert.equal(s.devices.filter((d) => d.kind === 'alarmbot').length, 1);
  let blast = null;
  for (let i = 0; i < 120 && !blast; i++) {
    step(s, {});
    blast = s.events.find((ev) => ev.type === 'alarmbotBlast');
  }
  assert.ok(blast, '폭발');
  const dmg = skillValue('alarmbot', 'damage', 1);
  assert.ok(Math.abs(e.maxHp - e.hp - dmg) < 1e-6, '첫 폭발은 크리 아님 (피해 후 취약)');
  assert.ok(e.vulnerable > 0);
  assert.equal(s.devices.length, 0, '분기 없으면 소모');
});

test('취약: 받는 피해 배율, 천재성: 취약 적에게 설치물 피해는 크리', () => {
  const s = kj();
  const e = enemy(s, 0, 0);
  e.vulnerable = 1;
  assert.equal(damageEnemy(s, e, 10, false, 'classic'), false, '총은 천재성 대상 아님');
  assert.ok(Math.abs(e.maxHp - e.hp - 10 * STATUS.vulnerableMult) < 1e-6);
  const before = e.hp;
  assert.equal(damageEnemy(s, e, 10, false, 'turret'), true);
  assert.ok(Math.abs(before - e.hp - 10 * CRIT.multiplier * STATUS.vulnerableMult) < 1e-6);
});

test('나노스웜: 투척 후 착탄, 장판 안 적에게 지속 피해, 충전 소모', () => {
  const s = kj();
  unlock(s, 'q');
  const p = s.player;
  const e = enemy(s, p.x + 150, p.y);
  step(s, press('q', { aim: { x: e.x, y: e.y } }));
  assert.equal(s.zones.length, 1);
  assert.equal(p.skills.q.charges, SKILLS.nanoswarm.maxCharges - 1);
  idle(s, Math.floor(SKILLS.nanoswarm.flightTime / DT) - 2);
  assert.equal(e.hp, e.maxHp, '비행 중에는 피해 없음');
  idle(s, 60);
  const expected = skillValue('nanoswarm', 'dps', 1);
  assert.ok(e.maxHp - e.hp >= expected * 0.75, `1초 피해 ${e.maxHp - e.hp}`);
  idle(s, Math.ceil(SKILLS.nanoswarm.duration / DT));
  assert.equal(s.zones.length, 0, '지속 후 소멸');
});

test('포탑: 사거리 안 적 자동 사격, 다시 E 는 쿨다운 후 재배치 (최대 1기)', () => {
  const s = kj();
  unlock(s, 'e');
  const p = s.player;
  const e = enemy(s, p.x + 200, p.y);
  step(s, press('e', { aim: { x: p.x + 100, y: p.y } }));
  assert.equal(s.devices.filter((d) => d.kind === 'turret').length, 1);
  idle(s, 120);
  assert.ok(e.hp < e.maxHp, '포탑이 쏜다');
  step(s, press('e'));
  assert.equal(s.devices.filter((d) => d.kind === 'turret').length, 1);
  idle(s, Math.ceil(skillValue('turret', 'cooldown', 1) / DT));
  const first = s.devices[0].id;
  step(s, press('e'));
  assert.notEqual(s.devices.find((d) => d.kind === 'turret').id, first, '재배치');
  assert.equal(s.devices.filter((d) => d.kind === 'turret').length, 1);
});

test('봉쇄: 기동 후 반경 안 적 구금 (이동·사격 정지), 보스는 저항', () => {
  const s = kj();
  unlock(s, 'x');
  const p = s.player;
  s.ultOrbs = ULT.orbsNeeded;
  const ranged = spawn(s, 'ranged', { x: p.x + 200, y: p.y });
  const boss = spawn(s, 'boss', { x: p.x - 200, y: p.y });
  const far = enemy(s, p.x + 1500, p.y);
  step(s, press('x'));
  assert.equal(s.ultOrbs, 0);
  assert.equal(s.lockdowns.length, 1);
  idle(s, Math.ceil(SKILLS.lockdown.windup / DT) + 1);
  const dur = skillValue('lockdown', 'detainDuration', 1);
  assert.ok(ranged.detained > dur - 0.1);
  assert.ok(Math.abs(boss.detained - dur * (1 - STATUS.bossDetainResist)) < 0.1);
  assert.equal(far.detained, 0);
  const pos = [ranged.x, ranged.y];
  const shots = [];
  for (let i = 0; i < 120; i++) {
    step(s, {});
    shots.push(...s.events.filter((ev) => ev.type === 'enemyShot' && ev.enemy === 'ranged'));
  }
  assert.deepEqual([ranged.x, ranged.y], pos, '구금 중 정지');
  assert.equal(shots.length, 0, '구금 중 사격 없음');
});

test('킬조이 분기 8종', () => {
  // C-A 연쇄: 폭발 후 한 번 더 / C-B 광역: 반경 2배
  for (const [branch, check] of [
    ['A', (s) => assert.equal(s.devices.filter((d) => d.kind === 'alarmbot').length, 1, '재전개')],
    ['B', (s, ev) => assert.equal(ev.r, SKILLS.alarmbot.blastRadius * 2)],
  ]) {
    const s = kj();
    s.player.skills.c.level = BRANCH_LEVEL;
    s.player.skills.c.branch = branch;
    const p = s.player;
    enemy(s, p.x + 260, p.y);
    step(s, press('c', { aim: { x: p.x + 200, y: p.y } }));
    let ev = null;
    for (let i = 0; i < 120 && !ev; i++) {
      step(s, {});
      ev = s.events.find((x) => x.type === 'alarmbotBlast');
    }
    check(s, ev);
  }
  // Q-A 부식: 장판 안 적 취약 / Q-B 대형: 반경·지속
  {
    const s = kj();
    s.player.skills.q.level = BRANCH_LEVEL;
    s.player.skills.q.branch = 'A';
    const e = enemy(s, s.player.x + 120, s.player.y);
    step(s, press('q', { aim: { x: e.x, y: e.y } }));
    idle(s, 60);
    assert.ok(e.vulnerable > 0);
    const t = kj();
    t.player.skills.q.level = BRANCH_LEVEL;
    t.player.skills.q.branch = 'B';
    step(t, press('q', { aim: { x: t.player.x + 100, y: t.player.y } }));
    const B = SKILLS.nanoswarm.branches.B;
    assert.equal(t.zones[0].r, SKILLS.nanoswarm.radius * B.radiusMult);
    assert.equal(t.zones[0].maxLife, SKILLS.nanoswarm.duration * B.durationMult);
  }
  // E-A 속사: 연사 증가 / E-B 냉각탄: 명중 시 감속
  {
    const shotsWith = (branch) => {
      const s = kj();
      s.player.skills.e.level = BRANCH_LEVEL;
      s.player.skills.e.branch = branch;
      enemy(s, s.player.x + 150, s.player.y);
      step(s, press('e'));
      let n = 0;
      for (let i = 0; i < 300; i++) {
        step(s, {});
        n += s.events.filter((ev) => ev.type === 'turretShot').length;
      }
      return n;
    };
    assert.ok(shotsWith('A') > shotsWith('B') * 1.2);
    const t = kj();
    t.player.skills.e.level = BRANCH_LEVEL;
    t.player.skills.e.branch = 'B';
    const e = enemy(t, t.player.x + 150, t.player.y);
    step(t, press('e'));
    let chilled = false;
    for (let i = 0; i < 120 && !chilled; i++) {
      step(t, {});
      chilled = e.chillTime > 0;
    }
    assert.ok(chilled);
  }
  // X-A 급속 기동 / X-B 해체: 구금 + 취약
  {
    const s = kj();
    s.player.skills.x.level = BRANCH_LEVEL;
    s.player.skills.x.branch = 'A';
    s.ultOrbs = ULT.orbsNeeded;
    step(s, press('x'));
    assert.equal(s.lockdowns[0].windup, SKILLS.lockdown.branches.A.windup);
    const t = kj();
    t.player.skills.x.level = BRANCH_LEVEL;
    t.player.skills.x.branch = 'B';
    t.ultOrbs = ULT.orbsNeeded;
    const e = enemy(t, t.player.x + 100, t.player.y);
    step(t, press('x'));
    idle(t, Math.ceil(SKILLS.lockdown.windup / DT) + 1);
    assert.ok(e.detained > 0 && e.vulnerable > 0);
  }
});

test('라운드 종료 시 킬조이 설치물 정리, 충전 회복', () => {
  const s = kj();
  unlock(s, 'q', 'e');
  step(s, press('c', { aim: { x: s.player.x + 100, y: s.player.y } }));
  step(s, press('q', { aim: { x: s.player.x + 100, y: s.player.y } }));
  step(s, press('e'));
  endRound(s);
  assert.equal(s.devices.length + s.zones.length + s.lockdowns.length, 0);
  assert.equal(s.player.skills.c.charges, SKILLS.alarmbot.maxCharges);
  assert.equal(s.player.skills.q.charges, SKILLS.nanoswarm.maxCharges);
  assert.equal(s.player.skills.e.cd, 0);
});
