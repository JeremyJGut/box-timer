import "./style.css";
import type { User } from "firebase/auth";
import {
  isCoach, probeServerWrite, signInWithGoogle, signOutUser, watchUser, ALLOWED_DOMAIN,
} from "./auth.ts";
import { usingEmulators } from "./firebase.ts";
import { el } from "./dom.ts";
import { mountCoach } from "./coach.ts";
import { mountTimer } from "./timer/mount.ts";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app not found");
const app: HTMLDivElement = root;

function render(...children: Node[]): void {
  const banner = usingEmulators
    ? [el("p", { className: "emu-banner", text: "EMULATOR MODE: local test data, not production" })]
    : [];
  app.replaceChildren(...banner, el("main", { className: "page" }, ...children));
}

// ---------- Routing ----------
const timerMatch = location.pathname.match(/^\/t\/([A-Za-z0-9]+)\/?$/);
if (timerMatch?.[1]) {
  void mountTimer(app, timerMatch[1]);
} else {
  document.body.classList.add("coach-body");
  render(el("p", { className: "muted", text: "Loading…" }));
  let current: string | null = null;
  watchUser((user) => {
    const key = user ? user.uid : "";
    if (key === current) return; // ignore token refreshes for the same user
    current = key;
    if (!user) showSignedOut();
    else if (isCoach(user)) mountCoach(user, render);
    else showRefused(user);
  });
}

function showSignedOut(): void {
  const error = el("p", { className: "error", attrs: { role: "alert" } });
  const button = el("button", {
    className: "primary",
    text: "Sign in with Google",
    onClick: async () => {
      button.disabled = true;
      const msg = await signInWithGoogle();
      button.disabled = false;
      if (msg) error.textContent = msg;
    },
  });
  render(
    el("section", { className: "hero" },
      el("div", { className: "hero-text" },
        el("p", { className: "eyebrow", text: "For Time · AMRAP · EMOM" }),
        el("h1", { className: "hero-title", text: "Box Timer" }),
        el("p", { className: "hero-lead", text: "Set up today's workout, run it on the phone by the rig." }),
        button,
        error,
        el("p", { className: "muted small", text: `Coaches sign in with their @${ALLOWED_DOMAIN} Google account.` }),
      ),
      el("div", { className: "hero-visual", attrs: { "aria-hidden": "true" } },
        el("p", { className: "hero-phase", text: "AMRAP" }),
        el("p", { className: "hero-clock", text: "12:00" }),
      ),
    ),
  );
}

function showRefused(user: User): void {
  const result = el("p", { className: "probe", attrs: { "aria-live": "polite" } });
  const probe = el("button", {
    text: "Verify server-side block",
    onClick: async () => {
      probe.disabled = true;
      result.className = "probe";
      result.textContent = "Trying a direct Firestore write with this account…";
      const r = await probeServerWrite(user);
      if (r === "blocked") {
        result.className = "probe ok";
        result.textContent = "Write blocked by Firestore rules (permission-denied). The server enforces the domain.";
      } else if (r === "allowed") {
        result.className = "probe bad";
        result.textContent = "Write was ALLOWED. The rules are not working.";
      } else {
        result.className = "probe bad";
        result.textContent = `Unexpected error: ${r.error}`;
      }
      probe.disabled = false;
    },
  });
  const reason = user.emailVerified
    ? `Only @${ALLOWED_DOMAIN} accounts can set up workouts.`
    : "This Google account's email is not verified.";
  render(
    el("p", { className: "eyebrow eyebrow-bad", text: "Box Timer" }),
    el("h1", { text: "Access denied" }),
    el("p", { className: "error", text: `${user.email ?? "This account"} can't use Box Timer. ${reason}` }),
    el("p", { text: `Sign out and use your @${ALLOWED_DOMAIN} account.` }),
    el("div", { className: "row" },
      el("button", { className: "primary", text: "Sign out", onClick: () => void signOutUser() }),
      probe,
    ),
    result,
  );
}
