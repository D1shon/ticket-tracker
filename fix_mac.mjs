import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, query, where } from 'firebase/firestore';

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

// Реальный MAC телефона Dilshat (с экрана iPhone, частный адрес ВЫКЛЮЧЕН)
const PHONE_MAC = 'A0:78:2D:5E:11:45';

const q = query(collection(db, 'wifi_employees'), where('clubId', '==', 'ТЕСТ'), where('name', '==', 'Dilshat'));
const snap = await getDocs(q);

if (snap.empty) {
  console.log('❌ Сотрудник Dilshat не найден!');
} else {
  for (const d of snap.docs) {
    console.log(`Старый MAC: ${d.data().macAddress}`);
    await updateDoc(doc(db, 'wifi_employees', d.id), { macAddress: PHONE_MAC });
    console.log(`✅ MAC обновлён на MAC телефона: ${PHONE_MAC}`);
  }
}

process.exit(0);
