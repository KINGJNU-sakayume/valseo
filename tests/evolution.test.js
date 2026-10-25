import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, choose } from '../src/core/game.js';
import { SKILLS, BRANCH_LEVEL, ULT } from '../src/data/skills.js';
import { GUNS, TIERS } from '../src/data/guns.js';
import { CRIT, DT } from '../src/data/balance.js';
import { skillValue, qMagazine } from '../src/core/systems/skills.js';
import { addField, fieldSlow } from '../src/core/systems/fields.js';
import { createGunSlot } from '../src/core/state.js';
import { endRound } from '../src/core/systems/rounds.js';
import { shopOptions } from '../src/core/systems/economy.js';

function quiet(seed = 1) {
  const s = createGame(seed);
  s.spawnAcc = -1e9;
  s.player.guns = [null, null];
  return s;
}
function enemy(s, x, y, hp = 1e6, speed = 0) {
  const e = { id: s.nextId++, type: 'chaser', x, y, r: 12, hp, maxHp: hp, speed, damage: 0, mode: 'move', t: 0, dirX: 0, dirY: 0, fireCd: 0 };
  s.enemies.push(e);
  return e;
}
const idle = (s, n, input = {}) => {
  for (let i = 0; i < n; i++) step(s, input);
};
const press = (k, extra = {}) => ({ keys: { [k]: true }, ...extra });
/** 스킬을 분기 레벨로 올리고 분기를 고른다. */
function withBranch(s, key, branch) {
  s.player.skills[key].level = BRANCH_LEVEL;
  s.player.skills[key].branch = branch;
}

test('형태 증강 레벨 스킬 카드 → 형태 선택(풀에서 3개)이 레벨업보다 먼저 뜨고 기록된다', () => {
  const s = quiet();
  s.player.skills.c.level = BRANCH_LEVEL - 1;
  s.pending = { kind: 'levelup', options: [{ type: 'skill', key: 'c' }] };
  s.levelUpsQueued = 2;
  choose(s, 0);
  assert.equal(s.pending.kind, 'branch');
  assert.equal(s.pending.key, 'c');
  const ids = s.pending.options.map((o) => o.branch);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
  for (const id of ids) assert.ok(SKILLS.trademark.branches[id], id);
  choose(s, 1);
  assert.equal(s.player.skills.c.branch, ids[1]);
  assert.equal(s.pending.kind, 'levelup', '남은 레벨업이 이어진다');
});

test('C-A 폭발형: 발동 시 폭발 피해(집중포화 크리), 필드 지속 절반', () => {
  const s = quiet();
  withBranch(s, 'c', 'A');
  const p = s.player;
  const e = enemy(s, p.x + 200, p.y);
  step(s, press('c', { aim: { x: e.x, y: e.y } }));
  idle(s, Math.ceil(SKILLS.trademark.armTime / DT) + 1);
  assert.equal(s.fields.length, 1);
  const dmg = SKILLS.trademark.branches.A.blastDamage[BRANCH_LEVEL - 1] * CRIT.multiplier;
  assert.ok(Math.abs(e.maxHp - e.hp - dmg) < 1e-6, `dmg=${e.maxHp - e.hp}`);
  assert.equal(s.fields[0].maxLife, skillValue('trademark', 'fieldDuration', BRANCH_LEVEL) * 0.5);
});

test('C-B 장기형: 지속·반경 배율, 겹친 필드는 감속이 곱으로 누적', () => {
  const s = quiet();
  addField(s, 0, 0, 100, 10, 0.5, true);
  addField(s, 0, 0, 100, 10, 0.5, true);
  assert.equal(fieldSlow(s, 0, 0), 0.75);
  addField(s, 0, 0, 100, 10, 0.6); // 일반 필드는 최대값만
  addField(s, 0, 0, 100, 10, 0.4);
  assert.ok(Math.abs(fieldSlow(s, 0, 0) - (1 - 0.4 * 0.25)) < 1e-12);

  const t = quiet();
  withBranch(t, 'c', 'B');
  enemy(t, t.player.x + 200, t.player.y);
  step(t, press('c', { aim: { x: t.player.x + 200, y: t.player.y } }));
  idle(t, Math.ceil(SKILLS.trademark.armTime / DT) + 1);
  const B = SKILLS.trademark.branches.B;
  assert.equal(t.fields[0].maxLife, skillValue('trademark', 'fieldDuration', BRANCH_LEVEL) * B.durationMult);
  assert.equal(t.fields[0].r, skillValue('trademark', 'fieldRadius', BRANCH_LEVEL) * B.radiusMult);
  assert.equal(t.fields[0].stack, true);
});

