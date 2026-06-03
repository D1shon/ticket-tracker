import { initializeApp } from 'firebase/app';
import { getFirestore, setDoc, doc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk',
  authDomain: 'hjtrack-928f5.firebaseapp.com',
  projectId: 'hjtrack-928f5',
  storageBucket: 'hjtrack-928f5.firebasestorage.app',
  messagingSenderId: '236581443884',
  appId: '1:236581443884:web:a9ce84dcbf0efc59267489',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Sign in anonymously first to satisfy security rules
await signInAnonymously(auth);

// Записать версию 3.4 в Firestore — агенты на всех машинах скачают обновление
await setDoc(doc(db, 'settings', 'agent'), {
  version: '3.4',
  updateUrl: 'https://ticket-tracker-inky.vercel.app/wifi-agent.mjs',
  updatedAt: new Date().toISOString(),
});

console.log('✅ Версия агента 3.4 записана в Firestore. Все агенты обновятся автоматически в течение 5 минут.');
process.exit(0);
