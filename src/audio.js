// All sounds and music are synthesized with WebAudio, so the game needs no audio files.
import { S } from './settings.js';

let ctx = null;
let master = null, sfxBus = null, musicBus = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(ctx.destination);
    applyVolumes();
  } catch { ctx = null; }
}

export function applyVolumes() {
  if (!ctx) return;
  master.gain.value = (S.master / 100) * 0.6;
  sfxBus.gain.value = S.sfx / 100;
  musicBus.gain.value = (S.music / 100) * 0.55;
}

function tone({ type = 'sine', f0, f1 = f0, dur = 0.15, vol = 0.3, delay = 0, bus }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus || sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.3, lp = 6000, hp = 200, delay = 0, bus }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = lp;
  const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = hp;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(hpf).connect(lpf).connect(g).connect(bus || sfxBus);
  src.start(t);
}

export const sfx = {
  shoot() { tone({ type: 'square', f0: 900, f1: 260, dur: 0.09, vol: 0.12 }); noise({ dur: 0.06, vol: 0.18, hp: 2500 }); },
  hit() { tone({ type: 'triangle', f0: 520, f1: 300, dur: 0.07, vol: 0.18 }); },
  crit() { tone({ type: 'triangle', f0: 900, f1: 1500, dur: 0.1, vol: 0.2 }); tone({ type: 'sine', f0: 1800, f1: 2400, dur: 0.12, vol: 0.12, delay: 0.04 }); },
  kill() { tone({ type: 'triangle', f0: 880, f1: 1320, dur: 0.1, vol: 0.12, delay: 0.04 }); },
  pop() { tone({ type: 'sine', f0: 320, f1: 80, dur: 0.22, vol: 0.35 }); noise({ dur: 0.18, vol: 0.25, lp: 1800 }); },
  peel() { noise({ dur: 0.28, vol: 0.2, hp: 3000, lp: 9000 }); tone({ type: 'sawtooth', f0: 500, f1: 1400, dur: 0.25, vol: 0.05 }); },
  hurt() { tone({ type: 'sawtooth', f0: 180, f1: 60, dur: 0.25, vol: 0.3 }); noise({ dur: 0.2, vol: 0.25, lp: 900 }); },
  reload() { tone({ type: 'square', f0: 300, f1: 200, dur: 0.05, vol: 0.12 }); tone({ type: 'square', f0: 500, f1: 420, dur: 0.06, vol: 0.12, delay: 0.7 }); },
  empty() { tone({ type: 'square', f0: 160, f1: 140, dur: 0.05, vol: 0.12 }); },
  pickup() { tone({ type: 'sine', f0: 660, f1: 660, dur: 0.08, vol: 0.22 }); tone({ type: 'sine', f0: 990, f1: 990, dur: 0.14, vol: 0.22, delay: 0.08 }); },
  wave() { tone({ type: 'sawtooth', f0: 110, f1: 110, dur: 0.35, vol: 0.2 }); tone({ type: 'sawtooth', f0: 165, f1: 165, dur: 0.35, vol: 0.2, delay: 0.18 }); tone({ type: 'sawtooth', f0: 220, f1: 220, dur: 0.5, vol: 0.2, delay: 0.36 }); },
  ult() { tone({ type: 'sawtooth', f0: 90, f1: 700, dur: 0.5, vol: 0.3 }); noise({ dur: 0.6, vol: 0.35, lp: 3000, hp: 400 }); },
  blob() { tone({ type: 'sine', f0: 260, f1: 140, dur: 0.14, vol: 0.18 }); },
  boss() { tone({ type: 'sawtooth', f0: 70, f1: 40, dur: 0.9, vol: 0.4 }); tone({ type: 'square', f0: 74, f1: 38, dur: 0.9, vol: 0.2 }); },
  over() { tone({ type: 'sawtooth', f0: 330, f1: 80, dur: 1.0, vol: 0.3 }); },
  click() { tone({ type: 'triangle', f0: 700, f1: 600, dur: 0.05, vol: 0.12 }); },
  upgrade() { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, f1: f, dur: 0.14, vol: 0.18, delay: i * 0.07 })); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone({ type: 'square', f0: f, f1: f, dur: 0.2, vol: 0.14, delay: i * 0.12 })); },
};

// ---- procedural music: a looping minor-key groove that gets faster and busier with the wave ----
const BASS = [55, 55, 65.4, 55, 82.4, 55, 73.4, 65.4];       // A1 A1 C2 A1 E2 A1 D2 C2
const ARP = [220, 261.6, 329.6, 440, 329.6, 261.6, 392, 329.6];
let musicTimer = null;
let step = 0;
let nextTime = 0;
let intensity = 0;
let musicOn = false;

export function setMusicIntensity(n) { intensity = n; }

function scheduleStep(t, i) {
  const bpm = Math.min(150, 112 + intensity * 2);
  const eighth = 60 / bpm / 2;
  const n = i % 8;
  if (i % 2 === 0) tone({ type: 'sine', f0: 140, f1: 40, dur: 0.18, vol: 0.5, delay: t - ctx.currentTime, bus: musicBus });
  tone({ type: 'sawtooth', f0: BASS[n], f1: BASS[n], dur: eighth * 0.9, vol: 0.16, delay: t - ctx.currentTime, bus: musicBus });
  if (i % 2 === 1) noise({ dur: 0.05, vol: 0.12, hp: 6000, delay: t - ctx.currentTime, bus: musicBus });
  if (intensity >= 2 && n % 2 === 0) tone({ type: 'triangle', f0: ARP[n] * (intensity >= 6 ? 2 : 1), f1: ARP[n] * (intensity >= 6 ? 2 : 1), dur: eighth * 0.8, vol: 0.07, delay: t - ctx.currentTime, bus: musicBus });
  if (intensity >= 4 && n === 4) noise({ dur: 0.12, vol: 0.16, hp: 1500, lp: 5000, delay: t - ctx.currentTime, bus: musicBus });
  return eighth;
}

export function startMusic() {
  if (!ctx || musicOn) return;
  musicOn = true;
  step = 0;
  nextTime = ctx.currentTime + 0.1;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 0.35) {
      nextTime += scheduleStep(nextTime, step++);
    }
  }, 100);
}

export function stopMusic() {
  musicOn = false;
  clearInterval(musicTimer);
  musicTimer = null;
}
