import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Archive as ArchiveIcon } from 'lucide-react';
import { useTickets } from '../store/TicketContext';

const clubColors = {
  '4YOU': 'badge-4you',
  'COLIBRI': 'badge-colibri',
  'VILLA': 'badge-villa',
  'NURLY ORDA': 'badge-nurly',
  'PROMENADE': 'badge-promenade',
  'EUROPE CITY': 'badge-europe',
  'PRIME': 'badge-prime',
};

const priorityLabels = {
  critical: { label: 'Критический', cls: 'priority-critical', color: '#B06A6A' },
  high: { label: 'Высокий', cls: 'priority-high', color: '#BF8055' },
  medium: { label: 'Средний', cls: 'priority-medium', color: '#C4A75A' },
  low: { label: 'Низкий', cls: 'priority-low', color: '#5F9C81' },
};

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];

const ArchivePage = () => {
  const [search, setSearch] = useState('');
  const [clubFilter, setClubFilter] = useState('ALL');
  const { tickets, user } = useTickets();
  const navigate = useNavigate();

  const userClub = user?.club?.toUpperCase();

  // Use tickets from context directly
  const allTickets = tickets || [];

  const todayStart = new Date().setHours(0,0,0,0);
  
  let archivedTickets = allTickets.filter(t => {
    if (t.status !== 'closed') return false;
    
    // Archive logic: if it was closed before today, it's archived.
    if (t.closedAt) {
      const closedDate = new Date(t.closedAt).setHours(0,0,0,0);
      return closedDate < todayStart;
    }
    
    // Fallback: if no date, show it in archive if closed
    return true; 
  });

  // Filter by User's Club if restricted; иначе — по выбранной кнопке клуба
  if (userClub) {
    archivedTickets = archivedTickets.filter(t => (t.club || '').toUpperCase() === userClub);
  } else if (clubFilter !== 'ALL') {
    archivedTickets = archivedTickets.filter(t => (t.club || '').toUpperCase() === clubFilter);
  }

  if (search) {
    archivedTickets = archivedTickets.filter(t => (t.title || '').toLowerCase().includes(search.toLowerCase()));
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold italic flex items-center gap-2 mb-1" style={{ color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              <ArchiveIcon size={20} strokeWidth={2.5} />
            </span>
            АРХИВ
          </h1>
          <p className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            <span style={{ color: 'var(--accent-purple)' }}>📍</span> ДОСТУП: {userClub ? `КЛУБ ${userClub}` : 'ВСЕ КЛУБЫ'}
          </p>
        </div>
      </div>

      {/* Фильтр по клубам (у запертых на клубе не показывается) */}
      {!userClub && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {['ALL', ...CLUBS].map(c => (
            <button
              key={c}
              onClick={() => setClubFilter(c)}
              style={{
                padding: '8px 16px', borderRadius: 12, cursor: 'pointer',
                fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                background: clubFilter === c ? 'var(--accent-purple)' : 'var(--bg-card)',
                color: clubFilter === c ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${clubFilter === c ? 'var(--accent-purple)' : 'var(--border)'}`,
                transition: 'all 0.2s',
              }}
            >
              {c === 'ALL' ? 'Все' : c}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative flex-1 max-w-lg">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            className="input-app w-full pl-10"
            placeholder="Поиск по архиву..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ borderRadius: '12px' }}
          />
        </div>
      </div>

      {/* Archive List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {archivedTickets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <ArchiveIcon size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
            <p>В архиве вашего клуба пока нет заявок.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', paddingBottom: '40px' }}>
            {archivedTickets.map(ticket => {
              const clubClass = clubColors[ticket.club] || 'badge-4you';
              const priority = priorityLabels[ticket.priority] || priorityLabels.medium;
              
              return (
                <div
                  key={ticket.id}
                  className="ticket-card"
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  style={{ 
                    cursor: 'pointer', padding: '24px', borderRadius: '24px', 
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    transition: 'all 0.3s ease',
                    opacity: 0.85
                  }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className={`badge ${clubClass}`} style={{ padding: '4px 12px', borderRadius: 8, fontSize: 9 }}>{ticket.club || '4YOU'}</span>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: priority.color || '#555' }} />
                  </div>
                  <h3 className="font-bold text-[15px] leading-snug mb-4 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    {ticket.title}
                  </h3>
                  <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                      Закрыто: {ticket.closedAt ? new Date(ticket.closedAt).toLocaleDateString() : 'Давно'}
                    </span>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--bg-hover)] border border-[var(--border)]">
                       <div className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                       <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>АРХИВ</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ArchivePage;
