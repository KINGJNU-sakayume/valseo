// 적 데이터 (R=1 기준). HP 는 라운드 배율 h(R)이 곱해진다.

export const ENEMIES = {
  chaser: {
    name: '추격형',
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
    name: '돌격형',
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
    name: '원거리형',
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
};

// 12라운드 보스. 체력 비율에 따라 3단계 (ratio > until 인 첫 단계가 현재 단계).
export const BOSS = {
  name: '보스',
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
  phases: [
    {
      until: 0.66,
      speed: 60,
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
      summon: { interval: 6, type: 'chaser', count: 4, radius: 90 },
    },
  ],
};
ENEMIES.boss = BOSS;

export const ENEMY_BULLET = {
  lifetime: 4,
  maxBullets: 800,
};
