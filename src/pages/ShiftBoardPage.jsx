import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  Repeat, ClipboardList, AlertTriangle, Bell, Star, CalendarClock,
  Plus, X, Search, Pin, PinOff, Trash2, Check, Camera, Users, Eye, Clock, Reply,
  MessageSquare, Send, CornerDownRight,
} from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { pushNotify } from '../lib/pushNotify';
import { slackInStudioTicket } from '../lib/slackInStudio';
import { enablePush, isPushEnabled } from '../lib/push';
import { isMobileDevice } from '../lib/isMobile';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];

// Типы записей доски передачи смены
const TYPES = {
  handover:   { label: 'Передача смены',      color: '#5580A8', icon: Repeat,        checklist: true,  photo: true },
  task:       { label: 'Поручение',            color: '#C08F4F', icon: ClipboardList,  checklist: true,  photo: false, due: true },
  issue:      { label: 'Неисправность',        color: '#B06A6A', icon: AlertTriangle,  checklist: false, photo: true },
  reminder:   { label: 'Напоминание',          color: '#7D6FB3', icon: Bell,           checklist: false, photo: false },
  important:  { label: 'Важное сообщение',     color: '#C4A75A', icon: Star,           checklist: false, photo: false, pinDefault: true },
  next_shift: { label: 'Для следующей смены',  color: '#5F9C81', icon: CalendarClock,  checklist: true,  photo: false },
};
const TYPE_ORDER = ['handover', 'task', 'issue', 'reminder', 'important', 'next_shift'];

// Кто получает push по доске (все роли, которым вкладка доступна). Тег 'shift-board'
// открывает РОП/МОП в guard'е send-push (иначе им шлётся только Demo Day/лиды).
const SB_PUSH_ROLES = ['manager', 'admin', 'chef', 'komdir', 'rop', 'viewer', 'marketing'];

// Спец-режим для шефа/Ком-Дира: неисправности по ВСЕМ клубам в одной ленте
const ALL_ISSUES = '__ISSUES__';

// Сжатие фото (как в товарах/утерянных вещах)
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

// Кто на смене сегодня (та же логика, что в учёте полотенец)
const isWorkingShiftVal = (v) => { const c = String(v || '').trim().toLowerCase(); return !(!c || c === '—' || c === '-' || c === 'x' || c === 'х'); };
const getShiftEmployees = async (club) => {
  try {
    const now = new Date();
    const monthKey = format(now, 'yyyy-MM');
    const dayNum = String(now.getDate());
    const empSnap = await getDocs(query(collection(db, 'employees'), where('club', '==', club), where('monthKey', '==', monthKey)));
    const empMap = {};
    empSnap.docs.forEach(d => { const e = d.data(); if (e.name) empMap[d.id] = e.name; });
    const schedSnap = await getDocs(query(collection(db, 'schedules'), where('monthKey', '==', monthKey)));
    const seen = new Set(); const res = [];
    schedSnap.docs.forEach(d => {
      const data = d.data(); const name = empMap[data.employeeId];
      if (!name) return;
      const val = data.days?.[dayNum];
      if (!isWorkingShiftVal(val) || seen.has(name)) return;
      seen.add(name); res.push({ name, shiftTime: String(val).trim() });
    });
    res.sort((a, b) => { const t = s => { const [h, m] = (s || '').split(':').map(Number); return isNaN(h) ? 9999 : h * 60 + (m || 0); }; return t(a.shiftTime) - t(b.shiftTime); });
    return res;
  } catch { return []; }
};

const dayLabel = (iso) => {
  try {
    const d = new Date(iso); const today = new Date(); const yest = new Date(Date.now() - 86400000);
    if (d.toDateString() === today.toDateString()) return 'Сегодня';
    if (d.toDateString() === yest.toDateString()) return 'Вчера';
    return format(d, 'd MMMM', { locale: ru });
  } catch { return ''; }
};
const timeLabel = (iso) => { try { return format(new Date(iso), 'HH:mm'); } catch { return ''; } };

