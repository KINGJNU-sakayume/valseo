import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { SKILLS, BRANCH_LEVEL, MASTERY_LEVEL, ULT } from '../src/data/skills.js';
import { DT } from '../src/data/balance.js';
import { skillValue } from '../src/core/systems/skills.js';
import { abMaxCharges, nsMaxCharges } from '../src/core/systems/agents/killjoy.js';
import { ultCost } from '../src/core/systems/skillutil.js';
import { decide, ruleOf } from '../src/core/autopilot.js';
import { endRound } from '../src/core/systems/rounds.js';
import { maxHp } from '../src/core/stats.js';

const AB = SKILLS.alarmbot;
const NS = SKILLS.nanoswarm;
const TR = SKILLS.turret;
const LD = SKILLS.lockdown;
const SLOT_SKILL = { c: 'alarmbot', q: 'nanoswarm', e: 'turret', x: 'lockdown' };

function quiet(seed = 1) {
  const s = createGame(seed, 'killjoy');
  s.spawnAcc = -1e9;
  s.nextSpawn = 'chaser';
  s.player.guns = [null, null];
  s.player.invuln = 1e9;
  return s;
}
function enemy(s, x, y, hp = 1e6, type = 'chaser') {
  const e = { id: s.nextId++, type, x, y, r: 12, hp, maxHp: hp, speed: 0, damage: 0, mode: 'move', t: 0, dirX: 0, dirY: 0, fireCd: 99 };
  s.enemies.push(e);
  return e;
}
const idle = (s, n, input = {}) => {
  for (let i = 0; i < n; i++) step(s, input);
};
const press = (k, extra = {}) => ({ keys: { [k]: true }, ...extra });
function form(s, key, id) {
  s.player.skills[key].level = Math.max(BRANCH_LEVEL, s.player.skills[key].level);
  s.player.skills[key].branch = id;
}
function mastery(s, key, id) {
  s.player.skills[key].level = MASTERY_LEVEL;
  s.player.skills[key].mastery = id;
}
const armTicks = Math.ceil(AB.armTime / DT) + 2;
const landTicks = Math.ceil(NS.flightTime / DT) + 2;

test('규칙 없는 증강은 없다: 킬조이 모든 형태 / 자동 판단이 모든 형태에서 동작', () => {
  for (const [slot, id] of Object.entries(SLOT_SKILL)) {
    const def = SKILLS[id];
    assert.ok(def.auto, `${id} 기본 규칙`);
    for (const [mid, m] of Object.entries(def.masteries)) if (m.auto) assert.ok(m.alt && m.altDesc, `${id}.${mid}`);
    for (const fid of Object.keys(def.branches)) {
      const s = quiet();
      for (const k of ['c', 'q', 'e', 'x']) s.player.skills[k].level = 3;
      s.player.skills[slot].branch = fid;
      s.ultOrbs = ULT.orbsNeeded;
      for (let i = 0; i < 20; i++) enemy(s, 1060 + i * 12, 1000 + (i % 3) * 15, 100);
      for (let t = 0; t < 12; t++) {
        const d = decide(s);
        assert.ok(Number.isFinite(d.aim.x), `${id}.${fid}`);
        step(s, d);
      }
      assert.ok(ruleOf(s.player, slot), `${id}.${fid} 규칙`);
    }
  }
});

// ── 알람봇 ──

test('분열봇: 폭발하면 미니봇 3개 (미니봇은 다시 분열하지 않는다)', () => {
  const s = quiet();
  form(s, 'c', 'split');
  step(s, press('c', { aim: { x: 1150, y: 1000 } }));
  idle(s, armTicks);
  enemy(s, 1160, 1000);
  idle(s, 10);
  const minis = s.devices.filter((d) => d.mini);
  assert.equal(minis.length, AB.branches.split.count);
});

test('자석봇: 폭발 전에 주변 적을 끌어모은다', () => {
  const s = quiet();
  form(s, 'c', 'magnet');
  step(s, press('c', { aim: { x: 1200, y: 1000 } }));
  idle(s, armTicks);
  const e = enemy(s, 1350, 1000);
  idle(s, 30);
  assert.ok(e.x < 1350, '끌려온다');
  idle(s, Math.ceil(AB.branches.magnet.pullTime / DT));
  assert.ok(e.hp < e.maxHp, '폭발');
});

test('경비견: 따라다니며 문다 (피해 + 취약)', () => {
  const s = quiet();
  form(s, 'c', 'guard');
  step(s, press('c', { aim: { x: 1100, y: 1000 } }));
  idle(s, armTicks);
  s.player.x = 1400;
  idle(s, 60);
  const bot = s.devices.find((d) => d.guard);
  assert.ok(bot && Math.abs(bot.x - 1400) < 60, '플레이어 근처로');
  const e = enemy(s, bot.x + 30, bot.y);
  idle(s, 10);
  assert.ok(e.hp < e.maxHp && e.vulnerable > 0);
});

