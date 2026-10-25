import { FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase.ts";

export const ALLOWED_DOMAIN = "yaqbot.com";

/** UI-side check, for a clear message. The real lock is firestore.rules. */
export function isCoach(user: User): boolean {
  const email = user.email?.toLowerCase() ?? "";
  return user.emailVerified && email.endsWith(`@${ALLOWED_DOMAIN}`);
}

export function watchUser(cb: (user: User | null) => void): void {
  onAuthStateChanged(auth, cb);
}

/** Returns an error message to show, or null on success / user cancel. */
export async function signInWithGoogle(): Promise<string | null> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
    return null;
  } catch (err) {
    if (err instanceof FirebaseError) {
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
        return null;
      }
      if (err.code === "auth/popup-blocked") {
        return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
      }
      return `Sign-in failed (${err.code}).`;
    }
    return "Sign-in failed.";
  }
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

export type ProbeResult = "blocked" | "allowed" | { error: string };

/**
 * Proof for AC2: tries a real, fully valid workout write with the current
 * account's token. The payload passes every field check, so a non-@yaqbot.com
 * account can only be rejected by the domain rule on the server.
 */
export async function probeServerWrite(user: User): Promise<ProbeResult> {
  try {
    await addDoc(collection(db, "workouts"), {
      name: "Rules probe",
      mode: "amrap",
      durationSec: 600,
      countdownSec: 10,
      notes: "",
      ownerEmail: (user.email ?? "").toLowerCase(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return "allowed";
  } catch (err) {
    if (err instanceof FirebaseError && err.code === "permission-denied") return "blocked";
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
