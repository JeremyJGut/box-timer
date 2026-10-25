import { describe as group, expect, it } from "vitest";
import { dueCues, finish, pause, resume, skip, snapshot, start, type Cue } from "./engine.ts";
import type { Workout } from "../workout.ts";

const amrap: Workout = { name: "A", notes: "", countdownSec: 10, mode: "amrap", durationSec: 60 };
const forTime: Workout = { name: "F", notes: "", countdownSec: 10, mode: "fortime", capSec: 120 };
const emom: Workout = { name: "E", notes: "", countdownSec: 0, mode: "emom", intervalSec: 60, rounds: 3 };

const T0 = 1_000_000;
const at = (s: number) => T0 + s * 1000;

/** Simulate a frame loop with the given step sizes and collect every cue fired. */
function runLoop(w: Workout, steps: number[], untilSec: number): Cue[] {
  const fired: Cue[] = [];
  let lastT = -1;
  let now = T0;
  const run = start(T0);
  let i = 0;
  while (now <= at(untilSec)) {
    const snap = snapshot(w, run, now);
    fired.push(...dueCues(w, lastT, snap.t));
    lastT = snap.t;
    now += steps[i++ % steps.length] ?? 100;
  }
  return fired;
}
const summary = (cues: Cue[]) => cues.map((c) => `${c.kind}@${c.at / 1000}`);

group("countdown", () => {
  it("shows 10 → 1 in yellow 'ready', then work at exactly 10 s", () => {
    const run = start(T0);
    expect(snapshot(amrap, run, at(0))).toMatchObject({ phase: "ready", displaySec: 10 });
    expect(snapshot(amrap, run, at(9.5))).toMatchObject({ phase: "ready", displaySec: 1 });
    expect(snapshot(amrap, run, at(10))).toMatchObject({ phase: "work", displaySec: 60 });
  });
  it("countdown 0 starts work immediately", () => {
    expect(snapshot(emom, start(T0), T0)).toMatchObject({ phase: "work", round: 1, displaySec: 60 });
  });
});

group("AMRAP", () => {
  it("counts down and ends at 0:00", () => {
    const run = start(T0);
    expect(snapshot(amrap, run, at(10.5)).displaySec).toBe(60);
    expect(snapshot(amrap, run, at(11)).displaySec).toBe(59);
    expect(snapshot(amrap, run, at(69.9)).displaySec).toBe(1);
    expect(snapshot(amrap, run, at(70))).toMatchObject({ phase: "done", displaySec: 0 });
  });
});

group("For Time", () => {
  it("counts up from 0:00 and stops at the cap", () => {
    const run = start(T0);
    expect(snapshot(forTime, run, at(10))).toMatchObject({ phase: "work", displaySec: 0 });
    expect(snapshot(forTime, run, at(75.9)).displaySec).toBe(65);
    expect(snapshot(forTime, run, at(130))).toMatchObject({ phase: "done", displaySec: 120, resultSec: 120 });
    expect(snapshot(forTime, run, at(999))).toMatchObject({ phase: "done", resultSec: 120 });
  });
  it("Done freezes the athlete's time", () => {
    const run = finish(start(T0), at(105.4)); // 95.4 s of work
    expect(snapshot(forTime, run, at(105.4))).toMatchObject({ phase: "done", resultSec: 95, displaySec: 95 });
    expect(snapshot(forTime, run, at(500))).toMatchObject({ phase: "done", resultSec: 95 });
  });
});

group("EMOM", () => {
  it("counts down each interval, shows the round and ends after the last", () => {
    const run = start(T0);
    expect(snapshot(emom, run, at(0))).toMatchObject({ round: 1, rounds: 3, displaySec: 60 });
    expect(snapshot(emom, run, at(59.5))).toMatchObject({ round: 1, displaySec: 1 });
    expect(snapshot(emom, run, at(60))).toMatchObject({ round: 2, displaySec: 60 });
    expect(snapshot(emom, run, at(179.9))).toMatchObject({ round: 3, displaySec: 1 });
    expect(snapshot(emom, run, at(180))).toMatchObject({ phase: "done" });
  });
});