test('알람봇 숙련: 자동 생산(수동·자동)·재활용·취약 전이·과열 코어', () => {
  const s = quiet();
  mastery(s, 'c', 'autoProduce');
  step(s, {});
  assert.ok(s.devices.some((d) => d.kind === 'alarmbot'), '충전이 가득하면 발밑에');
  const t = quiet();
  mastery(t, 'c', 'autoProduce');
  step(t, { autoSkills: true });
  assert.equal(abMaxCharges(t.player), AB.maxCharges + 1);

  const u = quiet();
  mastery(u, 'c', 'recycle');
  u.player.skills.c.charges = 0;
  u.player.skills.c.cd = 100;
  for (let i = 0; i < 2; i++) {
    const e = enemy(u, 1300, 1000 + i * 300, 0);
    e.killedBy = 'alarmbot';
  }
  step(u, { autoSkills: true });
  assert.equal(u.player.skills.c.charges, 1, '처치 2번 = 충전 1');

  const v = quiet();
  mastery(v, 'c', 'vulnTransfer');
  const dead = enemy(v, 1300, 1000, 0);
  dead.vulnerable = 3;
  const near = enemy(v, 1350, 1000);
  step(v, {});
  assert.ok(near.vulnerable > 0);

  const w = quiet();
  mastery(w, 'c', 'overheat');
  w.zones.push({ id: 999, kind: 'nano', x: 1150, y: 1000, r: 60, flight: 0, life: 0.5, maxLife: 4, dps: 1, tick: 0, source: 'nanoswarm' });
  w.player.skills.c.charges = 1;
  step(w, press('c', { aim: { x: 1150, y: 1000 } }));
  idle(w, armTicks);
  enemy(w, 1160, 1000);
  idle(w, 5);
  assert.ok(w.zones[0].life > 3, '장판 지속 갱신');
});

// ── 나노스웜 ──

test('은닉 지뢰: 짧게 = 숨긴 설치, 길게 = 전부 발동 (+50%)', () => {
  const s = quiet();
  form(s, 'q', 'hidden');
  s.player.skills.q.charges = 2;
  step(s, press('q', { aim: { x: 1200, y: 1000 } }));
  step(s, {});
  step(s, press('q', { aim: { x: 1200, y: 1100 } }));
  step(s, {});
  idle(s, landTicks);
  assert.equal(s.zones.filter((z) => z.dormant).length, 2);
  const e = enemy(s, 1200, 1000);
  idle(s, 20);
  assert.equal(e.hp, e.maxHp, '숨긴 지뢰는 피해 없음');
  idle(s, Math.ceil(NS.branches.hidden.holdTime / DT) + 1, press('q'));
  assert.equal(s.zones.filter((z) => z.dormant).length, 0);
  assert.ok(Math.abs(s.zones[0].dps - skillValue('nanoswarm', 'dps', BRANCH_LEVEL) * 1.5) < 1e-9);
  idle(s, 20);
  assert.ok(e.hp < e.maxHp);
});

test('이동 군집·결정화', () => {
  const s = quiet();
  form(s, 'q', 'swarm');
  step(s, press('q', { aim: { x: 1200, y: 1000 } }));
  idle(s, landTicks);
  enemy(s, 1400, 1000);
  const x0 = s.zones[0].x;
  idle(s, 30);
  assert.ok(s.zones[0].x > x0);

  const t = quiet();
  form(t, 'q', 'crystal');
  step(t, press('q', { aim: { x: 1200, y: 1000 } }));
  idle(t, landTicks);
  enemy(t, 1200, 1000, 1);
  idle(t, 20);
  assert.equal(t.zones.length, 2, '죽은 자리에 작은 장판');
  assert.ok(t.zones[1].r < t.zones[0].r);
});

test('나노스웜 숙련: 자동 투척·나노 감염·수확·포탑 공급', () => {
  const s = quiet();
  mastery(s, 'q', 'autoThrow');
  for (let i = 0; i < 5; i++) enemy(s, 1200 + i * 10, 1000);
  step(s, {});
  assert.ok(s.zones.length >= 1, '가득 차면 밀집 지점에 자동 투척');
  const t = quiet();
  mastery(t, 'q', 'autoThrow');
  step(t, { autoSkills: true });
  assert.equal(nsMaxCharges(t.player), NS.maxCharges + 1);

  const u = quiet();
  mastery(u, 'q', 'infect');
  step(u, press('q', { aim: { x: 1200, y: 1000 } }));
  idle(u, landTicks);
  const victim = enemy(u, 1200, 1000, 5);
  const by = enemy(u, 1240, 1000);
  idle(u, 30);
  assert.ok(!u.enemies.includes(victim));
  assert.ok(by.hp <= by.maxHp - NS.masteries.infect.damage + 1e-6, '죽을 때 소폭발');

  const v = quiet();
  mastery(v, 'q', 'harvest');
  step(v, press('q', { aim: { x: 1200, y: 1000 } }));
  idle(v, landTicks);
  enemy(v, 1200, 1000, 1);
  const before = v.pickups.length;
  idle(v, 20);
  assert.ok(v.pickups.length >= before + 2, '기본 XP + 수확 1');
});

