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
  const employees = empSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  console.log("Employees in 4YOU:");
  employees.forEach(emp => {
    if (emp.club === "4YOU") {
      console.log(`- ${emp.name} | ID: ${emp.id}`);
    }
  });

  const snapshot = await getDocs(collection(db, "schedules"));
  console.log("\nSchedules for 4YOU in May 2026:");
  snapshot.docs.forEach(doc => {
    if (doc.id.startsWith("2026-05")) {
      const data = doc.data();
      const emp = employees.find(e => e.id === data.employeeId);
      if (emp && emp.club === "4YOU") {
        console.log(`- ID: ${doc.id} | Employee: ${emp.name}`);
        console.log(`  Data: ${JSON.stringify(data)}`);
      }
    }
  });
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
