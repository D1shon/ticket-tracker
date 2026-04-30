import React, { useState } from 'react';
import { ShieldCheck, Clock, Coffee, Sun, Moon } from 'lucide-react';

const CLUBS = ['ВСЕ КЛУБЫ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORI', 'PRIME'];

const SHIFTS = [
  { id: 'morning', time: '6:30', name: 'Утренняя смена', icon: Coffee, color: 'text-orange-400', checks: 4, status: 'не начато' },
  { id: 'day', time: '11:30', name: 'Дневная смена', icon: Sun, color: 'text-yellow-400', checks: 5, status: 'не начато' },
  { id: 'evening', time: '16:30', name: 'Вечерняя смена', icon: Moon, color: 'text-indigo-400', checks: 4, status: 'не начато' },
];

const ChecklistPage = () => {
  const [activeClub, setActiveClub] = useState('4YOU');

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 font-sans">
      
      {/* Заголовок */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="text-purple-500" size={28} />
          <h1 className="text-2xl font-bold tracking-wide uppercase">Мониторинг клуба</h1>
        </div>
        <p className="text-gray-400 text-sm">
          Регулярные проверки по расписанию: 6:30 • 11:30 • 16:30
        </p>
      </div>

      {/* Выбор клуба */}
      <div className="mb-8">
        <h2 className="text-xs font-bold text-gray-500 tracking-widest uppercase mb-4">Клуб</h2>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {CLUBS.map(club => (
            <button
              key={club}
              onClick={() => setActiveClub(club)}
              className={`
                px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors
                ${activeClub === club 
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' 
                  : 'bg-[#1a1a1a] text-gray-400 border border-transparent hover:bg-[#222]'
                }
              `}
            >
              {club}
            </button>
          ))}
        </div>
      </div>

      {/* Статус смен */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="text-purple-500" size={16} />
          <h2 className="text-xs font-bold text-gray-500 tracking-widest uppercase">
            Статус смен: {activeClub}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SHIFTS.map(shift => (
            <div 
              key={shift.id} 
              className="bg-[#121212] border border-gray-800 rounded-2xl p-5 hover:border-gray-700 cursor-pointer transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl bg-[#1a1a1a] ${shift.color}`}>
                  <shift.icon size={20} />
                </div>
                <div>
                  <h3 className={`font-bold text-lg mb-1 ${shift.color}`}>
                    {shift.time} <span className="text-gray-300 text-base">{shift.name}</span>
                  </h3>
                  <p className="text-gray-500 text-sm">
                    {shift.checks} проверки · {shift.status}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default ChecklistPage;
