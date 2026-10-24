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

export const ENEMY_BULLET = {
  lifetime: 4,
  maxBullets: 800,
};
