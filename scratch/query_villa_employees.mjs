import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk",
  authDomain: "hjtrack-928f5.firebaseapp.com",
  projectId: "hjtrack-928f5",
  storageBucket: "hjtrack-928f5.firebasestorage.app",
  messagingSenderId: "236581443884",
  appId: "1:236581443884:web:a9ce84dcbf0efc59267489"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  await signInAnonymously(auth);
  
  console.log("=== VILLA EMPLOYEES IN MAY 2026 (2026-05) ===");
  const qMay = query(collection(db, "employees"), where("monthKey", "==", "2026-05"), where("club", "==", "VILLA"));
  const snapMay = await getDocs(qMay);
  snapMay.forEach(d => {
    console.log(d.id, JSON.stringify(d.data()));
  });

  console.log("\n=== VILLA EMPLOYEES IN JUNE 2026 (2026-06) ===");
  const qJune = query(collection(db, "employees"), where("monthKey", "==", "2026-06"), where("club", "==", "VILLA"));
  const snapJune = await getDocs(qJune);
  snapJune.forEach(d => {
    console.log(d.id, JSON.stringify(d.data()));
  });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
