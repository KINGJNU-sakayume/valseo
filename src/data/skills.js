// 스킬 데이터. 레벨별 값은 배열(인덱스 = 레벨 - 1), 공통 값은 단일 수치.
// show: 레벨업 카드에 변화량으로 보여줄 항목 [키, 라벨, 단위]

export const SKILL_MAX_LEVEL = 5;
export const BRANCH_LEVEL = 2; // 이 레벨에 도달하면 형태 증강 선택 (설계 v0.2 4.1, 코드 이름은 branch 를 유지)
export const MASTERY_LEVEL = 5; // 이 레벨에 도달하면 숙련 증강 선택
export const AUGMENT_CHOICES = 3; // 형태·숙련 선택지 수

// branches = 형태 풀 (id → 데이터. 기존 분기 A/B 는 id 'A'·'B' 로 남아 있다).
// masteries = 숙련 풀. auto: true 인 숙련은 "스킬 자동 사용" 중에는 alt 효과로 바뀐다 (설계 21.4).
// 형태 수치 중 레벨 배열은 인덱스 = 레벨 - 1 (형태 전 레벨은 null)
// auto: 자동 전투 규칙 (설계 21장, src/core/autopilot.js). 형태·숙련의 auto 가 스킬 기본 auto 를 덮어쓴다.

// 궁극기 공통: 오브 필요 수, 처치 몇 번마다 오브 1개
export const ULT = { orbsNeeded: 3, killsPerOrb: 60 };

