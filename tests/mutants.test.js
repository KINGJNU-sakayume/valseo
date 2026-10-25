import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { ENEMIES } from '../src/data/enemies.js';
import { DT } from '../src/data/balance.js';
import { spawn } from '../src/core/systems/enemies.js';
import { damageEnemy } from '../src/core/systems/combat.js';
import { pickTarget } from '../src/core/autopilot.js';
import { startRound } from '../src/core/systems/rounds.js';

/** 스폰·사격 없는 조용한 게임. 플레이어 (1000,1000) 근처는 어센트에서 열린 칸. */
function quiet(seed = 1) {
  const s = createGame(seed);
  s.spawnAcc = -1e9;
  s.player.guns = [null, null];
  s.player.invuln = 1e9;
  s.roundTime = 30;
  return s;
}
const put = (s, type, x, y, extra = {}) => {
  const e = spawn(s, type, { x, y });
  Object.assign(e, extra);
  return e;
};
const idle = (s, n) => {
  for (let i = 0; i < n; i++) step(s, {});
};
const dealt = (s, e, base, source, from) => {
  const before = e.hp;
  damageEnemy(s, e, base, false, source, from);
  return before - e.hp;
};
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('결정갑각: 앞쪽 직접 피해 -70%, 측면·폭발은 그대로, 폭발 누적 또는 제압으로 껍질 해제', () => {
  const s = quiet();
  const e = put(s, 'carapace', 1200, 1000, { speed: 0, hp: 1e6, maxHp: 1e6 });
  e.face = Math.PI; // 플레이어(왼쪽)를 본다
  const sh = ENEMIES.carapace.shell;
  assert.ok(near(dealt(s, e, 10, 'vandal', { x: 1100, y: 1000 }), 10 * (1 - sh.reduce)), '정면');
  assert.ok(near(dealt(s, e, 10, 'vandal', { x: 1200, y: 1100 }), 10), '측면');
  assert.ok(near(dealt(s, e, 10, 'nanoswarm', { x: 1100, y: 1000 }), 10), '장판은 껍질 무시');
  dealt(s, e, sh.breakBlast, 'trap');
  assert.ok(e.shellOff > 0, '폭발 누적으로 해제');
  assert.ok(near(dealt(s, e, 10, 'vandal', { x: 1100, y: 1000 }), 10));

  const t = quiet();
  const f = put(t, 'carapace', 1200, 1000, { speed: 0, hp: 1e6, maxHp: 1e6, face: Math.PI });
  f.suppressed = 1;
  step(t, {});
  assert.ok(near(dealt(t, f, 10, 'vandal', { x: 1100, y: 1000 }), 10), '제압 중에는 껍질 없음');
});

test('결정갑각: 껍질은 천천히 돌아서 돌아 들어가면 측면이 된다', () => {
  const s = quiet();
  const e = put(s, 'carapace', 1300, 1000, { speed: 0 });
  e.face = Math.PI;
  s.player.x = 1300;
  s.player.y = 900; // 위쪽으로 순간 이동
  step(s, {});
  const turned = Math.abs(Math.atan2(Math.sin(e.face - Math.PI), Math.cos(e.face - Math.PI)));
  assert.ok(turned > 0 && turned <= ENEMIES.carapace.turnRate * DT + 1e-9);
});

test('굴절체: 멀면 은신(조준 안 됨), 가까우면 드러나 기습 돌진, 표식이면 원거리에서도 보인다', () => {
  const s = quiet();
  const e = put(s, 'refractor', 1500, 1000, { speed: 0 });
  step(s, {});
  assert.equal(e.hidden, true);
  assert.equal(pickTarget(s), null, '숨은 적은 노리지 않는다');
  e.mark = 1;
  step(s, {});
  assert.equal(e.hidden, false);
  assert.equal(pickTarget(s), e);

  const t = quiet();
  const r = put(t, 'refractor', 1150, 1000);
  idle(t, 3);
  assert.equal(r.hidden, false);
  assert.ok(t.events.some((ev) => ev.type === 'ambush') || r.mode === 'ambush' || r.ambushCd > 0);
});