group("pause / resume", () => {
  it("freezes the clock while paused and continues where it left off", () => {
    let run = start(T0);
    run = pause(run, at(25)); // 15 s into the AMRAP
    expect(snapshot(amrap, run, at(25))).toMatchObject({ paused: true, displaySec: 45 });
    expect(snapshot(amrap, run, at(85))).toMatchObject({ paused: true, displaySec: 45 }); // a minute later
    run = resume(run, at(85));
    expect(snapshot(amrap, run, at(85))).toMatchObject({ paused: false, displaySec: 45 });
    expect(snapshot(amrap, run, at(95))).toMatchObject({ displaySec: 35 });
  });
  it("Done while paused uses the paused time", () => {
    const run = finish(pause(start(T0), at(40)), at(90));
    expect(snapshot(forTime, run, at(90))).toMatchObject({ phase: "done", resultSec: 30 });
  });
});

group("beeps", () => {
  const amrapExpected = ["short@7", "short@8", "short@9", "go@10", "short@67", "short@68", "short@69", "end@70"];

  it("AMRAP: 3-2-1, GO, 3-2-1, end; each exactly once at 10 fps", () => {
    expect(summary(runLoop(amrap, [100], 80))).toEqual(amrapExpected);
  });
  it("same result with irregular and skipped frames", () => {
    expect(summary(runLoop(amrap, [16, 250, 33, 400, 90, 17], 80))).toEqual(amrapExpected);
  });
  it("EMOM: GO at start, 3-2-1 + GO at each new round, 3-2-1 + end", () => {
    expect(summary(runLoop(emom, [100], 200))).toEqual([
      "go@0", "short@57", "short@58", "short@59", "go@60",
      "short@117", "short@118", "short@119", "go@120",
      "short@177", "short@178", "short@179", "end@180",
    ]);
  });
  it("For Time: end beep at the cap", () => {
    expect(summary(runLoop(forTime, [100], 140)).slice(-2)).toEqual(["short@129", "end@130"]);
  });
  it("does not replay beeps missed during a long gap", () => {
    expect(dueCues(amrap, 5000, 40_000)).toEqual([]); // tab hidden from 5 s to 40 s
    expect(dueCues(amrap, 66_950, 67_050)).toEqual([{ at: 67_000, kind: "short" }]); // normal again
  });
  it("still plays a beep that is only slightly late", () => {
    expect(dueCues(amrap, 9_700, 10_400)).toEqual([{ at: 10_000, kind: "go" }]);
  });
  it("never fires the same beep twice for the same window boundary", () => {
    expect(dueCues(amrap, 10_000, 10_000)).toEqual([]);
    expect(dueCues(amrap, 10_000, 10_100)).toEqual([]);
  });
  it("no beeps while paused (time stands still)", () => {
    const run = pause(start(T0), at(6.5));
    const a = snapshot(amrap, run, at(6.5)).t;
    const b = snapshot(amrap, run, at(30)).t;
    expect(dueCues(amrap, a, b)).toEqual([]);
  });
});

// ---------- M5.5: progress, stats, next, skip, finish ----------

/** Frame loop that can apply skip() at given timeline seconds (wall-clock based). */
function runWithSkips(w: Workout, skipAtWallSec: number[], untilWallSec: number): Cue[] {
  const fired: Cue[] = [];
  let run = start(T0);
  let lastT = -1;
  const pending = [...skipAtWallSec];
  for (let now = T0; now <= at(untilWallSec); now += 100) {
    if (pending.length && now >= at(pending[0]!)) {
      pending.shift();
      const r = skip(w, run, now);
      if (r) { run = r.run; lastT = Math.max(lastT, r.cursor); }
    }
    const snap = snapshot(w, run, now);
    if (snap.phase === "done" && fired.some((c) => c.kind === "end")) break;
    fired.push(...dueCues(w, lastT, snap.t));
    lastT = snap.t;
  }
  return fired;
}

