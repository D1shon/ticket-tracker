import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isWeekend, 
  addMonths,
  subMonths
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Users,
  Trash2,
  Check,
  Plus,
  Settings,
  ArrowUp,
  ArrowDown,
  X,
  CloudLightning,
  RefreshCw,
  Database,
  Pin,
  PinOff,
  GripVertical,
  Wrench
} from 'lucide-react';
import { useSchedule } from '../store/ScheduleContext';
import { useTickets } from '../store/TicketContext';
import { toast } from 'sonner';
import ScrollContainer from 'react-indiana-drag-scroll';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'];

// Mapping managers to their respective clubs
const MANAGER_CLUB_MAP = {
  'sania': '4YOU',
  'anastasia': 'COLIBRI',
  'dias': 'VILLA',
  'saltanat': 'NURLY ORDA',
  'ainur': 'NURLY ORDA',
  'aziz': 'NURLY ORDA',
  'timur': '4YOU',
  'alina': 'VILLA'
};


const HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
  '2026-02-23', '2026-03-08', '2026-03-21', '2026-03-22', '2026-03-23', '2026-05-01', '2026-05-07', '2026-05-09', 
  '2026-07-06', '2026-08-30', '2026-10-25', '2026-12-16', '2026-12-17'
];

const SHIFT_OPTIONS = [
  { label: '6:30–14:30',  value: '6:30-14:30',  bg: '#3b82f6', text: '#fff' },
  { label: '14:30–22:30', value: '14:30-22:30', bg: '#f97316', text: '#fff' },
  { label: '8:30–14:30',  value: '8:30-14:30',  bg: '#a855f7', text: '#fff' },
  { label: '14:30–21:30', value: '14:30-21:30', bg: '#8b5cf6', text: '#fff' },
  { label: '6:30–22:30',  value: '6:30-22:30',  bg: '#ec4899', text: '#fff' },
  { label: '8:30–21:30',  value: '8:30-21:30',  bg: '#10b981', text: '#fff' },
];

const COLUMN_LABELS = {
  totalHours: 'Всего часов',
  salary: 'Зарплата',
  razvozka: 'Развозка',
  advance: 'Аванс',
  correction: 'ФИКС',
  toPay: 'К выдаче'
};

