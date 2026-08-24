import React, { useState, useMemo, useEffect, useRef } from 'react';
import { isMobileDevice } from '../lib/isMobile';
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
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

const COMMISSION_RATE = 0.02; // 2% merch sales commission rate

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];

const cleanName = (str) => (str || '').replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();

// Деньги из текстовых ячеек: «10 000» (пробел/неразрывный) и «12,5» раньше
// парсились как 10 и 12 — аванс/ФИКС искажали «К выдаче» на порядки.
const parseMoney = (v) => {
  if (v === undefined || v === null || v === '' || v === '-') return 0;
  const n = parseFloat(String(v).replace(/[\s  ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

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
  '2026-02-23', '2026-03-08', '2026-03-21', '2026-03-22', '2026-03-23', '2026-05-07', '2026-05-09',
  '2026-05-11', // Выходной день (добавлен вручную)
  '2026-07-06', '2026-08-30', '2026-10-25', '2026-12-16', '2026-12-17'
];

const SHIFT_OPTIONS = [
  { label: '6:30–14:30',  value: '6:30-14:30',  bg: '#5580A8', text: '#fff' },
  { label: '14:30–22:30', value: '14:30-22:30', bg: '#BF8055', text: '#fff' },
  { label: '8:30–14:30',  value: '8:30-14:30',  bg: '#8E7BB8', text: '#fff' },
  { label: '14:30–21:30', value: '14:30-21:30', bg: '#7D6FB3', text: '#fff' },
  { label: '6:30–22:30',  value: '6:30-22:30',  bg: '#B0688D', text: '#fff' },
  { label: '8:30–21:30',  value: '8:30-21:30',  bg: '#5F9C81', text: '#fff' },
];

const COLUMN_LABELS = {
  totalHours: 'Всего часов',
  normHours: 'Норма ч',
  salary: 'Зарплата',
  salesCommission: '% продажи',
  razvozka: 'Развозка',
  advance: 'Аванс',
  correction: 'ФИКС',
  toPay: 'К выдаче'
};

const ScheduleCell = ({ monthKey, empId, dayNum, initialValue, isHoliday, isToday, onKeyDown, updateCell, rowIdx, colIdx, canEdit = true, club }) => {
  const [open, setOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [customValue, setCustomValue] = useState('');
  const cellRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(isMobileDevice());
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const isNurlyOrda = club?.toUpperCase() === 'NURLY ORDA';
  const isEuropeCity = club?.toUpperCase() === 'EUROPE CITY';
  const isPromenadeClub = club?.toUpperCase() === 'PROMENADE';

  const currentShiftOptions = isNurlyOrda ? [
    { label: '6:30–22:00',  value: '6:30-22:00',  bg: '#B0688D', text: '#fff' },
    { label: '13:30–23:00', value: '13:30-23:00', bg: '#5580A8', text: '#fff' },
    { label: '9:00–19:00',  value: '9:00-19:00',  bg: '#8E7BB8', text: '#fff' },
    { label: '11:00–20:00', value: '11:00-20:00', bg: '#8E7BB8', text: '#fff' },
  ] : isEuropeCity ? [
    // График работы Europe City: будни 06:20–23:00, выходные 08:30–21:00
    { label: '6:20–23:00', value: '6:20-23:00', bg: '#B0688D', text: '#fff' },
    { label: '8:30–21:00', value: '8:30-21:00', bg: '#5580A8', text: '#fff' },
  ] : isPromenadeClub ? [
    // Promenade: будни 6:30–15:00 / 15:00–22:30 / 18:00–21:00 / 6:30–14:00 / 17:00–00:00,
    // выходные 8:30–14:30 / 14:30–20:30
    { label: '6:30–15:00',  value: '6:30-15:00',  bg: '#5F9C81', text: '#fff' },
    { label: '15:00–22:30', value: '15:00-22:30', bg: '#5580A8', text: '#fff' },
    { label: '18:00–21:00', value: '18:00-21:00', bg: '#8E7BB8', text: '#fff' },
    { label: '6:30–14:00',  value: '6:30-14:00',  bg: '#5F9C81', text: '#fff' },
    { label: '17:00–00:00', value: '17:00-00:00', bg: '#5580A8', text: '#fff' },
    { label: '8:30–14:30',  value: '8:30-14:30',  bg: '#5F9C81', text: '#fff' },
    { label: '14:30–20:30', value: '14:30-20:30', bg: '#5580A8', text: '#fff' },
  ] : SHIFT_OPTIONS;

  const getShiftColor = (val) => {
    if (!val) return 'shift-empty border';
    const norm = val.trim();
    
    let isWeekendDay = false;
    try {
      const dateStr = `${monthKey}-${String(dayNum).padStart(2, '0')}`;
      isWeekendDay = isWeekend(new Date(dateStr));
    } catch (e) {
      console.error(e);
    }

    const isMorning = norm === '6:30-14:30' || norm === '8:30-14:30';
    const isEvening = norm === '14:30-22:30' || norm === '14:30-21:30' || norm === '13:30-23:00';
    const isFullDay = norm === '6:30-22:30' || norm === '8:30-21:30' || norm === '6:30-22:00';

    if (isMorning) {
      return isWeekendDay ? 'shift-morning-weekend border' : 'shift-morning border';
    }
    if (isEvening) return 'shift-evening border';
    if (isFullDay)  return 'shift-fullday border';

    // Any other custom value
    return 'shift-custom border';
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
          {currentShiftOptions.map((opt) => {
            const isOptMorning = opt.value === '6:30-14:30' || opt.value === '8:30-14:30';
            const isOptEvening = opt.value === '14:30-22:30' || opt.value === '14:30-21:30' || opt.value === '13:30-23:00';
            const isOptFullDay = opt.value === '6:30-22:30' || opt.value === '8:30-21:30' || opt.value === '6:30-22:00';

            let isWeekendDay = false;
            try {
              const dateStr = `${monthKey}-${String(dayNum).padStart(2, '0')}`;
              isWeekendDay = isWeekend(new Date(dateStr));
            } catch (e) {}

            let optColor = '#8E7BB8'; // fallback violet
            if (isOptMorning) {
              optColor = isWeekendDay ? '#065f46' : '#5F9C81'; // dark green / light green
            } else if (isOptEvening) {
              optColor = '#5580A8'; // blue
            } else if (isOptFullDay) {
              optColor = '#B0688D'; // pink
            }

            return (
              <button
                key={opt.value}
                onMouseDown={e => { e.stopPropagation(); handleSelect(opt.value); }}
                style={{
                  background: initialValue === opt.value ? optColor : 'transparent',
                  color: initialValue === opt.value ? '#fff' : optColor,
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
                onMouseEnter={e => { if (initialValue !== opt.value) e.currentTarget.style.background = optColor + '1a'; }}
                onMouseLeave={e => { if (initialValue !== opt.value) e.currentTarget.style.background = 'transparent'; }}
              >
                {initialValue === opt.value && <Check size={12} />}
                {opt.label}
              </button>
            );
          })}
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
              color: '#B06A6A', background: 'transparent', border: 'none',
              borderTop: '1px solid var(--border)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              textTransform: 'uppercase', letterSpacing: '0.05em'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(176,106,106,0.08)'}
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
      className={`p-0.5 border-r border-[var(--border)] relative select-none ${isHoliday ? 'bg-red-500/5' : ''} ${isToday ? 'bg-purple-500/10' : ''}`}
      style={{ minWidth: isMobile ? 44 : 90, maxWidth: isMobile ? 44 : 90 }}
      onClick={handleOpen}
    >
      <div
        id={`cell-${rowIdx}-${colIdx}`}
        className={`w-full rounded-md text-center font-bold border flex items-center justify-center transition-all ${getShiftColor(initialValue)} ${canEdit ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-75'}`}
        style={{ minHeight: isMobile ? 32 : 38, fontSize: isMobile ? 8 : 10 }}
      >
        {initialValue
          ? (isMobile
              ? (initialValue.includes('-') ? initialValue.split('-')[0] : initialValue)
              : initialValue)
          : (canEdit ? <span className="opacity-20" style={{ fontSize: isMobile ? 14 : 16 }}>+</span> : <span className="opacity-10">—</span>)
        }
      </div>
      {picker}
    </td>
  );
};


const SchedulePage = () => {
  const { currentMonth, setCurrentMonth, monthKey, employeesLoading, scheduleData, employees, loading, isSaving, addEmployee, removeEmployee, updateCell, updateEmployee, updateEmployeeHourlyRate, updateEmployeeFixedSalary, updateNormHours, setEmployeeService, updateAdvance, updateCorrection, updateSalesBonus, updateSalaryOverride, updateRazvozkaOverride, updateDailyRazvozkaReceipt, moveEmployee, reorderEmployees, settings, updateSettings, dailyRazvozka, updateDailyRazvozka } = useSchedule();
  const { user, uploadFile } = useTickets();

  const isChef = useMemo(() => user?.role === 'chef', [user]);

  const isManager = user?.role === 'manager';
  // Admin role: sees schedule only, NO financial data
  const isAdmin = user?.role === 'admin';
  // Only Chef and Manager can see salary/payroll columns
  const canViewFull = isChef || isManager;
  // Only Chef and Manager can edit shift cells and manage employees — Admins are read-only
  const canEditSchedule = isChef || isManager;

  // Restricted access for Managers and Admins
  const userClub = user?.club?.toUpperCase();

  const [selectedClub, setSelectedClub] = useState(userClub || null);
  // Развозка-строка скрыта для Europe City (нет развозки) и Promenade (развозка
  // только у сервисников, вручную). Когда строка скрыта, футер «Итого» не должен
  // резервировать нижний отступ (иначе перекрывал кнопку «+ Добавить»).
  const isEuropeCitySelected = selectedClub?.toUpperCase() === 'EUROPE CITY';
  const isPromenadeSelected = selectedClub?.toUpperCase() === 'PROMENADE';
  // Развозка-строка скрыта только для Europe City. Promenade строку ПОКАЗЫВАЕТ —
  // там сервисники по дням вписывают сумму и прикрепляют чек.
  const razvozkaRowHidden = isEuropeCitySelected;
  const footerBottomOffset = (canViewFull && !razvozkaRowHidden) ? 44 : 0;

  // Europe City: план продаж на месяц (руками), факт (руками); план выполнен →
  // каждому сотруднику EC со сменами +100 000 ₸ (считается в employeeStats).
  const ecPlan = parseMoney(settings?.ecSalesPlan);
  const ecFact = parseMoney(settings?.ecSalesFact);
  const ecPlanAchieved = ecPlan > 0 && ecFact >= ecPlan;
  const [ecPlanEdits, setEcPlanEdits] = useState({});

  // Promenade: чек развозки по КАЖДОМУ ДНЮ (в строке «Развозка» снизу) — файл в Storage
  const [uploadingReceipt, setUploadingReceipt] = useState(null);
  const handleDailyReceiptUpload = async (day, file) => {
    if (!file || !uploadFile) return;
    setUploadingReceipt(day);
    try {
      const res = await uploadFile(file);
      const url = res?.url || null;
      if (url) { await updateDailyRazvozkaReceipt(monthKey, selectedClub, day, url); toast.success('Чек прикреплён'); }
      else toast.error('Не удалось загрузить чек');
    } catch { toast.error('Не удалось загрузить чек'); }
    finally { setUploadingReceipt(null); }
  };
  const [view, setView] = useState((!isChef && userClub) ? 'grid' : 'selection');

  // Filter clubs based on role
  const allowedClubs = useMemo(() => {
    if (isChef) return CLUBS;
    if (isAdmin) return userClub ? [userClub] : CLUBS;
    if (userClub) return [userClub];
    return []; 
  }, [isChef, isAdmin, userClub]);

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
  
  // ─── Merch Sales (for commission calculation) ────────────────────────────
  const [merchSales, setMerchSales] = useState([]);
  useEffect(() => {
    let unsub = null;
    const unsubAuth = auth.onAuthStateChanged(firebaseUser => {
      if (firebaseUser) {
        unsub = onSnapshot(query(collection(db, 'merch_sales')), snap => {
          setMerchSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
      } else {
        if (unsub) { unsub(); unsub = null; }
        setMerchSales([]);
      }
    });
    return () => { unsubAuth(); if (unsub) unsub(); };
  }, []);

  // ─── Commission Rates — ТОЛЬКО текущий месяц и клуб ──────────────────────────
  // Раньше карта строилась по ВСЕМ месяцам/клубам с ключом «имя»: ставка из
  // другого месяца (или тёзки из другого клуба) молча подменяла текущую.
  const [commissionRatesMap, setCommissionRatesMap] = useState({});
  useEffect(() => {
    if (!selectedClub) { setCommissionRatesMap({}); return; }
    let unsub = null;
    const unsubAuth = auth.onAuthStateChanged(firebaseUser => {
      if (firebaseUser) {
        unsub = onSnapshot(
          query(collection(db, 'employees'), where('monthKey', '==', monthKey), where('club', '==', selectedClub)),
          snap => {
            const rates = {};
            snap.docs.forEach(d => {
              const emp = d.data();
              const isServ = emp.isService === true ||
                (emp.name || '').toLowerCase().includes('сервис') ||
                (emp.name || '').toLowerCase().includes('техник');
              if (isServ || !emp.name) return;
              if (emp.commissionRate != null && emp.commissionRate !== '') {
                const r = parseFloat(emp.commissionRate);
                if (Number.isFinite(r)) rates[cleanName(emp.name)] = r;
              }
            });
            setCommissionRatesMap(rates);
          });
      } else {
        if (unsub) { unsub(); unsub = null; }
        setCommissionRatesMap({});
      }
    });
    return () => { unsubAuth(); if (unsub) unsub(); };
  }, [monthKey, selectedClub]);

  // ─── Per-employee hourly rates (local state, mirrors employee.hourlyRate in Firestore) ─
  const [hourlyRates, setHourlyRates] = useState({});
  useEffect(() => {
    setHourlyRates(prev => {
      const fromFirestore = {};
      employees.forEach(emp => {
        if (emp.hourlyRate != null) fromFirestore[emp.id] = String(emp.hourlyRate);
      });
      // Сервер — источник истины: раньше prev побеждал вечно, и правка оклада
      // с другого устройства не доезжала до открытой вкладки до перезагрузки
      return { ...prev, ...fromFirestore };
    });
  }, [employees]);

  // ─── Per-employee fixed salaries (оклад) ────────────────────────────────────
  const [fixedSalaries, setFixedSalaries] = useState({});
  useEffect(() => {
    setFixedSalaries(prev => {
      const fromFirestore = {};
      employees.forEach(emp => {
        if (emp.fixedSalary != null) fromFirestore[emp.id] = String(emp.fixedSalary);
      });
      return { ...prev, ...fromFirestore }; // сервер — источник истины
    });
  }, [employees]);

  // ─── Per-employee norm hours (local state, mirrors scheduleData normHours) ──
  const [normHoursLocal, setNormHoursLocal] = useState({});
  useEffect(() => {
    setNormHoursLocal(prev => {
      const fromData = {};
      employees.forEach(emp => {
        const docId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
        const d = scheduleData[docId] || {};
        if (d.normHours != null) fromData[emp.id] = String(d.normHours);
      });
      return { ...prev, ...fromData }; // сервер — источник истины
    });
  }, [scheduleData, employees, monthKey]);

  // financialEdits: tracks in-progress edits for salary/razvozka/advance/correction
  // key: `${empId}-${field}`, value: current string being edited
  const [financialEdits, setFinancialEdits] = useState({});
  // pendingAdvanceConfirm: { empId, value, rect } — shows inline confirm popover
  const [pendingAdvanceConfirm, setPendingAdvanceConfirm] = useState(null);
  const advanceCellRefs = useRef({});

  const getFinEdit = (empId, field, fallback) => {
    const k = `${empId}-${field}`;
    return k in financialEdits ? financialEdits[k] : (fallback ?? '');
  };
  const setFinEdit = (empId, field, val) =>
    setFinancialEdits(prev => ({ ...prev, [`${empId}-${field}`]: val }));
  const clearFinEdit = (empId, field) =>
    setFinancialEdits(prev => { const n = { ...prev }; delete n[`${empId}-${field}`]; return n; });

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
  const [deletingEmpId, setDeletingEmpId] = useState(null);

  const daysInMonth = useMemo(() => eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) }), [currentMonth]);

  const visibleCols = useMemo(() => {
    const cols = settings?.visibleCols || { totalHours: true, salary: true, salesCommission: true, razvozka: true, advance: true, correction: true, toPay: true };
    return {
      totalHours: cols.totalHours !== false,
      normHours: cols.normHours !== false,
      salary: cols.salary !== false,
      salesCommission: cols.salesCommission !== false,
      // Europe City: развозка не применяется — колонку прячем
      razvozka: selectedClub?.toUpperCase() !== 'EUROPE CITY' && cols.razvozka !== false,
      advance: cols.advance !== false,
      correction: cols.correction !== false,
      toPay: cols.toPay !== false
    };
  }, [settings?.visibleCols, selectedClub]);

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
      'больничный', 'бол', 'б', 'б/л', 'бл',
      'отгул', 'учеба', 'учёба', 'уч',
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
  const getShiftRazvozkaAmount = (val, club) => {
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
    let endMin   = toMin(parts[1]);
    // Смена через полночь («17:00-00:00») — конец позже любого вечернего порога
    if (endMin <= startMin) endMin += 24 * 60;

    const EARLY_START = 6 * 60 + 30;  // 6:30
    
    const isNurlyOrda = club?.toUpperCase() === 'NURLY ORDA';
    const LATE_END    = isNurlyOrda ? (22 * 60) : (22 * 60 + 30); // 22:00 vs 22:30

    return (startMin <= EARLY_START ? 1500 : 0) + (endMin >= LATE_END ? 1500 : 0);
  };

  const employeeStats = useMemo(() => {
    const stats = {};
    const rate = settings?.hourlyRate || 1500;

    // Europe City: месячный план продаж (план и факт вводятся вручную).
    // Бонус пропорционален сменам от нормы 15: план выполнен → 100 000 / 15 × смены,
    // не выполнен → гарантированные 50 000 / 15 × смены.
    const ecPlan = parseMoney(settings?.ecSalesPlan);
    const ecFact = parseMoney(settings?.ecSalesFact);
    const ecPlanAchieved = ecPlan > 0 && ecFact >= ecPlan;
    const EC_BONUS_FULL = 100000;
    const EC_BONUS_GUARANTEE = 50000;
    const EC_BONUS_NORM_SHIFTS = 15;
    
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

    // Compute sales revenue shares — mirrors MerchPage "Итого продаж" byPerson logic exactly.
    // salespersonName wins (manual override); schedule is fallback for unassigned sales.
    const salesRevenueShares = {};
    employees.forEach(emp => { salesRevenueShares[emp.id] = 0; });

    const isServEmpCheck = (emp) =>
      emp.isService === true ||
      (emp.name || '').toLowerCase().includes('сервис') ||
      (emp.name || '').toLowerCase().includes('техник');

    const parseTimeToMinutes = (tStr) => {
      const tParts = (tStr || '').split(':');
      const h = parseInt(tParts[0]) || 0;
      const m = parseInt(tParts[1]) || 0;
      return h * 60 + m;
    };

    CLUBS.forEach(clubName => {
      const byPerson = {};

      const clubSales = merchSales.filter(s =>
        (s.club || '4YOU') === clubName &&
        (s.qty || 0) > 0 &&
        s.paymentMethod !== 'Пересорт' &&
        s.createdAt?.seconds &&
        format(new Date(s.createdAt.seconds * 1000), 'yyyy-MM') === monthKey
      );

      clubSales.forEach(sale => {
        // Mirrors MerchPage: the selected salesperson always wins — the sale
        // goes to them even on their day off. Schedule distribution is only
        // a fallback for unassigned sales, and never for NURLY ORDA.
        let names = [];
        if (sale.salespersonName) {
          names = sale.salespersonName.split(',').map(n => n.trim()).filter(Boolean);
        } else if (clubName !== 'NURLY ORDA') {
          const dateObj = new Date(sale.createdAt.seconds * 1000);
          const dayNum = format(dateObj, 'd');
          const saleTimeMin = dateObj.getHours() * 60 + dateObj.getMinutes();
          const clubEmps = employees.filter(e =>
            (e.club || '4YOU') === clubName && !isServEmpCheck(e)
          );
          clubEmps.forEach(emp => {
            const docId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
            const shiftStr = scheduleData[docId]?.days?.[dayNum];
            if (!shiftStr || !isWorkingShift(shiftStr)) return;
            const cleanShift = shiftStr.trim().replace(/\s+/g, '');
            const parts = cleanShift.split('-');
            if (parts.length !== 2) return;
            const startMin = parseTimeToMinutes(parts[0].trim());
            const endMin = parseTimeToMinutes(parts[1].trim());
            const inShift = endMin < startMin
              ? (saleTimeMin >= startMin || saleTimeMin <= endMin)
              : (saleTimeMin >= startMin && saleTimeMin <= endMin);
            if (inShift) names.push(emp.name.trim());
          });
        }

        if (names.length === 0) return;

        const shareTotal = (sale.totalSum || 0) / names.length;
        names.forEach(name => {
          if (!byPerson[name]) byPerson[name] = 0;
          byPerson[name] += shareTotal;
        });
      });

      // Map person names → employee IDs using cleanName
      Object.entries(byPerson).forEach(([name, total]) => {
        const matchedEmp = employees.find(e =>
          (e.club || '4YOU') === clubName &&
          cleanName(e.name) === cleanName(name) &&
          !isServEmpCheck(e)
        );
        if (matchedEmp) {
          salesRevenueShares[matchedEmp.id] = (salesRevenueShares[matchedEmp.id] || 0) + total;
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
      let shiftsWorked = 0;

      daysInMonth.forEach(day => {
        const dayNum = format(day, 'd');
        const val = data.days?.[dayNum] || '';
        const hrs = calculateHours(val);
        totalHours += hrs;

        const isWorking = isWorkingShift(val);
        if (isWorking) {
          shiftsWorked++;
          const workingEmps = workingCountsByDayAndClub[dayNum]?.[empClub] || [];
          const W = workingEmps.length;
          
          let totalWeight = 0;
          workingEmps.forEach(tempEmpId => {
            const tempDocId = tempEmpId.includes('_') ? tempEmpId : `${monthKey}_${tempEmpId}`;
            const tempEmpData = scheduleData[tempDocId] || {};
            const tempVal = tempEmpData.days?.[dayNum] || '';
            const tempEmp = employees.find(e => e.id === tempEmpId);
            const tempClub = tempEmp?.club || '4YOU';
            totalWeight += getShiftRazvozkaAmount(tempVal, tempClub);
          });

          const overrideVal = clubDailyRazvozka[dayNum];
          const hasOverride = overrideVal !== undefined && overrideVal !== null && overrideVal !== '';
          if (hasOverride) {
            if (totalWeight > 0) {
              const dailyAmount = overrideVal === '-' ? 0 : (parseFloat(overrideVal) || 0);
              const myWeight = getShiftRazvozkaAmount(val, empClub);
              razvozka += (dailyAmount * myWeight) / totalWeight;
            } else if (W > 0) {
              const dailyAmount = overrideVal === '-' ? 0 : (parseFloat(overrideVal) || 0);
              razvozka += dailyAmount / W;
            }
          } else {
            razvozka += getShiftRazvozkaAmount(val, empClub);
          }
        }
      });
      
      const baseRate = parseFloat(hourlyRates[emp.id]) || emp.hourlyRate || rate;
      const empFixedSalary = parseFloat(fixedSalaries[emp.id]) || emp.fixedSalary || null;
      const empNormHours = parseFloat(normHoursLocal[emp.id]) || data.normHours || null;

      // Europe City: оплата по СМЕНАМ (график 2/2). Оклад задаётся за норму смен
      // (по умолчанию 15). Ставка за смену = оклад / нормаСмен; зарплата =
      // отработанные смены × ставка (пропорционально сменам, а не часам).
      const isEuropeCityEmp = empClub.toUpperCase() === 'EUROPE CITY';
      // Сервисник (флаг СЕР): с окладом зарплата СТРОГО ФИКС (= оклад), график не влияет.
      const isServiceEmp = emp.isService === true ||
                           (emp.name || '').toLowerCase().includes('сервис') ||
                           (emp.name || '').toLowerCase().includes('техник');
      const isServiceFixed = !isEuropeCityEmp && isServiceEmp && !!empFixedSalary;
      // Норма смен для EC: если в поле случайно попала норма в ЧАСАХ (>31) —
      // игнорируем и берём 15 (в месяце не бывает >31 смены).
      const normShiftsEC = (empNormHours && empNormHours <= 31) ? empNormHours : 15;
      const perShiftEC = empFixedSalary ? empFixedSalary / normShiftsEC : 0;

      // Fixed salary + norm hours formula for any employee that has оклад set;
      // employees без оклада keep the hourly rate as before
      const effectiveNormHours = empNormHours || (empFixedSalary && totalHours > 0 ? totalHours : null);
      const autoRate = !!(empFixedSalary && effectiveNormHours && effectiveNormHours > 0);
      const empRate = isEuropeCityEmp
        ? perShiftEC
        : (autoRate ? empFixedSalary / effectiveNormHours : baseRate);
      // Overtime: только почасовые (не EC, не фикс-сервисник)
      const overtimeHours = (!isEuropeCityEmp && !isServiceFixed && empNormHours && empNormHours > 0) ? Math.max(0, totalHours - empNormHours) : 0;
      const overtimePay = Math.round(overtimeHours * empRate);
      // EC → по сменам; сервисник (СЕР) с окладом → СТРОГО фикс (= оклад); иначе почасовая.
      const calculatedSalary = isEuropeCityEmp
        ? Math.round(shiftsWorked * perShiftEC)
        : isServiceFixed
          ? Math.round(empFixedSalary)
          : Math.round(totalHours * empRate);
      const hasSalaryOverride = data.salaryOverride !== undefined && data.salaryOverride !== null && data.salaryOverride !== '';
      const salaryOverrideNum = hasSalaryOverride ? parseMoney(data.salaryOverride) : null;
      const salary = hasSalaryOverride ? salaryOverrideNum : calculatedSalary;
      
      const calculatedRazvozka = razvozka;
      const hasRazvozkaOverride = data.razvozkaOverride !== undefined && data.razvozkaOverride !== null && data.razvozkaOverride !== '';
      const razvozkaOverrideNum = hasRazvozkaOverride ? parseMoney(data.razvozkaOverride) : null;
      const clubU = empClub.toUpperCase();
      // Развозка: Europe City — нет ни у кого. Promenade — вводится по дням в строке
      // «Развозка» (dailyRazvozka); месячный итог делится поровну между сервисниками
      // клуба, у админов — 0. Прочие клубы — как раньше (авто/override).
      let promRazvozka = 0;
      if (clubU === 'PROMENADE' && isServiceEmp) {
        const clubDaily = dailyRazvozka?.[`${monthKey}_${empClub}`]?.days || {};
        const clubTotal = Object.values(clubDaily).reduce((s, v) => s + parseMoney(v), 0);
        const svcCount = employees.filter(e => (e.club || '4YOU') === empClub && (e.isService === true || (e.name || '').toLowerCase().includes('сервис') || (e.name || '').toLowerCase().includes('техник'))).length || 1;
        promRazvozka = Math.round(clubTotal / svcCount);
      }
      const finalRazvozka = clubU === 'EUROPE CITY'
        ? 0
        : clubU === 'PROMENADE'
          ? promRazvozka
          : (hasRazvozkaOverride ? razvozkaOverrideNum : calculatedRazvozka);

      const advance = parseMoney(data.advance);
      const correction = parseMoney(data.correction);
      // NURLY ORDA default: 8% (solo sale → 8%, split → 4% each). Europe City: 0.
      const ratePercent = clubU === 'EUROPE CITY'
        ? 0
        : (commissionRatesMap[cleanName(emp.name)] ?? emp.commissionRate ?? (empClub === 'NURLY ORDA' ? 8 : 2));
      const rateVal = isServiceEmp ? 0 : ratePercent / 100;
      const rawCommission = (salesRevenueShares[emp.id] || 0) * rateVal;
      const salesCommission = Math.round(rawCommission);
      // Europe City: бонус из плана продаж. Авто: (100к при выполнении / 50к гарант.)
      // ÷ 15 смен × отработанные смены. Ручной ввод в ячейке перекрывает авто.
      const salesBonusRaw = data.salesBonus;
      const hasManualBonus = isEuropeCityEmp && salesBonusRaw !== undefined && salesBonusRaw !== null && String(salesBonusRaw).trim() !== '';
      const bonusBase = ecPlanAchieved ? EC_BONUS_FULL : EC_BONUS_GUARANTEE;
      const planBonus = (isEuropeCityEmp && ecPlan > 0)
        ? Math.round((bonusBase / EC_BONUS_NORM_SHIFTS) * shiftsWorked)
        : 0;
      const salesBonus = hasManualBonus ? Math.round(parseMoney(salesBonusRaw)) : planBonus;
      const toPay = salary + finalRazvozka - advance + correction + salesCommission + salesBonus;
      
      stats[emp.id] = {
        totalHours,
        shiftsWorked,
        normHours: empNormHours,
        overtimeHours,
        overtimePay,
        empRate,
        autoRate,
        salary,
        calculatedSalary,
        salaryOverride: data.salaryOverride,
        razvozka: finalRazvozka,
        calculatedRazvozka,
        razvozkaOverride: data.razvozkaOverride,
        razvozkaReceipt: data.razvozkaReceipt || null,
        isService: isServiceEmp,
        advance, 
        advanceRaw: data.advance, 
        correction, 
        correctionRaw: data.correction, 
        salesCommission,
        salesBonus,
        salesBonusRaw,
        bonusIsAuto: !hasManualBonus,
        planBonus,
        toPay
      };
    });
    return stats;
  }, [scheduleData, employees, daysInMonth, monthKey, settings?.hourlyRate, settings?.ecSalesPlan, settings?.ecSalesFact, dailyRazvozka, merchSales, commissionRatesMap, hourlyRates, fixedSalaries, normHoursLocal]);

  const getEmployeeStats = (empId) => employeeStats[empId] || {
    totalHours: 0,
    normHours: null,
    overtimeHours: 0,
    overtimePay: 0,
    salary: 0,
    calculatedSalary: 0,
    salaryOverride: 0,
    salesCommission: 0,
    salesBonus: 0,
    planBonus: 0,
    razvozka: 0,
    calculatedRazvozka: 0,
    razvozkaOverride: 0,
    advance: 0,
    correction: 0,
    toPay: 0
  };

  const getClubTotal = (clubName) => {
    const clubEmps = employees.filter(e => (e.club || '4YOU') === clubName);
    return clubEmps.reduce((sum, emp) => {
      const s = getEmployeeStats(emp.id);
      // toPay already = salary + razvozka - advance + correction
      return sum + s.toPay;
    }, 0);
  };

  // Returns advance total for a club (for display hint)
  const getClubAdvanceTotal = (clubName) => {
    const clubEmps = employees.filter(e => (e.club || '4YOU') === clubName);
    return clubEmps.reduce((sum, emp) => sum + getEmployeeStats(emp.id).advance, 0);
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
      const overrideVal = clubDailyRazvozka[dayNum];
      const hasOverride = overrideVal !== undefined && overrideVal !== null && overrideVal !== '';
      if (hasOverride) {
        const dailyAmount = overrideVal === '-' ? 0 : (parseFloat(overrideVal) || 0);
        total += dailyAmount;
      } else {
        let daySum = 0;
        clubEmployees.forEach(emp => {
          const empDocId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
          const val = scheduleData[empDocId]?.days?.[dayNum] || '';
          daySum += getShiftRazvozkaAmount(val, emp.club || '4YOU');
        });
        total += daySum;
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
        <div style={{ marginBottom: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Database size={32} color="var(--accent-purple)" />
            <h1 style={{ fontSize: 32, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
              Графики работы
            </h1>
          </div>
          
          {/* Month Selector on the selection page */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 12px' }}>
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} 
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: 8, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-center" style={{ minWidth: 140 }}>
              <h2 className="text-base font-bold text-[var(--text-primary)] capitalize" style={{ margin: 0 }}>
                {format(currentMonth, 'LLLL yyyy', { locale: ru })}
              </h2>
            </div>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} 
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: 8, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {canEditSchedule ? 'Выберите объект для просмотра и редактирования табеля' : 'Выберите объект для просмотра табеля'}
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
              <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(125,111,179,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={32} color="var(--accent-purple)" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: 4 }}>{club}</h3>
              
              {canViewFull && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>К выплате на руки:</div>
                  <div style={{ fontSize: 28, fontWeight: 950, color: 'var(--accent-purple)', letterSpacing: '-0.03em' }}>
                    {formatCurrency(getClubTotal(club))}
                  </div>
                  {getClubAdvanceTotal(club) > 0 && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.03em' }}>
                      аванс вычтен: −{formatCurrency(getClubAdvanceTotal(club))}
                    </div>
                  )}
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
            <div className="hidden md:flex items-center gap-2 mt-1">
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

          {/* Beautiful modern Pin toggle button (на мобильном скрыт — там всегда закреплено) */}
          <button
            className="hidden md:flex"
            onClick={() => setStickyNames(v => !v)}
            title={stickyNames ? 'Разрешить свободную прокрутку всей таблицы до конца (для скриншотов)' : 'Зафиксировать колонки сотрудников и итогов по бокам'}
            style={{
              alignItems: 'center', gap: 6,
              padding: '8px 16px',
              borderRadius: 14,
              border: `1px solid ${stickyNames ? 'var(--accent-purple)' : 'var(--border)'}`,
              background: stickyNames ? 'rgba(125,111,179,0.08)' : 'var(--bg-hover)',
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

          {canEditSchedule && (
            <button onClick={() => setShowSettingsModal(true)} className="p-2.5 bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)]/80 border border-[var(--border)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2"><Settings size={16} /><span className="text-xs font-bold uppercase tracking-tight">Настройки</span></button>
          )}
        </div>
      </div>

      {/* Europe City: план продаж на месяц. План и факт вводятся вручную;
          при факт >= план каждому сотруднику со сменами +100 000 ₸ (авто). */}
      {canViewFull && isEuropeCitySelected && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl px-5 py-4 shadow-xl">
          <span className="text-lg flex-shrink-0">🎯</span>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">План продаж на месяц, ₸</p>
            <input
              type="text"
              className="w-[130px] bg-[var(--bg-hover)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm font-black text-yellow-400 outline-none focus:border-yellow-500/50"
              placeholder="0"
              value={ecPlanEdits.plan ?? (settings?.ecSalesPlan ?? '')}
              onChange={e => setEcPlanEdits(p => ({ ...p, plan: e.target.value }))}
              onBlur={e => { updateSettings({ ...settings, ecSalesPlan: e.target.value.trim() }); setEcPlanEdits(p => { const n = { ...p }; delete n.plan; return n; }); }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
            />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">Факт продаж, ₸</p>
            <input
              type="text"
              className="w-[130px] bg-[var(--bg-hover)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm font-black text-[var(--text-primary)] outline-none focus:border-yellow-500/50"
              placeholder="0"
              value={ecPlanEdits.fact ?? (settings?.ecSalesFact ?? '')}
              onChange={e => setEcPlanEdits(p => ({ ...p, fact: e.target.value }))}
              onBlur={e => { updateSettings({ ...settings, ecSalesFact: e.target.value.trim() }); setEcPlanEdits(p => { const n = { ...p }; delete n.fact; return n; }); }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            {ecPlan > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg"
                  style={ecPlanAchieved
                    ? { background: 'rgba(95,156,129,0.15)', color: '#5F9C81', border: '1px solid rgba(95,156,129,0.35)' }
                    : { background: 'rgba(192,143,79,0.12)', color: '#C08F4F', border: '1px solid rgba(192,143,79,0.3)' }}
                >
                  {ecPlanAchieved ? '✓ План выполнен — бонус 100 000 ₸ за 15 смен' : `Выполнено ${Math.min(100, Math.round((ecFact / ecPlan) * 100))}% — гарант. бонус 50 000 ₸ за 15 смен`}
                </span>
                <span className="text-[10px] font-semibold text-[var(--text-muted)]">Бонус ÷ 15 × отработанные смены, считается каждому автоматически</span>
              </div>
            ) : (
              <span className="text-[10.5px] font-semibold text-[var(--text-muted)]">Впишите план и факт — бонус посчитается сам: план выполнен → 100 000 ₸ за 15 смен, не выполнен → 50 000 ₸ за 15 смен (÷15 × отработанные смены). В ячейке колонки «План продаж» сумму можно перекрыть вручную.</span>
            )}
          </div>
        </div>
      )}

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
          <table className="w-full text-left border-separate border-spacing-0 select-none" style={{ minWidth: 900 }}>
            <thead>
              <tr className="text-[9px] uppercase tracking-widest font-black text-[var(--text-muted)]">
                {/* Visual "Two-Part" Split using Sticky & Thick Border */}
                <th style={{ position: stickyNames ? 'sticky' : 'relative', top: 0, left: 0, zIndex: stickyNames ? 50 : 10, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', borderRight: '2px solid var(--border)', minWidth: 140, maxWidth: 280, width: 140 }} className="px-2 md:px-6 py-4 md:py-5">
                  Сотрудник
                </th>
                
                {daysInMonth.map(day => (
                  <th key={day.toString()} style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', minWidth: 44, maxWidth: 90 }} className={`px-0.5 py-3 text-center ${HOLIDAYS_2026.includes(format(day, 'yyyy-MM-dd')) ? 'text-red-500' : ''}`}>
                    <div className="flex flex-col items-center gap-0">
                      <span className="opacity-50 hidden md:block">{format(day, 'eeeeee', { locale: ru }) + '.'}</span>
                      <span style={{ fontSize: 10 }}>{format(day, 'd')}</span>
                    </div>
                  </th>
                ))}
                
                {visibleCols.totalHours && <th style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className="px-4 py-5 text-center min-w-[95px]">Всего ч.</th>}
                {canViewFull && visibleCols.normHours && <th style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className="px-4 py-5 text-center min-w-[90px]">Норма ч.</th>}
                {canViewFull && <th style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className="px-4 py-5 text-center min-w-[90px]">₸/ч</th>}
                {canViewFull && visibleCols.salary && <th style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className="px-4 py-5 text-center min-w-[140px]">Зарплата</th>}
                {canViewFull && visibleCols.salesCommission && <th style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className="px-4 py-5 text-center min-w-[110px]">{isEuropeCitySelected ? 'План продаж' : '% продажи'}</th>}
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
                    <td style={{ position: stickyNames ? 'sticky' : 'relative', left: 0, zIndex: stickyNames ? 30 : 5, backgroundColor: 'var(--bg-card)', borderRight: '2px solid var(--border)', minWidth: 140, maxWidth: 280, width: 140 }} className="px-2 md:px-6 py-3 md:py-4">
                      <div className="w-full">
                        {editingEmpId === emp.id && canEditSchedule ? (
                          <input
                            autoFocus
                            className="bg-[var(--bg-hover)] border border-[var(--accent-purple)] rounded px-2 py-1 text-xs md:text-sm text-[var(--text-primary)] w-full outline-none"
                            value={editNameValue}
                            onChange={e => setEditNameValue(e.target.value)}
                            onBlur={() => {
                              updateEmployee(emp.id, editNameValue);
                              setEditingEmpId(null);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                updateEmployee(emp.id, editNameValue);
                                setEditingEmpId(null);
                              } else if (e.key === 'Escape') {
                                setEditingEmpId(null);
                              }
                            }}
                          />
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span
                              onClick={() => { if (canEditSchedule) { setEditingEmpId(emp.id); setEditNameValue(emp.name); } }}
                              title={emp.name}
                              style={{ overflowWrap: 'break-word', wordBreak: 'break-word', hyphens: 'auto' }}
                              className={`text-xs md:text-sm font-bold text-[var(--text-primary)] leading-tight block w-full ${canEditSchedule ? 'cursor-pointer' : 'cursor-default'}`}
                            >{emp.name}</span>
                            {emp.isService && (
                              <span className="text-[7px] font-black px-1 py-0.5 rounded self-start hidden md:inline" style={{ background: 'rgba(192,143,79,0.12)', color: '#C08F4F', border: '1px solid rgba(192,143,79,0.25)' }}>СЕР</span>
                            )}
                            {canEditSchedule && (
                              deletingEmpId === emp.id ? (
                                <div className="flex items-center gap-1 mt-0.5 text-[8px] font-black uppercase tracking-wider">
                                  <span className="text-red-500 font-extrabold">Удалить?</span>
                                  <button
                                    onClick={() => { removeEmployee(emp.id); setDeletingEmpId(null); }}
                                    className="px-1.5 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors cursor-pointer"
                                  >Да</button>
                                  <button
                                    onClick={() => setDeletingEmpId(null)}
                                    className="px-1.5 py-0.5 bg-zinc-700 text-white rounded hover:bg-zinc-600 transition-colors cursor-pointer"
                                  >Нет</button>
                                </div>
                              ) : (
                                <div className="flex items-center lg:opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 mt-0.5">
                                  <button onClick={() => moveEmployee(emp.id, 'up')} className="p-0.5 text-[var(--text-muted)] hover:text-[var(--accent-purple)]"><ArrowUp size={11}/></button>
                                  <button onClick={() => moveEmployee(emp.id, 'down')} className="p-0.5 text-[var(--text-muted)] hover:text-[var(--accent-purple)]"><ArrowDown size={11}/></button>
                                  <button
                                    onClick={() => setEmployeeService(emp.id, !emp.isService)}
                                    className={`p-0.5 transition-colors ${emp.isService ? 'text-amber-500' : 'text-[var(--text-muted)] hover:text-amber-400'}`}
                                    title={emp.isService ? 'Снять статус сервисника' : 'Отметить как сервисника'}
                                  ><Wrench size={11}/></button>
                                  <button onClick={() => setDeletingEmpId(emp.id)} className="p-0.5 text-[var(--text-muted)] hover:text-red-500"><Trash2 size={11}/></button>
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    {daysInMonth.map((day, dIdx) => {
                      const empDocId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
                      return (
                        <ScheduleCell key={day.toString()} monthKey={monthKey} empId={emp.id} dayNum={format(day, 'd')} initialValue={scheduleData[empDocId]?.days?.[format(day, 'd')] || ''} isHoliday={HOLIDAYS_2026.includes(format(day, 'yyyy-MM-dd'))} isToday={format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')} onKeyDown={handleKeyDown} updateCell={updateCell} rowIdx={rowIdx} colIdx={dIdx + 1} canEdit={canEditSchedule} club={emp.club || '4YOU'} />
                      );
                    })}
                    {visibleCols.totalHours && <td className="px-4 py-4 text-center text-xs text-[var(--accent-purple)] bg-purple-500/5 font-bold border-r border-[var(--border)]">{stats.totalHours.toFixed(1)} ч</td>}
                    {canViewFull && visibleCols.normHours && (
                      <td className="px-4 py-4 text-center text-xs bg-emerald-500/5 font-bold border-r border-[var(--border)]">
                        {stats.normHours ? (
                          <span className="text-emerald-400">{Number(stats.normHours).toFixed(1)}ч</span>
                        ) : stats.autoRate ? (
                          <span className="text-[var(--text-muted)]">{stats.totalHours.toFixed(1)}ч</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    )}
                    {canViewFull && (
                      <td className="p-0 bg-violet-500/5 border-r border-[var(--border)]">
                        {isEuropeCitySelected ? (
                          /* Europe City: оплата по сменам — показываем кол-во отработанных смен */
                          <div className="w-full min-h-[46px] flex flex-col items-center justify-center gap-0.5 px-2">
                            <span className="text-xs font-bold text-violet-400/70">{stats.shiftsWorked}</span>
                            <span style={{ fontSize: 8, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>смен</span>
                          </div>
                        ) : stats.autoRate ? (
                          <div className="w-full min-h-[46px] flex flex-col items-center justify-center gap-0.5 px-2">
                            <span className="text-xs font-bold text-violet-400/70">{Math.round(stats.empRate).toLocaleString('ru-RU')}</span>
                            <span style={{ fontSize: 8, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>авто</span>
                          </div>
                        ) : (
                          <input
                            type="number"
                            className="w-full h-full min-h-[46px] bg-transparent text-center text-xs font-bold text-violet-400 outline-none"
                            value={hourlyRates[emp.id] ?? ''}
                            placeholder={String(settings?.hourlyRate || 1500)}
                            onChange={e => setHourlyRates(prev => ({ ...prev, [emp.id]: e.target.value }))}
                            onBlur={e => updateEmployeeHourlyRate(emp.id, e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                          />
                        )}
                      </td>
                    )}
                    {canViewFull && visibleCols.salary && (
                      <td className="p-0 bg-blue-500/5 border-r border-[var(--border)]">
                        <input
                          type="text"
                          disabled={!canViewFull}
                          className={`w-full bg-transparent text-center text-xs font-bold text-blue-400 outline-none ${stats.overtimeHours > 0 ? 'pt-2 pb-0 min-h-[32px]' : 'min-h-[46px]'}`}
                          value={getFinEdit(emp.id, 'salary', stats.salaryOverride ?? '')}
                          placeholder={String(stats.calculatedSalary || '')}
                          onChange={e => setFinEdit(emp.id, 'salary', e.target.value)}
                          onFocus={() => setFinEdit(emp.id, 'salary', stats.salaryOverride ?? '')}
                          onBlur={e => { updateSalaryOverride(monthKey, emp.id, e.target.value); clearFinEdit(emp.id, 'salary'); }}
                          onKeyDown={e => { if (e.key === 'Enter') { updateSalaryOverride(monthKey, emp.id, e.target.value); e.target.blur(); } }}
                        />
                        {stats.overtimeHours > 0 && (
                          <div className="text-center pb-1.5 leading-none" style={{ fontSize: 8, fontWeight: 900, color: '#BF8055', whiteSpace: 'nowrap' }}>
                            +{stats.overtimePay.toLocaleString()} сверхур.
                          </div>
                        )}
                      </td>
                    )}
                    {canViewFull && visibleCols.salesCommission && (
                      isEuropeCitySelected ? (
                        /* Europe City: бонус из плана продаж. Авто-сумма (база/15 × смены)
                           видна в ячейке; ручной ввод перекрывает авто, пустая ячейка возвращает авто. */
                        <td className="p-0 text-center border-r border-[var(--border)] bg-yellow-500/5">
                          <input
                            type="text"
                            disabled={!canViewFull}
                            className="w-full h-full min-h-[34px] bg-transparent text-center text-xs font-bold text-yellow-400 outline-none"
                            placeholder="—"
                            value={getFinEdit(emp.id, 'salesBonus', stats.bonusIsAuto
                              ? (stats.planBonus > 0 ? stats.planBonus.toLocaleString() : '')
                              : (stats.salesBonusRaw ?? ''))}
                            onChange={e => setFinEdit(emp.id, 'salesBonus', e.target.value)}
                            onFocus={() => setFinEdit(emp.id, 'salesBonus', stats.bonusIsAuto ? '' : (stats.salesBonusRaw ?? ''))}
                            onBlur={e => {
                              const v = e.target.value.trim();
                              if (v !== String(stats.salesBonusRaw ?? '').trim()) updateSalesBonus(monthKey, emp.id, v);
                              clearFinEdit(emp.id, 'salesBonus');
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                          />
                          {stats.bonusIsAuto && stats.planBonus > 0 && (
                            <div className="text-center pb-1.5 leading-none" style={{ fontSize: 8, fontWeight: 900, color: ecPlanAchieved ? '#5F9C81' : '#C08F4F', whiteSpace: 'nowrap' }}>
                              {ecPlanAchieved ? `план 🎯 · ${stats.shiftsWorked} смен` : `гарант. · ${stats.shiftsWorked} смен`}
                            </div>
                          )}
                          {!stats.bonusIsAuto && (
                            <div className="text-center pb-1.5 leading-none" style={{ fontSize: 8, fontWeight: 900, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              вручную
                            </div>
                          )}
                        </td>
                      ) : (
                        <td className="px-4 py-4 text-center text-xs font-bold border-r border-[var(--border)] bg-yellow-500/5">
                          <span className={stats.salesCommission > 0 ? 'text-yellow-400 font-extrabold' : 'text-[var(--text-muted)]'}>
                            {stats.salesCommission > 0 ? `${Math.round(stats.salesCommission).toLocaleString()} ₸` : '—'}
                          </span>
                        </td>
                      )
                    )}
                    {canViewFull && visibleCols.razvozka && (
                      <td className="p-0 bg-emerald-500/5 border-r border-[var(--border)]">
                        {isPromenadeSelected ? (
                          /* Promenade: развозку вводят в строке снизу по дням. Здесь — только итог:
                             у сервисников сумма (read-only), у админов «—». */
                          <div className="w-full min-h-[46px] flex items-center justify-center text-xs font-bold text-emerald-400">
                            {stats.isService ? (stats.razvozka ? stats.razvozka.toLocaleString() : '0') : <span className="text-[var(--text-muted)]">—</span>}
                          </div>
                        ) : (
                          <input
                            type="text"
                            disabled={!canViewFull}
                            className="w-full h-full min-h-[46px] bg-transparent text-center text-xs font-bold text-emerald-400 outline-none"
                            value={getFinEdit(emp.id, 'razvozka', stats.razvozkaOverride ?? '')}
                            placeholder={String(stats.calculatedRazvozka || '')}
                            onChange={e => setFinEdit(emp.id, 'razvozka', e.target.value)}
                            onFocus={() => setFinEdit(emp.id, 'razvozka', stats.razvozkaOverride ?? '')}
                            onBlur={e => { updateRazvozkaOverride(monthKey, emp.id, e.target.value); clearFinEdit(emp.id, 'razvozka'); }}
                            onKeyDown={e => { if (e.key === 'Enter') { updateRazvozkaOverride(monthKey, emp.id, e.target.value); e.target.blur(); } }}
                          />
                        )}
                      </td>
                    )}
                    {canViewFull && visibleCols.advance && (
                      <td
                        ref={el => { advanceCellRefs.current[emp.id] = el; }}
                        className="p-0 bg-orange-500/5 border-r border-[var(--border)] relative"
                      >
                        <input
                          type="text"
                          disabled={!canViewFull}
                          className="w-full h-full min-h-[46px] bg-transparent text-center text-xs font-bold text-orange-400 outline-none"
                          value={getFinEdit(emp.id, 'advance', stats.advanceRaw ?? '')}
                          onChange={e => setFinEdit(emp.id, 'advance', e.target.value)}
                          onFocus={() => setFinEdit(emp.id, 'advance', stats.advanceRaw ?? '')}
                          onBlur={e => {
                            const raw = e.target.value.trim();
                            const num = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
                            if (raw !== '' && !isNaN(num) && num > 0 && num < 500) {
                              // Show inline popover instead of window.confirm
                              const rect = advanceCellRefs.current[emp.id]?.getBoundingClientRect();
                              setPendingAdvanceConfirm({ empId: emp.id, value: raw, num, rect });
                              return; // don't save yet
                            }
                            updateAdvance(monthKey, emp.id, raw);
                            clearFinEdit(emp.id, 'advance');
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
                        />
                      </td>
                    )}
                    {canViewFull && visibleCols.correction && (
                      <td className="p-0 bg-purple-500/5 border-r border-[var(--border)]">
                        <input
                          type="text"
                          disabled={!canViewFull}
                          className="w-full h-full min-h-[46px] bg-transparent text-center text-xs font-bold text-[var(--accent-purple)] outline-none"
                          value={getFinEdit(emp.id, 'correction', stats.correctionRaw ?? '')}
                          onChange={e => setFinEdit(emp.id, 'correction', e.target.value)}
                          onFocus={() => setFinEdit(emp.id, 'correction', stats.correctionRaw ?? '')}
                          onBlur={e => { updateCorrection(monthKey, emp.id, e.target.value.trim()); clearFinEdit(emp.id, 'correction'); }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
                        />
                      </td>
                    )}
                    {canViewFull && visibleCols.toPay && <td style={{ position: stickyNames ? 'sticky' : 'relative', right: stickyNames ? 0 : undefined, zIndex: stickyNames ? 30 : 5, backgroundColor: 'var(--bg-card)', borderLeft: stickyNames ? '2px solid var(--border)' : undefined }} className="px-1 md:px-4 py-4 text-center text-xs md:text-sm text-[var(--accent-purple)] font-black min-w-[75px] md:min-w-[130px] max-w-[75px] md:max-w-[130px]">{stats.toPay.toLocaleString()}</td>}
                  </tr>
                );
              })}
              {pendingRows.map((row) => (
                <tr key={row.id}>
                  <td style={{ position: stickyNames ? 'sticky' : 'relative', left: 0, zIndex: stickyNames ? 30 : 5, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '2px solid var(--border)' }} className="px-2 md:px-6 py-4 min-w-[160px] md:min-w-[280px] max-w-[160px] md:max-w-[280px]">
                    <div className="flex items-center gap-2 md:gap-4"><Users size={14} className="text-[var(--text-muted)]" /><input value={row.name} autoFocus onChange={e => setPendingRows(prev => prev.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))} onKeyDown={e => e.key === 'Enter' && savePendingRow(row.id)} placeholder="ФИО..." className="bg-transparent text-xs md:text-sm text-[var(--text-primary)] outline-none w-full" /><button onClick={() => savePendingRow(row.id)} className="text-green-500"><Check size={16}/></button></div>
                  </td>
                  {daysInMonth.map(d => <td key={d.toString()} style={{ borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="text-[10px] text-[var(--text-muted)] text-center italic">—</td>)}
                  {Object.keys(visibleCols).map(k => {
                    const isFin = ['salary', 'salesCommission', 'razvozka', 'advance', 'correction', 'toPay'].includes(k);
                    if (isFin && !canViewFull) return null;
                    if (!visibleCols[k]) return null;
                    if (k === 'toPay') return <td key={k} style={{ position: stickyNames ? 'sticky' : 'relative', right: stickyNames ? 0 : undefined, zIndex: stickyNames ? 30 : 5, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderLeft: stickyNames ? '2px solid var(--border)' : undefined }} className="min-w-[75px] md:min-w-[130px] max-w-[75px] md:max-w-[130px]"></td>;
                    return <td key={k} style={{ borderTop: '1px solid var(--border)' }}></td>;
                  })}
                </tr>
              ))}
              {canEditSchedule && (
                <tr>
                  <td style={{ position: stickyNames ? 'sticky' : 'relative', left: 0, zIndex: stickyNames ? 30 : 5, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '2px solid var(--border)' }} className="px-2 md:px-6 py-4 min-w-[160px] md:min-w-[280px] max-w-[160px] md:max-w-[280px]">
                    <button onClick={() => setPendingRows(p => [...p, { id: Math.random().toString(36).substr(2, 9), name: '' }])} className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-[var(--accent-purple)] rounded-xl border border-purple-500/20 font-black text-[9px] uppercase tracking-widest transition-all"><Plus size={12}/> Добавить</button>
                  </td>
                  <td colSpan={daysInMonth.length + 10} style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}></td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ position: stickyNames ? 'sticky' : 'relative', bottom: footerBottomOffset, left: 0, zIndex: stickyNames ? 50 : 5, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '2px solid var(--border)' }} className="px-2 md:px-6 py-4 font-black text-[10px] text-[var(--text-muted)] uppercase tracking-widest min-w-[120px] md:min-w-[280px] max-w-[120px] md:max-w-[280px]">Итого:</td>
                
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
                    <td key={day.toString()} style={{ position: 'sticky', bottom: footerBottomOffset, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-1 py-2 text-center font-black text-[10px] text-[var(--text-secondary)] min-w-[60px] md:min-w-[90px]">
                      {dayTotalHours > 0 ? `${dayTotalHours.toFixed(1)}ч` : '—'}
                    </td>
                  );
                })}
                {visibleCols.totalHours && <td style={{ position: 'sticky', bottom: footerBottomOffset, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-[var(--accent-purple)]">{clubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).totalHours, 0).toFixed(1)}ч</td>}
                {canViewFull && visibleCols.normHours && <td style={{ position: 'sticky', bottom: footerBottomOffset, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-[var(--text-muted)]">—</td>}
                {canViewFull && <td style={{ position: 'sticky', bottom: footerBottomOffset, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-[var(--text-muted)]">—</td>}
                {canViewFull && visibleCols.salary && <td style={{ position: 'sticky', bottom: footerBottomOffset, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-blue-400">{clubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).salary, 0).toLocaleString()}</td>}
                {canViewFull && visibleCols.salesCommission && <td style={{ position: 'sticky', bottom: footerBottomOffset, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-yellow-400">{Math.round(clubEmployees.reduce((acc, emp) => { const s = getEmployeeStats(emp.id); return acc + s.salesCommission + (s.salesBonus || 0); }, 0)).toLocaleString()}</td>}
                {canViewFull && visibleCols.razvozka && <td style={{ position: 'sticky', bottom: footerBottomOffset, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-emerald-400">{clubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).razvozka, 0).toLocaleString()}</td>}
                {canViewFull && visibleCols.advance && <td style={{ position: 'sticky', bottom: footerBottomOffset, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-orange-400">{clubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).advance, 0).toLocaleString()}</td>}
                {canViewFull && visibleCols.correction && <td style={{ position: 'sticky', bottom: footerBottomOffset, zIndex: 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-[var(--accent-purple)]">{clubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).correction, 0).toLocaleString()}</td>}
                {canViewFull && visibleCols.toPay && <td style={{ position: 'sticky', bottom: footerBottomOffset, right: stickyNames ? 0 : undefined, zIndex: stickyNames ? 50 : 40, backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderLeft: stickyNames ? '2px solid var(--border)' : undefined }} className="px-1 md:px-4 py-4 text-center font-black text-xs md:text-sm text-[var(--accent-purple)] min-w-[75px] md:min-w-[130px] max-w-[75px] md:max-w-[130px]">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <span>{clubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).toPay, 0).toLocaleString()}</span>
                    <span className="hidden md:inline" style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>в т.ч. {clubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).razvozka, 0).toLocaleString()}₸ развозка</span>
                  </div>
                </td>}
              </tr>
 
              {/* ── Развозка row — sticky at bottom:0 (скрыта для Europe City) ── */}
              {canViewFull && !razvozkaRowHidden && (
                <tr>
                  <td style={{ position: stickyNames ? 'sticky' : 'relative', bottom: 0, left: 0, zIndex: stickyNames ? 50 : 5, backgroundColor: 'var(--bg-razvozka-sticky)', borderTop: '2px solid var(--accent-purple)', borderRight: '2px solid var(--border)', whiteSpace: 'nowrap' }} className="px-2 md:px-6 py-3 font-black text-[10px] text-[var(--accent-purple)] uppercase tracking-widest min-w-[120px] md:min-w-[280px] max-w-[120px] md:max-w-[280px]">
                    🚗 Развозка
                  </td>
                  {daysInMonth.map(day => {
                    const dayNum = format(day, 'd');
                    const dayOfWeek = day.getDay();
                    const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
                    const isHolidayDay = HOLIDAYS_2026.includes(format(day, 'yyyy-MM-dd'));
 
                    // Подсказка считает так же, как реальная колонка «Развозка»:
                    // с учётом клуба (у NURLY ORDA порог 22:00) и БЕЗ исключения
                    // выходных — раньше цифры расходились и менеджеры вбивали неверную
                    let dailyAmount = 0;
                    clubEmployees.forEach(emp => {
                      const empDocId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
                      const val = scheduleData[empDocId]?.days?.[dayNum] || '';
                      dailyAmount += getShiftRazvozkaAmount(val, selectedClub);
                    });
                    
                    const clubDocId = `${monthKey}_${selectedClub}`;
                    const overrideVal = dailyRazvozka?.[clubDocId]?.days?.[dayNum];
                    const hasOverride = overrideVal !== undefined && overrideVal !== null && overrideVal !== '';
                    const displayValue = hasOverride ? overrideVal : '';
                    const dayReceipt = dailyRazvozka?.[clubDocId]?.receipts?.[dayNum];
                    // Promenade: развозка ручная (авто-подсказка не нужна)
                    const placeholderVal = isPromenadeSelected ? '—' : (dailyAmount > 0 ? `${dailyAmount}` : '—');

                    return (
                      <td key={day.toString()} style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="p-0 text-center min-w-[60px] md:min-w-[90px]">
                        <div className="flex flex-col items-center justify-center">
                          <input
                            type="text"
                            className="w-full h-[30px] bg-transparent text-center text-[10px] font-black text-[var(--accent-purple)] outline-none border-none placeholder-purple-300/50"
                            value={displayValue ?? ''}
                            placeholder={placeholderVal}
                            onChange={e => updateDailyRazvozka(monthKey, selectedClub, dayNum, e.target.value)}
                          />
                          {isPromenadeSelected && (
                            <span className="flex items-center justify-center gap-0.5" style={{ height: 14, lineHeight: 1 }}>
                              {dayReceipt && <a href={dayReceipt} target="_blank" rel="noreferrer" title="Открыть чек" style={{ fontSize: 10, textDecoration: 'none', color: '#5F9C81' }}>✓</a>}
                              <label title={dayReceipt ? 'Заменить чек' : 'Прикрепить чек'} style={{ cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)' }}>
                                {uploadingReceipt === dayNum ? '⏳' : '📎'}
                                <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleDailyReceiptUpload(dayNum, f); e.target.value = ''; }} />
                              </label>
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  {visibleCols.totalHours && <td style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-[10px] text-[var(--text-muted)]">—</td>}
                  {canViewFull && visibleCols.normHours && <td style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-[10px] text-[var(--text-muted)]">—</td>}
                  {canViewFull && <td style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-[10px] text-[var(--text-muted)]">—</td>}
                  {canViewFull && visibleCols.salary && <td style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-[10px] text-[var(--text-muted)]">—</td>}
                  {canViewFull && visibleCols.salesCommission && <td style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-[10px] text-[var(--text-muted)]">—</td>}
                  {canViewFull && visibleCols.razvozka && <td style={{ position: 'sticky', bottom: 0, zIndex: 40, backgroundColor: 'var(--bg-razvozka-cell)', borderTop: '2px solid var(--accent-purple)', borderRight: '1px solid var(--border)' }} className="px-4 py-4 text-center font-black text-xs text-[var(--accent-purple)]">{clubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).razvozka, 0).toLocaleString()} ₸</td>}
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
                      {clubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).razvozka, 0).toLocaleString()} ₸
                    </td>
                  )}
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      {canViewFull && (
        <div className="grid gap-3 md:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[ 
            { l: 'Всего ч',  v: clubEmployees.reduce((a, e) => a + getEmployeeStats(e.id).totalHours, 0).toFixed(1) + ' ч', c: 'text-[var(--text-primary)]' }, 
            { l: 'Зарплата', v: clubEmployees.reduce((a, e) => a + getEmployeeStats(e.id).salary,     0).toLocaleString() + ' ₸', c: 'text-blue-400' }, 
            !isEuropeCitySelected && { l: '% продажи', v: Math.round(clubEmployees.reduce((a, e) => a + getEmployeeStats(e.id).salesCommission, 0)).toLocaleString() + ' ₸', c: 'text-yellow-400' },
            isEuropeCitySelected && { l: 'План продаж', v: ecPlan > 0 ? `${Math.min(999, Math.round((ecFact / ecPlan) * 100))}%` : '—', c: ecPlanAchieved ? 'text-emerald-400' : 'text-yellow-400' },
            isEuropeCitySelected && { l: 'Бонусы продаж', v: clubEmployees.reduce((a, e) => a + (getEmployeeStats(e.id).salesBonus || 0), 0).toLocaleString() + ' ₸', c: 'text-yellow-400' },
            !isEuropeCitySelected && { l: 'Развозка', v: clubEmployees.reduce((a, e) => a + getEmployeeStats(e.id).razvozka,   0).toLocaleString() + ' ₸', c: 'text-emerald-400' },
            { l: 'Аванс',    v: clubEmployees.reduce((a, e) => a + getEmployeeStats(e.id).advance,    0).toLocaleString() + ' ₸', c: 'text-orange-400' },
            { l: 'ФИКС',     v: clubEmployees.reduce((a, e) => a + getEmployeeStats(e.id).correction, 0).toLocaleString() + ' ₸', c: 'text-[var(--accent-purple)]' },
            { l: 'К выдаче', v: clubEmployees.reduce((a, e) => a + getEmployeeStats(e.id).toPay,      0).toLocaleString() + ' ₸', c: 'text-[var(--accent-purple)]' }
          ].filter(Boolean).map((s, i) => (
            <div key={i} className="bg-[var(--bg-card)] p-3 md:p-5 rounded-2xl border border-[var(--border)] shadow-xl min-w-0">
              <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] whitespace-nowrap">{s.l}</p>
              <p className={`text-base md:text-xl font-black ${s.c} mt-1 whitespace-nowrap`}>{s.v}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Развозка summary card ── */}
      {canViewFull && !razvozkaRowHidden && (
        <div 
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:px-8 sm:py-6 border-[1.5px] border-[var(--accent-purple)] rounded-3xl shadow-xl"
          style={{
            background: 'linear-gradient(135deg, rgba(125,111,179,0.12) 0%, rgba(125,111,179,0.04) 100%)',
            boxShadow: '0 4px 24px rgba(125,111,179,0.15)'
          }}
        >
          <div className="flex items-start sm:items-center gap-3">
            <span className="text-2xl flex-shrink-0">🚗</span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">Развозка за месяц</p>
              <p className="text-[11px] text-[var(--text-muted)] font-semibold leading-relaxed">
                1 500 ₸ за смену с началом в 6:30 или окончанием в 22:30 (3 000 ₸ за смену 6:30–22:30)
              </p>
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-[var(--accent-purple)] tracking-tight flex-shrink-0">
            {clubEmployees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).razvozka, 0).toLocaleString()} ₸
          </p>
        </div>
      )}

      {showSettingsModal && ReactDOM.createPortal((
        <div onClick={() => setShowSettingsModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl" style={{ width: '100%', maxWidth: '42rem', maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: '2rem', overflow: 'hidden' }}>
            <div className="px-6 py-4 md:px-8 md:py-6 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Settings size={18} className="text-[var(--accent-purple)]" /> Настройки
              </h2>
              <button onClick={() => setShowSettingsModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}><div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-[var(--text-muted)]">Смены</h3>
                <div className="space-y-2">
                  <input type="text" value={settings?.shift1} onChange={e => updateSettings({ ...settings, shift1: e.target.value })} className="w-full bg-[var(--bg-hover)] border border-[var(--border)] rounded-xl p-3 text-[var(--text-primary)] text-sm" />
                  <input type="text" value={settings?.shift2} onChange={e => updateSettings({ ...settings, shift2: e.target.value })} className="w-full bg-[var(--bg-hover)] border border-[var(--border)] rounded-xl p-3 text-[var(--text-primary)] text-sm" />
                  {canViewFull && (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-medium italic">
                      <span>Базовая ставка:</span>
                      <input type="number" value={settings?.hourlyRate || 1500} onChange={(e) => updateSettings({ ...settings, hourlyRate: parseInt(e.target.value) || 0 })} className="bg-[var(--bg-hover)] border border-[var(--border)] rounded px-1.5 py-0.5 w-16 text-blue-400 font-bold outline-none" />
                      <span>₸/час</span>
                    </div>
                  )}
                </div>
              </div>
              {canViewFull && clubEmployees.filter(e => !e.isService && !(e.name||'').toLowerCase().includes('сервис') && !(e.name||'').toLowerCase().includes('техник')).length > 0 && (
                <div className="md:col-span-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase text-[var(--text-muted)]">Ставки сотрудников</h3>
                    {!isEuropeCitySelected && (
                      <button
                        onClick={() => {
                          if (!window.confirm('Норма будет зафиксирована по текущим часам в графике. Делайте это только когда график заполнен на ВЕСЬ месяц — иначе всё сверх появившихся позже смен посчитается как переработка. Продолжить?')) return;
                          clubEmployees.filter(e => !e.isService && !(e.name||'').toLowerCase().includes('сервис') && !(e.name||'').toLowerCase().includes('техник')).forEach(emp => {
                            const empDocId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
                            const empScheduleData = scheduleData[empDocId] || {};
                            const hasSalary = parseFloat(fixedSalaries[emp.id]) || emp.fixedSalary;
                            const hasNorm = normHoursLocal[emp.id] || empScheduleData.normHours;
                            const empStats = getEmployeeStats(emp.id);
                            if (hasSalary && !hasNorm && empStats.totalHours > 0) {
                              const normVal = String(empStats.totalHours);
                              setNormHoursLocal(prev => ({ ...prev, [emp.id]: normVal }));
                              updateNormHours(monthKey, emp.id, normVal);
                            }
                          });
                        }}
                        className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all"
                      >
                        ↑ Норма для всех
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {clubEmployees.filter(e => !e.isService && !(e.name||'').toLowerCase().includes('сервис') && !(e.name||'').toLowerCase().includes('техник')).map(emp => {
                      const stats = getEmployeeStats(emp.id);
                      const empDocId = emp.id.includes('_') ? emp.id : `${monthKey}_${emp.id}`;
                      const empScheduleData = scheduleData[empDocId] || {};
                      const empRate = parseFloat(hourlyRates[emp.id]) || emp.hourlyRate || settings?.hourlyRate || 1500;
                      const empFixedSalary = parseFloat(fixedSalaries[emp.id]) || emp.fixedSalary || null;
                      const empNormHours = parseFloat(normHoursLocal[emp.id]) || empScheduleData.normHours || null;
                      const displayNorm = empNormHours || (empFixedSalary && stats.totalHours > 0 ? stats.totalHours : null);
                      // Europe City: расчёт по СМЕНАМ (норма смен, по умолчанию 15)
                      const isEC = (emp.club || '4YOU').toUpperCase() === 'EUROPE CITY';
                      // Сервисник (СЕР) с окладом → строго фикс (= оклад)
                      const isSvc = emp.isService === true || (emp.name || '').toLowerCase().includes('сервис') || (emp.name || '').toLowerCase().includes('техник');
                      const isSvcFixed = !isEC && isSvc && !!empFixedSalary;
                      const calcSalary = isSvcFixed
                        ? Math.round(empFixedSalary)
                        : (empFixedSalary && displayNorm && displayNorm > 0
                          ? Math.round(stats.totalHours / displayNorm * empFixedSalary)
                          : Math.round(stats.totalHours * empRate));
                      const normShiftsEC = (empNormHours && empNormHours <= 31) ? empNormHours : 15;
                      const perShiftEC = empFixedSalary ? Math.round(empFixedSalary / normShiftsEC) : 0;
                      const calcSalaryEC = empFixedSalary ? Math.round(stats.shiftsWorked * (empFixedSalary / normShiftsEC)) : 0;
                      return (
                        <div key={emp.id} className="flex flex-col gap-2.5 bg-[var(--bg-hover)] rounded-xl px-4 py-3">
                          <span className="text-sm font-bold text-[var(--text-primary)]">{emp.name}</span>
                          {isEC ? (
                            <>
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-black uppercase text-[var(--text-muted)]">Оклад:</span>
                                  <input type="number" value={fixedSalaries[emp.id] ?? ''} placeholder="—" onChange={e => setFixedSalaries(prev => ({ ...prev, [emp.id]: e.target.value }))} onBlur={e => updateEmployeeFixedSalary(emp.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 w-28 text-blue-400 font-bold text-sm outline-none text-center" />
                                  <span className="text-xs text-[var(--text-muted)]">₸</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-black uppercase text-[var(--text-muted)]">Норма смен:</span>
                                  <input type="number" value={(normHoursLocal[emp.id] && parseFloat(normHoursLocal[emp.id]) <= 31) ? normHoursLocal[emp.id] : ''} placeholder="15" onChange={e => setNormHoursLocal(prev => ({ ...prev, [emp.id]: e.target.value }))} onBlur={e => updateNormHours(monthKey, emp.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 w-20 text-emerald-400 font-bold text-sm outline-none text-center" />
                                  <span className="text-xs text-[var(--text-muted)]">смен</span>
                                </div>
                              </div>
                              <div className="text-xs flex flex-col gap-0.5">
                                {empFixedSalary ? (
                                  <>
                                    <span className="text-[var(--text-muted)]">Ставка: {perShiftEC.toLocaleString('ru-RU')} ₸/смена (оклад / {normShiftsEC} смен)</span>
                                    <span className="text-[var(--text-secondary)]">{stats.shiftsWorked} смен × {perShiftEC.toLocaleString('ru-RU')}₸ <span className="text-emerald-400 font-black ml-1">= {calcSalaryEC.toLocaleString('ru-RU')} ₸</span></span>
                                  </>
                                ) : (
                                  <span className="text-[var(--text-muted)]">Укажите оклад — зарплата = смены × (оклад / норма смен)</span>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              {empFixedSalary && empNormHours && empNormHours > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2 py-1 rounded-lg text-violet-400/70 font-bold text-sm text-center w-20" style={{ background: 'rgba(125,111,179,0.05)', border: '1px solid rgba(125,111,179,0.15)' }}>
                                    {Math.round(empFixedSalary / empNormHours).toLocaleString('ru-RU')}
                                  </span>
                                  <span className="text-xs text-[var(--text-muted)]">₸/ч <span style={{ fontSize: 9, opacity: 0.6 }}>(авто)</span></span>
                                </div>
                              ) : (
                                <>
                                  <input
                                    type="number"
                                    value={hourlyRates[emp.id] ?? ''}
                                    placeholder={String(settings?.hourlyRate || 1500)}
                                    onChange={e => setHourlyRates(prev => ({ ...prev, [emp.id]: e.target.value }))}
                                    onBlur={e => updateEmployeeHourlyRate(emp.id, e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                                    className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 w-20 text-violet-400 font-bold text-sm outline-none text-center"
                                  />
                                  <span className="text-xs text-[var(--text-muted)]">₸/ч</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black uppercase text-[var(--text-muted)]">Оклад:</span>
                              <input
                                type="number"
                                value={fixedSalaries[emp.id] ?? ''}
                                placeholder="—"
                                onChange={e => setFixedSalaries(prev => ({ ...prev, [emp.id]: e.target.value }))}
                                onBlur={e => updateEmployeeFixedSalary(emp.id, e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                                className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 w-28 text-blue-400 font-bold text-sm outline-none text-center"
                              />
                              <span className="text-xs text-[var(--text-muted)]">₸</span>
                            </div>
                            {empFixedSalary && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black uppercase text-[var(--text-muted)]">Норма:</span>
                                <input
                                  type="number"
                                  value={normHoursLocal[emp.id] ?? ''}
                                  placeholder={stats.totalHours.toFixed(1)}
                                  onChange={e => setNormHoursLocal(prev => ({ ...prev, [emp.id]: e.target.value }))}
                                  onBlur={e => updateNormHours(monthKey, emp.id, e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 w-20 text-emerald-400 font-bold text-sm outline-none text-center"
                                />
                                <button
                                  onClick={() => { const v = String(stats.totalHours); setNormHoursLocal(prev => ({ ...prev, [emp.id]: v })); updateNormHours(monthKey, emp.id, v); }}
                                  title="Использовать текущее количество часов как норму"
                                  style={{ fontSize: 10, fontWeight: 900, padding: '3px 8px', borderRadius: 8, background: 'rgba(95,156,129,0.1)', color: '#5F9C81', border: '1px solid rgba(95,156,129,0.2)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                  ↑ {stats.totalHours.toFixed(1)}ч
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="text-xs flex flex-col gap-0.5">
                            {isSvcFixed ? (
                              <span className="text-[var(--text-secondary)]">Оклад (фикс), график не влияет <span className="text-emerald-400 font-black ml-1">= {empFixedSalary.toLocaleString('ru-RU')} ₸</span></span>
                            ) : empFixedSalary && empNormHours && empNormHours > 0 ? (
                              <>
                                <span className="text-[var(--text-muted)]">
                                  Ставка: {Math.round(empFixedSalary / empNormHours).toLocaleString('ru-RU')} ₸/ч
                                </span>
                                {stats.overtimeHours > 0 ? (
                                  <span className="text-[var(--text-secondary)]">
                                    {empFixedSalary.toLocaleString('ru-RU')}₸ (оклад) + {stats.overtimeHours.toFixed(1)}ч × {Math.round(empFixedSalary / empNormHours).toLocaleString('ru-RU')}₸
                                    <span className="text-orange-400 font-black ml-1">= {calcSalary.toLocaleString('ru-RU')} ₸</span>
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-secondary)]">
                                    {stats.totalHours.toFixed(1)}ч / {Number(empNormHours).toFixed(1)}ч × {empFixedSalary.toLocaleString('ru-RU')}₸
                                    <span className="text-emerald-400 font-black ml-1">= {calcSalary.toLocaleString('ru-RU')} ₸</span>
                                  </span>
                                )}
                              </>
                            ) : empFixedSalary && displayNorm && displayNorm > 0 ? (
                              <>
                                <span className="text-[var(--text-secondary)]">{stats.totalHours.toFixed(1)}ч / {Number(displayNorm).toFixed(1)}ч × {empFixedSalary.toLocaleString('ru-RU')}₸</span>
                                <span className="text-emerald-400 font-black ml-1">= {calcSalary.toLocaleString('ru-RU')} ₸</span>
                              </>
                            ) : (
                              <>
                                <span className="text-[var(--text-secondary)]">{stats.totalHours.toFixed(1)}ч × {empRate.toLocaleString('ru-RU')}₸</span>
                                <span className="text-emerald-400 font-black ml-1">= {calcSalary.toLocaleString('ru-RU')} ₸</span>
                              </>
                            )}
                          </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-[var(--text-muted)]">Колонки</h3>
                <div className="grid grid-cols-1 gap-1">
                  {Object.keys(visibleCols).map(k => {
                    const isFin = ['salary', 'razvozka', 'advance', 'correction', 'toPay'].includes(k);
                    if (isFin && !canViewFull) return null;
                    return (
                      <button 
                        key={k} 
                        // База — settings.visibleCols, НЕ вычисленный visibleCols: тот принудительно
                        // прячет развозку на Europe City, и любой тумблер с открытым EC
                        // записывал razvozka:false на месяц ДЛЯ ВСЕХ клубов
                        onClick={() => updateSettings({ ...settings, visibleCols: { ...(settings?.visibleCols || {}), [k]: !visibleCols[k] } })} 
                        className={`w-full p-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${visibleCols[k] ? 'bg-purple-500/10 border-purple-500/30 text-[var(--text-primary)]' : 'bg-[var(--bg-hover)] border-transparent text-[var(--text-muted)]'}`}
                      >
                        {COLUMN_LABELS[k] || k}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div></div>
            <div className="p-4 md:p-6 bg-[var(--bg-hover)] text-right flex-shrink-0">
              <button onClick={() => setShowSettingsModal(false)} className="px-8 py-3 bg-[var(--accent-purple)] text-white font-bold rounded-xl text-xs uppercase tracking-widest">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ── Inline advance confirmation popover ── */}
      {pendingAdvanceConfirm && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            top: (pendingAdvanceConfirm.rect?.bottom ?? 0) + 6,
            left: (pendingAdvanceConfirm.rect?.left ?? 0) + (pendingAdvanceConfirm.rect?.width ?? 0) / 2,
            transform: 'translateX(-50%)',
            zIndex: 99999,
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px solid #BF8055',
            borderRadius: 14,
            padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(249,115,22,0.25)',
            minWidth: 200,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            animation: 'fadeIn .15s ease',
          }}>
            {/* Arrow up */}
            <div style={{
              position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)',
              width: 12, height: 12, background: 'var(--bg-card)',
              border: '1.5px solid #BF8055', borderBottom: 'none', borderRight: 'none',
              transform: 'translateX(-50%) rotate(45deg)',
            }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
              ⚠️ Аванс <span style={{ color: '#BF8055', fontWeight: 900 }}>{pendingAdvanceConfirm.num} ₸</span> — похоже на ошибку
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onMouseDown={e => {
                  e.stopPropagation();
                  updateAdvance(monthKey, pendingAdvanceConfirm.empId, pendingAdvanceConfirm.value);
                  clearFinEdit(pendingAdvanceConfirm.empId, 'advance');
                  setPendingAdvanceConfirm(null);
                }}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 9, border: 'none',
                  background: '#BF8055', color: '#fff',
                  fontSize: 11, fontWeight: 900, cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.05em'
                }}
              >
                Подтвердить
              </button>
              <button
                onMouseDown={e => {
                  e.stopPropagation();
                  clearFinEdit(pendingAdvanceConfirm.empId, 'advance');
                  setPendingAdvanceConfirm(null);
                }}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 9,
                  border: '1px solid var(--border)', background: 'var(--bg-hover)',
                  color: 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 900, cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.05em'
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SchedulePage;
