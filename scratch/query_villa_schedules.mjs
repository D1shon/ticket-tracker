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
  
  console.log("=== VILLA SCHEDULES IN JUNE 2026 (2026-06) ===");
  const q = query(collection(db, "schedules"), where("monthKey", "==", "2026-06"));
  const snap = await getDocs(q);
  console.log(`Total schedules in June: ${snap.size}`);
  snap.forEach(d => {
    const data = d.data();
    // We can filter by employeeId if we check which employee belongs to VILLA, or if the docId contains VILLA
    console.log(d.id, JSON.stringify(data));
  });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
