import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { execSync } from 'child_process';

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

// Читаем сотрудников клуба ТЕСТ
const q = query(collection(db, 'wifi_employees'), where('clubId', '==', 'ТЕСТ'));
const snap = await getDocs(q);

console.log('=== Сотрудники клуба ТЕСТ ===');
snap.docs.forEach(d => {
  const data = d.data();
  console.log(`\nИмя: ${data.name}`);
  console.log(`MAC в базе: ${data.macAddress}`);
});

// ARP-таблица
console.log('\n=== Устройства в ARP (текущая сеть) ===');
const out = execSync('arp -a', { timeout: 10000 }).toString();
const macs = [];
for (const line of out.split('\n')) {
  const m = line.match(/([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}/);
  if (m) {
    const mac = m[0].replace(/-/g, ':').toUpperCase();
    const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
    const ip = ipMatch ? ipMatch[1] : '?';
    if (!mac.startsWith('FF:FF') && !mac.startsWith('00:00')) {
      macs.push({ ip, mac });
    }
  }
}
const unique = [...new Map(macs.map(x => [x.mac, x])).values()];
unique.forEach(x => console.log(`  ${x.ip.padEnd(18)} ${x.mac}`));

process.exit(0);
