import React, { useState, useMemo, useEffect } from 'react';
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
  Edit2,
  Check,
  Plus
} from 'lucide-react';
import { useSchedule } from '../store/ScheduleContext';

const HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
  '2026-02-23', '2026-03-08', '2026-03-21', '2026-03-22', '2026-03-23', '2026-05-01', '2026-05-07', '2026-05-09', 
  '2026-07-06', '2026-08-30', '2026-10-25', '2026-12-16', '2026-12-17'
];

const HOURLY_RATE = 1500;

const SchedulePage = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const prevMonth = () => setCurrentMonth(prev => addMonths(prev, -1));
  const nextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const resetToToday = () => setCurrentMonth(new Date());

  const { 
    scheduleData, 
    employees, 
    updateCell, 
    addEmployee, 
    removeEmployee, 
    updateEmployee,
    updateAdvance 
  } = useSchedule();
  
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [copiedValue, setCopiedValue] = useState(null);
  
  // pendingRows: local array of empty input slots, '+' adds one more instantly
  const [pendingRows, setPendingRows] = useState(() => {
    const saved = localStorage.getItem('schedule-pending-rows');
    return saved ? JSON.parse(saved) : ['', '', '', ''];
  });

  useEffect(() => {
    localStorage.setItem('schedule-pending-rows', JSON.stringify(pendingRows));
  }, [pendingRows]);

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth)
    });
  }, [currentMonth]);

  const monthKey = format(currentMonth, 'yyyy-MM');

  const calculateHours = (timeRange) => {
    if (!timeRange || typeof timeRange !== 'string') return 0;
    const cleanRange = timeRange.trim();
    if (!cleanRange.includes('-')) return 0;
    
    try {
      const parts = cleanRange.split('-');
      if (parts.length !== 2) return 0;
      
      const parseTime = (timeStr) => {
        let clean = timeStr.trim().replace('.', ':');
        if (!clean.includes(':')) {
          // Handle "8" as "8:00"
          const h = parseInt(clean);
          return isNaN(h) ? 0 : h * 60;
        }
        let [h, m] = clean.split(':').map(Number);
        if (isNaN(h)) h = 0;
        if (isNaN(m)) m = 0;
        return h * 60 + m;
      };

      const startMin = parseTime(parts[0]);
      const endMin = parseTime(parts[1]);
      
      let diffMinutes = endMin - startMin;
      if (diffMinutes < 0) diffMinutes += 24 * 60; // Over midnight
      
      return parseFloat((diffMinutes / 60).toFixed(2));
    } catch (e) {
      return 0;
    }
  };

  const getCellData = (empId, day) => {
    const docId = `${monthKey}_${empId}`;
    return scheduleData[docId]?.days?.[day] || '';
  };

  const getAdvance = (empId) => {
    const docId = `${monthKey}_${empId}`;
    return scheduleData[docId]?.advance || 0;
  };

  const getEmployeeStats = (empId) => {
    const docId = `${monthKey}_${empId}`;
    const days = scheduleData[docId]?.days || {};
    const totalHours = Object.values(days).reduce((total, val) => total + calculateHours(val), 0);
    const salary = totalHours * HOURLY_RATE;
    const advance = getAdvance(empId);
    const toPay = salary - advance;
    return { totalHours, salary, advance, toPay };
  };

  // Add a new empty pending row instantly (no Firebase yet)
  const addPendingRow = () => {
    setPendingRows(prev => [...prev, '']);
    // Autofocus the last row after render
    setTimeout(() => {
      const inputs = document.querySelectorAll('.pending-row-input');
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    }, 50);
  };

  const changePendingRow = (index, value) => {
    setPendingRows(prev => prev.map((v, i) => i === index ? value : v));
  };

  const savePendingRow = async (index, shouldFocusNext = false) => {
    const name = pendingRows[index]?.trim();
    if (!name) return;
    try {
      await addEmployee(name);
      setPendingRows(prev => prev.filter((_, i) => i !== index));
      
      if (shouldFocusNext) {
        setTimeout(() => {
          const inputs = document.querySelectorAll('.pending-row-input');
          if (inputs.length > 0) {
            // Focus the next one (it might be at the same index now because one was removed)
            const nextInput = inputs[index] || inputs[inputs.length - 1];
            nextInput?.focus();
          }
        }, 100);
      }
    } catch (e) {}
  };

  const removePendingRow = (index) => {
    setPendingRows(prev => prev.filter((_, i) => i !== index));
  };

  const startEditing = (emp) => {
    setEditingEmpId(emp.id);
    setEditNameValue(emp.name);
  };

  const saveEditing = (id) => {
    updateEmployee(id, editNameValue);
    setEditingEmpId(null);
  };

  const handleCellKeyDown = (e, empId, dayNum, value) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

    // Excel Navigation
    if (e.key === 'ArrowRight' || e.key === 'Tab') {
      const next = document.getElementById(`cell-${empId}-${parseInt(dayNum) + 1}`);
      if (next) { e.preventDefault(); next.focus(); }
    }
    if (e.key === 'ArrowLeft') {
      const prev = document.getElementById(`cell-${empId}-${parseInt(dayNum) - 1}`);
      if (prev) { e.preventDefault(); prev.focus(); }
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      const inputs = Array.from(document.querySelectorAll(`[id^="cell-"][id$="-${dayNum}"]`));
      const idx = inputs.findIndex(i => i.id === `cell-${empId}-${dayNum}`);
      if (inputs[idx + 1]) { e.preventDefault(); inputs[idx + 1].focus(); }
    }
    if (e.key === 'ArrowUp') {
      const inputs = Array.from(document.querySelectorAll(`[id^="cell-"][id$="-${dayNum}"]`));
      const idx = inputs.findIndex(i => i.id === `cell-${empId}-${dayNum}`);
      if (inputs[idx - 1]) { e.preventDefault(); inputs[idx - 1].focus(); }
    }

    // Copy/Paste
    if (ctrlKey && e.key === 'c') {
      setCopiedValue(value);
      toast.info('Скопировано');
    }
    if (ctrlKey && e.key === 'v') {
      if (copiedValue !== null) {
        updateCell(monthKey, empId, dayNum, copiedValue);
      }
    }
  };

  return (
    <div className="space-y-6 animate-fade">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-white uppercase tracking-tight">График и Расчеты</h1>
          <p className="text-xs text-white/40 font-medium italic">Ставка: {HOURLY_RATE} ₸/час · Праздники выделены красным</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#111113] p-1 rounded-xl border border-white/5">
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-3 font-bold text-[11px] text-white uppercase tracking-wider min-w-[120px] text-center">
              {format(currentMonth, 'LLLL yyyy', { locale: ru })}
            </div>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#0f0f11] rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1900px]">
            <thead>
              <tr className="bg-[#151518] text-[9px] uppercase tracking-widest font-black text-white/30 border-b border-white/5">
                <th className="px-6 py-5 sticky left-0 z-30 bg-[#151518] border-r border-white/10 min-w-[280px] shadow-[10px_0_15px_-10px_rgba(0,0,0,0.5)]">Сотрудник</th>
                {daysInMonth.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isHoliday = HOLIDAYS_2026.includes(dateStr);
                  const isSunSat = isWeekend(day);
                  return (
                    <th key={dateStr} className={`px-1 py-4 text-center border-r border-white/5 min-w-[48px] ${isHoliday ? 'bg-red-500/20 text-red-500' : isSunSat ? 'bg-white/5' : ''}`}>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="opacity-50">{format(day, 'eeeee', { locale: ru })}</span>
                        <span className={`text-xs ${isHoliday ? 'font-black' : ''}`}>{format(day, 'd')}</span>
                      </div>
                    </th>
                  );
                })}
                <th className="px-4 py-5 text-center bg-purple-500/5 text-purple-400 border-x border-white/5 min-w-[90px]">Всего ч.</th>
                <th className="px-4 py-5 text-center bg-blue-500/5 text-blue-400 border-r border-white/5 min-w-[110px]">Зарплата</th>
                <th className="px-4 py-5 text-center bg-orange-500/5 text-orange-400 border-r border-white/5 min-w-[110px]">Аванс</th>
                <th className="px-4 py-5 text-center bg-green-500/10 text-green-400 sticky right-0 z-30 bg-[#151518] border-l border-white/5 min-w-[130px]">К выдаче</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {employees.map(emp => {
                const stats = getEmployeeStats(emp.id);
                const isEditing = editingEmpId === emp.id;
                return (
                  <tr key={emp.id} className="hover:bg-white/[0.04] transition-all group">
                    <td className="px-6 py-4 sticky left-0 z-20 bg-[#0f0f11] border-r border-white/10 group-hover:bg-[#151518] transition-all shadow-[10px_0_15px_-10px_rgba(0,0,0,0.5)]">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/20 group-hover:text-purple-400 transition-colors">
                          <Users size={14} />
                        </div>
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input 
                              autoFocus
                              autoComplete="off"
                              className="bg-white/10 border border-purple-500/30 rounded-lg px-2 py-1.5 text-sm font-bold text-white outline-none w-full"
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  saveEditing(emp.id);
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-between flex-1">
                            <span className="text-sm font-bold text-white/90 group-hover:text-white transition-colors whitespace-nowrap">{emp.name}</span>
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => startEditing(emp)} 
                                className="p-2 rounded-lg hover:bg-white/5 text-white/10 hover:text-blue-400 transition-all"
                              >
                                <Edit2 size={13}/>
                              </button>
                              <button 
                                onClick={() => removeEmployee(emp.id)} 
                                className="p-2 rounded-lg hover:bg-white/5 text-white/10 hover:text-red-500 transition-all"
                              >
                                <Trash2 size={13}/>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    {daysInMonth.map(day => {
                      const dayNum = format(day, 'd');
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const value = getCellData(emp.id, dayNum);
                      const isHoliday = HOLIDAYS_2026.includes(dateStr);
                      return (
                        <td key={dateStr} className={`p-0 border-r border-white/5 ${isHoliday ? 'bg-red-500/5' : ''}`}>
                          <input
                            id={`cell-${emp.id}-${dayNum}`}
                            type="text"
                            value={value}
                            onChange={(e) => updateCell(monthKey, emp.id, dayNum, e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, emp.id, dayNum, value)}
                            placeholder="—"
                            className={`w-full h-full bg-transparent border-none text-[10px] text-center focus:bg-white/10 py-4 px-1 outline-none transition-all ${value ? 'text-white font-bold' : 'text-white/5'}`}
                          />
                        </td>
                      );
                    })}
                    <td className="px-4 py-4 text-center font-bold text-xs text-purple-400/80 bg-purple-500/5">{stats.totalHours} ч</td>
                    <td className="px-4 py-4 text-center font-bold text-xs text-blue-400 bg-blue-500/5">{stats.salary.toLocaleString()}</td>
                    <td className="px-2 py-0 border-r border-white/5 bg-orange-500/5">
                      <input 
                        type="number"
                        value={stats.advance || ''}
                        onChange={(e) => updateAdvance(monthKey, emp.id, e.target.value)}
                        placeholder="0"
                        className="w-full h-full bg-transparent border-none text-center text-xs font-bold text-orange-400 outline-none"
                      />
                    </td>
                    <td className="px-4 py-4 text-center font-black text-sm text-green-400 sticky right-0 z-20 bg-[#0f0f11] group-hover:bg-[#151518] border-l border-white/5 shadow-[-10px_0_20px_rgba(0,0,0,0.2)]">
                      {stats.toPay.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              
              {pendingRows.map((val, i) => (
                <tr key={`pending-${i}`} className="group/pending hover:bg-white/[0.02] transition-all">
                  <td className="px-6 py-4 sticky left-0 z-20 bg-[#0f0f11] border-r border-white/10 group-hover/pending:bg-[#151518] transition-all shadow-[10px_0_15px_-10px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center text-white/10 flex-shrink-0">
                        <Users size={14} />
                      </div>
                      <div className="flex-1 relative">
                        <input
                          id={`pending-input-${i}`}
                          type="text"
                          value={val}
                          onChange={(e) => changePendingRow(i, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              savePendingRow(i, true);
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              removePendingRow(i);
                            }
                          }}
                          onBlur={() => savePendingRow(i)}
                          placeholder="Введите ФИО сотрудника..."
                          autoComplete="off"
                          className="pending-row-input bg-transparent border-none text-sm font-bold text-white/60 placeholder:text-white/10 outline-none w-full focus:text-white transition-all"
                        />
                      </div>
                      {/* Action buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            document.getElementById(`pending-input-${i}`)?.focus();
                          }}
                          title="Редактировать имя"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/10 hover:text-blue-400 hover:bg-white/5 transition-all"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => removePendingRow(i)}
                          title="Удалить строку"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/10 hover:text-red-500 hover:bg-white/5 transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </td>
                  {daysInMonth.map(day => (
                    <td key={day.toString()} className="border-r border-white/[0.05]"></td>
                  ))}
                  <td className="bg-purple-500/[0.02]"></td>
                  <td className="bg-blue-500/[0.02]"></td>
                  <td className="bg-orange-500/[0.02]"></td>
                  <td className="sticky right-0 z-20 bg-[#0f0f11] group-hover/pending:bg-[#151518] border-l border-white/5 transition-all"></td>
                </tr>
              ))}

              {/* Bottom row: + instantly adds a new pending row */}
              <tr>
                <td
                  colSpan={daysInMonth.length + 5}
                  className="px-6 py-4 bg-[#111113] border-t border-white/5"
                >
                  <button
                    onClick={addPendingRow}
                    className="flex items-center gap-3 text-white/20 hover:text-purple-400 transition-all group/btn"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 group-hover/btn:bg-purple-500/25 text-purple-400 flex items-center justify-center transition-all active:scale-95">
                      <Plus size={16} strokeWidth={3} />
                    </div>
                    <span className="text-sm font-bold">Добавить сотрудника</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#111113] p-6 rounded-3xl border border-white/5 flex flex-col gap-1 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Всего отработано</p>
          <p className="text-2xl font-black text-white">
            {employees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).totalHours, 0).toFixed(1)} <span className="text-xs text-white/30">часов</span>
          </p>
        </div>
        <div className="bg-[#111113] p-6 rounded-3xl border border-white/5 flex flex-col gap-1 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Начислено всего</p>
          <p className="text-2xl font-black text-blue-400">
            {employees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).salary, 0).toLocaleString()} <span className="text-xs opacity-50">₸</span>
          </p>
        </div>
        <div className="bg-[#111113] p-6 rounded-3xl border border-white/5 flex flex-col gap-1 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Общий аванс</p>
          <p className="text-2xl font-black text-orange-400">
            {employees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).advance, 0).toLocaleString()} <span className="text-xs opacity-50">₸</span>
          </p>
        </div>
        <div className="bg-[#111113] p-6 rounded-3xl border border-white/5 flex flex-col gap-1 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Остаток к выдаче</p>
          <p className="text-2xl font-black text-green-400">
            {employees.reduce((acc, emp) => acc + getEmployeeStats(emp.id).toPay, 0).toLocaleString()} <span className="text-xs opacity-50">₸</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SchedulePage;
