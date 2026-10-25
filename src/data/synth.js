// 합성 증강 (전설 카드, 설계 5.7·6.7): 두 증강이 갖춰지면 레벨업 풀에 나온다 (레벨 10 이상).
// requires: 슬롯 → { branch } 또는 { level }. 효과는 요원 모듈이 p.synths 를 보고 처리한다.

export const SYNTHS = {
  checkmate: {
    agent: 'chamber',
    name: '체크메이트',
    tags: ['gadget', 'sniper'],
    requires: { e: { branch: 'trapRecall' }, c: { level: 5 } },
    desc: '덫이 발동하면 필드 안 적마다 헤드헌터 탄 1발 자동 사격 (최대 6)',
    maxShots: 6,
  },
  huntingSeason: {
    agent: 'chamber',
    name: '사냥 시즌',
    tags: ['mark', 'sniper'],
    requires: { q: { branch: 'markShot' }, x: { level: 5 } },
    desc: '투르 드 포스가 900 안의 모든 표식 적에게 각각 관통 저격 (최대 8)',
    range: 900,
    max: 8,
  },
  nanoBarrage: {
    agent: 'killjoy',
    name: '나노 포격',
    tags: ['blast', 'zone'],
    requires: { e: { branch: 'mortar' }, q: { branch: 'hidden' } },
    desc: '박격 포탑 포탄 착탄 지점에 은닉 나노스웜을 심는다 (최대 적재 수 공유)',
  },
  allIn: {
    agent: 'killjoy',
    name: '총동원',
    tags: ['gadget', 'detain'],
    requires: { x: { branch: 'overclock' }, c: { branch: 'split' } },
    desc: '락다운 발동 시 영역 경계에 미니 알람봇 8개 자동 배치',
    count: 8,
  },
  soulStorm: {
    agent: 'reyna',
    name: '영혼 폭풍',
    tags: ['mark', 'gun'],
    requires: { c: { branch: 'brand' }, x: { level: 5 } },
    desc: '여제 중 3초마다 가장 밀집한 곳에 무료 리어',
    every: 3,
  },
  phantom: {
    agent: 'reyna',
    name: '망령',
    tags: ['mobility', 'blast'],
    requires: { e: { branch: 'B' }, q: { branch: 'feast' } },
    desc: '무시 은신이 끝나는 순간 남은 영혼을 전부 연회로 소모',
  },
  inferno: {
    agent: 'brimstone',
    name: '불바다',
    tags: ['zone', 'blast'],
    requires: { q: { branch: 'lava' }, x: { branch: 'saturate' } },
    desc: '궤도 타격이 내 화염 장판 위에 떨어지면 그 장판(최대 3개)의 남은 지속 피해를 즉시 폭발로 합산',
    max: 3,
  },
  fortress: {
    agent: 'brimstone',
    name: '철벽 요새',
    tags: ['zone', 'mark'],
    requires: { e: { branch: 'cloak' }, c: { branch: 'medic' } },
    desc: '연막과 비콘이 겹친 곳에서 받는 피해 -50%, 비콘 회복 ×2',
    takenMult: 0.5,
    healMult: 2,
  },
};
