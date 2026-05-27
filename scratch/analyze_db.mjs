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
  
  console.log("=== EMPLOYEES ===");
  const empSnapshot = await getDocs(collection(db, "employees"));
  console.log(`Total employees: ${empSnapshot.size}`);
  const empGroups = {};
  const unprefixedEmps = [];
  empSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    const mKey = data.monthKey || "NO_MONTH_KEY";
    if (!empGroups[mKey]) empGroups[mKey] = [];
    empGroups[mKey].push({ id, name: data.name });
    if (!id.includes("_") || !data.monthKey) {
      unprefixedEmps.push({ id, name: data.name, monthKey: data.monthKey });
    }
  });
  
  for (const [mKey, list] of Object.entries(empGroups)) {
    console.log(`Month: ${mKey} -> ${list.length} employees`);
  }
  if (unprefixedEmps.length > 0) {
    console.log("Unprefixed/No MonthKey Employees found:");
    console.log(unprefixedEmps);
  } else {
    console.log("No unprefixed employees found in DB.");
  }

  console.log("\n=== SCHEDULES ===");
  const schedSnapshot = await getDocs(collection(db, "schedules"));
  console.log(`Total schedules: ${schedSnapshot.size}`);
  const schedGroups = {};
  const mismatchedScheds = [];
  schedSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    const mKey = data.monthKey || "NO_MONTH_KEY";
    if (!schedGroups[mKey]) schedGroups[mKey] = [];
    schedGroups[mKey].push({ id, employeeId: data.employeeId });
    
    // Check if the employee doc exists
    // Expected employee doc ID is either id or prefixed depending on monthKey
    // But since employees are isolated by monthKey, they should exist under monthKey_employeeId
    const expectedEmpId = data.employeeId.includes("_") ? data.employeeId : `${mKey}_${data.employeeId}`;
    const empExists = empSnapshot.docs.some(d => d.id === expectedEmpId);
    if (!empExists) {
      mismatchedScheds.push({ scheduleId: id, employeeId: data.employeeId, expectedEmpId, monthKey: mKey });
    }
  });

  for (const [mKey, list] of Object.entries(schedGroups)) {
    console.log(`Month: ${mKey} -> ${list.length} schedules`);
  }
  if (mismatchedScheds.length > 0) {
    console.log(`Mismatched/Orphaned Schedules found: ${mismatchedScheds.length}`);
    console.log(mismatchedScheds.slice(0, 20));
  } else {
    console.log("No mismatched schedules found.");
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
