import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query,
  serverTimestamp, setDoc, where, type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase.ts";
import { parseWorkout, type Workout } from "./workout.ts";

export type SavedWorkout = {
  id: string;
  workout: Workout;
  createdAt: Timestamp | null;
  updatedAtMs: number;
};

const workouts = collection(db, "workouts");

/** Only the fields the rules allow, for the current mode (old mode fields are dropped). */
function toDoc(w: Workout): Record<string, unknown> {
  const base = { name: w.name, mode: w.mode, countdownSec: w.countdownSec, notes: w.notes };
  switch (w.mode) {
    case "fortime": return { ...base, capSec: w.capSec };
    case "amrap": return { ...base, durationSec: w.durationSec };
    case "emom": return { ...base, intervalSec: w.intervalSec, rounds: w.rounds };
  }
}

function toSaved(id: string, data: Record<string, unknown>): SavedWorkout | null {
  const workout = parseWorkout(data);
  if (!workout) return null;
  const createdAt = (data.createdAt ?? null) as Timestamp | null;
  const updatedAt = data.updatedAt as Timestamp | null | undefined;
  return { id, workout, createdAt, updatedAtMs: updatedAt?.toMillis() ?? Date.now() };
}

export async function listMine(email: string): Promise<SavedWorkout[]> {
  const snap = await getDocs(query(workouts, where("ownerEmail", "==", email.toLowerCase())));
  const list: SavedWorkout[] = [];
  snap.forEach((d) => {
    const s = toSaved(d.id, d.data());
    if (s) list.push(s);
  });
  // Sorted here instead of orderBy, so no composite index is needed.
  return list.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

/** Used by the phone: no login needed (rules allow get by id). */
export async function getWorkout(id: string): Promise<SavedWorkout | null> {
  const snap = await getDoc(doc(db, "workouts", id));
  return snap.exists() ? toSaved(snap.id, snap.data()) : null;
}

export async function createWorkout(w: Workout, email: string): Promise<string> {
  const ref = await addDoc(workouts, {
    ...toDoc(w),
    ownerEmail: email.toLowerCase(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Full overwrite, so fields from a previous mode disappear (rules use hasOnly). */
export async function updateWorkout(id: string, w: Workout, email: string, createdAt: Timestamp): Promise<void> {
  await setDoc(doc(db, "workouts", id), {
    ...toDoc(w),
    ownerEmail: email.toLowerCase(),
    createdAt,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWorkout(id: string): Promise<void> {
  await deleteDoc(doc(db, "workouts", id));
}

export function phoneUrl(id: string): string {
  return `${location.origin}/t/${id}`;
}
