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
};
