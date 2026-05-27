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
  const snapshot = await getDocs(collection(db, "tickets"));
  
  const stats = new Map();
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const key = `${data.createdByEmail || 'undefined'} | ${data.createdByClub || 'undefined'} | ${data.club || 'undefined'} | ${data.assignee || 'undefined'}`;
    stats.set(key, (stats.get(key) || 0) + 1);
  });
  
  console.log("Unique ticket mappings (CreatedByEmail | CreatedByClub | TicketClub | Assignee -> Count):");
  for (const [key, count] of stats.entries()) {
    console.log(`  ${key} -> ${count}`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
