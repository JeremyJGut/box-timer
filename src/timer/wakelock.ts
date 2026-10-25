// Keep the screen on (spec §6.6): Wake Lock API, NoSleep.js fallback, else a note.
import NoSleep from "nosleep.js";

export type AwakeStatus = "on" | "fallback" | "failed";

let sentinel: WakeLockSentinel | null = null;
let noSleep: NoSleep | null = null;
let wanted = false;
let onStatus: (s: AwakeStatus) => void = () => {};

async function requestLock(): Promise<boolean> {
  if (!("wakeLock" in navigator)) return false;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    sentinel.addEventListener("release", () => { sentinel = null; });
    return true;
  } catch {
    return false;
  }
}

function startNoSleep(): Promise<boolean> {
  try {
    noSleep ??= new NoSleep();
    return noSleep.enable().then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** Must be called inside the Start tap (NoSleep needs the gesture on iOS). */
export function keepAwake(cb: (s: AwakeStatus) => void): void {
  wanted = true;
  onStatus = cb;
  if (!("wakeLock" in navigator)) {
    // Start the fallback synchronously, while we are still inside the tap.
    void startNoSleep().then((ok) => onStatus(ok ? "fallback" : "failed"));
    return;
  }
  void requestLock().then(async (ok) => {
    if (ok) return onStatus("on");
    onStatus((await startNoSleep()) ? "fallback" : "failed");
  });
}

/** The browser drops the lock when the page is hidden; take it again on return. */
export async function reacquireIfNeeded(): Promise<void> {
  if (!wanted || sentinel || noSleep?.isEnabled) return;
  const ok = await requestLock();
  onStatus(ok ? "on" : "failed");
}

export function releaseAwake(): void {
  wanted = false;
  void sentinel?.release().catch(() => {});
  sentinel = null;
  noSleep?.disable();
}
