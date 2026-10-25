// 패시브 (XP 레벨업으로 획득). 같은 패시브는 maxStacks 까지 중첩. 효과량 = stacks × perStack.
// fmt: 카드 설명 표기 — 'stat'(기본 수치 → 수치), 'pct'(+n%), 'pctDown'(-n%), 'crit'(×배율), 'sec'(초), 'heal'(처치당 HP)
// pool: false = 레벨업 카드로 나오지 않음 (설계 v0.2 7.3: 생존 6종만 카드로 남기고 나머지는 유물·전술로 이전. 효과 코드는 유지)
// tag: 그 태그 피해 +perStack (태그형 수치 카드)

export const PASSIVES = {
  maxHp: { name: '최대 HP', perStack: 0.1, maxStacks: 5, fmt: 'stat' },
  moveSpeed: { name: '이동속도', perStack: 0.08, maxStacks: 5, fmt: 'stat' },
  magnetRadius: { name: '자석 반경', perStack: 0.25, maxStacks: 5, fmt: 'stat' },
  xpGain: { name: 'XP 획득', perStack: 0.1, maxStacks: 5, fmt: 'pct', pool: false },
  creditGain: { name: '크레딧 획득', perStack: 0.1, maxStacks: 5, fmt: 'pct', pool: false },
  critDamage: { name: '크리티컬 피해', perStack: 0.2, maxStacks: 5, fmt: 'crit', pool: false },
  cooldown: { name: '스킬 쿨다운', perStack: 0.08, maxStacks: 5, fmt: 'pctDown', pool: false },
  armor: { name: '방어구 효율', perStack: 0.15, maxStacks: 5, fmt: 'pct' },
  killHeal: { name: '처치 회복', perStack: 1, maxStacks: 5, fmt: 'heal', roundCap: 30 },
  duration: { name: '설치·장판 지속', perStack: 0.15, maxStacks: 5, fmt: 'pct', pool: false },
  orbDrop: { name: '궁극기 오브 드롭', perStack: 0.1, maxStacks: 5, fmt: 'pct', pool: false },
  invuln: { name: '피격 후 무적', perStack: 0.2, maxStacks: 5, fmt: 'sec' },
  // 태그형 수치 카드
  blastDamage: { name: '폭발 피해', perStack: 0.2, maxStacks: 3, fmt: 'pct', tag: 'blast' },
  zoneDamage: { name: '장판 피해', perStack: 0.2, maxStacks: 3, fmt: 'pct', tag: 'zone' },
  gadgetDamage: { name: '설치물 피해', perStack: 0.2, maxStacks: 3, fmt: 'pct', tag: 'gadget' },
  sniperDamage: { name: '저격 피해', perStack: 0.2, maxStacks: 3, fmt: 'pct', tag: 'sniper' },
};

// 레벨업 3지선다 가중치
export const CARD_WEIGHTS = {
  skill: 1.5,
  passive: 0.4, // 패시브가 여러 종이라 1장당 가중치는 낮게 (스킬 카드가 묻히지 않게)
  gunMod: 0.8,
  tactic: 0.45, // 1장당, 희귀도 배율이 곱해진다
};

// 희귀도: 가중치 배율. 전설은 minLevel 부터 (합성 등, M18)
export const RARITY = {
  common: { name: '일반', weight: 1 },
  rare: { name: '희귀', weight: 0.5 },
  legendary: { name: '전설', weight: 0.17, minLevel: 10 },
};

export const LEVELUP = {
  choices: 3,
  rerolls: 2, // 판당 레벨업 리롤
  banishes: 2, // 판당 추방 (그 판에서 다시 안 나옴)
  // 뽑을 카드가 하나도 없을 때의 대체 카드
  fallback: { name: '응급 처치', healPct: 0.25 },
};
