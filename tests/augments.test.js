import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, choose } from '../src/core/game.js';
import { SKILLS, BRANCH_LEVEL, MASTERY_LEVEL, ULT } from '../src/data/skills.js';
import { DT } from '../src/data/balance.js';
import { ENEMIES } from '../src/data/enemies.js';
import { skillValue } from '../src/core/systems/skills.js';
import { tmMaxCharges, qMagazine } from '../src/core/systems/agents/chamber.js';
import { ultCost } from '../src/core/systems/skillutil.js';
import { decide, ruleOf } from '../src/core/autopilot.js';
import { applyCard } from '../src/core/systems/progression.js';
import { maxHp } from '../src/core/stats.js';

const TM = SKILLS.trademark;
const HH = SKILLS.headhunter;

function quiet(seed = 1) {
  const s = createGame(seed);
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
const armTicks = Math.ceil(TM.armTime / DT) + 2;
function form(s, key, id, level = BRANCH_LEVEL) {
  s.player.skills[key].level = level;
  s.player.skills[key].branch = id;
}
function mastery(s, key, id) {
  s.player.skills[key].level = MASTERY_LEVEL;
  s.player.skills[key].mastery = id;
}

// ── 구조 ──

test('형태·숙련 레벨: Lv2 형태, Lv5 숙련 선택이 큐에 들어간다', () => {
  const s = quiet();
  applyCard(s, { type: 'skill', key: 'c' }); // 1 → 2
  assert.deepEqual(s.branchQueue, ['c']);
  s.player.skills.c.branch = 'A';
  s.branchQueue.length = 0;
  s.player.skills.c.level = MASTERY_LEVEL - 1;
  applyCard(s, { type: 'skill', key: 'c' });
  assert.deepEqual(s.masteryQueue, ['c']);
  step(s, {});
  assert.equal(s.pending.kind, 'mastery');
  assert.equal(s.pending.options.length, 3);
  const id = s.pending.options[0].mastery;
  choose(s, 0);
  assert.equal(s.player.skills.c.mastery, id);
});

test('규칙 없는 증강은 없다: 체임버 모든 형태가 자동 규칙을 갖는다 (자기 것 또는 스킬 기본)', () => {
  for (const id of ['trademark', 'rendezvous', 'headhunter', 'tourDeForce']) {
    const def = SKILLS[id];
    assert.ok(def.auto, `${id} 기본 규칙`);
    for (const [fid, f] of Object.entries(def.branches)) assert.ok(f.auto || def.auto, `${id}.${fid}`);
    for (const [mid, m] of Object.entries(def.masteries)) {
      if (m.auto) assert.ok(m.alt && m.altDesc, `${id}.${mid} 자동화 숙련은 자동 모드 효과가 있어야 한다`);
    }
  }
});

test('자동 판단: 모든 형태 조합에서 키와 조준을 돌려준다', () => {
  for (const key of ['c', 'e', 'q', 'x']) {
    for (const id of Object.keys(SKILLS[{ c: 'trademark', e: 'rendezvous', q: 'headhunter', x: 'tourDeForce' }[key]].branches)) {
      const s = quiet();
      for (const k of ['c', 'e', 'q', 'x']) s.player.skills[k].level = 3;
      s.player.skills[key].branch = id;
      s.ultOrbs = ULT.orbsNeeded;
      for (let i = 0; i < 20; i++) enemy(s, 1000 + 60 + i * 15, 1000 + (i % 3) * 20, 100);
      enemy(s, 1300, 1000, 800, 'elite');
      const d = decide(s);
      assert.ok(d.aim && Number.isFinite(d.aim.x), `${key}.${id}`);
      assert.equal(typeof d.keys[key], 'boolean');
      assert.ok(ruleOf(s.player, key), `${key}.${id} 규칙`);
    }
  }
});

// ── 트레이드마크 ──

test('지뢰밭: 충전·덫 5개, 반경 절반', () => {
  const s = quiet();
  form(s, 'c', 'minefield');
  idle(s, 1);
  assert.equal(tmMaxCharges(s.player), 5);
  s.player.skills.c.charges = 5;
  for (let i = 0; i < 5; i++) step(s, press('c', { aim: { x: 1000 + 100 + i * 60, y: 1000 } }));
  assert.equal(s.traps.length, 5);
  const e = enemy(s, 1100, 1000);
  idle(s, armTicks);
  assert.ok(Math.abs(s.fields[0].r - skillValue('trademark', 'fieldRadius', BRANCH_LEVEL) * SKILLS.trademark.branches.minefield.radiusMult) < 1e-9);
  assert.ok(e);
});

test('과충전 덫: 덫 1개, 반경 2배, 발동 시 구금 (엘리트 저항)', () => {
  const s = quiet();
  form(s, 'c', 'overcharge');
  s.player.skills.c.charges = 1;
  step(s, press('c', { aim: { x: 1200, y: 1000 } }));
  const a = enemy(s, 1200, 1000);
  const b = enemy(s, 1260, 1000, 1e6, 'elite');
  idle(s, armTicks);
  assert.equal(s.fields.length, 1);
  assert.ok(Math.abs(s.fields[0].r - skillValue('trademark', 'fieldRadius', BRANCH_LEVEL) * 2) < 1e-9);
  assert.ok(a.detained > 1);
  assert.ok(b.detained > 0 && b.detained < a.detained);
});

test('사냥개 덫: 설치 후 근처 적에게 기어간다', () => {
  const s = quiet();
  form(s, 'c', 'hound');
  step(s, press('c', { aim: { x: 1200, y: 1000 } }));
  enemy(s, 1380, 1000);
  idle(s, armTicks);
  assert.ok(s.traps.length === 0 || s.traps[0].x > 1200, '적 쪽으로 이동하거나 이미 발동');
  idle(s, 120);
  assert.ok(s.fields.length >= 1, '도착해서 발동');
});

test('숙련: 연쇄 발동·처형장·덫 고리', () => {
  const s = quiet();
  mastery(s, 'c', 'chainTrigger');
  s.player.skills.c.charges = 2;
  step(s, press('c', { aim: { x: 1200, y: 1000 } }));
  step(s, press('c', { aim: { x: 1200, y: 1300 } }));
  idle(s, armTicks);
  enemy(s, 1200, 1000);
  step(s, {});
  assert.equal(s.fields.length, 2, '400 안의 다른 덫도 함께 발동');

  const t = quiet();
  mastery(t, 'c', 'killZone');
  t.fields.push({ x: 1200, y: 1000, r: 100, life: 1, maxLife: 3, slow: 0.4, stack: false });
  enemy(t, 1200, 1000, 0.5);
  t.enemies[0].hp = 0;
  t.enemies[0].killedBy = 'vandal';
  step(t, {});
  assert.ok(t.fields[0].life > 1 - DT, '처치로 지속 연장');

  const u = quiet();
  mastery(u, 'c', 'markRing');
  u.fields.push({ x: 1200, y: 1000, r: 100, life: 5, maxLife: 5, slow: 0.4, stack: false });
  const e = enemy(u, 1200, 1000);
  step(u, {});
  assert.ok(e.mark > 2);
});

test('자동 재설치: 수동이면 마지막 발동 지점에 다시 깔고, 자동 사용 중이면 충전 +1', () => {
  const s = quiet();
  mastery(s, 'c', 'autoRearm');
  s.player.skills.c.charges = 2;
  step(s, press('c', { aim: { x: 1200, y: 1000 } }));
  idle(s, armTicks);
  const e = enemy(s, 1200, 1000);
  step(s, {});
  s.enemies.length = 0;
  void e;
  step(s, {});
  assert.ok(s.traps.some((t) => Math.abs(t.x - 1200) < 1e-9), '같은 자리에 재설치');

  const t = quiet();
  mastery(t, 'c', 'autoRearm');
  step(t, { autoSkills: true });
  assert.equal(tmMaxCharges(t.player), TM.maxCharges + 1);
  step(t, { autoSkills: false });
  assert.equal(tmMaxCharges(t.player), TM.maxCharges);
});

// ── 랑데부 ──

test('덫 귀환: 조준점에 가까운 덫으로 이동하고 그 덫을 발동', () => {
  const s = quiet();
  form(s, 'e', 'trapRecall');
  s.player.skills.c.charges = 2;
  step(s, press('c', { aim: { x: 1300, y: 1000 } }));
  step(s, press('c', { aim: { x: 1000, y: 1300 } }));
  step(s, press('e', { aim: { x: 1290, y: 1000 } }));
  assert.ok(Math.abs(s.player.x - 1300) < 1e-6 && Math.abs(s.player.y - 1000) < 1e-6);
  assert.equal(s.traps.length, 1);
  assert.equal(s.fields.length, 1);
});

test('잔상: 귀환 후 분신이 적을 끌고, 사라질 때 폭발', () => {
  const s = quiet();
  form(s, 'e', 'afterimage');
  step(s, press('e'));
  s.player.x += 400;
  const e = enemy(s, 900, 1000, 1e6);
  e.speed = 100;
  step(s, press('e'));
  assert.ok(s.decoy);
  const x0 = e.x;
  idle(s, 30);
  assert.ok(e.x > x0, '분신(1400,1000)이 아니라 출발 지점(1400→귀환 전 위치) 쪽으로');
  idle(s, Math.ceil(2 / DT));
  assert.equal(s.decoy, null);
});

test('이중 앵커: 두 번째 앵커를 깔고 조준점에 가까운 쪽으로 귀환', () => {
  const s = quiet();
  form(s, 'e', 'twinAnchor');
  step(s, press('e'));
  s.player.x = 1500;
  step(s, press('e'));
  assert.ok(s.player.skills.e.anchor2);
  s.player.x = 1200;
  step(s, press('e', { aim: { x: 1550, y: 1000 } }));
  assert.ok(Math.abs(s.player.x - 1500) < 1e-6);
});

test('숙련: 귀환 장전·공간 왜곡·전술 리셋·비상 귀환', () => {
  const s = quiet();
  mastery(s, 'e', 'reloadRecall');
  step(s, press('e'));
  s.player.x += 300;
  step(s, press('e'));
  assert.ok(s.player.pierceBuff > 0 && s.player.pierceBonus === 2);

  const t = quiet();
  mastery(t, 'e', 'warp');
  step(t, press('e'));
  const e = enemy(t, 1150, 1000);
  t.player.x = 1300;
  step(t, press('e'));
  assert.ok(e.hp < e.maxHp && e.vulnerable > 0);

  const u = quiet();
  mastery(u, 'e', 'tacticalReset');
  u.player.skills.c.charges = 0;
  u.player.skills.c.cd = 100;
  step(u, press('e'));
  u.player.x += 200;
  step(u, press('e'));
  assert.equal(u.player.skills.c.charges, 1);

  const v = quiet();
  mastery(v, 'e', 'emergency');
  step(v, press('e'));
  v.player.x += 300;
  v.player.hp = maxHp(v.player) * 0.2;
  step(v, {});
  assert.ok(Math.abs(v.player.x - 1000) < 1e-6, 'HP 30% 아래에서 자동 귀환');
});

// ── 헤드헌터 ──

test('한 발의 미학: 탄창 1, 피해 ×6, 처치하면 탄 회수', () => {
  const s = quiet();
  form(s, 'q', 'oneShot');
  idle(s, 1);
  assert.equal(qMagazine(s.player), 1);
  s.player.skills.q.ammo = 1;
  const e = enemy(s, 1150, 1000, 50);
  idle(s, 10, press('q', { aim: { x: 1150, y: 1000 } }));
  assert.ok(!s.enemies.includes(e));
  assert.equal(s.player.skills.q.ammo, 1, '처치로 회수');
});

test('속사: 정조준 중 감속 없음', () => {
  const s = quiet();
  form(s, 'q', 'rapid');
  const x = s.player.x;
  step(s, press('q', { move: { x: 1, y: 0 } }));
  const t = quiet();
  t.player.skills.q.level = BRANCH_LEVEL;
  step(t, press('q', { move: { x: 1, y: 0 } }));
  assert.ok(s.player.x - x > (t.player.x - x) * 1.5);
});

test('표식 사격·처형·헤드샷 회수', () => {
  const s = quiet();
  form(s, 'q', 'markShot');
  const e = enemy(s, 1150, 1000);
  idle(s, 15, press('q', { aim: { x: 1150, y: 1000 } }));
  assert.ok(e.mark > 0);

  const t = quiet();
  mastery(t, 'q', 'execute');
  const weak = enemy(t, 1150, 1000, 1000);
  weak.hp = 150; // 피해 후 20% 아래
  idle(t, 15, press('q', { aim: { x: 1150, y: 1000 } }));
  assert.ok(!t.enemies.includes(weak));

  const u = quiet();
  mastery(u, 'q', 'headshotRefund');
  u.player.skills.q.ammo = 3;
  enemy(u, 1150, 1000, 1);
  idle(u, 15, press('q', { aim: { x: 1150, y: 1000 } }));
  assert.ok(u.player.skills.q.ammo >= 3, `회수 (${u.player.skills.q.ammo})`);
});

test('정지 사수: 수동이면 멈춰 있을 때 자동 정조준, 자동 사용 중이면 정조준 감속 없음', () => {
  const s = quiet();
  mastery(s, 'q', 'stillAim');
  idle(s, Math.ceil(0.7 / DT));
  assert.ok(s.player.precision);
  step(s, { move: { x: 1, y: 0 } });
  idle(s, 1, { move: { x: 1, y: 0 } });
  assert.ok(!s.player.precision);

  const t = quiet();
  mastery(t, 'q', 'stillAim');
  const x = t.player.x;
  step(t, press('q', { move: { x: 1, y: 0 }, autoSkills: true }));
  assert.ok(Math.abs(t.player.x - x - 220 * DT) < 1e-6, '감속 없음');
});

test('반사 신경: 정조준 중 첫 피격 무효', () => {
  const s = quiet();
  mastery(s, 'q', 'reflex');
  s.player.invuln = 0;
  const e = enemy(s, 1000, 1000);
  e.damage = 10;
  const hp = s.player.hp;
  step(s, press('q'));
  assert.equal(s.player.hp, hp);
  assert.ok(s.player.reflexCd > 0);
});

// ── 역작 ──

test('경량 역작: 오브 1개로 꺼내고 탄 2발', () => {
  const s = quiet();
  form(s, 'x', 'split');
  assert.equal(ultCost(s.player), 1);
  s.ultOrbs = 1;
  const e = enemy(s, 1300, 1000);
  step(s, press('x', { aim: { x: 1300, y: 1000 } }));
  assert.equal(s.ultOrbs, 0);
  assert.ok(Math.abs(e.maxHp - e.hp - skillValue('tourDeForce', 'damage', BRANCH_LEVEL)) < 1e-6);
  assert.equal(s.player.skills.x.extra, SKILLS.tourDeForce.branches.split.shots - 1, '남은 탄');
});

test('십자포화: 4방향 동시 저격', () => {
  const s = quiet();
  form(s, 'x', 'cross');
  s.ultOrbs = ULT.orbsNeeded;
  const hits = [enemy(s, 1300, 1000), enemy(s, 700, 1000), enemy(s, 1000, 1300), enemy(s, 1000, 700)];
  step(s, press('x', { aim: { x: 1300, y: 1000 } }));
  for (const e of hits) assert.ok(e.hp < e.maxHp);
});

test('숙련: 자동 처형(수동·자동)·처치 환급·덫 각인·금괴 탄', () => {
  const s = quiet();
  mastery(s, 'x', 'autoExecute');
  s.ultOrbs = ULT.orbsNeeded;
  const el = enemy(s, 1500, 1000, 1e6, 'elite');
  step(s, {});
  assert.ok(el.hp < el.maxHp, '수동: 엘리트가 오면 자동 발사');
  step(s, { autoSkills: true });
  assert.equal(ultCost(s.player), ULT.orbsNeeded - 1, '자동 사용 중: 필요 오브 -1');

  const t = quiet();
  mastery(t, 'x', 'refund');
  t.ultOrbs = ULT.orbsNeeded;
  for (let i = 0; i < 6; i++) enemy(t, 1100 + i * 50, 1000, 1);
  step(t, press('x', { aim: { x: 1500, y: 1000 } }));
  assert.equal(t.player.skills.x.extra, SKILLS.tourDeForce.shots, '5명 이상 처치: 탄 1발 추가 (남은 4발 + 1)');

  const u = quiet();
  mastery(u, 'x', 'trapImprint');
  u.ultOrbs = ULT.orbsNeeded;
  enemy(u, 1300, 1000, 1);
  step(u, press('x', { aim: { x: 1300, y: 1000 } }));
  assert.equal(u.traps.length, 1);

  const v = quiet();
  mastery(v, 'x', 'goldRounds');
  v.ultOrbs = ULT.orbsNeeded;
  enemy(v, 1300, 1000, 1);
  const c = v.credits;
  step(v, press('x', { aim: { x: 1300, y: 1000 } }));
  assert.equal(v.credits - c, ENEMIES.chaser.credits * 3);
});
