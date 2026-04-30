import React, { useState, useMemo } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isWeekend, 
  isSameDay,
  addMonths,
  subMonths
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  Download,
  Users,
  Clock
} from 'lucide-react';
import { useSchedule } from '../store/ScheduleContext';
import { useTickets } from '../store/TicketContext';

// Российские праздники на 2026 год (пример)
const HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
  '2026-02-23',
  '2026-03-08',
  '2026-05-01', '2026-05-09',
  '2026-06-12',
  '2026-11-04'
];

const SchedulePage = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const { scheduleData, updateCell } = useSchedule();
  
  // Пример списка сотрудников (в идеале тянуть из TicketContext или отдельной коллекции)
  const employees = [
    { id: 'emp1', name: 'Алексей Иванов', role: 'Менеджер' },
    { id: 'emp2', name: 'Мария Сидорова', role: 'Оператор' },
    { id: 'emp3', name: 'Дмитрий Петров', role: 'Техник' },
    { id: 'emp4', name: 'Елена Кузнецова', role: 'Оператор' },
  ];

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
      const [start, end] = timeRange.split('-').map(t => t.trim());
      
      const parseTime = (timeStr) => {
        let hours = 0, minutes = 0;
        if (timeStr.includes(':')) {
          [hours, minutes] = timeStr.split(':').map(Number);
        } else {
          hours = Number(timeStr);
        }
        return hours * 60 + (minutes || 0);
      };

      const startMin = parseTime(start);
      const endMin = parseTime(end);
      
      let diffMinutes = endMin - startMin;
      if (diffMinutes < 0) diffMinutes += 24 * 60; // Переход через полночь
      
      return parseFloat((diffMinutes / 60).toFixed(2));
    } catch (e) {
      return 0;
    }
  };

  const getCellData = (empId, day) => {
    const docId = `${monthKey}_${empId}`;
    return scheduleData[docId]?.days?.[day] || '';
  };

  const getEmployeeTotal = (empId) => {
    const docId = `${monthKey}_${empId}`;
    const days = scheduleData[docId]?.days || {};
    return Object.values(days).reduce((total, val) => total + calculateHours(val), 0);
  };

  const getDayTotal = (day) => {
    let total = 0;
    employees.forEach(emp => {
      total += calculateHours(getCellData(emp.id, day));
    });
    return total;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-foreground">График работы</h1>
          <p className="text-muted-foreground">Планирование смен и учет рабочего времени</p>
        </div>
        <div className="flex items-center gap-3 glass p-1.5 rounded-2xl">
          <button 
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-muted rounded-xl transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2 px-4 font-bold text-foreground min-w-[150px] justify-center">
            <CalendarIcon size={18} className="text-primary" />
            <span className="capitalize">{format(currentMonth, 'LLLL yyyy', { locale: ru })}</span>
          </div>
          <button 
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 hover:bg-muted rounded-xl transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden border border-border shadow-xl">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-muted/50 text-[10px] uppercase tracking-wider font-bold text-muted-foreground border-b border-border">
                <th className="px-4 py-4 sticky left-0 z-20 bg-[#121214] border-r border-border min-w-[200px]">
                  Сотрудник
                </th>
                {daysInMonth.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isHoliday = HOLIDAYS_2026.includes(dateStr);
                  const isSunSat = isWeekend(day);
                  
                  return (
                    <th 
                      key={dateStr} 
                      className={`px-1 py-3 text-center border-r border-border min-w-[45px]
                        ${isHoliday ? 'bg-red-500/10 text-red-400' : isSunSat ? 'bg-muted/30 text-muted-foreground' : ''}
                      `}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="opacity-60">{format(day, 'eeeee', { locale: ru })}</span>
                        <span className={`text-sm ${isHoliday ? 'font-black underline decoration-2' : ''}`}>
                          {format(day, 'd')}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th className="px-4 py-4 text-center bg-primary/5 text-primary sticky right-0 z-20 border-l border-border backdrop-blur-md">
                  Итого
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map(emp => (
                <tr key={emp.id} className="hover:bg-muted/10 transition-all group">
                  <td className="px-4 py-3 sticky left-0 z-20 bg-[#121214] border-r border-border group-hover:bg-muted/20 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground border border-border">
                        {emp.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">{emp.name}</p>
                        <p className="text-[10px] text-muted-foreground">{emp.role}</p>
                      </div>
                    </div>
                  </td>
                  {daysInMonth.map(day => {
                    const dayNum = format(day, 'd');
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const value = getCellData(emp.id, dayNum);
                    const isHoliday = HOLIDAYS_2026.includes(dateStr);
                    
                    return (
                      <td 
                        key={dateStr} 
                        className={`p-0 border-r border-border group-hover:bg-muted/5 transition-all
                          ${isHoliday ? 'bg-red-500/5' : ''}
                        `}
                      >
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => updateCell(monthKey, emp.id, dayNum, e.target.value)}
                          placeholder="—"
                          className="w-full h-full bg-transparent border-none text-[10px] text-center focus:ring-1 focus:ring-inset focus:ring-primary py-4 px-1 placeholder:text-muted-foreground/30 text-foreground"
                        />
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center font-black text-sm text-foreground bg-primary/5 sticky right-0 z-20 border-l border-border backdrop-blur-md">
                    {getEmployeeTotal(emp.id)}ч
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/20 font-bold text-[10px] uppercase text-muted-foreground tracking-widest">
                <td className="px-4 py-3 sticky left-0 z-20 bg-[#121214] border-r border-border">Всего за день</td>
                {daysInMonth.map(day => (
                  <td key={format(day, 'd')} className="px-1 py-3 text-center border-r border-border text-primary/80">
                    {getDayTotal(format(day, 'd'))}ч
                  </td>
                ))}
                <td className="px-4 py-3 text-center bg-primary/10 text-primary sticky right-0 z-20 border-l border-border backdrop-blur-md">
                  {employees.reduce((acc, emp) => acc + getEmployeeTotal(emp.id), 0)}ч
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Всего часов в месяце</p>
            <p className="text-2xl font-bold text-foreground">
              {employees.reduce((acc, emp) => acc + getEmployeeTotal(emp.id), 0)} ч.
            </p>
          </div>
        </div>
        <div className="glass p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
            <Users size={24} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Активных сотрудников</p>
            <p className="text-2xl font-bold text-foreground">{employees.length}</p>
          </div>
        </div>
        <div className="glass p-6 rounded-2xl flex items-center gap-4 cursor-pointer hover:bg-muted/20 transition-all">
          <div className="p-3 rounded-xl bg-green-500/10 text-green-500">
            <Download size={24} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Экспорт графика</p>
            <p className="text-2xl font-bold text-foreground">Excel / PDF</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchedulePage;