// ── 포탑 ──

test('쌍포탑·어깨 포탑·박격·레이저', () => {
  const s = quiet();
  form(s, 'e', 'twin');
  step(s, press('e'));
  s.player.skills.e.cd = 0;
  step(s, press('e'));
  assert.equal(s.devices.filter((d) => d.kind === 'turret').length, 2);

  const t = quiet();
  form(t, 'e', 'shoulder');
  step(t, press('e'));
  t.player.x += 200;
  step(t, {});
  const tur = t.devices.find((d) => d.kind === 'turret');
  assert.ok(Math.abs(tur.x - t.player.x) < 20, '함께 이동');

  const u = quiet();
  form(u, 'e', 'mortar');
  step(u, press('e'));
  enemy(u, 1150, 1000);
  idle(u, 30);
  assert.ok(u.zones.some((z) => z.source === 'shell'), '곡사 장판');

  const v = quiet();
  form(v, 'e', 'laser');
  step(v, press('e'));
  enemy(v, 1150, 1000);
  idle(v, 60);
  const lt = v.devices.find((d) => d.kind === 'turret');
  assert.ok(lt.ramp > 0, '같은 대상 연속 명중 → 피해 증가');
});

test('포탑 숙련: 자동 재배치(수동·자동)·업그레이드·수리 드론', () => {
  const s = quiet();
  mastery(s, 'e', 'autoRedeploy');
  step(s, press('e'));
  s.player.x += 600;
  step(s, {});
  const t0 = s.devices.find((d) => d.kind === 'turret');
  assert.ok(Math.abs(t0.x - s.player.x) < 1e-6, '멀어지면 데려온다');

  const u = quiet();
  mastery(u, 'e', 'upgrade');
  endRound(u);
  assert.equal(u.player.skills.e.upgrades, 1);

  const v = quiet();
  mastery(v, 'e', 'repair');
  step(v, press('e'));
  v.player.hp = 50;
  idle(v, 60);
  assert.ok(v.player.hp > 50.5);
});

// ── 봉쇄 ──

test('미니 봉쇄·휴대형·오버클럭', () => {
  const s = quiet();
  form(s, 'x', 'mini');
  assert.equal(ultCost(s.player), 1);
  s.ultOrbs = 1;
  const e = enemy(s, 1100, 1000);
  step(s, press('x'));
  idle(s, Math.ceil(LD.branches.mini.windup / DT) + 1);
  assert.ok(e.detained > 0);

  const t = quiet();
  form(t, 'x', 'portable');
  t.ultOrbs = ULT.orbsNeeded;
  step(t, press('x'));
  t.player.x = 1500;
  idle(t, 3);
  assert.ok(Math.abs(t.lockdowns[0].x - 1500) < 1e-6, '영역이 따라온다');

  const u = quiet();
  form(u, 'x', 'overclock');
  u.ultOrbs = ULT.orbsNeeded;
  const f = enemy(u, 1100, 1000);
  step(u, press('x'));
  idle(u, Math.ceil(LD.windup / DT) + 1);
  assert.ok(u.overclock && !(f.detained > 0), '구금 대신 오버클럭');
});

test('봉쇄 숙련: 비상 프로토콜·제압·구금 수확·확장', () => {
  const s = quiet();
  mastery(s, 'x', 'emergencyProtocol');
  s.player.hp = maxHp(s.player) * 0.2;
  step(s, {});
  assert.equal(s.lockdowns.length, 1);
  assert.ok(s.player.skills.x.emergencyUsed);

  const t = quiet();
  mastery(t, 'x', 'suppress');
  t.ultOrbs = ULT.orbsNeeded;
  const e = enemy(t, 1100, 1000);
  step(t, press('x'));
  idle(t, Math.ceil(LD.windup / DT) + 1);
  assert.ok(e.suppressed > e.detained, '구금이 끝나도 제압이 남는다');

  const u = quiet();
  mastery(u, 'x', 'harvestOrb');
  for (let i = 0; i < LD.masteries.harvestOrb.per; i++) {
    const d = enemy(u, 1300, 1000 + i * 40, 0);
    d.detained = 2;
  }
  step(u, {});
  assert.ok(u.ultOrbs >= 1);

  const v = quiet();
  mastery(v, 'x', 'expand');
  v.ultOrbs = ULT.orbsNeeded;
  step(v, press('x'));
  assert.ok(Math.abs(v.lockdowns[0].r - skillValue('lockdown', 'radius', MASTERY_LEVEL) * 1.25) < 1e-6);
  const x = v.player.x;
  step(v, { move: { x: 1, y: 0 } });
  assert.ok(v.player.x - x > 220 * DT * 1.2);
});
