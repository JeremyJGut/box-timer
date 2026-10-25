import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
export const db = getFirestore(app);
