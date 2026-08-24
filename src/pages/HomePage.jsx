import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Ticket, RefreshCw, CalendarDays, CheckSquare, ChevronRight, AlertTriangle, Wrench } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useTickets } from '../store/TicketContext';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

/*
 * Главная — «моя смена»: первый экран мобильного формата.
 * Что важно прямо сейчас: чекин, заявки в работе, отчёт дня,
 * события календаря на сегодня, свежие неисправности с доски.
 * Данные подгружаются одним заходом (getDocs) — без постоянных подписок.
 */

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const HomePage = () => {
  const navigate = useNavigate();
  const { tickets, user } = useTickets();
  const myEmail = (user?.email || '').toLowerCase();
  const firstName = (user?.displayName || '').split(' ')[0] || 'коллега';
  const userClub = user?.club?.toUpperCase() || null;
  const globalRole = ['chef', 'komdir', 'viewer', 'marketing', 'tech'].includes(user?.role);
  const clubLabel = userClub || 'Вся сеть';
  const today = localDate();
  const yesterday = localDate(new Date(Date.now() - 86400e3));

  const [checkinTime, setCheckinTime] = useState(null);   // 'HH:MM' | null
  const [calEvents, setCalEvents] = useState([]);          // события календаря на сегодня
  const [boardToday, setBoardToday] = useState([]);        // записи доски за сегодня
  const [opsMissing, setOpsMissing] = useState(false);     // отчёт за вчера не заполнен

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Чекин сегодня (мой)
        if (myEmail) {
          const snap = await getDocs(query(collection(db, 'checkins'), where('date', '==', today), where('userId', '==', myEmail)));
          if (!cancelled && !snap.empty) {
            const ins = snap.docs.map(d => d.data()).filter(c => (c.checkType || 'in') === 'in' && c.clubId);
            if (ins.length) {
              const t = ins[0].timestamp?.seconds ? new Date(ins[0].timestamp.seconds * 1000) : null;
              setCheckinTime(t ? format(t, 'HH:mm') : '✓');
            }
          }
        }
      } catch {}
      try {
        // Календарь: события на сегодня
        const snap = await getDocs(query(collection(db, 'calendar_events'), where('date', '==', today)));
        if (!cancelled) {
          setCalEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(e => !e.club || !userClub || e.club === userClub));
        }
      } catch {}
      try {
        // Доска задач: записи за сегодня (для клубных — свой клуб)
        const base = collection(db, 'shift_board');
        const q2 = userClub ? query(base, where('club', '==', userClub)) : query(base);
        const snap = await getDocs(q2);
        if (!cancelled) {
          setBoardToday(snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(e => (e.createdAtISO || '').slice(0, 10) === today)
            .sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || '')));
        }
      } catch {}
      try {
        // Отчёт дня за вчера (только клубные админы/менеджеры)
        if (userClub && ['admin', 'manager'].includes(user?.role)) {
          const [ev, mk] = await Promise.all([
            getDocs(query(collection(db, 'ops_events'), where('club', '==', userClub))),
            getDocs(query(collection(db, 'ops_day_marks'), where('club', '==', userClub))),
          ]);
          if (!cancelled) {
            const hadEvents = ev.docs.some(d => (d.data().createdAtISO || '').slice(0, 10) === yesterday);
            const hadMark = mk.docs.some(d => d.data().date === yesterday);
            setOpsMissing(!hadEvents && !hadMark);
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [myEmail, userClub, today, yesterday, user?.role]);

  const myTicketsInWork = useMemo(() =>
    (tickets || []).filter(t =>
      ['in_progress', 'paused', 'waiting', 'new'].includes(t.status) &&
      (!userClub || (t.club || '').toUpperCase() === userClub)
    ), [tickets, userClub]);

  const issuesToday = boardToday.filter(e => e.type === 'issue');

  const Chip = ({ value, label, color }) => (
    <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '11px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 17, fontWeight: 900, color: color || 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      <div style={{ fontSize: 8.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
    </div>
  );

  const Card = ({ icon: Icon, iconColor, tag, tagColor, title, sub, to }) => (
    <button
      onClick={() => navigate(to)}
      style={{
        width: '100%', textAlign: 'left', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <span style={{ width: 36, height: 36, borderRadius: 11, background: `${iconColor}1c`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} style={{ color: iconColor }} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {tag && <span style={{ fontSize: 8.5, fontWeight: 900, color: tagColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{tag}</span>}
        <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {sub && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
      </span>
      <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </button>
  );

  return (
    <div className="animate-fade" style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 30 }}>
      {/* Приветствие */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 900, color: 'var(--text-primary)' }}>Привет, {firstName} 👋</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{format(new Date(), 'EEEE, d MMMM', { locale: ru })}</div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 900, color: 'var(--accent-purple)', background: 'rgba(125,111,179,0.13)', borderRadius: 8, padding: '5px 10px', letterSpacing: '0.05em' }}>{clubLabel}</span>
      </div>

      {/* Статус-плашки */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!globalRole && <Chip value={checkinTime ? `✓ ${checkinTime}` : '—'} label="Чекин" color={checkinTime ? '#5F9C81' : 'var(--text-muted)'} />}
        <Chip value={myTicketsInWork.length} label="Заявки в работе" color={myTicketsInWork.length > 0 ? '#C08F4F' : 'var(--text-primary)'} />
        <Chip value={issuesToday.length} label="Неиспр. сегодня" color={issuesToday.length > 0 ? '#B06A6A' : 'var(--text-primary)'} />
      </div>

      {/* Сейчас важно */}
      <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Сейчас важно</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!checkinTime && !globalRole && (
          <Card icon={MapPin} iconColor="#5F9C81" tag="Чекин" tagColor="#5F9C81" title="Вы ещё не отметились сегодня" sub="откройте чекин и отметьтесь по Wi-Fi клуба" to="/attendance" />
        )}
        {opsMissing && (
          <Card icon={CheckSquare} iconColor="#C08F4F" tag="Отчёт дня" tagColor="#C08F4F" title="Отчёт за вчера не заполнен" sub="события смены или отметка «всё хорошо»" to="/checklists?view=report" />
        )}
        {issuesToday.slice(0, 2).map(e => (
          <Card key={e.id} icon={AlertTriangle} iconColor="#B06A6A" tag={`Неисправность${globalRole && e.club ? ` · ${e.club}` : ''}`} tagColor="#B06A6A"
            title={(e.text || 'Без описания').slice(0, 80)} sub={`${e.authorName || ''} · ${(e.thread || []).length} отв.`} to="/shift-board" />
        ))}
        {calEvents.slice(0, 3).map(e => (
          <Card key={e.id} icon={CalendarDays} iconColor="#7D6FB3" tag={`Календарь${globalRole && e.club ? ` · ${e.club}` : ''}`} tagColor="#7D6FB3"
            title={e.title} sub={e.description ? e.description.slice(0, 60) : 'событие на сегодня'} to={`/calendar/${today}${e.club ? `?club=${encodeURIComponent(e.club)}` : ''}`} />
        ))}
        {myTicketsInWork.slice(0, 3).map(t => (
          <Card key={t.id} icon={Ticket} iconColor="#5580A8" tag={`Заявка${globalRole && t.club ? ` · ${t.club}` : ''}`} tagColor="#5580A8"
            title={t.title || 'Без названия'} sub={t.assignee || ''} to={`/tickets/${t.id}`} />
        ))}
        {boardToday.filter(e => e.type !== 'issue').slice(0, 2).map(e => (
          <Card key={e.id} icon={RefreshCw} iconColor="#C08F4F" tag={`Доска${globalRole && e.club ? ` · ${e.club}` : ''}`} tagColor="#C08F4F"
            title={(e.text || 'Запись').slice(0, 80)} sub={e.authorName || ''} to="/shift-board" />
        ))}
        {!opsMissing && issuesToday.length === 0 && calEvents.length === 0 && myTicketsInWork.length === 0 && boardToday.length === 0 && (
          <div style={{ padding: '30px 16px', textAlign: 'center', borderRadius: 14, border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 12.5, fontWeight: 600 }}>
            Всё спокойно — срочных дел нет 🙌
          </div>
        )}
      </div>

      {/* Техника */}
      {(user?.role !== 'tech') && (
        <Card icon={Wrench} iconColor="#8a94a6" title="Сломалась техника или софт?" sub="создайте заявку InStudio — разработчики увидят сразу" to="/instudio?create=1" />
      )}
    </div>
  );
};

export default HomePage;
