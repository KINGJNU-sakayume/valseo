// 에이전트: 키 슬롯(C/Q/E/X) → 스킬 id, 고유 패시브. 슬롯 순서(c, e, q, x)는 카드 추첨 순서라 바꾸지 않는다.
export const SLOT_ORDER = ['c', 'e', 'q', 'x'];

export const AGENTS = {
  chamber: {
    name: '체임버',
    role: '감시자 · 정밀 사격',
    desc: '함정으로 묶고 정밀하게 솎아낸다',
    sprite: 'player',
    slots: { c: 'trademark', e: 'rendezvous', q: 'headhunter', x: 'tourDeForce' },
    passive: { id: 'crossfire', name: '집중포화', desc: '감속 필드 안의 적은 모든 피해가 크리티컬' },
  },
  killjoy: {
    name: '킬조이',
    role: '감시자 · 설치물',
    desc: '설치물로 표시하고 화력으로 지운다',
    sprite: 'killjoy',
    slots: { c: 'alarmbot', e: 'turret', q: 'nanoswarm', x: 'lockdown' },
    passive: { id: 'genius', name: '천재성', desc: '취약 상태 적에게 설치물 피해는 크리티컬' },
  },
  reyna: {
    name: '레이나',
    role: '결투가 · 영혼 수확',
    desc: '처치로 영혼을 모아 회복하고 파고든다',
    sprite: 'reyna',
    slots: { c: 'leer', e: 'dismiss', q: 'devour', x: 'empress' },
    passive: { id: 'predator', name: '포식자', desc: '실명된 적에게 주는 모든 피해는 크리티컬. 처치하면 영혼 구슬' },
  },
  brimstone: {
    name: '브림스톤',
    role: '전략가 · 거점',
    desc: '구역을 깔고 그 안에서 버틴다',
    sprite: 'brimstone',
    slots: { c: 'beacon', e: 'skysmoke', q: 'ember', x: 'orbital' },
    passive: { id: 'commander', name: '거점 사령관', desc: '내 구역 안에서 받는 피해 -20%, 이동 사격 정확도 페널티 없음' },
    excludeUtils: ['smoke', 'incendiary'], // 스킬로 이미 가진 효과는 계약 상점에서 뺀다 (설계 24.4)
  },
};

// 브림스톤 거점 사령관 (설계 24.2)
export const COMMANDER = { takenMult: 0.8 };

// 레이나 영혼 구슬 (설계 23.1): 처치 시 확률 드롭, 실명·크리·엘리트·여제 중 처치는 확정
export const SOUL = { dropChance: 0.05, blindChance: 0.12, life: 3, max: 3, radius: 22, magnet: 90, pull: 260 };

// 상태이상
export const STATUS = {
  vulnerableMult: 1.1, // 취약: 받는 피해 배율
  markMult: 1.1, // 표식: 받는 피해 배율 (은신 해제, 자동 조준 우선은 M16)
  bossDetainResist: 0.5, // 보스는 구금 시간 절반
  eliteDetainResist: 0.25,
};

// 설치물 피해 출처 (천재성 판정)
export const GADGET_SOURCES = ['alarmbot', 'nanoswarm', 'turret', 'infect', 'bite', 'shell'];
