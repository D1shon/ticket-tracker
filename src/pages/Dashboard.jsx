import React from 'react';
import { Activity, AlertCircle, Clock, CheckCircle2, Zap, Users, LayoutDashboard } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { DEMO_TICKETS } from './TicketsPage';

const MANAGERS = [
  { name: 'Сания',    status: 'В РАБОТЕ', work: 9, pause: 1, wait: 1, color: '#9b5de5' },
  { name: 'Анастасия',status: 'В РАБОТЕ', work: 8, pause: 0, wait: 1, color: '#9b5de5' },
  { name: 'Диас',     status: 'В РАБОТЕ', work: 3, pause: 0, wait: 0, color: '#9b5de5' },
  { name: 'Салтанат', status: 'В РАБОТЕ', work: 3, pause: 0, wait: 0, color: '#9b5de5' },
  { name: 'Дилшат',   status: 'В РАБОТЕ', work: 9, pause: 1, wait: 1, color: '#9b5de5' },
  { name: 'Айнур',    status: 'СВОБОДЕН', work: 0, pause: 0, wait: 0, color: '#55556a' },
  { name: 'Азиз',     status: 'СВОБОДЕН', work: 0, pause: 0, wait: 0, color: '#55556a' },
];

const StatusBadge = ({ status }) => {
  const isWork = status === 'В РАБОТЕ';
  return (
    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md tracking-widest uppercase border ${
      isWork ? 'bg-purple-500/20 text-[#b07ef7] border-purple-500/30' : 'bg-white/5 text-white/20 border-white/5'
    }`}>
      {status}
    </span>
  );
};

const Dashboard = () => {
  const { tickets } = useTickets();
  const [activeTab, setActiveTab] = React.useState('ВCE КЛУБЫ');
  
  // Combine real tickets or fallback to demo
  let allTickets = [];
  if (tickets && tickets.length > 0) {
    allTickets = tickets;
  } else {
    allTickets = [
      ...DEMO_TICKETS.new.map(t => ({...t, status: 'new'})),
      ...DEMO_TICKETS.in_progress.map(t => ({...t, status: 'in_progress'})),
      ...DEMO_TICKETS.paused.map(t => ({...t, status: 'paused'})),
      ...DEMO_TICKETS.waiting.map(t => ({...t, status: 'waiting'})),
      ...DEMO_TICKETS.closed.map(t => ({...t, status: 'closed'})),
    ];
  }

  const inWork = allTickets.filter(t => t.status === 'in_progress').length;
  const slaIssues = allTickets.filter(t => t.priority === 'critical' && t.status !== 'closed').length;
  const waitCount = allTickets.filter(t => t.status === 'waiting').length;
  const closedToday = allTickets.filter(t => t.status === 'closed').length;

  const getClubStats = (clubName, color) => {
    const clubTickets = allTickets.filter(t => (t.club || '4YOU') === clubName);
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
    getClubStats('MY TASK', '#22c55e'),
  ];

  const liveFeed = allTickets
    .filter(t => t.status !== 'closed' && t.status !== 'new')
    .slice(0, 5)
    .map(t => ({
      id: t.id,
      club: t.club || '4YOU',
      title: t.title,
      status: t.status === 'in_progress' ? 'В РАБОТЕ' : 'ПАУЗА',
      assignee: t.assignee || 'САНИЯ (4YOU) • ПРОЧЕЕ',
      alert: t.status === 'paused' ? 'ЖДЕМ ДЕТАЛИ ДЛЯ СЕРВИС ЦЕНТРА' : ''
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
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter italic leading-none">
              Операционный центр
            </h1>
            <p className="text-xs text-white/30 font-bold uppercase tracking-widest mt-2">
              Глобальный мониторинг сети клубов
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/5 shadow-2xl backdrop-blur-md">
          {['ВCE КЛУБЫ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'MY TASK'].map(tab => (
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
      </div>

      {/* Primary Stat Grid */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'В РАБОТЕ', value: inWork, icon: Activity, color: 'text-white', bg: 'bg-[#111113]' },
          { label: 'ЗАВИСЛИ (SLA)', value: slaIssues, icon: AlertCircle, color: 'text-red-500', bg: 'bg-[#111113]' },
          { label: 'ОЖИДАНИЕ', value: waitCount, icon: Clock, color: 'text-orange-400', bg: 'bg-[#111113]' },
          { label: 'ЗАКРЫТО СЕГОДНЯ', value: closedToday, icon: CheckCircle2, color: 'text-green-400', bg: 'bg-[#111113]' },
        ].map(stat => (
          <div key={stat.label} className={`${stat.bg} p-6 rounded-[2rem] border border-white/5 shadow-xl flex flex-col gap-1 transition-transform hover:scale-[1.02] cursor-default`}>
            <div className="flex items-center gap-4 mb-2">
              <div className={`p-3 rounded-2xl ${stat.color.replace('text-', 'bg-').replace('text-', 'bg-')}/5 border border-white/5`}>
                <stat.icon size={20} className={stat.color} />
              </div>
              <span className="text-[11px] font-black text-white/30 tracking-widest uppercase">{stat.label}</span>
            </div>
            <div className={`text-4xl font-black ${stat.color} leading-none ml-1`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-12 gap-6">
        {/* Live Activity Board */}
        <div className="col-span-8 bg-[#0f0f11] rounded-[2.5rem] border border-white/5 p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <LayoutDashboard size={120} className="text-purple-500" />
          </div>
          
          <div className="flex items-center justify-between mb-8 relative z-10">
            <div className="flex items-center gap-3 text-white/40 italic">
              <Zap size={16} className="text-purple-400" />
              <span className="text-[11px] font-black uppercase tracking-[0.2em]">Текущая активность линии</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></div>
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Live Board</span>
            </div>
          </div>

          <div className="space-y-3 relative z-10">
            {liveFeed.map(t => (
              <div key={t.id} className="group bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-2xl p-5 flex items-center justify-between transition-all duration-300">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/20 text-[9px] font-black uppercase tracking-widest">{t.club}</span>
                    <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">{t.title}</h3>
                  </div>
                  {t.alert && (
                    <div className="flex items-center gap-2 text-[10px] font-black text-orange-500 bg-orange-500/10 px-3 py-1 rounded-lg border border-orange-500/20 w-fit uppercase">
                      <span className="text-lg leading-none">||</span> {t.alert}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-white/30 font-bold tracking-wide">
                    <Users size={12} /> {t.assignee}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${t.status === 'В РАБОТЕ' ? 'text-blue-400' : 'text-white/30'}`}>
                    {t.status}
                  </span>
                  <div className="w-8 h-[2px] bg-white/10 rounded-full overflow-hidden">
                    {t.status === 'В РАБОТЕ' && <div className="h-full w-full bg-blue-400 animate-pulse"></div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Manager Load Sidebar */}
        <div className="col-span-4 bg-[#0f0f11] rounded-[2.5rem] border border-white/5 p-8 shadow-2xl">
          <div className="flex items-center gap-3 text-white/40 italic mb-8">
            <Users size={16} className="text-purple-400" />
            <span className="text-[11px] font-black uppercase tracking-[0.2em]">Нагрузка менеджеров</span>
          </div>

          <div className="space-y-8">
            {MANAGERS.map(m => {
              const total = m.work + m.pause + m.wait;
              const isFree = m.status === 'СВОБОДЕН';
              return (
                <div key={m.name} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white tracking-wide">{m.name}</span>
                    <StatusBadge status={m.status} />
                  </div>
                  {!isFree && (
                    <div className="relative w-full h-2 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-purple-500 to-orange-500 transition-all duration-1000"
                        style={{ width: `${Math.min(100, (total / 12) * 100)}%` }}
                      ></div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-[9px] font-black tracking-widest text-white/20 uppercase">
                    <span className={m.work > 0 ? 'text-blue-400' : ''}>раб: {m.work}</span>
                    <span className={m.pause > 0 ? 'text-orange-500' : ''}>пауза: {m.pause}</span>
                    <span className={m.wait > 0 ? 'text-yellow-500' : ''}>ожид: {m.wait}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Club Summary Grid */}
      <div className="bg-[#0f0f11] rounded-[2.5rem] border border-white/5 p-8 shadow-2xl">
        <div className="flex items-center gap-3 text-white/40 italic mb-8">
          <LayoutDashboard size={16} className="text-purple-400" />
          <span className="text-[11px] font-black uppercase tracking-[0.2em]">Сводка по клубам</span>
        </div>
        
        <div className="grid grid-cols-5 gap-4">
          {CLUBS_SUMMARY.map(c => (
            <div key={c.name} className="bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 rounded-2xl p-6 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-2 rounded-full shadow-[0_0_10px]" style={{ background: c.color, boxShadow: `0 0 12px ${c.color}` }}></div>
                <span className="text-xs font-black text-white italic uppercase tracking-widest">{c.name}</span>
              </div>
              <div className="flex items-end justify-between gap-4 mb-2">
                <div className="text-4xl font-black text-white leading-none">{c.total}</div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[8px] font-black text-green-400 uppercase tracking-widest">Закрыто: {c.closed}</span>
                  <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest">В процессе: {c.active}</span>
                </div>
              </div>
              <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Заявок всего</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

