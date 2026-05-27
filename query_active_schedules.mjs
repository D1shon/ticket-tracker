import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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
  const empSnapshot = await getDocs(collection(db, "employees"));
  const emps = empSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const schedSnapshot = await getDocs(collection(db, "schedules"));
  const schedules = schedSnapshot.docs.reduce((acc, doc) => {
    acc[doc.id] = doc.data();
    return acc;
  }, {});

  console.log(`Active Employees:`);
  emps.forEach(emp => {
    const docId = `2026-05_${emp.id}`;
    const sched = schedules[docId];
    console.log(`Employee: ${emp.name} (ID: ${emp.id}, Club: ${emp.club})`);
    if (sched) {
      console.log(`  Schedule: ${JSON.stringify(sched.days)}`);
    } else {
      console.log(`  No Schedule`);
    }
  });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
