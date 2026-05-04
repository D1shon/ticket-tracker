import React, { useState, useMemo } from 'react';
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
  const { 
    scheduleData, 
    employees, 
    updateCell, 
    addEmployee, 
    removeEmployee, 
    updateEmployee,
    updateAdvance 
  } = useSchedule();
  
  const [newEmpName, setNewEmpName] = useState('');
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth)
    });
  }, [currentMonth]);

  const monthKey = format(currentMonth, 'yyyy-MM');

  const calculateHours = (timeRange) => {
    if (!timeRange || typeof timeRange !== 'string' || !timeRange.includes('-')) return 0;
    try {
      const parts = timeRange.split('-');
      if (parts.length !== 2) return 0;
      
      const parseTime = (timeStr) => {
        const clean = timeStr.trim().replace('.', ':');
        let [h, m] = clean.split(':').map(Number);
        if (isNaN(m)) m = 0;
        return h * 60 + m;
      };

      const startMin = parseTime(parts[0]);
      const endMin = parseTime(parts[1]);
      
      let diffMinutes = endMin - startMin;
      if (diffMinutes < 0) diffMinutes += 24 * 60; 
      
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

  const handleAdd = async () => {
    if (newEmpName.trim() && !isSaving) {
      setIsSaving(true);
      try {
        await addEmployee(newEmpName.trim());
        setNewEmpName('');
        // Refocus input so user can immediately add the next employee
        setTimeout(() => {
          document.getElementById('new-emp-input')?.focus();
        }, 100);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const startEditing = (emp) => {
    setEditingEmpId(emp.id);
    setEditNameValue(emp.name);
  };

  const saveEditing = (id) => {
    updateEmployee(id, editNameValue);
    setEditingEmpId(null);
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
                <th className="px-6 py-5 sticky left-0 z-30 bg-[#151518] border-r border-white/5 min-w-[280px]">Сотрудник</th>
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
                    <td className="px-6 py-4 sticky left-0 z-20 bg-[#0f0f11] border-r border-white/5 group-hover:bg-[#151518] transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/20 group-hover:text-purple-400 transition-colors">
                          <Users size={14} />
                        </div>
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input 
                              autoFocus
                              className="bg-white/10 border border-purple-500/30 rounded-lg px-2 py-1.5 text-sm font-bold text-white outline-none w-full"
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveEditing(emp.id)}
                            />
                            <button onClick={() => saveEditing(emp.id)} className="w-8 h-8 rounded-lg bg-green-500/20 text-green-500 flex items-center justify-center hover:bg-green-500/30 transition-all">
                              <Check size={14}/>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between flex-1">
                            <span className="text-sm font-bold text-white/90 group-hover:text-white transition-colors">{emp.name}</span>
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
                            type="text"
                            value={value}
                            onChange={(e) => updateCell(monthKey, emp.id, dayNum, e.target.value)}
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
              
              {/* Add Employee Row */}
              <tr className="group/add cursor-pointer">
                <td 
                  colSpan={daysInMonth.length + 5} 
                  className="px-6 py-5 sticky left-0 z-20 bg-[#0f0f11] border-t border-white/5"
                >
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleAdd}
                      title="Добавить сотрудника"
                      className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center hover:bg-purple-500/40 active:scale-95 transition-all shadow-lg shadow-purple-500/10"
                    >
                      <Plus size={16} strokeWidth={3} />
                    </button>
                    <div className="flex-1 relative">
                      <input 
                        id="new-emp-input"
                        type="text"
                        value={newEmpName}
                        disabled={isSaving}
                        onChange={(e) => setNewEmpName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        placeholder={isSaving ? "Сохранение..." : "Введите ФИО нового сотрудника..."}
                        className={`bg-transparent border-none text-sm font-bold placeholder:text-white/20 outline-none w-full transition-all ${
                          isSaving ? 'text-white/20' : 'text-white/90 group-hover/add:text-white focus:text-white'
                        }`}
                      />
                      {newEmpName && !isSaving && (
                        <button 
                          onClick={handleAdd}
                          className="absolute right-0 top-1/2 -translate-y-1/2 px-5 py-1.5 rounded-lg bg-purple-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-purple-500/20 hover:bg-purple-600 active:scale-95 transition-all"
                        >
                          Добавить
                        </button>
                      )}
                    </div>
                  </div>
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
