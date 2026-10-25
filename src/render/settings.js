// 화면·소리 설정. 브라우저에만 저장(없거나 막혀 있어도 기본값으로 동작).
const KEY = 'crossfire.settings';

// step: 숫자 설정은 누를 때마다 이만큼 올라가고 1을 넘으면 0으로
export const SETTING_ITEMS = [
  { key: 'sound', label: '소리' },
  { key: 'volume', label: '음량', step: 0.2 },
  { key: 'effects', label: '파티클 이펙트' },
  { key: 'lighting', label: '조명' },
  { key: 'shake', label: '화면 흔들림' },
  { key: 'damageNumbers', label: '크리티컬 피해 숫자' },
  { key: 'autoSkills', label: '스킬 자동 사용' },
];

// autoSkills: null = 기기에 맞춰 정함 (모바일 켜짐, 데스크톱 꺼짐)
const DEFAULTS = { sound: true, volume: 0.6, effects: true, lighting: true, shake: true, damageNumbers: true, autoSkills: null };

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

export function toggleSetting(settings, i) {
  const item = SETTING_ITEMS[i];
  if (!item) return;
  if (item.step) {
    const v = Math.round((settings[item.key] + item.step) * 100) / 100;
    settings[item.key] = v > 1 ? 0 : v;
  } else settings[item.key] = !settings[item.key];
  saveSettings(settings);
}
