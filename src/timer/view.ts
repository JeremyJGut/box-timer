// Phone timer UI (spec §6, §8). Rendering only; timing comes from engine.ts.
import { el } from "../dom.ts";
import type { SavedWorkout } from "../store.ts";
import { MODE_LABEL, describe, describeCountdown, formatClock, type Workout } from "../workout.ts";
import { playCue, resumeAudio, unlockAudio } from "./audio.ts";
import { dueCues, finish, pause, resume, snapshot, start, type RunState, type Snapshot } from "./engine.ts";
import { enterFullscreen, exitFullscreen, isIOS, isStandalone } from "./platform.ts";
import { keepAwake, reacquireIfNeeded, releaseAwake, type AwakeStatus } from "./wakelock.ts";

const TICK_MS = 100;
const CONTROLS_MS = 5000;
const CLOCK_FONT = `800 100px "Roboto Condensed", "Arial Narrow", "Helvetica Neue", system-ui, sans-serif`;

// ---------- Start screen ----------
export function showStartScreen(root: HTMLElement, s: SavedWorkout): void {
  const w = s.workout;
  document.body.className = "timer-body";
  const ios = isIOS();

  const testBtn = el("button", {
    className: "ghost", text: "Test sound",
    onClick: () => { unlockAudio(); playCue("go"); },
  });

  root.replaceChildren(el("main", { className: "phone" },
    el("p", { className: "phase-label", text: describe(w) }),
    el("h1", { className: "phone-title", text: w.name }),
    el("p", { className: "muted", text: describeCountdown(w.countdownSec) }),
    ...(w.notes ? [el("p", { className: "notes", text: w.notes })] : []),
    el("button", { className: "start", text: "Start", onClick: () => startRun(root, s) }),
    testBtn,
    ...(ios ? [el("p", { className: "hint-ios", text: "No sound? Turn off silent mode (switch on the side)." })] : []),
    ...(ios && !isStandalone()
      ? [el("p", { className: "hint-ios", text: "For full screen: Share → Add to Home Screen, then open from there." })]
      : []),
  ));
}

