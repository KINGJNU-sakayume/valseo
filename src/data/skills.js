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
        name: '지뢰밭', tags: ['gadget'], desc: '덫 최대 5개·충전 5, 충전 쿨다운 40%, 필드 반경 65%',
        maxTraps: 5, maxCharges: 5, cooldownMult: 0.4, radiusMult: 0.65,
        auto: { when: [['ready']], at: 'spread' },
      },
      overcharge: {
        name: '과충전 덫', tags: ['detain'], desc: '덫 1개만, 필드 반경 2배, 발동 시 1.5초 구금',
        maxTraps: 1, maxCharges: 1, radiusMult: 2, detain: 1.5,
        auto: { when: [['crowd', 300, 8], ['elite', 500]], at: 'densest' },
      },
      hound: {
        name: '사냥개 덫', tags: ['gadget'], desc: '설치 후 반경 280 안의 적에게 기어가서 발동',
        seekRadius: 280, seekSpeed: 190,
        auto: { when: [['ready']], at: 'self' },
      },
    },
    masteries: {
      autoRearm: { name: '자동 재설치', auto: true, tags: ['gadget'], desc: '충전이 차면 마지막 발동 지점에 자동 설치', altDesc: '덫 충전 +1, 충전 쿨다운 -20%', alt: { charges: 1, cooldownMult: 0.8 } },
      chainTrigger: { name: '연쇄 발동', tags: ['gadget'], desc: '덫이 발동하면 400 안의 다른 덫도 함께 발동', range: 400 },
      killZone: { name: '처형장', tags: ['zone'], desc: '필드 안에서 적이 죽으면 그 필드 지속 +0.8초 (최대 2배)', extend: 0.8, maxMult: 2 },
      markRing: { name: '덫 고리', tags: ['mark'], desc: '필드에 들어온 적에게 표식 3초', mark: 3 },
    },
  },
  rendezvous: {
    name: '랑데부',
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
      B: { name: '안전 귀환', tags: ['mobility'], desc: '귀환 후 1.5초 무적, 헤드헌터 탄창 즉시 가득, 쿨다운 -20%', invuln: 1.5, cooldownMult: 0.8 },
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
      twinAnchor: { name: '이중 앵커', tags: ['mobility'], desc: '앵커 2개, 쿨다운 -30%. 귀환하면 조준점에 가까운 앵커로', anchors: 2, cooldownMult: 0.7 },
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
      B: { name: '관통 탄창', tags: ['sniper'], desc: '관통 +3, 탄창 16발, 장전 40% 빠름', pierceBonus: 3, magazine: 16, regenMult: 0.6 },
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
    name: '역작',
    tags: ['sniper', 'slow'],
    brief: '5발 관통 저격 · 감속 폭발', // 에이전트 선택 화면 한 줄 설명
    startLevel: 0,
    unlockDesc: '궁극기: 역작을 꺼낸다. X로 한 발씩 5발 관통 저격 (장전 1초), 처치 시 감속 폭발',
    // 원작처럼 탄창 5발의 저격총을 꺼낸다: 오브를 쓰면 shots 발, holdTime 초 안에 쏜다. 한 발마다 boltTime 장전.
    shots: 5,
    holdTime: 15,
    boltTime: 1.0,
    beamLength: 2200,
    beamWidth: 18,
    damage: [120, 150, 185, 215, 250], // 한 발 피해 (예전 단발의 40%, 5발 합계 2배. 밸런스 재조정 때 다시 본다)
    killFieldRadius: 220,
    killFieldDuration: 2.5,
    killFieldSlow: 0.7,
    show: [['damage', '피해', '']],
    // when: 꺼내는 조건, extra: 들고 있을 때 한 발 쏘는 조건 (시간이 다 돼 가면 아무 적에게나)
    auto: { when: [['elite', 700], ['line', 8]], extra: [['elite', 700], ['line', 3], ['near', 500], ['extraEnding', 2]], at: 'aim' },
    branches: {
      A: {
        name: '확장 탄창', tags: ['sniper'], desc: '탄 8발, 들고 있는 시간 +5초', shots: 8, windowBonus: 5,
        auto: { when: [['elite', 700], ['line', 6]], extra: [['elite', 700], ['line', 3], ['near', 500], ['extraEnding', 2]], at: 'aim' },
      },
      B: { name: '대폭발', tags: ['slow'], desc: '저격 피해 +40%, 처치 폭발 반경 3배', damageMult: 1.4, killFieldRadiusMult: 3 },
      split: {
        name: '경량 역작', tags: ['sniper'], desc: '오브 1개로 꺼내지만 탄 2발', orbs: 1, shots: 2,
        auto: { when: [['elite', 700], ['line', 4]], extra: [['elite', 700], ['line', 2], ['near', 500], ['extraEnding', 2]], at: 'aim' },
      },
      cross: {
        name: '십자포화', tags: ['sniper'], desc: '조준 방향 기준 4방향 동시 저격', beams: 4,
        auto: { when: [['surrounded', 400, 12], ['elite', 500]], extra: [['surrounded', 400, 6], ['elite', 500], ['extraEnding', 2]], at: 'aim' },
      },
    },
    masteries: {
      autoExecute: { name: '자동 처형', auto: true, tags: ['sniper'], desc: '오브가 차고 엘리트·보스가 700 안에 들어오면 자동 발사', altDesc: '궁극기 필요 오브 -1', alt: { orbs: -1 } },
      refund: { name: '처치 환급', tags: ['economy'], desc: '한 발에 5명 이상 처치하면 탄 1발 추가', kills: 5 },
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
    cooldown: [10, 9.5, 9, 8.5, 8],
    damage: [26, 29, 31, 34, 36], // 밸런스(27.22): ×1.3
    vulnDuration: [2.5, 3, 3.5, 4, 4.5],
    show: [['damage', '피해', ''], ['vulnDuration', '취약', '초'], ['cooldown', '쿨', '초']],
    auto: { when: [['near', 320]], at: 'between' },
    // 모든 형태는 설치물이다 (천재성 고정점)
    branches: {
      A: { name: '연쇄', tags: ['blast'], desc: '폭발 후 그 자리에 한 번 더 전개', rearm: 1 },
      B: { name: '광역', tags: ['vuln'], desc: '폭발·취약 반경 2배, 폭발 피해 +20%', radiusMult: 2, damageMult: 1.2 },
      split: { name: '분열봇', tags: ['blast', 'gadget'], desc: '폭발 시 미니봇 3개로 분열 (각 피해 30%, 한 번만)', count: 3, miniMult: 0.3 },
      magnet: {
        name: '자석봇', tags: ['zone'], desc: '폭발 전 1.5초간 주변 적을 끌어모은 뒤 폭발', pullTime: 1.5, pullRadius: 200, pullSpeed: 140,
        auto: { when: [['crowd', 250, 6]], at: 'densest' },
      },
      guard: {
        name: '경비견', tags: ['vuln'], desc: '폭발하지 않는다. 플레이어를 따라다니며 가까운 적을 물어 피해 + 취약', biteRange: 70, biteEvery: 0.7, biteMult: 0.6,
        auto: { when: [['noGuard']], at: 'self' },
      },
    },
    masteries: {
      autoProduce: { name: '자동 생산', auto: true, tags: ['gadget'], desc: '충전이 가득 차면 발밑에 자동 배치', altDesc: '알람봇 충전 +1, 쿨다운 -20%', alt: { charges: 1, cooldownMult: 0.8 } },
      vulnTransfer: { name: '취약 전이', tags: ['vuln'], desc: '취약 적이 죽으면 가장 가까운 적에게 취약 전이', range: 220 },
      recycle: { name: '재활용', tags: ['gadget', 'economy'], desc: '봇이 적을 처치하면 충전 0.5 환급', refund: 0.5 },
      overheat: { name: '과열 코어', tags: ['zone'], desc: '봇 폭발이 나노스웜 장판에 닿으면 장판 지속 갱신' },
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
    dps: [32, 41, 50, 59, 70], // 밸런스(27.22): ×1.35
    show: [['dps', '초당 피해', ''], ['cooldown', '쿨', '초']],
    auto: { when: [['crowd', 220, 4], ['elite', 300]], at: 'densest' },
    branches: {
      A: { name: '부식', tags: ['vuln'], desc: '장판 안의 적은 취약 상태', vulnerable: true },
      B: { name: '대형', tags: ['zone'], desc: '반경 +50%, 지속 1.5배', radiusMult: 1.5, durationMult: 1.5 },
      hidden: {
        name: '은닉 지뢰', tags: ['gadget', 'blast'], desc: 'Q 짧게: 숨긴 지뢰 설치 (최대 4개). Q 길게: 전부 동시 발동, 2개 이상이면 피해 +50%',
        maxMines: 4, holdTime: 0.4, tapTime: 0.2, multiBonus: 0.5,
        auto: { mines: { place: [['ready']], at: 'ahead', trigger: [['minesHit', 8], ['mineElite']] } },
      },
      swarm: {
        name: '이동 군집', tags: ['zone'], desc: '장판이 가장 가까운 적을 천천히 따라간다', followSpeed: 60,
        auto: { when: [['near', 300]], at: 'nearest' },
      },
      crystal: { name: '결정화', tags: ['zone'], desc: '장판 안에서 죽은 적이 작은 장판을 남김 (반경 60%, 지속 절반, 연쇄 1회)', radiusMult: 0.6, lifeMult: 0.5 },
    },
    masteries: {
      autoThrow: { name: '자동 투척', auto: true, tags: ['zone'], desc: '충전이 가득 차면 적이 가장 밀집한 지점에 자동 투척', altDesc: '나노스웜 충전 +1, 장판 반경 +20%', alt: { charges: 1, radiusMult: 1.2 } },
      infect: { name: '나노 감염', tags: ['blast'], desc: '장판 피해를 받은 적은 죽을 때 소폭발 (반경 60, 피해 20)', r: 60, damage: 20 },
      harvest: { name: '수확', tags: ['economy'], desc: '장판 안에서 처치하면 XP 조각 +1' },
      feed: { name: '포탑 공급', tags: ['gadget'], desc: '포탑이 장판 안에 있으면 포탑 연사 +50%', fireRateMult: 1.5 },
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
    damage: [9, 11, 12, 14, 15], // 밸런스(27.22): ×1.5
    cooldown: [10, 9, 8, 7, 6], // 재배치 쿨다운
    show: [['damage', '피해', ''], ['cooldown', '재배치', '초']],
    auto: { when: [['turretFar', 400]], at: 'self' },
    branches: {
      A: { name: '속사', tags: ['gun'], desc: '포탑 연사 +30%', fireRateMult: 1.3 },
      B: { name: '냉각탄', tags: ['slow'], desc: '명중한 적 0.6초간 40% 감속', chillDuration: 0.6, chill: 0.4 },
      twin: { name: '쌍포탑', tags: ['gadget'], desc: '포탑 2개, 피해 -20%', maxTurrets: 2, damageMult: 0.8, auto: { when: [['turretFar', 300]], at: 'self' } },
      mortar: { name: '박격 포탑', tags: ['blast', 'zone'], desc: '느린 곡사: 착탄 지점에 1.5초 작은 장판', fireRateMult: 0.35, shellRadius: 50, shellLife: 1.5, shellDpsMult: 5, flight: 0.7 },
      shoulder: { name: '어깨 포탑', tags: ['gadget'], desc: '설치 대신 어깨에 장착: 함께 이동, 사거리 60%', rangeMult: 0.6, attached: true, auto: { when: [['turretFar', 50]], at: 'self' } },
      laser: { name: '레이저 포탑', tags: ['sniper'], desc: '관통 3, 같은 대상을 계속 맞히면 피해 증가 (최대 +100%)', pierce: 3, rampPer: 0.15, rampMax: 1 },
    },
    masteries: {
      autoRedeploy: { name: '자동 재배치', auto: true, tags: ['gadget'], desc: '플레이어가 450 이상 멀어지면 쿨다운 무시하고 근처로 재배치', altDesc: '포탑 사거리 +30%, 재배치 쿨다운 없음', range: 450, alt: { rangeMult: 1.3, noCooldown: true } },
      targeting: { name: '표적 지정', tags: ['mark', 'vuln'], desc: '표식·취약 적을 우선 조준' },
      upgrade: { name: '업그레이드 모듈', tags: ['gadget'], desc: '라운드가 끝날 때마다 포탑 피해 +6% (판 끝까지 누적)', per: 0.06 },
      repair: { name: '수리 드론', tags: [], desc: '포탑 반경 150 안에서 초당 HP 1 회복', r: 150, hps: 1 },
    },
  },
  lockdown: {
    name: '봉쇄',
    tags: ['detain'],
    brief: '광역 구금 (정지)', // 에이전트 선택 화면 한 줄 설명
    startLevel: 0,
    unlockDesc: '궁극기: 기동 후 거대 반경 안 적 전부 구금(정지)',
    windup: 2,
    radius: [380, 420, 460, 500, 540],
    detainDuration: [4, 4.5, 5, 5.5, 6],
    show: [['radius', '반경', ''], ['detainDuration', '구금', '초']],
    auto: { when: [['surrounded', 320, 14], ['elite', 500]], at: 'self' },
    branches: {
      A: { name: '급속 기동', tags: ['detain'], desc: '기동 시간 0.5초', windup: 0.5 },
      B: { name: '해체', tags: ['vuln'], desc: '구금된 적은 구금 동안 취약', vulnerable: true },
      portable: { name: '휴대형', tags: ['mobility'], desc: '장치를 들고 다닌다: 영역이 플레이어를 따라 이동, 구금 시간 60%', follow: true, durationMult: 0.6 },
      mini: { name: '미니 봉쇄', tags: ['detain'], desc: '오브 1개로 발동, 반경 50%, 기동 0.8초', orbs: 1, radiusMult: 0.5, windup: 0.8, auto: { when: [['surrounded', 220, 8], ['elite', 300]], at: 'self' } },
      overclock: {
        name: '오버클럭', tags: ['gadget'], desc: '구금 대신, 영역 안 내 설치물 성능 2배 (10초)', overclock: 10, mult: 2,
        auto: { when: [['all', ['gadgets', 2], ['surrounded', 400, 8]]], at: 'self' },
      },
    },
    masteries: {
      emergencyProtocol: { name: '비상 프로토콜', tags: ['detain'], desc: 'HP 25% 아래로 떨어지면 무료 미니 봉쇄 (라운드당 1회)', hpPct: 0.25 },
      suppress: { name: '제압 프로토콜', tags: ['suppress'], desc: '구금이 풀린 뒤 6초간 제압 (능력 정지, 적 능력은 M16)', suppress: 6 },
      harvestOrb: { name: '구금 수확', tags: ['economy'], desc: '구금된 적 10명 처치마다 궁극기 오브 1', per: 10 },
      expand: { name: '확장', tags: ['detain'], desc: '반경 +25%, 기동 중 이동속도 +30%', radiusMult: 1.25, speed: 0.3 },
    },
  },
  // ── 레이나 (설계 v0.2.2 23장) ──
  leer: {
    name: '눈총',
    tags: ['mark'],
    brief: '눈 → 실명', // 에이전트 선택 화면 한 줄 설명
    startLevel: 1,
    unlockDesc: '조준점에 눈: 주변 적 실명 (사격 정지, 포식자 크리)',
    maxCharges: 1,
    range: 450,
    radius: [160, 170, 180, 190, 200],
    blind: [1.5, 1.6, 1.7, 1.8, 2],
    cooldown: [10, 9.5, 9, 8.5, 8],
    show: [['radius', '반경', ''], ['blind', '실명', '초'], ['cooldown', '쿨', '초']],
    auto: { when: [['crowd', 220, 6], ['elite', 400]], at: 'densest' },
    branches: {
      A: { name: '넓은 시선', tags: ['mark'], desc: '반경 ×1.5', radiusMult: 1.5 },
      B: { name: '응시', tags: ['vuln'], desc: '실명된 적은 실명 동안 취약', vulnerable: true },
      brand: { name: '낙인', tags: ['mark', 'economy'], desc: '실명 대신 표식 5초 (포식자 크리 없음), 표식 적 처치 시 영혼 확정', markOnly: 5 },
      chain: { name: '연쇄 시선', tags: ['mark'], desc: '눈이 가까운 무리 두 곳으로 더 튄다 (반경 70%)', jumps: 2, jumpRange: 350, jumpRadiusMult: 0.7 },
    },
    masteries: {
      autoLeer: { name: '자동 시선', auto: true, tags: ['mark'], desc: '포위되면(200 안 8) 자동으로 발밑에 투척', altDesc: '반경 +30%', alt: { radiusMult: 1.3 }, surround: [200, 8] },
      longStare: { name: '긴 응시', tags: ['mark'], desc: '실명 +1초', blindBonus: 1 },
      soulEye: { name: '영혼의 눈', tags: ['economy'], desc: '실명 적을 처치하면 영혼 확정' },
      afterimage: { name: '섬광 잔상', tags: ['slow'], desc: '실명 적 이동속도 -40%', slow: 0.4 },
    },
  },
  devour: {
    name: '포식',
    tags: ['crit'],
    brief: '영혼 → 회복',
    startLevel: 0,
    unlockDesc: '영혼 1개: 2초 동안 HP 회복, 그동안 연사 +20%',
    heal: [10, 12, 14, 15, 17], // 밸런스(27.22): ×0.85
    time: 2,
    fireRate: 0.2,
    cooldown: 4,
    show: [['heal', '회복', '']],
    auto: { when: [['all', ['hpBelow', 0.6], ['souls', 1]]], at: 'self' },
    branches: {
      A: { name: '과식', tags: [], desc: '회복 +70%, 연사 효과 없음', healMult: 1.7, fireRate: 0 },
      B: { name: '굶주림', tags: ['crit'], desc: '회복 50%, 3초간 모든 피해 +40%', healMult: 0.5, damageBuff: 0.4, buffTime: 3 },
      overheal: { name: '초과 포식', tags: [], desc: '넘친 회복은 실드로 (최대 60)', overshield: 60 },
      feast: {
        name: '연회', tags: ['blast'], desc: '영혼 전부 소모: 영혼마다 회복, 주변 220 적에게 흡혈 피해 (영혼당 40)', all: true, drainRadius: 220, drainDamage: 40,
        auto: { when: [['all', ['souls', 3], ['crowd', 220, 6]], ['all', ['hpBelow', 0.4], ['souls', 1]]], at: 'self' },
      },
    },
    masteries: {
      autoDevour: { name: '자동 포식', auto: true, tags: [], desc: 'HP 50% 아래면 영혼이 있을 때 자동 포식', altDesc: '회복 +25%', alt: { healMult: 1.25 }, hpPct: 0.5 },
      thirst: { name: '갈증', tags: [], desc: '잃은 HP 10마다 회복 +5%', perMissing: 0.005 },
      soulArmor: { name: '영혼 갑옷', tags: [], desc: '포식할 때 실드 20', shield: 20 },
      sprint: { name: '질주', tags: ['mobility'], desc: '포식 후 2초간 이동속도 +30%', speed: 0.3, time: 2 },
    },
  },
  dismiss: {
    name: '무시',
    tags: ['mobility'],
    brief: '영혼 → 무적 질주',
    startLevel: 0,
    unlockDesc: '영혼 1개: 이동 방향으로 무적 유령 질주 (적 통과)',
    distance: [220, 240, 260, 280, 300],
    time: 0.4,
    cooldown: 2.5,
    show: [['distance', '거리', '']],
    auto: { when: [['all', ['souls', 1], ['surrounded', 120, 6]], ['all', ['souls', 1], ['hpBelow', 0.3]]], at: 'away' },
    branches: {
      A: { name: '장거리', tags: ['mobility'], desc: '거리 ×1.6', distanceMult: 1.6 },
      B: { name: '귀신 걸음', tags: ['mobility'], desc: '질주 후 1.5초 은신: 적이 놓친다', ghost: 1.5 },
      reap: { name: '수확 질주', tags: ['blast'], desc: '지나간 적에게 피해 (60), 처치하면 영혼 반환', pathDamage: [null, 60, 75, 90, 110], pathWidth: 40 },
      blink: { name: '순간 이동', tags: ['mobility'], desc: '조준점(최대 350)으로 즉시 이동', blink: 350, auto: { when: [['all', ['souls', 1], ['surrounded', 120, 6]], ['all', ['souls', 1], ['hpBelow', 0.3]]], at: 'away' } },
    },
    masteries: {
      autoDismiss: { name: '자동 회피', auto: true, tags: ['mobility'], desc: '포위되면(120 안 6) 영혼이 있을 때 자동 질주', altDesc: '무적 +0.2초', alt: { invulnBonus: 0.2 }, surround: [120, 6] },
      ghostRounds: { name: '유령탄', tags: ['crit'], desc: '질주 후 다음 3발 크리', shots: 3 },
      piercing: { name: '관통 질주', tags: ['sniper'], desc: '질주 후 2초간 관통 +2', pierce: 2, time: 2 },
      quickReap: { name: '재빠른 수확', tags: ['economy'], desc: '질주 후 1초 안에 처치하면 영혼 반환 (질주당 1회)', span: 1 },
    },
  },
  empress: {
    name: '여제',
    tags: ['gun', 'crit'],
    brief: '연사 폭주 · 처치 연장',
    startLevel: 0,
    unlockDesc: '궁극기: 연사 +25%·재장전 2배 빠르게, 처치마다 +0.75초 (최대 지속 1.5배)',
    duration: [10, 11, 12, 13, 14],
    fireRate: [0.25, 0.3, 0.35, 0.4, 0.45],
    reloadMult: 0.5,
    extend: 0.75,
    maxExtendMult: 1.5, // 연장 포함 최대 지속 = 기본 지속 × 이 값
    soulChance: 0.25, // 여제 중 처치 영혼 확률
    show: [['duration', '지속', '초'], ['fireRate', '연사', '%']],
    auto: { when: [['elite', 700], ['surrounded', 300, 12]], at: 'self' },
    branches: {
      A: { name: '지속', tags: ['gun'], desc: '지속 ×1.5', durationMult: 1.5 },
      B: { name: '폭주', tags: ['gun'], desc: '연사 효과 2배, 처치 연장 없음', fireRateMult: 2, noExtend: true },
      hunt: { name: '사냥', tags: ['mobility'], desc: '여제 중 처치하면 무료 무시 (1초에 한 번)', freeDismiss: 1 },
      execute: { name: '처형', tags: ['crit'], desc: '여제 중 HP 20% 이하 적은 명중 즉시 처치 (엘리트·보스 제외)', hpPct: 0.2 },
    },
    masteries: {
      autoEmpress: { name: '자동 즉위', auto: true, tags: ['gun'], desc: '오브가 차고 엘리트가 보이거나 포위되면 자동 발동', altDesc: '궁극기 필요 오브 -1', alt: { orbs: -1 } },
      bloodlust: { name: '피의 갈망', tags: ['crit'], desc: '여제 중 처치마다 피해 +3% (최대 +45%)', per: 0.03, max: 0.45 },
      soulThrone: { name: '영혼 왕좌', tags: ['economy'], desc: '여제 중 포식·무시가 영혼을 쓰지 않는다' },
      endless: { name: '무한', tags: ['gun'], desc: '처치 연장 +0.5초, 최대 지속 2배', extendBonus: 0.5, maxExtendMult: 2 },
    },
  },

  // ── 브림스톤 (설계 v0.2.3 24장) ──
  beacon: {
    name: '자극제 신호기',
    tags: ['gun', 'zone'],
    brief: '신호기 → 연사·이속',
    startLevel: 1,
    unlockDesc: '조준점에 신호기: 안에서 연사·이속 증가',
    maxCharges: 1,
    range: 300,
    radius: [170, 175, 180, 185, 190],
    duration: [6, 6.5, 7, 7, 7],
    cooldown: [16, 15, 14, 13, 12],
    fireRate: [0.18, 0.2, 0.22, 0.24, 0.26], // 밸런스(27.22): 0.25~0.37 에서 낮춤
    speed: [0.15, 0.17, 0.19, 0.21, 0.23],
    show: [['radius', '반경', ''], ['duration', '지속', '초'], ['fireRate', '연사', '%'], ['cooldown', '쿨', '초']],
    auto: { when: [['crowd', 260, 6], ['elite', 400]], at: 'self' },
    branches: {
      wide: { name: '광역 신호기', tags: ['zone'], desc: '반경 ×1.5, 효과 -20%', radiusMult: 1.5, effectMult: 0.8 },
      escort: { name: '동행 신호기', tags: ['mobility'], desc: '플레이어를 따라다닌다, 지속 ×0.6', follow: true, durationMult: 0.6 },
      medic: { name: '응급 신호기', tags: ['economy'], desc: '연사 효과 대신 안에서 초당 최대 HP 2% 회복', healPct: 0.02, noFireRate: true },
      ammo: { name: '탄약 신호기', tags: ['reload'], desc: '연사 효과 대신 안에서 재장전 시간 ×0.5', reloadMult: 0.5, noFireRate: true },
    },
    masteries: {
      autoBeacon: { name: '자동 신호기', auto: true, tags: ['zone'], desc: '포위되면(200 안 8) 자동으로 발밑에 설치', altDesc: '지속 +1.5초', alt: { durationBonus: 1.5 }, surround: [200, 8] },
      command: { name: '지휘', tags: ['zone'], desc: '신호기 안에서 연막·소이탄 쿨다운 25% 빠르게', accel: 0.25 },
      flare: { name: '신호탄', tags: ['blast'], desc: '설치 순간 반경 안 적을 밀어낸다', push: 90 },
      amplify: { name: '강화', tags: ['gun'], desc: '신호기 효과 +50%', effectMult: 1.5 },
    },
  },
  skysmoke: {
    name: '공중 연막',
    tags: ['zone'],
    brief: '연막 → 사격 차단',
    startLevel: 0,
    unlockDesc: '조준점에 연막: 안의 적은 사격 불가, 안의 플레이어는 멀리 있는 적에게 놓친다',
    maxCharges: 1,
    range: 500,
    radius: [150, 155, 160, 165, 170],
    duration: [7, 7.5, 8, 8.5, 9],
    cooldown: [20, 19, 18, 17, 16],
    show: [['radius', '반경', ''], ['duration', '지속', '초'], ['cooldown', '쿨', '초']],
    auto: { when: [['ranged', 400, 3], ['hpBelow', 0.5]], at: 'self' },
    branches: {
      choke: { name: '질식 연막', tags: ['zone'], desc: '안의 적이 초당 피해 (25)', chokeDps: 25 },
      dense: { name: '짙은 연막', tags: ['slow'], desc: '안의 적 이동속도 -35%', slow: 0.35 },
      cloak: { name: '완전 은폐', tags: ['mark'], desc: '안의 플레이어는 거리와 상관없이 모든 적에게 놓친다 (엘리트·보스 제외)', cloak: true },
      canister: { name: '연막탄', tags: ['zone'], desc: '충전 2, 지속 ×0.6', maxCharges: 2, durationMult: 0.6 },
    },
    masteries: {
      autoSmoke: { name: '자동 연막', auto: true, tags: ['zone'], desc: '원거리 적이 다수(400 안 3)거나 HP 50% 아래면 자동 설치', altDesc: '지속 +20%', alt: { durationMult: 1.2 } },
      burst: { name: '연막 폭발', tags: ['mark'], desc: '연막이 끝날 때 안의 적 실명 1초', blind: 1 },
      synergy: { name: '연계', tags: ['zone', 'blast'], desc: '연막과 겹친 내 화염·궤도 장판 피해 +30%', mult: 1.3 },
      ward: { name: '방호', tags: [], desc: '연막 안에서 초당 실드 +4 (최대 40)', shieldPerSec: 4, shieldCap: 40 },
    },
  },
  ember: {
    name: '소이탄',
    tags: ['zone', 'blast'],
    brief: '화염 장판',
    startLevel: 0,
    unlockDesc: '조준점에 화염 장판: 안의 적에게 지속 피해',
    maxCharges: 1,
    range: 450,
    radius: [130, 135, 140, 145, 150],
    duration: [5, 5, 5.5, 5.5, 6],
    dps: [40, 46, 52, 58, 64],
    cooldown: [12, 11.5, 11, 10.5, 10],
    show: [['dps', '초당 피해', ''], ['radius', '반경', ''], ['duration', '지속', '초'], ['cooldown', '쿨', '초']],
    auto: { when: [['crowd', 220, 6]], at: 'densest' },
    branches: {
      scatter: { name: '확산 소이', tags: ['zone'], desc: '작은 장판 3개로 분산 (총 피해 유지)', count: 3, radiusMult: 0.6, dpsMult: 0.55 },
      blast: { name: '폭발 소이', tags: ['blast'], desc: '착탄 즉시 폭발, 장판 지속 절반', blastDamage: 70, durationMult: 0.5 },
      lava: { name: '용암 지대', tags: ['zone'], desc: '지속 ×2, 반경 ×1.3, 피해 ×0.7', durationMult: 2, radiusMult: 1.3, dpsMult: 0.7 },
      ignite: { name: '점화', tags: ['vuln'], desc: '장판 안 적 취약, 벗어난 뒤 2초 잔불', vulnerable: true, burn: 2 },
    },
    masteries: {
      autoEmber: { name: '자동 소이', auto: true, tags: ['zone'], desc: '적이 밀집하면 가장 밀집한 곳에 자동 투척', altDesc: '피해 +25%', alt: { dpsMult: 1.25 } },
      scald: { name: '화상', tags: ['zone'], desc: '장판을 벗어난 적 3초간 약한 피해', burn: 3 },
      fuel: { name: '연료', tags: ['zone'], desc: '신호기 안에서 놓은 장판 지속 +30%', durationMult: 1.3 },
      kindling: { name: '가연', tags: ['vuln'], desc: '취약 적에게 장판 피해 +30%', mult: 1.3 },
    },
  },
  orbital: {
    name: '궤도 일격',
    tags: ['zone', 'blast'],
    brief: '예고 뒤 광역 화염',
    startLevel: 0,
    unlockDesc: '궁극기: 조준점에 2초 예고 뒤 광역 화염 지대',
    range: 600,
    windup: 2,
    radius: [250, 255, 260, 265, 270],
    duration: [5, 5.5, 6, 6.5, 7],
    dps: [90, 105, 120, 135, 150],
    impact: 1.5, // 착탄 순간 피해 = dps × 이 값
    show: [['dps', '초당 피해', ''], ['radius', '반경', ''], ['duration', '지속', '초']],
    auto: { when: [['elite', 500], ['crowd', 300, 12]], at: 'densest' },
    branches: {
      barrage: { name: '연속 일격', tags: ['blast'], desc: '1.2초 간격 3회, 매번 다른 지점 (반경·지속 ×0.6)', count: 3, gap: 1.2, radiusMult: 0.6, durationMult: 0.6 },
      precise: { name: '정밀 일격', tags: ['sniper'], desc: '예고 1초, 반경 ×0.6, 피해 ×2', windup: 1, radiusMult: 0.6, dpsMult: 2 },
      saturate: { name: '지속 포화', tags: ['zone'], desc: '지속 ×2', durationMult: 2 },
      guardian: { name: '수호 포화', tags: ['zone'], desc: '플레이어를 따라다니는 화염 지대 (예고 0.5초, 피해 ×0.8)', follow: true, windup: 0.5, dpsMult: 0.8, radiusMult: 0.9 },
    },
    masteries: {
      autoStrike: { name: '자동 호출', auto: true, tags: ['zone'], desc: '오브가 차고 엘리트가 가깝거나 대군집이면 자동 발동', altDesc: '궁극기 필요 오브 -1', alt: { orbs: -1 } },
      twin: { name: '이중 호출', tags: ['blast'], desc: '같은 지점에 2초 뒤 한 번 더', again: 2 },
      aftermath: { name: '여파', tags: ['zone'], desc: '타격 지점에 소이 장판을 남김 (기본 수치의 60%)', mult: 0.6 },
      tracking: { name: '추적 보정', tags: ['mark'], desc: '예고 중 타격 지점을 가장 밀집한 곳으로 1회 보정 (300 안)', range: 300 },
    },
  },

  // ── 게코 (설계 v0.2.4 26장) ──
  moshpit: {
    name: '폭파봇 지옥',
    tags: ['blast'],
    brief: '던지면 터지는 폭파봇',
    startLevel: 1,
    unlockDesc: '조준점에 폭파봇을 던진다: 잠시 뒤 폭발, 끝난 자리에 구슬',
    maxCharges: 1,
    range: 450,
    fuse: 0.9,
    radius: [150, 155, 160, 165, 170],
    damage: [70, 80, 90, 100, 110],
    vulnerable: 2,
    cooldown: [14, 13.5, 13, 12.5, 12],
    show: [['damage', '피해', ''], ['radius', '반경', ''], ['cooldown', '쿨', '초']],
    auto: { when: [['crowd', 150, 5]], at: 'densest' },
    branches: {
      big: { name: '대형 폭파봇', tags: ['blast'], desc: '반경 ×1.4, 피해 ×0.8', radiusMult: 1.4, damageMult: 0.8 },
      embers: { name: '잔불 폭파봇', tags: ['zone'], desc: '폭발 뒤 4초 화염 장판 (구슬이 불 속에 남는다)', fire: 4, fireDps: 30 },
      chain: { name: '연쇄 폭파봇', tags: ['blast'], desc: '0.5초 간격 3연 폭발 (각 ×0.5)', count: 3, gap: 0.5, damageMult: 0.5 },
      sticky: { name: '끈끈 폭파봇', tags: ['slow'], desc: '폭발 대신 4초 감속(-50%)·취약 장판', sticky: 4, slow: 0.5 },
    },
    masteries: {
      autoMosh: { name: '자동 폭파봇', auto: true, tags: ['blast'], desc: '적이 밀집하면 자동으로 던진다', altDesc: '피해 +25%', alt: { damageMult: 1.25 } },
      reclaimBlast: { name: '회수 폭발', tags: ['blast'], desc: '구슬을 회수하면 그 자리에 소폭발 (50)', damage: 50, radius: 120 },
      wideOrb: { name: '넓은 구슬', tags: ['economy'], desc: '회수 반경 ×2', pickupMult: 2 },
      shortFuse: { name: '짧은 도화선', tags: ['blast'], desc: '폭발까지 0.5초', fuse: 0.5 },
    },
  },
  wingman: {
    name: '지원봇',
    tags: ['gadget', 'detain'],
    brief: '쫓아가 적 구금',
    startLevel: 0,
    unlockDesc: '지원봇이 적을 쫓아가 닿으면 주변을 구금, 끝난 자리에 구슬',
    maxCharges: 1,
    life: [7, 7.5, 8, 8.5, 9],
    speed: 280,
    radius: 110,
    detain: 1.2,
    maxHits: [3, 3, 3, 4, 4],
    cooldown: [20, 19, 18, 17, 16],
    show: [['life', '지속', '초'], ['detain', '구금', '초'], ['cooldown', '쿨', '초']],
    auto: { when: [['near', 450]], at: 'nearest' },
    branches: {
      defuser: { name: '해체 지원봇', tags: ['economy'], desc: '해체 라운드에서 스파이크 반경에 서서 해체 진행 ×0.6', defuse: 0.6 },
      twin: { name: '쌍둥이 지원봇', tags: ['detain'], desc: '2기 (각 지속 ×0.6)', count: 2, lifeMult: 0.6 },
      storm: { name: '폭풍 지원봇', tags: ['blast'], desc: '구금 대신 폭발 피해 (60)', blast: 60 },
      scout: { name: '정찰 지원봇', tags: ['mark'], desc: '구금 대신 표식 6초, 엘리트·은신 적 우선', mark: 6 },
    },
    masteries: {
      autoWingman: { name: '자동 지원봇', auto: true, tags: ['detain'], desc: '포위되면(200 안 8) 자동 출격', altDesc: '지속 +1.5초', alt: { lifeBonus: 1.5 }, surround: [200, 8] },
      firmDetain: { name: '질긴 구금', tags: ['detain'], desc: '구금 +0.5초', bonus: 0.5 },
      charge: { name: '돌격', tags: ['mobility'], desc: '이동속도 +30%', speedMult: 1.3 },
      guardOrb: { name: '보호 구슬', tags: [], desc: '구슬을 회수하면 실드 20', shield: 20 },
    },
  },
  dizzy: {
    name: '기절봇',
    tags: ['gadget', 'mark'],
    brief: '날아가 적을 눈멀게',
    startLevel: 0,
    unlockDesc: '기절봇이 조준점으로 날아가 적 한 명씩 눈멀게 한다, 끝난 자리에 구슬',
    maxCharges: 1,
    range: 500,
    speed: 420,
    life: [5, 5.5, 6, 6.5, 7],
    interval: 0.8,
    blind: 1.2,
    damage: [12, 14, 16, 18, 20],
    cooldown: [18, 17, 16, 15, 14],
    show: [['life', '지속', '초'], ['damage', '피해', ''], ['cooldown', '쿨', '초']],
    auto: { when: [['crowd', 220, 5]], at: 'densest' },
    branches: {
      rapid: { name: '연사 기절봇', tags: ['mark'], desc: '간격 0.5초, 실명 0.8초', interval: 0.5, blind: 0.8 },
      burst: { name: '폭발 플라즈마', tags: ['sniper'], desc: '실명 대신 피해 ×3', damageMult: 3, noBlind: true },
      follow: { name: '추종 기절봇', tags: ['mobility'], desc: '플레이어를 따라다닌다', follow: true },
      wide: { name: '광역 플라즈마', tags: ['mark'], desc: '실명 반경 80', blindRadius: 80 },
    },
    masteries: {
      autoDizzy: { name: '자동 기절봇', auto: true, tags: ['mark'], desc: '적이 밀집하면 자동 출격', altDesc: '지속 +20%', alt: { lifeMult: 1.2 } },
      sniper: { name: '저격수', tags: ['sniper'], desc: '엘리트를 먼저 노린다', bigFirst: true },
      longFlight: { name: '긴 비행', tags: [], desc: '지속 +2초', bonus: 2 },
      shieldOrb: { name: '회수 방패', tags: [], desc: '구슬을 회수하면 실드 20', shield: 20 },
    },
  },
  thrash: {
    name: '요동봇',
    tags: ['gadget', 'detain'],
    brief: '날뛰며 적 구금',
    startLevel: 0,
    unlockDesc: '궁극기: 요동봇이 조준 방향으로 돌진, 조준점 근처의 적을 먼저 쫓으며 닿는 적마다 구금. 회수하면 오브 1개 환급',
    steerRadius: 220, // 조종: 조준점에서 이 반경 안의 적을 먼저 노린다
    life: [8, 8.5, 9, 9.5, 10],
    speed: 320,
    radius: 40,
    detain: 1.5,
    damage: [80, 90, 100, 110, 120],
    maxHits: 8,
    show: [['life', '지속', '초'], ['damage', '피해', '']],
    auto: { when: [['elite', 600], ['crowd', 300, 10]], at: 'densest' },
    branches: {
      giant: { name: '거대 요동봇', tags: ['detain'], desc: '반경 ×1.6, 속도 ×0.7', radiusMult: 1.6, speedMult: 0.7 },
      sprint: { name: '질주 요동봇', tags: ['mobility'], desc: '지속 ×1.5, 속도 ×1.4', lifeMult: 1.5, speedMult: 1.4 },
      blast: { name: '폭발 요동봇', tags: ['blast'], desc: '끝날 때 대폭발 (반경 220, 피해 200)', blast: 200, blastRadius: 220 },
      guardian: { name: '수호 요동봇', tags: ['detain'], desc: '플레이어 주위를 돌며 접근하는 적을 구금', guard: 120 },
    },
    masteries: {
      autoThrash: { name: '자동 호출', auto: true, tags: ['detain'], desc: '오브가 차고 엘리트가 가깝거나 대군집이면 자동 출격', altDesc: '궁극기 필요 오브 -1', alt: { orbs: -1 } },
      quake: { name: '지진', tags: ['vuln'], desc: '구금 중인 적은 취약', quake: true },
      extend: { name: '구금 연장', tags: ['detain'], desc: '구금 +0.5초', bonus: 0.5 },
      chainDetain: { name: '연쇄 구금', tags: ['detain'], desc: '구금한 적 주변(200) 적 1명도 구금', range: 200 },
    },
  },
};
