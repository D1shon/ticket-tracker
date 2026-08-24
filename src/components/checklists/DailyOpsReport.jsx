import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Paperclip, X, Send, RotateCcw, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, onSnapshot, query, where, setDoc, doc } from 'firebase/firestore';
import { useTickets } from '../../store/TicketContext';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday, startOfToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';
import { isMobileDevice } from '../../lib/isMobile';

/*
 * «Отчёт дня» — журнал событий клуба (проблемы за день).
 * Категория → масштаб → критичность → тип → когда заметил → описание → фото.
 * Сохранение пишет событие в ops_events — отметку в календаре истории.
 * Заявки разработчикам создаются отдельно во вкладке InStudio.
 */

const ZONES = ['Upper', 'Legs', 'Metcon', 'Bootcamp', 'Reshape', 'Fullbody', 'Холл', 'Студия'];

const CATEGORIES = [
  { id: 'hrm',     title: 'Пульсометры', sub: 'Датчики пульса',            type: 'Проблемы с пульсометрами' },
  { id: 'tablets', title: 'Планшеты',    sub: 'Устройства в залах',        type: 'Проблема с планшетами' },
  { id: 'tv',      title: 'Телевизоры',  sub: 'Экраны',                    type: 'Проблема с телевизором' },
  { id: 'pos',     title: 'POS-панель',  sub: 'Ресепшен',                  type: 'Проблема с POS-панелью' },
  { id: 'wasp',    title: 'WASP',        sub: 'Локальный узел',            type: 'Проблема с WASP' },
  { id: 'gym',     title: 'Тренажеры',   sub: 'Оборудование',              type: 'Проблема с тренажёрами' },
  { id: 'net',     title: 'Сеть',        sub: 'Wi-Fi / Internet',          type: 'Проблема с Интернетом' },
  { id: 'turnstile', title: 'Турникеты', sub: 'Вход / выход',              type: 'Проблема с турникетами' },
  { id: 'lockers', title: 'Шкафчики',    sub: 'Раздевалки',                type: 'Проблема со шкафами' },
  { id: 'sound',   title: 'Звук',        sub: 'Аудиосистема',              type: 'Проблема со звуком' },
  { id: 'light',   title: 'Свет',        sub: 'Освещение',                 type: 'Проблема со светом' },
  { id: 'other',   title: 'Другое',      sub: 'Всё остальное',             type: 'Другое' },
];

const AFFECTED = [
  { id: 'one',     title: 'Один',      sub: 'Одно устройство' },
  { id: 'several', title: 'Несколько', sub: 'От 2–5 штук' },
  { id: 'mass',    title: 'Массово',   sub: 'Весь зал' },
];

const CRITICALITY = [
  { id: 'blocks', title: 'Блокирует', sub: 'Клиент не может пользоваться', priority: 'high',   danger: true },
  { id: 'annoys', title: 'Мешает',    sub: 'Работает, но плохо',           priority: 'medium', danger: false },
  { id: 'minor',  title: 'Не срочно', sub: 'Почти не влияет',              priority: 'low',    danger: false },
];

const REQUEST_TYPES = [
  { id: 'resolved',  title: 'Решено на месте', sub: 'Починил сам, для истории' },
  { id: 'help',      title: 'Не смог решить',  sub: 'Нужна помощь / запчасть' },
  { id: 'recurring', title: 'Повторяется',     sub: 'Возникает не первый раз' },
];

const NOTICED = [
  { id: 0,  label: 'Сейчас' },
  { id: 15, label: '15 минут назад' },
  { id: 30, label: '30 минут назад' },
  { id: 60, label: '60 минут назад' },
];

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

const SectionTitle = ({ children, hint }) => (
  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
    {children}
    {hint && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 8 }}>{hint}</span>}
  </div>
);

