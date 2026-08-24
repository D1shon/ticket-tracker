import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, Clock, ChevronDown, Calendar, MoreHorizontal } from 'lucide-react';
import { CLUBS, SHIFTS_DATA, CHECK_ITEMS, getShiftsForDate } from '../data/checklistData';
import { format, addDays, subDays, startOfToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useChecklist } from '../store/ChecklistContext';
import { useTickets } from '../store/TicketContext';
import DailyOpsReport from '../components/checklists/DailyOpsReport';
import { isMobileDevice } from '../lib/isMobile';

const getFormattedTime = (updatedAt) => {
  if (!updatedAt) return '';
  let date;
  if (typeof updatedAt.toDate === 'function') {
    date = updatedAt.toDate();
  } else if (updatedAt.seconds) {
    date = new Date(updatedAt.seconds * 1000);
  } else {
    date = new Date(updatedAt);
  }
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const ChecklistPage = () => {
  const context = useTickets();
  const user = context?.user;
  const userClub = user?.club?.toUpperCase();
  const isManager = user?.role === 'manager';
  // Менеджер и админ заперты на свой клуб (у Europe City чек-листы доступны админам)
  const isClubLocked = (isManager || user?.role === 'admin') && !!userClub;

  // Мобильный режим — компактные карточки в 2 колонки, вкладки на всю ширину
  // (хук вызывается ДО раннего return ниже, чтобы порядок хуков не менялся)
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Defensive check to prevent white screen if context is glitchy
  if (!context || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  // Strictly filter clubs for managers, and exclude 'ВСЕ КЛУБЫ' for checklists
  const availableClubs = isClubLocked ? [userClub] : CLUBS.filter(c => c !== 'ВСЕ КЛУБЫ');

  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial date/club from URL query parameters
  const initialDateStr = searchParams.get('date');
  const initialClub = searchParams.get('club') || userClub || '4YOU';

  const getInitialDate = () => {
    if (initialDateStr) {
      const [year, month, day] = initialDateStr.split('-').map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month - 1, day);
      }
    }
    return startOfToday();
  };

  const [activeClub, setActiveClub] = useState(initialClub);
  const [activeDate, setActiveDate] = useState(getInitialDate);
  // ?view=report (кнопка «+» в мобильной навигации) → сразу вкладка «Отчёт дня»
  const [view, setView] = useState(() => searchParams.get('view') === 'report' ? 'report' : 'shifts'); // 'shifts' | 'report'
  const { checklistData } = useChecklist();
  const navigate = useNavigate();

  // Sync state changes back to searchParams
  useEffect(() => {
    const newParams = {};
    if (activeClub) newParams.club = activeClub;
    newParams.date = format(activeDate, 'yyyy-MM-dd');
    setSearchParams(newParams, { replace: true });
  }, [activeClub, activeDate, setSearchParams]);

  // Force active club and prevent seeing others
  useEffect(() => {
    if (isClubLocked) {
      setActiveClub(userClub);
    }
  }, [userClub, isClubLocked]);

  const dateKey = format(activeDate, 'yyyy-MM-dd');

  const getCheckProgress = (shiftId, cardId) => {
    const docId = `${dateKey}_${activeClub}_${shiftId}_${cardId}`;
    const data = checklistData[docId];
    const card = CHECK_ITEMS[cardId];
    const clubExtra = card?.clubItems?.[activeClub] ?? card?.clubItems?.['_default'] ?? [];
    const allItems = [...(card?.items ?? []), ...clubExtra];
    const total = allItems.filter(it => !it.startsWith('§')).length;
    if (!data || !data.states) return { answered: 0, total };
    // Use original (unfiltered) indices — same as how ChecklistDetail saves states
    const answered = allItems.filter((item, i) =>
      !item.startsWith('§') && (data.states[i] === 'ok' || data.states[i] === 'issue')
    ).length;
    return { answered, total };
  };

  const isCheckComplete = (shiftId, cardId) => {
    const { answered, total } = getCheckProgress(shiftId, cardId);
    return answered === total && total > 0;
  };


  return (
    <div className="animate-fade" style={{ background: 'var(--bg-primary)', minHeight: '100%', color: 'var(--text-primary)', fontFamily: 'var(--font-primary)' }}>
      
      {/* Header Area */}
      <div className="flex items-start justify-between mb-8 gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck style={{ color: '#8E7BB8' }} size={24} strokeWidth={2.5} />
            <h1 className="text-xl font-bold tracking-tight uppercase" style={{ letterSpacing: '0.02em' }}>Мониторинг клуба</h1>
          </div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Регулярные проверки по расписанию: {getShiftsForDate(activeDate).map(s => s.time).join(' - ')}
          </p>
        </div>
      </div>

      {/* Вкладки: проверки смен / единый отчёт дня. На мобильном — на всю ширину */}
      <div className={`flex gap-1.5 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] mb-6 ${isMobile ? 'w-full' : 'w-fit'}`}>
        <button
          onClick={() => setView('shifts')}
          style={isMobile ? { flex: 1, minHeight: 40 } : undefined}
          className={`px-5 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${view === 'shifts' ? 'bg-[var(--accent-purple)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
        >
          Проверки смен
        </button>
        <button
          onClick={() => setView('report')}
          style={isMobile ? { flex: 1, minHeight: 40 } : undefined}
          className={`px-5 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${view === 'report' ? 'bg-[var(--accent-purple)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
        >
          📝 Отчёт дня
        </button>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        {!isClubLocked && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Клуб</span>
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] overflow-x-auto max-w-full no-scrollbar flex-nowrap">
              {availableClubs.map(club => (
                <button
                  key={club}
                  onClick={() => setActiveClub(club)}
                  className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all flex-shrink-0 ${
                    activeClub === club 
                      ? 'bg-[var(--bg-hover)] text-[var(--accent-blue)] border border-[var(--accent-blue)]/20' 
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {club}
                </button>
              ))}
            </div>
          </div>
        )}

        {view === 'shifts' && (
        <div className="flex flex-col gap-2 items-start md:items-end">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Дата смен</span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
              <button
                onClick={() => setActiveDate(prev => subDays(prev, 1))}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white/40 hover:text-white transition-all hover:bg-white/5"
              >
                ←
              </button>
              <button
                onClick={() => setActiveDate(startOfToday())}
                className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  dateKey === format(startOfToday(), 'yyyy-MM-dd') 
                    ? 'bg-[var(--accent-purple)] text-white' 
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                СЕГОДНЯ
              </button>
              <button
                onClick={() => setActiveDate(prev => addDays(prev, 1))}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all hover:bg-[var(--bg-hover)]"
              >
                →
              </button>
            </div>
            <div className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent-purple)]/50 text-[11px] font-bold text-[var(--text-secondary)] transition-all cursor-pointer">
              <Calendar size={14} className="text-[var(--accent-purple)]" />
              <span>{format(activeDate, 'dd.MM.yyyy')}</span>
              <input 
                type="date"
                value={format(activeDate, 'yyyy-MM-dd')}
                onChange={(e) => {
                  if (e.target.value) {
                    const [year, month, day] = e.target.value.split('-').map(Number);
                    setActiveDate(new Date(year, month - 1, day));
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>
          </div>
        </div>
        )}
      </div>

      {view === 'report' ? (
        <DailyOpsReport club={activeClub} />
      ) : (
      <>
      {/* Status Label */}
      <div className="flex items-center gap-2 mb-6 text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
        <Clock size={12} className="text-[var(--accent-purple)]" />
        Статус смен: {activeClub}
      </div>

      {/* Shifts List — на мобильном плотнее */}
      <div className={`flex flex-col ${isMobile ? 'gap-3' : 'gap-6'}`}>
        {getShiftsForDate(activeDate).map(shift => (
          <div 
            key={shift.id} 
            className={`relative rounded-2xl transition-all ${
              shift.isCurrent ? 'bg-[var(--bg-card)]' : 'bg-transparent'
            }`}
            style={{ 
              border: shift.isCurrent ? '1px solid rgba(125,111,179,0.3)' : '1px solid transparent',
              boxShadow: shift.isCurrent ? '0 10px 40px rgba(0,0,0,0.4)' : 'none'
            }}
          >
            {/* Shift Header — на мобильном плотнее (меньше паддинги/иконка) */}
            <div className={`flex items-center justify-between ${isMobile ? 'p-3 pb-2' : 'p-5 pb-4'}`}>
              <div className={`flex items-center ${isMobile ? 'gap-2.5' : 'gap-4'}`}>
                <div className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl flex items-center justify-center bg-[var(--bg-hover)] border border-[var(--border)] shadow-inner flex-shrink-0`}>
                  <shift.icon size={isMobile ? 15 : 18} style={{ color: shift.color }} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className={`${isMobile ? 'text-sm' : 'text-base'} font-bold flex items-center gap-2`}>
                      <span style={{ color: shift.color }}>{shift.time}</span>
                      <span className="text-[var(--text-primary)]">{shift.name}</span>
                    </h3>
                    {shift.isCurrent && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[9px] font-black uppercase tracking-tighter border border-blue-500/20">сейчас</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] font-medium mt-0.5">{shift.cards.length} проверки · {shift.isCurrent ? 'в процессе' : 'ожидание'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                  <MoreHorizontal size={18} />
                </button>
                <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                  <ChevronDown size={18} />
                </button>
              </div>
            </div>

            {/* Cards Grid — на мобильном 2 колонки компактно */}
            <div className={isMobile ? 'grid grid-cols-2 gap-2 p-3 pt-0' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5 pt-0'}>
              {shift.cards.map(cardId => {
                const card = CHECK_ITEMS[cardId];
                const docId = `${dateKey}_${activeClub}_${shift.id}_${cardId}`;
                const checkDoc = checklistData[docId];
                const { answered, total } = getCheckProgress(shift.id, cardId);
                const complete = answered === total;
                const percent = (answered / total) * 100;
                
                // Get checked-by info dynamically
                const checkedBy = checkDoc?.updatedBy ? checkDoc.updatedBy.split('@')[0] : null;
                const checkedTime = checkDoc?.updatedAt ? getFormattedTime(checkDoc.updatedAt) : null;
                
                return (
                  <div 
                    key={cardId}
                    onClick={() => navigate(`/checklists/${shift.id}/${cardId}?date=${dateKey}&club=${activeClub}`)}
                    className={`group bg-[var(--bg-card)] border rounded-2xl ${isMobile ? 'p-3 gap-2' : 'p-6 gap-4'} flex flex-col items-center justify-center hover:bg-[var(--bg-hover)] transition-all cursor-pointer shadow-sm ${
                      complete ? 'border-green-500/30' : 'border-[var(--border)] hover:border-[var(--accent-purple)]/30'
                    }`}
                  >
                    <div className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-full flex items-center justify-center text-[var(--accent-purple)] group-hover:scale-110 transition-transform shadow-lg ${
                      complete ? 'bg-green-500/10 text-green-500' : 'bg-[var(--bg-hover)]'
                    }`}>
                      {complete ? <ShieldCheck size={isMobile ? 16 : 20} /> : <card.icon size={isMobile ? 16 : 20} strokeWidth={2} />}
                    </div>
                    <div className="text-center w-full">
                      <h4 className="text-xs font-bold text-[var(--text-primary)] mb-1 group-hover:text-[var(--accent-purple)] transition-colors">{card.title}</h4>
                      <div className="flex flex-col items-center gap-2">
                        <p className={`text-[10px] font-semibold uppercase tracking-wider ${complete ? 'text-green-500/60' : 'text-[var(--text-muted)]'}`}>
                          {complete ? 'Выполнено' : `${answered} из ${total} выполнено`}
                        </p>
                        {/* Small Progress Bar */}
                        <div className="w-20 h-1 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${complete ? 'bg-green-500' : 'bg-[var(--accent-purple)]'}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        {/* Status update stamp verifying who checked and when */}
                        {checkedBy && (
                          <div style={isMobile ? { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined} className={`${isMobile ? 'mt-1 text-[8px] px-1.5 py-0.5 tracking-wider' : 'mt-2 text-[9px] px-2.5 py-1 tracking-widest'} font-black uppercase rounded-md border ${
                            complete ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          }`}>
                            👤 {checkedBy} {checkedTime ? `в ${checkedTime}` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      </>
      )}

    </div>
  );
};

export default ChecklistPage;
