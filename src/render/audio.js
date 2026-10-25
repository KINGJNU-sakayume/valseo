// Web Audio 합성 효과음 (외부 파일 없음). 사용자 입력 후 unlock() 해야 소리가 난다.
const DEFS = {
  // 총성: 노이즈 버스트 + 짧은 저음 펀치
  shot_classic: [{ noise: true, freq: 2400, q: 1, dur: 0.06, gain: 0.25 }, { type: 'square', f0: 320, f1: 90, dur: 0.05, gain: 0.08 }],
  shot_sheriff: [{ noise: true, freq: 1400, q: 0.8, dur: 0.16, gain: 0.4 }, { type: 'sawtooth', f0: 180, f1: 40, dur: 0.14, gain: 0.18 }],
  shot_vandal: [{ noise: true, freq: 1800, q: 1, dur: 0.07, gain: 0.22 }, { type: 'square', f0: 220, f1: 70, dur: 0.06, gain: 0.08 }],
  shot_spectre: [{ noise: true, freq: 2400, q: 1, dur: 0.05, gain: 0.16 }, { type: 'square', f0: 300, f1: 120, dur: 0.04, gain: 0.06 }],
  shot_judge: [{ noise: true, freq: 900, q: 0.5, dur: 0.2, gain: 0.45 }, { type: 'square', f0: 140, f1: 40, dur: 0.15, gain: 0.15 }],
  shot_operator: [{ noise: true, freq: 700, q: 0.6, dur: 0.35, gain: 0.55 }, { type: 'sawtooth', f0: 220, f1: 30, dur: 0.3, gain: 0.25 }, { type: 'sine', f0: 3000, f1: 1200, dur: 0.15, gain: 0.05 }],
  shot_headhunter: [{ noise: true, freq: 3200, q: 2, dur: 0.1, gain: 0.3 }, { type: 'triangle', f0: 900, f1: 300, dur: 0.1, gain: 0.12 }],
  hit: [{ type: 'square', f0: 700, f1: 400, dur: 0.03, gain: 0.05 }],
  crit: [{ type: 'triangle', f0: 1400, f1: 1800, dur: 0.07, gain: 0.1 }],
  kill: [{ noise: true, freq: 900, q: 0.7, dur: 0.12, gain: 0.18 }, { type: 'square', f0: 240, f1: 60, dur: 0.1, gain: 0.08 }],
  hurt: [{ type: 'sawtooth', f0: 220, f1: 70, dur: 0.18, gain: 0.25 }, { noise: true, freq: 600, q: 0.5, dur: 0.12, gain: 0.2 }],
  enemyShot: [{ type: 'sine', f0: 520, f1: 260, dur: 0.08, gain: 0.05 }],
  trapPlace: [{ type: 'square', f0: 1200, f1: 1200, dur: 0.03, gain: 0.06 }, { type: 'square', f0: 1600, f1: 1600, dur: 0.03, gain: 0.06, delay: 0.05 }],
  trapTrigger: [{ type: 'sawtooth', f0: 900, f1: 120, dur: 0.3, gain: 0.15 }, { noise: true, freq: 400, q: 1, dur: 0.25, gain: 0.12 }],
  teleport: [{ type: 'sine', f0: 300, f1: 1500, dur: 0.22, gain: 0.15 }, { type: 'triangle', f0: 1500, f1: 600, dur: 0.15, gain: 0.08, delay: 0.18 }],
  anchor: [{ type: 'triangle', f0: 800, f1: 1000, dur: 0.1, gain: 0.08 }],
  ult: [{ noise: true, freq: 700, q: 0.6, dur: 0.6, gain: 0.5 }, { type: 'sawtooth', f0: 120, f1: 30, dur: 0.5, gain: 0.3 }],
  boom: [{ noise: true, freq: 300, q: 0.5, dur: 0.45, gain: 0.35 }],
  turret: [{ type: 'square', f0: 1300, f1: 700, dur: 0.04, gain: 0.04 }, { noise: true, freq: 3000, q: 2, dur: 0.03, gain: 0.06 }],
  hiss: [{ noise: true, freq: 2600, q: 0.6, dur: 0.5, gain: 0.12 }, { type: 'sine', f0: 400, f1: 200, dur: 0.3, gain: 0.05 }],
  throw: [{ type: 'triangle', f0: 500, f1: 900, dur: 0.12, gain: 0.06 }],
  alarm: [880, 660, 880, 660].map((f, i) => ({ type: 'square', f0: f, f1: f, dur: 0.12, gain: 0.08, delay: i * 0.14 })),
  lockdown: [{ type: 'sawtooth', f0: 110, f1: 55, dur: 0.9, gain: 0.3 }, { noise: true, freq: 500, q: 0.4, dur: 0.7, gain: 0.25 }, { type: 'square', f0: 1760, f1: 880, dur: 0.4, gain: 0.06 }],
  reload: [{ type: 'square', f0: 300, f1: 200, dur: 0.05, gain: 0.05 }, { type: 'square', f0: 500, f1: 700, dur: 0.06, gain: 0.05, delay: 0.12 }],
  pickup: [{ type: 'sine', f0: 1320, f1: 1760, dur: 0.05, gain: 0.035 }],
  tick: [{ type: 'square', f0: 1568, f1: 1568, dur: 0.03, gain: 0.025 }],
  levelUp: [523, 659, 784, 1047].map((f, i) => ({ type: 'square', f0: f, f1: f, dur: 0.08, gain: 0.07, delay: i * 0.06 })),
  coin: [{ type: 'square', f0: 988, f1: 988, dur: 0.05, gain: 0.07 }, { type: 'square', f0: 1319, f1: 1319, dur: 0.12, gain: 0.07, delay: 0.05 }],
  orb: [{ type: 'triangle', f0: 1046, f1: 2093, dur: 0.25, gain: 0.1 }],
  click: [{ type: 'square', f0: 600, f1: 600, dur: 0.025, gain: 0.05 }],
  hover: [{ type: 'square', f0: 900, f1: 900, dur: 0.015, gain: 0.025 }],
  deny: [{ type: 'square', f0: 160, f1: 120, dur: 0.12, gain: 0.08 }],
  round: [{ type: 'sawtooth', f0: 220, f1: 220, dur: 0.25, gain: 0.1 }, { type: 'sawtooth', f0: 330, f1: 330, dur: 0.4, gain: 0.1, delay: 0.2 }],
  evolve: [392, 523, 659, 784, 1047].map((f, i) => ({ type: 'triangle', f0: f, f1: f, dur: 0.14, gain: 0.1, delay: i * 0.07 })),
  boss: [{ type: 'sawtooth', f0: 70, f1: 45, dur: 1.2, gain: 0.3 }, { noise: true, freq: 200, q: 0.4, dur: 1, gain: 0.2 }],
  victory: [523, 659, 784, 1047, 1319].map((f, i) => ({ type: 'square', f0: f, f1: f, dur: 0.2, gain: 0.08, delay: i * 0.12 })),
  defeat: [392, 330, 262, 196].map((f, i) => ({ type: 'triangle', f0: f, f1: f * 0.97, dur: 0.3, gain: 0.12, delay: i * 0.18 })),
};

