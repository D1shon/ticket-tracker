import React from 'react';
import { Activity, AlertCircle, Clock, CheckCircle2, Zap, Users, LayoutDashboard, Timer, Play, Pause, CircleDot, ChevronRight } from 'lucide-react';
import { useTickets } from '../store/TicketContext';

const MANAGER_NAMES = ['Сания', 'Анастасия', 'Диас', 'Салтанат', 'Дилшат', 'Айнур', 'Азиз'];

const StatusBadge = ({ status }) => {
  const isWork = status === 'В РАБОТЕ';
  return (
    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md tracking-widest uppercase border ${
      isWork ? 'bg-purple-500/20 text-[var(--accent-purple)] border-purple-500/30' : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border)]'
    }`}>
      {status}
    </span>
  );
};

const Dashboard = () => {
  const { tickets, user } = useTickets();
  const [activeTab, setActiveTab] = React.useState('ВCE КЛУБЫ');
  
  // Restricted access for Managers
  const userClub = user?.club?.toUpperCase();

  // Primary data filter
  const rawTickets = (tickets || []).filter(t => {
    if (!userClub) return true;
    return (t.club || '').toUpperCase() === userClub;
  });

  // Auto-switch tab if restricted
  React.useEffect(() => {
    if (userClub) setActiveTab(userClub);
  }, [userClub]);

  const allTickets = activeTab === 'ВCE КЛУБЫ' 
    ? rawTickets 
    : rawTickets.filter(t => (t.club || '').toUpperCase() === activeTab.toUpperCase());

  const inWork = allTickets.filter(t => t.status === 'in_progress').length;
  const slaIssues = allTickets.filter(t => t.priority === 'critical' && t.status !== 'closed').length;
  const waitCount = allTickets.filter(t => t.status === 'waiting').length;
  const closedToday = allTickets.filter(t => t.status === 'closed').length;

  const getClubStats = (clubName, color) => {
    if (userClub && clubName.toUpperCase() !== userClub) return null;
    const clubTickets = rawTickets.filter(t => (t.club || '4YOU').toUpperCase() === clubName.toUpperCase());
    return {
      name: clubName,
      color,
      total: clubTickets.length,
      closed: clubTickets.filter(t => t.status === 'closed').length,
      active: clubTickets.filter(t => t.status === 'in_progress').length
    };
  };

  const CLUBS_SUMMARY = [
    getClubStats('4YOU', '#4f8ef7'),
    getClubStats('COLIBRI', '#9b5de5'),
    getClubStats('VILLA', '#f59e0b'),
    getClubStats('NURLY ORDA', '#f97316'),
  ].filter(Boolean);

  const ticketAssignees = rawTickets
    .map(t => t.assignee ? t.assignee.split('(')[0].trim() : '')
    .filter(Boolean);
  
  const allManagerNames = [...new Set([...MANAGER_NAMES, ...ticketAssignees])];

  // Filter manager load dynamically based on club access
  const dynamicManagers = allManagerNames
    .map(name => {
      // stats are already based on rawTickets (which is club-filtered)
      const assigned = rawTickets.filter(t => t.assignee && t.assignee.includes(name) && t.status !== 'closed');
      const work  = assigned.filter(t => t.status === 'in_progress').length;
      const pause = assigned.filter(t => t.status === 'paused').length;
      const wait  = assigned.filter(t => t.status === 'waiting').length;
      const newCount = assigned.filter(t => t.status === 'new').length;
      const total = work + pause + wait + newCount;
      const isFree = total === 0;

      return {
        name,
        status: isFree ? 'СВОБОДЕН' : 'В РАБОТЕ',
        work,
        pause,
        wait,
        newCount,
        total,
        color: isFree ? '#55556a' : '#9b5de5'
      };
    })
    .filter(m => {
      // If manager mode: only show managers who actually have work in THIS club or it's the user themselves
      if (!userClub) return true;
      const isMe = m.name.toUpperCase().includes(user?.displayName?.toUpperCase() || '___');
      return m.total > 0 || isMe;
    })
    .sort((a, b) => b.total - a.total); 

  const liveFeed = allTickets
    .filter(t => t.status !== 'closed' && t.status !== 'new')
    .slice(0, 5)
    .map(t => ({
      id: t.id,
      club: t.club || '4YOU',
      title: t.title,
      status: t.status === 'in_progress' ? 'В РАБОТЕ' : t.status === 'waiting' ? 'ОЖИДАНИЕ' : 'ПАУЗА',
      assignee: t.assignee || 'САНИЯ (4YOU) • ПРОЧЕЕ',
      alert: t.statusReason || '' // Use real reason provided during status change
    }));

  return (
    <div className="space-y-8 animate-fade select-none">
      {/* Header section with pulse icon and filters */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full animate-pulse"></div>
            <Activity size={32} className="text-purple-400 relative z-10" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-3xl font-black text-[var(--text-primary)] uppercase tracking-tighter italic leading-none">
              Операционный центр
            </h1>
            <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest mt-2">
              Глобальный мониторинг сети клубов
            </p>
          </div>
        </div>

        {!userClub && (
          <div className="flex items-center gap-2 bg-[var(--bg-card)] p-1.5 rounded-2xl border border-[var(--border)] shadow-2xl backdrop-blur-md">
            {['ВCE КЛУБЫ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                  activeTab === tab 
                    ? 'bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.3)]' 
                    : 'text-white/30 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Primary Stat Grid */}
      <div className="grid grid-cols-4 gap-6">
        {[
          { label: 'В РАБОТЕ', value: inWork, icon: Play, color: '#22c55e' },
          { label: 'КРИТИЧЕСКИЕ', value: slaIssues, icon: AlertCircle, color: '#ff3850' },
          { label: 'ОЖИДАНИЕ', value: waitCount, icon: Timer, color: '#9b5de5' },
          { label: 'ЗАКРЫТО', value: closedToday, icon: CheckCircle2, color: '#8888a0' },
        ].map(stat => (
          <div key={stat.label} className="bg-[var(--bg-card)] p-7 rounded-[2rem] border border-[var(--border)] shadow-2xl flex flex-col gap-1 transition-all hover:-translate-y-1 group">
            <div className="flex items-center gap-4 mb-3">
              <div className="p-3 rounded-2xl bg-[var(--bg-hover)] border border-[var(--border)] group-hover:border-[var(--accent-purple)] transition-colors">
                <stat.icon size={20} style={{ color: stat.color }} />
              </div>
              <span className="text-[10px] font-black text-[var(--text-muted)] tracking-[0.1em] uppercase">{stat.label}</span>
            </div>
            <div className="text-4xl font-black text-[var(--text-primary)] leading-none ml-1 tracking-tighter">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-12 gap-6">
        {/* Live Activity Board */}
        <div className="col-span-8 bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border)] p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <LayoutDashboard size={120} className="text-[var(--accent-purple)]" />
          </div>
          
          <div className="flex items-center justify-between mb-8 relative z-10">
            <div className="flex items-center gap-3 text-[var(--text-muted)] italic">
              <Zap size={16} className="text-[var(--accent-purple)]" />
              <span className="text-[11px] font-black uppercase tracking-[0.2em]">Текущая активность линии</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></div>
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Live Board</span>
            </div>
          </div>

          <div className="space-y-3 relative z-10">
            {liveFeed.map(t => {
              const statusConfig = {
                'В РАБОТЕ': { color: '#22c55e', icon: Play },
                'ОЖИДАНИЕ': { color: '#9b5de5', icon: Timer },
                'ПАУЗА':    { color: '#f59e0b', icon: Pause },
              }[t.status] || { color: '#55556a', icon: CircleDot };
              
              const StatusIcon = statusConfig.icon;

              return (
                <div key={t.id} className="group bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)]/80 border border-[var(--border)] rounded-2xl p-5 flex items-center justify-between transition-all duration-300">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] text-[9px] font-black uppercase tracking-widest">{t.club}</span>
                      <h3 className="text-[14px] font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-purple)] transition-colors tracking-tight">{t.title}</h3>
                    </div>
                    {t.alert && (
                      <div className="flex items-center gap-2 text-[9px] font-black text-orange-500 bg-orange-500/5 px-3 py-1.5 rounded-lg border border-orange-500/10 w-fit uppercase tracking-wider">
                        <Pause size={10} fill="currentColor" /> {t.alert}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
                      <Users size={12} /> {t.assignee.split(' ')[0]}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                      <StatusIcon size={12} style={{ color: statusConfig.color }} fill={t.status === 'В РАБОТЕ' ? statusConfig.color : 'none'} />
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: statusConfig.color }}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Manager Load Sidebar */}
        <div className="col-span-4 bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border)] p-8 shadow-2xl">
          <div className="flex items-center gap-3 text-[var(--text-muted)] italic mb-8">
            <Users size={16} className="text-[var(--accent-purple)]" />
            <span className="text-[11px] font-black uppercase tracking-[0.2em]">Нагрузка менеджеров</span>
          </div>

          <div className="space-y-6">
            {dynamicManagers.map(m => {
              const total = m.total;
              const isFree = m.status === 'СВОБОДЕН';
              return (
                <div key={m.name} className="flex flex-col gap-3 group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${isFree ? 'bg-[var(--text-muted)]' : 'bg-purple-500 animate-pulse'}`} />
                      <span className="text-[13px] font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-purple)] transition-colors">{m.name}</span>
                    </div>
                    <span className={`text-[9px] font-black px-2 py-1 rounded-lg border uppercase tracking-widest ${
                      !isFree ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border)]'
                    }`}>
                      {m.status}
                    </span>
                  </div>
                  {!isFree && (
                    <div className="relative w-full h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                      <div 
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-1000 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                        style={{ width: `${Math.min(100, (total / 10) * 100)}%` }}
                      ></div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-[9px] font-black tracking-widest text-[var(--text-muted)] uppercase">
                    <span className={m.newCount > 0 ? 'text-[var(--accent-blue)]' : ''}>нов: {m.newCount}</span>
                    <span className={m.work > 0 ? 'text-green-500/80' : ''}>раб: {m.work}</span>
                    <span className={m.pause > 0 ? 'text-orange-500/80' : ''}>пауза: {m.pause}</span>
                    <span className={m.wait > 0 ? 'text-[var(--accent-purple)]' : ''}>ожид: {m.wait}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Club Summary Grid */}
      <div className="bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border)] p-8 shadow-2xl">
        <div className="flex items-center gap-3 text-[var(--text-muted)] italic mb-8">
          <LayoutDashboard size={16} className="text-[var(--accent-purple)]" />
          <span className="text-[11px] font-black uppercase tracking-[0.2em]">Сводка по клубам</span>
        </div>
        
        <div className="grid grid-cols-5 gap-4">
          {CLUBS_SUMMARY.map(c => (
            <div key={c.name} className="bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)]/80 border border-[var(--border)] rounded-2xl p-6 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-2 rounded-full shadow-[0_0_10px]" style={{ background: c.color, boxShadow: `0 0 12px ${c.color}` }}></div>
                <span className="text-xs font-black text-[var(--text-primary)] italic uppercase tracking-widest">{c.name}</span>
              </div>
              <div className="flex items-end justify-between gap-4 mb-2">
                <div className="text-4xl font-black text-[var(--text-primary)] leading-none">{c.total}</div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[8px] font-black text-green-400 uppercase tracking-widest">Закрыто: {c.closed}</span>
                  <span className="text-[8px] font-black text-[var(--accent-purple)] uppercase tracking-widest">В процессе: {c.active}</span>
                </div>
              </div>
              <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Заявок всего</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

