// Synthesised beeps with Web Audio (spec §6.4–6.5). No audio files.
import type { CueKind } from "./engine.ts";

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;

/** Must be called inside a tap handler (Start or Test sound). */
export function unlockAudio(): void {
  // Newer iOS: play through the silent switch, like a media app.
  const nav = navigator as AudioSessionNavigator;
  if (nav.audioSession) {
    try { nav.audioSession.type = "playback"; } catch { /* not supported */ }
  }
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
  }
  void ctx.resume();
  // A silent buffer played inside the gesture fully unlocks older iOS.
  const buf = ctx.createBuffer(1, 1, 22050);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
}

/** Call when the page becomes visible again (iOS suspends or "interrupts" the context). */
export function resumeAudio(): void {
  if (ctx && ctx.state !== "running") void ctx.resume();
}

function tone(freq: number, startOffset: number, duration: number, volume = 0.6): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  // Short attack/release so beeps don't click.
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.setValueAtTime(volume, t0 + duration - 0.02);
  gain.gain.linearRampToValueAtTime(0, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playCue(kind: CueKind): void {
  resumeAudio();
  switch (kind) {
    case "short": tone(880, 0, 0.15); break;
    case "go": tone(1320, 0, 0.7); break;
    case "end": tone(1000, 0, 0.3); tone(1000, 0.45, 0.3); tone(1320, 0.9, 0.6); break;
  }
}

export function audioAvailable(): boolean {
  return ctx !== null;
}
