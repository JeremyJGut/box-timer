import "./style.css";
import type { User } from "firebase/auth";
import {
  isCoach,
  probeServerWrite,
  signInWithGoogle,
  signOutUser,
  watchUser,
  ALLOWED_DOMAIN,
} from "./auth.ts";
import { usingEmulators } from "./firebase.ts";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app not found");
const app: HTMLDivElement = root;

/** Tiny DOM helper: text goes through textContent, never innerHTML. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; onClick?: () => void } = {},
  ...children: Node[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.onClick) node.addEventListener("click", props.onClick);
  node.append(...children);
  return node;
}

function render(...children: Node[]): void {
  const banner = usingEmulators
    ? [el("p", { className: "emu-banner", text: "EMULATOR MODE: local test data, not production" })]
    : [];
  app.replaceChildren(...banner, el("main", { className: "page" }, ...children));
}

// ---------- Phone route (/t/<id>): no login. Built in M5. ----------
const timerMatch = location.pathname.match(/^\/t\/([A-Za-z0-9]+)\/?$/);
if (timerMatch) {
  document.body.classList.add("timer-body");
  render(el("h1", { text: "Timer" }), el("p", { text: `Workout ${timerMatch[1]} (timer comes in M5).` }));
} else {
  document.body.classList.add("coach-body");
  render(el("p", { className: "muted", text: "Loading…" }));
  watchUser((user) => {
    if (!user) showSignedOut();
    else if (isCoach(user)) showCoach(user);
    else showRefused(user);
  });
}

function showSignedOut(message: string | null = null): void {
  const error = el("p", { className: "error", text: message ?? "" });
  error.setAttribute("role", "alert");
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
    el("h1", { text: "Box Timer" }),
    el("p", { text: `Coaches sign in with their @${ALLOWED_DOMAIN} Google account.` }),
    button,
    error,
  );
}

function showRefused(user: User): void {
  const result = el("p", { className: "probe" });
  result.setAttribute("aria-live", "polite");
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

function showCoach(user: User): void {
  render(
    el("div", { className: "row spread" },
      el("h1", { text: "My workouts" }),
      el("button", { text: "Sign out", onClick: () => void signOutUser() }),
    ),
    el("p", { className: "muted", text: `Signed in as ${user.email ?? ""}` }),
    el("p", { text: "Workout list and form come in M3." }),
  );
}
