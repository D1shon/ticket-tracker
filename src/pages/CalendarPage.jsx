import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Link2, MessageSquare } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useTickets } from '../store/TicketContext';
import { isMobileDevice } from '../lib/isMobile';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];

const CalendarPage = () => {
  const navigate = useNavigate();
  const { user } = useTickets();
  // Шеф/Ком-Дир/наблюдатель/маркетинг видят календари всех клубов, остальные — только свой
  const canSeeAll = ['chef', 'komdir', 'viewer', 'marketing'].includes(user?.role);
  const userClub = user?.club?.toUpperCase() || null;
  const [activeClub, setActiveClub] = useState(() => (canSeeAll ? (userClub || '4YOU') : (userClub || '4YOU')));
  const [month, setMonth] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  // Мобильный режим: компактная сетка, точки вместо плашек событий
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'calendar_events'), snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error('[calendar]', err));
  }, []);

  // Сетка месяца: дни 1..28/30/31 подряд, 1-е число всегда в первой клетке.
  // День недели показывается внутри каждой клетки.
  const monthDays = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  const rowsCount = Math.ceil(monthDays.length / 7);

  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach(e => {
      if (!e.date) return;
      // События без клуба (созданные до разделения) видны во всех клубах
      if (e.club && e.club !== activeClub) return;
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    Object.values(map).forEach(list => list.sort((a, b) => (a.createdAtISO || '').localeCompare(b.createdAtISO || '')));
    return map;
  }, [events, activeClub]);

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(125,111,179,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarDays size={20} style={{ color: 'var(--accent-purple)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Календарь · {activeClub}</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Кликните день, чтобы открыть его страницу</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setMonth(m => subMonths(m, 1))} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={17} /></button>
          <div style={{ minWidth: isMobile ? 110 : 150, textAlign: 'center', fontSize: isMobile ? 13 : 15, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{format(month, 'LLLL yyyy', { locale: ru })}</div>
          <button onClick={() => setMonth(m => addMonths(m, 1))} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={17} /></button>
          <button onClick={() => setMonth(new Date())} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>Сегодня</button>
        </div>
      </div>

      {/* Табы клубов — у каждого клуба свой календарь.
          На мобильном — горизонтальная лента без переноса */}
      {canSeeAll && (
        <div style={isMobile
          ? { display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', padding: 5, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, maxWidth: '100%' }
          : { display: 'flex', gap: 6, flexWrap: 'wrap', padding: 5, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, width: 'fit-content' }}>
          {CLUBS.map(c => (
            <button
              key={c}
              onClick={() => setActiveClub(c)}
              style={{
                padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                flexShrink: 0, whiteSpace: 'nowrap',
                fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em',
                background: activeClub === c ? 'var(--accent-purple)' : 'transparent',
                color: activeClub === c ? '#fff' : 'var(--text-secondary)',
              }}
            >{c}</button>
          ))}
        </div>
      )}

      {/* Сетка месяца — во весь экран, 1-е число в первой клетке */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {monthDays.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const today = isToday(day);
            const list = eventsByDay[key] || [];
            const wd = format(day, 'EEEEEE', { locale: ru });
            const weekend = wd === 'сб' || wd === 'вс';
            return (
              <button
                key={key}
                onClick={() => navigate(`/calendar/${key}?club=${encodeURIComponent(activeClub)}`)}
                style={{
                  // Фиксированная высота: ячейки не растягиваются от событий,
                  // лишние строки прячутся (видно до 3 событий + «ещё N…»).
                  // На мобильном сетка компактная: ячейки ниже (от 64px), шрифты меньше
                  height: isMobile
                    ? `max(64px, calc((100vh - 340px) / ${rowsCount}))`
                    : `max(110px, calc((100vh - 200px) / ${rowsCount}))`,
                  overflow: 'hidden',
                  padding: isMobile ? '4px 4px 3px' : '8px 8px 6px', textAlign: 'left', cursor: 'pointer',
                  background: today ? 'rgba(125,111,179,0.08)' : 'transparent',
                  border: 'none', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                  display: 'flex', flexDirection: 'column', gap: isMobile ? 2 : 4, alignItems: 'stretch',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 3 : 6 }}>
                  <span style={{
                    width: isMobile ? 20 : 26, height: isMobile ? 20 : 26, borderRadius: isMobile ? 6 : 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isMobile ? 11 : 13, fontWeight: 900, flexShrink: 0,
                    background: today ? 'var(--accent-purple)' : 'transparent',
                    color: today ? '#fff' : 'var(--text-primary)',
                  }}>{format(day, 'd')}</span>
                  <span style={{ fontSize: isMobile ? 8 : 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: weekend ? 'var(--accent-purple)' : 'var(--text-muted)' }}>{wd}</span>
                </span>
                {isMobile ? (
                  // Мобильный: вместо плашек — точки-индикаторы с числом событий
                  list.length > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 'auto', paddingLeft: 2 }}>
                      {list.slice(0, 3).map(e => (
                        <span key={e.id} style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-purple)', flexShrink: 0 }} />
                      ))}
                      <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-secondary)', marginLeft: 1 }}>{list.length}</span>
                    </span>
                  )
                ) : (
                  <>
                    {list.slice(0, 3).map(e => (
                      <span key={e.id} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', background: 'rgba(125,111,179,0.13)', border: '1px solid rgba(125,111,179,0.22)', borderRadius: 6, padding: '2px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {e.link && <Link2 size={9} style={{ color: '#7A94B8', flexShrink: 0 }} />}
                        {(e.comments?.length || 0) > 0 && <MessageSquare size={9} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                        {e.title}
                      </span>
                    ))}
                    {list.length > 3 && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)' }}>ещё {list.length - 3}…</span>}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
