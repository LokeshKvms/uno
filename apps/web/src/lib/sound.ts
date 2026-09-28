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
  | "ready";

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
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
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

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.2, endFreq?: number) {
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(master!);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function burst(start: number, dur: number, freq: number, q = 1, gain = 0.3, sweepTo?: number) {
  const c = ctx!;
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
  src.connect(filter).connect(g).connect(master!);
  src.start(start, Math.random() * 0.5);
  src.stop(start + dur + 0.02);
}

const recipes: Record<SoundName, (t: number) => void> = {
  card: (t) => {
    burst(t, 0.07, 2600, 0.9, 0.45);
    tone(170, t, 0.08, "sine", 0.12, 90);
  },
  draw: (t) => burst(t, 0.16, 1400, 0.7, 0.22, 3200),
  deal: (t) => burst(t, 0.05, 3000, 1, 0.25),
  shuffle: (t) => {
    for (let i = 0; i < 14; i++) burst(t + i * 0.035 + Math.random() * 0.012, 0.05, 2200 + Math.random() * 1400, 1, 0.18);
  },
  turn: (t) => {
    tone(784, t, 0.18, "sine", 0.16);
    tone(1175, t + 0.09, 0.3, "sine", 0.14);
  },
  skip: (t) => {
    tone(220, t, 0.16, "triangle", 0.28, 110);
    burst(t, 0.05, 900, 1, 0.2);
  },
  reverse: (t) => {
    burst(t, 0.22, 600, 1.2, 0.2, 2600);
    burst(t + 0.18, 0.22, 2600, 1.2, 0.16, 600);
  },
  penalty: (t) => {
    tone(196, t, 0.14, "square", 0.08, 150);
    tone(147, t + 0.12, 0.2, "square", 0.08, 110);
  },
  wild: (t) => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.055, 0.24, "triangle", 0.1)),
  uno: (t) => {
    tone(659, t, 0.1, "square", 0.07);
    tone(988, t + 0.08, 0.34, "square", 0.08);
    tone(1319, t + 0.08, 0.34, "sine", 0.08);
  },
  caught: (t) => {
    tone(440, t, 0.12, "sawtooth", 0.06, 330);
    tone(330, t + 0.12, 0.22, "sawtooth", 0.06, 220);
  },
  catchable: (t) => {
    tone(880, t, 0.07, "triangle", 0.08);
    tone(1175, t + 0.09, 0.12, "triangle", 0.08);
  },
  tick: (t) => tone(1600, t, 0.03, "square", 0.04),
  win: (t) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.09, i === 4 ? 0.6 : 0.2, "triangle", 0.12)),
  lose: (t) => [392, 330, 262].forEach((f, i) => tone(f, t + i * 0.14, 0.28, "triangle", 0.1)),
  chat: (t) => tone(1046, t, 0.07, "sine", 0.07, 1400),
  error: (t) => {
    tone(260, t, 0.08, "square", 0.05);
    tone(220, t + 0.1, 0.1, "square", 0.05);
  },
  join: (t) => {
    tone(587, t, 0.12, "sine", 0.1);
    tone(880, t + 0.1, 0.2, "sine", 0.1);
  },
  tap: (t) => {
    burst(t, 0.03, 3400, 1.4, 0.1);
    tone(640, t, 0.06, "sine", 0.05, 520);
  },
  select: (t) => tone(1320, t, 0.035, "sine", 0.045),
  copy: (t) => {
    tone(988, t, 0.08, "sine", 0.06);
    tone(1480, t + 0.06, 0.14, "sine", 0.05);
  },
  ready: (t) => {
    tone(660, t, 0.09, "triangle", 0.07);
    tone(990, t + 0.07, 0.18, "triangle", 0.07);
  },
};

export function play(name: SoundName, delayMs = 0) {
  if (!enabled) return;
  const c = audio();
  if (!c || c.state !== "running" || !master || !noise) return;
  try {
    recipes[name](c.currentTime + delayMs / 1000);
  } catch {}
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
