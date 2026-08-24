import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, Clock, Play, CheckCircle, LayoutGrid, List, Columns, Timer, CircleDot, Pause, User, ChevronRight, CalendarClock } from 'lucide-react';
import { useTickets, USER_ROLES } from '../store/TicketContext';
import { isMobileDevice } from '../lib/isMobile';

const CLUBS_TABS = ['ВСЕ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];
const FILTERS    = ['ВСЕ', 'ЗАПЛАНИРОВАННЫЕ', 'В РАБОТЕ', 'ПАУЗА', 'ОЖИДАНИЕ', 'ЗАКРЫТО'];

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];
const PRIORITIES = [
  { id: 'critical', label: 'Критический', color: '#ff4444' },
  { id: 'high',     label: 'Высокий',     color: '#BF8055' },
  { id: 'medium',   label: 'Средний',     color: '#C4A75A' },
  { id: 'low',      label: 'Низкий',      color: '#5F9C81' },
];

// Manager list is derived from USER_ROLES — no static list needed here.
// Managers are filtered by club inside CreateTicketModal.

const COLUMNS = [
  { id: 'scheduled',   label: 'ЗАПЛАНИРОВАННЫЕ', color: '#7A94B8' },
  { id: 'in_progress', label: 'В РАБОТЕ', color: '#5F9C81' },
  { id: 'paused',      label: 'НА ПАУЗЕ', color: '#C08F4F' },
  { id: 'waiting',     label: 'ОЖИДАНИЕ', color: '#9b5de5' },
  { id: 'closed',      label: 'ЗАКРЫТО',  color: '#55556a' },
];

const FILTER_TO_COL = {
  'ЗАПЛАНИРОВАННЫЕ': 'scheduled', 'В РАБОТЕ': 'in_progress',
  'ПАУЗА': 'paused', 'ОЖИДАНИЕ': 'waiting', 'ЗАКРЫТО': 'closed',
};

const clubColors = {
  '4YOU': 'badge-4you', 'COLIBRI': 'badge-colibri',
  'VILLA': 'badge-villa', 'NURLY ORDA': 'badge-nurly', 'PROMENADE': 'badge-promenade',
  'EUROPE CITY': 'badge-europe'
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
      if (diff < 60)     return setElapsed(`${diff}с`);
      if (diff < 3600)   return setElapsed(`${Math.floor(diff / 60)}мин`);
      if (diff < 86400)  {
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        return setElapsed(m > 0 ? `${h}ч ${m}мин` : `${h}ч`);
      }
      // >= 24 часов: показываем дни + оставшиеся часы
      const days  = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      return setElapsed(hours > 0 ? `${days}д ${hours}ч` : `${days}д`);
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

  // У запланированных — бейдж даты вместо таймера; у закрытых таймер не тикает
  if (!since || !elapsed || status === 'scheduled' || status === 'closed') return null;

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

      {ticket.status === 'scheduled' && ticket.scheduledFor && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '4px 10px', borderRadius: 10, background: 'rgba(122,148,184,0.1)', border: '1px solid rgba(122,148,184,0.25)', fontSize: 10, fontWeight: 800, color: '#7A94B8' }}>
          <CalendarClock size={11} />
          {(() => { try { const [y, m, d] = ticket.scheduledFor.split('-'); return `${d}.${m}.${y}`; } catch { return ticket.scheduledFor; } })()}
          {ticket.scheduledTime ? ` · ${ticket.scheduledTime}` : ''}
        </div>
      )}

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

