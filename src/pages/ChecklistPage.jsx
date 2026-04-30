import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Clock, ChevronDown, Calendar, MoreHorizontal } from 'lucide-react';
import { CLUBS, SHIFTS_DATA, CHECK_ITEMS } from '../data/checklistData';

const ChecklistPage = () => {
  const [activeClub, setActiveClub] = useState('4YOU');
  const [activeDay, setActiveDay] = useState('СЕГОДНЯ');
  const navigate = useNavigate();

  const getCheckProgress = (shiftId, cardId) => {
    const saved = localStorage.getItem(`checklist-states-${shiftId}-${cardId}`);
    if (!saved) return { answered: 0, total: CHECK_ITEMS[cardId].items.length };
    const states = JSON.parse(saved);
    const items = CHECK_ITEMS[cardId].items;
    const answered = items.filter((_, i) => states[i] === 'ok' || states[i] === 'issue').length;
    return { answered, total: items.length };
  };

  const isCheckComplete = (shiftId, cardId) => {
    const { answered, total } = getCheckProgress(shiftId, cardId);
    return answered === total && total > 0;
  };

  return (
    <div className="animate-fade" style={{ background: '#070708', minHeight: '100%', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header Area */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck style={{ color: '#a855f7' }} size={24} strokeWidth={2.5} />
            <h1 className="text-xl font-bold tracking-tight uppercase" style={{ letterSpacing: '0.02em' }}>Мониторинг клуба</h1>
          </div>
          <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Регулярные проверки по расписанию: 6:30 - 11:30 - 16:30 - 21:30
          </p>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Клуб</span>
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#111113] border border-white/5">
            {CLUBS.map(club => (
              <button
                key={club}
                onClick={() => setActiveClub(club)}
                className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  activeClub === club 
                    ? 'bg-[#222226] text-blue-400 border border-blue-500/20' 
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {club}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 items-end">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Дата смен</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#111113] border border-white/5">
              {['ВЧЕРА', 'СЕГОДНЯ'].map(day => (
                <button
                  key={day}
                  onClick={() => setActiveDay(day)}
                  className={`px-5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    activeDay === day 
                      ? 'bg-[#7B3DFF] text-white' 
                      : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111113] border border-white/5 text-[11px] font-bold text-white/70">
              <Calendar size={14} className="text-purple-500" />
              30.04.2026
            </div>
          </div>
        </div>
      </div>

      {/* Status Label */}
      <div className="flex items-center gap-2 mb-6 text-[10px] font-bold tracking-widest text-white/40 uppercase">
        <Clock size={12} className="text-purple-500" />
        Статус смен: {activeClub}
      </div>

      {/* Shifts List */}
      <div className="flex flex-col gap-6">
        {SHIFTS_DATA.map(shift => (
          <div 
            key={shift.id} 
            className={`relative rounded-2xl transition-all ${
              shift.isCurrent ? 'bg-[#0a0a0c]' : 'bg-transparent'
            }`}
            style={{ 
              border: shift.isCurrent ? '1px solid rgba(123,61,255,0.3)' : '1px solid transparent',
              boxShadow: shift.isCurrent ? '0 10px 40px rgba(0,0,0,0.4)' : 'none'
            }}
          >
            {/* Shift Header */}
            <div className="flex items-center justify-between p-5 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#111113] border border-white/5 shadow-inner">
                  <shift.icon size={18} style={{ color: shift.color }} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <span style={{ color: shift.color }}>{shift.time}</span>
                      <span className="text-white/90">{shift.name}</span>
                    </h3>
                    {shift.isCurrent && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[9px] font-black uppercase tracking-tighter border border-blue-500/20">сейчас</span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/30 font-medium mt-0.5">{shift.cards.length} проверки · {shift.isCurrent ? 'в процессе' : 'ожидание'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-white/20 hover:text-white/40 transition-colors">
                  <MoreHorizontal size={18} />
                </button>
                <button className="text-white/20 hover:text-white/40 transition-colors">
                  <ChevronDown size={18} />
                </button>
              </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5 pt-0">
              {shift.cards.map(cardId => {
                const card = CHECK_ITEMS[cardId];
                const { answered, total } = getCheckProgress(shift.id, cardId);
                const complete = answered === total;
                const percent = (answered / total) * 100;
                
                return (
                  <div 
                    key={cardId}
                    onClick={() => navigate(`/checklists/${shift.id}/${cardId}`)}
                    className={`group bg-[#111113] border rounded-2xl p-6 flex flex-col items-center justify-center gap-4 hover:bg-[#151518] transition-all cursor-pointer shadow-sm ${
                      complete ? 'border-green-500/30' : 'border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform shadow-lg ${
                      complete ? 'bg-green-500/10 text-green-500' : 'bg-[#1a1a1d]'
                    }`}>
                      {complete ? <ShieldCheck size={20} /> : <card.icon size={20} strokeWidth={2} />}
                    </div>
                    <div className="text-center w-full">
                      <h4 className="text-xs font-bold text-white/90 mb-1 group-hover:text-white transition-colors">{card.title}</h4>
                      <div className="flex flex-col items-center gap-2">
                        <p className={`text-[10px] font-semibold uppercase tracking-wider ${complete ? 'text-green-500/60' : 'text-white/30'}`}>
                          {complete ? 'Выполнено' : `${answered} из ${total} выполнено`}
                        </p>
                        {/* Small Progress Bar */}
                        <div className="w-20 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${complete ? 'bg-green-500' : 'bg-[#7B3DFF]'}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

export default ChecklistPage;
