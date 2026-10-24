// 패시브 (XP 레벨업으로 획득). 같은 패시브는 maxStacks 까지 중첩.
// 효과 = 기본값 × (1 + stacks × perStack)

export const PASSIVES = {
  maxHp: { name: '최대 HP', perStack: 0.1, maxStacks: 5 },
  moveSpeed: { name: '이동속도', perStack: 0.08, maxStacks: 5 },
  magnetRadius: { name: '자석 반경', perStack: 0.25, maxStacks: 5 },
};

// 레벨업 3지선다 가중치
export const CARD_WEIGHTS = {
  skill: 1.5,
  passive: 1,
  gunMod: 1,
};

export const LEVELUP = {
  choices: 3,
  // 뽑을 카드가 하나도 없을 때의 대체 카드
  fallback: { name: '응급 처치', healPct: 0.25 },
};
