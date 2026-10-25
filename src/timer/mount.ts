// Phone entry for /t/<id>. M3: load and show the workout (AC4).
// M4/M5 add engine.ts, audio.ts, wakelock.ts, view.ts next to this file
// and replace showStartScreen's placeholder with the real Start flow.
import { el } from "../dom.ts";
import { getWorkout, type SavedWorkout } from "../store.ts";
import { describe, describeCountdown } from "../workout.ts";

export async function mountTimer(root: HTMLElement, id: string): Promise<void> {
  document.body.classList.add("timer-body");
  root.replaceChildren(el("main", { className: "phone" }, el("p", { className: "muted", text: "Loading workout…" })));
  try {
    const saved = await getWorkout(id);
    if (!saved) {
      root.replaceChildren(el("main", { className: "phone" },
        el("h1", { text: "Workout not found" }),
        el("p", { text: "Check the link or scan the QR code again." }),
      ));
      return;
    }
    showStartScreen(root, saved);
  } catch (err) {
    root.replaceChildren(el("main", { className: "phone" },
      el("h1", { text: "Couldn't load the workout" }),
      el("p", { text: err instanceof Error ? err.message : String(err) }),
      el("button", { className: "primary", text: "Try again", onClick: () => location.reload() }),
    ));
  }
}

function showStartScreen(root: HTMLElement, s: SavedWorkout): void {
  const w = s.workout;
  root.replaceChildren(el("main", { className: "phone" },
    el("p", { className: "phase-label", text: describe(w) }),
    el("h1", { className: "phone-title", text: w.name }),
    el("p", { className: "muted", text: describeCountdown(w.countdownSec) }),
    ...(w.notes ? [el("p", { className: "notes", text: w.notes })] : []),
    el("button", { className: "start", text: "Start", attrs: { disabled: "" } }),
    el("p", { className: "muted small", text: "Timer arrives in M5." }),
  ));
}
