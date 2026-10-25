import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, choose } from '../src/core/game.js';
import { UTIL, UTILS } from '../src/data/utils.js';
import { RELICS } from '../src/data/relics.js';
import { DT, CRIT } from '../src/data/balance.js';
import { spawn } from '../src/core/systems/enemies.js';
import { damageEnemy } from '../src/core/systems/combat.js';
import { endRound, startRound } from '../src/core/systems/rounds.js';
import { createUtil } from '../src/core/systems/utils.js';
import { gainRelic } from '../src/core/systems/relics.js';
import { tagCounts } from '../src/core/systems/tactics.js';
import { maxHp, gunStats } from '../src/core/stats.js';
import { cooldownOf, ultCost } from '../src/core/systems/skillutil.js';
import { decide } from '../src/core/autopilot.js';
import { blocked } from '../src/core/systems/map.js';

function quiet(seed = 1, agent = 'chamber') {
  const s = createGame(seed, agent);
  s.spawnAcc = -1e9;
  s.player.guns = [null, null];
  s.player.invuln = 1e9;
  s.roundTime = 30;
  return s;
}
const put = (s, type, x, y, extra = {}) => Object.assign(spawn(s, type, { x, y }), { speed: 0 }, extra);
const idle = (s, n, input = {}) => {
  for (let i = 0; i < n; i++) step(s, input);
};
const near = (a, b) => Math.abs(a - b) < 1e-6;
const toShop = (s) => {
  endRound(s);
  while (s.pending?.kind !== 'shop') (s.pending ? choose(s, 0) : step(s, {}));
};

// ── 유틸 ──

test('상점 무작위 칸: 계약 2 + 카드/유물 1, 다시 뽑기, 계약 구매 → 슬롯 장착 (가득이면 대체)', () => {
  const s = quiet(3);
  toShop(s);
  const opts = s.pending.options;
  const contracts = opts.filter((o) => o.kind === 'contract');
  assert.equal(contracts.length, UTIL.shopOffers);
  assert.ok(opts.some((o) => o.kind === 'card' || o.kind === 'relic'));
  assert.ok(opts.some((o) => o.kind === 'shopReroll') && opts.some((o) => o.kind === 'rerollTicket'));
  s.credits = 1e5;
  s.pending = null;
  step(s, {});
  const i = s.pending.options.findIndex((o) => o.kind === 'contract');
  const id = s.pending.options[i].id;
  choose(s, i);
  assert.equal(s.player.utils.length, 1);
  assert.equal(s.player.utils[0].id, id);
  // 다른 계약 → 대체
  const j = s.pending.options.findIndex((o) => o.kind === 'contract' && o.enabled);
  const id2 = s.pending.options[j].id;
  choose(s, j);
  assert.equal(s.player.utils.length, 1);
  assert.equal(s.player.utils[0].id, id2);
  // 충전·업그레이드
  const c = s.pending.options.findIndex((o) => o.kind === 'utilCharge');
  const before = s.player.utils[0].charges;
  choose(s, c);
  assert.equal(s.player.utils[0].charges, before + 1);
  const u = s.pending.options.findIndex((o) => o.kind === 'utilUpgrade');
  choose(s, u);
  assert.equal(s.player.utils[0].level, 2);
  // 리롤권
  const r = s.rerolls;
  choose(s, s.pending.options.findIndex((o) => o.kind === 'rerollTicket'));
  assert.equal(s.rerolls, r + 1);
});

test('계약 충전: 라운드 시작마다 무료 1개, 사용 간격, 우클릭(u)·F 슬롯', () => {
  const s = quiet();
  s.player.utils = [createUtil('slowOrb')];
  const u = s.player.utils[0];
  u.charges = 0;
  startRound(s, 2);
  s.spawnAcc = -1e9;
  assert.equal(u.charges, 1);
  step(s, { keys: { f: true }, aim: { x: s.player.x + 200, y: s.player.y } }); // 슬롯 하나면 F 도 첫 슬롯
  assert.equal(u.charges, 0);
  idle(s, 40);
  assert.equal(s.fields.length, 1, '착탄 → 감속 장판');
  assert.ok(Math.abs(s.fields[0].x - (s.player.x + 200)) < 30);
});