// 같은 소리 최소 간격(초): 연사·다수 피격 때 귀가 아프지 않게
const MIN_GAP = { pickup: 0.035, tick: 0.06, shot_judge: 0.05, shot_operator: 0.05, turret: 0.08, hiss: 0.1, hit: 0.04, crit: 0.05, kill: 0.03, enemyShot: 0.12, shot_vandal: 0.05, shot_spectre: 0.05, shot_classic: 0.05, hover: 0.05 };

export function createAudio() {
  return { ctx: null, master: null, noise: null, last: {}, volume: 0.6, on: true };
}

/** 첫 사용자 입력에서 호출 (브라우저 자동재생 정책). */
export function unlock(a) {
  if (a.ctx) return;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  a.ctx = new AC();
  a.master = a.ctx.createGain();
  a.master.gain.value = a.volume;
  a.master.connect(a.ctx.destination);
  const len = a.ctx.sampleRate;
  a.noise = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
  const d = a.noise.getChannelData(0);
  let seed = 1;
  for (let i = 0; i < len; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
}

export function setVolume(a, volume, on) {
  a.volume = volume;
  a.on = on;
  if (a.master) a.master.gain.value = on ? volume : 0;
}

export function play(a, name, { gain = 1, pitch = 1 } = {}) {
  if (!a.ctx || !a.on) return;
  const def = DEFS[name];
  if (!def) return;
  const now = a.ctx.currentTime;
  if (MIN_GAP[name] && now - (a.last[name] ?? -1) < MIN_GAP[name]) return;
  a.last[name] = now;
  for (const l of def) {
    const t0 = now + (l.delay ?? 0);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(l.gain * gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + l.dur);
    g.connect(a.master);
    if (l.noise) {
      const src = a.ctx.createBufferSource();
      src.buffer = a.noise;
      src.playbackRate.value = pitch;
      const f = a.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = l.freq * pitch;
      f.Q.value = l.q;
      src.connect(f);
      f.connect(g);
      src.start(t0, Math.random() * 0.5, l.dur + 0.05);
    } else {
      const o = a.ctx.createOscillator();
      o.type = l.type;
      o.frequency.setValueAtTime(l.f0 * pitch, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, l.f1 * pitch), t0 + l.dur);
      o.connect(g);
      o.start(t0);
      o.stop(t0 + l.dur + 0.05);
    }
  }
}
