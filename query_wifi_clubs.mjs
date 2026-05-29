import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc } from 'firebase/firestore';

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

console.log('=== Текущие wifi_clubs в Firebase ===');
const snap = await getDocs(collection(db, 'wifi_clubs'));
if (snap.empty) {
  console.log('❌ Коллекция wifi_clubs ПУСТА! Нет ни одного клуба.');
} else {
  snap.docs.forEach(d => {
    console.log(`\nID: ${d.id}`);
    console.log(JSON.stringify(d.data(), null, 2));
  });
}

console.log('\nШлюз этого компьютера: 192.168.88.1');
console.log('\nЧтобы зарегистрировать этот IP - раскомментируйте блок ниже и запустите снова.');

// === РАСКОММЕНТИРОВАТЬ ЧТОБЫ ДОБАВИТЬ КЛУБ ===
// await setDoc(doc(db, 'wifi_clubs', 'club_main'), {
//   clubId: 'club_main',   // <-- вставьте нужный clubId
//   routerIp: '192.168.88.1',
//   name: 'Основной клуб',
// });
// console.log('✅ Клуб зарегистрирован!');

process.exit(0);