group("progress, stats and next", () => {
  it("ring depletes through the countdown and each EMOM round; full when done", () => {
    const run = start(T0);
    expect(snapshot(amrap, run, at(5)).progress).toBeCloseTo(0.5);
    expect(snapshot(emom, run, at(90)).progress).toBeCloseTo(0.5);
    expect(snapshot(amrap, run, at(70)).progress).toBe(1);
  });
  it("elapsed and time left cover the whole workout", () => {
    const run = start(T0);
    expect(snapshot(amrap, run, at(3))).toMatchObject({ elapsedSec: 0, leftSec: 60 });
    expect(snapshot(amrap, run, at(25.5))).toMatchObject({ elapsedSec: 15, leftSec: 45 });
    expect(snapshot(emom, run, at(130))).toMatchObject({ elapsedSec: 130, leftSec: 50 });
    expect(snapshot(amrap, run, at(70))).toMatchObject({ leftSec: 0 });
  });
  it("next up: work / round n / finish", () => {
    const run = start(T0);
    expect(snapshot(amrap, run, at(1)).next).toEqual({ kind: "work" });
    expect(snapshot(amrap, run, at(20)).next).toEqual({ kind: "finish" });
    expect(snapshot(emom, run, at(10)).next).toEqual({ kind: "round", round: 2 });
    expect(snapshot(emom, run, at(150)).next).toEqual({ kind: "finish" });
    expect(snapshot(emom, run, at(200)).next).toBeNull();
  });
});

group("skip", () => {
  it("skips the countdown straight to work", () => {
    const r = skip(amrap, start(T0), at(2));
    expect(r).not.toBeNull();
    expect(snapshot(amrap, r!.run, at(2))).toMatchObject({ phase: "work", displaySec: 60 });
  });
  it("countdown skip plays GO once, never the skipped 3-2-1, then continues normally", () => {
    // Skip at 2 s (wall): timeline jumps 8 s ahead, so the end is at wall 62 s.
    expect(summary(runWithSkips(amrap, [2], 80))).toEqual(
      ["go@10", "short@67", "short@68", "short@69", "end@70"],
    );
  });
  it("EMOM skip jumps to the next round with one new-round beep", () => {
    const r = skip(emom, start(T0), at(20))!;
    expect(snapshot(emom, r.run, at(20))).toMatchObject({ round: 2, displaySec: 60 });
    expect(summary(runWithSkips(emom, [20], 200))).toEqual([
      "go@0", "go@60",
      "short@117", "short@118", "short@119", "go@120",
      "short@177", "short@178", "short@179", "end@180",
    ]);
  });
  it("skipping the last EMOM round ends the workout with one end signal", () => {
    expect(summary(runWithSkips(emom, [130], 200)).slice(-1)).toEqual(["end@180"]);
    const cues = runWithSkips(emom, [130], 200);
    expect(cues.filter((c) => c.kind === "end")).toHaveLength(1);
  });
  it("two quick skips never replay a beep", () => {
    const cues = runWithSkips(emom, [5, 5.1, 5.2], 200);
    const times = cues.map((c) => c.at);
    expect(new Set(times).size).toBe(times.length);
  });
  it("nothing to skip during AMRAP / For Time work or when done", () => {
    expect(skip(amrap, start(T0), at(20))).toBeNull();
    expect(skip(forTime, start(T0), at(20))).toBeNull();
    expect(skip(amrap, finish(start(T0), at(20)), at(30))).toBeNull();
  });
  it("skip while paused stays paused at the boundary", () => {
    const r = skip(amrap, pause(start(T0), at(4)), at(6))!;
    expect(snapshot(amrap, r.run, at(30))).toMatchObject({ paused: true, phase: "work", displaySec: 60 });
  });
});

group("finish", () => {
  it("ends AMRAP / EMOM early with DONE and no result time", () => {
    expect(snapshot(amrap, finish(start(T0), at(30)), at(31))).toMatchObject({ phase: "done", resultSec: null });
    expect(snapshot(emom, finish(start(T0), at(90)), at(91))).toMatchObject({ phase: "done", resultSec: null });
  });
  it("works during the countdown", () => {
    expect(snapshot(forTime, finish(start(T0), at(4)), at(5))).toMatchObject({ phase: "done", resultSec: 0 });
  });
});
