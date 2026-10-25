// 스킬 데이터. 레벨별 값은 배열(인덱스 = 레벨 - 1), 공통 값은 단일 수치.
// show: 레벨업 카드에 변화량으로 보여줄 항목 [키, 라벨, 단위]

export const SKILL_MAX_LEVEL = 5;
export const BRANCH_LEVEL = 3; // 이 레벨에 도달하면 분기 A/B 선택

// 분기 수치 중 레벨 배열은 인덱스 = 레벨 - 1 (분기 전 레벨은 null)

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
    branches: {
      A: { name: '폭발형', desc: '발동 시 폭발 피해, 필드 지속 절반', blastDamage: [null, null, 40, 55, 70], blastRadius: 110, durationMult: 0.5 },
      B: { name: '장기형', desc: '필드 지속 2.5배·반경 +20%, 필드 감속 중첩', durationMult: 2.5, radiusMult: 1.2, stack: true },
    },
  },
  e: {
    name: '랑데뷰',
    key: 'E',
    startLevel: 0,
    unlockDesc: 'E: 앵커 설치, 다시 E: 앵커로 귀환',
    cooldown: [12, 11, 10, 9, 8],
    show: [['cooldown', '쿨', '초']],
    branches: {
      A: { name: '충격파', desc: '출발·도착 지점에 충격파 피해', shockDamage: [null, null, 30, 40, 50], shockRadius: 140 },
      B: { name: '안전 귀환', desc: '귀환 후 1초 무적, 헤드헌터 탄창 즉시 가득', invuln: 1.0 },
    },
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
    branches: {
      A: { name: '연쇄 헤드샷', desc: '권총 명중마다 피해 +6% (최대 5중첩), Q를 떼면 초기화', chainBonus: 0.06, chainMax: 5 },
      B: { name: '관통 탄창', desc: '관통 +3, 탄창 14발, 장전 25% 빠름', pierceBonus: 3, magazine: 14, regenMult: 0.75 },
    },
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
    branches: {
      A: { name: '2발 장전', desc: '오브 1회 충전으로 2발 (두 번째는 10초 안에)', shots: 2, secondWindow: 10 },
      B: { name: '대폭발', desc: '저격 피해 +40%, 처치 폭발 반경 3배', damageMult: 1.4, killFieldRadiusMult: 3 },
    },
  },
};

// 집중포화(고유 패시브): 감속 필드 안의 적에게 들어가는 모든 피해는 크리티컬
export const CROSSFIRE = { enabled: true };