// Карточка-вариант (категория / масштаб / критичность / тип)
// fill — растянуть на всю ячейку сетки (мобильный режим, 2 колонки)
const OptionCard = ({ title, sub, selected, danger, onClick, wide, fill }) => (
  <button
    onClick={onClick}
    style={{
      textAlign: 'left', padding: fill ? '12px 12px' : '12px 16px', borderRadius: 12, cursor: 'pointer',
      minWidth: fill ? 0 : (wide ? 150 : 128), width: fill ? '100%' : undefined, minHeight: fill ? 56 : undefined,
      background: selected ? (danger ? 'rgba(176,106,106,0.08)' : 'rgba(125,111,179,0.08)') : 'var(--bg-card)',
      border: selected ? `1.5px solid ${danger ? '#B06A6A' : 'var(--accent-purple)'}` : '1px solid var(--border)',
    }}
  >
    <div style={{ fontSize: 13.5, fontWeight: 800, color: selected ? (danger ? '#B06A6A' : 'var(--accent-purple)') : 'var(--text-primary)' }}>{title}</div>
    <div style={{ fontSize: 11, fontWeight: 600, color: danger && selected ? '#B06A6A' : 'var(--text-muted)', marginTop: 2, opacity: danger && selected ? 0.85 : 1 }}>{sub}</div>
  </button>
);

const emptyState = { zone: '', category: null, affected: 'one', criticality: null, requestType: null, noticedMin: 0, description: '', photos: [] };

