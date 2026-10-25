// 태그: 스킬·총·카드·피해원을 잇는 공통 언어 (설계 v0.2 3장). id 는 코드용, name 은 화면용.

export const TAGS = {
  gun: { name: '총기' },
  sidearm: { name: '보조' },
  sniper: { name: '저격' },
  shotgun: { name: '산탄' },
  gadget: { name: '설치물' },
  zone: { name: '장판' },
  blast: { name: '폭발' },
  mobility: { name: '이동기' },
  reload: { name: '재장전' },
  crit: { name: '크리' },
  slow: { name: '감속' },
  vuln: { name: '취약' },
  detain: { name: '구금' },
  mark: { name: '표식' },
  suppress: { name: '제압' },
  economy: { name: '경제' },
};

// 피해 출처(damageEnemy 의 source) → 태그. 명중 파이프라인과 트리거가 이것으로 판정한다.
export const SOURCE_TAGS = {
  classic: ['gun', 'sidearm'],
  sheriff: ['gun', 'sidearm'],
  vandal: ['gun'],
  judge: ['gun', 'shotgun'],
  operator: ['gun', 'sniper'],
  headhunter: ['sniper'],
  ult: ['sniper'],
  trap: ['gadget', 'blast'],
  rendezvous: ['blast'],
  alarmbot: ['gadget', 'blast'],
  nanoswarm: ['gadget', 'zone'],
  turret: ['gadget'],
  chainBlast: ['blast'],
  infect: ['gadget', 'blast'],
  bite: ['gadget'],
  shell: ['gadget', 'blast'],
  overcharge: ['blast'], // 과충전체 자폭 (적이 적에게)
  frag: ['blast'], // 유틸: 분열탄
  fragBomb: ['blast'],
  storm: ['zone'], // 변이: 라디아나이트 폭풍 (적도 맞는다)
  magnetBlast: ['blast'],
  incendiary: ['zone'], // 유틸: 소이탄
  shrapnel: ['blast', 'sniper'],
};

// 스킬이 낸 피해 (쿨다운 순환 등 "스킬 피해" 판정)
export const SKILL_SOURCES = ['trap', 'rendezvous', 'headhunter', 'ult', 'alarmbot', 'nanoswarm', 'turret', 'infect', 'bite', 'shell'];

// 태그 공명: 한 태그가 이 수 이상 모이면 공명 (설계 8.5, 진화는 M14)
export const RESONANCE = 3; // M19: 4 → 3 (진화 발생률이 5~19% 로 목표 40~75% 에 크게 못 미침)

// 레벨업 카드 시너지 가중: 보유 태그와 겹치는 태그 수만큼 ×(1 + per·n), 최대 max
export const SYNERGY = { per: 0.3, max: 2 };
