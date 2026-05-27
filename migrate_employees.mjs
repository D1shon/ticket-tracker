import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, setDoc, deleteDoc, doc } from "firebase/firestore";

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
  
  const snapshot = await getDocs(collection(db, "employees"));
  console.log(`Total employees found: ${snapshot.size}`);
  
  let migratedCount = 0;
  for (const employeeDoc of snapshot.docs) {
    const data = employeeDoc.data();
    const oldId = employeeDoc.id;
    
    // If it doesn't have a monthKey or does not have _ in its ID, migrate it
    if (!data.monthKey || !oldId.includes("_")) {
      const targetMonthKey = "2026-05";
      const newId = `${targetMonthKey}_${oldId}`;
      const newData = {
        ...data,
        id: newId,
        monthKey: targetMonthKey
      };
      
      console.log(`Migrating: ${data.name} (${oldId}) -> ${newId}`);
      
      // Write the new prefixed employee document
      await setDoc(doc(db, "employees", newId), newData);
      
      // Delete the old unprefixed employee document
      await deleteDoc(doc(db, "employees", oldId));
      
      migratedCount++;
    } else {
      console.log(`Skipping already migrated/month-specific employee: ${data.name} (${oldId})`);
    }
  }
  
  console.log(`Successfully migrated ${migratedCount} employees.`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
