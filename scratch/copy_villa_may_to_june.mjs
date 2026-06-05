import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, setDoc, doc, query, where } from "firebase/firestore";

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
  
  const targetMonthKey = "2026-06";
  const sourceMonthKey = "2026-05";
  const club = "VILLA";

  console.log(`Fetching employees for ${club} in ${sourceMonthKey}...`);
  const qMay = query(collection(db, "employees"), where("monthKey", "==", sourceMonthKey), where("club", "==", club));
  const snapMay = await getDocs(qMay);
  
  console.log(`Found ${snapMay.size} employees in May 2026.`);
  
  let copiedCount = 0;
  for (const d of snapMay.docs) {
    const data = d.data();
    const oldId = d.id;
    const baseId = oldId.includes("_") ? oldId.split("_").slice(1).join("_") : oldId;
    const newId = `${targetMonthKey}_${baseId}`;
    
    const newData = {
      ...data,
      id: newId,
      monthKey: targetMonthKey,
      createdAt: new Date()
    };
    
    console.log(`Copying: ${data.name} (${oldId}) -> ${newId}`);
    await setDoc(doc(db, "employees", newId), newData);
    copiedCount++;
  }

  console.log(`Successfully copied ${copiedCount} VILLA employees to June 2026.`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
