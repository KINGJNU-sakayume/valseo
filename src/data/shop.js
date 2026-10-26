// 구매 페이즈 상점. 가격은 전부 여기서 튜닝한다.

export const SHOP = {
  guns: { sheriff: 1200, spectre: 1300, vandal: 2100, judge: 1500, operator: 2300 }, // 밸런스(29): 주무기 -20~25% (R3 에 살 수 있게)
  tierUp: { 2: 1000, 3: 2600 }, // 다음 티어 → 가격 (티어 3 = 진화 관문, 밸런스 패스: 2200 → 3000, 29장: → 2600)
  armor: {
    light: { name: '라이트 실드', shield: 25, price: 400 },
    heavy: { name: '헤비 실드', shield: 50, price: 800 },
  },
  card: 600, // 레벨업 풀에서 무작위 카드 1장 (무작위 칸)
  ultOrb: 1500, // 궁극기 오브 +1 (최대 보유 수 = 필요 오브 수)
  reroll: 200, // 무작위 칸 다시 뽑기
  rerollTicket: 300, // 레벨업 리롤권 +1
};
