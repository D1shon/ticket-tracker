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
  console.log("Signing in anonymously...");
  await signInAnonymously(auth);
  console.log("Logged in successfully. Fetching tickets...");
  
  const snapshot = await getDocs(collection(db, "tickets"));
  console.log(`Found ${snapshot.docs.length} tickets:`);
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    console.log("-----------------------------------------");
    console.log(`ID: ${doc.id}`);
    console.log(`Title: ${data.title}`);
    console.log(`Club: ${data.club}`);
    console.log(`Assignee: ${data.assignee}`);
    console.log(`CreatedByEmail: ${data.createdByEmail}`);
    console.log(`CreatedByClub: ${data.createdByClub}`);
    console.log(`Status: ${data.status}`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
