// 총기 데이터. 이름은 이곳에만 둔다 (공개 전환 시 치환 용이).
//
// magazine / reloadTime: 주무기만 (설계 v0.2 8.1). 주무기에 탄이 있으면 주무기만 쏘고,
//   재장전 중이거나 주무기가 없거나 정조준 중이면 보조무기가 쏜다. 보조무기 magazine 0 = 무한.
// spreadStill / spreadMove: 멈췄을 때 / 이동 중 탄 퍼짐 (rad, 한쪽 최대).
// evolutions: 태그 공명 진화 (설계 8.5). 키 = 태그, 그 태그가 RESONANCE 개 모이고 티어 3이면 진화.
//
// 총기 특색 (설계 27.20, 원작 감각):
//   falloff: { near, far, min } 날아간 거리가 near 까지는 100%, far 에서 min 배까지 줄어든다.
//   recoil: { per, max } 한 발마다 탄 퍼짐 +per (최대 max), 재장전하면 0 (탄창 앞쪽은 정확, 끝은 흩뿌린다).
//   knockback: 맞은 적을 밀어내는 거리 (엘리트·보스는 1/4).
//   closeBurst: { range, count, spread, damageMult } 이 거리 안에 적이 있으면 점사 (클래식 우클릭).
//   critBonus: 크리티컬(헤드샷) 배율 가산.
//   scope: 멈춰 있으면 카메라가 조준 방향으로 더 멀리 보인다 (렌더러).

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
    magazine: 0,
    spreadStill: 0.02,
    spreadMove: 0.05,
    closeBurst: { range: 160, count: 3, spread: 0.07, damageMult: 0.6 },
    falloff: { near: 300, far: 700, min: 0.7 },
    evolutions: {
      zone: { name: '삼연격 클래식', desc: '조준점이 감속 필드·장판 안이면 3점사', burst: 3, spread: 0.08 },
      blast: { name: '작렬 클래식', desc: '명중 시 반경 40 소폭발 (피해 50%)', splash: { r: 40, mult: 0.5 } },
      mark: { name: '추적 클래식', desc: '표식 적을 향해 탄이 휘어진다', homing: { r: 240, turn: 7 } },
    },
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
    critChance: 0.08,
    magazine: 0,
    spreadStill: 0.005,
    spreadMove: 0.12,
    critBonus: 1, // 헤드샷 한 방
    knockback: 10,
    falloff: { near: 450, far: 900, min: 0.75 },
    evolutions: {
      crit: { name: '집행자 셰리프', desc: '크리티컬 6연속 명중 시 즉시 재장전', streak: 6 },
      suppress: { name: '침묵의 셰리프', desc: '명중한 적 2초 제압', suppressHit: 2 },
      economy: { name: '황금 셰리프', desc: '처치 시 크레딧 +5, 보유 크레딧 1000당 피해 +5%', killCredits: 5, perThousand: 0.05 },
    },
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
    magazine: 25,
    reloadTime: 2.5,
    spreadStill: 0.015,
    spreadMove: 0.11,
    recoil: { per: 0.006, max: 0.1 }, // 거리 감소 없음
    evolutions: {
      mobility: { name: '급습 밴달', desc: '이동기 사용 후 3초간 연사 +50%', duration: 3, fireRateBonus: 0.5 },
      sniper: { name: '원탭 밴달', desc: '탄창 첫 발은 크리 확정·관통 +2', firstShot: { pierce: 2 } },
      vuln: { name: '부식탄 밴달', desc: '명중한 적 1초 취약', vulnHit: 1 },
    },
  },
  spectre: {
    name: '스펙터',
    slot: 'primary',
    tags: ['gun', 'mobility'],
    damage: 14,
    fireRate: 9,
    bulletSpeed: 950,
    bulletRadius: 3,
    pierce: 0,
    critChance: 0,
    magazine: 30,
    reloadTime: 2.25,
    spreadStill: 0.04,
    spreadMove: 0.05, // 이동 사격 특화
    falloff: { near: 140, far: 480, min: 0.55 }, // 가까울수록 강하다
    recoil: { per: 0.003, max: 0.05 },
    evolutions: {
      mobility: { name: '질주 스펙터', desc: '이동 중 연사 +30%', runFireRate: 0.3 },
      gadget: { name: '공학 탄창 스펙터', desc: '재장전할 때마다 발밑에 요원의 C 설치물 1개 (무료)', reloadGadget: true },
      reload: { name: '확장 탄창 스펙터', desc: '탄창 2배', magazineMult: 2 },
    },
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
    magazine: 7,
    reloadTime: 2.2,
    spreadStill: 0.02,
    spreadMove: 0.04,
    knockback: 12, // 펠릿 1발당
    falloff: { near: 90, far: 380, min: 0.35 },
    evolutions: {
      slow: { name: '처형 저지', desc: '이 총으로 처치하면 다음 사격 펠릿 +3 (1초에 한 번)', pelletBonus: 3, primeCooldown: 1 },
      zone: { name: '화염 저지', desc: '사격마다 첫 착탄 지점에 1초 감속 장판 (반경 50)', fieldHit: { r: 50, duration: 1, slow: 0.35 } },
      mobility: { name: '반동 도약 저지', desc: '발사할 때 뒤로 짧게 도약 (0.1초 무적)', hop: { dist: 55, invuln: 0.1 } },
    },
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
    critChance: 0.12,
    magazine: 5,
    reloadTime: 3.7,
    spreadStill: 0,
    spreadMove: 0.2,
    scope: true,
    evolutions: {
      sniper: { name: '관통 오퍼레이터', desc: '관통할 때마다 다음 대상 피해 +25%', pierceRamp: 0.25 },
      gadget: { name: '덫 각인 오퍼레이터', desc: '관통이 끝난 지점에 요원의 C 설치물 1개 (2초에 한 번)', endGadget: { icd: 2 } },
      mark: { name: '표식탄 오퍼레이터', desc: '명중한 적 4초 표식, 표식 적에게 피해 2배', markHit: 4, markedMult: 2 },
    },
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
// kind: 'pct' = 기본값에 비율 가산, 'add' = 절대값 가산. primaryOnly: 탄창이 있는 주무기만
export const GUN_MODS = {
  fireRate: { name: '연사', kind: 'pct', perStack: 0.1, maxStacks: 5 },
  pierce: { name: '관통', kind: 'add', perStack: 1, maxStacks: 5 },
  bulletSpeed: { name: '탄속', kind: 'pct', perStack: 0.15, maxStacks: 5 },
  critChance: { name: '크리티컬 확률', kind: 'add', perStack: 0.05, maxStacks: 5 },
  magazine: { name: '탄창', kind: 'pct', perStack: 0.2, maxStacks: 5, primaryOnly: true },
};

// 헤드샷 (설계 8.3): 명중 때 조준점이 적 원(반경 + margin) 안이면 크리. 자동 조준은 명중마다 확률.
export const HEADSHOT = { margin: 8, autoChance: 0.25 };
