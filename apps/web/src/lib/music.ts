import { useSyncExternalStore } from "react";
import { prefs } from "./prefs.ts";
import { audioContext, getVolume } from "./sound.ts";

const BPM = 72;
const BEAT = 60 / BPM;
const BEATS_PER_CHORD = 8;
const LEVEL = 0.9;
const LOOKAHEAD = 1.2;

const CHORDS = [
  { bass: 38, notes: [53, 57, 60, 64] },
  { bass: 43, notes: [53, 57, 59, 64] },
  { bass: 36, notes: [52, 55, 59, 62] },
  { bass: 45, notes: [55, 59, 60, 64] },
];
const MELODY = [72, 74, 76, 79, 81, 84];

const mtof = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function voice(ctx: BaseAudioContext, dest: AudioNode, freq: number, t: number, dur: number, gain: number, type: OscillatorType, attack: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function keys(ctx: BaseAudioContext, dest: AudioNode, midi: number, t: number, dur: number, gain: number) {
  const f = mtof(midi);
  voice(ctx, dest, f, t, dur, gain, "sine", 0.012);
  voice(ctx, dest, f * 2, t, dur * 0.45, gain * 0.22, "sine", 0.008);
}

function pad(ctx: BaseAudioContext, dest: AudioNode, notes: number[], t: number, dur: number) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 650;
  filter.connect(dest);
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = mtof(n);
    osc.detune.value = (Math.random() - 0.5) * 8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.012, t + 1.4);
    g.gain.setValueAtTime(0.012, t + dur - 1.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    osc.connect(g).connect(filter);
    osc.start(t);
    osc.stop(t + dur + 0.7);
  }
}

export function scheduleBeat(ctx: BaseAudioContext, dest: AudioNode, t: number, beat: number, random: () => number = Math.random) {
  const chord = CHORDS[Math.floor(beat / BEATS_PER_CHORD) % CHORDS.length]!;
  const step = beat % BEATS_PER_CHORD;
  if (step === 0) {
    pad(ctx, dest, chord.notes, t, BEAT * BEATS_PER_CHORD);
    chord.notes.forEach((n, i) => keys(ctx, dest, n, t + i * 0.018, 3.2, 0.03));
    voice(ctx, dest, mtof(chord.bass), t, 2.4, 0.07, "sine", 0.02);
  }
  if (step === 4) {
    chord.notes.forEach((n, i) => keys(ctx, dest, n, t + BEAT * 0.5 + i * 0.014, 2.2, 0.018));
    voice(ctx, dest, mtof(chord.bass + 7), t, 1.8, 0.05, "sine", 0.02);
  }
  if ([2, 3, 5, 6, 7].includes(step) && random() < 0.28) {
    const note = MELODY[Math.floor(random() * MELODY.length)]!;
    keys(ctx, dest, note, t + (random() < 0.5 ? 0 : BEAT / 2), 1.6, 0.022);
  }
}

export function createBus(ctx: BaseAudioContext, out: AudioNode) {
  const input = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2400;
  const echo = ctx.createDelay(1);
  echo.delayTime.value = BEAT * 0.75;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = "lowpass";
  echoTone.frequency.value = 1500;
  input.connect(tone).connect(out);
  tone.connect(echo).connect(echoTone).connect(feedback).connect(echo);
  echoTone.connect(wet).connect(out);
  return input;
}

let enabled = prefs.music();
let gain: GainNode | null = null;
let bus: AudioNode | null = null;
let timer: number | null = null;
let nextTime = 0;
let beat = 0;
const listeners = new Set<() => void>();

function level() {
  return LEVEL * getVolume();
}

function tick() {
  const ctx = audioContext();
  if (!ctx || !bus) return;
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    scheduleBeat(ctx, bus, nextTime, beat);
    nextTime += BEAT;
    beat++;
  }
}

function start() {
  const ctx = audioContext();
  if (!ctx || ctx.state !== "running" || timer !== null || document.hidden) return;
  if (!gain) {
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    bus = createBus(ctx, gain);
  }
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(level(), ctx.currentTime + 2.5);
  nextTime = ctx.currentTime + 0.1;
  tick();
  timer = window.setInterval(tick, 250);
}

function stop() {
  const ctx = audioContext();
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  if (ctx && gain) {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
  }
}

export function resumeMusic() {
  if (!enabled) return;
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "running") start();
  else void ctx.resume().then(start, () => {});
}

export function setMusicEnabled(on: boolean) {
  enabled = on;
  prefs.setMusic(on);
  if (on) resumeMusic();
  else stop();
  listeners.forEach((l) => l());
}

export function musicEnabled() {
  return enabled;
}

export function useMusicEnabled() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    musicEnabled,
    musicEnabled,
  );
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else resumeMusic();
  });
}
