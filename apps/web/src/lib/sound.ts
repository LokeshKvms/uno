import { prefs } from "./prefs.ts";

export type SoundName =
  | "card"
  | "draw"
  | "deal"
  | "shuffle"
  | "turn"
  | "skip"
  | "reverse"
  | "penalty"
  | "wild"
  | "uno"
  | "caught"
  | "catchable"
  | "tick"
  | "win"
  | "lose"
  | "chat"
  | "error"
  | "join"
  | "tap"
  | "select"
  | "copy"
  | "ready"
  | "leave"
  | "key"
  | "keyWide";

export interface Voice {
  c: BaseAudioContext;
  out: AudioNode;
  noise: AudioBuffer;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = prefs.sound();
let volume = prefs.volume();

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    noise = whiteNoise(ctx);
  }
  return ctx;
}

export function whiteNoise(c: BaseAudioContext): AudioBuffer {
  const buffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function unlockAudio() {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
}

export function audioContext(): AudioContext | null {
  return audio();
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  prefs.setSound(on);
  if (on) unlockAudio();
}
export function soundEnabled() {
  return enabled;
}
export function setVolume(v: number) {
  volume = v;
  prefs.setVolume(v);
  if (master) master.gain.value = v;
}
export function getVolume() {
  return volume;
}

function tone({ c, out }: Voice, freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.2, endFreq?: number) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function burst({ c, out, noise }: Voice, start: number, dur: number, freq: number, q = 1, gain = 0.3, sweepTo?: number) {
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq, start);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, start + dur);
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(g).connect(out);
  src.start(start, Math.random() * 0.5);
  src.stop(start + dur + 0.02);
}

export const recipes: Record<SoundName, (k: Voice, t: number) => void> = {
  card: (k, t) => {
    burst(k, t, 0.07, 2600, 0.9, 0.45);
    tone(k, 170, t, 0.08, "sine", 0.12, 90);
  },
  draw: (k, t) => burst(k, t, 0.16, 1400, 0.7, 0.22, 3200),
  deal: (k, t) => burst(k, t, 0.05, 3000, 1, 0.25),
  shuffle: (k, t) => {
    for (let i = 0; i < 14; i++) burst(k, t + i * 0.035 + Math.random() * 0.012, 0.05, 2200 + Math.random() * 1400, 1, 0.18);
  },
  turn: (k, t) => {
    tone(k, 784, t, 0.18, "sine", 0.16);
    tone(k, 1175, t + 0.09, 0.3, "sine", 0.14);
  },
  skip: (k, t) => {
    tone(k, 220, t, 0.16, "triangle", 0.28, 110);
    burst(k, t, 0.05, 900, 1, 0.2);
  },
  reverse: (k, t) => {
    burst(k, t, 0.22, 600, 1.2, 0.2, 2600);
    burst(k, t + 0.18, 0.22, 2600, 1.2, 0.16, 600);
  },
  penalty: (k, t) => {
    tone(k, 196, t, 0.14, "square", 0.08, 150);
    tone(k, 147, t + 0.12, 0.2, "square", 0.08, 110);
  },
  wild: (k, t) => [523, 659, 784, 1047].forEach((f, i) => tone(k, f, t + i * 0.055, 0.24, "triangle", 0.1)),
  uno: (k, t) => {
    tone(k, 659, t, 0.1, "square", 0.07);
    tone(k, 988, t + 0.08, 0.34, "square", 0.08);
    tone(k, 1319, t + 0.08, 0.34, "sine", 0.08);
  },
  caught: (k, t) => {
    tone(k, 440, t, 0.12, "sawtooth", 0.06, 330);
    tone(k, 330, t + 0.12, 0.22, "sawtooth", 0.06, 220);
  },
  catchable: (k, t) => {
    tone(k, 880, t, 0.07, "triangle", 0.08);
    tone(k, 1175, t + 0.09, 0.12, "triangle", 0.08);
  },
  tick: (k, t) => tone(k, 1600, t, 0.03, "square", 0.04),
  win: (k, t) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(k, f, t + i * 0.09, i === 4 ? 0.6 : 0.2, "triangle", 0.12)),
  lose: (k, t) => [392, 330, 262].forEach((f, i) => tone(k, f, t + i * 0.14, 0.28, "triangle", 0.1)),
  chat: (k, t) => tone(k, 1046, t, 0.07, "sine", 0.07, 1400),
  error: (k, t) => {
    tone(k, 260, t, 0.08, "square", 0.05);
    tone(k, 220, t + 0.1, 0.1, "square", 0.05);
  },
  join: (k, t) => {
    tone(k, 587, t, 0.12, "sine", 0.1);
    tone(k, 880, t + 0.1, 0.2, "sine", 0.1);
  },
  tap: (k, t) => {
    burst(k, t, 0.04, 1500, 1.1, 0.26);
    burst(k, t, 0.012, 4800, 2, 0.07);
    tone(k, 125, t, 0.06, "sine", 0.1, 80);
  },
  select: (k, t) => {
    burst(k, t, 0.02, 3600 + Math.random() * 300, 2.2, 0.16);
    tone(k, 210, t, 0.03, "sine", 0.035, 150);
  },
  copy: (k, t) => {
    tone(k, 988, t, 0.08, "sine", 0.06);
    tone(k, 1480, t + 0.06, 0.14, "sine", 0.05);
  },
  ready: (k, t) => {
    tone(k, 660, t, 0.09, "triangle", 0.07);
    tone(k, 990, t + 0.07, 0.18, "triangle", 0.07);
  },
  leave: (k, t) => {
    tone(k, 880, t, 0.1, "sine", 0.08);
    tone(k, 587, t + 0.09, 0.22, "sine", 0.08, 540);
  },
  key: (k, t) => {
    const shift = 1 + (Math.random() - 0.5) * 0.14;
    burst(k, t, 0.01, 4200 * shift, 1.2, 0.075);
    burst(k, t + 0.002, 0.035, 540 * shift, 2.4, 0.105);
    tone(k, 165 * shift, t, 0.03, "sine", 0.045, 120);
  },
  keyWide: (k, t) => {
    const shift = 1 + (Math.random() - 0.5) * 0.08;
    burst(k, t, 0.012, 3400 * shift, 1.2, 0.065);
    burst(k, t + 0.003, 0.05, 400 * shift, 2.2, 0.105);
    tone(k, 120 * shift, t, 0.045, "sine", 0.045, 90);
  },
};

export function play(name: SoundName, delayMs = 0) {
  if (!enabled) return;
  const c = audio();
  if (!c || c.state !== "running" || !master || !noise) return;
  try {
    recipes[name]({ c, out: master, noise }, c.currentTime + delayMs / 1000);
  } catch {}
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