const ScheduleCell = ({ monthKey, empId, dayNum, initialValue, isHoliday, isToday, onKeyDown, updateCell, rowIdx, colIdx, canEdit = true }) => {
  const [open, setOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [customValue, setCustomValue] = useState('');
  const cellRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const getShiftColor = (val) => {
    if (!val) return 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border)]';
    const norm = val.trim();
    if (norm === '6:30-14:30') return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
    if (norm === '14:30-22:30') return 'bg-orange-500/20 text-orange-400 border-orange-500/40';
    if (norm === '8:30-14:30') return 'bg-purple-500/20 text-purple-400 border-purple-500/40';
    if (norm === '14:30-21:30') return 'bg-violet-500/20 text-violet-400 border-violet-500/40';
    if (norm === '6:30-22:30') return 'bg-pink-500/20 text-pink-400 border-pink-500/40';
    if (norm === '8:30-21:30') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    // Any other custom value (like 8:00-17:00, выходной, etc.)
    return 'bg-purple-500/10 text-[var(--accent-purple)] border-purple-500/30';
  };

  const handleOpen = () => {
    if (!canEdit) return;
    const rect = cellRef.current.getBoundingClientRect();
    setPickerPos({ top: rect.bottom + 4, left: rect.left + rect.width / 2 });
    setCustomValue(initialValue || '');
    setOpen(o => !o);
  };

  const handleSelect = (value) => {
    updateCell(monthKey, empId, dayNum, value === initialValue ? '' : value);
    setOpen(false);
  };

  useEffect(() => {
    if (open) {
      setCustomValue(initialValue || '');
    }
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      // Do not close if click/mousedown is inside the portal-picker
      if (e.target.closest('[data-portal-picker]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const picker = open && ReactDOM.createPortal(
    <div
      data-portal-picker="true"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onMouseUp={e => e.stopPropagation()}
      className={isMobile ? "fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" : ""}
      style={!isMobile ? {
        position: 'fixed',
        top: pickerPos.top,
        left: pickerPos.left,
        transform: 'translateX(-50%)',
        zIndex: 9999,
      } : undefined}
    >
      {isMobile && <div className="absolute inset-0 -z-10" onMouseDown={() => setOpen(false)} />}
      
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-[var(--border)] bg-[var(--bg-card)] animate-fade"
        style={!isMobile ? {
          minWidth: 320,
        } : undefined}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {SHIFT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onMouseDown={e => { e.stopPropagation(); handleSelect(opt.value); }}
              style={{
                background: initialValue === opt.value ? opt.bg : 'transparent',
                color: initialValue === opt.value ? opt.text : opt.bg,
                border: 'none',
                borderBottom: `1px solid var(--border)`,
                padding: '16px 8px',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.12s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                outline: 'none',
              }}
              onMouseEnter={e => { if (initialValue !== opt.value) e.currentTarget.style.background = opt.bg + '1a'; }}
              onMouseLeave={e => { if (initialValue !== opt.value) e.currentTarget.style.background = 'transparent'; }}
            >
              {initialValue === opt.value && <Check size={12} />}
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom manual input field */}
        <div style={{ padding: 16, borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.08em' }}>
            Свой вариант / время:
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={customValue}
              placeholder="например: 10:00-19:00 или 8"
              onChange={e => setCustomValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(customValue);
                }
              }}
              style={{
                flex: 1,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent-purple)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <button
              onMouseDown={e => {
                e.stopPropagation();
                handleSelect(customValue);
              }}
              style={{
                background: 'var(--accent-purple)',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                padding: '10px 20px',
                fontSize: 11,
                fontWeight: 900,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              ОК
            </button>
          </div>
        </div>

        {initialValue && (
          <button
            onMouseDown={e => { e.stopPropagation(); handleSelect(''); }}
            style={{
              width: '100%', padding: '12px', fontSize: 10, fontWeight: 800,
              color: '#ef4444', background: 'transparent', border: 'none',
              borderTop: '1px solid var(--border)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              textTransform: 'uppercase', letterSpacing: '0.05em'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <X size={11} /> Очистить смену
          </button>
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <td
      ref={cellRef}
      className={`p-1 border-r border-[var(--border)] relative select-none ${isHoliday ? 'bg-red-500/5' : ''} ${isToday ? 'bg-purple-500/10' : ''} min-w-[60px] md:min-w-[90px]`}
      onClick={handleOpen}
    >
      <div
        id={`cell-${rowIdx}-${colIdx}`}
        className={`w-full min-h-[38px] rounded-lg text-[9px] md:text-[10px] text-center font-bold border flex items-center justify-center transition-all ${getShiftColor(initialValue)} ${canEdit ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-75'}`}
      >
        {initialValue || (canEdit ? <span className="opacity-20 text-[16px]">+</span> : <span className="opacity-10">—</span>)}
      </div>
      {picker}
    </td>
  );
};


const SchedulePage = () => {
  const { currentMonth, setCurrentMonth, monthKey, employeesLoading, scheduleData, employees, loading, isSaving, addEmployee, removeEmployee, updateCell, updateEmployee, setEmployeeService, updateAdvance, updateCorrection, updateSalaryOverride, updateRazvozkaOverride, moveEmployee, reorderEmployees, settings, updateSettings, dailyRazvozka, updateDailyRazvozka } = useSchedule();
  const { user } = useTickets();

  // Identify CHEF role — only these two emails have full chef access
  const isChef = useMemo(() => {
    const email = user?.email?.toLowerCase() || '';
    return user?.role === 'chef' ||
           email === 'dilshat.r@hj.fit' ||
           email === 'magzhan@hj.fit';
  }, [user]);

  const isManager = user?.role === 'manager';
  // Admin role: sees schedule only, NO financial data
  const isAdmin = user?.role === 'admin';
  // Only Chef and Manager can see salary/payroll columns
  const canViewFull = isChef || isManager;
  // Only Chef and Manager can edit shift cells — Admins are read-only
  const canEditSchedule = isChef || isManager;

  // Restricted access for Managers and Admins
  const userClub = user?.club?.toUpperCase();

  const [selectedClub, setSelectedClub] = useState(userClub || null);
  const [view, setView] = useState((!isChef && userClub) ? 'grid' : 'selection');

  // Filter clubs based on role
  const allowedClubs = useMemo(() => {
    if (isChef) return CLUBS;
    if (userClub) return [userClub];
    return []; 
  }, [isChef, userClub]);

  // Auto-select if only one club is allowed or if user context updates
  useEffect(() => {
    if (!isChef && userClub) {
      setSelectedClub(userClub);
      setView('grid');
    }
  }, [userClub, isChef]);

  const [pendingRows, setPendingRows] = useState([]);
  const [savingIds, setSavingIds] = useState(new Set());
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [stickyNames, setStickyNames] = useState(true);

  const tableContainerRef = useRef(null);
  const [isDraggingTable, setIsDraggingTable] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragScrollLeft, setDragScrollLeft] = useState(0);

  const handleTableMouseDown = (e) => {
    if (
      e.target.tagName === 'INPUT' || 
      e.target.tagName === 'BUTTON' || 
      e.target.tagName === 'SELECT' || 
      e.target.closest('button') || 
      e.target.closest('input') ||
      e.target.classList.contains('cursor-pointer') ||
      e.target.closest('.no-drag')
    ) {
      return;
    }
    setIsDraggingTable(true);
    setDragStartX(e.pageX - tableContainerRef.current.offsetLeft);
    setDragScrollLeft(tableContainerRef.current.scrollLeft);
  };

  const handleTableMouseMove = (e) => {
    if (!isDraggingTable) return;
    e.preventDefault();
    const x = e.pageX - tableContainerRef.current.offsetLeft;
    const walk = (x - dragStartX) * 1.5;
    tableContainerRef.current.scrollLeft = dragScrollLeft - walk;
  };

  const handleTableMouseUpOrLeave = () => {
    setIsDraggingTable(false);
  };
  
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');

  const daysInMonth = useMemo(() => eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) }), [currentMonth]);

  const visibleCols = useMemo(() => {
    const cols = settings?.visibleCols || { totalHours: true, salary: true, razvozka: true, advance: true, correction: true, toPay: true };
    return {
      totalHours: cols.totalHours !== false,
      salary: cols.salary !== false,
      razvozka: cols.razvozka !== false,
      advance: cols.advance !== false,
      correction: cols.correction !== false,
      toPay: cols.toPay !== false
    };
  }, [settings?.visibleCols]);

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

  // Returns the razvozka amount for a shift based on start/end times:
  // +1500 if starts at or before 6:30 (morning pickup needed)
  // +1500 if ends at or after 21:30 (evening dropoff needed)
  // 0 if neither (e.g. 8:30-20:30)
  const getShiftRazvozkaAmount = (val) => {
    if (!isWorkingShift(val)) return 0;
    const clean = String(val).trim().replace(/\s+/g, '').replace(/\./g, ':');

    // Plain numeric value (e.g. "8") — no time info, treat as mid-day, no razvozka
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
    const LATE_END    = 21 * 60 + 30; // 21:30

    return (startMin <= EARLY_START ? 1500 : 0) + (endMin >= LATE_END ? 1500 : 0);
  };

  const employeeStats = useMemo(() => {
    const stats = {};
    const rate = settings?.hourlyRate || 1500;
    
    // Group working employees by day and club to easily calculate W
    const workingCountsByDayAndClub = {};
    daysInMonth.forEach(day => {
      const dayNum = format(day, 'd');
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
    
    employees.forEach(emp => {
      const docId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
      const data = scheduleData[docId] || {};
      const empClub = emp.club || '4YOU';
      const clubDocId = `${monthKey}_${empClub}`;
      const clubDailyRazvozka = dailyRazvozka?.[clubDocId]?.days || {};
      
      let totalHours = 0;
      let razvozka = 0;
      
      daysInMonth.forEach(day => {
        const dayNum = format(day, 'd');
        const val = data.days?.[dayNum] || '';
        const hrs = calculateHours(val);
        totalHours += hrs;
        
        const isWorking = isWorkingShift(val);
        if (isWorking) {
          const dayOfWeek = day.getDay();
          const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
          const isHolidayDay = HOLIDAYS_2026.includes(format(day, 'yyyy-MM-dd'));
          
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
      
      stats[emp.id] = { 
        totalHours, 
        salary, 
        calculatedSalary, 
        salaryOverride: data.salaryOverride, 
        razvozka: finalRazvozka, 
        calculatedRazvozka, 
        razvozkaOverride: data.razvozkaOverride, 
        advance, 
        advanceRaw: data.advance, 
        correction, 
        correctionRaw: data.correction, 
        toPay 
      };
    });
    return stats;
  }, [scheduleData, employees, daysInMonth, monthKey, settings?.hourlyRate, dailyRazvozka]);

  const getEmployeeStats = (empId) => employeeStats[empId] || { 
    totalHours: 0, 
    salary: 0, 
    calculatedSalary: 0, 
    salaryOverride: 0, 
    razvozka: 0, 
    calculatedRazvozka: 0, 
    razvozkaOverride: 0, 
    advance: 0, 
    correction: 0, 
    toPay: 0 
  };

  const getClubTotal = (clubName) => {
    const clubEmps = employees.filter(e => (e.club || '4YOU') === clubName);
    return clubEmps.reduce((sum, emp) => sum + getEmployeeStats(emp.id).toPay, 0);
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('ru-RU').format(Math.round(val)) + ' ₸';
  };

  const savePendingRow = async (id) => {
    const row = pendingRows.find(r => r.id === id);
    if (!row?.name?.trim() || savingIds.has(id)) return;
    setSavingIds(prev => new Set(prev).add(id));
    setPendingRows(prev => prev.filter(r => r.id !== id));
    try { await addEmployee(row.name.trim(), selectedClub); } catch { setPendingRows(prev => [...prev, row]); }
    finally { setSavingIds(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  // Filter employees by club
  const clubEmployees = useMemo(() => {
    return employees.filter(e => (e.club || '4YOU') === selectedClub);
  }, [employees, selectedClub]);

  // Regular (non-service) employees — used for hours/salary totals
  const regularClubEmployees = useMemo(() => {
    return clubEmployees.filter(e => !e.isService);
  }, [clubEmployees]);

  // Total transport (Razvozka) cost for the month — 1500 per day per working employee (excluding weekends and holidays)
  // Total transport (Razvozka) cost for the month — overridden daily sum or headcount-based sum
  const razvozkaTotal = useMemo(() => {
    const clubDocId = `${monthKey}_${selectedClub}`;
    const clubDailyRazvozka = dailyRazvozka?.[clubDocId]?.days || {};
    
    let total = 0;
    daysInMonth.forEach(day => {
      const dayNum = format(day, 'd');
      const dayOfWeek = day.getDay();
      const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
      const isHolidayDay = HOLIDAYS_2026.includes(format(day, 'yyyy-MM-dd'));

      const overrideVal = clubDailyRazvozka[dayNum];
      const hasOverride = overrideVal !== undefined && overrideVal !== null && overrideVal !== '';
      if (hasOverride) {
        const dailyAmount = overrideVal === '-' ? 0 : (parseFloat(overrideVal) || 0);
        total += dailyAmount;
      } else {
        if (!isWeekendDay && !isHolidayDay) {
          let daySum = 0;
          clubEmployees.forEach(emp => {
            const empDocId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
            const val = scheduleData[empDocId]?.days?.[dayNum] || '';
            daySum += getShiftRazvozkaAmount(val);
          });
          total += daySum;
        }
      }
    });
    return total;
  }, [clubEmployees, scheduleData, daysInMonth, monthKey, selectedClub, dailyRazvozka]);


  const handleKeyDown = (e, row, col) => {
    let tr = row, tc = col;
    if (e.key === 'ArrowRight' || e.key === 'Tab') { e.preventDefault(); tc++; }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); tc--; }
    else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); tr++; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); tr--; }
    else return;
    
    const next = document.getElementById(`cell-${tr}-${tc}`);
    if (next) {
      next.focus();
      // Ensure the cell is not hidden under sticky columns by scrolling it to the center
      next.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  if (view === 'selection') {
    return (
      <div className="animate-fade" style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 0' }}>
        <div style={{ marginBottom: 40, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
            <Database size={32} color="var(--accent-purple)" />
            <h1 style={{ fontSize: 32, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
              Графики работы
            </h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Выберите объект для просмотра и редактирования табеля
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
          {allowedClubs.map(club => (
            <button
              key={club}
              onClick={() => {
                setSelectedClub(club);
                setView('grid');
              }}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 28, padding: 40,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', overflow: 'hidden',
                boxShadow: 'var(--shadow-card)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-8px)';
                e.currentTarget.style.borderColor = 'var(--accent-purple)';
                e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'var(--shadow-card)';
              }}
            >
              <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={32} color="var(--accent-purple)" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: 4 }}>{club}</h3>
              
              {canViewFull && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>К выплате итого:</div>
                  <div style={{ fontSize: 28, fontWeight: 950, color: 'var(--accent-purple)', letterSpacing: '-0.03em' }}>
                    {formatCurrency(getClubTotal(club))}
                  </div>
                </div>
              )}

              <div style={{ 
                marginTop: 16, fontSize: 10, fontWeight: 900, 
                color: 'var(--text-secondary)', background: 'var(--bg-hover)', 
                padding: '8px 18px', borderRadius: 12, border: '1px solid var(--border)',
                textTransform: 'uppercase', letterSpacing: '0.05em'
              }}>
                ОТКРЫТЬ ТАБЕЛЬ
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade w-full max-w-full overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[var(--bg-card)] p-4 md:p-5 rounded-3xl border border-[var(--border)] shadow-xl">
        <div className="flex flex-wrap items-center gap-3 md:gap-5">
          {isChef && (
            <button 
              onClick={() => setView('selection')}
              style={{ 
                background: 'var(--bg-hover)', border: '1px solid var(--border)', 
                borderRadius: 12, padding: '8px 12px', color: 'var(--text-secondary)', 
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11, fontWeight: 800, textTransform: 'uppercase'
              }}
            >
              <ChevronLeft size={16} /> Назад
            </button>
          )}
          <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-[var(--accent-purple)] border border-purple-500/10 flex-shrink-0">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-[var(--text-primary)] italic uppercase tracking-tight flex items-center gap-3">
              График: <span style={{ color: 'var(--accent-purple)' }}>{selectedClub}</span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Табель активен</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:gap-4 w-full lg:w-auto justify-between lg:justify-end">
          {/* Indicators */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            {isSaving && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20 text-[10px] font-black animate-pulse">
                <CloudLightning size={10} /> СИНХРОНИЗАЦИЯ
              </div>
            )}
            {(loading || employeesLoading) && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/10 text-purple-400 rounded-full border border-purple-500/20 text-[10px] font-black">
                <RefreshCw size={10} /> ЗАГРУЗКА
              </div>
            )}
          </div>

          {/* Beautiful modern Pin toggle button */}
          <button
            onClick={() => setStickyNames(v => !v)}
            title={stickyNames ? 'Разрешить свободную прокрутку всей таблицы до конца (для скриншотов)' : 'Зафиксировать колонки сотрудников и итогов по бокам'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px',
              borderRadius: 14,
              border: `1px solid ${stickyNames ? 'var(--accent-purple)' : 'var(--border)'}`,
              background: stickyNames ? 'rgba(139,92,246,0.08)' : 'var(--bg-hover)',
              color: stickyNames ? 'var(--accent-purple)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.borderColor = 'var(--accent-purple)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)';
              if (!stickyNames) e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            {stickyNames ? <Pin size={12} className="fill-[var(--accent-purple)]" /> : <PinOff size={12} />}
            {stickyNames ? 'Закреплено' : 'Свободный скролл'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} className="flex-shrink-0">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 rounded-xl bg-[var(--bg-hover)] border border-[var(--border)] hover:bg-[var(--bg-hover)]/80 transition-all text-[var(--text-primary)]"><ChevronLeft size={20} /></button>
            <div className="text-center min-w-[120px] md:min-w-[140px]">
              <h2 className="text-sm md:text-lg font-bold text-[var(--text-primary)] capitalize">{format(currentMonth, 'LLLL yyyy', { locale: ru })}</h2>
            </div>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 rounded-xl bg-[var(--bg-hover)] border border-[var(--border)] hover:bg-[var(--bg-hover)]/80 transition-all text-[var(--text-primary)]"><ChevronRight size={20} /></button>
          </div>

          <button onClick={() => setShowSettingsModal(true)} className="p-2.5 bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)]/80 border border-[var(--border)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2"><Settings size={16} /><span className="text-xs font-bold uppercase tracking-tight">Настройки</span></button>
        </div>
      </div>

      <div className="bg-[var(--bg-card)] rounded-3xl border border-[var(--border)] shadow-2xl relative overflow-hidden">
        <div 
          ref={tableContainerRef}
          className="overflow-auto table-scroll-container cursor-grab active:cursor-grabbing" 
          style={{ maxHeight: '72vh', overflowX: 'auto', overflowY: 'auto', userSelect: isDraggingTable ? 'none' : 'auto' }}
          onMouseDown={handleTableMouseDown}
          onMouseMove={handleTableMouseMove}
          onMouseUp={handleTableMouseUpOrLeave}
          onMouseLeave={handleTableMouseUpOrLeave}
        >
          <table className="w-full text-left border-separate border-spacing-0 min-w-[1800px] select-none">
            <thead>
              <tr className="text-[9px] uppercase tracking-widest font-black text-[var(--text-muted)]">
                {/* Visual "Two-Part" Split using Sticky & Thick Border */}
                <th style={{ position: stickyNames ? 'sticky' : 'relative', top: 0, left: 0, zIndex: stickyNames ? 50 : 10, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', borderRight: '2px solid var(--border)' }} className="px-2 md:px-6 py-5 min-w-[120px] md:min-w-[280px] max-w-[120px] md:max-w-[280px]">
                  Сотрудник
                </th>
                
                {daysInMonth.map(day => (
                  <th key={day.toString()} style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className={`px-1 py-4 text-center min-w-[60px] md:min-w-[90px] ${HOLIDAYS_2026.includes(format(day, 'yyyy-MM-dd')) ? 'text-red-500' : ''}`}>
                    <div className="flex flex-col items-center gap-0.5"><span className="opacity-50">{format(day, 'eeeeee', { locale: ru }) + '.'}</span><span className="text-xs">{format(day, 'd')}</span></div>
                  </th>
                ))}
                
                {visibleCols.totalHours && <th style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className="px-4 py-5 text-center min-w-[95px]">Всего ч.</th>}
                {canViewFull && visibleCols.salary && <th style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className="px-4 py-5 text-center min-w-[110px]">Зарплата</th>}
                {canViewFull && visibleCols.razvozka && <th style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className="px-4 py-5 text-center min-w-[110px]">Развозка</th>}
                {canViewFull && visibleCols.advance && <th style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className="px-4 py-5 text-center min-w-[110px]">Аванс</th>}
                {canViewFull && visibleCols.correction && <th style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className="px-4 py-5 text-center min-w-[110px]">ФИКС</th>}
                
                {canViewFull && visibleCols.toPay && <th style={{ position: 'sticky', top: 0, right: stickyNames ? 0 : undefined, zIndex: stickyNames ? 50 : 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', borderLeft: stickyNames ? '2px solid var(--border)' : undefined }} className="px-1 md:px-4 py-5 text-center min-w-[75px] md:min-w-[130px] max-w-[75px] md:max-w-[130px]">К выдаче</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {clubEmployees.map((emp, rowIdx) => {
                const stats = getEmployeeStats(emp.id);
                return (
                  <tr key={emp.id} className="hover:bg-[var(--bg-hover)] group">
                    <td style={{ position: stickyNames ? 'sticky' : 'relative', left: 0, zIndex: stickyNames ? 30 : 5, backgroundColor: 'var(--bg-card)', borderRight: '2px solid var(--border)' }} className="px-2 md:px-6 py-4 min-w-[120px] md:min-w-[280px] max-w-[120px] md:max-w-[280px]">
                      <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                        <Users size={14} className="text-[var(--text-muted)] flex-shrink-0" />
                        <div className="flex-1 flex items-center justify-between min-w-0">
                          {editingEmpId === emp.id ? (
                            <input autoFocus className="bg-[var(--bg-hover)] border border-[var(--accent-purple)] rounded px-2 py-1 text-xs md:text-sm text-[var(--text-primary)] w-full outline-none" value={editNameValue} onChange={e => setEditNameValue(e.target.value)} onBlur={() => { updateEmployee(emp.id, editNameValue); setEditingEmpId(null); }} />
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span onClick={() => { setEditingEmpId(emp.id); setEditNameValue(emp.name); }} title={emp.name} className="text-xs md:text-sm font-bold text-[var(--text-primary)] cursor-pointer truncate">{emp.name}</span>
                              {emp.isService && (
                                <span className="text-[7px] font-black px-1 py-0.5 rounded flex-shrink-0 hidden md:inline" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>СЕР</span>
                              )}
                            </div>
                          )}
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 flex-shrink-0">
                            <button onClick={() => moveEmployee(emp.id, 'up')} className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-purple)]"><ArrowUp size={12}/></button>
                            <button onClick={() => moveEmployee(emp.id, 'down')} className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-purple)]"><ArrowDown size={12}/></button>
                            <button
                              onClick={() => setEmployeeService(emp.id, !emp.isService)}
                              className={`p-1 transition-colors ${emp.isService ? 'text-amber-500' : 'text-[var(--text-muted)] hover:text-amber-400'}`}
                              title={emp.isService ? 'Снять статус сервисника' : 'Отметить как сервисника'}
                            ><Wrench size={12}/></button>
                            <button onClick={() => removeEmployee(emp.id)} className="p-1 text-[var(--text-muted)] hover:text-red-500"><Trash2 size={12}/></button>
                          </div>
                        </div>
                      </div>
                    </td>
                    {daysInMonth.map((day, dIdx) => {
                      const empDocId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
                      return (
                        <ScheduleCell key={day.toString()} monthKey={monthKey} empId={emp.id} dayNum={format(day, 'd')} initialValue={scheduleData[empDocId]?.days?.[format(day, 'd')] || ''} isHoliday={HOLIDAYS_2026.includes(format(day, 'yyyy-MM-dd'))} isToday={format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')} onKeyDown={handleKeyDown} updateCell={updateCell} rowIdx={rowIdx} colIdx={dIdx + 1} canEdit={canEditSchedule} />
                      );
                    })}
                    {visibleCols.totalHours && <td className="px-4 py-4 text-center text-xs text-[var(--accent-purple)] bg-purple-500/5 font-bold border-r border-[var(--border)]">{stats.totalHours.toFixed(1)} ч</td>}
                    {canViewFull && visibleCols.salary && (
                      <td className="p-0 bg-blue-500/5 border-r border-[var(--border)]">
                        <input
                          type="text"
                          disabled={!canViewFull}
                          className="w-full h-full min-h-[46px] bg-transparent text-center text-xs font-bold text-blue-400 outline-none"
                          value={stats.salaryOverride ?? ''}
                          placeholder={stats.calculatedSalary || ''}
                          onChange={e => updateSalaryOverride(monthKey, emp.id, e.target.value)}
                        />
                      </td>
                    )}
                    {canViewFull && visibleCols.razvozka && (
                      <td className="p-0 bg-emerald-500/5 border-r border-[var(--border)]">
                        <input
                          type="text"
                          disabled={!canViewFull}
                          className="w-full h-full min-h-[46px] bg-transparent text-center text-xs font-bold text-emerald-400 outline-none"
                          value={stats.razvozkaOverride ?? ''}
                          placeholder={stats.calculatedRazvozka || ''}
                          onChange={e => updateRazvozkaOverride(monthKey, emp.id, e.target.value)}
                        />
                      </td>
                    )}
                    {canViewFull && visibleCols.advance && <td className="p-0 bg-orange-500/5 border-r border-[var(--border)]"><input type="text" disabled={!canViewFull} className="w-full h-full min-h-[46px] bg-transparent text-center text-xs font-bold text-orange-400 outline-none" value={stats.advanceRaw ?? ''} onChange={e => updateAdvance(monthKey, emp.id, e.target.value)} /></td>}
                    {canViewFull && visibleCols.correction && <td className="p-0 bg-purple-500/5 border-r border-[var(--border)]"><input type="text" disabled={!canViewFull} className="w-full h-full min-h-[46px] bg-transparent text-center text-xs font-bold text-[var(--accent-purple)] outline-none" value={stats.correctionRaw ?? ''} onChange={e => updateCorrection(monthKey, emp.id, e.target.value)} /></td>}
                    {canViewFull && visibleCols.toPay && <td style={{ position: stickyNames ? 'sticky' : 'relative', right: stickyNames ? 0 : undefined, zIndex: stickyNames ? 30 : 5, backgroundColor: 'var(--bg-card)', borderLeft: stickyNames ? '2px solid var(--border)' : undefined }} className="px-1 md:px-4 py-4 text-center text-xs md:text-sm text-[var(--accent-purple)] font-black min-w-[75px] md:min-w-[130px] max-w-[75px] md:max-w-[130px]">{stats.toPay.toLocaleString()}</td>}
                  </tr>
                );
              })}
              {pendingRows.map((row) => (
                <tr key={row.id}>
                  <td style={{ position: stickyNames ? 'sticky' : 'relative', left: 0, zIndex: stickyNames ? 30 : 5, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '2px solid var(--border)' }} className="px-2 md:px-6 py-4 min-w-[120px] md:min-w-[280px] max-w-[120px] md:max-w-[280px]">
                    <div className="flex items-center gap-2 md:gap-4"><Users size={14} className="text-[var(--text-muted)]" /><input value={row.name} autoFocus onChange={e => setPendingRows(prev => prev.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))} onKeyDown={e => e.key === 'Enter' && savePendingRow(row.id)} placeholder="ФИО..." className="bg-transparent text-xs md:text-sm text-[var(--text-primary)] outline-none w-full" /><button onClick={() => savePendingRow(row.id)} className="text-green-500"><Check size={16}/></button></div>
                  </td>
                  {daysInMonth.map(d => <td key={d.toString()} style={{ borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="text-[10px] text-[var(--text-muted)] text-center italic">—</td>)}
                  {Object.keys(visibleCols).map(k => {
                    const isFin = ['salary', 'razvozka', 'advance', 'correction', 'toPay'].includes(k);
                    if (isFin && !canViewFull) return null;
                    if (!visibleCols[k]) return null;
                    if (k === 'toPay') return <td key={k} style={{ position: stickyNames ? 'sticky' : 'relative', right: stickyNames ? 0 : undefined, zIndex: stickyNames ? 30 : 5, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderLeft: stickyNames ? '2px solid var(--border)' : undefined }} className="min-w-[75px] md:min-w-[130px] max-w-[75px] md:max-w-[130px]"></td>;
                    return <td key={k} style={{ borderTop: '1px solid var(--border)' }}></td>;
                  })}
                </tr>
              ))}
              <tr>
                <td style={{ position: stickyNames ? 'sticky' : 'relative', left: 0, zIndex: stickyNames ? 30 : 5, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '2px solid var(--border)' }} className="px-2 md:px-6 py-4 min-w-[120px] md:min-w-[280px] max-w-[120px] md:max-w-[280px]">
                  <button onClick={() => setPendingRows(p => [...p, { id: Math.random().toString(36).substr(2, 9), name: '' }])} className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-[var(--accent-purple)] rounded-xl border border-purple-500/20 font-black text-[9px] uppercase tracking-widest transition-all"><Plus size={12}/> Добавить</button>
                </td>
                <td colSpan={daysInMonth.length + 10} style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}></td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td style={{ position: stickyNames ? 'sticky' : 'relative', bottom: 44, left: 0, zIndex: stickyNames ? 50 : 5, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '2px solid var(--border)' }} className="px-2 md:px-6 py-4 font-black text-[10px] text-[var(--text-muted)] uppercase tracking-widest min-w-[120px] md:min-w-[280px] max-w-[120px] md:max-w-[280px]">Итого:</td>
                
                {daysInMonth.map(day => {
                  const dayNum = format(day, 'd');
                  const dayOfWeek = day.getDay(); // 0=Sun, 6=Sat
                  const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
                  const isHolidayDay = HOLIDAYS_2026.includes(format(day, 'yyyy-MM-dd'));
 
                  let dayTotalHours = 0;
                  let workingCount = 0;
                  regularClubEmployees.forEach(emp => {
                    const empDocId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
                    const val = scheduleData[empDocId]?.days?.[dayNum] || '';
                    const hrs = calculateHours(val);
                    if (hrs > 0) {
                      dayTotalHours += hrs;
                      workingCount++;
                    }
                  });
 
                  const dailyAmount = (!isWeekendDay && !isHolidayDay) ? workingCount * 1500 : 0;
 
                  return (
                    <td key={day.toString()} style={{ position: 'sticky', bottom: 44, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-1 py-2 text-center font-black text-[10px] text-[var(--text-secondary)] min-w-[60px] md:min-w-[90px]">
                      {dayTotalHours > 0 ? `${dayTotalHours.toFixed(1)}ч` : '—'}
                    </td>
                  );
                })}
                {visibleCols.totalHours && <td style={{ position: 'sticky', bottom: 44, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-[var(--accent-purple)]">{regularClubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).totalHours, 0).toFixed(1)}ч</td>}
                {canViewFull && visibleCols.salary && <td style={{ position: 'sticky', bottom: 44, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-blue-400">{regularClubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).salary, 0).toLocaleString()}</td>}
                {canViewFull && visibleCols.razvozka && <td style={{ position: 'sticky', bottom: 44, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-emerald-400">{razvozkaTotal.toLocaleString()}</td>}
                {canViewFull && visibleCols.advance && <td style={{ position: 'sticky', bottom: 44, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-orange-400">{regularClubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).advance, 0).toLocaleString()}</td>}
                {canViewFull && visibleCols.correction && <td style={{ position: 'sticky', bottom: 44, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-[var(--accent-purple)]">{regularClubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).correction, 0).toLocaleString()}</td>}
                {canViewFull && visibleCols.toPay && <td style={{ position: 'sticky', bottom: 44, right: stickyNames ? 0 : undefined, zIndex: stickyNames ? 50 : 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderLeft: stickyNames ? '2px solid var(--border)' : undefined }} className="px-1 md:px-4 py-4 text-center font-black text-xs md:text-sm text-[var(--accent-purple)] min-w-[75px] md:min-w-[130px] max-w-[75px] md:max-w-[130px]">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <span>{regularClubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).toPay, 0).toLocaleString()}</span>
                    <span className="hidden md:inline" style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>в т.ч. {razvozkaTotal.toLocaleString()}₸ развозка</span>
                  </div>
                </td>}
              </tr>
 
              {/* ── Развозка row — sticky at bottom:0 ── */}
              {canViewFull && (
                <tr>
                  <td style={{ position: stickyNames ? 'sticky' : 'relative', bottom: 0, left: 0, zIndex: stickyNames ? 50 : 5, backgroundColor: 'var(--bg-razvozka-sticky)', borderTop: '2px solid var(--accent-purple)', borderRight: '2px solid var(--border)', whiteSpace: 'nowrap' }} className="px-2 md:px-6 py-3 font-black text-[10px] text-[var(--accent-purple)] uppercase tracking-widest min-w-[120px] md:min-w-[280px] max-w-[120px] md:max-w-[280px]">
                    🚗 Развозка
                  </td>
                  {daysInMonth.map(day => {
                    const dayNum = format(day, 'd');
                    const dayOfWeek = day.getDay();
                    const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
                    const isHolidayDay = HOLIDAYS_2026.includes(format(day, 'yyyy-MM-dd'));
 
                    let dailyAmount = 0;
                    if (!isWeekendDay && !isHolidayDay) {
                      clubEmployees.forEach(emp => {
                        const empDocId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
                        const val = scheduleData[empDocId]?.days?.[dayNum] || '';
                        dailyAmount += getShiftRazvozkaAmount(val);
                      });
                    }
                    
                    const clubDocId = `${monthKey}_${selectedClub}`;
                    const overrideVal = dailyRazvozka?.[clubDocId]?.days?.[dayNum];
                    const hasOverride = overrideVal !== undefined && overrideVal !== null && overrideVal !== '';
                    const displayValue = hasOverride ? overrideVal : '';
                    const placeholderVal = dailyAmount > 0 ? `${dailyAmount}` : '—';
                    
                    return (
                      <td key={day.toString()} style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="p-0 text-center min-w-[60px] md:min-w-[90px]">
                        <input
                          type="text"
                          className="w-full h-[38px] bg-transparent text-center text-[10px] font-black text-[var(--accent-purple)] outline-none border-none placeholder-purple-300/50"
                          value={displayValue ?? ''}
                          placeholder={placeholderVal}
                          onChange={e => updateDailyRazvozka(monthKey, selectedClub, dayNum, e.target.value)}
                        />
                      </td>
                    );
                  })}
                  {visibleCols.totalHours && <td style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-[10px] text-[var(--text-muted)]">—</td>}
                  {canViewFull && visibleCols.salary && <td style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-[10px] text-[var(--text-muted)]">—</td>}
                  {canViewFull && visibleCols.razvozka && <td style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-[var(--accent-purple)]">{razvozkaTotal.toLocaleString()} ₸</td>}
                  {canViewFull && visibleCols.advance && <td style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-[10px] text-[var(--text-muted)]">—</td>}
                  {canViewFull && visibleCols.correction && <td style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-[10px] text-[var(--text-muted)]">—</td>}
                  {canViewFull && visibleCols.toPay && (
                    <td 
                      style={{ 
                        position: stickyNames ? 'sticky' : 'relative', 
                        bottom: 0, 
                        right: stickyNames ? 0 : undefined, 
                        zIndex: stickyNames ? 50 : 40, 
                        backgroundColor: 'var(--bg-razvozka-sticky)', 
                        borderTop: '2px solid var(--accent-purple)', 
                        borderLeft: stickyNames ? '2px solid var(--border)' : undefined 
                      }} 
                      className="px-1 md:px-4 py-4 text-center font-black text-xs md:text-sm text-[var(--accent-purple)] min-w-[75px] md:min-w-[130px] max-w-[75px] md:max-w-[130px]"
                    >
                      {razvozkaTotal.toLocaleString()} ₸
                    </td>
                  )}
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      {canViewFull && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 md:gap-4">
          {[ 
            { l: 'Всего ч', v: regularClubEmployees.reduce((a, e) => a + getEmployeeStats(e.id).totalHours, 0).toFixed(1) + ' ч', c: 'text-[var(--text-primary)]' }, 
            { l: 'Зарплата', v: regularClubEmployees.reduce((a, e) => a + getEmployeeStats(e.id).salary, 0).toLocaleString() + ' ₸', c: 'text-blue-400' }, 
            { l: 'Развозка', v: razvozkaTotal.toLocaleString() + ' ₸', c: 'text-emerald-400' },
            { l: 'Аванс', v: regularClubEmployees.reduce((a, e) => a + getEmployeeStats(e.id).advance, 0).toLocaleString() + ' ₸', c: 'text-orange-400' }, 
            { l: 'ФИКС', v: regularClubEmployees.reduce((a, e) => a + getEmployeeStats(e.id).correction, 0).toLocaleString() + ' ₸', c: 'text-[var(--accent-purple)]' }, 
            { l: 'К выдаче', v: regularClubEmployees.reduce((a, e) => a + getEmployeeStats(e.id).toPay, 0).toLocaleString() + ' ₸', c: 'text-[var(--accent-purple)]' } 
          ].map((s, i) => (
            <div key={i} className="bg-[var(--bg-card)] p-4 md:p-6 rounded-3xl border border-[var(--border)] shadow-xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{s.l}</p>
              <p className={`text-lg md:text-2xl font-black ${s.c} mt-1`}>{s.v}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Развозка summary card ── */}
      {(() => {
        return (
          <div 
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:px-8 sm:py-6 border-[1.5px] border-[var(--accent-purple)] rounded-3xl shadow-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(139,92,246,0.04) 100%)',
              boxShadow: '0 4px 24px rgba(139,92,246,0.15)'
            }}
          >
            <div className="flex items-start sm:items-center gap-3">
              <span className="text-2xl flex-shrink-0">🚗</span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">Развозка за месяц</p>
                <p className="text-[11px] text-[var(--text-muted)] font-semibold leading-relaxed">
                  1 500 ₸ за смену (3 000 ₸ за смену 6:30-22:30) на каждого сотрудника (кроме выходных и праздников)
                </p>
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[var(--accent-purple)] tracking-tight flex-shrink-0">
              {razvozkaTotal.toLocaleString()} ₸
            </p>
          </div>
        );
      })()}

      {showSettingsModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 md:px-8 md:py-6 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Settings size={18} className="text-[var(--accent-purple)]" /> Настройки
              </h2>
              <button onClick={() => setShowSettingsModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 overflow-y-auto">
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-[var(--text-muted)]">Смены</h3>
                <div className="space-y-2">
                  <input type="text" value={settings?.shift1} onChange={e => updateSettings({ ...settings, shift1: e.target.value })} className="w-full bg-[var(--bg-hover)] border border-[var(--border)] rounded-xl p-3 text-[var(--text-primary)] text-sm" />
                  <input type="text" value={settings?.shift2} onChange={e => updateSettings({ ...settings, shift2: e.target.value })} className="w-full bg-[var(--bg-hover)] border border-[var(--border)] rounded-xl p-3 text-[var(--text-primary)] text-sm" />
                  {canViewFull && (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-medium italic">
                      <span>Ставка:</span>
                      <input type="number" value={settings?.hourlyRate || 1500} onChange={(e) => updateSettings({ ...settings, hourlyRate: parseInt(e.target.value) || 0 })} className="bg-[var(--bg-hover)] border border-[var(--border)] rounded px-1.5 py-0.5 w-16 text-blue-400 font-bold outline-none" />
                      <span>₸/час</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-[var(--text-muted)]">Колонки</h3>
                <div className="grid grid-cols-1 gap-1">
                  {Object.keys(visibleCols).map(k => {
                    const isFin = ['salary', 'razvozka', 'advance', 'correction', 'toPay'].includes(k);
                    if (isFin && !canViewFull) return null;
                    return (
                      <button 
                        key={k} 
                        onClick={() => updateSettings({ ...settings, visibleCols: { ...visibleCols, [k]: !visibleCols[k] } })} 
                        className={`w-full p-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${visibleCols[k] ? 'bg-purple-500/10 border-purple-500/30 text-[var(--text-primary)]' : 'bg-[var(--bg-hover)] border-transparent text-[var(--text-muted)]'}`}
                      >
                        {COLUMN_LABELS[k] || k}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-4 md:p-6 bg-[var(--bg-hover)] text-right flex-shrink-0">
              <button onClick={() => setShowSettingsModal(false)} className="px-8 py-3 bg-[var(--accent-purple)] text-white font-bold rounded-xl text-xs uppercase tracking-widest">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulePage;
