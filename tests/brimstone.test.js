import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { SKILLS } from '../src/data/skills.js';
import { COMMANDER } from '../src/data/agents.js';
import { DT } from '../src/data/balance.js';
import { spawn } from '../src/core/systems/enemies.js';
import { damageEnemy } from '../src/core/systems/combat.js';
import { damagePlayer } from '../src/core/systems/player.js';
import { rollShop } from '../src/core/systems/economy.js';
import { smokeLoseRange } from '../src/core/systems/utils.js';
import { decide } from '../src/core/autopilot.js';

function quiet() {
  const s = createGame(1, 'brimstone');
  s.spawnAcc = -1e9;
  s.player.guns = [null, null];
  s.player.invuln = 1e9;
  s.roundTime = 30;
  return s;
}
const dummy = (s, x, y, hp = 1e6) => Object.assign(spawn(s, 'chaser', { x, y }), { hp, maxHp: hp, speed: 0, damage: 0 });
const idle = (s, n, input = {}) => {
  for (let i = 0; i < n; i++) step(s, input);
};
const unlock = (s, slot, level = 1) => {
  s.player.skills[slot].level = level;
};
const cast = (s, slot, at) => {
  step(s, { keys: { [slot]: true }, aim: at });
  step(s, { keys: {}, aim: at });
};

test('신호기: 안에서만 연사·이속 증가, 지속이 끝나면 사라진다', () => {
  const s = quiet();
  const p = s.player;
  cast(s, 'c', { x: p.x, y: p.y });
  assert.equal(s.beacons.length, 1);
  assert.ok(p.fireRateBuff > 0 && p.speedBuff > 0, '안: 버프');
  p.x += 1000;
  step(s, {});
  assert.equal(p.fireRateBuff, 0, '밖: 버프 없음');
  assert.equal(p.speedBuff, 0);
  idle(s, Math.ceil((SKILLS.beacon.duration[0] + 1) / DT));
  assert.equal(s.beacons.length, 0);
});

test('신호기 쿨다운은 시간으로만 돈다: 처치해도 충전·쿨다운이 빨라지지 않는다 (루프 방지)', () => {
  const s = quiet();
  const p = s.player;
  cast(s, 'c', { x: p.x, y: p.y });
  assert.equal(p.skills.c.charges, 0);
  const cd0 = p.skills.c.cd;
  for (let i = 0; i < 30; i++) damageEnemy(s, dummy(s, p.x + 40, p.y, 1), 10, false, 'classic');
  step(s, {});
  assert.ok(Math.abs(cd0 - DT - p.skills.c.cd) < 1e-9, '처치 30회에도 쿨다운은 한 틱만큼만 줄었다');
  assert.equal(p.skills.c.charges, 0);
});

test('거점 사령관: 구역 안에서 받는 피해 감소, 정지 정확도', () => {
  const s = quiet();
  const p = s.player;
  p.invuln = 0;
  p.hp = 100;
  damagePlayer(s, 10, 'test');
  assert.equal(p.hp, 90, '구역 밖: 전부 받는다');
  p.invuln = 0;
  cast(s, 'c', { x: p.x, y: p.y });
  p.invuln = 0;
  damagePlayer(s, 10, 'test');
  assert.ok(Math.abs(p.hp - (90 - 10 * COMMANDER.takenMult)) < 1e-9, '구역 안: 받는 피해 감소');
});

test('연막: 내 연막 안 적 감속(짙은 연막), 완전 은폐는 놓침 거리 0', () => {
  const s = quiet();
  const p = s.player;
  unlock(s, 'e');
  p.skills.e.branch = 'dense';
  const e = dummy(s, p.x + 60, p.y);
  cast(s, 'e', { x: p.x, y: p.y });
  assert.equal(s.smokes.length, 1);
  assert.equal(s.smokes[0].owner, 'brim');
  assert.ok(e.chill >= SKILLS.skysmoke.branches.dense.slow - 1e-9);
  p.skills.e.branch = 'cloak';
  p.skills.e.charges = 1;
  s.smokes.length = 0;
  cast(s, 'e', { x: p.x, y: p.y });
  assert.equal(smokeLoseRange(s), 0);
});

test('질식 연막: 안의 적이 피해를 입는다', () => {
  const s = quiet();
  const p = s.player;
  unlock(s, 'e');
  p.skills.e.branch = 'choke';
  const e = dummy(s, p.x + 60, p.y);
  cast(s, 'e', { x: p.x, y: p.y });
  idle(s, 60);
  assert.ok(e.hp < e.maxHp);
});

