// 스킬 데이터. 레벨별 값은 배열(인덱스 = 레벨 - 1), 공통 값은 단일 수치.
// show: 레벨업 카드에 변화량으로 보여줄 항목 [키, 라벨, 단위]

export const SKILL_MAX_LEVEL = 5;

export const SKILLS = {
  c: {
    name: '트레이드마크',
    key: 'C',
    startLevel: 1, // 핵심 스킬이라 처음부터 보유
    unlockDesc: '조준점에 함정 설치, 적이 밟으면 감속 필드',
    maxCharges: 2,
    maxTraps: 2,
    range: 420, // 설치 최대 거리
    triggerRadius: 55,
    armTime: 0.3,
    cooldown: [8, 7.5, 7, 6.5, 6], // 충전 1개당
    fieldRadius: [130, 145, 160, 175, 190],
    fieldDuration: [3, 3.5, 4, 4.5, 5],
    slow: [0.4, 0.45, 0.5, 0.55, 0.6],
    show: [['fieldRadius', '반경', ''], ['fieldDuration', '지속', '초'], ['slow', '감속', '%'], ['cooldown', '쿨', '초']],
  },
  e: {
    name: '랑데뷰',
    key: 'E',
    startLevel: 0,
    unlockDesc: 'E: 앵커 설치, 다시 E: 앵커로 귀환',
    cooldown: [12, 11, 10, 9, 8],
    show: [['cooldown', '쿨', '초']],
  },
  q: {
    name: '헤드헌터',
    key: 'Q',
    startLevel: 0,
    unlockDesc: 'Q 유지: 정조준 (이속 감소, 크리 확정 관통 권총)',
    speedMult: 0.5,
    magazine: 8,
    fireRate: 2.5,
    bulletSpeed: 1500,
    bulletRadius: 5,
    pierce: 2,
    damage: [30, 36, 42, 48, 55],
    ammoRegen: [1.0, 0.9, 0.8, 0.7, 0.6], // 초당 1발 회복에 걸리는 시간
    show: [['damage', '피해', ''], ['ammoRegen', '장전', '초']],
  },
  x: {
    name: '투르 드 포스',
    key: 'X',
    startLevel: 0,
    unlockDesc: '궁극기: 관통 대형 저격, 처치 시 감속 폭발',
    orbsNeeded: 3,
    killsPerOrb: 60,
    beamLength: 2200,
    beamWidth: 18,
    damage: [300, 380, 460, 540, 620],
    killFieldRadius: 220,
    killFieldDuration: 2.5,
    killFieldSlow: 0.7,
    show: [['damage', '피해', '']],
  },
};

// 집중포화(고유 패시브): 감속 필드 안의 적에게 들어가는 모든 피해는 크리티컬
export const CROSSFIRE = { enabled: true };
