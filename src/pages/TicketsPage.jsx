import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Clock, Play, CheckCircle } from 'lucide-react';
import { useTickets } from '../store/TicketContext';

const CLUBS = ['ВСЕ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORCA', 'MY TASK'];
const FILTERS = ['ВСЕ', 'НОВЫЕ', 'В РАБОТЕ', 'ПАУЗА', 'ОЖИДАНИЕ', 'ЗАКРЫТО'];

const COLUMNS = [
  { id: 'new', label: 'НОВЫЕ', color: '#4f8ef7' },
  { id: 'in_progress', label: 'В РАБОТЕ', color: '#22c55e' },
  { id: 'paused', label: 'НА ПАУЗЕ', color: '#f59e0b' },
  { id: 'waiting', label: 'ОЖИДАНИЕ', color: '#9b5de5' },
  { id: 'closed', label: 'ЗАКРЫТО', color: '#55556a' },
];

const clubColors = {
  '4YOU': 'badge-4you',
  'COLIBRI': 'badge-colibri',
  'VILLA': 'badge-villa',
  'NURLY ORCA': 'badge-nurly',
  'PRIME': 'badge-prime',
};

const priorityLabels = {
  critical: { label: 'Критический', cls: 'priority-critical' },
  high: { label: 'Высокий', cls: 'priority-high' },
  medium: { label: 'Средний', cls: 'priority-medium' },
  low: { label: 'Низкий', cls: 'priority-low' },
};

const formatTimeAgo = (date) => {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  const months = Math.floor(days / 30);
  if (months > 0) return `${months} месяц${months > 1 && months < 5 ? 'а' : ''}${months >= 5 ? 'ев' : ''}`;
  if (days > 0) return `${days} день назад`;
  return 'Сегодня';
};

