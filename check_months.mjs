import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk',
  authDomain: 'hjtrack-928f5.firebaseapp.com',
  projectId: 'hjtrack-928f5',
  storageBucket: 'hjtrack-928f5.firebasestorage.app',
  messagingSenderId: '236581443884',
  appId: '1:236581443884:web:a9ce84dcbf0efc59267489',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Check June 2026 employees
console.log('=== EMPLOYEES FOR 2026-06 ===');
const empSnap = await getDocs(query(collection(db, 'employees'), where('monthKey', '==', '2026-06')));
empSnap.forEach(d => {
  console.log(`  [${d.id}] Name: ${d.data().name}, Club: ${d.data().club}, isService: ${d.data().isService}`);
});

// Check May 2026 employees
console.log('\n=== EMPLOYEES FOR 2026-05 ===');
const empMaySnap = await getDocs(query(collection(db, 'employees'), where('monthKey', '==', '2026-05')));
empMaySnap.forEach(d => {
  console.log(`  [${d.id}] Name: ${d.data().name}, Club: ${d.data().club}, isService: ${d.data().isService}`);
});

process.exit(0);