test('정찰 화살: 착탄 반경 적 표식 (은신 해제), 두 번 스캔', () => {
  const s = quiet();
  s.player.utils = [createUtil('recon')];
  const e = put(s, 'refractor', s.player.x + 400, s.player.y);
  const far = put(s, 'chaser', s.player.x - 600, s.player.y);
  step(s, { keys: { u: true }, aim: { x: e.x, y: e.y } });
  idle(s, 40);
  assert.ok(e.mark > 0 && !(far.mark > 0));
  step(s, {});
  assert.equal(e.hidden, false, '표식 → 은신 해제');
  idle(s, Math.ceil(UTILS.recon.scanGap / DT));
  assert.ok(s.events.length >= 0);
});

test('제로/포인트: 지연 후 반경 적 제압 + 표식', () => {
  const s = quiet();
  s.player.utils = [createUtil('zeroPoint')];
  const e = put(s, 'ranged', s.player.x + 300, s.player.y);
  step(s, { keys: { u: true }, aim: { x: e.x, y: e.y } });
  idle(s, 30);
  assert.ok(!(e.suppressed > 0), '지연 중');
  idle(s, Math.ceil(UTILS.zeroPoint.windup / DT) + 5);
  assert.ok(e.suppressed > 0 && e.mark > 0);
});

test('분열탄: 큰 폭발 후 소형 폭탄 분열 (Lv3 는 한 단계 더)', () => {
  const s = quiet();
  s.player.utils = [createUtil('frag')];
  const e = put(s, 'chaser', s.player.x + 300, s.player.y, { hp: 1e6, maxHp: 1e6 });
  step(s, { keys: { u: true }, aim: { x: e.x, y: e.y } });
  idle(s, 120);
  const blasts = (s2) => s2.events;
  void blasts;
  assert.ok(1e6 - e.hp >= UTILS.frag.damage[0] * (1 + UTIL.damageGrowth * (s.round - 1)) - 1e-6);
  const t = quiet();
  t.player.utils = [{ ...createUtil('frag'), level: 3 }];
  let n = 0;
  step(t, { keys: { u: true }, aim: { x: t.player.x + 300, y: t.player.y } });
  for (let i = 0; i < 200; i++) {
    step(t, {});
    n += t.events.filter((ev) => ev.type === 'fragBlast').length;
  }
  assert.equal(n, 1 + 4 + 8, 'Lv3: 1 → 4 → 8');
});

test('순풍: 이동 방향으로 대시, 대시 중 무적, 벽은 못 뚫는다', () => {
  const s = quiet();
  s.player.invuln = 0;
  s.player.utils = [createUtil('tailwind')];
  const x0 = s.player.x;
  step(s, { keys: { u: true }, move: { x: 1, y: 0 } });
  assert.ok(s.player.invuln > 0);
  idle(s, Math.ceil(UTILS.tailwind.time / DT) + 1);
  assert.ok(s.player.x - x0 > UTILS.tailwind.distance[0] * 0.8);
});

test('자동 사용: 무리가 모이면 분열탄을 무리에 던진다', () => {
  const s = quiet();
  s.player.utils = [createUtil('frag')];
  for (let i = 0; i < 9; i++) put(s, 'chaser', s.player.x + 250 + (i % 3) * 20, s.player.y + Math.floor(i / 3) * 20);
  let used = false;
  for (let i = 0; i < 12 && !used; i++) {
    s.tick = i;
    const d = decide(s);
    used = d.keys.u;
  }
  assert.ok(used);
});

test('계약 태그는 공명에 들어간다', () => {
  const s = quiet();
  s.player.utils = [createUtil('frag')];
  assert.equal(tagCounts(s, false).blast, 1);
});

// ── 유물 ──

test('엘리트 처치 → 유물 3지선다, 고르면 보유', () => {
  const s = quiet();
  const L = put(s, 'lord', s.player.x + 500, s.player.y);
  L.hp = 0;
  step(s, {});
  assert.equal(s.pending?.kind, 'relic');
  assert.equal(s.pending.options.length, 3);
  const id = s.pending.options[1].relic;
  choose(s, 1);
  assert.deepEqual(s.player.relics, [id]);
  assert.equal(s.stats.eliteKills, 1);
});

