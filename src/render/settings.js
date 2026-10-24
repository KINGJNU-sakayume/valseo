// 화면 설정. 브라우저에만 저장(없거나 막혀 있어도 기본값으로 동작).
const KEY = 'crossfire.settings';

export const SETTING_ITEMS = [
  { key: 'effects', label: '이펙트' },
  { key: 'shake', label: '화면 흔들림' },
  { key: 'damageNumbers', label: '크리티컬 피해 숫자' },
];

const DEFAULTS = { effects: true, shake: true, damageNumbers: true };

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 저장 불가 환경: 이번 세션에서만 유지
  }
}
