import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTickets } from '../store/TicketContext';
import { Users, TrendingUp, Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, subDays, parseISO, isWithinInterval } from 'date-fns';
import { ru } from 'date-fns/locale';

const CLUB_COLORS = {
  'HJ 4YOU':        '#7B3DFF',
  'HJ Colibri':     '#3b82f6',
  'HJ Villa':       '#22c55e',
  'HJ Nurly Orda':  '#f59e0b',
  'HJ Europe City': '#ec4899',
  'HJ Promenade':   '#14b8a6',
};

const CLUB_MAP = {
  '4YOU':       'HJ 4YOU',
  'COLIBRI':    'HJ Colibri',
  'VILLA':      'HJ Villa',
  'NURLY ORDA': 'HJ Nurly Orda',
};

const today     = format(new Date(), 'yyyy-MM-dd');
const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

// Aggregate daily_history rows into per-club totals for a date range
function aggregate(data, from, to) {
  const totals = {};
  for (const day of data) {
    if (day.date < from || day.date > to) continue;
    for (const c of day.clubs) {
      totals[c.name] = (totals[c.name] ?? 0) + c.visits;
    }
  }
  return Object.entries(totals).map(([name, visits]) => ({ name, visits }))
    .sort((a, b) => b.visits - a.visits);
}

const ClubVisitsPage = () => {
  const { user } = useTickets();
  const isChef  = user?.role === 'chef';
  const userClub = user?.club?.toUpperCase();
  const dwhClub  = CLUB_MAP[userClub] ?? null;

  const [summary, setSummary]   = useState(null);   // dwh_stats/club_visits
  const [history, setHistory]   = useState(null);   // dwh_stats/daily_history

  const [mode, setMode]         = useState('today'); // 'today' | 'yesterday' | 'range'
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo]     = useState(yesterday);

  useEffect(() => {
    const u1 = onSnapshot(doc(db, 'dwh_stats', 'club_visits'), s => { if (s.exists()) setSummary(s.data()); });
    const u2 = onSnapshot(doc(db, 'dwh_stats', 'daily_history'), s => { if (s.exists()) setHistory(s.data()); });
    return () => { u1(); u2(); };
  }, []);

  // Compute clubs for current mode
  const getRawClubs = () => {
    if (mode === 'today')     return summary?.clubs?.map(c => ({ name: c.name, visits: c.today })) ?? [];
    if (mode === 'yesterday') return history ? aggregate(history.data, yesterday, yesterday) : [];
    if (mode === 'range')     return history ? aggregate(history.data, dateFrom, dateTo)     : [];
    return [];
  };

  const allClubs    = getRawClubs().filter(c => c.visits > 0);
  const visibleClubs = isChef ? allClubs : allClubs.filter(c => c.name === dwhClub);
  const sorted      = [...visibleClubs].sort((a, b) => b.visits - a.visits);
  const maxVal      = sorted[0]?.visits ?? 1;

  const updatedAt = summary?.updatedAt
    ? (typeof summary.updatedAt === 'string' ? new Date(summary.updatedAt) : summary.updatedAt.toDate?.())
    : null;

  const modeLabel = mode === 'today' ? 'Сегодня' : mode === 'yesterday' ? 'Вчера'
    : `${format(parseISO(dateFrom), 'd MMM', { locale: ru })} – ${format(parseISO(dateTo), 'd MMM', { locale: ru })}`;

  return (
    <div className="animate-fade" style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: 4 }}>
            {isChef ? 'Посещения клубов' : `Посещения — ${dwhClub?.replace('HJ ', '') ?? userClub ?? ''}`}
          </h1>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Данные из HJ Internal
          </p>
        </div>
        {updatedAt && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
            <Clock size={12} />
            Обновлено: {format(updatedAt, 'd MMM, HH:mm', { locale: ru })}
          </div>
        )}
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: mode === 'range' ? 12 : 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {['today', 'yesterday', 'range'].map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '8px 20px', borderRadius: 12, cursor: 'pointer',
              fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
              background: mode === m ? 'var(--accent-purple)' : 'var(--bg-card)',
              color: mode === m ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${mode === m ? 'var(--accent-purple)' : 'var(--border)'}`,
              transition: 'all 0.2s',
            }}
          >
            {m === 'today' ? 'Сегодня' : m === 'yesterday' ? 'Вчера' : 'Фильтр дат'}
          </button>
        ))}
      </div>

      {/* Date range picker */}
      {mode === 'range' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>С</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={e => setDateFrom(e.target.value)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '8px 12px', color: 'var(--text-primary)',
                fontSize: 13, fontWeight: 700, outline: 'none', cursor: 'pointer',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>По</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={today}
              onChange={e => setDateTo(e.target.value)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '8px 12px', color: 'var(--text-primary)',
                fontSize: 13, fontWeight: 700, outline: 'none', cursor: 'pointer',
              }}
            />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
            История до 90 дней
          </span>
        </div>
      )}

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Всего посещений', value: sorted.reduce((s, c) => s + c.visits, 0).toLocaleString('ru'), icon: Users,      color: '#7B3DFF' },
          { label: 'Лидер',           value: sorted[0]?.name?.replace('HJ ', '') ?? '—',                    icon: TrendingUp, color: '#22c55e' },
          { label: 'Период',          value: modeLabel,                                                       icon: Calendar,  color: '#f59e0b' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <s.icon size={18} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Club bars */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 24, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Рейтинг — {modeLabel}
          </span>
        </div>

        {!summary || (mode !== 'today' && !history) ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Загрузка...</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Нет данных за выбранный период</div>
        ) : (
          sorted.map((club, i) => {
            const color     = CLUB_COLORS[club.name] || '#7B3DFF';
            const shortName = club.name.replace('HJ ', '');
            const pct       = Math.round((club.visits / maxVal) * 100);
            return (
              <div key={club.name} style={{ padding: '18px 20px', borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{shortName}</span>
                    {i === 0 && (
                      <span style={{ fontSize: 10, fontWeight: 800, background: `${color}20`, color, padding: '2px 8px', borderRadius: 20, border: `1px solid ${color}40` }}>#1</span>
                    )}
                  </div>
                  <div>
                    <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {club.visits.toLocaleString('ru')}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>посещ.</span>
                  </div>
                </div>
                <div style={{ height: 8, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: `linear-gradient(90deg, ${color}cc, ${color})`, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};

export default ClubVisitsPage;
