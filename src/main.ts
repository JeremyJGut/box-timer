import "./style.css";
import { FirebaseError } from "firebase/app";
import { doc, getDoc } from "firebase/firestore";
import { app, db } from "./firebase.ts";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app not found");

root.innerHTML = `
  <main class="hello">
    <h1>Box Timer</h1>
    <p>Hello from M1. Project: <code>${app.options.projectId ?? "?"}</code></p>
    <p>Path: <code>${location.pathname}</code></p>
    <p id="status" class="status">Checking Firestore…</p>
  </main>
`;

const status = root.querySelector<HTMLParagraphElement>("#status");

async function checkFirestore(): Promise<void> {
  if (!status) return;
  try {
    // Rules deny everything in M1, so a successful read would be a red flag.
    await getDoc(doc(db, "_m1", "ping"));
    status.textContent = "Firestore reachable, but the read was ALLOWED. Rules are not deployed.";
    status.className = "status bad";
  } catch (err) {
    if (err instanceof FirebaseError && err.code === "permission-denied") {
      status.textContent = "Firestore reachable ✓ (permission-denied, as expected)";
      status.className = "status ok";
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      status.textContent = `Firestore error: ${msg}`;
      status.className = "status bad";
    }
  }
}

void checkFirestore();