const ShiftBoardPage = () => {
  const { user } = useTickets();
  const role = user?.role;
  const myEmail = (user?.email || '').toLowerCase();
  const myName = user?.displayName || user?.email || '';
  const userClub = user?.club?.toUpperCase() || null;
  const canSeeAll = role === 'chef' || role === 'komdir';
  const isManager = role === 'chef' || role === 'manager';
  const visibleClubs = canSeeAll ? CLUBS : [userClub].filter(Boolean);

  // Мобильный режим — компактные карточки, ленты-фильтры, панели сверху
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const [activeClub, setActiveClub] = useState(userClub || '4YOU');
  const [entries, setEntries] = useState([]);
  const [shiftEmps, setShiftEmps] = useState([]);
  const [tab, setTab] = useState('all'); // 'all' | 'mine' | 'pinned'
  const [search, setSearch] = useState('');
  const [fType, setFType] = useState('');   // тип фильтра
  const [fAuthor, setFAuthor] = useState(''); // автор фильтра
  const [previewPhoto, setPreviewPhoto] = useState(null);

  // Треды (ответы в ветке, как в Slack)
  const [openThread, setOpenThread] = useState(null); // id записи с открытой веткой
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Push-предложение сверху
  const [pushOn, setPushOn] = useState(() => { try { return isPushEnabled(); } catch { return false; } });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushDismissed, setPushDismissed] = useState(() => { try { return localStorage.getItem('hj_sb_push_dismiss') === '1'; } catch { return false; } });
  const enableSbPush = async () => {
    setPushBusy(true);
    try { await enablePush(user); setPushOn(true); toast.success('Push включены — будете получать новые записи доски'); }
    catch (e) { toast.error(e?.message || 'Не удалось включить уведомления'); }
    finally { setPushBusy(false); }
  };
  const dismissPush = () => { setPushDismissed(true); try { localStorage.setItem('hj_sb_push_dismiss', '1'); } catch {} };

  // Создание записи
  const [showCreate, setShowCreate] = useState(false);
  const [cType, setCType] = useState('handover');
  const [cText, setCText] = useState('');
  const [cChecklist, setCChecklist] = useState([]); // [{text, done}]
  const [cChkInput, setCChkInput] = useState('');
  const [cPhotos, setCPhotos] = useState([]);
  const [cPinned, setCPinned] = useState(false);
  const [cDue, setCDue] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const club = canSeeAll ? activeClub : userClub;
  const isIssuesMode = canSeeAll && activeClub === ALL_ISSUES; // все неисправности по всем клубам

  useEffect(() => {
    if (!club) return;
    const base = collection(db, 'shift_board');
    // Режим неисправностей — читаем ВСЕ клубы (без фильтра), тип отсекаем на клиенте
    const q = club === ALL_ISSUES ? query(base) : query(base, where('club', '==', club));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
      setEntries(list);
    }, err => console.error('[shift_board]', err));
  }, [club]);

  useEffect(() => {
    if (club && club !== ALL_ISSUES) getShiftEmployees(club).then(setShiftEmps);
    else setShiftEmps([]);
  }, [club]);

  const authors = useMemo(() => [...new Set(entries.map(e => e.authorName).filter(Boolean))], [entries]);

  const filtered = useMemo(() => {
    let list = entries;
    if (isIssuesMode) list = list.filter(e => e.type === 'issue'); // только неисправности
    if (tab === 'mine') list = list.filter(e => (e.authorEmail || '').toLowerCase() === myEmail);
    if (tab === 'pinned') list = list.filter(e => e.pinned);
    if (fType) list = list.filter(e => e.type === fType);
    if (fAuthor) list = list.filter(e => e.authorName === fAuthor);
    const s = search.trim().toLowerCase();
    if (s) list = list.filter(e => (e.text || '').toLowerCase().includes(s) || (e.authorName || '').toLowerCase().includes(s) || (e.checklist || []).some(c => (c.text || '').toLowerCase().includes(s)));
    return list;
  }, [entries, tab, fType, fAuthor, search, myEmail, isIssuesMode]);

  const pinned = useMemo(() => filtered.filter(e => e.pinned), [filtered]);
  const rest = useMemo(() => filtered.filter(e => !e.pinned), [filtered]);

  // Меньше шума: по умолчанию показываем последние 7 дней, старое — по кнопке
  const [showOld, setShowOld] = useState(false);
  const [expandedTexts, setExpandedTexts] = useState(() => new Set()); // раскрытые длинные тексты
  const weekAgoISO = useMemo(() => new Date(Date.now() - 7 * 86400000).toISOString(), []);
  const recent = useMemo(() => rest.filter(e => (e.createdAtISO || '') >= weekAgoISO), [rest, weekAgoISO]);
  const olderCount = rest.length - recent.length;
  const visibleRest = showOld ? rest : recent;

  // Группировка по дню (Сегодня / Вчера / дата)
  const grouped = useMemo(() => {
    const groups = [];
    let cur = null;
    for (const e of visibleRest) {
      const lbl = dayLabel(e.createdAtISO);
      if (!cur || cur.label !== lbl) { cur = { label: lbl, items: [] }; groups.push(cur); }
      cur.items.push(e);
    }
    return groups;
  }, [visibleRest]);

  const stats = useMemo(() => {
    const total = entries.length;
    const today = entries.filter(e => dayLabel(e.createdAtISO) === 'Сегодня').length;
    const unread = entries.filter(e => !(e.readBy || []).includes(myEmail)).length;
    const pin = entries.filter(e => e.pinned).length;
    return { total, today, unread, pin };
  }, [entries, myEmail]);

  // ── actions ──
  const markRead = async (e) => {
    if ((e.readBy || []).includes(myEmail)) return;
    try { await updateDoc(doc(db, 'shift_board', e.id), { readBy: arrayUnion(myEmail) }); } catch {}
  };
  const togglePin = async (e) => {
    try { await updateDoc(doc(db, 'shift_board', e.id), { pinned: !e.pinned }); } catch { toast.error('Не удалось'); }
  };
  const removeEntry = async (e) => {
    if (!window.confirm('Удалить запись?')) return;
    try { await deleteDoc(doc(db, 'shift_board', e.id)); toast.success('Удалено'); } catch { toast.error('Не удалось удалить'); }
  };
  const toggleChkItem = async (e, idx) => {
    const cl = (e.checklist || []).map((c, i) => i === idx ? { ...c, done: !c.done } : c);
    try { await updateDoc(doc(db, 'shift_board', e.id), { checklist: cl }); } catch {}
  };
  const sendReply = async (e) => {
    const t = replyText.trim();
    if (!t) return;
    setSendingReply(true);
    try {
      await updateDoc(doc(db, 'shift_board', e.id), {
        thread: arrayUnion({ authorName: myName, authorEmail: myEmail, authorRole: role || '', text: t, ts: new Date().toISOString() }),
      });
      pushNotify({
        title: `💬 Ответ · ${TYPES[e.type]?.label || 'Запись'} · ${club}`,
        body: `${myName}: ${t.slice(0, 90)}`,
        club, excludeEmail: myEmail, url: '/shift-board', roles: SB_PUSH_ROLES, tag: 'shift-board',
      });
      setReplyText('');
    } catch { toast.error('Не удалось отправить'); }
    finally { setSendingReply(false); }
  };
  const pluralReplies = (n) => { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return 'ответов'; if (b > 1 && b < 5) return 'ответа'; if (b === 1) return 'ответ'; return 'ответов'; };

  // ?create=1 (кнопка «+» в мобильной навигации) → сразу открываем создание записи
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('create') === '1') {
        openCreate('handover');
        params.delete('create');
        window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = (type = 'handover') => {
    setCType(type); setCText(''); setCChecklist([]); setCChkInput(''); setCPhotos([]);
    setCPinned(!!TYPES[type].pinDefault); setCDue('');
    setShowCreate(true);
  };
  const addChk = () => { const t = cChkInput.trim(); if (!t) return; setCChecklist(p => [...p, { text: t, done: false }]); setCChkInput(''); };
  const onPhoto = async (ev) => {
    const files = [...(ev.target.files || [])].slice(0, 4);
    for (const f of files) { if (f.type.startsWith('image/')) { try { const b = await compressImageToBase64(f); setCPhotos(p => [...p, b].slice(0, 4)); } catch {} } }
    ev.target.value = '';
  };

  const submit = async () => {
    if (!club) return;
    if (!cText.trim() && cChecklist.length === 0 && cPhotos.length === 0) return toast.error('Добавьте текст, пункты или фото');
    setSaving(true);
    try {
      const postRef = await addDoc(collection(db, 'shift_board'), {
        club, type: cType,
        text: cText.trim(),
        checklist: TYPES[cType].checklist ? cChecklist : [],
        photos: TYPES[cType].photo ? cPhotos : [],
        pinned: cPinned,
        dueDate: (TYPES[cType].due && cDue) ? cDue : null,
        authorName: myName, authorEmail: myEmail, authorRole: role || '',
        readBy: [myEmail],
        createdAtISO: new Date().toISOString(),
      });
      // Неисправность с доски задач автоматически падает заявкой в InStudio
      if (cType === 'issue') {
        const text = cText.trim() || 'Неисправность (см. фото на Доске задач)';
        try {
          const insRef = await addDoc(collection(db, 'instudio_tickets'), {
            club, zone: null, type: 'Другое',
            title: text.length > 90 ? `${text.slice(0, 90)}…` : text,
            description: text.length > 90 ? text : null,
            priority: 'low', recurring: false,
            status: 'new', assignee: null, assigneeEmail: null,
            source: 'shift-board', sourceId: postRef.id,
            createdByName: myName, createdByEmail: myEmail,
            createdAtISO: new Date().toISOString(),
            updatedAt: serverTimestamp(),
          });
          slackInStudioTicket({
            id: insRef.id, club, type: 'Другое',
            title: text.length > 90 ? `${text.slice(0, 90)}…` : text,
            priority: 'low', source: 'shift-board', createdByName: myName,
          });
        } catch (err) { console.error('[shift-board→instudio]', err); }
      }
      pushNotify({
        title: `${TYPES[cType].label} · ${club}`,
        body: `${myName}: ${(cText.trim() || TYPES[cType].label).slice(0, 90)}`,
        club, excludeEmail: myEmail, url: '/shift-board',
        roles: SB_PUSH_ROLES, tag: 'shift-board',
      });
      toast.success('Запись добавлена');
      setShowCreate(false);
    } catch (e) { toast.error('Не удалось: ' + (e?.message || e)); }
    finally { setSaving(false); }
  };

  const th = TYPES[cType];

  // ── entry card (render-функция, НЕ вложенный компонент — иначе инпут ветки терял бы фокус на каждом символе) ──
  const renderCard = (e) => {
    const t = TYPES[e.type] || TYPES.handover;
    const Icon = t.icon;
    const readCount = (e.readBy || []).length;
    const iRead = (e.readBy || []).includes(myEmail);
    const canManage = isManager || (e.authorEmail || '').toLowerCase() === myEmail;
    const threadCount = (e.thread || []).length;
    const threadOpen = openThread === e.id;
    return (
      <div key={e.id} onMouseEnter={() => markRead(e)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${t.color}`, borderRadius: isMobile ? 14 : 16, padding: isMobile ? '11px 12px' : '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: `${t.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={16} style={{ color: t.color }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: t.color }}>{t.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{e.authorName}{e.authorRole ? ` · ${e.authorRole}` : ''}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {isIssuesMode && e.club && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent-purple)', background: 'rgba(125,111,179,0.12)', border: '1px solid rgba(125,111,179,0.25)', padding: '2px 8px', borderRadius: 7 }}>{e.club}</span>}
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> {timeLabel(e.createdAtISO)}</span>
            {isManager && (
              <button onClick={() => togglePin(e)} title={e.pinned ? 'Открепить' : 'Закрепить'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: e.pinned ? '#C4A75A' : 'var(--text-muted)', lineHeight: 0, padding: 2 }}>
                {e.pinned ? <Pin size={14} fill="#C4A75A" /> : <Pin size={14} />}
              </button>
            )}
            {canManage && (
              <button onClick={() => removeEntry(e)} title="Удалить" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 0, padding: 2 }}><Trash2 size={13} /></button>
            )}
          </div>
        </div>

        {e.text && (() => {
          const long = e.text.length > 280;
          const open = expandedTexts.has(e.id);
          const shown = long && !open ? e.text.slice(0, 280).trimEnd() + '…' : e.text;
          return (
            <div style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.55, whiteSpace: 'pre-wrap', marginBottom: (e.checklist?.length || e.photos?.length) ? 10 : 0 }}>
              {shown}
              {long && (
                <button onClick={(ev) => { ev.stopPropagation(); setExpandedTexts(p => { const n = new Set(p); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; }); }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', cursor: 'pointer', fontSize: 12, fontWeight: 800, padding: '0 0 0 6px' }}>
                  {open ? 'свернуть' : 'ещё'}
                </button>
              )}
            </div>
          );
        })()}

        {e.dueDate && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, color: '#C08F4F', background: 'rgba(192,143,79,0.1)', border: '1px solid rgba(192,143,79,0.2)', borderRadius: 8, padding: '3px 9px', marginBottom: 8 }}>
            <CalendarClock size={11} /> Срок: {(() => { try { return format(new Date(e.dueDate + 'T12:00:00'), 'd MMM yyyy', { locale: ru }); } catch { return e.dueDate; } })()}
          </div>
        )}

        {(e.checklist?.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: (e.photos?.length ? 10 : 0) }}>
            {e.checklist.map((c, i) => (
              <button key={i} onClick={() => toggleChkItem(e, i)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
                <span style={{ width: 17, height: 17, borderRadius: 5, border: '1.5px solid ' + (c.done ? '#5F9C81' : 'var(--border)'), background: c.done ? '#5F9C81' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {c.done && <Check size={12} color="#fff" strokeWidth={3} />}
                </span>
                <span style={{ fontSize: 13, color: c.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: c.done ? 'line-through' : 'none' }}>{c.text}</span>
              </button>
            ))}
          </div>
        )}

        {(e.photos?.length > 0) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {e.photos.map((p, i) => (
              <img key={i} src={p} alt="" onClick={() => setPreviewPhoto(p)} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, cursor: 'zoom-in', border: '1px solid var(--border)' }} />
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Eye size={12} /> Прочитали {readCount}</span>
          {/* На мобильном кнопки треда/прочтения — крупнее (зона нажатия ≥40px) */}
          <button onClick={() => { setReplyText(''); setOpenThread(threadOpen ? null : e.id); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: isMobile ? '10px 13px' : '5px 10px', minHeight: isMobile ? 40 : undefined, borderRadius: 9, border: '1px solid ' + (threadOpen ? 'var(--accent-purple)' : 'var(--border)'), background: threadOpen ? 'rgba(125,111,179,0.12)' : 'transparent', color: threadOpen ? 'var(--accent-purple)' : 'var(--text-secondary)', fontSize: isMobile ? 12 : 11, fontWeight: 800, cursor: 'pointer' }}>
            <MessageSquare size={12} /> {threadCount > 0 ? `${threadCount} ${pluralReplies(threadCount)}` : 'Ответить'}
          </button>
          <button onClick={() => markRead(e)} disabled={iRead} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: isMobile ? '10px 14px' : '5px 12px', minHeight: isMobile ? 40 : undefined, borderRadius: 9, border: '1px solid ' + (iRead ? 'rgba(95,156,129,0.3)' : 'var(--border)'), background: iRead ? 'rgba(95,156,129,0.1)' : 'transparent', color: iRead ? '#5F9C81' : 'var(--text-secondary)', fontSize: isMobile ? 12 : 11, fontWeight: 800, cursor: iRead ? 'default' : 'pointer' }}>
            <Check size={12} /> {iRead ? 'Ознакомлен' : 'Ознакомиться'}
          </button>
        </div>

        {/* Ветка обсуждения (thread) — свёрнута по умолчанию, открывается кнопкой */}
        {threadOpen && (
          <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(e.thread || []).map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 900, color: 'var(--accent-purple)' }}>{(m.authorName || '?').slice(0, 1).toUpperCase()}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{m.authorName}</span>
                    {m.authorRole && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{m.authorRole}</span>}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{(() => { try { return format(new Date(m.ts), 'd MMM HH:mm', { locale: ru }); } catch { return ''; } })()}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                </div>
              </div>
            ))}
            {threadOpen && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <CornerDownRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input value={replyText} onChange={ev => setReplyText(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendReply(e); } }} placeholder="Написать в ветку…" autoFocus style={{ flex: 1, minWidth: 0, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: isMobile ? '10px 12px' : '8px 11px', fontSize: 13, color: 'var(--text-primary)', outline: 'none' }} />
                <button onClick={() => sendReply(e)} disabled={sendingReply || !replyText.trim()} style={{ padding: isMobile ? '10px 13px' : '8px 11px', minHeight: isMobile ? 40 : undefined, minWidth: isMobile ? 40 : undefined, borderRadius: 10, border: 'none', background: replyText.trim() ? 'var(--accent-purple)' : 'var(--bg-hover)', color: replyText.trim() ? '#fff' : 'var(--text-muted)', cursor: replyText.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0, flexShrink: 0 }}><Send size={15} /></button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Панель «Создать запись»: сетка 2 колонки; на мобильном — крупные зоны нажатия (≥48px)
  const renderCreatePanel = () => (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: isMobile ? 12 : 14 }}>
      <div style={{ fontSize: isMobile ? 10 : 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Создать запись</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? 8 : 6 }}>
        {TYPE_ORDER.map(k => { const t = TYPES[k]; const Icon = t.icon; return (
          <button key={k} onClick={() => openCreate(k)} title={t.label} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: isMobile ? '12px 10px' : '8px 9px', minHeight: isMobile ? 48 : undefined, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: isMobile ? 12 : 11, fontWeight: isMobile ? 800 : 700, textAlign: 'left', minWidth: 0 }}>
            <Icon size={isMobile ? 16 : 14} style={{ color: t.color, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
          </button>
        ); })}
      </div>
    </div>
  );

  // Статистика — одна компактная строка (и на мобильном, и в сайдбаре)
  const renderStats = () => (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: isMobile ? '10px 12px' : '12px 14px', display: 'flex', justifyContent: 'space-between', textAlign: 'center', gap: 8 }}>
      {[['Всего', stats.total, 'var(--text-primary)'], ['Сегодня', stats.today, '#5F9C81'], ['Непрочит.', stats.unread, stats.unread ? '#B06A6A' : 'var(--text-muted)'], ['Закреп.', stats.pin, '#C4A75A']].map(([l, v, c]) => (
        <div key={l} style={{ minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 16 : 17, fontWeight: 900, color: c, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{v}</div>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{l}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: isMobile ? 10 : 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: isMobile ? 36 : 40, height: isMobile ? 36 : 40, borderRadius: 12, background: 'rgba(85,128,168,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Repeat size={isMobile ? 18 : 20} style={{ color: '#5580A8' }} />
          </div>
          <div>
            <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Доска задач</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>{isIssuesMode ? 'Только неисправности · все клубы' : 'Смена: передачи, поручения, неисправности, напоминания'}</p>
          </div>
        </div>
        {/* На мобильном: клубные табы — горизонтальная лента без переноса, кнопка — на всю ширину */}
        <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' } : { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {(canSeeAll || visibleClubs.length > 1) && (
            <div style={isMobile
              ? { display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }
              : { display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {canSeeAll && (
                <button key="__issues__" onClick={() => setActiveClub(ALL_ISSUES)} title="Неисправности по всем клубам"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: isMobile ? '9px 14px' : '6px 12px', borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, border: '1px solid ' + (isIssuesMode ? '#B06A6A' : 'rgba(176,106,106,0.4)'), background: isIssuesMode ? '#B06A6A' : 'transparent', color: isIssuesMode ? '#fff' : '#B06A6A' }}>
                  <AlertTriangle size={13} /> Неисправности
                </button>
              )}
              {visibleClubs.map(c => (
                <button key={c} onClick={() => setActiveClub(c)} style={{ padding: isMobile ? '9px 14px' : '6px 12px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, border: '1px solid ' + (activeClub === c && !isIssuesMode ? 'var(--accent-purple)' : 'var(--border)'), background: activeClub === c && !isIssuesMode ? 'var(--accent-purple)' : 'transparent', color: activeClub === c && !isIssuesMode ? '#fff' : 'var(--text-muted)' }}>{c}</button>
              ))}
            </div>
          )}
          {!isIssuesMode && (
            <button onClick={() => openCreate('handover')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 16px', minHeight: isMobile ? 44 : undefined, width: isMobile ? '100%' : undefined, borderRadius: 12, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
              <Plus size={16} /> Новая запись
            </button>
          )}
        </div>
      </div>

      {/* Предложение включить push для этой вкладки */}
      {!pushOn && !pushDismissed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'linear-gradient(120deg, rgba(125,111,179,0.14), rgba(85,128,168,0.06))', border: '1px solid rgba(125,111,179,0.28)', borderRadius: 16, padding: '13px 16px', flexWrap: 'wrap' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(125,111,179,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bell size={20} style={{ color: '#9C8FC4' }} />
          </div>
          <div style={{ minWidth: 160, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>Включить push для доски задач?</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>Будете сразу узнавать о новых записях и ответах в ветках этой доски.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={enableSbPush} disabled={pushBusy} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 12, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: pushBusy ? 0.6 : 1 }}>
              <Bell size={15} /> {pushBusy ? 'Включаем…' : 'Включить'}
            </button>
            <button onClick={dismissPush} title="Не сейчас" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Мобильный: панель создания и статистика — сверху, до ленты */}
      {isMobile && !isIssuesMode && renderCreatePanel()}
      {isMobile && renderStats()}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 260px', gap: isMobile ? 12 : 16, alignItems: 'start' }} className="shift-board-grid">
        {/* MAIN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 14, minWidth: 0 }}>
          {/* Tabs + search */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['all', 'Все записи'], ['mine', 'Мои']].map(([id, l]) => (
                <button key={id} onClick={() => setTab(id)} style={{ padding: isMobile ? '10px 16px' : '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', border: '1px solid ' + (tab === id ? 'var(--accent-purple)' : 'var(--border)'), background: tab === id ? 'var(--accent-purple)' : 'transparent', color: tab === id ? '#fff' : 'var(--text-muted)' }}>{l}</button>
              ))}
            </div>
            <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по доске…" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 36px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, outline: 'none' }} />
            </div>
          </div>

          {/* Мобильный: типы записей — лента-фильтр горизонтальным скроллом */}
          {isMobile && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
              <button onClick={() => setFType('')} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer', border: '1px solid ' + (!fType ? 'var(--accent-purple)' : 'var(--border)'), background: !fType ? 'rgba(125,111,179,0.12)' : 'var(--bg-card)', color: !fType ? 'var(--accent-purple)' : 'var(--text-muted)' }}>Все типы</button>
              {TYPE_ORDER.map(k => { const t = TYPES[k]; return (
                <button key={k} onClick={() => setFType(fType === k ? '' : k)} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer', border: '1px solid ' + (fType === k ? t.color : 'var(--border)'), background: fType === k ? `${t.color}18` : 'var(--bg-card)', color: fType === k ? t.color : 'var(--text-muted)' }}>{t.label}</button>
              ); })}
            </div>
          )}

          {/* Pinned */}
          {tab !== 'pinned' && pinned.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: '#C4A75A', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}><Pin size={11} fill="#C4A75A" /> Закреплено сверху</div>
              {pinned.map(e => renderCard(e))}
            </div>
          )}

          {/* Feed grouped by day */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
              {isIssuesMode ? 'Неисправностей по клубам нет 🎉' : 'Записей пока нет. Нажмите «Новая запись».'}
            </div>
          ) : grouped.map((g, gi) => (
            <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 900, color: 'var(--accent-purple)', background: 'rgba(125,111,179,0.1)', padding: '3px 10px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{g.label}</div>
              {g.items.map(e => renderCard(e))}
            </div>
          ))}

          {!showOld && olderCount > 0 && (
            <button onClick={() => setShowOld(true)} style={{ padding: '11px', borderRadius: 12, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              Показать старые записи ({olderCount})
            </button>
          )}
        </div>

        {/* SIDEBAR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} className="shift-board-side">
          {/* Создать запись — на мобильном панель уже показана сверху */}
          {!isMobile && !isIssuesMode && renderCreatePanel()}

          {/* Фильтры */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Фильтры</div>
            {/* На мобильном тип фильтруется лентой чипов над лентой записей */}
            {!isMobile && (<>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>Тип записи</label>
            <select value={fType} onChange={e => setFType(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, marginBottom: 10, padding: '9px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, outline: 'none' }}>
              <option value="">Все типы</option>
              {TYPE_ORDER.map(k => <option key={k} value={k}>{TYPES[k].label}</option>)}
            </select>
            </>)}
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>Автор</label>
            <select value={fAuthor} onChange={e => setFAuthor(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, marginBottom: 10, padding: '9px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, outline: 'none' }}>
              <option value="">Все авторы</option>
              {authors.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {(fType || fAuthor || search) && (
              <button onClick={() => { setFType(''); setFAuthor(''); setSearch(''); }} style={{ width: '100%', padding: '9px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Сбросить фильтры</button>
            )}
          </div>

          {/* Статистика — компактная строка (на мобильном показана сверху) */}
          {!isMobile && renderStats()}

          {/* Кто на смене */}
          {!isIssuesMode && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={13} /> Кто на смене</div>
            {shiftEmps.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Нет данных по смене на сегодня</div>
            ) : shiftEmps.map((emp, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#5F9C81', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)' }}>{emp.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{emp.shiftTime}</div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>

      {/* ── Модалка создания ── */}
      {showCreate && ReactDOM.createPortal((
        // На мобильном модалка создания — шторка, прижатая к низу
        <div onClick={() => !saving && setShowCreate(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: isMobile ? '100%' : 460, background: 'var(--bg-card)', borderRadius: isMobile ? '20px 20px 0 0' : 20, border: '1px solid var(--border)', padding: isMobile ? '16px 16px 24px' : 20, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: isMobile ? '92vh' : '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Новая запись · {club}</h3>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
            </div>

            {/* Тип */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TYPE_ORDER.map(k => { const t = TYPES[k]; const Icon = t.icon; const active = cType === k; return (
                <button key={k} onClick={() => { setCType(k); setCPinned(!!t.pinDefault); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 10, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', border: '1px solid ' + (active ? t.color : 'var(--border)'), background: active ? `${t.color}18` : 'transparent', color: active ? t.color : 'var(--text-muted)' }}>
                  <Icon size={13} /> {t.label}
                </button>
              ); })}
            </div>

            <textarea value={cText} onChange={e => setCText(e.target.value)} placeholder="Текст записи…" rows={3} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 13px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontWeight: 500, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />

            {/* Срок (для поручения) */}
            {th.due && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Срок:</span>
                <input type="date" value={cDue} onChange={e => setCDue(e.target.value)} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontWeight: 700 }} />
              </div>
            )}

            {/* Чек-лист */}
            {th.checklist && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Пункты (чек-лист)</span>
                {cChecklist.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 5, border: '1.5px solid var(--border)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{c.text}</span>
                    <button onClick={() => setCChecklist(p => p.filter((_, x) => x !== i))} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 0 }}><X size={14} /></button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={cChkInput} onChange={e => setCChkInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChk())} placeholder="Добавить пункт…" style={{ flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px', fontSize: 13, color: 'var(--text-primary)', outline: 'none' }} />
                  <button onClick={addChk} style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: 'var(--bg-hover)', color: 'var(--accent-purple)', fontWeight: 800, cursor: 'pointer' }}><Plus size={16} /></button>
                </div>
              </div>
            )}

            {/* Фото */}
            {th.photo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPhoto} style={{ display: 'none' }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {cPhotos.map((p, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={p} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
                      <button onClick={() => setCPhotos(prev => prev.filter((_, x) => x !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#B06A6A', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}><X size={11} /></button>
                    </div>
                  ))}
                  {cPhotos.length < 4 && (
                    <button onClick={() => fileRef.current?.click()} style={{ width: 60, height: 60, borderRadius: 10, border: '2px dashed var(--border)', background: 'var(--bg-hover)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Camera size={20} /></button>
                  )}
                </div>
              </div>
            )}

            {/* Закрепить */}
            {isManager && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={cPinned} onChange={e => setCPinned(e.target.checked)} /> Закрепить сверху
              </label>
            )}

            <button onClick={submit} disabled={saving} style={{ padding: '13px', borderRadius: 14, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Сохранение…' : 'Опубликовать'}
            </button>
          </div>
        </div>
      ), document.body)}

      {/* Просмотр фото */}
      {previewPhoto && ReactDOM.createPortal((
        <div onClick={() => setPreviewPhoto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          <img src={previewPhoto} alt="" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 16 }} />
        </div>
      ), document.body)}

      {/* На мобильном лента идёт ПЕРВОЙ — панели (создать/фильтры/статистика) ниже */}
      <style>{`@media (max-width: 900px){ .shift-board-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
};

export default ShiftBoardPage;
