import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, doc, getDoc } from 'firebase/firestore';

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

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'];

async function test(monthKey) {
  console.log(`\n=== TESTING FOR ${monthKey} ===`);
  
  // Load schedules
  const schedSnap = await getDocs(collection(db, 'schedules'));
  const scheduleData = {};
  schedSnap.forEach(d => { scheduleData[d.id] = d.data(); });

  // Load employees for monthKey
  const empSnap = await getDocs(collection(db, 'employees'));
  const employees = [];
  empSnap.forEach(d => {
    const data = d.data();
    if (data.monthKey === monthKey) {
      employees.push({ id: d.id, ...data });
    }
  });
  
  // Load daily_razvozka
  const razSnap = await getDocs(collection(db, 'daily_razvozka'));
  const dailyRazvozka = {};
  razSnap.forEach(d => { dailyRazvozka[d.id] = d.data(); });
  
  // Load settings
  const settingsSnap = await getDoc(doc(db, 'settings', `schedule_${monthKey}`));
  const settings = settingsSnap.exists() ? settingsSnap.data() : { hourlyRate: 1500 };
  const rate = settings.hourlyRate || 1500;
  
  console.log(`Employees count: ${employees.length}, hourlyRate: ${rate}`);
  
  // Helper to determine if is working shift
  const isWorkingShift = (val) => {
    if (!val) return false;
    const clean = String(val).trim().toLowerCase();
    if (clean === '' || clean === '—' || clean === '-' || clean === 'x' || clean === 'х') return false;
    
    const dayOffKeywords = [
      'выходной', 'вых', 'в',
      'отпуск', 'отп', 'о',
      'больничный', 'бол', 'б',
      'off', 'vacation', 'sick'
    ];
    
    return !dayOffKeywords.some(keyword => {
      return clean === keyword || clean.startsWith(keyword + '.') || clean.startsWith(keyword + ' ');
    });
  };

  const getShiftRazvozkaAmount = (val) => {
    if (!isWorkingShift(val)) return 0;
    const clean = String(val).trim().replace(/\s+/g, '').replace(/\./g, ':');
    if (!clean.includes('-')) return 0;
    const parts = clean.split('-');
    if (parts.length !== 2) return 0;
    const toMin = (s) => {
      const c = s.trim();
      if (!c.includes(':')) return (parseInt(c) || 0) * 60;
      const [h, m] = c.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const startMin = toMin(parts[0]);
    const endMin   = toMin(parts[1]);
    const EARLY_START = 6 * 60 + 30;  // 6:30
    const LATE_END    = 22 * 60 + 30; // 22:30
    return (startMin <= EARLY_START ? 1500 : 0) + (endMin >= LATE_END ? 1500 : 0);
  };

  const calculateHours = (timeRange) => {
    if (!timeRange) return 0;
    const cleanRange = String(timeRange).trim().replace('.', ':');
    if (!cleanRange.includes('-') && !cleanRange.includes(':')) {
      const num = parseFloat(cleanRange.replace(',', '.'));
      return isNaN(num) ? 0 : num;
    }
    try {
      if (cleanRange.includes('-')) {
        const parts = cleanRange.split('-');
        const parseTime = (s) => {
          let c = s.trim();
          if (!c.includes(':')) return (parseInt(c) || 0) * 60;
          let [h, m] = c.split(':').map(Number);
          return (h || 0) * 60 + (m || 0);
        };
        let diff = parseTime(parts[1]) - parseTime(parts[0]);
        if (diff < 0) diff += 1440;
        return parseFloat((diff / 60).toFixed(2));
      }
    } catch { return 0; }
    return 0;
  };

  // Days in month list (e.g. 1 to 31 for May)
  const getDaysInMonth = (mKey) => {
    const [year, month] = mKey.split('-').map(Number);
    const date = new Date(year, month, 0); // month is 1-indexed for date constructor here to get last day
    const days = [];
    for (let i = 1; i <= date.getDate(); i++) {
      days.push(i);
    }
    return days;
  };
  
  const days = getDaysInMonth(monthKey);
  const HOLIDAYS_2026 = [
    '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
    '2026-02-23', '2026-03-08', '2026-03-21', '2026-03-22', '2026-03-23', '2026-05-07', '2026-05-09',
    '2026-05-11', '2026-07-06', '2026-08-30', '2026-10-25', '2026-12-16', '2026-12-17'
  ];

  // Group working
  const workingCountsByDayAndClub = {};
  days.forEach(dayNum => {
    workingCountsByDayAndClub[dayNum] = {};
    CLUBS.forEach(club => {
      workingCountsByDayAndClub[dayNum][club] = [];
    });
    employees.forEach(emp => {
      const docId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
      const data = scheduleData[docId] || {};
      const val = data.days?.[dayNum] || '';
      if (isWorkingShift(val)) {
        const club = emp.club || '4YOU';
        if (!workingCountsByDayAndClub[dayNum][club]) {
          workingCountsByDayAndClub[dayNum][club] = [];
        }
        workingCountsByDayAndClub[dayNum][club].push(emp.id);
      }
    });
  });

  const getEmployeeStats = (emp) => {
    const docId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
    const data = scheduleData[docId] || {};
    const empClub = emp.club || '4YOU';
    const clubDocId = `${monthKey}_${empClub}`;
    const clubDailyRazvozka = dailyRazvozka[clubDocId]?.days || {};
    
    let totalHours = 0;
    let razvozka = 0;
    
    days.forEach(dayNum => {
      const val = data.days?.[dayNum] || '';
      const hrs = calculateHours(val);
      totalHours += hrs;
      
      const isWorking = isWorkingShift(val);
      if (isWorking) {
        // Find day of week
        const [year, month] = monthKey.split('-').map(Number);
        const dayDate = new Date(year, month - 1, dayNum);
        const dayOfWeek = dayDate.getDay();
        const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
        const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        const isHolidayDay = HOLIDAYS_2026.includes(formattedDate);
        
        const workingEmps = workingCountsByDayAndClub[dayNum]?.[empClub] || [];
        const W = workingEmps.length;
        
        let totalWeight = 0;
        workingEmps.forEach(tempEmpId => {
          const tempDocId = tempEmpId.includes('_') ? tempEmpId : `${monthKey}_${tempEmpId}`;
          const tempEmpData = scheduleData[tempDocId] || {};
          const tempVal = tempEmpData.days?.[dayNum] || '';
          totalWeight += getShiftRazvozkaAmount(tempVal);
        });

        const overrideVal = clubDailyRazvozka[dayNum];
        const hasOverride = overrideVal !== undefined && overrideVal !== null && overrideVal !== '';
        if (hasOverride) {
          if (totalWeight > 0) {
            const dailyAmount = overrideVal === '-' ? 0 : (parseFloat(overrideVal) || 0);
            const myWeight = getShiftRazvozkaAmount(val);
            razvozka += (dailyAmount * myWeight) / totalWeight;
          } else if (W > 0) {
            const dailyAmount = overrideVal === '-' ? 0 : (parseFloat(overrideVal) || 0);
            razvozka += dailyAmount / W;
          }
        } else {
          if (!isWeekendDay && !isHolidayDay) {
            razvozka += getShiftRazvozkaAmount(val);
          }
        }
      }
    });
    
    const calculatedSalary = totalHours * rate;
    const hasSalaryOverride = data.salaryOverride !== undefined && data.salaryOverride !== null && data.salaryOverride !== '';
    const salaryOverrideNum = hasSalaryOverride ? (data.salaryOverride === '-' ? 0 : (parseFloat(data.salaryOverride) || 0)) : null;
    const salary = hasSalaryOverride ? salaryOverrideNum : calculatedSalary;
    
    const calculatedRazvozka = razvozka;
    const hasRazvozkaOverride = data.razvozkaOverride !== undefined && data.razvozkaOverride !== null && data.razvozkaOverride !== '';
    const razvozkaOverrideNum = hasRazvozkaOverride ? (data.razvozkaOverride === '-' ? 0 : (parseFloat(data.razvozkaOverride) || 0)) : null;
    const finalRazvozka = hasRazvozkaOverride ? razvozkaOverrideNum : calculatedRazvozka;

    const advance = data.advance === '-' ? 0 : (parseFloat(data.advance) || 0);
    const correction = data.correction === '-' ? 0 : (parseFloat(data.correction) || 0);
    const toPay = salary + finalRazvozka - advance + correction;
    
    return {
      name: emp.name,
      isService: emp.isService,
      toPay
    };
  };

  CLUBS.forEach(club => {
    const clubEmps = employees.filter(e => (e.club || '4YOU') === club && !e.isService);
    let total = 0;
    clubEmps.forEach(emp => {
      const stats = getEmployeeStats(emp);
      total += stats.toPay;
    });
    console.log(`Club ${club} Total: ${total}`);
  });
}

await test('2026-05');
await test('2026-06');
process.exit(0);