test('E-A 충격파: 출발·도착 지점 주변 적에게 피해', () => {
  const s = quiet();
  withBranch(s, 'e', 'A');
  const p = s.player;
  const atAnchor = enemy(s, p.x + 50, p.y);
  step(s, press('e'));
  p.x += 600;
  const atFrom = enemy(s, p.x + 50, p.y);
  const far = enemy(s, p.x + 300, p.y + 300);
  step(s, press('e'));
  const dmg = SKILLS.rendezvous.branches.A.shockDamage[BRANCH_LEVEL - 1];
  assert.equal(atAnchor.maxHp - atAnchor.hp, dmg);
  assert.equal(atFrom.maxHp - atFrom.hp, dmg);
  assert.equal(far.hp, far.maxHp);
});

test('E-B 안전 귀환: 귀환 후 무적 + 헤드헌터 탄창 가득', () => {
  const s = quiet();
  withBranch(s, 'e', 'B');
  s.player.skills.q.level = 1;
  s.player.skills.q.ammo = 0;
  step(s, press('e'));
  step(s, press('e'));
  assert.ok(s.player.invuln >= SKILLS.rendezvous.branches.B.invuln - DT * 2);
  assert.equal(s.player.skills.q.ammo, qMagazine(s.player));
});

test('Q-A 연쇄 헤드샷: 명중마다 피해 스택, Q를 떼면 초기화', () => {
  const s = quiet();
  withBranch(s, 'q', 'A');
  const p = s.player;
  enemy(s, p.x + 150, p.y);
  const input = { keys: { q: true }, aim: { x: p.x + 1000, y: p.y } };
  const pistolHits = [];
  for (let i = 0; i < 60 * 3; i++) {
    step(s, input);
    for (const ev of s.events) if (ev.type === 'hit' && ev.source === 'headhunter') pistolHits.push(ev.damage);
  }
  assert.ok(pistolHits.length >= 3);
  assert.ok(pistolHits[2] > pistolHits[0], `${pistolHits}`);
  assert.ok(p.skills.q.chain > 0);
  step(s, {});
  assert.equal(p.skills.q.chain, 0);
});

test('Q-B 관통 탄창: 관통·탄창 증가', () => {
  const s = quiet();
  withBranch(s, 'q', 'B');
  assert.equal(qMagazine(s.player), SKILLS.headhunter.branches.B.magazine);
  step(s, { keys: { q: true }, aim: { x: s.player.x + 100, y: s.player.y } });
  assert.equal(s.bullets[0].pierce, SKILLS.headhunter.pierce + SKILLS.headhunter.branches.B.pierceBonus);
});

test('X-A 2발 장전: 오브 한 번으로 두 발, 두 번째는 시간 제한', () => {
  const s = quiet();
  withBranch(s, 'x', 'A');
  s.ultOrbs = ULT.orbsNeeded;
  const shots = () => s.events.filter((e) => e.type === 'ult').length;
  step(s, press('x'));
  assert.equal(shots(), 1);
  assert.equal(s.ultOrbs, 0);
  step(s, press('x'));
  assert.equal(shots(), 1, '두 번째 발');
  step(s, press('x'));
  assert.equal(shots(), 0, '다 썼다');

  s.ultOrbs = ULT.orbsNeeded;
  step(s, press('x'));
  idle(s, Math.ceil(SKILLS.tourDeForce.branches.A.secondWindow / DT) + 1);
  step(s, press('x'));
  assert.equal(shots(), 0, '시간 초과로 두 번째 발 소멸');
});

test('X-B 대폭발: 처치 폭발 반경 3배', () => {
  const s = quiet();
  withBranch(s, 'x', 'B');
  s.ultOrbs = ULT.orbsNeeded;
  enemy(s, s.player.x + 200, s.player.y, 1);
  step(s, press('x', { aim: { x: s.player.x + 1000, y: s.player.y } }));
  assert.equal(s.fields[0].r, SKILLS.tourDeForce.killFieldRadius * 3);
});

/** 공명용 태그 4개를 모은다: 장판 (전술 1 + 태그 패시브 1 + 형태 1 + 숙련 1). */
function zoneResonance(s) {
  s.player.tactics.chainReaction = true;
  s.player.passives.zoneDamage = 1;
  s.player.skills.c.level = 5;
  s.player.skills.c.branch = 'B';
  s.player.skills.c.mastery = 'killZone';
}

test('태그 공명 진화: 티어 3 구매 순간 즉시 진화 (경로 하나), 공명 전에는 진화 없음', () => {
  const s = createGame(3);
  s.player.guns[1].tier = 2;
  endRound(s);
  while (s.pending?.kind !== 'shop') (s.pending ? choose(s, 0) : step(s, {}));
  s.credits = 1e6;
  s.pending = { kind: 'shop', options: shopOptions(s) };
  let i = s.pending.options.findIndex((o) => o.kind === 'tierUp' && o.slot === 1);
  assert.ok(s.pending.options[i].desc.includes('진화'));
  choose(s, i);
  assert.equal(s.player.guns[1].evolved, false, '공명 없으면 티어 3이어도 진화하지 않는다');

  zoneResonance(s);
  s.pending = { kind: 'shop', options: shopOptions(s) };
  i = s.pending.options.findIndex((o) => o.kind === 'next');
  choose(s, i);
  assert.equal(s.player.guns[1].evolved, 'zone');
});