test('소이탄: 장판 안 적에게 지속 피해, 확산은 3개, 폭발은 즉시 피해', () => {
  const s = quiet();
  const p = s.player;
  unlock(s, 'q');
  const e = dummy(s, p.x + 100, p.y);
  cast(s, 'q', { x: e.x, y: e.y });
  assert.equal(s.flames.length, 1);
  idle(s, 30);
  const lost = e.maxHp - e.hp;
  assert.ok(lost > 0, '지속 피해');
  idle(s, 30);
  assert.ok(e.maxHp - e.hp > lost);

  const t = quiet();
  unlock(t, 'q');
  t.player.skills.q.branch = 'scatter';
  cast(t, 'q', { x: t.player.x + 100, y: t.player.y });
  assert.equal(t.flames.length, SKILLS.ember.branches.scatter.count);

  const u = quiet();
  unlock(u, 'q');
  u.player.skills.q.branch = 'blast';
  const f = dummy(u, u.player.x + 100, u.player.y);
  cast(u, 'q', { x: f.x, y: f.y });
  assert.ok(f.maxHp - f.hp >= SKILLS.ember.branches.blast.blastDamage - 1e-6, '착탄 즉시 폭발');
});

test('궤도 일격: 오브를 쓰고 예고 뒤에 착탄, 화염 지대를 남긴다', () => {
  const s = quiet();
  const p = s.player;
  unlock(s, 'x');
  const e = dummy(s, p.x + 150, p.y);
  cast(s, 'x', { x: e.x, y: e.y });
  assert.equal((s.strikes ?? []).length, 0, '오브 없으면 안 나감');
  s.ultOrbs = 3;
  cast(s, 'x', { x: e.x, y: e.y });
  assert.equal(s.ultOrbs, 0);
  assert.equal(s.strikes.length, 1);
  assert.equal(e.hp, e.maxHp, '예고 중에는 피해 없음');
  idle(s, Math.ceil(SKILLS.orbital.windup / DT) + 2);
  assert.equal(s.strikes.length, 0);
  assert.ok(e.hp < e.maxHp, '착탄 피해');
  assert.equal(s.flames.filter((f) => f.src === 'orbital').length, 1);
});

test('궤도 일격 형태: 정밀은 예고가 짧고, 연속은 3회', () => {
  const s = quiet();
  unlock(s, 'x');
  s.player.skills.x.branch = 'precise';
  s.ultOrbs = 3;
  cast(s, 'x', { x: s.player.x + 100, y: s.player.y });
  assert.ok(Math.abs(s.strikes[0].total - SKILLS.orbital.branches.precise.windup) < 1e-9);
  const t = quiet();
  unlock(t, 'x');
  t.player.skills.x.branch = 'barrage';
  t.ultOrbs = 3;
  cast(t, 'x', { x: t.player.x + 100, y: t.player.y });
  assert.equal(t.strikes.length, 3);
});

test('계약 상점에서 연막·소이탄은 나오지 않는다 (스킬로 이미 가짐)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = createGame(seed, 'brimstone');
    rollShop(s);
    for (const r of s.shopRandom) if (r?.kind === 'contract') assert.ok(r.id !== 'smoke' && r.id !== 'incendiary', `${seed}: ${r.id}`);
  }
});

test('자동 규칙: 적이 밀집하면 신호기를 발밑에, 소이탄을 밀집 지점에', () => {
  const s = quiet();
  const p = s.player;
  unlock(s, 'q');
  for (let i = 0; i < 8; i++) dummy(s, p.x + 120 + (i % 3) * 8, p.y + (i - 4) * 8);
  let sawBeacon = false;
  let sawEmber = false;
  for (let k = 0; k < 12; k++) {
    const input = decide(s);
    sawBeacon ||= input.keys.c;
    sawEmber ||= input.keys.q;
    s.tick++;
  }
  assert.ok(sawBeacon, '신호기');
  assert.ok(sawEmber, '소이탄');
});

test('라운드 전환: 구역·예고가 정리되고 충전이 돌아온다', () => {
  const s = quiet();
  const p = s.player;
  cast(s, 'c', { x: p.x, y: p.y });
  s.strikes = [{ x: p.x, y: p.y, r: 100, t: 1, total: 2 }];
  s.flames = [{ x: p.x, y: p.y, r: 100, life: 3, maxLife: 3, dps: 1, tick: 0, src: 'ember' }];
  s.roundTime = 1e9;
  s.enemies.length = 0;
  s.roundTime = 1e9;
  // 라운드 정리는 resetSkillsForRound 가 한다
  return import('../src/core/systems/skills.js').then(({ resetSkillsForRound }) => {
    resetSkillsForRound(s);
    assert.equal(s.beacons.length, 0);
    assert.equal(s.flames.length, 0);
    assert.equal(s.strikes.length, 0);
    assert.equal(p.skills.c.charges, SKILLS.beacon.maxCharges);
  });
});
