// Pure timer engine: no DOM, no clock of its own. Everything is derived from
// timestamps (spec §6.1), so a throttled or hidden tab can never drift.
import { totalSec, type Workout } from "../workout.ts";

/** All times in ms (Date.now() scale). */
export type RunState = {
  startedAt: number;
  pausedAt: number | null;  // set while paused
  pausedTotal: number;      // ms spent paused before the current pause
  finishedAt: number | null; // set when the coach taps Done (For Time)
};

export type Phase = "ready" | "work" | "done";

export type Snapshot = {
  /** ms since Start, excluding pauses. The timeline beeps are scheduled on. */
  t: number;
  phase: Phase;
  paused: boolean;
  /** Whole seconds to show on the clock. */
  displaySec: number;
  /** EMOM only. */
  round: number | null;
  rounds: number | null;
  /** For Time result (seconds) once done. */
  resultSec: number | null;
};

export type CueKind = "short" | "go" | "end";
export type Cue = { at: number; kind: CueKind };

/** A beep more than this late (e.g. after the tab was hidden) is skipped, not replayed. */
export const LATE_TOLERANCE_MS = 1000;

export function start(now: number): RunState {
  return { startedAt: now, pausedAt: null, pausedTotal: 0, finishedAt: null };
}

export function pause(run: RunState, now: number): RunState {
  return run.pausedAt !== null || run.finishedAt !== null ? run : { ...run, pausedAt: now };
}

export function resume(run: RunState, now: number): RunState {
  if (run.pausedAt === null) return run;
  return { ...run, pausedAt: null, pausedTotal: run.pausedTotal + (now - run.pausedAt) };
}

/** Coach taps Done (For Time). Freezes the clock at this moment. */
export function finish(run: RunState, now: number): RunState {
  if (run.finishedAt !== null) return run;
  const at = run.pausedAt ?? now;
  return { ...resume(run, at), finishedAt: at };
}

/** Timeline position in ms, excluding pauses. */
export function elapsed(run: RunState, now: number): number {
  const effectiveNow = run.finishedAt ?? run.pausedAt ?? now;
  return Math.max(0, effectiveNow - run.startedAt - run.pausedTotal);
}

export function snapshot(w: Workout, run: RunState, now: number): Snapshot {
  const t = elapsed(run, now);
  const countdownMs = w.countdownSec * 1000;
  const totalMs = totalSec(w) * 1000;
  const paused = run.pausedAt !== null && run.finishedAt === null;
  const rounds = w.mode === "emom" ? w.rounds : null;
  const base = { t, paused, rounds, resultSec: null as number | null };

  if (t < countdownMs) {
    return { ...base, phase: "ready", displaySec: Math.ceil((countdownMs - t) / 1000), round: rounds ? 1 : null };
  }

  const workMs = t - countdownMs;

  if (run.finishedAt !== null && workMs < totalMs) {
    // Done tapped before the cap.
    const resultSec = Math.floor(workMs / 1000);
    return { ...base, phase: "done", displaySec: resultSec, round: null, resultSec };
  }
  if (workMs >= totalMs) {
    const resultSec = w.mode === "fortime" ? w.capSec : null;
    return { ...base, phase: "done", displaySec: resultSec ?? 0, round: rounds, resultSec };
  }

  switch (w.mode) {
    case "fortime":
      return { ...base, phase: "work", displaySec: Math.floor(workMs / 1000), round: null };
    case "amrap":
      return { ...base, phase: "work", displaySec: Math.ceil((totalMs - workMs) / 1000), round: null };
    case "emom": {
      const intervalMs = w.intervalSec * 1000;
      const index = Math.floor(workMs / intervalMs);
      const inRound = workMs - index * intervalMs;
      return { ...base, phase: "work", displaySec: Math.ceil((intervalMs - inRound) / 1000), round: index + 1 };
    }
  }
}

/** Every beep in the workout, in timeline order. */
export function cueSchedule(w: Workout): Cue[] {
  const cues: Cue[] = [];
  const countdownMs = w.countdownSec * 1000;
  const lead = (at: number) => {
    for (const s of [3, 2, 1]) if (at - s * 1000 >= 0) cues.push({ at: at - s * 1000, kind: "short" });
  };

  lead(countdownMs);
  cues.push({ at: countdownMs, kind: "go" });

  if (w.mode === "emom") {
    for (let r = 1; r < w.rounds; r++) {
      const at = countdownMs + r * w.intervalSec * 1000;
      lead(at);
      cues.push({ at, kind: "go" });
    }
  }
  const end = countdownMs + totalSec(w) * 1000;
  lead(end);
  cues.push({ at: end, kind: "end" });

  // A 3-2-1 lead into a boundary must not overlap the previous GO (only possible
  // when the countdown is under 3 s; it is 0, 5, 10 or 15 here). Keep unique times.
  const seen = new Set<number>();
  return cues
    .filter((c) => (seen.has(c.at) ? false : (seen.add(c.at), true)))
    .sort((a, b) => a.at - b.at);
}

/**
 * Beeps due between two frames: scheduled in (fromT, toT].
 * Consecutive windows never overlap, so each beep fires exactly once.
 * Beeps more than LATE_TOLERANCE_MS late are dropped (no replay after a long gap).
 */
export function dueCues(w: Workout, fromT: number, toT: number): Cue[] {
  if (toT <= fromT) return [];
  return cueSchedule(w).filter((c) => c.at > fromT && c.at <= toT && toT - c.at <= LATE_TOLERANCE_MS);
}
