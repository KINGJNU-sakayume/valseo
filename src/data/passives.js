// 패시브 (XP 레벨업으로 획득). 같은 패시브는 maxStacks 까지 중첩. 효과량 = stacks × perStack.
// fmt: 카드 설명 표기 — 'stat'(기본 수치 → 수치), 'pct'(+n%), 'pctDown'(-n%), 'crit'(×배율), 'sec'(초), 'heal'(처치당 HP)

export const PASSIVES = {
  maxHp: { name: '최대 HP', perStack: 0.1, maxStacks: 5, fmt: 'stat' },
  moveSpeed: { name: '이동속도', perStack: 0.08, maxStacks: 5, fmt: 'stat' },
  magnetRadius: { name: '자석 반경', perStack: 0.25, maxStacks: 5, fmt: 'stat' },
  xpGain: { name: 'XP 획득', perStack: 0.1, maxStacks: 5, fmt: 'pct' },
  creditGain: { name: '크레딧 획득', perStack: 0.1, maxStacks: 5, fmt: 'pct' },
  critDamage: { name: '크리티컬 피해', perStack: 0.2, maxStacks: 5, fmt: 'crit' },
  cooldown: { name: '스킬 쿨다운', perStack: 0.08, maxStacks: 5, fmt: 'pctDown' },
  armor: { name: '방어구 효율', perStack: 0.15, maxStacks: 5, fmt: 'pct' },
  killHeal: { name: '처치 회복', perStack: 1, maxStacks: 5, fmt: 'heal', roundCap: 30 },
  duration: { name: '설치·장판 지속', perStack: 0.15, maxStacks: 5, fmt: 'pct' },
  orbDrop: { name: '궁극기 오브 드롭', perStack: 0.1, maxStacks: 5, fmt: 'pct' },
  invuln: { name: '피격 후 무적', perStack: 0.2, maxStacks: 5, fmt: 'sec' },
};

// 레벨업 3지선다 가중치
export const CARD_WEIGHTS = {
  skill: 1.5,
  passive: 0.4, // 패시브가 12종이라 1장당 가중치는 낮게 (스킬 카드가 묻히지 않게)
  gunMod: 1,
};

export const LEVELUP = {
  choices: 3,
  // 뽑을 카드가 하나도 없을 때의 대체 카드
  fallback: { name: '응급 처치', healPct: 0.25 },
};
