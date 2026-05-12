import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Archive as ArchiveIcon } from 'lucide-react';
import { useTickets } from '../store/TicketContext';

const clubColors = {
  '4YOU': 'badge-4you',
  'COLIBRI': 'badge-colibri',
  'VILLA': 'badge-villa',
  'NURLY ORDA': 'badge-nurly',
  'PRIME': 'badge-prime',
};

const priorityLabels = {
  critical: { label: 'Критический', cls: 'priority-critical' },
  high: { label: 'Высокий', cls: 'priority-high' },
  medium: { label: 'Средний', cls: 'priority-medium' },
  low: { label: 'Низкий', cls: 'priority-low' },
};

// Mock user's club (in a real app, this would come from the auth context)
const USER_CLUB = '4YOU';

const ArchivePage = () => {
  const [search, setSearch] = useState('');
  const { tickets } = useTickets();
  const navigate = useNavigate();

  // Use tickets from context directly
  const allTickets = tickets || [];

  // Define what "archived" means: closed tickets that were not closed today.
  // For demo purposes, we will treat ALL closed tickets that have a `closedAt` date older than 24h as archived.
  // If `closedAt` is missing, we'll just show them in the archive for the demo if they are closed.
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

  // Filter by User's Club
  archivedTickets = archivedTickets.filter(t => t.club === USER_CLUB);

  if (search) {
    archivedTickets = archivedTickets.filter(t => t.title.toLowerCase().includes(search.toLowerCase()));
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
            <span style={{ color: 'var(--accent-purple)' }}>📍</span> ДОСТУП: КЛУБ {USER_CLUB}
          </p>
        </div>
      </div>

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
