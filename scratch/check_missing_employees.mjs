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
  const empIds = empSnapshot.docs.map(doc => doc.id);
  console.log("All Employee Doc IDs in database:", empIds);
  
  const schedSnapshot = await getDocs(collection(db, "schedules"));
  console.log("\nChecking all schedules:");
  schedSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    const mKey = data.monthKey;
    const employeeId = data.employeeId;
    
    // Check if there is an employee with id = employeeId (legacy unprefixed)
    const legacyEmpExists = empIds.includes(employeeId);
    // Check if there is an employee with id = monthKey_employeeId
    const prefixedEmpId = `${mKey}_${employeeId}`;
    const prefixedEmpExists = empIds.includes(prefixedEmpId);
    
    console.log(`Schedule: ${id} | employeeId field: ${employeeId} | legacyEmpExists: ${legacyEmpExists} | prefixedEmpExists: ${prefixedEmpExists}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
