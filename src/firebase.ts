import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// Firebase web config is public by design; access is controlled by firestore.rules.
const firebaseConfig = {
  apiKey: "AIzaSyD56D0NFFxDC2ETb9ZRp7DwtPeqcGPlps0",
  authDomain: "box-timer-yaqbot.firebaseapp.com",
  projectId: "box-timer-yaqbot",
  storageBucket: "box-timer-yaqbot.firebasestorage.app",
  messagingSenderId: "107399064161",
  appId: "1:107399064161:web:525a460a5c65f450af9820",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Local emulators, only for `npm run dev:emu`.
// `vite build` replaces import.meta.env.DEV with false, so this whole branch
// is removed from the production bundle and cannot ship by accident.
export const usingEmulators =
  import.meta.env.DEV && import.meta.env.MODE === "emulator";

if (usingEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
