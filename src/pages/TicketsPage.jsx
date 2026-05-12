import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Clock, Play, CheckCircle, LayoutGrid, List, Columns, Timer, CircleDot, Pause, User, ChevronRight } from 'lucide-react';
import { useTickets } from '../store/TicketContext';

const CLUBS_TABS = ['ВСЕ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'];
const FILTERS    = ['ВСЕ', 'НОВЫЕ', 'В РАБОТЕ', 'ПАУЗА', 'ОЖИДАНИЕ', 'ЗАКРЫТО'];

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'];
const PRIORITIES = [
  { id: 'critical', label: 'Критический', color: '#ff4444' },
  { id: 'high',     label: 'Высокий',     color: '#ff8800' },
  { id: 'medium',   label: 'Средний',     color: '#ffcc00' },
  { id: 'low',      label: 'Низкий',      color: '#00cc88' },
];

const MANAGERS = ['Сания', 'Анастасия', 'Диас', 'Салтанат', 'Дилшат', 'Айнур', 'Азиз'];

const COLUMNS = [
  { id: 'new',         label: 'НОВЫЕ',    color: '#4f8ef7' },
  { id: 'in_progress', label: 'В РАБОТЕ', color: '#22c55e' },
  { id: 'paused',      label: 'НА ПАУЗЕ', color: '#f59e0b' },
  { id: 'waiting',     label: 'ОЖИДАНИЕ', color: '#9b5de5' },
  { id: 'closed',      label: 'ЗАКРЫТО',  color: '#55556a' },
];

const FILTER_TO_COL = {
  'НОВЫЕ': 'new', 'В РАБОТЕ': 'in_progress',
  'ПАУЗА': 'paused', 'ОЖИДАНИЕ': 'waiting', 'ЗАКРЫТО': 'closed',
};

const clubColors = {
  '4YOU': 'badge-4you', 'COLIBRI': 'badge-colibri',
  'VILLA': 'badge-villa', 'NURLY ORDA': 'badge-nurly'
};
const priorityLabels = {
  critical: { label: 'Критический', cls: 'priority-critical' },
  high:     { label: 'Высокий',     cls: 'priority-high'     },
  medium:   { label: 'Средний',     cls: 'priority-medium'   },
  low:      { label: 'Низкий',      cls: 'priority-low'      },
};

// ─── Live elapsed-time hook ───────────────────────────────────────────────────
function useLiveTimer(sinceISO) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!sinceISO) { setElapsed(''); return; }

    const tick = () => {
      const diff = Math.floor((Date.now() - new Date(sinceISO).getTime()) / 1000);
      if (diff < 60)   return setElapsed(`${diff}с`);
      if (diff < 3600) return setElapsed(`${Math.floor(diff / 60)}мин`);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      setElapsed(m > 0 ? `${h}ч ${m}мин` : `${h}ч`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sinceISO]);

  return elapsed;
}

// ─── Status timer badge (on card) ─────────────────────────────────────────────
const StatusTimer = ({ ticket }) => {
  const since = ticket.statusChangedAt;
  const status = ticket.status;
  const elapsed = useLiveTimer(since);

  if (!since || !elapsed) return null;

  const config = {
    new:         { color: 'var(--accent-blue)',   label: 'Новая',    icon: CircleDot },
    in_progress: { color: 'var(--accent-green)',  label: 'В работе', icon: Play      },
    paused:      { color: 'var(--accent-orange)', label: 'Пауза',    icon: Pause     },
    waiting:     { color: 'var(--accent-purple)', label: 'Ожидание', icon: Timer     },
  }[status] || { color: 'var(--text-muted)', label: 'Закрыто', icon: CheckCircle };

  const Icon = config.icon;

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: `${config.color}10`,
      border: `1px solid ${config.color}25`,
      borderRadius: 10, padding: '4px 10px',
      fontSize: 10, fontWeight: 800, color: config.color,
      textTransform: 'uppercase', letterSpacing: '0.02em'
    }}>
      <Icon size={12} fill={status === 'in_progress' ? 'currentColor' : 'none'} />
      <span>{elapsed}</span>
    </div>
  );
};

