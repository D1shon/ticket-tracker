import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, updateDoc } from "firebase/firestore";

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
  
  // Fetch employees to map IDs to names
  const empSnapshot = await getDocs(collection(db, "employees"));
  const empMap = {};
  empSnapshot.docs.forEach(doc => {
    empMap[doc.id] = doc.data();
  });

  const snapshot = await getDocs(collection(db, "schedules"));
  console.log("Checking all schedules for anomalies (single digit advances/corrections)...");
  
  for (const scheduleDoc of snapshot.docs) {
    const data = scheduleDoc.data();
    const docId = scheduleDoc.id;
    const emp = empMap[data.employeeId] || { name: "Unknown" };
    
    let needsUpdate = false;
    const updatePayload = {};
    
    // We check if advance is a number or string representing a single digit (except 0) or negative single digit
    if (data.advance !== undefined && data.advance !== null && data.advance !== '') {
      const advNum = parseFloat(data.advance);
      if (!isNaN(advNum) && advNum !== 0 && Math.abs(advNum) < 100) {
        console.log(`Anomaly found in doc ${docId} (${emp.name}): advance is ${data.advance}. Clearing it.`);
        updatePayload.advance = "";
        needsUpdate = true;
      }
    }
    
    // Check correction
    if (data.correction !== undefined && data.correction !== null && data.correction !== '') {
      const corrNum = parseFloat(data.correction);
      if (!isNaN(corrNum) && corrNum !== 0 && Math.abs(corrNum) < 100) {
        console.log(`Anomaly found in doc ${docId} (${emp.name}): correction is ${data.correction}. Clearing it.`);
        updatePayload.correction = "";
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      const docRef = doc(db, "schedules", docId);
      await updateDoc(docRef, updatePayload);
      console.log(`Successfully cleared anomalies for ${emp.name} in document ${docId}`);
    }
  }
  
  console.log("Cleanup complete!");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
