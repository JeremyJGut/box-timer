// Fullscreen and iPhone detection (spec §6.7).
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type WebkitDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia("(display-mode: standalone)").matches;
}

/** Call inside the Start tap. Works on Android/desktop; iPhone has no page fullscreen. */
export function enterFullscreen(): void {
  const el = document.documentElement as WebkitEl;
  try {
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    else void el.webkitRequestFullscreen?.();
  } catch { /* not allowed */ }
}

export function exitFullscreen(): void {
  const d = document as WebkitDoc;
  try {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (d.webkitFullscreenElement) d.webkitExitFullscreen?.();
  } catch { /* ignore */ }
}
