// inspect_may_schedule.mjs
// Диагностика данных расписания NURLY ORDA за май 2026
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
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

console.log(`\n===== Диагностика: ${CLUB} — ${MAY_KEY} =====\n`);

// 1. Найти сотрудников за май для NURLY ORDA
const empSnap = await getDocs(query(collection(db, 'employees'), where('monthKey', '==', MAY_KEY)));
const mayEmployees = empSnap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(e => (e.club || '').toUpperCase() === CLUB);

console.log(`Сотрудники NURLY ORDA за ${MAY_KEY}: ${mayEmployees.length} найдено`);
mayEmployees.forEach(e => console.log(`  - [${e.id}] ${e.name} (club: ${e.club})`));

// 2. Найти все расписания за май для этих сотрудников
const schSnap = await getDocs(collection(db, 'schedules'));
const maySchedules = schSnap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(d => d.monthKey === MAY_KEY && mayEmployees.some(e => e.id === d.id || e.id === d.employeeId));

console.log(`\nРасписания за ${MAY_KEY} для сотрудников NURLY ORDA: ${maySchedules.length} найдено`);
maySchedules.forEach(s => {
  const days = s.days || {};
  const nonEmpty = Object.entries(days).filter(([, v]) => v);
  console.log(`  - [${s.id}] ${nonEmpty.length} дней заполнено`);
  if (nonEmpty.length > 0) {
    nonEmpty.forEach(([d, v]) => process.stdout.write(`      День ${d}: ${v}\n`));
  }
});

// 3. Проверить — возможно документы есть, но с другим monthKey или без него
console.log('\n--- Все расписания, содержащие ID сотрудников NURLY ORDA ---');
const empIds = new Set(mayEmployees.map(e => e.id));
const allSchSnap = await getDocs(collection(db, 'schedules'));
const relatedSchedules = allSchSnap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(d => empIds.has(d.id) || empIds.has(d.employeeId));
relatedSchedules.forEach(s => {
  const days = s.days || {};
  const nonEmpty = Object.entries(days).filter(([, v]) => v).length;
  console.log(`  - [${s.id}] monthKey: ${s.monthKey} — ${nonEmpty} заполненных дней`);
});

if (relatedSchedules.length === 0) {
  console.log('  Нет данных расписания для этих сотрудников вообще.');
}

// 4. Поищем все документы, чей id начинается с '2026-05' (все майские)
console.log('\n--- Все майские сотрудники в Firestore ---');
const allMayEmps = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const byClub = {};
allMayEmps.forEach(e => {
  const c = e.club || '(no club)';
  if (!byClub[c]) byClub[c] = [];
  byClub[c].push(e.name);
});
Object.entries(byClub).forEach(([club, names]) => {
  console.log(`  ${club}: ${names.join(', ')}`);
});

process.exit(0);
