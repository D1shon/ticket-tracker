// restore_nurly_may.mjs
// Показывает полный snapshot расписания NURLY ORDA за май 2026 из Firestore
// и смотрим, не затёрты ли данные (например отладка через raw snapshot)

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk",
  authDomain: "hjtrack-928f5.firebaseapp.com",
  projectId: "hjtrack-928f5",
  storageBucket: "hjtrack-928f5.firebasestorage.app",
  messagingSenderId: "236581443884",
  appId: "1:236581443884:web:a9ce84dcbf0efc59267489"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
await signInAnonymously(auth);

const MAY_KEY = '2026-05';
const CLUB = 'NURLY ORDA';

// Получаем всех сотрудников NURLY ORDA за ИЮНЬ (текущий месяц) — смотрим, не там ли данные
const JUNE_KEY = '2026-06';

console.log(`\n===== RAW schedules dump для NURLY ORDA =====\n`);

// Ищем все расписания, чей id начинается с '2026-05' или '2026-06' и содержит нужный empId
const allSchedules = await getDocs(collection(db, 'schedules'));
const mayNurlySchedules = allSchedules.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(d => {
    // NURLY ORDA employees have fixed base IDs
    const nurlyBaseIds = ['1780917475980', '1780917492807', '1780917562003', '1780917583131', '1780918690728'];
    return nurlyBaseIds.some(bid => d.id.includes(bid));
  });

console.log(`Найдено документов расписания для сотрудников NURLY ORDA: ${mayNurlySchedules.length}`);
mayNurlySchedules.forEach(s => {
  const days = s.days || {};
  const entries = Object.entries(days).filter(([, v]) => v).sort((a, b) => Number(a[0]) - Number(b[0]));
  console.log(`\n[${s.id}] monthKey: ${s.monthKey}`);
  console.log(`  Заполненных дней: ${entries.length}`);
  entries.forEach(([d, v]) => console.log(`  День ${d.padStart(2)}: ${v}`));
});

// Проверяем — есть ли у NURLY ORDA данные в июньских записях 
// (возможно, данные попали в июнь из-за авто-клонирования)
const juneEmpSnap = await getDocs(query(collection(db, 'employees'), where('monthKey', '==', JUNE_KEY)));
const juneNurlyEmps = juneEmpSnap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(e => (e.club || '').toUpperCase() === CLUB);

console.log(`\n===== Сотрудники NURLY ORDA за ИЮНЬ (${JUNE_KEY}) =====`);
juneNurlyEmps.forEach(e => console.log(`  [${e.id}] ${e.name}`));

// Проверяем расписания за ИЮНЬ для этих сотрудников
const juneNurlyIds = new Set(juneNurlyEmps.map(e => e.id));
const juneNurlySchedules = allSchedules.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(d => juneNurlyIds.has(d.id) || d.monthKey === JUNE_KEY && juneNurlyIds.has(d.employeeId));

console.log(`\nРасписания июня NURLY ORDA: ${juneNurlySchedules.length}`);
juneNurlySchedules.forEach(s => {
  const days = s.days || {};
  const entries = Object.entries(days).filter(([, v]) => v).sort((a, b) => Number(a[0]) - Number(b[0]));
  console.log(`[${s.id}] monthKey: ${s.monthKey} — ${entries.length} дней заполнено`);
  entries.forEach(([d, v]) => console.log(`  День ${d.padStart(2)}: ${v}`));
});

process.exit(0);
