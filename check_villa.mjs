import { initializeApp } from 'firebase/app';
import { getFirestore, getDoc, doc, collection, getDocs, query, where } from 'firebase/firestore';

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

// 1. Смотрим агент ВИЛЛЫ
const agentSnap = await getDoc(doc(db, 'wifi_agents', 'VILLA'));
if (agentSnap.exists()) {
  const a = agentSnap.data();
  console.log('\n=== АГЕНТ ВИЛЛЫ ===');
  console.log('Версия:', a.version ?? 'нет данных');
  console.log('Последний heartbeat:', a.lastSeen);
  console.log('Последнее сканирование:', a.lastScanAt ?? 'нет данных');
  console.log('Устройств найдено:', a.lastScanDevicesTotal ?? 'нет данных');
  console.log('Подсеть:', a.subnet ?? 'нет данных');
  
  if (a.lastScanEmployees) {
    console.log('\n=== СОТРУДНИКИ (результат последнего скана) ===');
    for (const e of a.lastScanEmployees) {
      console.log(`  ${e.found ? '✅' : '❌'} ${e.name} — MAC: ${e.mac}`);
    }
  } else {
    console.log('\n⚠️  Диагностика по сотрудникам не найдена (старый агент?)');
  }

  if (a.lastScanMacs) {
    console.log(`\n=== MAC-адреса в сети (${a.lastScanMacs.length}) ===`);
    for (const mac of a.lastScanMacs) {
      console.log(' ', mac);
    }
  }
} else {
  console.log('❌ Агент ВИЛЛЫ не найден в Firestore!');
}

// 2. Смотрим сотрудников ВИЛЛЫ в базе
console.log('\n=== СОТРУДНИКИ В БАЗЕ (VILLA) ===');
const empSnap = await getDocs(query(collection(db, 'wifi_employees'), where('clubId', '==', 'VILLA')));
empSnap.forEach(d => {
  const e = d.data();
  console.log(`  ${e.name} — MAC: ${e.macAddress}`);
});

// 3. Смотрим сессии сегодня для ВИЛЛЫ
const today = new Date().toISOString().split('T')[0];
console.log(`\n=== СЕССИИ СЕГОДНЯ (${today}) ===`);
const sessSnap = await getDocs(query(collection(db, 'wifi_sessions'), where('clubId', '==', 'VILLA'), where('date', '==', today)));
if (sessSnap.empty) {
  console.log('  Нет сессий сегодня');
} else {
  sessSnap.forEach(d => {
    const s = d.data();
    console.log(`  ${s.name} — MAC: ${s.macAddress} | isOnline: ${s.isOnline} | arrivedAt: ${s.arrivedAt}`);
  });
}

process.exit(0);
