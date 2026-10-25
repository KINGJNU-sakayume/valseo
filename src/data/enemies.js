// 적 데이터 (R=1 기준). HP 는 라운드 배율 h(R)이 곱해진다 (fixedHp 는 그대로).
// 테마: 라디아나이트 변이체 (설계 v0.2 13장). 이름은 이곳에만 둔다.
// 능력은 전부 제압(suppressed)으로 꺼진다: 돌진·사격·껍질·은신·보호막·산란·자폭.

const ARC60 = Math.PI / 3;

export const ENEMIES = {
  chaser: {
    name: '파편충',
    ai: 'chase',
    hp: 20,
    speed: 90,
    contactDamage: 8,
    cost: 1,
    radius: 12,
    xp: 1,
    credits: 10,
  },
  charger: {
    name: '돌진수',
    ai: 'charge',
    hp: 45,
    speed: 70,
    contactDamage: 15,
    cost: 3,
    radius: 15,
    xp: 2,
    credits: 15,
    dashTriggerRange: 320, // 이 거리 안이면 돌진 준비
    telegraph: 0.8, // 예고선 시간
    dashSpeed: 380,
    dashDuration: 0.7,
    recover: 1.5, // 돌진 후 다시 돌진하기까지
  },
  ranged: {
    name: '방출체',
    ai: 'ranged',
    hp: 25,
    speed: 80,
    contactDamage: 8,
    cost: 3,
    radius: 13,
    xp: 2,
    credits: 20,
    keepDistance: 320,
    distanceBand: 40, // keepDistance ± band 안이면 제자리
    fireInterval: 2,
    shot: { damage: 10, speed: 260, radius: 6, count: 1, spread: 0 },
  },
  elite: {
    name: '엘리트',
    elite: true,
    ai: 'ranged',
    hp: 800,
    speed: 50,
    contactDamage: 20,
    cost: 0, // 예산과 무관하게 엘리트 라운드에 고정 등장
    radius: 28,
    xp: 30,
    credits: 150,
    ultOrb: 1, // 처치 시 궁극기 오브 확정
    keepDistance: 0, // 느린 추격
    distanceBand: 0,
    fireInterval: 1.5,
    shot: { damage: 12, speed: 240, radius: 8, count: 3, spread: 0.35 }, // 3방향 부채꼴 (rad)
  },

  // ── 변이체 (v0.2.1) ──
  carapace: {
    name: '결정갑각',
    ai: 'chase',
    hp: 70,
    speed: 65,
    contactDamage: 12,
    cost: 4,
    radius: 16,
    xp: 3,
    credits: 25,
    turnRate: 1.2, // 껍질 방향 회전 속도 (rad/s) — 돌아 들어가면 측면
    shell: { arc: ARC60, reduce: 0.5, breakBlast: 60, breakTime: 6 },
  },
  refractor: {
    name: '굴절체',
    ai: 'stealth',
    hp: 30,
    speed: 110,
    contactDamage: 10,
    cost: 4,
    radius: 12,
    xp: 3,
    credits: 25,
    stealth: { reveal: 160, ambushSpeed: 260, ambushTime: 0.5, ambushCd: 2.5 },
  },
  resonator: {
    name: '공명체',
    ai: 'support',
    hp: 40,
    speed: 70,
    contactDamage: 6,
    cost: 5,
    radius: 13,
    xp: 4,
    credits: 30,
    keepDistance: 380,
    distanceBand: 40,
    support: { interval: 4, radius: 200, max: 6, shield: 30 },
  },
  spawner: {
    name: '산란체',
    ai: 'chase',
    hp: 120,
    speed: 45,
    contactDamage: 12,
    cost: 8,
    radius: 20,
    xp: 6,
    credits: 40,
    brood: { interval: 4, count: 3, max: 9, type: 'chaser' },
  },
  overcharger: {
    name: '과충전체',
    ai: 'fuse',
    hp: 25,
    speed: 120,
    contactDamage: 6,
    cost: 3,
    radius: 11,
    xp: 2,
    credits: 15,
    fuse: { trigger: 80, time: 1, radius: 90, playerDamage: 20, enemyDamage: 60 },
  },

  // ── 막 엘리트 (고정 HP, 보스급) ──
  lord: {
    name: '결정 군주',
    elite: true,
    fixedHp: true,
    ai: 'chase',
    hp: 900,
    speed: 50,
    contactDamage: 15,
    cost: 0,
    radius: 30,
    xp: 30,
    credits: 150,
    ultOrb: 1,
    turnRate: 0.9,
    shell: { arc: ARC60, reduce: 0.5, breakBlast: 150, breakTime: 8 },
    shock: { interval: 3, telegraph: 0.7, radius: 260, damage: 12 },
    escort: { type: 'carapace', count: 2, respawn: 15 },
  },
  stalker: {
    name: '굴절 포식자',
    elite: true,
    fixedHp: true,
    ai: 'stealth',
    hp: 1300,
    speed: 85,
    contactDamage: 20,
    cost: 0,
    radius: 24,
    xp: 30,
    credits: 150,
    ultOrb: 1,
    stealth: { reveal: 160, ambushSpeed: 420, ambushTime: 0.6, ambushCd: 3, rehide: 3, markReveal: 5 },
    clones: { count: 2, type: 'stalkerClone' },
  },
  stalkerClone: {
    name: '굴절 포식자',
    clone: true,
    fixedHp: true,
    ai: 'stealth',
    hp: 1,
    speed: 85,
    contactDamage: 0,
    cost: 0,
    radius: 24,
    xp: 0,
    credits: 0,
    stealth: { reveal: 160, ambushSpeed: 420, ambushTime: 0.6, ambushCd: 3 },
  },
  brood: {
    name: '산란 모체',
    elite: true,
    fixedHp: true,
    ai: 'chase',
    hp: 1800,
    speed: 25,
    contactDamage: 20,
    cost: 0,
    radius: 34,
    xp: 30,
    credits: 150,
    ultOrb: 1,
    brood: { interval: 3, count: 4, max: 16, type: 'chaser' },
    selfShield: { amount: 100, interval: 6 },
    escort: { type: 'resonator', count: 2, respawn: 12 },
    suppressVuln: 4, // 제압되는 순간 취약
  },
  pillar: {
    name: '결정 기둥',
    fixedHp: true,
    ai: 'pillar',
    hp: 300,
    speed: 0,
    contactDamage: 0,
    cost: 0,
    radius: 26,
    xp: 3,
    credits: 0,
  },
};

