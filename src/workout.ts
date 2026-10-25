// Workout model, validation and formatting. Pure: no DOM, no Firebase.
// Shared by the coach form, the phone loader and (M4) the timer engine.

export type Mode = "fortime" | "amrap" | "emom";

export type ModeSpec =
  | { mode: "fortime"; capSec: number }
  | { mode: "amrap"; durationSec: number }
  | { mode: "emom"; intervalSec: number; rounds: number };

export type Workout = ModeSpec & {
  name: string;
  notes: string;
  countdownSec: CountdownSec;
};

export const COUNTDOWN_OPTIONS = [0, 5, 10, 15] as const;
export type CountdownSec = (typeof COUNTDOWN_OPTIONS)[number];

export const MODE_LABEL: Record<Mode, string> = {
  fortime: "For Time",
  amrap: "AMRAP",
  emom: "EMOM",
};

export const LIMITS = {
  nameMax: 60,
  notesMax: 240,
  minutesMin: 1,
  minutesMax: 60,
  intervalMinSec: 30,
  intervalMaxSec: 300,
  roundsMin: 1,
  roundsMax: 60,
} as const;

/** 0 → "0:00", 75 → "1:15", 3600 → "60:00". Negative values clamp to 0. */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Total workout length in seconds (excluding the countdown). */
export function totalSec(w: ModeSpec): number {
  switch (w.mode) {
    case "fortime": return w.capSec;
    case "amrap": return w.durationSec;
    case "emom": return w.intervalSec * w.rounds;
  }
}

/** "AMRAP 12:00", "For Time · cap 20:00", "EMOM 10 × 1:00 (10:00)" */
export function describe(w: ModeSpec): string {
  switch (w.mode) {
    case "fortime": return `For Time · cap ${formatClock(w.capSec)}`;
    case "amrap": return `AMRAP ${formatClock(w.durationSec)}`;
    case "emom": return `EMOM ${w.rounds} × ${formatClock(w.intervalSec)} (${formatClock(totalSec(w))})`;
  }
}

export function describeCountdown(sec: number): string {
  return sec === 0 ? "no countdown" : `${sec} s countdown`;
}

// ---------- Form validation ----------

/** Raw strings straight from the form inputs. */
export type FormValues = {
  name: string;
  mode: Mode;
  capMin: string;
  durationMin: string;
  interval: string; // "m:ss"
  rounds: string;
  countdownSec: string;
  notes: string;
};

export type FieldName = keyof FormValues;
export type FormErrors = Partial<Record<FieldName, string>>;
export type FormResult = { ok: true; workout: Workout } | { ok: false; errors: FormErrors };

function parseWholeNumber(s: string): number | null {
  const t = s.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** "1:30" → 90, "0:45" → 45. Anything else → null. */
export function parseMinSec(s: string): number | null {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutesField(raw: string, label: string): { sec?: number; error?: string } {
  const n = parseWholeNumber(raw);
  if (n === null || n < LIMITS.minutesMin || n > LIMITS.minutesMax) {
    return { error: `${label} must be a whole number of minutes from ${LIMITS.minutesMin} to ${LIMITS.minutesMax}.` };
  }
  return { sec: n * 60 };
}

export function validateForm(v: FormValues): FormResult {
  const errors: FormErrors = {};
  const name = v.name.trim();
  if (name.length === 0) errors.name = "Give the workout a name.";
  else if (name.length > LIMITS.nameMax) errors.name = `Name can be at most ${LIMITS.nameMax} characters.`;

  const notes = v.notes.trim();
  if (notes.length > LIMITS.notesMax) errors.notes = `Notes can be at most ${LIMITS.notesMax} characters.`;

  const cd = Number(v.countdownSec);
  const countdownSec = (COUNTDOWN_OPTIONS as readonly number[]).includes(cd) ? (cd as CountdownSec) : null;
  if (countdownSec === null) errors.countdownSec = "Pick a countdown.";

  let spec: ModeSpec | null = null;
  if (v.mode === "fortime") {
    const r = minutesField(v.capMin, "Time cap");
    if (r.error) errors.capMin = r.error;
    else if (r.sec !== undefined) spec = { mode: "fortime", capSec: r.sec };
  } else if (v.mode === "amrap") {
    const r = minutesField(v.durationMin, "Duration");
    if (r.error) errors.durationMin = r.error;
    else if (r.sec !== undefined) spec = { mode: "amrap", durationSec: r.sec };
  } else {
    const interval = parseMinSec(v.interval);
    if (interval === null || interval < LIMITS.intervalMinSec || interval > LIMITS.intervalMaxSec) {
      errors.interval = "Interval must be between 0:30 and 5:00, written as m:ss (e.g. 1:00).";
    }
    const rounds = parseWholeNumber(v.rounds);
    if (rounds === null || rounds < LIMITS.roundsMin || rounds > LIMITS.roundsMax) {
      errors.rounds = `Rounds must be a whole number from ${LIMITS.roundsMin} to ${LIMITS.roundsMax}.`;
    }
    if (!errors.interval && !errors.rounds && interval !== null && rounds !== null) {
      spec = { mode: "emom", intervalSec: interval, rounds };
    }
  }

  if (Object.keys(errors).length > 0 || spec === null || countdownSec === null) {
    return { ok: false, errors };
  }
  return { ok: true, workout: { ...spec, name, notes, countdownSec } };
}

export function defaultFormValues(): FormValues {
  return {
    name: "", mode: "amrap", capMin: "20", durationMin: "12",
    interval: "1:00", rounds: "10", countdownSec: "10", notes: "",
  };
}

export function toFormValues(w: Workout): FormValues {
  const v = defaultFormValues();
  v.name = w.name;
  v.notes = w.notes;
  v.mode = w.mode;
  v.countdownSec = String(w.countdownSec);
  if (w.mode === "fortime") v.capMin = String(w.capSec / 60);
  if (w.mode === "amrap") v.durationMin = String(w.durationSec / 60);
  if (w.mode === "emom") { v.interval = formatClock(w.intervalSec); v.rounds = String(w.rounds); }
  return v;
}

// ---------- Untrusted data (Firestore) → Workout ----------

function isInt(x: unknown, lo: number, hi: number): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi;
}

/** Validates a document from Firestore. Returns null if it isn't a usable workout. */
export function parseWorkout(d: Record<string, unknown>): Workout | null {
  const { name, notes, countdownSec, mode } = d;
  if (typeof name !== "string" || typeof notes !== "string") return null;
  if (!(COUNTDOWN_OPTIONS as readonly unknown[]).includes(countdownSec)) return null;
  const base = { name, notes, countdownSec: countdownSec as CountdownSec };
  if (mode === "fortime" && isInt(d.capSec, 60, 3600)) return { ...base, mode, capSec: d.capSec };
  if (mode === "amrap" && isInt(d.durationSec, 60, 3600)) return { ...base, mode, durationSec: d.durationSec };
  if (mode === "emom" && isInt(d.intervalSec, 30, 300) && isInt(d.rounds, 1, 60)) {
    return { ...base, mode, intervalSec: d.intervalSec, rounds: d.rounds };
  }
  return null;
}