test('공명체: 주변 아군에게 보호막, 보호막은 HP보다 먼저 깎이고, 제압되면 준 보호막이 사라진다', () => {
  const s = quiet();
  const r = put(s, 'resonator', 1500, 1000, { speed: 0 });
  const a = put(s, 'chaser', 1550, 1000, { speed: 0, hp: 100, maxHp: 100 });
  const far = put(s, 'chaser', 1500, 1500, { speed: 0 });
  idle(s, Math.ceil(ENEMIES.resonator.support.interval / DT) + 1);
  assert.ok(a.shield > 0 && !(far.shield > 0));
  const sh = a.shield;
  damageEnemy(s, a, sh - 1, false, 'trap');
  assert.ok(near(a.hp, 100), '보호막이 먼저');
  r.suppressed = 2;
  step(s, {});
  assert.equal(a.shield, 0, '제압 → 준 보호막 소멸');
});

test('산란체: 주기적으로 파편충 산란 (상한), 처치되면 자식도 사라진다, 제압 중엔 멈춘다', () => {
  const s = quiet();
  const sp = put(s, 'spawner', 1500, 1000, { speed: 0 });
  const br = ENEMIES.spawner.brood;
  idle(s, Math.ceil(br.interval / DT) + 1);
  const kids = () => s.enemies.filter((e) => e.parent === sp.id);
  assert.equal(kids().length, br.count);
  assert.ok(kids().every((k) => k.noCredit));
  for (const k of kids()) k.speed = 0;
  sp.suppressed = 100;
  idle(s, Math.ceil(br.interval / DT) * 2);
  assert.equal(kids().length, br.count, '제압 중 산란 정지');
  sp.hp = 0;
  step(s, {});
  step(s, {});
  assert.equal(kids().length, 0, '부모가 죽으면 자식 소멸');
});

test('과충전체: 가까우면 1초 뒤 폭발 — 플레이어 소량, 주변 적 대량, 과충전체 연쇄. 제압이면 안 터진다', () => {
  const s = quiet();
  s.player.invuln = 0;
  s.player.armor = 0;
  const f = ENEMIES.overcharger.fuse;
  const o = put(s, 'overcharger', 1060, 1000, { speed: 0 });
  const o2 = put(s, 'overcharger', 1140, 1000, { speed: 0 });
  const victim = put(s, 'chaser', 1000, 1060, { speed: 0, hp: 1000, maxHp: 1000, damage: 0 });
  const hp0 = s.player.hp;
  step(s, {});
  assert.equal(o.mode, 'fuse');
  idle(s, Math.ceil(f.time / DT) + 1);
  assert.ok(!s.enemies.includes(o) && !s.enemies.includes(o2), '본인·연쇄 모두 소멸');
  assert.ok(near(1000 - victim.hp, f.enemyDamage), '주변 적 피해');
  assert.ok(s.player.hp < hp0, '플레이어 피해');

  const t = quiet();
  const q = put(t, 'overcharger', 1060, 1000, { speed: 0 });
  q.suppressed = 100;
  idle(t, Math.ceil(f.time / DT) + 5);
  assert.ok(t.enemies.includes(q) && q.mode !== 'fuse');
});

test('제압: 돌진수는 돌진 못 하고, 방출체는 쏘지 못한다. 실명: 사격 정지', () => {
  const s = quiet();
  const c = put(s, 'charger', 1200, 1000);
  c.suppressed = 100;
  idle(s, 30);
  assert.equal(c.mode, 'move');
  const r = put(s, 'ranged', 1300, 1000, { speed: 0 });
  r.suppressed = 100;
  r.fireCd = 0;
  const b = put(s, 'ranged', 1000, 1300, { speed: 0 });
  b.blind = 100;
  b.fireCd = 0;
  idle(s, 120);
  assert.equal(s.enemyBullets.length, 0);
});

