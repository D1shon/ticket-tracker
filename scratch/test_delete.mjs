import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, setDoc, deleteDoc, doc } from "firebase/firestore";

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
  
  const testId = "test_temp_emp_123456";
  const testDoc = doc(db, "employees", testId);
  
  console.log("Attempting to write test employee...");
  await setDoc(testDoc, {
    name: "Test Employee",
    club: "VILLA",
    monthKey: "2026-06",
    order: 99
  });
  console.log("Successfully wrote test employee.");
  
  console.log("Attempting to delete test employee...");
  await deleteDoc(testDoc);
  console.log("Successfully deleted test employee.");
  
  process.exit(0);
}

main().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