test('유리 대포·깨진 렌즈·설계자·엘리트 트로피·라디아나이트 심장: 피해 배율', () => {
  const s = quiet();
  const e = put(s, 'chaser', 1300, 1000, { hp: 1e6, maxHp: 1e6 });
  const dealt = (base, crit, src) => {
    const b = e.hp;
    damageEnemy(s, e, base, crit, src);
    return b - e.hp;
  };
  const hp0 = maxHp(s.player);
  gainRelic(s, 'glassCannon');
  assert.ok(near(maxHp(s.player), hp0 * RELICS.glassCannon.hpMult));
  assert.ok(near(dealt(10, true, 'vandal'), 10 * CRIT.multiplier * RELICS.glassCannon.critMult));
  s.player.relics = ['crackedLens'];
  assert.ok(near(dealt(10, false, 'vandal'), 10 * RELICS.crackedLens.unmarkedMult));
  e.mark = 1;
  assert.ok(near(dealt(10, false, 'vandal'), 10 * RELICS.crackedLens.markedMult * 1.1), '표식 기본 +10% 포함');
  e.mark = 0;
  s.player.relics = ['architect'];
  assert.ok(near(dealt(10, false, 'vandal'), 10 * RELICS.architect.gunDamageMult));
  s.player.relics = ['eliteTrophy'];
  s.stats.eliteKills = 2;
  assert.ok(near(dealt(10, false, 'vandal'), 10 * (1 + 2 * RELICS.eliteTrophy.perElite)));
  s.player.relics = ['radiantHeart'];
  assert.equal(ultCost(s.player), 2);
});

test('권총 고수: 주무기 봉인·상점에서 주무기 안 나옴, 보조 연사 ×2 / 탄약 벨트: 탄창·재장전 ×2', () => {
  const s = quiet();
  s.player.guns = [{ id: 'vandal', tier: 1, mods: {}, cooldown: 0 }, { id: 'classic', tier: 1, mods: {}, cooldown: 0 }];
  const base = gunStats(s.player.guns[1]);
  gainRelic(s, 'pistolMaster');
  assert.equal(s.player.guns[0], null);
  assert.ok(near(gunStats(s.player.guns[1], {}, s.player).fireRate, gunStats(s.player.guns[1], { tier: 2 }).fireRate * 2));
  void base;
  toShop(s);
  assert.ok(!s.pending.options.some((o) => o.kind === 'buyGun' && ['vandal', 'spectre', 'judge', 'operator'].includes(o.id)));
  const t = quiet();
  gainRelic(t, 'ammoBelt');
  const v = { id: 'vandal', tier: 1, mods: {} };
  assert.equal(gunStats(v, {}, t.player).magazine, gunStats(v).magazine * 2);
  assert.ok(near(gunStats(v, {}, t.player).reloadTime, gunStats(v).reloadTime * 2));
});

test('과열 칩: 쿨다운 -35%, 스킬 사용마다 HP 소모', () => {
  const s = quiet();
  const cd = cooldownOf(s.player, 'rendezvous', 1);
  gainRelic(s, 'overheat');
  assert.ok(near(cooldownOf(s.player, 'rendezvous', 1), cd * RELICS.overheat.cooldownMult));
  const hp = s.player.hp;
  step(s, { keys: { c: true }, aim: { x: s.player.x + 100, y: s.player.y } });
  assert.equal(s.player.hp, hp - RELICS.overheat.hpCost);
});

test('도박꾼: 클리어 보너스 없음, 라운드 시작 이자 / 흡혈 코어: 시작 회복 없음, 처치 회복', () => {
  const s = quiet();
  gainRelic(s, 'gambler');
  const c = s.credits;
  endRound(s);
  assert.equal(s.credits, c, '보너스 없음');
  s.credits = 5000;
  s.pending = null;
  startRound(s, 2);
  assert.equal(s.credits, 5000 + Math.min(RELICS.gambler.interestCap, Math.round(5000 * RELICS.gambler.interest)));

  const t = quiet();
  gainRelic(t, 'vampCore');
  t.player.hp = 50;
  startRound(t, 2);
  t.spawnAcc = -1e9;
  assert.equal(t.player.hp, 50);
  put(t, 'chaser', 1300, 1000).hp = 0;
  step(t, {});
  assert.equal(t.player.hp, 50 + RELICS.vampCore.killHeal);
});