test('결정 군주: 호위 결정갑각 2기, 처치되면 재소환, 충격파는 예고 뒤 반경 피해', () => {
  const s = quiet();
  const L = put(s, 'lord', 1300, 1000, { speed: 0 });
  const es = ENEMIES.lord.escort;
  const escorts = () => s.enemies.filter((e) => e.leader === L.id && e.type === es.type);
  assert.equal(escorts().length, es.count);
  for (const e of escorts()) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), '호위 위치');
  escorts()[0].hp = 0;
  step(s, {});
  assert.equal(escorts().length, es.count - 1);
  for (const e of escorts()) e.speed = 0;
  idle(s, Math.ceil(es.respawn / DT) + 1);
  assert.equal(escorts().length, es.count);
  assert.ok(s.events.some((ev) => ev.type === 'shockTele') || L.shockT > 0);
  assert.equal(L.maxHp, ENEMIES.lord.hp, '고정 HP');
});

test('굴절 포식자: 분신 2기, 표식에 닿으면 분신 소멸 + 은신 해제, 맞으면 잠시 드러난다', () => {
  const s = quiet();
  const k = put(s, 'stalker', 1600, 1000, { speed: 0 });
  const clones = () => s.enemies.filter((e) => e.parent === k.id);
  assert.equal(clones().length, 2);
  for (const c of clones()) c.speed = 0;
  step(s, {});
  assert.ok(k.hidden);
  damageEnemy(s, k, 1, false, 'vandal');
  step(s, {});
  assert.equal(k.hidden, false, '피격 → 드러남');
  k.mark = 1;
  step(s, {});
  step(s, {});
  assert.equal(clones().length, 0, '표식 → 분신 소멸');
  assert.ok(k.revealT >= ENEMIES.stalker.stealth.markReveal - 0.1);
});

test('산란 모체: 자기 보호막, 제압되는 순간 취약', () => {
  const s = quiet();
  const b = put(s, 'brood', 1600, 1000, { speed: 0 });
  assert.equal(b.shield, ENEMIES.brood.selfShield.amount);
  b.suppressed = 1;
  step(s, {});
  assert.ok(b.vulnerable >= ENEMIES.brood.suppressVuln - 0.1);
});

test('보스: 2단계에 사이트마다 결정 기둥, 기둥이 있으면 받는 피해 -50%, 깨질 때마다 취약, 3단계 진입 무적', () => {
  const s = quiet();
  startRound(s, 9); // 헤이븐: 사이트 셋
  s.spawnAcc = -1e9;
  const B = put(s, 'boss', 1000, 600, { speed: 0 });
  B.fireCd = 1e9;
  B.hp = B.maxHp * 0.6;
  step(s, {});
  const pillars = s.enemies.filter((e) => e.type === 'pillar');
  assert.equal(pillars.length, ENEMIES.boss.pillars.count);
  assert.ok(near(dealt(s, B, 100, 'trap'), 100 * (1 - ENEMIES.boss.pillars.reduce)));
  pillars[0].hp = 0;
  step(s, {});
  assert.ok(B.vulnerable > 0);
  for (const p of pillars) p.hp = 0;
  step(s, {});
  step(s, {});
  B.vulnerable = 0;
  assert.ok(near(dealt(s, B, 100, 'trap'), 100));
  B.hp = B.maxHp * 0.3;
  step(s, {});
  assert.equal(B.phase, 2);
  assert.ok(near(dealt(s, B, 100, 'trap'), 0), '3단계 진입 무적');
});

test('자동 조준 우선순위: 가까운 과충전체 > 붙은 적 > 엘리트 > 공명체 > 산란체 > 가장 가까운 적', () => {
  const s = quiet();
  const c = put(s, 'chaser', 1250, 1000, { speed: 0 });
  assert.equal(pickTarget(s, c), c);
  const sp = put(s, 'spawner', 1300, 1000, { speed: 0 });
  assert.equal(pickTarget(s, c), sp);
  const r = put(s, 'resonator', 1350, 1000, { speed: 0 });
  assert.equal(pickTarget(s, c), r);
  const L = put(s, 'lord', 1500, 1000, { speed: 0 });
  assert.equal(pickTarget(s, c), L);
  const close = put(s, 'chaser', 1100, 1000, { speed: 0 });
  assert.equal(pickTarget(s, close), close, '바로 붙은 적이 먼저');
  const o = put(s, 'overcharger', 1080, 1000, { speed: 0, suppressed: 100 });
  assert.equal(pickTarget(s, close), o, '터지기 전에 과충전체');
});
