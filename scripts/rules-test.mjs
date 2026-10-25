// Firestore rules test, run against the local emulators: `npm run test:rules`.
// Each client signs in with a fake Google token (the Auth emulator accepts them),
// then tries real reads/writes. The rules file under test is ../firestore.rules.
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, addDoc, collection, serverTimestamp,
  getDoc, doc, updateDoc, deleteDoc, getDocs, query, where,
} from "firebase/firestore";

let n = 0;
let fails = 0;

async function client(email, verified = true) {
  const app = initializeApp({ apiKey: "test", projectId: "box-timer-yaqbot", authDomain: "test" }, `c${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  if (email) {
    const token = JSON.stringify({ sub: `${email}-${verified}`, email, email_verified: verified });
    await signInWithCredential(auth, GoogleAuthProvider.credential(token));
  }
  return { app, db };
}

function workout(owner, extra = {}) {
  return {
    name: "Test", mode: "amrap", durationSec: 600, countdownSec: 10, notes: "",
    ownerEmail: owner, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
  };
}
function without(obj, key) { const c = { ...obj }; delete c[key]; return c; }

async function expect(label, shouldAllow, fn) {
  let allowed;
  try { await fn(); allowed = true; } catch (e) {
    allowed = false;
    if (e.code !== "permission-denied") console.log(`      unexpected error: ${e.code} ${e.message}`);
  }
  const ok = allowed === shouldAllow;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(46)} ${allowed ? "allowed" : "denied"}`);
}

const gmail = await client("jeremiasjgut@gmail.com");
const hola = await client("hola@yaqbot.com");
const other = await client("coach2@yaqbot.com");
const unverified = await client("fake@yaqbot.com", false);
const upper = await client("HOLA@YAQBOT.COM");
const lookalike = await client("x@yaqbot.com.evil.com");
const anon = await client(null);
const col = (c) => collection(c.db, "workouts");

console.log("\n-- Who can create --");
await expect("gmail creates a valid workout", false, () => addDoc(col(gmail), workout("jeremiasjgut@gmail.com")));
await expect("gmail creates claiming a yaqbot owner", false, () => addDoc(col(gmail), workout("hola@yaqbot.com")));
await expect("unverified @yaqbot.com creates", false, () => addDoc(col(unverified), workout("fake@yaqbot.com")));
await expect("lookalike domain creates", false, () => addDoc(col(lookalike), workout("x@yaqbot.com.evil.com")));
await expect("not signed in creates", false, () => addDoc(col(anon), workout("hola@yaqbot.com")));
let ref = null;
await expect("hola creates AMRAP 10:00", true, async () => { ref = await addDoc(col(hola), workout("hola@yaqbot.com")); });
await expect("hola creates For Time cap 20:00", true, () =>
  addDoc(col(hola), without(workout("hola@yaqbot.com", { mode: "fortime", capSec: 1200 }), "durationSec")));
await expect("hola creates EMOM 10 x 1:00", true, () =>
  addDoc(col(hola), without(workout("hola@yaqbot.com", { mode: "emom", intervalSec: 60, rounds: 10 }), "durationSec")));
await expect("HOLA@YAQBOT.COM (uppercase) creates", true, () => addDoc(col(upper), workout("hola@yaqbot.com")));
await expect("hola creates owned by another coach", false, () => addDoc(col(hola), workout("coach2@yaqbot.com")));

console.log("\n-- Field validation --");
await expect("AMRAP 61 min", false, () => addDoc(col(hola), workout("hola@yaqbot.com", { durationSec: 3660 })));
await expect("name 61 chars", false, () => addDoc(col(hola), workout("hola@yaqbot.com", { name: "x".repeat(61) })));
await expect("blank name", false, () => addDoc(col(hola), workout("hola@yaqbot.com", { name: "   " })));
await expect("notes 241 chars", false, () => addDoc(col(hola), workout("hola@yaqbot.com", { notes: "x".repeat(241) })));
await expect("countdown 7 s", false, () => addDoc(col(hola), workout("hola@yaqbot.com", { countdownSec: 7 })));
await expect("AMRAP with a stray capSec", false, () => addDoc(col(hola), workout("hola@yaqbot.com", { capSec: 600 })));
await expect("unknown extra field", false, () => addDoc(col(hola), workout("hola@yaqbot.com", { hack: true })));
await expect("EMOM interval 20 s", false, () =>
  addDoc(col(hola), without(workout("hola@yaqbot.com", { mode: "emom", intervalSec: 20, rounds: 10 }), "durationSec")));

console.log("\n-- Read / list --");
await expect("phone (no login) GETs by id", true, () => getDoc(doc(anon.db, "workouts", ref.id)));
await expect("no login LISTs all", false, () => getDocs(col(anon)));
await expect("gmail LISTs own", false, () => getDocs(query(col(gmail), where("ownerEmail", "==", "jeremiasjgut@gmail.com"))));
await expect("hola LISTs own", true, () => getDocs(query(col(hola), where("ownerEmail", "==", "hola@yaqbot.com"))));
await expect("hola LISTs everyone's", false, () => getDocs(col(hola)));

console.log("\n-- Update / delete --");
const w = () => doc(hola.db, "workouts", ref.id);
await expect("hola renames own", true, () => updateDoc(w(), { name: "Renamed", updatedAt: serverTimestamp() }));
await expect("hola updates without updatedAt", false, () => updateDoc(w(), { name: "No stamp" }));
await expect("hola changes owner", false, () => updateDoc(w(), { ownerEmail: "coach2@yaqbot.com", updatedAt: serverTimestamp() }));
await expect("other coach updates hola's", false, () =>
  updateDoc(doc(other.db, "workouts", ref.id), { name: "Mine", updatedAt: serverTimestamp() }));
await expect("gmail updates hola's", false, () =>
  updateDoc(doc(gmail.db, "workouts", ref.id), { name: "x", updatedAt: serverTimestamp() }));
await expect("other coach deletes hola's", false, () => deleteDoc(doc(other.db, "workouts", ref.id)));
await expect("gmail deletes hola's", false, () => deleteDoc(doc(gmail.db, "workouts", ref.id)));
await expect("hola deletes own", true, () => deleteDoc(w()));
await expect("write to any other collection", false, () => addDoc(collection(hola.db, "other"), { a: 1 }));

console.log(fails ? `\n${fails} FAILED` : "\nALL RULES TESTS PASSED");
for (const c of [gmail, hola, other, unverified, upper, lookalike, anon]) await deleteApp(c.app);
process.exit(fails ? 1 : 0);