// ---------- Running ----------
function startRun(root: HTMLElement, s: SavedWorkout): void {
  const w = s.workout;
  // Everything that needs the user gesture happens synchronously here.
  unlockAudio();
  enterFullscreen();
  const awakeNote = el("p", { className: "awake-note" });
  keepAwake((status: AwakeStatus) => {
    awakeNote.textContent = status === "failed" ? "Screen may turn off: set Auto-Lock to Never." : "";
  });

  let run: RunState = start(Date.now());
  let lastT = -1;          // timeline position of the previous frame (for beeps)
  let lastKey = "";        // what is on screen, to touch the DOM only on change
  let controlsTimer = 0;
  let resetArmed = false;

  const label = el("p", { className: "run-label" });
  const clock = el("p", { className: "run-clock" });
  const sub = el("p", { className: "run-sub" });
  const notes = el("p", { className: "run-notes", text: w.notes });

  const pauseBtn = el("button", { className: "ctl", text: "Pause" });
  const doneBtn = el("button", { className: "ctl", text: "Done" });
  const resetBtn = el("button", { className: "ctl", text: "Reset" });
  const controls = el("div", { className: "controls", attrs: { hidden: "" } }, pauseBtn, doneBtn, resetBtn);

  const screen = el("main", { className: "run phase-ready" }, label, clock, sub, notes, controls, awakeNote);
  root.replaceChildren(screen);

  // ----- controls (tap anywhere shows them for 5 s) -----
  function showControls(): void {
    controls.hidden = false;
    clearTimeout(controlsTimer);
    controlsTimer = window.setTimeout(hideControls, CONTROLS_MS);
  }
  function hideControls(): void {
    controls.hidden = true;
    resetArmed = false;
    resetBtn.textContent = "Reset";
  }
  screen.addEventListener("click", (ev) => {
    if (ev.target instanceof HTMLButtonElement) return;
    resumeAudio();
    if (controls.hidden) showControls(); else hideControls();
  });
  pauseBtn.addEventListener("click", () => {
    const now = Date.now();
    run = run.pausedAt === null ? pause(run, now) : resume(run, now);
    if (run.pausedAt === null) unlockAudio(); // a tap: good moment to re-unlock
    showControls();
    tick();
  });
  doneBtn.addEventListener("click", () => {
    run = finish(run, Date.now());
    playCue("end");
    lastT = Number.POSITIVE_INFINITY; // no more beeps
    showControls();
    tick();
  });
  resetBtn.addEventListener("click", () => {
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.textContent = "Tap again to reset";
      showControls();
      return;
    }
    stop();
    showStartScreen(root, s);
  });

  // ----- frame loop (time from the clock, not from counting ticks) -----
  function tick(): void {
    const snap = snapshot(w, run, Date.now());
    if (!snap.paused && snap.t > lastT) {
      for (const cue of dueCues(w, lastT, snap.t)) playCue(cue.kind);
      lastT = snap.t;
    }
    render(snap);
    if (snap.phase === "done") window.clearInterval(interval);
  }

  function render(snap: Snapshot): void {
    const key = `${snap.phase}|${snap.paused}|${snap.displaySec}|${snap.round}`;
    if (key === lastKey) return;
    lastKey = key;

    const cls = snap.paused ? "phase-paused" : `phase-${snap.phase}`;
    screen.className = `run ${cls}`;
    label.textContent = labelFor(w, snap);

    let clockText: string;
    if (snap.phase === "done") clockText = w.mode === "fortime" ? formatClock(snap.resultSec ?? 0) : "DONE";
    else clockText = formatClock(snap.displaySec);
    if (clock.textContent !== clockText) {
      clock.textContent = clockText;
      fitClock(clock, clockText);
    }
    sub.textContent = snap.phase === "done" && w.mode === "fortime" ? "DONE" : snap.paused ? "PAUSED" : "";

    pauseBtn.textContent = snap.paused ? "Resume" : "Pause";
    pauseBtn.hidden = snap.phase === "done";
    doneBtn.hidden = !(w.mode === "fortime" && snap.phase === "work");
  }

  const onResize = () => { if (clock.textContent) fitClock(clock, clock.textContent); };
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    resumeAudio();
    void reacquireIfNeeded();
    tick();
  };
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisible);

  const interval = window.setInterval(tick, TICK_MS);
  tick();

  function stop(): void {
    window.clearInterval(interval);
    clearTimeout(controlsTimer);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisible);
    releaseAwake();
    exitFullscreen();
  }
}

function labelFor(w: Workout, s: Snapshot): string {
  if (s.phase === "done") return w.mode === "fortime" ? "For Time" : MODE_LABEL[w.mode];
  if (s.phase === "ready") return `Get ready · ${MODE_LABEL[w.mode]}`;
  if (w.mode === "emom") return `EMOM · Round ${s.round ?? 1} / ${s.rounds ?? w.rounds}`;
  if (w.mode === "fortime") return `For Time · cap ${formatClock(w.capSec)}`;
  return MODE_LABEL[w.mode];
}

// ---------- Digit sizing: largest size that fits (spec §6.8) ----------
let measureCtx: CanvasRenderingContext2D | null = null;

function fitClock(clock: HTMLElement, text: string): void {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return;
  measureCtx.font = CLOCK_FONT;
  // Measure with the widest digit so the size doesn't jump every second.
  const widthAt100 = measureCtx.measureText(text.replace(/\d/g, "0")).width || 300;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const byWidth = (vw * 0.92 * 100) / widthAt100;
  const byHeight = vh * (vw > vh ? 0.55 : 0.45); // landscape: 55% of height (spec: 40%+)
  clock.style.fontSize = `${Math.floor(Math.min(byWidth, byHeight))}px`;
}
