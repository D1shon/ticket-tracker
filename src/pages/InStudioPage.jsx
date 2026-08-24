import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { MonitorSmartphone, Plus, X, User, Clock, RotateCw, Play, Trash2, MessageSquare, Paperclip, Send, Timer, Pencil } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { useTickets } from '../store/TicketContext';
import { isMobileDevice } from '../lib/isMobile';
import { pushNotify } from '../lib/pushNotify';
import { slackInStudioTicket } from '../lib/slackInStudio';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

/*
 * InStudio — заявки по технике/софту студий для команды разработки.
 * Сотрудники клубов заводят заявки; разработчики берут их в работу,
 * назначают себя ответственными и двигают по статусам.
 * Строгий приглушённый стиль. Хранение: instudio_tickets.
 */

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];

const ZONES = ['Тренажёрный зал', 'Кардиозона', 'Групповой зал', 'Ресепшн', 'Раздевалки', 'Душевые', 'Сауна', 'Техпомещение', 'Вся студия'];

const TYPES = [
  'Проблема с планшетами', 'Проблема с турникетами', 'Проблема со шкафами',
  'Проблема с контроллером', 'Проблема со звуком', 'Проблемы с пульсометрами', 'Проблема с тренажёрами',
  'Проблема с POS-панелью', 'Проблема с телевизором', 'Проблема с Интернетом',
  'Проблема со светом', 'Проблема с WASP', 'Проблема с приложением', 'Другое',
];

// Приглушённая строгая палитра
const STATUSES = [
  { id: 'new',         label: 'Новые',      color: '#8a94a6' },
  { id: 'in_progress', label: 'В работе',   color: '#b39a5e' },
  { id: 'done',        label: 'Выполнены',  color: '#7d9c87' },
  { id: 'rejected',    label: 'Отклонены',  color: '#9c7d7d' },
];

const PRIORITIES = [
  { id: 'high',   label: 'Высокий', color: '#b07a6a' },
  { id: 'medium', label: 'Средний', color: '#b3a05e' },
  { id: 'low',    label: 'Низкий',  color: '#7d9c87' },
];

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 13px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, outline: 'none',
};

const emptyForm = (club) => ({ club: club || '4YOU', zone: '', type: '', title: '', description: '', priority: 'medium', recurring: false });

const compressImageToBase64 = (file) => new Promise((resolve, reject) => {
  const img = new window.Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    const MAX = 640;
    let { width, height } = img;
    if (width > MAX || height > MAX) {
      if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
      else { width = Math.round((width * MAX) / height); height = MAX; }
    }
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    c.getContext('2d').drawImage(img, 0, 0, width, height);
    resolve(c.toDataURL('image/jpeg', 0.6));
  };
  img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('bad image')); };
  img.src = objectUrl;
});

