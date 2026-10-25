// Phone entry for /t/<id>: load the workout (no login), then the start screen.
import { el } from "../dom.ts";
import { getWorkout } from "../store.ts";
import { showStartScreen } from "./view.ts";

export async function mountTimer(root: HTMLElement, id: string): Promise<void> {
  document.body.className = "timer-body";
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
      el("button", { className: "start", text: "Try again", onClick: () => location.reload() }),
    ));
  }
}