const DailyOpsReport = ({ club }) => {
  const { user } = useTickets();
  const myEmail = (user?.email || '').toLowerCase();
  const myName = user?.displayName || user?.email || '';

  const [form, setForm] = useState(emptyState);
  const [sending, setSending] = useState(false);
  const patch = (p) => setForm(f => ({ ...f, ...p }));

  // Мобильный режим — карточки в 2 колонки, календарь под формой, окно дня — шторка
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Ряды карточек-вариантов: на мобильном — сетка 2 колонки на всю ширину
  const optionRowStyle = isMobile
    ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }
    : { display: 'flex', gap: 10, flexWrap: 'wrap' };

  // ── История событий: мини-календарь месяца ──
  const [month, setMonth] = useState(() => new Date());
  const [histTickets, setHistTickets] = useState([]); // события клуба (ops_events)
  const [dayMarks, setDayMarks] = useState({});       // date -> {byName, atISO} («всё хорошо»)
  const [openDay, setOpenDay] = useState(null);       // 'yyyy-MM-dd' — открытый день
  const [markingOk, setMarkingOk] = useState(false);

  useEffect(() => {
    if (!club) return;
    const unsub1 = onSnapshot(query(collection(db, 'ops_events'), where('club', '==', club)), snap => {
      setHistTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    const unsub2 = onSnapshot(query(collection(db, 'ops_day_marks'), where('club', '==', club)), snap => {
      const m = {};
      snap.docs.forEach(d => { const x = d.data(); if (x.date) m[x.date] = x; });
      setDayMarks(m);
    }, () => {});
    return () => { unsub1(); unsub2(); };
  }, [club]);

  const ticketsByDay = useMemo(() => {
    const m = {};
    histTickets.forEach(t => {
      const day = (t.createdAtISO || '').slice(0, 10);
      if (!day) return;
      (m[day] = m[day] || []).push(t);
    });
    return m;
  }, [histTickets]);

  const monthDays = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);

  const markDayOk = async (dateKey) => {
    if (markingOk) return;
    setMarkingOk(true);
    try {
      await setDoc(doc(db, 'ops_day_marks', `${dateKey}_${club.replace(/\s+/g, '_')}`), {
        date: dateKey, club, status: 'ok',
        byName: myName, byEmail: myEmail,
        atISO: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
      toast.success('Отмечено: всё хорошо ✅');
    } catch { toast.error('Не удалось отметить'); }
    finally { setMarkingOk(false); }
  };

  const onPhoto = async (ev) => {
    const files = [...(ev.target.files || [])].slice(0, 3);
    for (const f of files) {
      if (f.type.startsWith('image/')) {
        try { const b = await compressImageToBase64(f); setForm(prev => ({ ...prev, photos: [...prev.photos, b].slice(0, 3) })); } catch {}
      } else if (f.type.startsWith('video/')) {
        toast.info('Видео пока не поддерживается — приложите фото');
      }
    }
    ev.target.value = '';
  };

  const canSend = form.category && form.criticality && form.requestType;

  // Сохранение СОБЫТИЯ дня: только отметка в календаре истории —
  // заявка в InStudio НЕ создаётся (для заявок есть вкладка InStudio)
  const handleSend = async () => {
    if (!canSend || sending) return;
    setSending(true);
    try {
      const cat = CATEGORIES.find(c => c.id === form.category);
      const crit = CRITICALITY.find(c => c.id === form.criticality);
      const aff = AFFECTED.find(a => a.id === form.affected);
      const req = REQUEST_TYPES.find(r => r.id === form.requestType);
      const nowISO = new Date().toISOString();
      const noticedISO = new Date(Date.now() - form.noticedMin * 60000).toISOString();

      await addDoc(collection(db, 'ops_events'), {
        club,
        zone: form.zone || null,
        category: cat.id, type: cat.type,
        title: `${cat.title}${form.zone ? ` — ${form.zone}` : ''}${form.affected === 'mass' ? ' (массово)' : ''}`,
        description: form.description.trim() || null,
        priority: crit.priority,
        affected: form.affected, affectedLabel: `${aff.title} · ${aff.sub}`,
        criticality: form.criticality, criticalityLabel: `${crit.title} · ${crit.sub}`,
        requestType: form.requestType, requestTypeLabel: req.title,
        noticedAtISO: noticedISO,
        photos: form.photos,
        createdByName: myName, createdByEmail: myEmail,
        createdAtISO: nowISO,
        updatedAt: serverTimestamp(),
      });

      toast.success('Событие сохранено — отмечено в календаре');
      setForm(emptyState);
    } catch (e) {
      console.error(e);
      toast.error('Не удалось сохранить событие');
    } finally { setSending(false); }
  };

  const todayKey = format(startOfToday(), 'yyyy-MM-dd');
  const openDayTickets = openDay ? (ticketsByDay[openDay] || []) : [];
  const openDayMark = openDay ? dayMarks[openDay] : null;

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 16 : 24, alignItems: isMobile ? 'stretch' : 'flex-start', flexWrap: 'wrap' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 22, flex: isMobile ? '1 1 auto' : '1 1 480px', maxWidth: isMobile ? '100%' : 760, minWidth: 0 }}>
      {/* Клуб + Зона */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(125,111,179,0.4)', background: 'rgba(125,111,179,0.07)', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
          Клуб: <span style={{ color: 'var(--accent-purple)', fontWeight: 800 }}>{club}</span>
        </div>
        <select
          value={form.zone}
          onChange={e => patch({ zone: e.target.value })}
          style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: form.zone ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 13, fontWeight: 700, outline: 'none', cursor: 'pointer' }}
        >
          <option value="">Выберите зону…</option>
          {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
      </div>

      {/* Категория */}
      <div>
        <SectionTitle>Категория</SectionTitle>
        <div style={optionRowStyle}>
          {CATEGORIES.map(c => (
            <OptionCard key={c.id} title={c.title} sub={c.sub} selected={form.category === c.id} onClick={() => patch({ category: c.id })} wide fill={isMobile} />
          ))}
        </div>
      </div>

      {/* Сколько затронуто */}
      <div>
        <SectionTitle>Сколько затронуто</SectionTitle>
        <div style={optionRowStyle}>
          {AFFECTED.map(a => (
            <OptionCard key={a.id} title={a.title} sub={a.sub} selected={form.affected === a.id} onClick={() => patch({ affected: a.id })} fill={isMobile} />
          ))}
        </div>
      </div>

      {/* Насколько критично */}
      <div>
        <SectionTitle>Насколько критично</SectionTitle>
        <div style={optionRowStyle}>
          {CRITICALITY.map(c => (
            <OptionCard key={c.id} title={c.title} sub={c.sub} danger={c.danger} selected={form.criticality === c.id} onClick={() => patch({ criticality: c.id })} wide fill={isMobile} />
          ))}
        </div>
      </div>

      {/* Тип заявки */}
      <div>
        <SectionTitle>Тип заявки</SectionTitle>
        <div style={optionRowStyle}>
          {REQUEST_TYPES.map(r => (
            <OptionCard key={r.id} title={r.title} sub={r.sub} selected={form.requestType === r.id} onClick={() => patch({ requestType: r.id })} wide fill={isMobile} />
          ))}
        </div>
      </div>

      {/* Когда заметил */}
      <div>
        <SectionTitle hint="по умолчанию — сейчас">Когда заметил</SectionTitle>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {NOTICED.map(n => (
            <button
              key={n.id}
              onClick={() => patch({ noticedMin: n.id })}
              style={{
                padding: isMobile ? '10px 15px' : '8px 15px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: form.noticedMin === n.id ? 'rgba(125,111,179,0.08)' : 'var(--bg-card)',
                border: form.noticedMin === n.id ? '1.5px solid var(--accent-purple)' : '1px solid var(--border)',
                color: form.noticedMin === n.id ? 'var(--accent-purple)' : 'var(--text-secondary)',
              }}
            >{n.label}</button>
          ))}
        </div>
      </div>

      {/* Описание */}
      <div>
        <SectionTitle>Описание</SectionTitle>
        <textarea
          value={form.description}
          onChange={e => patch({ description: e.target.value })}
          placeholder="Опишите проблему подробнее…"
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13.5, fontWeight: 500, outline: 'none', resize: 'vertical', minHeight: 90, fontFamily: 'inherit', lineHeight: 1.5 }}
        />
      </div>

      {/* Медиафайл */}
      <div>
        <SectionTitle>Медиафайл</SectionTitle>
        {form.photos.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {form.photos.map((p, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={p} alt="" style={{ width: 86, height: 86, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
                <button onClick={() => setForm(prev => ({ ...prev, photos: prev.photos.filter((_, x) => x !== i) }))} style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <label style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '28px 16px', borderRadius: 14, border: '2px dashed var(--border)', background: 'var(--bg-card)',
          color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
        }}>
          <Paperclip size={18} />
          Прикрепить фото (до 3)
          <input type="file" accept="image/*" multiple onChange={onPhoto} style={{ display: 'none' }} />
        </label>
      </div>

      {/* Кнопки */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={handleSend}
          disabled={!canSend || sending}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 26px', borderRadius: 12, border: 'none',
            flex: isMobile ? 1 : undefined, minHeight: isMobile ? 48 : undefined,
            background: 'var(--accent-purple)', color: '#fff', fontSize: 14, fontWeight: 800,
            cursor: canSend && !sending ? 'pointer' : 'default', opacity: canSend && !sending ? 1 : 0.45,
          }}
        >
          <Send size={15} /> {sending ? 'Сохранение…' : 'Сохранить событие'}
        </button>
        <button
          onClick={() => setForm(emptyState)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: isMobile ? '13px 16px' : '13px 20px', minHeight: isMobile ? 48 : undefined, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
        >
          <RotateCcw size={14} /> Сбросить
        </button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: -10 }}>
        Событие сохраняется в календаре истории (справа). Заявки разработчикам создаются отдельно — во вкладке InStudio.
      </div>
    </div>

    {/* ── Календарь: история заявок по дням. На мобильном — под формой, во всю ширину, ячейки меньше ── */}
    <div style={{ flex: isMobile ? '1 1 auto' : '1 1 520px', width: isMobile ? '100%' : undefined, minWidth: isMobile ? 0 : 380, maxWidth: isMobile ? '100%' : 720, boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 16 : 18, padding: isMobile ? 14 : 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isMobile ? 12 : 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: isMobile ? 13.5 : 15, fontWeight: 800, color: 'var(--text-primary)' }}>История событий · {club}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setMonth(m => subMonths(m, 1))} style={{ width: isMobile ? 38 : 34, height: isMobile ? 38 : 34, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={16} /></button>
          <span style={{ fontSize: isMobile ? 12.5 : 13.5, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'capitalize', minWidth: isMobile ? 90 : 110, textAlign: 'center' }}>{format(month, 'LLLL yyyy', { locale: ru })}</span>
          <button onClick={() => setMonth(m => addMonths(m, 1))} style={{ width: isMobile ? 38 : 34, height: isMobile ? 38 : 34, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={16} /></button>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isMobile ? 4 : 7 }}>
        {monthDays.map(d => {
          const key = format(d, 'yyyy-MM-dd');
          const dayTickets = ticketsByDay[key] || [];
          const hasIssues = dayTickets.length > 0;
          const okMark = !!dayMarks[key];
          const future = key > todayKey;
          return (
            <button
              key={key}
              onClick={() => !future && setOpenDay(key)}
              disabled={future}
              title={hasIssues ? `Событий: ${dayTickets.length}` : okMark ? 'Всё хорошо' : future ? '' : 'Нет отметки'}
              style={{
                aspectRatio: '1', borderRadius: isMobile ? 9 : 12, cursor: future ? 'default' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 2 : 4,
                minWidth: 0, padding: 0,
                background: isToday(d) ? 'rgba(125,111,179,0.1)' : 'var(--bg-hover)',
                border: isToday(d) ? '1.5px solid var(--accent-purple)' : '1px solid var(--border)',
                opacity: future ? 0.35 : 1,
              }}
            >
              <span style={{ fontSize: isMobile ? 12.5 : 15, fontWeight: 800, color: 'var(--text-primary)' }}>{format(d, 'd')}</span>
              {hasIssues ? (
                <span style={{ fontSize: isMobile ? 10 : 11.5, fontWeight: 900, color: '#B06A6A', background: 'rgba(176,106,106,0.13)', borderRadius: 7, padding: isMobile ? '1px 5px' : '2px 8px', lineHeight: 1.3 }}>{dayTickets.length}</span>
              ) : okMark ? (
                <CheckCircle2 size={isMobile ? 12 : 15} style={{ color: '#7d9c87' }} />
              ) : !future ? (
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--border)' }} />
              ) : <span style={{ height: isMobile ? 12 : 15 }} />}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ fontSize: 10.5, fontWeight: 900, color: '#B06A6A', background: 'rgba(176,106,106,0.13)', borderRadius: 5, padding: '1px 6px' }}>N</span> события</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={13} style={{ color: '#7d9c87' }} /> всё хорошо</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--border)' }} /> нет отметки</span>
      </div>
    </div>

    {/* ── Окно дня: заявки / всё хорошо / нет отметки. На мобильном — шторка снизу ── */}
    {openDay && ReactDOM.createPortal(
      <div onClick={() => setOpenDay(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: isMobile ? '100%' : 500, maxHeight: isMobile ? '86vh' : '84vh', overflowY: 'auto', background: 'var(--bg-card)', borderRadius: isMobile ? '20px 20px 0 0' : 16, border: '1px solid var(--border)', padding: isMobile ? '16px 16px 24px' : 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: 0, textTransform: 'capitalize' }}>
              {format(new Date(openDay + 'T12:00:00'), 'd MMMM, EEEE', { locale: ru })} · {club}
            </h3>
            <button onClick={() => setOpenDay(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
          </div>

          {openDayTickets.length > 0 ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Событий за день: {openDayTickets.length}</div>
              {openDayTickets.map(t => {
                const critColor = t.criticality === 'blocks' ? '#B06A6A' : t.criticality === 'annoys' ? '#b39a5e' : '#7d9c87';
                return (
                  <div key={t.id} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {t.criticalityLabel && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', color: critColor }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: critColor }} /> {t.criticalityLabel.split(' · ')[0]}
                        </span>
                      )}
                      {t.requestTypeLabel && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)' }}>{t.requestTypeLabel}</span>}
                      {t.affectedLabel && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)' }}>· {t.affectedLabel.split(' · ')[0]}</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{t.title}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>
                      {t.type}{t.zone ? ` · ${t.zone}` : ''} · {t.createdByName}
                    </div>
                    {t.description && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 5, lineHeight: 1.45 }}>{t.description}</div>}
                    {(t.photos || []).length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                        {t.photos.map((p, pi) => (
                          <img key={pi} src={p} alt="" style={{ width: 74, height: 74, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : openDayMark ? (
            <div style={{ padding: '26px 16px', textAlign: 'center', borderRadius: 12, background: 'rgba(125,156,135,0.07)', border: '1px solid rgba(125,156,135,0.3)' }}>
              <CheckCircle2 size={26} style={{ color: '#7d9c87', marginBottom: 8 }} />
              <div style={{ fontSize: 14, fontWeight: 800, color: '#7d9c87' }}>Всё хорошо</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>
                Отметил(а): {openDayMark.byName}{openDayMark.atISO ? ` · ${format(new Date(openDayMark.atISO), 'd MMM HH:mm', { locale: ru })}` : ''}
              </div>
            </div>
          ) : (
            <div style={{ padding: '26px 16px', textAlign: 'center', borderRadius: 12, background: 'var(--bg-hover)', border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-secondary)' }}>Нет отметки</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>За этот день никто ничего не отмечал</div>
              <button
                onClick={() => markDayOk(openDay)}
                disabled={markingOk}
                style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 18px', minHeight: isMobile ? 44 : undefined, borderRadius: 10, border: '1px solid rgba(125,156,135,0.45)', background: 'rgba(125,156,135,0.1)', color: '#7d9c87', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', opacity: markingOk ? 0.6 : 1 }}
              >
                <CheckCircle2 size={14} /> {markingOk ? 'Сохранение…' : 'Отметить: всё хорошо'}
              </button>
            </div>
          )}
        </div>
      </div>,
      document.body
    )}
    </div>
  );
};

export default DailyOpsReport;
