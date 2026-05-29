import { initializeApp } from 'firebase/app';
import { getFirestore, setDoc, doc } from 'firebase/firestore';

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

await setDoc(doc(db, 'wifi_clubs', 'ТЕСТ'), {
  clubId: 'ТЕСТ',
  routerIp: '192.168.88.1',
  updatedAt: new Date().toISOString(),
}, { merge: true });

console.log('✅ IP роутера для клуба ТЕСТ обновлён: 192.168.88.1');
process.exit(0);
