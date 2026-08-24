import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertCircle, Clock, CheckCircle2, Zap, Users, LayoutDashboard, Timer, Play, Pause, CircleDot, CalendarClock, MapPin, Target, AlertTriangle, Package, Heart, TrendingUp, TrendingDown, Shirt, Star, Wallet } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { isMobileDevice } from '../lib/isMobile';

const MANAGER_NAMES = ['Сания', 'Анастасия', 'Диас', 'Салтанат', 'Дилшат', 'Айнур', 'Азиз'];

// Названия клубов в аналитике DWH (посещения)
const DWH_CLUB = {
  '4YOU': 'HJ 4YOU', 'COLIBRI': 'HJ Colibri', 'VILLA': 'HJ Villa',
  'NURLY ORDA': 'HJ Nurly Orda', 'PROMENADE': 'HJ Promenade', 'EUROPE CITY': 'HJ Europe City',
};

const Dashboard = () => {
  const { tickets, user } = useTickets();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState('ВCE КЛУБЫ');

  // Мобильная вёрстка — влияет только на визуал, десктоп не меняем
  const [isMobile, setIsMobile] = React.useState(() => isMobileDevice());
  React.useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Открыть список задач с автоматически выставленными фильтрами (клуб/статус/приоритет/исполнитель)
  const openTickets = ({ club, filter, priority, q } = {}) => {
    const p = new URLSearchParams();
    const c = club || (activeTab === 'ВCE КЛУБЫ' ? 'ВСЕ' : activeTab);
    p.set('club', c);
    if (filter) p.set('filter', filter);
    if (priority) p.set('priority', priority);
    if (q) p.set('q', q);
    navigate(`/tickets?${p.toString()}`);
  };
  
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

  // ── Живые данные для сводки (посещения, чекины, лиды, доска задач, мерч, пульсометры) ──
  const [visits, setVisits]           = React.useState(null); // dwh_stats/club_visits
  const [visitHistory, setVisitHistory] = React.useState(null); // dwh_stats/daily_history
  const [coverage, setCoverage]       = React.useState({});   // hrm_coverage/{club}
  const [checkinsToday, setCheckinsToday] = React.useState([]);
  const [leadsToday, setLeadsToday]   = React.useState([]);
  const [boardEntries, setBoardEntries] = React.useState([]);
  const [transfers, setTransfers]     = React.useState([]);
  const [monitors, setMonitors]       = React.useState([]);   // hr_monitors (устройства)
  const [towelsToday, setTowelsToday] = React.useState([]);   // towel_records за сегодня
  const [salesToday, setSalesToday]   = React.useState([]);   // merch_sales за сегодня
  const [gisRatings, setGisRatings]   = React.useState(null); // {club: {rating, count}}

  React.useEffect(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const todayLocal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const dayStartISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const unsubs = [
      onSnapshot(doc(db, 'dwh_stats', 'club_visits'), s => setVisits(s.exists() ? s.data() : null), () => {}),
      onSnapshot(doc(db, 'dwh_stats', 'daily_history'), s => setVisitHistory(s.exists() ? s.data() : null), () => {}),
      onSnapshot(collection(db, 'hrm_coverage'), s => {
        const map = {}; s.docs.forEach(d => { map[d.id] = d.data(); }); setCoverage(map);
      }, () => {}),
      onSnapshot(query(collection(db, 'checkins'), where('date', '==', todayLocal)), s => setCheckinsToday(s.docs.map(d => d.data())), () => {}),
      onSnapshot(query(collection(db, 'sales_leads'), where('createdAtISO', '>=', dayStartISO)), s => setLeadsToday(s.docs.map(d => d.data())), () => {}),
      // Только неисправности (нужен лишь счётчик) — вся доска с фото весит сотни КБ
      onSnapshot(query(collection(db, 'shift_board'), where('type', '==', 'issue')), s => setBoardEntries(s.docs.map(d => d.data())), () => {}),
      onSnapshot(collection(db, 'merch_transfers'), s => setTransfers(s.docs.map(d => d.data())), () => {}),
      onSnapshot(collection(db, 'hr_monitors'), s => setMonitors(s.docs.map(d => d.data())), () => {}),
      onSnapshot(query(collection(db, 'towel_records'), where('date', '==', todayLocal)), s => setTowelsToday(s.docs.map(d => d.data())), () => {}),
      onSnapshot(query(collection(db, 'merch_sales'), where('createdAt', '>=', new Date(new Date().setHours(0, 0, 0, 0)))), s => setSalesToday(s.docs.map(d => d.data())), () => {}),
    ];
    return () => unsubs.forEach(u => { try { u(); } catch {} });
  }, []);

  // Рейтинг 2ГИС по клубам (кэш 30 минут, чтобы не дёргать API на каждый заход)
  React.useEffect(() => {
    let off = false;
    (async () => {
      try {
        const cached = JSON.parse(localStorage.getItem('hj_gis_ratings') || 'null');
        if (cached && Date.now() - cached.ts < 30 * 60 * 1000) { setGisRatings(cached.data); return; }
        const { fetchReviews, REVIEW_BRANCHES } = await import('../lib/reviews2gis');
        const out = {};
        await Promise.all(Object.entries(REVIEW_BRANCHES).map(async ([club, id]) => {
          try { const r = await fetchReviews(id, { limit: 1 }); out[club] = { rating: r.rating, count: r.count }; } catch {}
        }));
        if (!off && Object.keys(out).length) {
          setGisRatings(out);
          try { localStorage.setItem('hj_gis_ratings', JSON.stringify({ ts: Date.now(), data: out })); } catch {}
        }
      } catch {}
    })();
    return () => { off = true; };
  }, []);

  // Выбранный клуб (у менеджера — свой; у шефа — вкладка)
  const selClub = userClub || (activeTab !== 'ВCE КЛУБЫ' ? activeTab.toUpperCase() : null);

  // Посещения атлетов
  const sumVisits = (field) => {
    if (!visits?.clubs) return null;
    if (selClub) return visits.clubs.find(c => c.name === DWH_CLUB[selClub])?.[field] ?? 0;
    return visits.clubs.reduce((s, c) => s + (c[field] || 0), 0);
  };
  const athletesToday = sumVisits('visits');
  const athletesYest = sumVisits('yesterday');
  const visitsDelta = (athletesToday != null && athletesYest > 0) ? Math.round(((athletesToday - athletesYest) / athletesYest) * 100) : null;

  // Чекины сотрудников (уникальные люди)
  const staffToday = new Set(checkinsToday.filter(c => !selClub || (c.clubId || '').toUpperCase() === selClub).map(c => (c.userId || '').toLowerCase())).size;
  // Лиды за сегодня
  const leadsCount = leadsToday.filter(l => !selClub || (l.club || '').toUpperCase() === selClub).length;
  // Открытые неисправности на доске задач
  const issuesCount = boardEntries.filter(e => e.type === 'issue' && (!selClub || (e.club || '').toUpperCase() === selClub)).length;
  // Перемещения мерча в ожидании приёмки
  const pendingTransfers = transfers.filter(t => t.status === 'pending' && (!selClub || (t.toClub || '').toUpperCase() === selClub || (t.fromClub || '').toUpperCase() === selClub)).length;
  // Пульсометры: без постоянного
  const cov = selClub ? coverage[selClub] : coverage['_meta'];
  const hrmWithout = cov ? (selClub ? cov.without : cov.totalWithout) : null;
  const hrmPct = cov?.pctWithout ?? null;
  // Пульсометры-устройства (учёт в клубах)
  const monF = monitors.filter(m => !selClub || (m.club || '').toUpperCase() === selClub);
  const monWorking = monF.filter(m => (m.status || 'working') === 'working').length;
  const monBroken = monF.filter(m => m.status === 'broken').length;
  const monLost = monF.filter(m => m.status === 'lost').length;
  // Полотенца: кто заполнил учёт за сегодня
  const towelClubsFilled = new Set(towelsToday.map(r => (r.club || '').toUpperCase()));
  const towelFilledSel = selClub ? towelClubsFilled.has(selClub) : towelClubsFilled.size;
  // Продажи мерча за сегодня (только продажи, без возвратов/поставок)
  const salesF = salesToday.filter(s => (!selClub || (s.club || '').toUpperCase() === selClub) && (s.qty || 0) > 0 && !s.returned && s.paymentMethod !== 'Пересорт');
  const salesSum = salesF.reduce((s, x) => s + (x.totalSum || 0), 0);
  const salesQty = salesF.reduce((s, x) => s + (x.qty || 0), 0);
  // Рейтинг 2ГИС (клуб или средний по сети)
  const gis = (() => {
    if (!gisRatings) return null;
    if (selClub) return gisRatings[selClub] || null; // у EUROPE CITY филиала нет → null
    const vals = Object.values(gisRatings).filter(v => v?.rating != null);
    if (!vals.length) return null;
    return { rating: Math.round((vals.reduce((s, v) => s + v.rating, 0) / vals.length) * 10) / 10, count: vals.reduce((s, v) => s + (v.count || 0), 0) };
  })();

  // ── Зелёная точка «показатель изменился» ──
  // Снимок значений, которые пользователь видел в прошлый раз (localStorage).
  // Точка мигает, если текущее значение отличается; при уходе со страницы
  // текущие значения сохраняются как «просмотренные».
  const [seenSnap] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('hj_dash_seen') || '{}'); } catch { return {}; }
  });
  const latestValsRef = React.useRef({});
  const metricChanged = (label, value) => {
    const key = `${selClub || 'ALL'}:${label}`;
    const v = value == null ? null : String(value);
    if (v == null || v === '—') return false; // ещё грузится — не считаем изменением
    latestValsRef.current[key] = v;
    return seenSnap[key] !== undefined && seenSnap[key] !== v;
  };
  React.useEffect(() => {
    const save = () => {
      try {
        const prev = JSON.parse(localStorage.getItem('hj_dash_seen') || '{}');
        localStorage.setItem('hj_dash_seen', JSON.stringify({ ...prev, ...latestValsRef.current }));
      } catch {}
    };
    document.addEventListener('visibilitychange', save);
    window.addEventListener('beforeunload', save);
    return () => {
      save(); // уход со страницы = просмотрено
      document.removeEventListener('visibilitychange', save);
      window.removeEventListener('beforeunload', save);
    };
  }, []);

  const ChangeDot = () => (
    <>
      <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-green-400 animate-ping" />
      <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
    </>
  );

  // Тренд посещений — последние 14 дней (+ сегодня live)
  const trend = React.useMemo(() => {
    if (!visitHistory?.data) return [];
    const days = visitHistory.data.slice(-14).map(d => ({
      date: d.date,
      value: selClub
        ? (d.clubs.find(c => c.name === DWH_CLUB[selClub])?.visits ?? 0)
        : d.clubs.reduce((s, c) => s + (c.visits || 0), 0),
    }));
    if (athletesToday != null) days.push({ date: 'today', value: athletesToday, live: true });
    return days;
  }, [visitHistory, selClub, athletesToday]);
  const trendMax = Math.max(1, ...trend.map(t => t.value));

  const allTickets = activeTab === 'ВCE КЛУБЫ' 
    ? rawTickets 
    : rawTickets.filter(t => (t.club || '').toUpperCase() === activeTab.toUpperCase());

  const inWork = allTickets.filter(t => t.status === 'in_progress' || t.status === 'new').length;
  const slaIssues = allTickets.filter(t => t.priority === 'critical' && t.status !== 'closed').length;
  const waitCount = allTickets.filter(t => t.status === 'waiting').length;
  const closedToday = allTickets.filter(t => t.status === 'closed').length;
  const scheduledCount = allTickets.filter(t => t.status === 'scheduled').length;

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
    getClubStats('4YOU', '#5580A8'),
    getClubStats('COLIBRI', '#9b5de5'),
    getClubStats('VILLA', '#C08F4F'),
    getClubStats('NURLY ORDA', '#BF8055'),
    getClubStats('PROMENADE', '#5F9C96'),
    getClubStats('EUROPE CITY', '#B0688D'),
  ].filter(Boolean);

  const ticketAssignees = rawTickets
    .map(t => t.assignee ? t.assignee.split('(')[0].trim() : '')
    .filter(Boolean);
  
  const allManagerNames = [...new Set([...MANAGER_NAMES, ...ticketAssignees])];

  // Filter manager load dynamically based on club access
  const dynamicManagers = allManagerNames
    .map(name => {
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
      alert: t.statusReason || ''
    }));

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade select-none">
      {/* Header section with pulse icon and filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full animate-pulse"></div>
            <Activity size={32} className="text-purple-400 relative z-10" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl sm:text-3xl font-black text-[var(--text-primary)] uppercase tracking-tighter italic leading-none">
              Операционный центр
            </h1>
            <p className="text-[10px] sm:text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest mt-1 sm:mt-2">
              Глобальный мониторинг сети клубов
            </p>
          </div>
        </div>

        {!userClub && (
          <div className="flex items-center gap-2 bg-[var(--bg-card)] p-1.5 rounded-2xl border border-[var(--border)] shadow-2xl backdrop-blur-md overflow-x-auto max-w-full no-scrollbar flex-nowrap">
            {['ВCE КЛУБЫ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex-shrink-0 ${
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

      {/* Primary Stat Grid — заявки (на мобильном — горизонтальная лента компактных карточек) */}
      <div className={isMobile ? 'flex gap-2.5 overflow-x-auto no-scrollbar pb-1' : 'grid grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-5'}>
        {[
          { label: 'ЗАПЛАНИРОВАННЫЕ', value: scheduledCount, icon: CalendarClock, color: '#7A94B8', onClick: () => openTickets({ filter: 'ЗАПЛАНИРОВАННЫЕ' }) },
          { label: 'В РАБОТЕ', value: inWork, icon: Play, color: '#5F9C81', onClick: () => openTickets({ filter: 'В РАБОТЕ' }) },
          { label: 'КРИТИЧЕСКИЕ', value: slaIssues, icon: AlertCircle, color: '#ff3850', onClick: () => openTickets({ priority: 'critical' }) },
          { label: 'ОЖИДАНИЕ', value: waitCount, icon: Timer, color: '#9b5de5', onClick: () => openTickets({ filter: 'ОЖИДАНИЕ' }) },
          { label: 'ЗАКРЫТО', value: closedToday, icon: CheckCircle2, color: '#8888a0', onClick: () => navigate('/archive') },
        ].map(stat => (
          <div key={stat.label} onClick={stat.onClick} title={`Открыть: ${stat.label}`}
            style={isMobile ? { minWidth: 136, flexShrink: 0 } : undefined}
            className={`relative cursor-pointer bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl flex flex-col gap-1 transition-all group ${isMobile ? 'p-3 rounded-2xl' : 'p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] hover:-translate-y-1 hover:border-[var(--accent-purple)]'}`}>
            {metricChanged(stat.label, stat.value) && <ChangeDot />}
            <div className={`flex items-center gap-3 ${isMobile ? 'gap-2 mb-1.5' : 'mb-2 sm:mb-3'}`}>
              <div className={`rounded-2xl bg-[var(--bg-hover)] border border-[var(--border)] group-hover:border-[var(--accent-purple)] transition-colors ${isMobile ? 'p-1.5' : 'p-2 sm:p-2.5'}`}>
                <stat.icon size={16} className={isMobile ? '' : 'sm:w-5 sm:h-5'} style={{ color: stat.color }} />
              </div>
              <span className="text-[9px] sm:text-[10px] font-black text-[var(--text-muted)] tracking-[0.08em] uppercase leading-tight">{stat.label}</span>
            </div>
            <div className={`font-black text-[var(--text-primary)] leading-none tracking-tighter whitespace-nowrap ${isMobile ? 'text-2xl ml-0.5' : 'text-2xl sm:text-4xl ml-1'}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* ── Сегодня по сети: атлеты, персонал, лиды, неисправности, мерч, пульсометры, полотенца, продажи, 2ГИС ── */}
      {/* На мобильном — плотная сетка 2 колонки, числа не режутся (nowrap + адаптивный размер шрифта) */}
      <div className={isMobile ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4'}>
        {[
          { label: 'Атлетов сегодня', value: athletesToday ?? '—', icon: Users, color: '#7D6FB3', to: '/club-visits',
            sub: visitsDelta != null ? `${visitsDelta >= 0 ? '+' : ''}${visitsDelta}% ко вчера` : (athletesYest != null ? `вчера: ${athletesYest}` : ''),
            subColor: visitsDelta == null ? undefined : visitsDelta >= 0 ? '#5F9C81' : '#B06A6A',
            SubIcon: visitsDelta == null ? null : visitsDelta >= 0 ? TrendingUp : TrendingDown,
            sub2: sumVisits('booked') != null && sumVisits('booked') > 0 ? `записались: ${sumVisits('booked')}` : '',
            sub2Color: '#7A94B8', Sub2Icon: CalendarClock },
          { label: 'Сотрудников на чекине', value: staffToday, icon: MapPin, color: '#5F9C81', to: '/attendance', sub: 'отметились сегодня' },
          { label: 'Лиды сегодня', value: leadsCount, icon: Target, color: '#C08F4F', to: '/leads', sub: 'из WhatsApp' },
          { label: 'Неисправности', value: issuesCount, icon: AlertTriangle, color: '#B06A6A', to: '/shift-board', sub: 'на доске задач' },
          { label: 'Мерч: приёмка', value: pendingTransfers, icon: Package, color: '#0ea5e9', to: '/merch', sub: 'ждут подтверждения' },
          { label: 'Без пульсометра', value: hrmWithout ?? '—', icon: Heart, color: '#B0688D', to: '/hr-monitors', sub: hrmPct != null ? `${hrmPct}% активных ХП` : '' },
          { label: 'Пульсометры (парк)', value: monWorking, icon: Activity, color: '#5F9C81', to: '/hr-monitors',
            sub: (monBroken || monLost) ? `слом. ${monBroken} · потер. ${monLost}` : 'все рабочие',
            subColor: (monBroken || monLost) ? '#C08F4F' : '#5F9C81' },
          { label: 'Полотенца · учёт', value: selClub ? (towelFilledSel ? '✓' : '✗') : `${towelFilledSel}/6`, icon: Shirt, color: '#0ea5e9', to: '/towels',
            sub: selClub ? (towelFilledSel ? 'заполнен сегодня' : 'не заполнен сегодня') : 'клубов заполнили сегодня',
            subColor: selClub ? (towelFilledSel ? '#5F9C81' : '#B06A6A') : undefined },
          { label: 'Продажи мерча', value: salesSum ? `${salesSum.toLocaleString('ru')} ₸` : '0 ₸', icon: Wallet, color: '#a3e635', to: '/merch', sub: `${salesQty} шт за сегодня` },
          { label: 'Рейтинг 2ГИС', value: gis?.rating != null ? `★ ${gis.rating}` : '—', icon: Star, color: '#C4A75A', to: '/reviews',
            sub: gis?.count ? `${gis.count.toLocaleString('ru')} отзывов` : (selClub === 'EUROPE CITY' ? 'нет филиала 2ГИС' : '') },
        ].map(m => (
          <div key={m.label} onClick={() => navigate(m.to)} title={`Открыть: ${m.label}`}
            className={`relative cursor-pointer bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-xl transition-all hover:-translate-y-0.5 hover:border-[var(--accent-purple)] ${isMobile ? 'p-3' : 'p-4'}`}>
            {metricChanged(m.label, m.value) && <ChangeDot />}
            <div className={`flex items-center gap-2 ${isMobile ? 'mb-1.5' : 'mb-2'}`}>
              <m.icon size={14} style={{ color: m.color }} />
              <span className="text-[8px] sm:text-[9px] font-black text-[var(--text-muted)] tracking-[0.06em] uppercase leading-tight">{m.label}</span>
            </div>
            <div className={`font-black text-[var(--text-primary)] leading-none tracking-tighter whitespace-nowrap ${isMobile ? '' : 'text-xl sm:text-3xl'}`}
              style={isMobile ? { fontSize: String(m.value).length > 7 ? 16 : 20 } : undefined}>{m.value}</div>
            {m.sub && (
              <div className="flex items-center gap-1 mt-1.5">
                {m.SubIcon && <m.SubIcon size={10} style={{ color: m.subColor }} />}
                <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider" style={{ color: m.subColor || 'var(--text-muted)' }}>{m.sub}</span>
              </div>
            )}
            {m.sub2 && (
              <div className="flex items-center gap-1 mt-1">
                {m.Sub2Icon && <m.Sub2Icon size={10} style={{ color: m.sub2Color }} />}
                <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider" style={{ color: m.sub2Color || 'var(--text-muted)' }}>{m.sub2}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Тренд посещений: последние 14 дней + сегодня ── */}
      {trend.length > 0 && (
        <div onClick={() => navigate('/club-visits')} title="Открыть посещения" className={`cursor-pointer bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl transition-all hover:border-[var(--accent-purple)] ${isMobile ? 'rounded-2xl p-3' : 'rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6'}`}>
          <div className={`flex items-center justify-between gap-2 flex-wrap ${isMobile ? 'mb-2.5' : 'mb-4'}`}>
            <div className="flex items-center gap-2 sm:gap-3 text-[var(--text-muted)] italic">
              <Users size={14} className="text-[var(--accent-purple)]" />
              <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.15em]">Посещения атлетов · 2 недели{selClub ? ` · ${selClub}` : ' · вся сеть'}</span>
            </div>
            {athletesToday != null && (
              <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-end">
                {sumVisits('booked') > 0 && (
                  <span className="flex items-center gap-1.5 text-[10px] sm:text-xs font-black uppercase tracking-widest" style={{ color: '#7A94B8' }}>
                    <CalendarClock size={13} /> записались: {sumVisits('booked')}
                  </span>
                )}
                <span className="text-[10px] sm:text-xs font-black text-[var(--accent-purple)] uppercase tracking-widest">пришли: {athletesToday}</span>
                {sumVisits('booked') > 0 && athletesToday != null && (
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest" style={{ color: '#5F9C81' }}>
                    доходимость: {Math.round((athletesToday / sumVisits('booked')) * 100)}%
                  </span>
                )}
              </div>
            )}
          </div>
          {/* На мобильном график ниже — компактнее по вертикали */}
          <div className="flex items-end gap-1 sm:gap-1.5" style={{ height: isMobile ? 62 : 90 }}>
            {trend.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.live ? 'Сегодня' : d.date}: ${d.value}`}>
                <span className="text-[7px] sm:text-[9px] font-bold text-[var(--text-muted)]">{d.value}</span>
                <div style={{
                  width: '100%', maxWidth: 34, borderRadius: 6,
                  height: `${Math.max(4, Math.round((d.value / trendMax) * (isMobile ? 38 : 62)))}px`,
                  background: d.live ? 'linear-gradient(180deg,#a97bff,#7D6FB3)' : 'rgba(125,111,179,0.25)',
                  boxShadow: d.live ? '0 0 12px rgba(125,111,179,0.5)' : 'none',
                }} />
                <span className="text-[6px] sm:text-[8px] font-bold text-[var(--text-muted)] uppercase">{d.live ? 'сег' : d.date.slice(8, 10)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
        {/* Live Activity Board */}
        <div className={`col-span-1 lg:col-span-8 bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl relative overflow-hidden ${isMobile ? 'rounded-2xl p-3.5' : 'rounded-[1.5rem] sm:rounded-[2.5rem] p-4 sm:p-8'}`}>
          <div className="absolute top-0 right-0 p-8 opacity-5 hidden sm:block">
            <LayoutDashboard size={120} className="text-[var(--accent-purple)]" />
          </div>

          <div className={`flex items-center justify-between relative z-10 ${isMobile ? 'mb-3' : 'mb-6 sm:mb-8'}`}>
            <div className="flex items-center gap-2 sm:gap-3 text-[var(--text-muted)] italic">
              <Zap size={14} className="text-[var(--accent-purple)] sm:w-4 sm:h-4" />
              <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em]">Текущая активность линии</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></div>
              <span className="text-[9px] sm:text-[10px] font-black text-purple-400 uppercase tracking-widest">Live Board</span>
            </div>
          </div>

          <div className="space-y-3 relative z-10">
            {liveFeed.map(t => {
              const statusConfig = {
                'В РАБОТЕ': { color: '#5F9C81', icon: Play },
                'ОЖИДАНИЕ': { color: '#9b5de5', icon: Timer },
                'ПАУЗА':    { color: '#C08F4F', icon: Pause },
              }[t.status] || { color: '#55556a', icon: CircleDot };
              
              const StatusIcon = statusConfig.icon;

              return (
                <div key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} title="Открыть задачу" className={`cursor-pointer group bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)]/80 border border-[var(--border)] hover:border-[var(--accent-purple)] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between transition-all duration-300 ${isMobile ? 'p-3 gap-2' : 'p-4 sm:p-5 gap-3 sm:gap-4'}`}>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] text-[8px] sm:text-[9px] font-black uppercase tracking-widest">{t.club}</span>
                      <h3 className="text-xs sm:text-[14px] font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-purple)] transition-colors tracking-tight">{t.title}</h3>
                    </div>
                    {t.alert && (
                      <div className="flex items-center gap-2 text-[8px] sm:text-[9px] font-black text-orange-500 bg-orange-500/5 px-2 py-1 rounded-lg border border-orange-500/10 w-fit uppercase tracking-wider">
                        <Pause size={8} className="sm:w-[10px] sm:h-[10px]" fill="currentColor" /> {t.alert}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[9px] sm:text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
                      <Users size={10} className="sm:w-3 sm:h-3" /> {t.assignee.split(' ')[0]}
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-start gap-3">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                      <StatusIcon size={10} className="sm:w-3 sm:h-3" style={{ color: statusConfig.color }} fill={t.status === 'В РАБОТЕ' ? statusConfig.color : 'none'} />
                      <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest" style={{ color: statusConfig.color }}>
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
        <div className={`col-span-1 lg:col-span-4 bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl ${isMobile ? 'rounded-2xl p-3.5' : 'rounded-[1.5rem] sm:rounded-[2.5rem] p-4 sm:p-8'}`}>
          <div className={`flex items-center gap-3 text-[var(--text-muted)] italic ${isMobile ? 'mb-3' : 'mb-6 sm:mb-8'}`}>
            <Users size={14} className="text-[var(--accent-purple)] sm:w-4 sm:h-4" />
            <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em]">Нагрузка менеджеров</span>
          </div>

          {(() => {
            // Компактно: строки только у занятых; свободные — одной лентой чипов внизу
            const busy = dynamicManagers.filter(m => m.total > 0);
            const free = dynamicManagers.filter(m => m.total === 0);
            return (
              <>
                {busy.length === 0 && (
                  <div className="text-[11px] font-bold text-[var(--text-muted)] py-4 text-center">Активных задач у менеджеров нет 🎉</div>
                )}
                <div className="space-y-0.5">
                  {busy.map(m => (
                    <div key={m.name} onClick={() => openTickets({ q: m.name })} title={`Задачи: ${m.name}`}
                      className="cursor-pointer group flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-xl hover:bg-[var(--bg-hover)] transition-colors">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse flex-shrink-0" />
                      <span className="text-xs sm:text-[13px] font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-purple)] transition-colors whitespace-nowrap overflow-hidden text-ellipsis" style={{ maxWidth: isMobile ? 108 : 140 }}>{m.name}</span>
                      <div className="flex-1 h-1 bg-[var(--bg-hover)] rounded-full overflow-hidden" style={{ minWidth: 20 }}>
                        <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400" style={{ width: `${Math.min(100, (m.total / 10) * 100)}%` }} />
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {m.work > 0 && <span title="В работе" className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-400 border border-green-500/20">{m.work}</span>}
                        {m.pause > 0 && <span title="Пауза" className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20">{m.pause}</span>}
                        {m.wait > 0 && <span title="Ожидание" className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">{m.wait}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Легенда цветов */}
                {busy.length > 0 && (
                  <div className="mt-3 flex items-center gap-3 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500/60 inline-block" /> раб</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500/60 inline-block" /> пауза</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-purple-500/60 inline-block" /> ожид</span>
                  </div>
                )}
                {free.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-[var(--border)]">
                    <div className="text-[8px] sm:text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2">Свободны ({free.length})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {free.map(m => (
                        <span key={m.name} onClick={() => openTickets({ q: m.name })}
                          className="cursor-pointer text-[10px] font-bold px-2 py-1 rounded-lg bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text-primary)] hover:border-[var(--accent-purple)] transition-colors">
                          {m.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Club Summary Grid */}
      <div className={`bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl ${isMobile ? 'rounded-2xl p-3.5' : 'rounded-[1.5rem] sm:rounded-[2.5rem] p-4 sm:p-8'}`}>
        <div className={`flex items-center gap-3 text-[var(--text-muted)] italic ${isMobile ? 'mb-3' : 'mb-6 sm:mb-8'}`}>
          <LayoutDashboard size={14} className="text-[var(--accent-purple)] sm:w-4 sm:h-4" />
          <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em]">Сводка по клубам</span>
        </div>

        {/* На мобильном — вертикальный список плотных строк вместо крупных карточек */}
        <div className={isMobile ? 'flex flex-col gap-2' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'}>
          {CLUBS_SUMMARY.map(c => isMobile ? (
            <div key={c.name} onClick={() => openTickets({ club: c.name })} title={`Задачи клуба ${c.name}`}
              className="cursor-pointer bg-[var(--bg-hover)] border border-[var(--border)] hover:border-[var(--accent-purple)] rounded-2xl p-3 flex items-center gap-3 transition-all duration-300">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color, boxShadow: `0 0 10px ${c.color}` }} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-black text-[var(--text-primary)] italic uppercase tracking-widest truncate">{c.name}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="text-green-400">закрыто {c.closed}</span>
                  <span className="text-[var(--text-muted)]"> · </span>
                  <span className="text-[var(--accent-purple)]">в работе {c.active}</span>
                  {visits?.clubs && (
                    <span className="text-[var(--text-muted)]"> · 👥 {visits.clubs.find(v => v.name === DWH_CLUB[c.name.toUpperCase()])?.visits ?? 0}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <div className="text-xl font-black text-[var(--text-primary)] leading-none whitespace-nowrap">{c.total}</div>
                <div className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest mt-0.5">заявок</div>
              </div>
            </div>
          ) : (
            <div key={c.name} onClick={() => openTickets({ club: c.name })} title={`Задачи клуба ${c.name}`} className="cursor-pointer bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)]/80 border border-[var(--border)] hover:border-[var(--accent-purple)] rounded-2xl p-4 sm:p-6 transition-all duration-300">
              <div className="flex items-center gap-3 mb-3 sm:mb-4">
                <div className="w-2 h-2 rounded-full shadow-[0_0_10px]" style={{ background: c.color, boxShadow: `0 0 12px ${c.color}` }}></div>
                <span className="text-[10px] sm:text-xs font-black text-[var(--text-primary)] italic uppercase tracking-widest">{c.name}</span>
              </div>
              <div className="flex items-end justify-between gap-4 mb-1 sm:mb-2">
                <div className="text-2xl sm:text-4xl font-black text-[var(--text-primary)] leading-none">{c.total}</div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[7px] sm:text-[8px] font-black text-green-400 uppercase tracking-widest">Закрыто: {c.closed}</span>
                  <span className="text-[7px] sm:text-[8px] font-black text-[var(--accent-purple)] uppercase tracking-widest">В процессе: {c.active}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[8px] sm:text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Заявок всего</p>
                {visits?.clubs && (
                  <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest" style={{ color: c.color }}>
                    👥 {visits.clubs.find(v => v.name === DWH_CLUB[c.name.toUpperCase()])?.visits ?? 0} сегодня
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