// ─── Мобильная карточка заявки: заголовок, клуб, приоритет-точка, таймер, исполнитель ──
const MobileTicketCard = ({ ticket, columnId, showStatus = false }) => {
  const navigate  = useNavigate();
  const clubClass = clubColors[ticket.club] || 'badge-4you';
  const priority  = priorityLabels[ticket.priority] || priorityLabels.medium;
  // Цвет точки приоритета берём из PRIORITIES (в priorityLabels цвета нет)
  const pColor    = (PRIORITIES.find(p => p.id === ticket.priority) || {}).color || '#666';
  const col       = COLUMNS.find(c => c.id === columnId);

  return (
    <div
      className="ticket-card"
      onClick={() => navigate(`/tickets/${ticket.id}`)}
      style={{
        cursor: 'pointer', padding: '12px 14px', borderRadius: 14, marginBottom: 8,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className={`badge ${clubClass}`} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 8.5 }}>{ticket.club || '4YOU'}</span>
        {/* При фильтре «ВСЕ» показываем статус на карточке */}
        {showStatus && col && (
          <span style={{ fontSize: 9, fontWeight: 800, color: col.color, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{col.label}</span>
        )}
        <div title={priority.label} style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: pColor, flexShrink: 0 }} />
      </div>

      <h3 style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.35, letterSpacing: '-0.01em', margin: 0 }}>
        {ticket.title}
      </h3>

      {ticket.status === 'scheduled' && ticket.scheduledFor && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '3px 8px', borderRadius: 8, background: 'rgba(122,148,184,0.1)', border: '1px solid rgba(122,148,184,0.25)', fontSize: 9.5, fontWeight: 800, color: '#7A94B8' }}>
          <CalendarClock size={10} />
          {(() => { try { const [y, m, d] = ticket.scheduledFor.split('-'); return `${d}.${m}.${y}`; } catch { return ticket.scheduledFor; } })()}
          {ticket.scheduledTime ? ` · ${ticket.scheduledTime}` : ''}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8 }}>
        <StatusTimer ticket={ticket} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          <User size={11} />
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>{ticket.assignee?.split(' ')[0] || '—'}</span>
        </div>
      </div>
    </div>
  );
};

