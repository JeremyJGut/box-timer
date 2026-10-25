// Phone timer UI (spec §6, §8). Rendering only; timing comes from engine.ts.
import { el } from "../dom.ts";
import type { SavedWorkout } from "../store.ts";
import { MODE_LABEL, describe, describeCountdown, formatClock, type Workout } from "../workout.ts";
import { playCue, resumeAudio, unlockAudio } from "./audio.ts";
import { confettiBurst } from "./confetti.ts";
import { dueCues, finish, pause, resume, skip, snapshot, start, type RunState, type Snapshot } from "./engine.ts";
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
  const sub = el("p", { className: "run-sub" }); // "Next up …", PAUSED or DONE
  const notes = el("p", { className: "run-notes", text: w.notes });

  const stat = (name: string) => {
    const value = el("span", { className: "stat-value" });
    const box = el("div", { className: "stat" }, el("span", { className: "stat-name", text: name }), value);
    return { box, value };
  };
  const statElapsed = stat("Elapsed");
  const statRound = stat("Round");
  const statLeft = stat("Time left");
  statRound.box.hidden = w.mode !== "emom";
  const stats = el("div", { className: "stats" }, statElapsed.box, statRound.box, statLeft.box);

  const ring = createRing();

  const pauseBtn = el("button", { className: "ctl", text: "Pause" });
  const skipBtn = el("button", { className: "ctl", text: "Skip" });
  const finishBtn = el("button", { className: "ctl", text: w.mode === "fortime" ? "Done" : "Finish" });
  const resetBtn = el("button", { className: "ctl", text: "Reset" });
  const controls = el("div", { className: "controls", attrs: { hidden: "" } }, pauseBtn, skipBtn, finishBtn, resetBtn);

  const middle = el("div", { className: "run-middle" }, label, clock, sub);
  const screen = el("main", { className: "run phase-ready" }, ring.svg, stats, middle, notes, controls, awakeNote);
  root.replaceChildren(screen);
  ring.layout();
  let celebrated = false;

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
  skipBtn.addEventListener("click", () => {
    const r = skip(w, run, Date.now());
    if (r) {
      run = r.run;
      lastT = Math.max(lastT, r.cursor); // only the boundary's own beep plays, once
    }
    showControls();
    tick();
  });
  finishBtn.addEventListener("click", () => {
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
    ring.set(snap.progress); // smooth; one attribute, only when the value changes
    const key = `${snap.phase}|${snap.paused}|${snap.displaySec}|${snap.round}|${snap.elapsedSec}`;
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
    sub.textContent = snap.phase === "done"
      ? (w.mode === "fortime" ? "DONE" : "Well done")
      : snap.paused ? "PAUSED" : nextText(snap);

    statElapsed.value.textContent = formatClock(snap.elapsedSec);
    statRound.value.textContent = snap.rounds ? `${snap.round ?? snap.rounds}/${snap.rounds}` : "";
    statLeft.value.textContent = formatClock(snap.leftSec);

    const done = snap.phase === "done";
    pauseBtn.textContent = snap.paused ? "Resume" : "Pause";
    pauseBtn.hidden = done;
    finishBtn.hidden = done;
    skipBtn.hidden = done || !(snap.phase === "ready" || w.mode === "emom");
    if (done && !celebrated) {
      celebrated = true;
      confettiBurst(screen);
    }
  }

  const onResize = () => {
    ring.layout();
    if (clock.textContent) fitClock(clock, clock.textContent);
  };
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

function nextText(s: Snapshot): string {
  if (!s.next) return "";
  if (s.next.kind === "round") return `Next up: Round ${s.next.round}`;
  if (s.next.kind === "work") return "Next up: Go";
  return "Next up: Finish";
}

// ---------- Progress ring: rounded rectangle tracing the screen edge ----------
// A circle would have to shrink the digits in portrait; the edge ring does not.
const SVG_NS = "http://www.w3.org/2000/svg";
function createRing(): { svg: SVGSVGElement; layout: () => void; set: (p: number) => void } {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "ring");
  svg.setAttribute("aria-hidden", "true");
  const track = document.createElementNS(SVG_NS, "path");
  track.setAttribute("class", "ring-track");
  const bar = document.createElementNS(SVG_NS, "path");
  bar.setAttribute("class", "ring-bar");
  svg.append(track, bar);
  let length = 0;
  let lastP = -1;

  function layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const inset = 8;
    const r = Math.min(28, w / 6, h / 6);
    const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset, cx = w / 2;
    // Starts at top centre and runs clockwise.
    const d = [
      `M ${cx} ${y0}`, `H ${x1 - r}`, `A ${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
      `V ${y1 - r}`, `A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
      `H ${x0 + r}`, `A ${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
      `V ${y0 + r}`, `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`, `Z`,
    ].join(" ");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    track.setAttribute("d", d);
    bar.setAttribute("d", d);
    length = bar.getTotalLength();
    bar.style.strokeDasharray = `${length} ${length}`;
    const p = lastP;
    lastP = -1;
    set(p < 0 ? 1 : p);
  }

  function set(p: number): void {
    const clamped = Math.max(0, Math.min(1, p));
    if (Math.abs(clamped - lastP) < 0.0005) return;
    lastP = clamped;
    // Deplete from the end of the path so the remaining bar starts at top centre.
    bar.style.strokeDashoffset = String(-length * (1 - clamped));
  }

  return { svg, layout, set };
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
