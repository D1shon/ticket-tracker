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
  
  // List of collections we want to search
  const collections = ['users', 'employees', 'schedules', 'settings', 'tickets', 'wifi_employees', 'wifi_sessions', 'wifi_agents'];
  for (const colName of collections) {
    try {
      const snapshot = await getDocs(collection(db, colName));
      snapshot.docs.forEach(doc => {
        const dataStr = JSON.stringify(doc.data());
        if (dataStr.toLowerCase().includes('meet') || dataStr.toLowerCase().includes('zur-yyin-zdm')) {
          console.log(`Match in collection: ${colName}, doc: ${doc.id} -> ${dataStr}`);
        }
      });
    } catch (e) {
      console.log(`Error searching ${colName}: ${e.message}`);
    }
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
