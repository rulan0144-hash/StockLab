// Koneksi Firebase untuk StockLab (proyek stocklab-2bd7a).
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCl6I4pRGwAElSOyPA1eqGTnraMA-cQ5b0",
  authDomain: "stocklab-2bd7a.firebaseapp.com",
  projectId: "stocklab-2bd7a",
  storageBucket: "stocklab-2bd7a.firebasestorage.app",
  messagingSenderId: "907390252782",
  appId: "1:907390252782:web:22ebcd578107bdc57125ff",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction };

// Setiap perangkat mendapat identitas anonim (tanpa login akun). Disimpan oleh Firebase di browser.
export function ensureUser() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async user => {
      unsub();
      try {
        resolve(user || (await signInAnonymously(auth)).user);
      } catch (e) {
        reject(e);
      }
    });
  });
}