// ─── Ticket card ──────────────────────────────────────────────────────────────
const TicketCard = ({ ticket, columnId, isList = false, isNew = false }) => {
  const navigate  = useNavigate();
  const clubClass = clubColors[ticket.club] || 'badge-4you';
  const priority  = priorityLabels[ticket.priority] || priorityLabels.medium;

  const cardStyle = {
    animation: isNew ? 'card-drop-in 0.4s cubic-bezier(0.34,1.56,0.64,1)' : undefined,
    position: 'relative',
    overflow: 'hidden'
  };

  if (isList) {
    return (
      <div
        className="ticket-card"
        onClick={() => navigate(`/tickets/${ticket.id}`)}
        style={{ 
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 20, 
          marginBottom: 12, padding: '18px 24px', borderRadius: 20,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          ...cardStyle 
        }}
      >
        <span className={`badge ${clubClass}`} style={{ minWidth: 80, textAlign: 'center', padding: '4px 10px' }}>{ticket.club || '4YOU'}</span>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{ticket.title}</h3>
          {ticket.subtitle && <p style={{ fontSize: 12, marginTop: 4, color: 'var(--text-muted)', fontWeight: 500 }}>{ticket.subtitle}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StatusTimer ticket={ticket} />
          <span className={`badge ${priority.cls}`} style={{ padding: '4px 10px' }}>{priority.label}</span>
          <ChevronRight size={16} color="var(--text-muted)" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="ticket-card"
      onClick={() => navigate(`/tickets/${ticket.id}`)}
      style={{ 
        cursor: 'pointer', padding: '20px', borderRadius: 24, 
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        marginBottom: 16, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        ...cardStyle 
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span className={`badge ${clubClass}`} style={{ padding: '4px 12px', borderRadius: 8, fontSize: 9 }}>{ticket.club || '4YOU'}</span>
        <div style={{ width: 4, height: 4, borderRadius: '50%', background: priority.color || '#555' }} />
      </div>

      <h3 style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 10, lineHeight: 1.4, letterSpacing: '-0.02em' }}>
        {ticket.title}
      </h3>
      
      {ticket.subtitle && (
        <p style={{ fontSize: 12, marginBottom: 16, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1.5 }}>
          {ticket.subtitle}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <StatusTimer ticket={ticket} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
          <User size={12} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{ticket.assignee?.split(' ')[0] || '—'}</span>
        </div>
      </div>
    </div>
  );
};

// ─── Create Ticket Modal ──────────────────────────────────────────────────────
const CreateTicketModal = ({ isOpen, onClose, user, onAdd, activeClub }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [club, setClub] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assignee, setAssignee] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Identify CHEF role (more inclusive check)
  const isChef = user?.email?.toLowerCase().includes('chef') || 
                 user?.email?.toLowerCase().includes('sales5') ||
                 user?.displayName?.toLowerCase().includes('chef') ||
                 user?.displayName?.toLowerCase().includes('sales5') ||
                 user?.email === 'dilshat.r@hj.fit'; 

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setIsSubmitting(false); // сбрасываем состояние загрузки при каждом открытии
      // Default club for non-chef is 4YOU, but prefer activeClub if valid
      const initialClub = (activeClub && activeClub !== 'ВСЕ') ? activeClub : (isChef ? '' : '4YOU');
      setClub(initialClub);
      // Default assignee is the current user or a fallback
      setAssignee(user?.displayName || 'Сания (4YOU)');
    }
  }, [isOpen, isChef, user, activeClub]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !club) return;

    setIsSubmitting(true);
    try {
      await onAdd({
        title,
        description,
        club,
        priority,
        assignee,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }} onClick={onClose}>
      <div style={{
        width: 480, background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 24, padding: 32, boxShadow: 'var(--shadow-card)',
        position: 'relative'
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 24, letterSpacing: '-0.02em' }}>
          НОВАЯ ЗАЯВКА
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Клуб
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CLUBS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setClub(c)}
                  style={{
                    padding: '8px 14px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                    background: club === c ? 'var(--accent-purple)' : 'var(--bg-secondary)',
                    color: club === c ? '#fff' : 'var(--text-secondary)',
                    border: club === c ? '1px solid var(--accent-purple)' : '1px solid var(--border)',
                    cursor: 'pointer',
                    opacity: 1,
                    transition: 'all 0.15s'
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Заголовок задачи
            </label>
            <input
              className="input-app"
              style={{ width: '100%', borderRadius: 12 }}
              placeholder="Коротко о сути..."
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Срочность
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIORITIES.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPriority(p.id)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 12, fontSize: 11, fontWeight: 700,
                    background: priority === p.id ? `${p.color}20` : 'var(--bg-secondary)',
                    color: priority === p.id ? p.color : 'var(--text-muted)',
                    border: priority === p.id ? `1px solid ${p.color}40` : '1px solid var(--border)',
                    cursor: 'pointer', transition: 'all 0.15s'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Информация подробнее
            </label>
            <textarea
              className="input-app"
              style={{ width: '100%', borderRadius: 12, minHeight: 80, padding: 12, resize: 'none' }}
              placeholder="Детали задачи..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Ответственный
            </label>
            <select
              className="input-app"
              style={{ width: '100%', borderRadius: 12, cursor: 'pointer' }}
              value={assignee.split(' (')[0]}
              onChange={e => setAssignee(`${e.target.value} (${club || '?'})`)}
            >
              {MANAGERS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: '14px', borderRadius: 14, background: 'transparent', color: 'var(--text-muted)', fontWeight: 700, border: '1px solid var(--border)', cursor: 'pointer' }}
            >
              ОТМЕНА
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title || !club}
              style={{ 
                flex: 2, padding: '14px', borderRadius: 14, 
                background: isSubmitting ? 'var(--bg-secondary)' : 'var(--accent-purple)', 
                color: '#fff', fontWeight: 800, border: 'none', 
                cursor: isSubmitting ? 'not-allowed' : 'pointer', 
                boxShadow: isSubmitting ? 'none' : '0 8px 24px rgba(123,61,255,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
              }}
            >
              {isSubmitting ? (
                <>
                  <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></div>
                  СОЗДАНИЕ...
                </>
              ) : 'СОЗДАТЬ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
const KanbanColumn = ({ col, tickets, prevTicketIds }) => {
  return (
    <div className="kanban-col" style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column' }}>
      <div className="kanban-header" style={{ marginBottom: 16, padding: '0 8px' }}>
        <span style={{ color: col.color, fontWeight: 900, fontSize: 12 }}>{col.label}</span>
        <span className="col-count" style={{ marginLeft: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '2px 8px', fontSize: 10, fontWeight: 800 }}>{tickets.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {tickets.map(ticket => {
          const isNew = prevTicketIds && !prevTicketIds.has(ticket.id);
          return <TicketCard key={ticket.id} ticket={ticket} columnId={col.id} isNew={isNew} />;
        })}
        {tickets.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            ПУСТО
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const TicketsPage = () => {
  const { tickets, user, addTicket } = useTickets();
  const userClub = user?.club?.toUpperCase();

  const [activeClub,   setActiveClub]   = useState(userClub || 'ВСЕ');
  const [activeFilter, setActiveFilter] = useState('ВСЕ');
  const [search,       setSearch]       = useState('');
  const [viewMode,     setViewMode]     = useState('kanban');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [prevColIds,    setPrevColIds]    = useState(null);

  const navigate = useNavigate();

  // If user has a fixed club, ensure they stay on it
  useEffect(() => {
    if (userClub) {
      setActiveClub(userClub);
    }
  }, [userClub]);

  // Group tickets by status
  const groupedTickets = React.useMemo(() => {
    const result = { new: [], in_progress: [], paused: [], waiting: [], closed: [] };
    if (!tickets) return result;
    
    tickets.forEach(t => {
      // Filter by club first for security
      if (userClub && (t.club || '').toUpperCase() !== userClub) return;
      
      const s = t.status || 'new';
      if (result[s]) result[s].push(t);
    });
    return result;
  }, [tickets, userClub]);

  // Update prevColIds whenever groupedTickets changes (so we can detect new arrivals)
  useEffect(() => {
    const nextIds = {};
    COLUMNS.forEach(col => {
      nextIds[col.id] = new Set((groupedTickets[col.id] || []).map(t => t.id));
    });

    setPrevColIds(prev => {
      if (prev === null) return nextIds;
      return nextIds;
    });
  }, [groupedTickets]);

  // Filter logic ───────────────────────────────────────────────────────────────
  const filterTickets = useCallback((colId, colTickets) => {
    let filtered = colTickets || [];

    // Club filter (only for admins, managers are filtered at groupedTickets level)
    if (!userClub && activeClub !== 'ВСЕ') {
      filtered = filtered.filter(t => t.club === activeClub);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(t => (t.title || '').toLowerCase().includes(q));
    }

    // Status filter: hide columns that don't match
    if (activeFilter !== 'ВСЕ') {
      const targetCol = FILTER_TO_COL[activeFilter];
      if (targetCol && targetCol !== colId) return [];
    }

    // Hide closed tickets closed before today from the main board
    if (colId === 'closed') {
      const todayStart = new Date().setHours(0,0,0,0);
      filtered = filtered.filter(t => {
        if (!t.closedAt) return false;
        return new Date(t.closedAt).getTime() >= todayStart;
      });
    }

    return filtered;
  }, [activeClub, search, activeFilter, userClub]);

  const flattenedTickets = React.useMemo(() =>
    COLUMNS.flatMap(col =>
      filterTickets(col.id, groupedTickets[col.id]).map(t => ({ ...t, columnId: col.id }))
    ),
    [filterTickets, groupedTickets]
  );

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, paddingRight: 56 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, fontStyle: 'italic', color: 'var(--text-primary)', marginBottom: 4, textTransform: 'uppercase' }}>
            {userClub ? `Клуб ${userClub}` : `Все клубы: ${activeClub === 'ВСЕ' ? 'ALL' : activeClub}`}
          </h1>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            {userClub ? `📍 ЛОКАЛЬНЫЙ МОНИТОРИНГ: ${userClub}` : '📍 ГЛОБАЛЬНЫЙ МОНИТОРИНГ'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Club tabs (Only for Admins) */}
          {!userClub && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 999, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              {CLUBS_TABS.map(c => (
                <button key={c} onClick={() => setActiveClub(c)} style={{
                  padding: '6px 16px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: activeClub === c ? 'var(--accent-purple)' : 'transparent',
                  color: activeClub === c ? '#fff' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '0.02em',
                }}>{c}</button>
              ))}
            </div>
          )}
          <button
            onClick={() => setIsCreateOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
              borderRadius: 12, background: '#b275ff', color: '#fff', fontWeight: 700,
              fontSize: 12, border: 'none', cursor: 'pointer', letterSpacing: '0.02em',
              boxShadow: '0 4px 12px rgba(178,117,255,0.35)', transition: 'transform 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}
          >
            <Plus size={16} strokeWidth={3} /> СОЗДАТЬ ЗАЯВКУ
          </button>
        </div>
      </div>

      {/* Search + filters + view mode */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input-app"
            style={{ paddingLeft: 36, borderRadius: 12, width: '100%' }}
            placeholder="Поиск заявки..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setActiveFilter(f)} className={`filter-tab ${activeFilter === f ? 'active' : ''}`}>{f}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', paddingLeft: 16, borderLeft: '1px solid var(--border)' }}>
          {[['kanban', Columns, 'Доска'], ['list', List, 'Список'], ['grid', LayoutGrid, 'Сетка']].map(([mode, Icon, title]) => (
            <button key={mode} onClick={() => setViewMode(mode)} title={title} style={{
              padding: 6, borderRadius: 8, background: viewMode === mode ? 'var(--accent-purple)' : 'transparent',
              color: viewMode === mode ? '#fff' : 'var(--text-muted)', border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center',
            }}>
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>

      {/* Board */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {viewMode === 'kanban' && (
          <div style={{ display: 'flex', gap: 20, paddingBottom: 16, minWidth: '100%', overflowX: 'auto' }}>
            {COLUMNS.map(col => {
              const colTickets = filterTickets(col.id, groupedTickets[col.id]);
              return (
                <KanbanColumn
                  key={col.id}
                  col={col}
                  tickets={colTickets}
                  prevTicketIds={prevColIds?.[col.id]}
                />
              );
            })}
          </div>
        )}

        {viewMode === 'grid' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, paddingBottom: 20 }}>
            {flattenedTickets.map(t => <TicketCard key={t.id} ticket={t} columnId={t.columnId} />)}
            {flattenedTickets.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Нет заявок</div>
            )}
          </div>
        )}

        {viewMode === 'list' && (
          <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 20 }}>
            {flattenedTickets.map(t => <TicketCard key={t.id} ticket={t} columnId={t.columnId} isList />)}
            {flattenedTickets.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Нет заявок</div>
            )}
          </div>
        )}
      </div>
      {/* Create Modal */}
      <CreateTicketModal 
        isOpen={isCreateOpen} 
        onClose={() => setIsCreateOpen(false)}
        user={user}
        onAdd={addTicket}
        activeClub={activeClub}
      />
    </div>
  );
};

export default TicketsPage;