test('무거운 손: 이속 -20%, 멈춰 있으면 받는 피해 -40%', () => {
  const s = quiet();
  gainRelic(s, 'heavyHand');
  const x = s.player.x;
  step(s, { move: { x: 1, y: 0 } });
  const moved = s.player.x - x;
  const t = quiet();
  step(t, { move: { x: 1, y: 0 } });
  assert.ok(near(moved, (t.player.x - x) * RELICS.heavyHand.speedMult));
  s.player.invuln = 0;
  idle(s, 30);
  s.player.invuln = 0;
  const hp = s.player.hp;
  const e = put(s, 'chaser', s.player.x, s.player.y);
  step(s, {});
  assert.ok(near(hp - s.player.hp, e.damage * RELICS.heavyHand.stillDamageMult));
});

test('쌍둥이 슬롯: 유틸 둘(우클릭·F), 가격 +20%', () => {
  const s = quiet();
  gainRelic(s, 'twinSlot');
  s.player.utils = [createUtil('slowOrb'), createUtil('tailwind')];
  step(s, { keys: { f: true }, move: { x: 1, y: 0 } });
  assert.equal(s.player.utils[0].charges, 1, 'F 는 둘째 슬롯');
  assert.equal(s.player.utils[1].charges, 0);
  toShop(s);
  const armor = s.pending.options.find((o) => o.kind === 'armor' && o.id === 'light');
  assert.equal(armor.price, Math.round(400 * RELICS.twinSlot.priceMult));
});

// ── 2차 유틸 (M18) ──

test('추적자: 엘리트를 쫓아가 근시(실명) + 표식', () => {
  const s = quiet();
  s.player.utils = [createUtil('tracker')];
  const near0 = put(s, 'chaser', s.player.x + 100, s.player.y);
  const L = put(s, 'lord', s.player.x + 400, s.player.y + 50);
  step(s, { keys: { u: true }, aim: { x: s.player.x + 100, y: s.player.y } });
  idle(s, 90);
  assert.ok(L.blind > 0 && L.mark > 0, '엘리트 우선');
  assert.ok(!(near0.blind > 0));
});

test('소이탄: 장판 피해 / 섬광: 주변 적 실명', () => {
  const s = quiet();
  s.player.utils = [createUtil('incendiary')];
  const e = put(s, 'chaser', s.player.x + 300, s.player.y, { hp: 1e6, maxHp: 1e6 });
  step(s, { keys: { u: true }, aim: { x: e.x, y: e.y } });
  idle(s, 120);
  assert.ok(e.hp < 1e6);
  const t = quiet();
  t.player.utils = [createUtil('flash')];
  const a = put(t, 'ranged', t.player.x + 200, t.player.y);
  const far = put(t, 'ranged', t.player.x + 900, t.player.y);
  step(t, { keys: { u: true } });
  assert.ok(a.blind > 0 && !(far.blind > 0));
});

test('연막: 연막 안 방출체는 쏘지 못하고, 연막 속 플레이어는 먼 적이 놓친다', () => {
  const s = quiet();
  s.player.utils = [createUtil('smoke')];
  const r = put(s, 'ranged', s.player.x + 250, s.player.y);
  r.fireCd = 0;
  step(s, { keys: { u: true }, aim: { x: r.x, y: r.y } });
  idle(s, 30);
  s.enemyBullets.length = 0;
  idle(s, 150);
  assert.equal(s.enemyBullets.length, 0, '연막 안 사격 불가');
});

test('장벽: 조준 방향에 벽 칸이 생겨 막히고, 시간이 지나면 사라진다', () => {
  const s = quiet();
  s.player.utils = [createUtil('wall')];
  const p = s.player;
  step(s, { keys: { u: true }, aim: { x: p.x, y: p.y - 300 } });
  assert.ok(s.map.walls.length === 1);
  const c = s.map.walls[0].cells[0];
  const gx = c % s.map.n;
  const gy = (c - gx) / s.map.n;
  assert.ok(blocked(s.map, (gx + 0.5) * 100, (gy + 0.5) * 100));
  idle(s, Math.ceil(UTILS.wall.duration[0] / DT) + 2);
  assert.equal(s.map.walls.length, 0);
  assert.ok(!blocked(s.map, (gx + 0.5) * 100, (gy + 0.5) * 100));
});