test('태그 공명 진화: 경로가 둘 이상 열리면 선택', () => {
  const s = quiet();
  s.player.guns = [null, { ...createGunSlot('classic'), tier: TIERS.max }];
  zoneResonance(s);
  // 폭발 4개: 폭발 연쇄 + 폭발 피해 + 형태 A 대신 숙련으로는 부족 → 쿨다운 순환(폭발) + 랑데부 충격파(폭발)
  s.player.tactics.blastChain = true;
  s.player.tactics.cdCycle = true;
  s.player.passives.blastDamage = 1;
  s.player.skills.e.level = 2;
  s.player.skills.e.branch = 'A';
  s.levelUpsQueued = 0;
  s.pending = { kind: 'levelup', options: [{ type: 'heal' }] };
  s.levelUpsQueued = 1;
  choose(s, 0);
  assert.equal(s.pending.kind, 'evolve');
  const routes = s.pending.options.map((o) => o.route);
  assert.deepEqual(routes.sort(), ['blast', 'zone']);
  const pick = s.pending.options.findIndex((o) => o.route === 'blast');
  choose(s, pick);
  assert.equal(s.player.guns[1].evolved, 'blast');
});

test('삼연격 클래식: 조준점이 필드 안이면 3발, 아니면 1발', () => {
  const s = quiet();
  const p = s.player;
  s.player.guns = [null, { ...createGunSlot('classic'), evolved: 'zone', tier: 3 }];
  const aim = { x: p.x + 300, y: p.y };
  step(s, { aim });
  assert.equal(s.bullets.length, 1);
  s.bullets.length = 0;
  addField(s, aim.x, aim.y, 80, 100, 0.5);
  const burst = GUNS.classic.evolutions.zone.burst;
  idle(s, Math.ceil(60 / GUNS.classic.fireRate) + 1, { aim });
  assert.equal(s.bullets.length % burst, 0);
  assert.ok(s.bullets.length >= burst);
});

test('집행자 셰리프: 크리 6연속 명중 시 즉시 재장전, 비크리면 초기화', () => {
  const s = quiet();
  const p = s.player;
  p.guns = [null, { ...createGunSlot('sheriff'), evolved: 'crit', tier: 3 }];
  const slot = p.guns[1];
  const e = enemy(s, p.x + 120, p.y);
  const aim = { x: e.x + 100, y: e.y }; // 조준점은 적 뒤 (헤드샷 아님)
  addField(s, e.x, e.y, 60, 1e9, 0.1); // 필드 안 → 모든 명중 크리
  let procs = 0;
  for (let i = 0; i < 60 * 8; i++) {
    step(s, { aim });
    procs += s.events.filter((ev) => ev.type === 'evoProc').length;
  }
  assert.ok(procs >= 1, `procs=${procs}`);

  slot.critStreak = 4;
  s.fields.length = 0;
  slot.mods = {};
  const before = slot.critStreak;
  for (let i = 0; i < 60 * 10 && slot.critStreak >= before; i++) step(s, { aim });
  assert.ok(slot.critStreak < before);
});

test('급습 밴달: 귀환 후 버프 시간 동안 연사 +50%', () => {
  const s = quiet();
  const p = s.player;
  p.skills.e.level = 1;
  p.guns = [{ ...createGunSlot('vandal'), evolved: 'mobility', tier: 3 }, null];
  const count = (ticks) => {
    p.guns[0].ammo = GUNS.vandal.magazine;
    p.guns[0].reload = 0;
    let n = 0;
    for (let i = 0; i < ticks; i++) {
      step(s, { aim: { x: p.x + 500, y: p.y } });
      n += s.events.filter((ev) => ev.type === 'shot').length;
    }
    return n;
  };
  const base = count(60);
  step(s, press('e'));
  step(s, press('e'));
  const buffed = count(60);
  assert.ok(buffed > base * 1.3, `base=${base} buffed=${buffed}`);
});

test('라운드 종료 시 분기 상태(연쇄 스택, 두 번째 발) 정리', () => {
  const s = quiet();
  withBranch(s, 'q', 'A');
  withBranch(s, 'x', 'A');
  s.player.skills.q.chain = 3;
  s.player.skills.x.extra = 1;
  endRound(s);
  assert.equal(s.player.skills.q.chain, 0);
  assert.equal(s.player.skills.x.extra, 0);
});