// 스킬 id → 데이터. 어떤 키(C/Q/E/X)에 붙는지는 data/agents.js 가 정한다.
export const SKILLS = {
  // ── 체임버 ──
  trademark: {
    name: '트레이드마크',
    tags: ['gadget', 'zone', 'slow'],
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
    auto: { when: [['near', 320]], at: 'between' },
    // 모든 형태는 감속 필드를 만든다 (집중포화 고정점)
    branches: {
      A: { name: '폭발형', tags: ['blast'], desc: '발동 시 폭발 피해, 필드 지속 절반', blastDamage: [null, 30, 40, 55, 70], blastRadius: 110, durationMult: 0.5 },
      B: { name: '장기형', tags: ['zone'], desc: '필드 지속 2.5배·반경 +20%, 필드 감속 중첩', durationMult: 2.5, radiusMult: 1.2, stack: true },
      minefield: {
        name: '지뢰밭', tags: ['gadget'], desc: '덫 최대 5개·충전 5, 충전 쿨다운 절반, 필드 반경 50%',
        maxTraps: 5, maxCharges: 5, cooldownMult: 0.5, radiusMult: 0.5,
        auto: { when: [['ready']], at: 'spread' },
      },
      overcharge: {
        name: '과충전 덫', tags: ['detain'], desc: '덫 1개만, 필드 반경 2배, 발동 시 1.5초 구금',
        maxTraps: 1, maxCharges: 1, radiusMult: 2, detain: 1.5,
        auto: { when: [['crowd', 300, 8], ['elite', 500]], at: 'densest' },
      },
      hound: {
        name: '사냥개 덫', tags: ['gadget'], desc: '설치 후 반경 220 안의 적에게 기어가서 발동',
        seekRadius: 220, seekSpeed: 150,
        auto: { when: [['ready']], at: 'self' },
      },
    },
    masteries: {
      autoRearm: { name: '자동 재설치', auto: true, tags: ['gadget'], desc: '충전이 차면 마지막 발동 지점에 자동 설치', altDesc: '덫 충전 +1, 충전 쿨다운 -20%', alt: { charges: 1, cooldownMult: 0.8 } },
      chainTrigger: { name: '연쇄 발동', tags: ['gadget'], desc: '덫이 발동하면 400 안의 다른 덫도 함께 발동', range: 400 },
      killZone: { name: '처형장', tags: ['zone'], desc: '필드 안에서 적이 죽으면 그 필드 지속 +0.5초 (최대 2배)', extend: 0.5, maxMult: 2 },
      markRing: { name: '덫 고리', tags: ['mark'], desc: '필드에 들어온 적에게 표식 3초', mark: 3 },
    },
  },
  rendezvous: {
    name: '랑데뷰',
    tags: ['mobility'],
    brief: '앵커 설치 · 귀환', // 에이전트 선택 화면 한 줄 설명
    startLevel: 0,
    unlockDesc: 'E: 앵커 설치, 다시 E: 앵커로 귀환',
    cooldown: [12, 11, 10, 9, 8],
    show: [['cooldown', '쿨', '초']],
    // 앵커: 없고 붐비지 않으면 발밑에. 귀환: 위험할 때
    auto: { place: { when: [['notSurrounded', 300, 3]], at: 'self' }, recall: { when: [['hpBelow', 0.35], ['surrounded', 120, 6]] } },
    branches: {
      A: {
        name: '충격파', tags: ['blast'], desc: '출발·도착 지점에 충격파 피해', shockDamage: [null, 25, 30, 40, 50], shockRadius: 140,
        auto: { place: { when: [['notSurrounded', 300, 3]], at: 'self' }, recall: { when: [['hpBelow', 0.35], ['surrounded', 140, 8]] } },
      },
      B: { name: '안전 귀환', tags: ['mobility'], desc: '귀환 후 1초 무적, 헤드헌터 탄창 즉시 가득', invuln: 1.0 },
      trapRecall: {
        name: '덫 귀환', tags: ['gadget', 'mobility'], desc: '앵커 없이, 조준점에 가장 가까운 내 덫으로 순간이동하고 그 덫을 즉시 발동',
        noAnchor: true,
        auto: { recall: { when: [['hpBelow', 0.35], ['surrounded', 120, 6]] }, at: 'safestGadget' },
      },
      afterimage: {
        name: '잔상', tags: ['blast'], desc: '귀환 시 출발 지점에 분신: 적이 2초간 분신을 노리고, 사라질 때 폭발',
        decoyTime: 2, decoyBlast: [null, 40, 50, 60, 70], decoyRadius: 130,
        auto: { place: { when: [['notSurrounded', 300, 3]], at: 'self' }, recall: { when: [['surrounded', 120, 5], ['hpBelow', 0.35]] } },
      },
      twinAnchor: { name: '이중 앵커', tags: ['mobility'], desc: '앵커 2개. 귀환하면 조준점에 가까운 앵커로', anchors: 2 },
    },
    masteries: {
      emergency: { name: '비상 귀환', auto: true, tags: ['mobility'], desc: 'HP 30% 이하가 되면 쿨다운이 돌아 있을 때 자동 귀환', altDesc: '귀환 후 2초 무적, 쿨다운 -25%', hpPct: 0.3, alt: { invuln: 2, cooldownMult: 0.75 } },
      reloadRecall: { name: '귀환 장전', tags: ['gun'], desc: '귀환 후 3초간 총기 관통 +2', duration: 3, pierce: 2 },
      warp: { name: '공간 왜곡', tags: ['vuln'], desc: '출발~도착 경로 위의 적에게 피해 + 취약 2초', damage: 40, width: 40, vuln: 2 },
      tacticalReset: { name: '전술 리셋', tags: ['gadget'], desc: '귀환하면 트레이드마크 충전 +1', charges: 1 },
    },
  },
  headhunter: {
    name: '헤드헌터',
    tags: ['sniper', 'crit'],
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
    // 유지형: hold 조건 동안 누르고 있는다. gentle(모바일)은 이속 감소 때문에 엘리트 상대일 때만
    auto: { hold: [['elite', 700], ['near', 500]], gentleHold: [['elite', 700]] },
    branches: {
      A: { name: '연쇄 헤드샷', tags: ['crit'], desc: '권총 명중마다 피해 +6% (최대 5중첩), Q를 떼면 초기화', chainBonus: 0.06, chainMax: 5 },
      B: { name: '관통 탄창', tags: ['sniper'], desc: '관통 +3, 탄창 14발, 장전 25% 빠름', pierceBonus: 3, magazine: 14, regenMult: 0.75 },
      oneShot: {
        name: '한 발의 미학', tags: ['sniper'], desc: '탄창 1발, 피해 ×6, 처치하면 탄 회수', magazine: 1, damageMult: 6, refundOnKill: true,
        auto: { hold: [['elite', 700], ['line', 3]], gentleHold: [['elite', 700], ['line', 3]] },
      },
      rapid: {
        name: '속사', tags: ['gun'], desc: '정조준 감속 없음, 연사 ×2, 크리 확정 해제', speedMult: 1, fireRateMult: 2, noCrit: true,
        auto: { hold: [['near', 400]], gentleHold: [['near', 400]] },
      },
      markShot: {
        name: '표식 사격', tags: ['mark'], desc: '명중한 적에게 표식 4초', mark: 4,
        auto: { hold: [['crowd', 500, 6], ['elite', 700]], gentleHold: [['elite', 700]] },
      },
    },
    masteries: {
      stillAim: { name: '정지 사수', auto: true, tags: ['sniper'], desc: '0.6초 이상 멈춰 있으면 Q 없이도 자동 정조준', altDesc: '정조준 이속 감소 없음 (자동 정조준 조건이 넓어진다)', still: 0.6, alt: { speedMult: 1 } },
      headshotRefund: { name: '헤드샷 회수', tags: ['crit'], desc: '헤드헌터로 처치하면 탄 2발 회수', refund: 2 },
      execute: { name: '처형', tags: ['sniper'], desc: 'HP 20% 이하 적은 권총에 맞으면 즉사 (엘리트·보스 제외)', hpPct: 0.2 },
      reflex: { name: '반사 신경', tags: [], desc: 'Q 유지 중 첫 피격 무효 (8초 쿨다운)', cooldown: 8 },
    },
  },
  tourDeForce: {
    name: '투르 드 포스',
    tags: ['sniper', 'slow'],
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
    auto: { when: [['elite', 700], ['line', 8]], at: 'aim' },
    branches: {
      A: {
        name: '2발 장전', tags: ['sniper'], desc: '오브 1회 충전으로 2발 (두 번째는 10초 안에)', shots: 2, secondWindow: 10,
        auto: { when: [['elite', 700], ['line', 8]], extra: [['line', 4], ['extraEnding', 1]], at: 'aim' },
      },
      B: { name: '대폭발', tags: ['slow'], desc: '저격 피해 +40%, 처치 폭발 반경 3배', damageMult: 1.4, killFieldRadiusMult: 3 },
      split: {
        name: '쪼개 쏘기', tags: ['sniper'], desc: '오브 1개로 발사, 피해 35%', orbs: 1, damageMult: 0.35,
        auto: { when: [['elite', 700], ['line', 4]], at: 'aim' },
      },
      cross: {
        name: '십자포화', tags: ['sniper'], desc: '조준 방향 기준 4방향 동시 저격', beams: 4,
        auto: { when: [['surrounded', 400, 12], ['elite', 500]], at: 'aim' },
      },
    },
    masteries: {
      autoExecute: { name: '자동 처형', auto: true, tags: ['sniper'], desc: '오브가 차고 엘리트·보스가 700 안에 들어오면 자동 발사', altDesc: '궁극기 필요 오브 -1', alt: { orbs: -1 } },
      refund: { name: '처치 환급', tags: ['economy'], desc: '한 발에 5명 이상 처치하면 오브 1 환급', kills: 5 },
      trapImprint: { name: '덫 각인', tags: ['gadget'], desc: '처치 폭발 지점에 무료 덫 1개 생성' },
      goldRounds: { name: '금괴 탄', tags: ['economy'], desc: '이 스킬로 처치한 적의 크레딧 ×3', creditMult: 3 },
    },
  },

  // ── 킬조이 ──
  alarmbot: {
    name: '알람봇',
    tags: ['gadget', 'blast', 'vuln'],
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
    tags: ['gadget', 'zone'],
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
    tags: ['gadget'],
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
    tags: ['detain'],
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
