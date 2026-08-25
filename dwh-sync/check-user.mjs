// Разовая проверка: что лежит в app_users для конкретного email.
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk',
  authDomain: 'hjtrack-928f5.firebaseapp.com',
  projectId: 'hjtrack-928f5',
  storageBucket: 'hjtrack-928f5.firebasestorage.app',
  messagingSenderId: '236581443884',
  appId: '1:236581443884:web:a9ce84dcbf0efc59267489',
};

const email = process.argv[2];
if (!email) { console.error('usage: node check-user.mjs <email>'); process.exit(1); }

const app = initializeApp(firebaseConfig);
await signInAnonymously(getAuth(app));
const snap = await getDoc(doc(getFirestore(app), 'app_users', email.toLowerCase()));
console.log(snap.exists() ? JSON.stringify(snap.data(), null, 2) : 'NOT FOUND');
process.exit(0);
