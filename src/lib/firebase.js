import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCiDHP-Jj11LJdojVk_71VxxzvKT4TmayI",
  authDomain: "ticket-tracker-inky.firebaseapp.com",
  projectId: "ticket-tracker-inky",
  storageBucket: "ticket-tracker-inky.appspot.com",
  messagingSenderId: "898511478144",
  appId: "1:898511478144:web:e3f695427d14f479d20f9c"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
