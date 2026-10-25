// 총기 데이터. 이름은 이곳에만 둔다 (공개 전환 시 치환 용이).

export const GUNS = {
  classic: {
    name: '클래식',
    slot: 'sidearm',
    tags: ['gun', 'sidearm'],
    damage: 12,
    fireRate: 3.0, // 발/초
    bulletSpeed: 900,
    bulletRadius: 4,
    pierce: 0,
    critChance: 0,
    evolution: { skill: 'c', level: 3, name: '삼연격 클래식', desc: '조준점이 감속 필드·나노스웜 장판 안이면 3점사', burst: 3, spread: 0.08 },
  },
  sheriff: {
    name: '셰리프',
    slot: 'sidearm',
    tags: ['gun', 'sidearm', 'crit'],
    damage: 40,
    fireRate: 1.2,
    bulletSpeed: 1100,
    bulletRadius: 5,
    pierce: 0,
    critChance: 0.15,
    evolution: { skill: 'q', level: 3, name: '집행자 셰리프', desc: '크리티컬 6연속 명중 시 즉시 재장전', streak: 6 },
  },
  vandal: {
    name: '밴달',
    slot: 'primary',
    tags: ['gun'],
    damage: 22,
    fireRate: 6,
    bulletSpeed: 1000,
    bulletRadius: 4,
    pierce: 0,
    critChance: 0,
    evolution: { skill: 'e', level: 3, name: '급습 밴달', desc: '귀환 후 3초간 연사 +50%', duration: 3, fireRateBonus: 0.5 },
  },
  judge: {
    name: '저지',
    slot: 'primary',
    tags: ['gun', 'shotgun'],
    damage: 15, // 펠릿 1발당
    pellets: 7,
    spread: 0.26, // 펠릿 전체 부채꼴 각도(rad)
    lifetime: 0.5, // 짧은 사거리 (약 480)
    fireRate: 1.8,
    bulletSpeed: 950,
    bulletRadius: 3,
    pierce: 1,
    critChance: 0,
    evolution: { skill: 'x', level: 3, name: '처형 저지', desc: '이 총으로 처치하면 다음 사격 펠릿 +3 (1초에 한 번)', pelletBonus: 3, primeCooldown: 1 },
  },
  operator: {
    name: '오퍼레이터',
    slot: 'primary',
    tags: ['gun', 'sniper'],
    damage: 150,
    fireRate: 1.1,
    bulletSpeed: 1900,
    bulletRadius: 5,
    pierce: 10,
    critChance: 0.25,
    evolution: { skill: 'q', level: 3, name: '관통 오퍼레이터', desc: '관통할 때마다 다음 대상 피해 +25%', pierceRamp: 0.25 },
  },
};

// 발로란트식 슬롯: 주무기(소총 등) / 보조무기(권총). 총을 사면 자기 슬롯만 교체한다.
export const SLOTS = { primary: { index: 0, name: '주무기' }, sidearm: { index: 1, name: '보조무기' } };

// 티어 1~3 배율. 인덱스 = tier - 1
export const TIERS = {
  max: 3,
  damageMult: [1.0, 1.4, 1.9],
  fireRateBonus: [0, 0.15, 0.3],
};

// 총기 개조 카드 (XP 레벨업으로 획득, 장착한 총에 한정)
// kind: 'pct' = 기본값에 비율 가산, 'add' = 절대값 가산
export const GUN_MODS = {
  fireRate: { name: '연사', kind: 'pct', perStack: 0.1, maxStacks: 5 },
  pierce: { name: '관통', kind: 'add', perStack: 1, maxStacks: 5 },
  bulletSpeed: { name: '탄속', kind: 'pct', perStack: 0.15, maxStacks: 5 },
  critChance: { name: '크리티컬 확률', kind: 'add', perStack: 0.05, maxStacks: 5 },
};