// «3д 4ч» / «5ч 12м» / «34м»
const fmtDuration = (ms) => {
  if (!ms || ms < 0) return '0м';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${mm}м`;
  return `${mm}м`;
};

const InStudioPage = () => {
  const { user } = useTickets();
  const myEmail = (user?.email || '').toLowerCase();
  const myName = user?.displayName || user?.email || '';
  const isChef = user?.role === 'chef';
  const userClub = user?.club?.toUpperCase() || null;
  // Менеджеры, админы и РОП видят только свой клуб; все клубы — шеф, Ком-Дир,
  // наблюдатель, маркетинг и техники (разработчики обслуживают всю сеть)
  const canSeeAllClubs = ['chef', 'komdir', 'viewer', 'marketing', 'tech'].includes(user?.role) || !userClub;
  // Брать заявки в работу, менять статусы и приоритеты может команда разработки и Дильшат
  const DEV_EMAILS = ['iliyas.s@hj.fit', 'madiyar.a@hj.fit', 'roman.v@hj.fit', 'nurali.m@hj.fit', 'dilshat.r@hj.fit'];
  const isDev = DEV_EMAILS.includes(myEmail);

  const [tickets, setTickets] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(() => emptyForm(userClub));
  const [saving, setSaving] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [clubFilter, setClubFilter] = useState('ALL');

  // Мобильный режим: канбан → лента чипов-статусов + вертикальный список
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  const [mobileStatus, setMobileStatus] = useState('new'); // выбранный статус на мобильном
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Окно задачи с обсуждением (как в обычных заявках).
  // ?ticket=<id> в URL (ссылки из Slack/пушей) открывает заявку сразу.
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(() => searchParams.get('ticket') || null);
  const selected = useMemo(() => tickets.find(t => t.id === selectedId) || null, [tickets, selectedId]);
  const [chatText, setChatText] = useState('');
  const [chatPhotos, setChatPhotos] = useState([]);
  const [sendingChat, setSendingChat] = useState(false);
  const [photoView, setPhotoView] = useState(null); // увеличенное фото
  const [editingIdx, setEditingIdx] = useState(null); // индекс редактируемого сообщения
  const [editingText, setEditingText] = useState('');

  // ?create=1 (кнопка «+» в мобильной навигации) → сразу открываем форму заявки
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setForm(emptyForm(userClub));
      setShowAdd(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Минутный тик — живой счётчик «в работе»
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => { const iv = setInterval(() => setNowTick(Date.now()), 60000); return () => clearInterval(iv); }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'instudio_tickets'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
      setTickets(list);
    }, err => console.error('[instudio]', err));
  }, []);

  // Заперт на клубе — видит только его; иначе работает выбранный фильтр
  const effectiveClub = canSeeAllClubs ? clubFilter : userClub;
  const visibleTickets = useMemo(
    () => tickets.filter(t => effectiveClub === 'ALL' || t.club === effectiveClub),
    [tickets, effectiveClub]
  );

  const byStatus = useMemo(() => {
    const m = { new: [], in_progress: [], done: [], rejected: [] };
    visibleTickets
      .filter(t => priorityFilter === 'ALL' || t.priority === priorityFilter)
      .forEach(t => { (m[t.status] || m.new).push(t); });
    return m;
  }, [visibleTickets, priorityFilter]);

  const handleCreate = async () => {
    if (!form.title.trim()) return toast.error('Укажите заголовок');
    if (!form.type) return toast.error('Выберите тип проблемы');
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'instudio_tickets'), {
        club: form.club, zone: form.zone || null, type: form.type,
        title: form.title.trim(), description: form.description.trim() || null,
        priority: form.priority, recurring: !!form.recurring,
        status: 'new', assignee: null, assigneeEmail: null,
        comments: [],
        createdByName: myName, createdByEmail: myEmail,
        createdAtISO: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
      pushNotify({
        title: '🛠 InStudio: новая заявка',
        body: `${form.club}: ${form.title.trim()} (${form.type})${form.zone ? ` · ${form.zone}` : ''}`,
        excludeEmail: myEmail, url: '/instudio', tag: 'instudio',
        roles: ['chef', 'tech'],
      });
      slackInStudioTicket({ ...form, id: ref.id, title: form.title.trim(), createdByName: myName });
      toast.success('Заявка создана — разработчики увидят её в InStudio');
      setShowAdd(false);
      setForm(emptyForm(userClub));
    } catch (e) { console.error(e); toast.error('Не удалось создать заявку'); }
    finally { setSaving(false); }
  };

  const takeTicket = async (t) => {
    try {
      const nowISO = new Date().toISOString();
      await updateDoc(doc(db, 'instudio_tickets', t.id), {
        assignee: myName, assigneeEmail: myEmail,
        status: 'in_progress', statusChangedAtISO: nowISO, takenAtISO: nowISO,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Вы ответственный за «${t.title}»`);
      if (t.createdByEmail && t.createdByEmail !== myEmail) {
        pushNotify({
          title: '🛠 InStudio: заявка в работе',
          body: `«${t.title}» взял(а) в работу ${myName}`,
          emails: [t.createdByEmail], url: `/instudio?ticket=${t.id}`, tag: 'instudio',
        });
      }
    } catch { toast.error('Не удалось взять заявку'); }
  };

  const setStatus = async (t, status) => {
    try {
      const nowISO = new Date().toISOString();
      await updateDoc(doc(db, 'instudio_tickets', t.id), {
        status, statusChangedAtISO: nowISO,
        ...(status === 'in_progress' && !t.takenAtISO ? { takenAtISO: nowISO } : {}),
        ...(status === 'done' || status === 'rejected' ? { finishedAtISO: nowISO } : { finishedAtISO: null }),
        ...(t.assigneeEmail ? {} : { assignee: myName, assigneeEmail: myEmail }),
        updatedAt: serverTimestamp(),
      });
      const st = STATUSES.find(s => s.id === status);
      toast.success(`Статус: ${st?.label}`);
      if (t.createdByEmail && t.createdByEmail !== myEmail && (status === 'done' || status === 'rejected')) {
        pushNotify({
          title: status === 'done' ? 'InStudio: заявка выполнена' : 'InStudio: заявка отклонена',
          body: `«${t.title}» — ${myName}`,
          emails: [t.createdByEmail], url: `/instudio?ticket=${t.id}`, tag: 'instudio',
        });
      }
    } catch { toast.error('Не удалось сменить статус'); }
  };

  // Разработчики могут менять приоритет заявки
  const setPriority = async (t, priority) => {
    if (priority === t.priority) return;
    try {
      await updateDoc(doc(db, 'instudio_tickets', t.id), { priority, updatedAt: serverTimestamp() });
      toast.success(`Приоритет: ${PRIORITIES.find(p => p.id === priority)?.label}`);
    } catch { toast.error('Не удалось сменить приоритет'); }
  };

  const deleteTicket = async (t) => {
    if (!window.confirm(`Удалить заявку «${t.title}»?`)) return;
    try { await deleteDoc(doc(db, 'instudio_tickets', t.id)); toast.success('Заявка удалена'); }
    catch { toast.error('Не удалось удалить'); }
  };

  const canDelete = (t) => isChef || (t.createdByEmail || '').toLowerCase() === myEmail;

  const onChatPhoto = async (ev) => {
    const files = [...(ev.target.files || [])].slice(0, 3);
    for (const f of files) {
      if (f.type.startsWith('image/')) {
        try { const b = await compressImageToBase64(f); setChatPhotos(p => [...p, b].slice(0, 3)); } catch {}
      }
    }
    ev.target.value = '';
  };

  const sendComment = async (t) => {
    const text = chatText.trim();
    if (!text && chatPhotos.length === 0) return;
    setSendingChat(true);
    try {
      await updateDoc(doc(db, 'instudio_tickets', t.id), {
        comments: arrayUnion({
          text, photos: chatPhotos,
          authorName: myName, authorEmail: myEmail,
          tsISO: new Date().toISOString(),
        }),
        updatedAt: serverTimestamp(),
      });
      // Уведомляем автора и ответственного (кроме себя)
      const targets = [...new Set([t.createdByEmail, t.assigneeEmail].filter(e => e && e !== myEmail))];
      if (targets.length) {
        pushNotify({
          title: `💬 InStudio · «${t.title.slice(0, 50)}»`,
          body: `${myName}: ${text.slice(0, 90) || '📷 фото'}`,
          emails: targets, url: `/instudio?ticket=${t.id}`, tag: 'instudio',
        });
      }
      setChatText(''); setChatPhotos([]);
    } catch { toast.error('Не удалось отправить'); }
    finally { setSendingChat(false); }
  };

  // Редактирование/удаление сообщений: перезаписываем массив comments целиком
  const canManageComment = (c) => isChef || (c.authorEmail || '').toLowerCase() === myEmail;
  const deleteComment = async (t, idx) => {
    if (!window.confirm('Удалить сообщение?')) return;
    try {
      const next = (t.comments || []).filter((_, i) => i !== idx);
      await updateDoc(doc(db, 'instudio_tickets', t.id), { comments: next, updatedAt: serverTimestamp() });
    } catch { toast.error('Не удалось удалить сообщение'); }
  };
  const saveEditedComment = async (t) => {
    const text = editingText.trim();
    const idx = editingIdx;
    if (idx === null) return;
    const orig = (t.comments || [])[idx];
    if (!orig) { setEditingIdx(null); return; }
    if (!text && (orig.photos || []).length === 0) return toast.error('Сообщение не может быть пустым');
    try {
      const next = (t.comments || []).map((c, i) => i === idx ? { ...c, text, editedAtISO: new Date().toISOString() } : c);
      await updateDoc(doc(db, 'instudio_tickets', t.id), { comments: next, updatedAt: serverTimestamp() });
      setEditingIdx(null); setEditingText('');
    } catch { toast.error('Не удалось сохранить'); }
  };

  const fmtDate = (iso) => { try { return format(new Date(iso), 'd MMM HH:mm', { locale: ru }); } catch { return ''; } };

  // Время в работе: идёт для in_progress, зафиксировано для done/rejected
  const workTime = (t) => {
    const start = t.takenAtISO || (t.status !== 'new' ? t.statusChangedAtISO : null);
    if (!start) return null;
    if (t.status === 'in_progress') return { label: `в работе ${fmtDuration(nowTick - new Date(start).getTime())}`, live: true };
    if ((t.status === 'done' || t.status === 'rejected') && t.finishedAtISO) {
      return { label: `выполнялась ${fmtDuration(new Date(t.finishedAtISO).getTime() - new Date(start).getTime())}`, live: false };
    }
    return null;
  };

  const btnStyle = {
    // На мобильном зона нажатия крупнее (палец)
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: isMobile ? '11px 14px' : '7px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)',
    fontSize: isMobile ? 11 : 10.5, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
  };

  // Поля формы: на мобильном 16px, чтобы iOS не зумил страницу при фокусе
  const mInput = isMobile ? { ...inputStyle, fontSize: 16 } : inputStyle;

  // Карточка заявки — одна и та же для десктопного канбана и мобильного списка
  const renderTicketCard = (t) => {
    const pr = PRIORITIES.find(p => p.id === t.priority);
    const wt = workTime(t);
    const comments = t.comments || [];
    return (
      <div key={t.id} onClick={() => { setSelectedId(t.id); setChatText(''); setChatPhotos([]); setEditingIdx(null); setEditingText(''); }} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: isMobile ? '12px 13px' : '11px 12px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{t.club}</span>
          {pr && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800, color: pr.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: pr.color }} /> {pr.label}
            </span>
          )}
          {t.recurring && <span title="Проблема повторяется" style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><RotateCw size={9} /> повтор</span>}
          {t.source === 'shift-board' && <span title="Из «Неисправности» на Доске задач" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)' }}>· с доски задач</span>}
          {t.source === 'ops-report' && <span title="Из «Отчёта дня» в Чек-листах" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)' }}>· отчёт дня</span>}
          {(t.photos || []).length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)' }}><Paperclip size={9} /> {t.photos.length}</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.35 }}>{t.title}</div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 3 }}>
          {t.type}{t.zone ? ` · ${t.zone}` : ''}
        </div>
        {t.description && (
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 6, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{t.description}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> {fmtDate(t.createdAtISO)}</span>
          <span>· {t.createdByName}</span>
          {wt && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: wt.live ? '#b39a5e' : 'var(--text-muted)', fontWeight: 700 }}>
              · <Timer size={10} /> {wt.label}
            </span>
          )}
        </div>
        {t.assignee && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 7, fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 7, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            <User size={11} /> {t.assignee}
          </div>
        )}

        {/* Действия */}
        <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' }}>
          {isDev && t.status === 'new' && (
            <button onClick={(e) => { e.stopPropagation(); takeTicket(t); }} style={{ ...btnStyle, borderColor: '#b39a5e55', color: '#b39a5e' }}>
              <Play size={11} /> Взять в работу
            </button>
          )}
          {isDev && t.status === 'in_progress' && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setStatus(t, 'done'); }} style={{ ...btnStyle, borderColor: '#7d9c8755', color: '#7d9c87' }}>Выполнена</button>
              <button onClick={(e) => { e.stopPropagation(); setStatus(t, 'rejected'); }} style={{ ...btnStyle, borderColor: '#9c7d7d55', color: '#9c7d7d' }}>Отклонить</button>
            </>
          )}
          {isDev && (t.status === 'done' || t.status === 'rejected') && (
            <button onClick={(e) => { e.stopPropagation(); setStatus(t, 'in_progress'); }} style={btnStyle}>↩ В работу</button>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: comments.length ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            <MessageSquare size={11} /> {comments.length}
          </span>
          {canDelete(t) && (
            <button onClick={(e) => { e.stopPropagation(); deleteTicket(t); }} title="Удалить" style={{ marginLeft: 'auto', padding: isMobile ? 10 : 5, borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 0, opacity: 0.55 }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MonitorSmartphone size={18} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>InStudio</h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Заявки по технике и софту студий — для команды разработки</p>
        </div>
        <button onClick={() => { setForm(emptyForm(userClub)); setShowAdd(true); }} style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
        }}>
          <Plus size={14} /> Создать заявку
        </button>
      </div>

      {/* Фильтр по клубу (только у ролей с доступом ко всем клубам).
          На мобильном — горизонтальная лента без переноса */}
      {canSeeAllClubs ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', paddingBottom: isMobile ? 2 : 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', flexShrink: 0 }}>Клуб:</span>
          {['ALL', ...CLUBS].map(c => (
            <button
              key={c}
              onClick={() => setClubFilter(c)}
              style={{
                padding: isMobile ? '8px 14px' : '7px 14px', borderRadius: isMobile ? 999 : 8, cursor: 'pointer', fontSize: 11.5, fontWeight: 800,
                flexShrink: 0, whiteSpace: 'nowrap',
                border: clubFilter === c ? '1px solid var(--text-secondary)' : '1px solid var(--border)',
                background: clubFilter === c ? 'var(--bg-hover)' : 'transparent',
                color: clubFilter === c ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {c === 'ALL' ? 'Все' : c}
              <span style={{ marginLeft: 6, opacity: 0.6, fontWeight: 700 }}>
                {c === 'ALL' ? tickets.length : tickets.filter(t => t.club === c).length}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
          Клуб: <span style={{ color: 'var(--text-primary)' }}>{userClub}</span>
        </div>
      )}

      {/* Фильтр по важности — на мобильном горизонтальная лента */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', paddingBottom: isMobile ? 2 : 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', flexShrink: 0 }}>Важность:</span>
        {[{ id: 'ALL', label: 'Все' }, ...PRIORITIES].map(p => (
          <button
            key={p.id}
            onClick={() => setPriorityFilter(p.id)}
            style={{
              padding: isMobile ? '8px 14px' : '7px 14px', borderRadius: isMobile ? 999 : 8, cursor: 'pointer', fontSize: 11.5, fontWeight: 800,
              flexShrink: 0, whiteSpace: 'nowrap',
              border: priorityFilter === p.id ? '1px solid var(--text-secondary)' : '1px solid var(--border)',
              background: priorityFilter === p.id ? 'var(--bg-hover)' : 'transparent',
              color: priorityFilter === p.id ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {p.label}
            <span style={{ marginLeft: 6, opacity: 0.6, fontWeight: 700 }}>
              {p.id === 'ALL' ? visibleTickets.length : visibleTickets.filter(t => t.priority === p.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Мобильный: лента чипов-статусов + вертикальный список выбранного статуса.
          Десктоп: канбан 4 колонок как раньше */}
      {isMobile ? (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
            {STATUSES.map(st => (
              <button
                key={st.id}
                onClick={() => setMobileStatus(st.id)}
                style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 999,
                  cursor: 'pointer', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', minHeight: 40,
                  border: mobileStatus === st.id ? `1px solid ${st.color}66` : '1px solid var(--border)',
                  background: mobileStatus === st.id ? 'var(--bg-hover)' : 'transparent',
                  color: mobileStatus === st.id ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color }} />
                {st.label}
                <span style={{ opacity: 0.6, fontWeight: 700 }}>{byStatus[st.id].length}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {byStatus[mobileStatus].length === 0 ? (
              <div style={{ padding: '28px 10px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 14 }}>
                В статусе «{STATUSES.find(s => s.id === mobileStatus)?.label}» заявок нет
              </div>
            ) : (
              byStatus[mobileStatus].map(t => renderTicketCard(t))
            )}
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12, alignItems: 'start' }}>
          {STATUSES.map(st => (
            <div key={st.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color }} />
                <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>{st.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>{byStatus[st.id].length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, minHeight: 60 }}>
                {byStatus[st.id].length === 0 && (
                  <div style={{ padding: '16px 10px', textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>Пусто</div>
                )}
                {byStatus[st.id].map(t => renderTicketCard(t))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Окно задачи: детали + обсуждение (как в обычных заявках) */}
      {selected && ReactDOM.createPortal(
        // На мобильном окно задачи на весь экран: чат тянется до низа
        <div onClick={() => setSelectedId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: isMobile ? '100%' : 720, height: isMobile ? '100dvh' : 'min(86vh, 780px)', background: 'var(--bg-card)', borderRadius: isMobile ? 0 : 16, border: isMobile ? 'none' : '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {(() => {
              const t = selected;
              const pr = PRIORITIES.find(p => p.id === t.priority);
              const st = STATUSES.find(s => s.id === t.status);
              const wt = workTime(t);
              const comments = t.comments || [];
              return (
                <>
                  {/* Шапка */}
                  <div style={{ padding: isMobile ? '12px 14px' : '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, ...(isMobile ? { overflowY: 'auto', maxHeight: '55dvh' } : {}) }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: st?.color }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: st?.color }} /> {st?.label}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{t.club}</span>
                          {isDev ? (
                            <span style={{ display: 'inline-flex', gap: 4 }} title="Сменить приоритет">
                              {PRIORITIES.map(p => (
                                <button
                                  key={p.id}
                                  onClick={() => setPriority(t, p.id)}
                                  style={{
                                    padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 9.5, fontWeight: 800,
                                    textTransform: 'uppercase', letterSpacing: '0.04em',
                                    border: t.priority === p.id ? `1px solid ${p.color}66` : '1px solid var(--border)',
                                    background: t.priority === p.id ? `${p.color}1a` : 'transparent',
                                    color: t.priority === p.id ? p.color : 'var(--text-muted)',
                                  }}
                                >{p.label}</button>
                              ))}
                            </span>
                          ) : (
                            pr && <span style={{ fontSize: 10, fontWeight: 800, color: pr.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{pr.label}</span>
                          )}
                          {t.recurring && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>повторяющаяся</span>}
                          {t.source === 'shift-board' && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>с доски задач</span>}
                        </div>
                        <div style={{ fontSize: 16.5, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{t.title}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span>{t.type}{t.zone ? ` · ${t.zone}` : ''}</span>
                          <span>· {t.createdByName} · {fmtDate(t.createdAtISO)}</span>
                          {wt && <span style={{ color: wt.live ? '#b39a5e' : 'var(--text-muted)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Timer size={11} /> {wt.label}</span>}
                          {t.assignee && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><User size={11} /> {t.assignee}</span>}
                        </div>
                      </div>
                      <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: isMobile ? 10 : 4, lineHeight: 0, flexShrink: 0 }}><X size={isMobile ? 22 : 19} /></button>
                    </div>
                    {t.description && (
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 10, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 120, overflowY: 'auto' }}>{t.description}</div>
                    )}
                    {/* Структурные поля из «Отчёта дня» */}
                    {(t.affectedLabel || t.criticalityLabel || t.requestTypeLabel || t.noticedAtISO) && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        {t.criticalityLabel && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 7, background: t.criticality === 'blocks' ? 'rgba(176,106,106,0.1)' : 'var(--bg-hover)', border: t.criticality === 'blocks' ? '1px solid rgba(176,106,106,0.4)' : '1px solid var(--border)', color: t.criticality === 'blocks' ? '#B06A6A' : 'var(--text-secondary)' }}>{t.criticalityLabel}</span>}
                        {t.affectedLabel && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 7, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Затронуто: {t.affectedLabel}</span>}
                        {t.requestTypeLabel && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 7, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{t.requestTypeLabel}</span>}
                        {t.noticedAtISO && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 7, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Заметил: {fmtDate(t.noticedAtISO)}</span>}
                      </div>
                    )}
                    {/* Фото из заявки */}
                    {(t.photos || []).length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        {t.photos.map((p, pi) => (
                          <img key={pi} src={p} alt="" onClick={() => setPhotoView(p)} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in' }} />
                        ))}
                      </div>
                    )}
                    {/* Действия */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                      {isDev && t.status === 'new' && (
                        <button onClick={() => takeTicket(t)} style={{ ...btnStyle, borderColor: '#b39a5e55', color: '#b39a5e' }}><Play size={11} /> Взять в работу</button>
                      )}
                      {isDev && t.status === 'in_progress' && (
                        <>
                          <button onClick={() => setStatus(t, 'done')} style={{ ...btnStyle, borderColor: '#7d9c8755', color: '#7d9c87' }}>Выполнена</button>
                          <button onClick={() => setStatus(t, 'rejected')} style={{ ...btnStyle, borderColor: '#9c7d7d55', color: '#9c7d7d' }}>Отклонить</button>
                        </>
                      )}
                      {isDev && (t.status === 'done' || t.status === 'rejected') && (
                        <button onClick={() => setStatus(t, 'in_progress')} style={btnStyle}>↩ Вернуть в работу</button>
                      )}
                      {canDelete(t) && (
                        <button onClick={() => { deleteTicket(t); setSelectedId(null); }} style={{ ...btnStyle, marginLeft: 'auto', opacity: 0.7 }}><Trash2 size={11} /> Удалить</button>
                      )}
                    </div>
                  </div>

                  {/* Лента обсуждения */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 14px' : '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                      Обсуждение {comments.length > 0 && `· ${comments.length}`}
                    </div>
                    {comments.length === 0 && (
                      <div style={{ padding: '24px 10px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                        Сообщений пока нет — начните обсуждение задачи
                      </div>
                    )}
                    {comments.map((c, i) => {
                      const mine = (c.authorEmail || '').toLowerCase() === myEmail;
                      const isEditing = editingIdx === i;
                      return (
                        <div key={i} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', background: mine ? 'var(--bg-hover)' : 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12, padding: '9px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)' }}>{mine ? 'Вы' : c.authorName}</span>
                            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>
                              {fmtDate(c.tsISO)}{c.editedAtISO ? ' · изменено' : ''}
                            </span>
                            {canManageComment(c) && !isEditing && (
                              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
                                <button onClick={() => { setEditingIdx(i); setEditingText(c.text || ''); }} title="Редактировать" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 3, lineHeight: 0, opacity: 0.6 }}>
                                  <Pencil size={11} />
                                </button>
                                <button onClick={() => deleteComment(t, i)} title="Удалить" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 3, lineHeight: 0, opacity: 0.6 }}>
                                  <Trash2 size={11} />
                                </button>
                              </span>
                            )}
                          </div>
                          {isEditing ? (
                            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                              <textarea
                                value={editingText}
                                onChange={e => setEditingText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditedComment(t); } if (e.key === 'Escape') { setEditingIdx(null); setEditingText(''); } }}
                                rows={2}
                                autoFocus
                                style={{ ...inputStyle, padding: '8px 11px', fontSize: 12.5, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.45 }}
                              />
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => saveEditedComment(t)} style={{ ...btnStyle, borderColor: '#7d9c8755', color: '#7d9c87' }}>Сохранить</button>
                                <button onClick={() => { setEditingIdx(null); setEditingText(''); }} style={btnStyle}>Отмена</button>
                              </div>
                            </div>
                          ) : (
                            c.text && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 3, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.text}</div>
                          )}
                          {(c.photos || []).length > 0 && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                              {c.photos.map((p, pi) => (
                                <img key={pi} src={p} alt="" onClick={() => setPhotoView(p)} style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in' }} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Ввод сообщения — на мобильном с отступом под системную панель (клавиатура/жесты) */}
                  <div style={{ padding: isMobile ? '10px 12px' : '12px 20px', paddingBottom: isMobile ? 'calc(10px + env(safe-area-inset-bottom))' : 12, borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {chatPhotos.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {chatPhotos.map((p, pi) => (
                          <div key={pi} style={{ position: 'relative' }}>
                            <img src={p} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--border)' }} />
                            <button onClick={() => setChatPhotos(prev => prev.filter((_, x) => x !== pi))} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <label style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="Прикрепить фото">
                        <Paperclip size={15} />
                        <input type="file" accept="image/*" multiple onChange={onChatPhoto} style={{ display: 'none' }} />
                      </label>
                      <input
                        value={chatText}
                        onChange={e => setChatText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !sendingChat) sendComment(t); }}
                        placeholder="Написать в обсуждение…"
                        autoFocus={!isMobile} // на мобильном не открываем клавиатуру сразу — сначала видно задачу
                        // 16px на мобильном — iOS не зумит страницу при фокусе
                        style={{ ...inputStyle, padding: '10px 13px', fontSize: isMobile ? 16 : 13 }}
                      />
                      <button
                        onClick={() => sendComment(t)}
                        disabled={sendingChat || (!chatText.trim() && chatPhotos.length === 0)}
                        style={{ width: isMobile ? 42 : 38, height: isMobile ? 42 : 38, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: (chatText.trim() || chatPhotos.length) ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: sendingChat ? 0.5 : 1 }}
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* Просмотр фото */}
      {photoView && ReactDOM.createPortal(
        <div onClick={() => setPhotoView(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          <img src={photoView} alt="" style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 12 }} />
        </div>,
        document.body
      )}

      {/* Модалка создания — на мобильном шторка снизу */}
      {showAdd && ReactDOM.createPortal(
        <div onClick={() => !saving && setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: isMobile ? '100%' : 460, maxHeight: isMobile ? '92vh' : '90vh', overflowY: 'auto', background: 'var(--bg-card)', borderRadius: isMobile ? '20px 20px 0 0' : 16, border: '1px solid var(--border)', padding: isMobile ? '16px 16px 24px' : 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MonitorSmartphone size={15} style={{ color: 'var(--text-secondary)' }} /> Новая заявка InStudio
              </h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Студия</div>
              {canSeeAllClubs ? (
                <select value={form.club} onChange={e => setForm(f => ({ ...f, club: e.target.value }))} style={{ ...mInput, cursor: 'pointer' }}>
                  {CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <div style={{ ...mInput, cursor: 'default', color: 'var(--text-secondary)' }}>{userClub}</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Зона</div>
              <select value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} style={{ ...mInput, cursor: 'pointer' }}>
                <option value="">Выберите значение</option>
                {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Тип проблемы</div>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ ...mInput, cursor: 'pointer' }}>
                <option value="">Выберите значение</option>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Заголовок</div>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Кратко опишите проблему" style={mInput} />
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Описание</div>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="instudio-desc" placeholder="МАКСИМАЛЬНО ПОДРОБНОЕ ОПИСАНИЕ" rows={4} style={{ ...mInput, resize: 'vertical', minHeight: 90, fontFamily: 'inherit', lineHeight: 1.5 }} />
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Приоритет</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {PRIORITIES.map(p => (
                  <button key={p.id} onClick={() => setForm(f => ({ ...f, priority: p.id }))} style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    background: form.priority === p.id ? 'var(--bg-hover)' : 'transparent',
                    color: form.priority === p.id ? p.color : 'var(--text-muted)',
                    border: form.priority === p.id ? `1px solid ${p.color}66` : '1px solid var(--border)',
                  }}>{p.label}</button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setForm(f => ({ ...f, recurring: !f.recurring }))}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px',
                borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                background: 'var(--bg-hover)', border: '1px solid var(--border)',
              }}
            >
              <span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Повторяющаяся</span>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>Отметьте, если проблема периодически повторяется</span>
              </span>
              <span style={{ width: 40, height: 22, borderRadius: 999, position: 'relative', flexShrink: 0, background: form.recurring ? 'var(--text-secondary)' : 'var(--border)', transition: 'background 0.15s' }}>
                <span style={{ position: 'absolute', top: 2, left: form.recurring ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
              </span>
            </button>

            <button
              onClick={handleCreate}
              disabled={saving || !form.title.trim() || !form.type}
              style={{
                padding: '13px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)',
                fontSize: 13.5, fontWeight: 800, cursor: 'pointer',
                opacity: saving || !form.title.trim() || !form.type ? 0.5 : 1,
              }}
            >
              {saving ? 'Создание…' : 'Создать заявку'}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default InStudioPage;