const TicketCard = ({ ticket, columnId }) => {
  const navigate = useNavigate();
  const clubClass = clubColors[ticket.club] || 'badge-4you';
  const priority = priorityLabels[ticket.priority] || priorityLabels.medium;

  return (
    <div
      className="ticket-card"
      onClick={() => navigate(`/tickets/${ticket.id}`)}
      style={{ cursor: 'pointer' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`badge ${clubClass}`}>{ticket.club || '4YOU'}</span>
        <span className={`badge ${priority.cls} ml-auto`}>{priority.label}</span>
      </div>
      <h3 className="font-semibold text-sm leading-snug mb-4" style={{ color: 'var(--text-primary)' }}>
        {ticket.title}
      </h3>
      {ticket.subtitle && (
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{ticket.subtitle}</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <span className="text-xs" style={{ letterSpacing: '0.02em', fontSize: 11 }}>{ticket.createdAt}</span>
        </div>
        <div className="flex items-center gap-2">
          {columnId === 'new' && (
            <button
              onClick={e => { e.stopPropagation(); navigate(`/tickets/${ticket.id}`); }}
              className="p-1.5 rounded-lg"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', transition: 'all 0.15s' }}
            >
              <Play size={14} fill="currentColor" />
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); navigate(`/tickets/${ticket.id}`); }}
            className="p-1.5 rounded-lg"
            style={{ background: 'rgba(123,61,255,0.1)', color: '#7B3DFF', border: '1px solid rgba(123,61,255,0.2)', transition: 'all 0.15s' }}
          >
            <CheckCircle size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

const DEMO_TICKETS = {
  new: [
    { id: 1, title: 'Переход на летний режим вентиляции', club: '4YOU', priority: 'medium', createdAt: 'около 1 месяца' },
    { id: 2, title: 'Заменять натяжные потолки, по возможности поменять освещение', club: 'COLIBRI', priority: 'low', createdAt: '3 месяца' },
    { id: 3, title: 'Сделать отдельную кухню для сотрудников', club: 'COLIBRI', priority: 'low', createdAt: '3 месяца' },
    { id: 4, title: 'Кабинет напротив ОП оборудовать под переговорную с клиентами', club: 'COLIBRI', priority: 'low', createdAt: '3 месяца' },
    { id: 5, title: 'Закрыть частично стекло в ОП (матовой пленкой, либо цветы)', club: 'COLIBRI', priority: 'medium', createdAt: '3 месяца' },
    { id: 6, title: 'Разобрать склад, сделать стелажи', club: 'COLIBRI', priority: 'low', createdAt: '3 месяца' },
    { id: 7, title: 'Единый музыкальный плейлист для всей сети HJ', club: '4YOU', priority: 'medium', createdAt: '3 месяца' },
    { id: 8, title: 'Экраны в залах выровнять под один уровень', club: '4YOU', priority: 'medium', createdAt: '3 месяца' },
  ],
  in_progress: [
    { id: 9, title: 'Переустановка счетчиков гор воды и пломбировка', club: '4YOU', priority: 'medium', createdAt: 'около 2 месяцев' },
    { id: 10, title: 'Сделать новую систему розеток + упорядочить шнуры', club: '4YOU', priority: 'medium', createdAt: '3 месяца' },
    { id: 11, title: 'Закрепить стальные кассеты (стены) по всему объекту', club: '4YOU', priority: 'medium', createdAt: '3 месяца' },
    { id: 12, title: 'Заказ подставок для гантелей в зал Legs', club: '4YOU', priority: 'medium', createdAt: '3 месяца' },
    { id: 13, title: 'Решить проблему в залах кардио с повышением температуры', club: 'COLIBRI', priority: 'critical', createdAt: '3 месяца' },
    { id: 14, title: 'Изготовить форму для админов, сервисников', club: 'COLIBRI', priority: 'medium', createdAt: '3 месяца' },
    { id: 15, title: 'Трещина в Legs на потолке огромная', club: '4YOU', priority: 'critical', createdAt: '3 месяца' },
    { id: 16, title: 'Разработка и создание униформы для сотрудников', club: '4YOU', priority: 'medium', createdAt: '3 месяца' },
    { id: 17, title: 'Подсветка мерч зоны, сделать гардеробный шкаф закрытый', club: 'COLIBRI', priority: 'medium', createdAt: '3 месяца' },
    { id: 18, title: 'Сбой в оборудовании, одна лампа в буте не горит', club: 'VILLA', priority: 'medium', createdAt: '3 месяца' },
  ],
  paused: [
    { id: 19, title: 'Фен Борк сломан (на ремонте)', club: '4YOU', priority: 'critical', createdAt: '2 месяца', subtitle: 'Ждём детали для сервис центра' },
  ],
  waiting: [
    { id: 20, title: 'Работа с кровлей, протечки', club: '4YOU', priority: 'medium', createdAt: '1 месяц' },
    { id: 21, title: 'Разборка серверной', club: 'COLIBRI', priority: 'medium', createdAt: '2 месяца', subtitle: 'Ждём Владимира, подтверди заяв' },
  ],
  closed: [],
};

const TicketsPage = () => {
  const [activeClub, setActiveClub] = useState('ВСЕ');
  const [activeFilter, setActiveFilter] = useState('ВСЕ');
  const [search, setSearch] = useState('');
  const { tickets } = useTickets();
  const navigate = useNavigate();

  // Use demo data if no Firestore tickets
  const data = tickets && tickets.length > 0 ? {} : DEMO_TICKETS;

  const CLUBS_TABS = ['ВСЕ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORCA'];

  return (
    <div className="animate-fade">
      {/* Top Page Header (matches screenshot) */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold italic flex items-center gap-2 mb-1" style={{ color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--accent-purple)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            </span>
            Все клубы: {activeClub === 'ВСЕ' ? 'ALL' : activeClub}
          </h1>
          <p className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            <span style={{ color: 'var(--accent-purple)' }}>📍</span> ГЛОБАЛЬНЫЙ МОНИТОРИНГ
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Club Pills Container */}
          <div className="flex items-center gap-1 p-1 rounded-full" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            {CLUBS_TABS.map(c => (
              <button
                key={c}
                onClick={() => setActiveClub(c)}
                className="px-4 py-1.5 rounded-full text-xs font-bold transition-all"
                style={{
                  background: activeClub === c ? 'var(--accent-purple)' : 'transparent',
                  color: activeClub === c ? '#fff' : 'var(--text-secondary)',
                  letterSpacing: '0.02em'
                }}
              >
                {c}
              </button>
            ))}
          </div>

          <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold transition-transform hover:-translate-y-0.5" style={{ background: '#b275ff', boxShadow: '0 4px 12px rgba(178,117,255,0.3)' }}>
            <Plus size={16} strokeWidth={3} />
            СОЗДАТЬ ЗАЯВКУ
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative flex-1 max-w-lg">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            className="input-app w-full pl-10"
            placeholder="Поиск..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ borderRadius: '12px' }}
          />
        </div>
        <div className="flex items-center gap-1">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`filter-tab ${activeFilter === f ? 'active' : ''}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 220px)' }}>
        {COLUMNS.map(col => {
          let colTickets = data[col.id] || [];
          
          // Filter by Active Club
          if (activeClub !== 'ВСЕ') {
            colTickets = colTickets.filter(t => t.club === activeClub);
          }
          
          // Filter by Search
          if (search) {
            colTickets = colTickets.filter(t => t.title.toLowerCase().includes(search.toLowerCase()));
          }

          return (
            <div key={col.id} className="kanban-col">
              <div className="kanban-header">
                <span style={{ color: col.color }}>{col.label}</span>
                <span className="col-count">{colTickets.length}</span>
              </div>
              <div>
                {colTickets.map(ticket => (
                  <TicketCard key={ticket.id} ticket={ticket} columnId={col.id} />
                ))}
                {colTickets.length === 0 && (
                  <div
                    className="text-center py-8 text-xs font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    ПУСТО
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TicketsPage;
