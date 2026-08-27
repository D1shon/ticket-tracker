import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, Plus, Link2, MessageSquare, Trash2, Send, ExternalLink } from 'lucide-react';
import { format, parseISO, isValid, addDays, subDays, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { useTickets } from '../store/TicketContext';
import { isMobileDevice } from '../lib/isMobile';

const CalendarDayPage = () => {
  const { date } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useTickets();
  const myEmail = (user?.email || '').toLowerCase();
  const myName = user?.displayName || user?.email || '';
  const isChef = user?.role === 'chef';
  // Календарь у каждого клуба свой: глобальные роли берут клуб из URL, остальные заперты на своём
  const canSeeAll = ['chef', 'komdir', 'viewer', 'marketing'].includes(user?.role);
  const userClub = user?.club?.toUpperCase() || null;
  const club = canSeeAll ? (searchParams.get('club')?.toUpperCase() || userClub || '4YOU') : (userClub || '4YOU');

  const day = useMemo(() => {
    const d = date ? parseISO(date) : null;
    return d && isValid(d) ? d : null;
  }, [date]);

  const [events, setEvents] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLink, setNewLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState({});
  // Мобильный режим: компактная форма, плотные карточки, поля без зума iOS
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    if (!date) return;
    const q = query(collection(db, 'calendar_events'), where('date', '==', date));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        // События без клуба (старые) видны везде, остальные — только в своём клубе.
        // deleted — надгробия удалённых (нужны, чтобы автоповтор их не воскрешал)
        .filter(e => !e.deleted && (!e.club || e.club === club));
      list.sort((a, b) => (a.createdAtISO || '').localeCompare(b.createdAtISO || ''));
      setEvents(list);
    }, err => console.error('[calendar-day]', err));
  }, [date, club]);

  if (!day) {
    return (
      <div className="animate-fade" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>
        Некорректная дата.{' '}
        <button onClick={() => navigate('/calendar')} style={{ color: 'var(--accent-purple)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 'inherit' }}>Вернуться к календарю</button>
      </div>
    );
  }

  const goDay = (d) => navigate(`/calendar/${format(d, 'yyyy-MM-dd')}?club=${encodeURIComponent(club)}`);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title || saving) return;
    const link = newLink.trim();
    if (link && !/^https?:\/\//i.test(link)) {
      alert('Ссылка должна начинаться с http:// или https://');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'calendar_events'), {
        date, club, title, description: newDesc.trim(), link: link || '',
        comments: [],
        createdByName: myName, createdByEmail: myEmail,
        createdAtISO: new Date().toISOString(),
      });
      setNewTitle(''); setNewDesc(''); setNewLink('');
    } catch (e) {
      console.error(e); alert('Не удалось сохранить событие');
    } finally { setSaving(false); }
  };

  const handleAddComment = async (ev) => {
    const text = (commentDrafts[ev.id] || '').trim();
    if (!text) return;
    setCommentDrafts(p => ({ ...p, [ev.id]: '' }));
    try {
      await updateDoc(doc(db, 'calendar_events', ev.id), {
        comments: arrayUnion({ text, authorName: myName, authorEmail: myEmail, atISO: new Date().toISOString() }),
      });
    } catch (e) { console.error(e); alert('Не удалось добавить комментарий'); }
  };

  const handleDelete = async (ev) => {
    if (!window.confirm(`Удалить событие «${ev.title}»?\n\nОно перестанет повторяться в следующих месяцах.`)) return;
    // Не deleteDoc, а надгробие: автоповтор (CalendarPage) видит, что док существует,
    // и не создаёт копию заново; цепочка повторов останавливается на этом месяце.
    try { await updateDoc(doc(db, 'calendar_events', ev.id), { deleted: true, deletedByEmail: myEmail, deletedAtISO: new Date().toISOString() }); }
    catch (e) { console.error(e); alert('Не удалось удалить'); }
  };

  const canDelete = (ev) => isChef || (ev.createdByEmail || '').toLowerCase() === myEmail;

  const inputStyle = {
    // fontSize ≥16 на мобильном — iOS не зумит страницу при фокусе (учёт клавиатуры)
    width: '100%', padding: isMobile ? '10px 12px' : '11px 14px', borderRadius: 12, border: '1px solid var(--border)',
    background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: isMobile ? 16 : 13, fontWeight: 600, outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 60 }}>
      {/* Шапка дня */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/calendar')} style={{ width: 38, height: 38, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="К календарю">
            <ArrowLeft size={18} />
          </button>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(125,111,179,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarDays size={20} style={{ color: 'var(--accent-purple)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em', textTransform: 'capitalize' }}>
              {format(day, 'd MMMM', { locale: ru })}
              {isToday(day) && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 900, color: '#fff', background: 'var(--accent-purple)', borderRadius: 6, padding: '3px 7px', verticalAlign: 'middle' }}>СЕГОДНЯ</span>}
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, margin: 0, textTransform: 'capitalize' }}>{format(day, 'EEEE · yyyy', { locale: ru })} · <span style={{ color: 'var(--accent-purple)', textTransform: 'uppercase' }}>{club}</span></p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => goDay(subDays(day, 1))} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Предыдущий день"><ChevronLeft size={17} /></button>
          <button onClick={() => goDay(addDays(day, 1))} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Следующий день"><ChevronRight size={17} /></button>
        </div>
      </div>

      {/* Создание события — на мобильном форма компактнее, кнопка во всю ширину */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 14 : 18, padding: isMobile ? 12 : 16, display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : 10 }}>
        <div style={{ fontSize: isMobile ? 10 : 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Новое событие</div>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          placeholder="Название события…"
          style={inputStyle}
        />
        <textarea
          value={newDesc}
          onChange={e => setNewDesc(e.target.value)}
          placeholder="Описание события…"
          rows={isMobile ? 2 : 3}
          style={{ ...inputStyle, resize: 'vertical', minHeight: isMobile ? 52 : 70, fontFamily: 'inherit', lineHeight: 1.45 }}
        />
        <input
          value={newLink}
          onChange={e => setNewLink(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          placeholder="Ссылка (https://…) — необязательно"
          style={{ ...inputStyle, padding: isMobile ? '9px 12px' : '8px 14px', fontSize: isMobile ? 16 : 12, color: '#7A94B8' }}
        />
        <button
          onClick={handleCreate}
          disabled={!newTitle.trim() || saving}
          style={{
            alignSelf: isMobile ? 'stretch' : 'flex-start', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: isMobile ? '12px 18px' : '10px 18px', minHeight: isMobile ? 44 : 'auto', borderRadius: 12,
            border: 'none', cursor: newTitle.trim() && !saving ? 'pointer' : 'default',
            background: newTitle.trim() && !saving ? 'var(--accent-purple)' : 'var(--bg-hover)',
            color: newTitle.trim() && !saving ? '#fff' : 'var(--text-muted)', fontSize: 13, fontWeight: 800,
          }}
        >
          <Plus size={15} /> {saving ? 'Сохранение…' : 'Создать'}
        </button>
      </div>

      {/* События дня */}
      {events.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 18 }}>
          На этот день событий пока нет — создайте первое выше
        </div>
      ) : events.map(ev => (
        // На мобильном карточка события плотнее
        <div key={ev.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 14 : 18, padding: isMobile ? 12 : 16, display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{ev.title}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', marginTop: 3 }}>
                {ev.createdByName || ev.createdByEmail}{ev.createdAtISO ? ` · ${format(new Date(ev.createdAtISO), 'd MMM HH:mm', { locale: ru })}` : ''}
              </div>
            </div>
            {canDelete(ev) && (
              <button onClick={() => handleDelete(ev)} style={{ flexShrink: 0, width: isMobile ? 36 : 32, height: isMobile ? 36 : 32, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: '#B06A6A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Удалить событие">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {ev.description && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{ev.description}</div>
          )}

          {ev.link && (
            <a href={ev.link} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(122,148,184,0.08)', border: '1px solid rgba(122,148,184,0.25)', color: '#7A94B8', fontSize: 12, fontWeight: 700, textDecoration: 'none', overflow: 'hidden' }}>
              <Link2 size={13} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ev.link}</span>
              <ExternalLink size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
            </a>
          )}

          {/* Комментарии */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <MessageSquare size={11} /> Комментарии {(ev.comments?.length || 0) > 0 && `(${ev.comments.length})`}
            </div>
            {(ev.comments || []).map((c, i) => (
              <div key={i} style={{ background: 'var(--bg-hover)', borderRadius: 10, padding: '8px 12px' }}>
                <div style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600, overflowWrap: 'anywhere' }}>{c.text}</div>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 700, marginTop: 3 }}>
                  {c.authorName || c.authorEmail}{c.atISO ? ` · ${format(new Date(c.atISO), 'd MMM HH:mm', { locale: ru })}` : ''}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={commentDrafts[ev.id] || ''}
                onChange={e => setCommentDrafts(p => ({ ...p, [ev.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') handleAddComment(ev); }}
                placeholder="Написать комментарий…"
                // На мобильном 16px — клавиатура открывается без зума страницы
                style={{ ...inputStyle, padding: '9px 12px', fontSize: isMobile ? 16 : 12.5 }}
              />
              <button
                onClick={() => handleAddComment(ev)}
                disabled={!(commentDrafts[ev.id] || '').trim()}
                style={{
                  flexShrink: 0, width: 40, minHeight: 40, borderRadius: 10, border: 'none', cursor: (commentDrafts[ev.id] || '').trim() ? 'pointer' : 'default',
                  background: (commentDrafts[ev.id] || '').trim() ? 'var(--accent-purple)' : 'var(--bg-hover)',
                  color: (commentDrafts[ev.id] || '').trim() ? '#fff' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CalendarDayPage;
