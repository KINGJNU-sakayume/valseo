// 구매 페이즈 상점. 가격은 전부 여기서 튜닝한다.

export const SHOP = {
  guns: { sheriff: 1500, vandal: 2800 },
  tierUp: { 2: 1000, 3: 2200 }, // 다음 티어 → 가격
  armor: {
    light: { name: '라이트 실드', shield: 25, price: 400 },
    heavy: { name: '헤비 실드', shield: 50, price: 800 },
  },
  card: 600, // 레벨업 풀에서 무작위 카드 1장
};
