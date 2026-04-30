import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Clock, ChevronRight } from 'lucide-react';
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
  if (months > 0) return `${months} месяц${months > 1 ? 'а' : ''} назад`;
  if (days > 0) return `${days} день назад`;
  return 'Сегодня';
};

const TicketCard = ({ ticket }) => {
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
      <h3 className="font-semibold text-sm leading-snug mb-3" style={{ color: 'var(--text-primary)' }}>
        {ticket.title}
      </h3>
      {ticket.subtitle && (
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{ticket.subtitle}</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <Clock size={11} />
          <span className="text-xs">{formatTimeAgo(ticket.createdAt)}</span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); navigate(`/tickets/${ticket.id}`); }}
          className="p-1.5 rounded-md"
          style={{ background: 'rgba(79,142,247,0.15)', color: '#4f8ef7' }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};


const DEMO_TICKETS = {
  new: [
    { id: 1, title: 'Переход на летний режим вентиляции', club: '4YOU', priority: 'medium', createdAt: new Date(Date.now() - 30*24*3600000) },
    { id: 2, title: 'Заменять натяжные потолки, по возможности поменять...', club: 'COLIBRI', priority: 'low', createdAt: new Date(Date.now() - 30*24*3600000) },
    { id: 3, title: 'Сделать отдельную кухню для сотрудников (разделить...', club: 'COLIBRI', priority: 'low', createdAt: new Date(Date.now() - 30*24*3600000) },
    { id: 4, title: 'Кабинет напротив ОП оборудовать под переговорную...', club: 'COLIBRI', priority: 'low', createdAt: new Date(Date.now() - 30*24*3600000) },
    { id: 5, title: 'Закрыть частично стекло в ОП (матовой пленкой, либо цвет...', club: 'COLIBRI', priority: 'medium', createdAt: new Date(Date.now() - 30*24*3600000) },
  ],
  in_progress: [
    { id: 6, title: 'Переустановка счётчиков гор воды и пломбировка', club: '4YOU', priority: 'medium', createdAt: new Date(Date.now() - 60*24*3600000) },
    { id: 7, title: 'Сделать новую систему розеток + упорядочить шнуры', club: 'COLIBRI', priority: 'medium', createdAt: new Date(Date.now() - 30*24*3600000) },
    { id: 8, title: 'Закрепить стальные кассеты (стены) по всему объекту', club: '4YOU', priority: 'medium', createdAt: new Date(Date.now() - 60*24*3600000) },
    { id: 9, title: 'Заказ подставок для гантелей в зал Legs', club: '4YOU', priority: 'medium', createdAt: new Date(Date.now() - 60*24*3600000) },
    { id: 10, title: 'Решить проблему в залах кардио с повышением температуры', club: 'COLIBRI', priority: 'critical', createdAt: new Date(Date.now() - 30*24*3600000) },
  ],
  paused: [
    { id: 11, title: 'Фен Борк сломан (на ремонте)', club: '4YOU', priority: 'critical', createdAt: new Date(Date.now() - 60*24*3600000), subtitle: 'Ждём детали для сервис центра' },
  ],
  waiting: [
    { id: 12, title: 'Работа с кровлей, протечки', club: '4YOU', priority: 'medium', createdAt: new Date(Date.now() - 30*24*3600000) },
    { id: 13, title: 'Разборка серверной', club: 'COLIBRI', priority: 'medium', createdAt: new Date(Date.now() - 60*24*3600000), subtitle: 'Ждём Владимира, подтверди заяв' },
  ],
  closed: [],
};

const TicketsPage = () => {
  const [activeClub, setActiveClub] = useState('ВСЕ');
  const [activeFilter, setActiveFilter] = useState('ВСЕ');
  const [search, setSearch] = useState('');
  const { tickets } = useTickets();

  // Use demo data if no Firestore tickets
  const data = tickets && tickets.length > 0 ? {} : DEMO_TICKETS;

  return (
    <div className="animate-fade">
      {/* Page title */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Все клубы: {activeClub}
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            🌐 ГЛОБАЛЬНЫЙ МОНИТОРИНГ
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            className="input-app w-full pl-9"
            placeholder="Поиск..."
            value={search}
            onChange={e => setSearch(e.target.value)}
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
          const colTickets = data[col.id] || [];
          return (
            <div key={col.id} className="kanban-col">
              <div className="kanban-header">
                <span style={{ color: col.color }}>{col.label}</span>
                <span className="col-count">{colTickets.length}</span>
              </div>
              <div>
                {colTickets.map(ticket => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
                {colTickets.length === 0 && (
                  <div
                    className="text-center py-8 text-xs"
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
