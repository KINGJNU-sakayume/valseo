// 스킬 데이터. 레벨별 값은 배열(인덱스 = 레벨 - 1), 공통 값은 단일 수치.
// show: 레벨업 카드에 변화량으로 보여줄 항목 [키, 라벨, 단위]

export const SKILL_MAX_LEVEL = 5;
export const BRANCH_LEVEL = 3; // 이 레벨에 도달하면 분기 A/B 선택

// 분기 수치 중 레벨 배열은 인덱스 = 레벨 - 1 (분기 전 레벨은 null)

// 궁극기 공통: 오브 필요 수, 처치 몇 번마다 오브 1개
export const ULT = { orbsNeeded: 3, killsPerOrb: 60 };

// 스킬 id → 데이터. 어떤 키(C/Q/E/X)에 붙는지는 data/agents.js 가 정한다.
export const SKILLS = {
  // ── 체임버 ──
  trademark: {
    name: '트레이드마크',
    brief: '함정 → 감속 필드', // 에이전트 선택 화면 한 줄 설명
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
  rendezvous: {
    name: '랑데뷰',
    brief: '앵커 설치 · 귀환', // 에이전트 선택 화면 한 줄 설명
    startLevel: 0,
    unlockDesc: 'E: 앵커 설치, 다시 E: 앵커로 귀환',
    cooldown: [12, 11, 10, 9, 8],
    show: [['cooldown', '쿨', '초']],
    branches: {
      A: { name: '충격파', desc: '출발·도착 지점에 충격파 피해', shockDamage: [null, null, 30, 40, 50], shockRadius: 140 },
      B: { name: '안전 귀환', desc: '귀환 후 1초 무적, 헤드헌터 탄창 즉시 가득', invuln: 1.0 },
    },
  },
  headhunter: {
    name: '헤드헌터',
    brief: '정조준 · 크리 확정 권총', // 에이전트 선택 화면 한 줄 설명
    startLevel: 0,
    holdPrecision: true, // 키를 누르고 있는 동안 정조준 (이속 감소, 주무기 대신 권총)
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
  tourDeForce: {
    name: '투르 드 포스',
    brief: '관통 저격 · 감속 폭발', // 에이전트 선택 화면 한 줄 설명
    startLevel: 0,
    unlockDesc: '궁극기: 관통 대형 저격, 처치 시 감속 폭발',
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

  // ── 킬조이 ──
  alarmbot: {
    name: '알람봇',
    brief: '추적 폭발 · 취약 부여', // 에이전트 선택 화면 한 줄 설명
    startLevel: 1,
    unlockDesc: '조준점에 알람봇 설치, 다가온 적에게 굴러가 폭발 + 취약',
    maxCharges: 2,
    maxBots: 2,
    range: 420,
    armTime: 0.4,
    detectRadius: 190, // 이 거리 안의 적을 쫓아간다
    rollSpeed: 260,
    blastRadius: 75,
    cooldown: [12, 11.5, 11, 10.5, 10],
    damage: [20, 22, 24, 26, 28],
    vulnDuration: [2.5, 3, 3.5, 4, 4.5],
    show: [['damage', '피해', ''], ['vulnDuration', '취약', '초'], ['cooldown', '쿨', '초']],
    branches: {
      A: { name: '연쇄', desc: '폭발 후 그 자리에 한 번 더 전개', rearm: 1 },
      B: { name: '광역', desc: '폭발·취약 반경 2배', radiusMult: 2 },
    },
  },
  nanoswarm: {
    name: '나노스웜',
    brief: '지속 피해 장판', // 에이전트 선택 화면 한 줄 설명
    startLevel: 0,
    unlockDesc: '조준점에 수류탄 투척, 착탄 지점에 지속 피해 장판',
    maxCharges: 2,
    range: 380,
    flightTime: 0.45,
    radius: 60,
    duration: 4,
    cooldown: [11, 10.5, 10, 9.5, 9],
    dps: [24, 30, 37, 44, 52],
    show: [['dps', '초당 피해', ''], ['cooldown', '쿨', '초']],
    branches: {
      A: { name: '부식', desc: '장판 안의 적은 취약 상태', vulnerable: true },
      B: { name: '대형', desc: '반경 +50%, 지속 1.5배', radiusMult: 1.5, durationMult: 1.5 },
    },
  },
  turret: {
    name: '포탑',
    brief: '자동 사격 포탑', // 에이전트 선택 화면 한 줄 설명
    startLevel: 0,
    unlockDesc: 'E: 포탑 설치 (사거리 안 가장 가까운 적 자동 사격), 다시 E: 재배치',
    maxTurrets: 1,
    placeDistance: 30,
    range: 320,
    fireRate: 3,
    bulletSpeed: 800,
    bulletRadius: 3,
    damage: [6, 7, 8, 9, 10],
    cooldown: [10, 9, 8, 7, 6], // 재배치 쿨다운
    show: [['damage', '피해', ''], ['cooldown', '재배치', '초']],
    branches: {
      A: { name: '속사', desc: '포탑 연사 +30%', fireRateMult: 1.3 },
      B: { name: '냉각탄', desc: '명중한 적 0.6초간 40% 감속', chillDuration: 0.6, chill: 0.4 },
    },
  },
  lockdown: {
    name: '락다운',
    brief: '광역 구금 (정지)', // 에이전트 선택 화면 한 줄 설명
    startLevel: 0,
    unlockDesc: '궁극기: 기동 후 거대 반경 안 적 전부 구금(정지)',
    windup: 2,
    radius: [380, 420, 460, 500, 540],
    detainDuration: [4, 4.5, 5, 5.5, 6],
    show: [['radius', '반경', ''], ['detainDuration', '구금', '초']],
    branches: {
      A: { name: '급속 기동', desc: '기동 시간 0.5초', windup: 0.5 },
      B: { name: '해체', desc: '구금된 적은 구금 동안 취약', vulnerable: true },
    },
  },
};