// 12라운드 보스. 체력 비율에 따라 3단계 (ratio > until 인 첫 단계가 현재 단계).
export const BOSS = {
  name: '거대 변이체',
  ai: 'boss',
  hp: 4000, // 라운드 배율 미적용 (설계 초기값 6000 → M9 밸런스: greedy 봇 기준)
  speed: 60,
  contactDamage: 25,
  cost: 0,
  radius: 44,
  xp: 0,
  credits: 0,
  slowResist: 0.5, // 감속 효과 절반만 받음
  enrageTime: 150, // 등장 후 이 시간이 지나면 격노: 사격 간격 절반
  enrageFireMult: 0.5,
  turnRate: 0.9,
  suppressSlow: 0.5, // 제압: 패턴 간격 ×2 (타이머가 절반 속도)
  pillars: { count: 3, reduce: 0.5, vuln: 5 }, // 2단계 진입 시 사이트마다 결정 기둥, 남아 있으면 받는 피해 -50%, 깨질 때마다 5초 취약
  phaseInvuln: 2, // 3단계 진입 시 무적
  phases: [
    {
      until: 0.66,
      speed: 60,
      shell: { arc: Math.PI / 3, reduce: 0.4 },
      radial: { interval: 2.5, count: 14, damage: 10, speed: 220, radius: 8 },
    },
    {
      until: 0.33,
      speed: 75,
      radial: { interval: 3, count: 18, damage: 10, speed: 240, radius: 8 },
      dash: { interval: 5, telegraph: 1.0, speed: 520, duration: 0.6 },
    },
    {
      until: 0,
      speed: 85,
      spiral: { interval: 0.14, arms: 3, turn: 0.3, damage: 8, speed: 200, radius: 7 },
      summon: { interval: 8, type: 'spawner', count: 1, radius: 90, max: 3 },
    },
  ],
};
ENEMIES.boss = BOSS;

export const ENEMY_BULLET = {
  lifetime: 4,
  maxBullets: 800,
};

/** 엘리트(막 엘리트 포함). 보스는 아님. */
export const isElite = (e) => !!ENEMIES[e.type]?.elite;
/** 엘리트 또는 보스. */
export const isBig = (e) => e.type === 'boss' || !!ENEMIES[e.type]?.elite;
