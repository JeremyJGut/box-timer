import type { User } from "firebase/auth";
import QRCode from "qrcode";
import { el } from "./dom.ts";
import { signOutUser } from "./auth.ts";
import {
  createWorkout, deleteWorkout, listMine, phoneUrl, updateWorkout, type SavedWorkout,
} from "./store.ts";
import {
  COUNTDOWN_OPTIONS, LIMITS, MODE_LABEL, defaultFormValues, describe, describeCountdown,
  toFormValues, validateForm, type FieldName, type FormValues, type Mode,
} from "./workout.ts";

type Render = (...children: Node[]) => void;

export function mountCoach(user: User, render: Render): void {
  const email = user.email ?? "";

  function header(title: string, ...extra: Node[]): HTMLElement {
    return el("header", { className: "row spread" },
      el("h1", { text: title }),
      el("div", { className: "row" },
        ...extra,
        el("span", { className: "muted small", text: email }),
        el("button", { text: "Sign out", onClick: () => void signOutUser() }),
      ),
    );
  }

  // ---------- List ----------
  async function showList(): Promise<void> {
    const body = el("div", {}, el("p", { className: "muted", text: "Loading your workouts…" }));
    render(
      header("My workouts", el("button", { className: "primary", text: "New workout", onClick: () => showForm(null) })),
      body,
    );
    try {
      const items = await listMine(email);
      if (items.length === 0) {
        body.replaceChildren(el("p", { className: "muted", text: "No workouts yet. Create your first one." }));
        return;
      }
      body.replaceChildren(el("ul", { className: "list" }, ...items.map(listItem)));
    } catch (err) {
      body.replaceChildren(errorText("Couldn't load your workouts", err));
    }
  }

  function listItem(s: SavedWorkout): HTMLElement {
    const del = confirmButton("Delete", "Tap again to delete", async () => {
      await deleteWorkout(s.id);
      await showList();
    });
    return el("li", { className: "card" },
      el("div", {},
        el("strong", { text: s.workout.name }),
        el("div", { className: "muted small", text: `${describe(s.workout)} · ${describeCountdown(s.workout.countdownSec)}` }),
      ),
      el("div", { className: "row" },
        el("button", { className: "primary", text: "Open on phone", onClick: () => void showSaved(s) }),
        el("button", { text: "Edit", onClick: () => showForm(s) }),
        del,
      ),
    );
  }

  // ---------- Form (new + edit) ----------
  function showForm(existing: SavedWorkout | null): void {
    const values: FormValues = existing ? toFormValues(existing.workout) : defaultFormValues();
    const touched = new Set<FieldName>();
    let attempted = false;

    const errorEls = new Map<FieldName, HTMLElement>();
    function errorFor(f: FieldName): HTMLElement {
      const e = el("p", { className: "field-error", attrs: { id: `err-${f}`, "aria-live": "polite" } });
      errorEls.set(f, e);
      return e;
    }

    function input(f: FieldName, type: string, attrs: Record<string, string> = {}): HTMLInputElement {
      const i = el("input", { attrs: { id: `f-${f}`, name: f, type, "aria-describedby": `err-${f}`, ...attrs } });
      i.value = values[f];
      i.addEventListener("input", () => { (values as Record<FieldName, string>)[f] = i.value; update(); });
      i.addEventListener("blur", () => { touched.add(f); update(); });
      return i;
    }

    function field(f: FieldName, label: string, control: HTMLElement, hint = ""): HTMLElement {
      return el("div", { className: "field", attrs: { "data-field": f } },
        el("label", { text: label, attrs: { for: `f-${f}` } }),
        control,
        ...(hint ? [el("p", { className: "hint", text: hint })] : []),
        errorFor(f),
      );
    }

    // Mode: three segmented buttons
    const modeButtons = (Object.keys(MODE_LABEL) as Mode[]).map((m) => {
      const b = el("button", {
        className: "seg", text: MODE_LABEL[m],
        attrs: { type: "button", role: "radio" },
        onClick: () => { values.mode = m; update(); },
      });
      b.dataset.mode = m;
      return b;
    });
    const modeGroup = el("div", { className: "segmented", attrs: { role: "radiogroup", "aria-label": "Mode" } }, ...modeButtons);

    const countdown = el("select", { attrs: { id: "f-countdownSec", name: "countdownSec" } },
      ...COUNTDOWN_OPTIONS.map((s) => el("option", { text: s === 0 ? "None" : `${s} s`, attrs: { value: String(s) } })),
    );
    countdown.value = values.countdownSec;
    countdown.addEventListener("change", () => { values.countdownSec = countdown.value; update(); });

    const notes = el("textarea", { attrs: { id: "f-notes", name: "notes", rows: "3", "aria-describedby": "err-notes" } });
    notes.value = values.notes;
    const notesCount = el("p", { className: "hint" });
    notes.addEventListener("input", () => { values.notes = notes.value; touched.add("notes"); update(); });

    const modeFields = {
      fortime: field("capMin", "Time cap (minutes)", input("capMin", "number", { min: "1", max: "60", step: "1", inputmode: "numeric" })),
      amrap: field("durationMin", "Duration (minutes)", input("durationMin", "number", { min: "1", max: "60", step: "1", inputmode: "numeric" })),
      emom: el("div", { className: "row top" },
        field("interval", "Interval (m:ss)", input("interval", "text", { placeholder: "1:00", inputmode: "numeric" }), "0:30 to 5:00"),
        field("rounds", "Rounds", input("rounds", "number", { min: "1", max: "60", step: "1", inputmode: "numeric" })),
      ),
    };

    const summary = el("p", { className: "summary" });
    const saveBtn = el("button", { className: "primary", text: "Save workout", attrs: { type: "submit" } });
    const saveError = el("p", { className: "error", attrs: { role: "alert" } });

    const form = el("form", { className: "form", attrs: { novalidate: "" } },
      field("name", "Name", input("name", "text", { maxlength: String(LIMITS.nameMax), autocomplete: "off", placeholder: "e.g. Fran" })),
      el("div", { className: "field" }, el("span", { className: "label", text: "Mode" }), modeGroup),
      modeFields.fortime, modeFields.amrap, modeFields.emom,
      field("countdownSec", "Countdown before start", countdown),
      field("notes", "Notes / movements (shown on the phone)", notes),
      notesCount,
      el("div", { className: "row" },
        saveBtn,
        el("button", { text: "Cancel", attrs: { type: "button" }, onClick: () => void showList() }),
      ),
      saveError,
    );

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      attempted = true;
      const r = validateForm(values);
      update();
      if (!r.ok) return;
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      saveError.textContent = "";
      try {
        let saved: SavedWorkout;
        if (existing && existing.createdAt) {
          await updateWorkout(existing.id, r.workout, email, existing.createdAt);
          saved = { ...existing, workout: r.workout };
        } else {
          const id = await createWorkout(r.workout, email);
          saved = { id, workout: r.workout, createdAt: null, updatedAtMs: Date.now() };
        }
        await showSaved(saved);
      } catch (err) {
        saveError.textContent = messageOf("Couldn't save", err);
        saveBtn.disabled = false;
        saveBtn.textContent = "Save workout";
      }
    });

    function update(): void {
      for (const b of modeButtons) {
        const on = b.dataset.mode === values.mode;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
      }
      modeFields.fortime.hidden = values.mode !== "fortime";
      modeFields.amrap.hidden = values.mode !== "amrap";
      modeFields.emom.hidden = values.mode !== "emom";

      const r = validateForm(values);
      const errors = r.ok ? {} : r.errors;
      for (const [f, e] of errorEls) {
        const msg = errors[f] ?? "";
        const show = attempted || touched.has(f);
        e.textContent = show ? msg : "";
        form.querySelector(`#f-${f}`)?.setAttribute("aria-invalid", String(show && msg !== ""));
      }
      notesCount.textContent = `${values.notes.trim().length} / ${LIMITS.notesMax}`;
      saveBtn.disabled = !r.ok;
      summary.textContent = r.ok
        ? `${describe(r.workout)} · ${describeCountdown(r.workout.countdownSec)}`
        : "Fill in the highlighted fields.";
    }

    render(
      header(existing ? "Edit workout" : "New workout"),
      el("div", { className: "form-layout" },
        form,
        el("aside", { className: "side" }, el("span", { className: "label", text: "Summary" }), summary),
      ),
    );
    update();
    form.querySelector<HTMLInputElement>("#f-name")?.focus();
  }

  // ---------- Saved: QR + link ----------
  async function showSaved(s: SavedWorkout): Promise<void> {
    const url = phoneUrl(s.id);
    const qr = el("img", { className: "qr", attrs: { alt: `QR code for ${url}`, width: "320", height: "320" } });
    const copyBtn = el("button", {
      text: "Copy link",
      onClick: async () => {
        try { await navigator.clipboard.writeText(url); copyBtn.textContent = "Copied"; }
        catch { copyBtn.textContent = "Copy failed: select the link"; }
        setTimeout(() => { copyBtn.textContent = "Copy link"; }, 2000);
      },
    });
    render(
      header(s.workout.name),
      el("p", { className: "summary", text: `${describe(s.workout)} · ${describeCountdown(s.workout.countdownSec)}` }),
      el("div", { className: "saved" },
        qr,
        el("div", {},
          el("p", { text: "Scan with the phone by the rig. No login needed." }),
          el("p", {}, el("a", { className: "link", text: url, attrs: { href: url, target: "_blank", rel: "noopener" } })),
          el("div", { className: "row" },
            copyBtn,
            el("button", { text: "Edit", onClick: () => showForm(s) }),
            el("button", { className: "primary", text: "Back to my workouts", onClick: () => void showList() }),
          ),
        ),
      ),
    );
    qr.src = await QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M" });
  }

  void showList();
}

// ---------- helpers ----------
function confirmButton(label: string, confirmLabel: string, action: () => Promise<void>): HTMLButtonElement {
  let armed = false;
  let timer = 0;
  const b = el("button", {
    className: "danger", text: label,
    onClick: async () => {
      if (!armed) {
        armed = true;
        b.textContent = confirmLabel;
        timer = window.setTimeout(() => { armed = false; b.textContent = label; }, 4000);
        return;
      }
      clearTimeout(timer);
      b.disabled = true;
      try { await action(); } catch (err) { b.disabled = false; b.textContent = messageOf("Failed", err); }
    },
  });
  return b;
}

function messageOf(prefix: string, err: unknown): string {
  const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
  if (code === "permission-denied") return `${prefix}: permission denied. Only @yaqbot.com coaches can change workouts.`;
  return `${prefix}: ${err instanceof Error ? err.message : String(err)}`;
}

function errorText(prefix: string, err: unknown): HTMLElement {
  return el("p", { className: "error", text: messageOf(prefix, err) });
}
