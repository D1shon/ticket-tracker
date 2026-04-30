import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Archive as ArchiveIcon } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { DEMO_TICKETS } from './TicketsPage';

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

  // Combine real tickets or fallback to demo
  let allTickets = [];
  if (tickets && tickets.length > 0) {
    allTickets = tickets;
  } else {
    // Flatten DEMO_TICKETS
    allTickets = [
      ...DEMO_TICKETS.new.map(t => ({...t, status: 'new'})),
      ...DEMO_TICKETS.in_progress.map(t => ({...t, status: 'in_progress'})),
      ...DEMO_TICKETS.paused.map(t => ({...t, status: 'paused'})),
      ...DEMO_TICKETS.waiting.map(t => ({...t, status: 'waiting'})),
      ...DEMO_TICKETS.closed.map(t => ({...t, status: 'closed'})),
    ];
  }

  // Define what "archived" means: closed tickets that were not closed today.
  // For demo purposes, we will treat ALL closed tickets that have a `closedAt` date older than 24h as archived.
  // If `closedAt` is missing, we'll just show them in the archive for the demo if they are closed.
  const now = new Date();
  
  let archivedTickets = allTickets.filter(t => {
    if (t.status !== 'closed') return false;
    
    // Simulate archive logic: if it was closed today, it stays on the main board.
    // If it was closed before today, it's archived.
    if (t.closedAt) {
      const closedDate = new Date(t.closedAt);
      const diffHours = (now - closedDate) / (1000 * 60 * 60);
      return diffHours > 24;
    }
    
    // If no closedAt, assume it's archived for demo
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px', paddingBottom: '20px' }}>
            {archivedTickets.map(ticket => {
              const clubClass = clubColors[ticket.club] || 'badge-4you';
              const priority = priorityLabels[ticket.priority] || priorityLabels.medium;
              
              return (
                <div
                  key={ticket.id}
                  className="ticket-card"
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  style={{ cursor: 'pointer', opacity: 0.8 }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`badge ${clubClass}`}>{ticket.club || '4YOU'}</span>
                    <span className={`badge ${priority.cls} ml-auto`}>{priority.label}</span>
                  </div>
                  <h3 className="font-semibold text-sm leading-snug mb-4" style={{ color: 'var(--text-primary)' }}>
                    {ticket.title}
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Закрыто: {ticket.closedAt ? new Date(ticket.closedAt).toLocaleDateString() : 'Давно'}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 4 }}>АРХИВ</span>
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
