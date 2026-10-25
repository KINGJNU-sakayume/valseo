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
};

// 상태이상
export const STATUS = {
  vulnerableMult: 1.15, // 취약: 받는 피해 배율
  bossDetainResist: 0.5, // 보스는 구금 시간 절반
  eliteDetainResist: 0.25,
};

// 설치물 피해 출처 (천재성 판정)
export const GADGET_SOURCES = ['alarmbot', 'nanoswarm', 'turret'];