// ─── Create Ticket Modal ──────────────────────────────────────────────────────
const CreateTicketModal = ({ isOpen, onClose, user, onAdd, activeClub, isMobile = false }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [club, setClub] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assignee, setAssignee] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isChef = user?.role === 'chef';

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setTitle('');
      setDescription('');
      setPriority('medium');
      setIsSubmitting(false);
      // Priority: 1. User's fixed club, 2. Active filter club, 3. Default (Chef gets empty, others 4YOU)
      const initialClub = user?.club || ((activeClub && activeClub !== 'ВСЕ') ? activeClub : (isChef ? '' : '4YOU'));
      setClub(initialClub);
      setAssignee(user?.displayName || 'Анастасия');
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
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

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        // На мобильном — нижняя шторка; на десктопе — как было
        alignItems: isMobile ? 'flex-end' : 'flex-start',
        justifyContent: 'center',
        padding: isMobile ? 0 : '20px 16px 32px',
        overflowY: isMobile ? 'hidden' : 'auto',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 520,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: isMobile ? '20px 20px 0 0' : 28,
          padding: isMobile ? '20px 16px calc(24px + env(safe-area-inset-bottom))' : '32px',
          maxHeight: isMobile ? '92dvh' : undefined,
          overflowY: isMobile ? 'auto' : undefined,
          boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          animation: 'modal-pop 0.22s cubic-bezier(0.34,1.56,0.64,1)',
          flexShrink: 0
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 24, letterSpacing: '-0.02em' }}>
          НОВАЯ ЗАЯВКА
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Клуб
            </label>
            {user?.club ? (
              <div style={{ padding: '10px 16px', borderRadius: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--accent-purple)' }}>
                {user.club.toUpperCase()}
              </div>
            ) : (
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
                      transition: 'all 0.15s'
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
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
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Срочность
            </label>
            {/* На мобильном 4 кнопки не влезают в ряд — переносим 2×2 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: isMobile ? 'wrap' : undefined }}>
              {PRIORITIES.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPriority(p.id)}
                  style={{
                    flex: 1, minWidth: isMobile ? 'calc(50% - 4px)' : undefined,
                    padding: '10px 0', minHeight: isMobile ? 40 : undefined, borderRadius: 12, fontSize: 11, fontWeight: 700,
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
              {/* All registered users from USER_ROLES, filtered by selected club.
                  Chefs (club=null) always appear as they can handle any club. */}
              {Object.entries(USER_ROLES)
                .filter(([, u]) => !club || u.club === club || u.club === null)
                // deduplicate by displayName
                .filter(([, u], i, arr) => arr.findIndex(([, x]) => x.displayName === u.displayName) === i)
                .sort(([, a], [, b]) => a.displayName.localeCompare(b.displayName, 'ru'))
                .map(([email, u]) => (
                  <option key={email} value={u.displayName}>
                    {u.displayName}{u.club ? ` (${u.club})` : u.role === 'chef' ? ' (CHEF)' : ''}
                  </option>
                ))
              }
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
                boxShadow: isSubmitting ? 'none' : '0 8px 24px rgba(125,111,179,0.3)',
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
    </div>,
    document.body
  );
};
// ─── Schedule Ticket Modal ────────────────────────────────────────────────────
const ScheduleTicketModal = ({ isOpen, onClose, user, onAdd, activeClub, isMobile = false }) => {
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [club,        setClub]        = useState('');
  const [priority,    setPriority]    = useState('medium');
  const [assignee,    setAssignee]    = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [scheduledTime, setScheduledTime] = useState(''); // необязательно: время появления в этот день
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isChef = user?.role === 'chef';
  // Даты ЛОКАЛЬНЫЕ (не toISOString/UTC): ночью 00:00–05:00 по Алматы UTC-дата
  // ещё «вчера» — «завтра» превращалось в «сегодня», и запланированная заявка
  // активировалась сразу же после создания.
  const localDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayStr = localDateStr(new Date());
  const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return localDateStr(d); })();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setTitle(''); setDescription(''); setPriority('medium'); setIsSubmitting(false);
      setScheduledFor(tomorrowStr); setScheduledTime('');
      const initialClub = user?.club || ((activeClub && activeClub !== 'ВСЕ') ? activeClub : (isChef ? '' : '4YOU'));
      setClub(initialClub);
      setAssignee(user?.displayName || 'Анастасия');
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, isChef, user, activeClub]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !club || !scheduledFor) return;
    setIsSubmitting(true);
    try {
      // Сегодня + время в будущем → тоже «запланирована» (появится через несколько часов)
      const pad = (n) => String(n).padStart(2, '0');
      const nowD = new Date();
      const nowHM = `${pad(nowD.getHours())}:${pad(nowD.getMinutes())}`;
      const isFuture = scheduledFor > todayStr || (scheduledFor === todayStr && scheduledTime && scheduledTime > nowHM);
      await onAdd({
        title, description, club, priority, assignee,
        scheduledFor,
        scheduledTime: scheduledTime || null,
        status: isFuture ? 'scheduled' : 'new',
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'flex-start', justifyContent: 'center', padding: isMobile ? 0 : '8px 16px 32px', overflowY: isMobile ? 'hidden' : 'auto', WebkitOverflowScrolling: 'touch' }}
    >
      {/* На мобильном — нижняя шторка со своим внутренним скроллом */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: isMobile ? '100%' : 520, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? '20px 20px 0 0' : 28, padding: isMobile ? '20px 16px calc(24px + env(safe-area-inset-bottom))' : '32px', maxHeight: isMobile ? '92dvh' : undefined, overflowY: isMobile ? 'auto' : undefined, boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)', animation: 'modal-pop 0.22s cubic-bezier(0.34,1.56,0.64,1)', flexShrink: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <CalendarClock size={20} style={{ color: '#7A94B8' }} />
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            ЗАПЛАНИРОВАТЬ ЗАДАЧУ
          </h2>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Клуб */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Клуб</label>
            {user?.club ? (
              <div style={{ padding: '10px 16px', borderRadius: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--accent-purple)' }}>{user.club.toUpperCase()}</div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CLUBS.map(c => (
                  <button key={c} type="button" onClick={() => setClub(c)}
                    style={{ padding: '8px 14px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: club === c ? 'var(--accent-purple)' : 'var(--bg-secondary)', color: club === c ? '#fff' : 'var(--text-secondary)', border: club === c ? '1px solid var(--accent-purple)' : '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s' }}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Дата появления */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Дата появления в «Новых»
            </label>
            <input
              type="date"
              className="input-app"
              style={{ width: '100%', borderRadius: 12, border: '1.5px solid rgba(122,148,184,0.4)', color: '#7A94B8', fontWeight: 800 }}
              min={todayStr}
              value={scheduledFor}
              onChange={e => setScheduledFor(e.target.value)}
              required
            />
            {scheduledFor === todayStr && !scheduledTime && (
              <p style={{ fontSize: 11, color: '#C08F4F', fontWeight: 600, marginTop: 6, marginBottom: 0 }}>
                Сегодня — задача появится сразу в «Новых»
              </p>
            )}
          </div>

          {/* Время появления (необязательно) */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Время появления <span style={{ opacity: 0.6, textTransform: 'none' }}>(необязательно)</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="time"
                className="input-app"
                style={{ borderRadius: 12, border: '1.5px solid rgba(122,148,184,0.4)', color: '#7A94B8', fontWeight: 800, width: 140 }}
                value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
              />
              {scheduledTime && (
                <button type="button" onClick={() => setScheduledTime('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                  Сбросить
                </button>
              )}
            </div>
            <p style={{ fontSize: 11, color: scheduledTime ? '#7A94B8' : 'var(--text-muted)', fontWeight: 600, marginTop: 6, marginBottom: 0 }}>
              {scheduledTime
                ? `Задача появится в «Новых» ${scheduledFor === todayStr ? 'сегодня' : scheduledFor} в ${scheduledTime}, менеджерам придёт уведомление`
                : 'Без времени — задача появится в начале дня'}
            </p>
          </div>

          {/* Заголовок */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Заголовок задачи</label>
            <input className="input-app" style={{ width: '100%', borderRadius: 12 }} placeholder="Коротко о сути..." value={title} onChange={e => setTitle(e.target.value)} required />
          </div>

          {/* Срочность */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Срочность</label>
            {/* На мобильном кнопки срочности 2×2 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: isMobile ? 'wrap' : undefined }}>
              {PRIORITIES.map(p => (
                <button key={p.id} type="button" onClick={() => setPriority(p.id)}
                  style={{ flex: 1, minWidth: isMobile ? 'calc(50% - 4px)' : undefined, padding: '10px 0', minHeight: isMobile ? 40 : undefined, borderRadius: 12, fontSize: 11, fontWeight: 700, background: priority === p.id ? `${p.color}20` : 'var(--bg-secondary)', color: priority === p.id ? p.color : 'var(--text-muted)', border: priority === p.id ? `1px solid ${p.color}40` : '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s' }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Описание */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Информация подробнее</label>
            <textarea className="input-app" style={{ width: '100%', borderRadius: 12, minHeight: 80, padding: 12, resize: 'none' }} placeholder="Детали задачи..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          {/* Ответственный */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Ответственный</label>
            <select className="input-app" style={{ width: '100%', borderRadius: 12, cursor: 'pointer' }} value={assignee.split(' (')[0]} onChange={e => setAssignee(`${e.target.value} (${club || '?'})`)}>
              {Object.entries(USER_ROLES)
                .filter(([, u]) => !club || u.club === club || u.club === null)
                .filter(([, u], i, arr) => arr.findIndex(([, x]) => x.displayName === u.displayName) === i)
                .sort(([, a], [, b]) => a.displayName.localeCompare(b.displayName, 'ru'))
                .map(([email, u]) => (
                  <option key={email} value={u.displayName}>
                    {u.displayName}{u.club ? ` (${u.club})` : u.role === 'chef' ? ' (CHEF)' : ''}
                  </option>
                ))
              }
            </select>
          </div>

          {/* Кнопки */}
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '14px', borderRadius: 14, background: 'transparent', color: 'var(--text-muted)', fontWeight: 700, border: '1px solid var(--border)', cursor: 'pointer' }}>
              ОТМЕНА
            </button>
            <button type="submit" disabled={isSubmitting || !title || !club || !scheduledFor}
              style={{ flex: 2, padding: '14px', borderRadius: 14, background: isSubmitting ? 'var(--bg-secondary)' : 'rgba(122,148,184,0.15)', color: isSubmitting ? 'var(--text-muted)' : '#7A94B8', fontWeight: 800, border: '1.5px solid rgba(122,148,184,0.4)', cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {isSubmitting ? (
                <><div style={{ width: 14, height: 14, border: '2px solid rgba(122,148,184,0.3)', borderTop: '2px solid #7A94B8', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></div>СОХРАНЕНИЕ...</>
              ) : (
                <><CalendarClock size={15} />ЗАПЛАНИРОВАТЬ</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
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

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeClub,   setActiveClub]   = useState(() => userClub || searchParams.get('club') || 'ВСЕ');
  // Автофильтры из URL (переход из Операционного центра): ?filter=В РАБОТЕ / ?priority=critical / ?q=имя
  const [activeFilter, setActiveFilter] = useState(() => { const f = searchParams.get('filter'); return f && FILTERS.includes(f) ? f : 'ВСЕ'; });
  const [priorityFilter, setPriorityFilter] = useState(() => searchParams.get('priority') || '');
  const [search,       setSearch]       = useState(() => searchParams.get('q') || '');
  const [viewMode,     setViewMode]     = useState('kanban');
  const [isCreateOpen,   setIsCreateOpen]   = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [prevColIds,    setPrevColIds]    = useState(null);

  // Мобильный режим — только визуальная ветка, логика/данные не меняются
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const navigate = useNavigate();

  // ?create=1 (кнопка «+» в мобильной навигации) → сразу открываем создание
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setIsCreateOpen(true);
      setSearchParams(p => { p.delete('create'); return p; }, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist active club in URL so returning from ticket detail restores it
  useEffect(() => {
    if (!userClub) {
      setSearchParams(p => { p.set('club', activeClub); return p; }, { replace: true });
    }
  }, [activeClub, userClub, setSearchParams]);

  // If user has a fixed club, ensure they stay on it
  useEffect(() => {
    if (userClub) {
      setActiveClub(userClub);
    }
  }, [userClub]);

  // Минутный тикер — чтобы запланированная «на сегодня в 15:00» появилась на доске вовремя
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setNowTick(t => t + 1), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Group tickets by status
  const groupedTickets = React.useMemo(() => {
    const result = { scheduled: [], in_progress: [], paused: [], waiting: [], closed: [] };
    if (!tickets) return result;
    const pad = (n) => String(n).padStart(2, '0');
    const nowD = new Date();
    const todayStr = `${nowD.getFullYear()}-${pad(nowD.getMonth() + 1)}-${pad(nowD.getDate())}`;
    const nowHM = `${pad(nowD.getHours())}:${pad(nowD.getMinutes())}`;

    tickets.forEach(t => {
      // Filter by club first for security
      if (userClub && (t.club || '').toUpperCase() !== userClub) return;

      let s = t.status || 'in_progress';
      // «Новых» больше нет: заявка сразу считается в работе (легаси-статус тоже мапится)
      if (s === 'new') s = 'in_progress';
      if (s === 'scheduled') {
        const future = t.scheduledFor && (
          t.scheduledFor > todayStr ||
          (t.scheduledFor === todayStr && t.scheduledTime && t.scheduledTime > nowHM)
        );
        // Будущие — видны в колонке «Запланированные»; наступившие — сразу «В работе»
        if (!future) s = 'in_progress';
      }
      // Неизвестный статус (опечатка/ручная правка в базе) — НЕ теряем заявку,
      // показываем в «В работе», иначе она исчезала из всех колонок и архива
      if (!result[s]) s = 'in_progress';
      result[s].push(t);
    });
    // Запланированные — ближайшие сверху
    result.scheduled.sort((a, b) => `${a.scheduledFor || ''}${a.scheduledTime || ''}`.localeCompare(`${b.scheduledFor || ''}${b.scheduledTime || ''}`));
    return result;
  }, [tickets, userClub, nowTick]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // ignoreStatus=true — для счётчиков в мобильных чипах статусов (все фильтры, кроме статусного)
  const filterTickets = useCallback((colId, colTickets, ignoreStatus = false) => {
    let filtered = colTickets || [];

    // Club filter (only for admins, managers are filtered at groupedTickets level)
    if (!userClub && activeClub !== 'ВСЕ') {
      filtered = filtered.filter(t => t.club === activeClub);
    }

    // Search (по названию И по исполнителю — чтобы из дашборда открывать задачи менеджера)
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(t => (t.title || '').toLowerCase().includes(q) || (t.assignee || '').toLowerCase().includes(q));
    }

    // Status filter: hide columns that don't match
    if (!ignoreStatus && activeFilter !== 'ВСЕ') {
      const targetCol = FILTER_TO_COL[activeFilter];
      if (targetCol && targetCol !== colId) return [];
    }

    // Priority filter (напр. «Критические» из Операционного центра) — только не закрытые
    if (priorityFilter) {
      if (colId === 'closed') return [];
      filtered = filtered.filter(t => (t.priority || '') === priorityFilter);
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
  }, [activeClub, search, activeFilter, priorityFilter, userClub]);

  const flattenedTickets = React.useMemo(() =>
    COLUMNS.flatMap(col =>
      filterTickets(col.id, groupedTickets[col.id]).map(t => ({ ...t, columnId: col.id }))
    ),
    [filterTickets, groupedTickets]
  );

  // Счётчики для мобильных чипов статусов: все фильтры, кроме статусного
  const mobileCounts = React.useMemo(() => {
    const counts = {};
    COLUMNS.forEach(col => { counts[col.id] = filterTickets(col.id, groupedTickets[col.id], true).length; });
    counts.all = COLUMNS.reduce((s, c) => s + counts[c.id], 0);
    return counts;
  }, [filterTickets, groupedTickets]);

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {isMobile ? (
        <>
          {/* ── МОБИЛЬНАЯ ВЕРСИЯ: шапка ── */}
          <div style={{ marginBottom: 12 }}>
            <h1 style={{ fontSize: 19, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
              {userClub ? `Клуб ${userClub}` : 'Заявки'}
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: '3px 0 0' }}>
              {userClub ? `📍 ЛОКАЛЬНЫЙ МОНИТОРИНГ: ${userClub}` : `📍 ГЛОБАЛЬНЫЙ МОНИТОРИНГ${activeClub !== 'ВСЕ' ? `: ${activeClub}` : ''}`}
            </p>
          </div>

          {/* Крупные кнопки: создать + запланировать */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={() => setIsCreateOpen(true)} style={{
              flex: 1.6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              minHeight: 48, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'var(--accent-purple)', color: '#fff', fontWeight: 800, fontSize: 13,
              letterSpacing: '0.04em', boxShadow: '0 8px 24px rgba(125,111,179,0.3)',
            }}>
              <Plus size={18} strokeWidth={3} /> СОЗДАТЬ ЗАЯВКУ
            </button>
            <button onClick={() => setIsScheduleOpen(true)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              minHeight: 48, borderRadius: 12, cursor: 'pointer',
              background: 'transparent', border: '1.5px solid rgba(122,148,184,0.45)',
              color: '#7A94B8', fontWeight: 800, fontSize: 12, letterSpacing: '0.02em',
            }}>
              <CalendarClock size={15} strokeWidth={2.5} /> ПЛАН
            </button>
          </div>

          {/* Поиск */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input-app"
              placeholder="Поиск заявки..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', borderRadius: 12, padding: '10px 12px 10px 34px', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          {/* Фильтры клуба — горизонтальная лента чипов (только для админов без фикс. клуба) */}
          {!userClub && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 4, WebkitOverflowScrolling: 'touch' }}>
              {CLUBS_TABS.map(c => (
                <button key={c} onClick={() => setActiveClub(c)} style={{
                  padding: '8px 14px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0,
                  fontSize: 11, fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
                  background: activeClub === c ? 'var(--accent-purple)' : 'var(--bg-card)',
                  color: activeClub === c ? '#fff' : 'var(--text-secondary)',
                  border: activeClub === c ? '1px solid var(--accent-purple)' : '1px solid var(--border)',
                }}>{c}</button>
              ))}
            </div>
          )}

          {/* Лента чипов-статусов со счётчиками — вместо горизонтального канбана */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8, WebkitOverflowScrolling: 'touch' }}>
            {FILTERS.map(f => {
              const colId  = FILTER_TO_COL[f];
              const col    = COLUMNS.find(c => c.id === colId);
              const color  = col ? col.color : '#7D6FB3'; // «ВСЕ» — приглушённый фиолетовый
              const count  = colId ? mobileCounts[colId] : mobileCounts.all;
              const active = activeFilter === f;
              return (
                <button key={f} onClick={() => { setActiveFilter(f); setPriorityFilter(''); }} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0,
                  fontSize: 11, fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
                  background: active ? `${color}20` : 'var(--bg-card)',
                  border: `1px solid ${active ? color : 'var(--border)'}`,
                  color: active ? color : 'var(--text-secondary)',
                }}>
                  {f}
                  <span style={{ fontSize: 9.5, fontWeight: 900, padding: '1px 6px', borderRadius: 999, background: active ? `${color}25` : 'var(--bg-hover)', color: active ? color : 'var(--text-muted)' }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Вертикальный список карточек выбранного статуса */}
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
            {flattenedTickets.map(t => (
              <MobileTicketCard key={t.id} ticket={t} columnId={t.columnId} showStatus={activeFilter === 'ВСЕ'} />
            ))}
            {flattenedTickets.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Нет заявок</div>
            )}
          </div>
        </>
      ) : (
      <>
      {/* Page header */}
      <div className="page-header-container">
        <div className="page-title-section">
          <h1 className="page-title">
            {userClub ? `Клуб ${userClub}` : `Все клубы: ${activeClub === 'ВСЕ' ? 'ALL' : activeClub}`}
          </h1>
          <p className="page-subtitle">
            {userClub ? `📍 ЛОКАЛЬНЫЙ МОНИТОРИНГ: ${userClub}` : '📍 ГЛОБАЛЬНЫЙ МОНИТОРИНГ'}
          </p>
        </div>
        <div className="header-actions">
          {/* Club tabs (Only for Admins) */}
          {!userClub && (
            <div className="club-tabs-wrapper">
              {CLUBS_TABS.map(c => (
                <button 
                  key={c} 
                  onClick={() => setActiveClub(c)} 
                  className={`club-tab-btn ${activeClub === c ? 'active' : ''}`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setIsScheduleOpen(true)}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 14,
              background: 'transparent',
              border: '1.5px solid rgba(122,148,184,0.45)',
              color: '#7A94B8', fontWeight: 800, fontSize: 12,
              cursor: 'pointer', letterSpacing: '0.04em',
              transition: 'all 0.15s',
            }}
          >
            <CalendarClock size={15} strokeWidth={2.5} /> ЗАПЛАНИРОВАТЬ
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="btn-create-ticket"
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}
          >
            <Plus size={16} strokeWidth={3} /> СОЗДАТЬ ЗАЯВКУ
          </button>
        </div>
      </div>

      {/* Search + filters + view mode */}
      <div className="tickets-toolbar-container">
        <div className="search-box-wrapper">
          <Search size={15} className="search-icon" />
          <input
            className="input-app search-input"
            placeholder="Поиск заявки..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-tabs-container">
          {FILTERS.map(f => (
            <button key={f} onClick={() => { setActiveFilter(f); setPriorityFilter(''); }} className={`filter-tab ${activeFilter === f ? 'active' : ''}`}>{f}</button>
          ))}
        </div>
        <div className="view-mode-container">
          {[['kanban', Columns, 'Доска'], ['list', List, 'Список'], ['grid', LayoutGrid, 'Сетка']].map(([mode, Icon, title]) => (
            <button 
              key={mode} 
              onClick={() => setViewMode(mode)} 
              title={title} 
              className={`view-mode-btn ${viewMode === mode ? 'active' : ''}`}
            >
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
      </>
      )}
      {/* Create Modal */}
      <CreateTicketModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        user={user}
        onAdd={addTicket}
        activeClub={activeClub}
        isMobile={isMobile}
      />
      <ScheduleTicketModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        user={user}
        onAdd={addTicket}
        activeClub={activeClub}
        isMobile={isMobile}
      />
    </div>
  );
};

export default TicketsPage;
