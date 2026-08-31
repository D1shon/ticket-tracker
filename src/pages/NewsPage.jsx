import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Newspaper, Send, Plus, Trash2, X, Eye, Check, Edit3 } from 'lucide-react';
import { isMobileDevice } from '../lib/isMobile';
import { useTickets, USER_ROLES } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';
import ShiftBoardAnnounce from '../components/news/ShiftBoardAnnounce';
import CalendarAnnounce from '../components/news/CalendarAnnounce';
import InStudioAnnounce from '../components/news/InStudioAnnounce';
import SizesAnnounce from '../components/news/SizesAnnounce';

// Богатые шаблоны новостей (рендерятся вместо текста при p.template === key)
const RICH_TEMPLATES = {
  'shift-board': ShiftBoardAnnounce,
  'calendar': CalendarAnnounce,
  'instudio': InStudioAnnounce,
  'merch-sizes': SizesAnnounce,
};

// ── Визуальное оформление текста новости при отображении ──
// Приходящие релизы — сплошной монотонный текст. Разбираем его на лету:
// заголовок, секции («…:»), буллеты «• Название — описание» (название жирным).
// Сам текст в базе НЕ меняется — это только рендер, дублей/правок не создаёт.
// Тематические эмодзи для оформления (подбираются по ключевым словам,
// только если в строке ещё нет своего эмодзи)
const HAS_EMOJI = /\p{Extended_Pictographic}/u;
const SECTION_EMOJI = [
  [/что нового/i, '✨'],
  [/техническ/i, '⚙️'],
  [/исправлен|фикс|баг/i, '🛠️'],
  [/важно|внимани/i, '❗'],
];
const BULLET_EMOJI = [
  [/приложени|мобильн/i, '📱'],
  [/отч[её]т|аналитик|статистик|дашборд/i, '📊'],
  [/оплат|плат[её]ж|билет|касс|цен/i, '💳'],
  [/расписани|календар|недел|график/i, '📅'],
  [/сезон|наград|приз|лидерборд|клан|итог/i, '🏆'],
  [/анкет|клиент|атлет|профил|карточк/i, '🙋'],
  [/тумблер|настройк|переключ|админк/i, '⚙️'],
  [/чат|сообщени|уведомлен|push|пуш/i, '💬'],
  [/цел|вес|прогресс|трениров/i, '🎯'],
  [/qr|скан|чекин/i, '🔳'],
  [/пульс|датчик/i, '❤️'],
];
const pickEmoji = (rules, s) => (rules.find(([re]) => re.test(s)) || [])[1] || null;

const renderNewsText = (raw) => {
  const lines = String(raw || '').split('\n');
  // Релизы дублируют заголовок первой строкой без эмодзи — прячем её,
  // если следующая содержательная строка повторяет тот же текст
  let start = 0;
  const firstIdx = lines.findIndex(l => l.trim());
  if (firstIdx !== -1) {
    const first = lines[firstIdx].trim();
    const next = lines.slice(firstIdx + 1).find(l => l.trim());
    if (next && first.length > 3 && next.includes(first) && next.trim() !== first) start = firstIdx + 1;
  }
  const out = [];
  let titleDone = false;
  for (let i = start; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    const k = `l${i}`;
    if (/^[•\-–▪]\s/.test(t)) {
      const body = t.replace(/^[•\-–▪]\s*/, '');
      const m = body.match(/^(.{2,80}?)\s+—\s+([\s\S]+)$/);
      const emoji = !HAS_EMOJI.test(body) ? pickEmoji(BULLET_EMOJI, m ? m[1] : body) : null;
      out.push(
        <div key={k} style={{ display: 'flex', gap: 9, marginTop: 8, alignItems: 'flex-start' }}>
          {emoji
            ? <span style={{ fontSize: 13, flexShrink: 0, lineHeight: '21px' }}>{emoji}</span>
            : <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-purple)', flexShrink: 0, marginTop: 8 }} />}
          <span style={{ minWidth: 0 }}>
            {m ? <><span style={{ fontWeight: 800 }}>{m[1]}</span> — {m[2]}</> : body}
          </span>
        </div>
      );
      titleDone = true;
    } else if (!titleDone) {
      out.push(<div key={k} style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 2 }}>{HAS_EMOJI.test(t) ? t : `🗞️ ${t}`}</div>);
      titleDone = true;
    } else if (/:$/.test(t) && t.length <= 48) {
      const label = t.replace(/:$/, '');
      const emoji = !HAS_EMOJI.test(label) ? (pickEmoji(SECTION_EMOJI, label) || '📌') : null;
      out.push(<div key={k} style={{ fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginTop: 14 }}>{emoji ? `${emoji} ${label}` : label}</div>);
    } else {
      out.push(<div key={k} style={{ marginTop: 8 }}>{t}</div>);
    }
  }
  return out;
};

const NewsPage = () => {
  const { user } = useTickets();
  // Публиковать и удалять новости может только Дильшат (и Claude через базу)
  const canPost = (user?.email || '').toLowerCase() === 'dilshat.r@hj.fit';
  // Окошко «Менеджерам» видят только менеджеры и шефы
  const canSeeManagers = user?.role === 'manager' || user?.role === 'chef';
  // Окошко «Отдел продаж» — Ком-Дир, РОПы и шефы
  const canSeeSales = user?.role === 'komdir' || user?.role === 'rop' || user?.role === 'chef';
  // Панель «кто посмотрел» — шефы (вся сеть) и менеджеры (только свой клуб)
  const canSeeViews = user?.role === 'chef' || user?.role === 'manager';

  const [posts, setPosts] = useState([]);
  const [audienceTab, setAudienceTab] = useState('all'); // 'all' | 'managers'
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState('');
  const [newAudience, setNewAudience] = useState('all');
  const [newTemplate, setNewTemplate] = useState(''); // '' = обычный текст, иначе ключ RICH_TEMPLATES
  const [editingPost, setEditingPost] = useState(null); // пост в режиме редактирования

  const openEdit = (post) => {
    setEditingPost(post);
    setNewText(post.text || '');
    setNewAudience(post.audience || 'all');
    setNewTemplate(post.template || '');
    setShowAdd(true);
  };
  const closeModal = () => { setShowAdd(false); setEditingPost(null); setNewText(''); setNewTemplate(''); setNewAudience('all'); };
  const [saving, setSaving] = useState(false);
  // Просмотры (только для Дильшата): news_seen/{email} → { lastSeenISO, name, role, club }
  const [seenMap, setSeenMap] = useState({});
  // Явное «Ознакомлен» по каждому посту: news_acks/{postId__email} → ставит галочку в просмотрах
  const [ackMap, setAckMap] = useState({}); // { postId: Set(email) }
  const [viewPostId, setViewPostId] = useState(null);
  const [isWide, setIsWide] = useState(() => window.innerWidth > 1080);
  // Мобильный режим: компактные карточки, лента чипов, просмотры — в шторке снизу
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  const [sheetPostId, setSheetPostId] = useState(null); // пост, чьи просмотры открыты в мобильной шторке
  const lastSeenWrittenRef = useRef('');

  useEffect(() => {
    const handler = () => { setIsWide(window.innerWidth > 1080); setIsMobile(isMobileDevice()); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    if (!canSeeViews) return;
    return onSnapshot(collection(db, 'news_seen'), snap => {
      const m = {};
      snap.docs.forEach(d => { m[(d.id || '').toLowerCase()] = d.data(); });
      setSeenMap(m);
    }, err => console.error('[news_seen]', err));
  }, [canSeeViews]);

  useEffect(() => {
    return onSnapshot(collection(db, 'news_posts'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.postedAtISO || '').localeCompare(a.postedAtISO || ''));
      setPosts(list);
    }, err => console.error('[news_posts]', err));
  }, []);

  // Подтверждения «Ознакомлен» — нужны и сотруднику (состояние кнопки), и панели просмотров
  useEffect(() => {
    return onSnapshot(collection(db, 'news_acks'), snap => {
      const m = {};
      snap.docs.forEach(d => {
        const a = d.data();
        if (a.postId && a.email) (m[a.postId] = m[a.postId] || new Set()).add((a.email || '').toLowerCase());
      });
      setAckMap(m);
    }, err => console.error('[news_acks]', err));
  }, []);

  const myEmail = (user?.email || '').toLowerCase().trim();
  const hasAcked = (post) => !!(ackMap[post.id] && ackMap[post.id].has(myEmail));
  const ackPost = async (post) => {
    if (!myEmail || hasAcked(post)) return;
    try {
      await setDoc(doc(db, 'news_acks', `${post.id}__${myEmail}`), {
        postId: post.id,
        email: myEmail,
        name: user?.displayName || '',
        role: user?.role || '',
        club: user?.club || null,
        ackedAtISO: new Date().toISOString(),
        createdAt: serverTimestamp(),
      });
      toast.success('Отмечено: ознакомлен');
    } catch { toast.error('Не удалось отметить'); }
  };

  // Посты, доступные этой роли
  const visiblePosts = posts.filter(p =>
    (p.audience !== 'managers' || canSeeManagers) &&
    (p.audience !== 'sales' || canSeeSales)
  );
  const generalPosts = visiblePosts.filter(p => p.audience !== 'managers' && p.audience !== 'sales');
  const managerPosts = visiblePosts.filter(p => p.audience === 'managers');
  const salesPosts   = visiblePosts.filter(p => p.audience === 'sales');
  const shownPosts = canSeeManagers && audienceTab === 'managers' ? managerPosts
    : canSeeSales && audienceTab === 'sales' ? salesPosts
    : generalPosts;

  // Просмотр в облаке (панель «кто посмотрел» у Дильшата) — по факту открытия страницы.
  // ВАЖНО: локальный hj_news_seen здесь больше НЕ трогаем — прочитанность считается
  // по каждой вкладке отдельно (см. эффект ниже), чтобы точка «Менеджерам»/«Отдел продаж»
  // не гасла, пока их вкладку реально не открыли.
  useEffect(() => {
    if (visiblePosts.length === 0) return;
    const newest = visiblePosts[0].postedAtISO || new Date().toISOString();
    const email = (user?.email || '').toLowerCase().trim();
    if (!email || lastSeenWrittenRef.current === newest) return;
    lastSeenWrittenRef.current = newest;
    setDoc(doc(db, 'news_seen', email), {
      email,
      name: user?.displayName || '',
      role: user?.role || '',
      club: user?.club || null,
      lastSeenISO: newest,
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
  }, [posts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Прочитанность по вкладкам: открыл вкладку → её посты прочитаны ──
  const TAB_SEEN_KEY = { all: 'hj_news_seen_tab_all', managers: 'hj_news_seen_tab_managers', sales: 'hj_news_seen_tab_sales' };
  const newestOf = (list) => list.reduce((m, p) => ((p.postedAtISO || '') > m ? (p.postedAtISO || '') : m), '');
  const [, setSeenTick] = useState(0);
  const tabSeen = (tab) => {
    try {
      const marker = localStorage.getItem(TAB_SEEN_KEY[tab]) || '';
      const legacy = localStorage.getItem('hj_news_seen') || ''; // миграция со старой общей отметки
      return marker > legacy ? marker : legacy;
    } catch { return ''; }
  };
  const tabUnread = (tab) => {
    const list = tab === 'managers' ? managerPosts : tab === 'sales' ? salesPosts : generalPosts;
    const newest = newestOf(list);
    return !!newest && newest > tabSeen(tab);
  };
  useEffect(() => {
    const list = audienceTab === 'managers' ? managerPosts : audienceTab === 'sales' ? salesPosts : generalPosts;
    const newest = newestOf(list);
    if (!newest) return;
    try {
      const key = TAB_SEEN_KEY[audienceTab] || TAB_SEEN_KEY.all;
      if (newest > (localStorage.getItem(key) || '')) {
        localStorage.setItem(key, newest);
        window.dispatchEvent(new Event('hj-news-seen'));
        setSeenTick(t => t + 1);
      }
    } catch {}
  }, [posts, audienceTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const TEMPLATE_FALLBACK = {
    'shift-board': '🔄 Новое: «Доска задач» — общая доска смены для всей команды. Передачи, поручения, неисправности и напоминания на виду у всех, а под каждой записью можно обсуждать в ветке, как в Slack. Ищите в меню → «Доска задач».',
    'calendar': '📅 Новое: «Календарь» — напоминалка по хозяйству клуба. Ежемесячные оплаты (интернет, свет, вода), тех-обслуживание и подрядчики — всё на своих датах, с описанием, ссылкой и отметками «сделано» в комментариях. У каждого клуба календарь свой. Ищите в меню → «Календарь».',
    'instudio': '🛠 Новое: «InStudio» — заявки по технике и софту напрямую команде разработки. Планшеты, турникеты, POS, пульсометры — оформляете заявку с подробным описанием, разработчик берёт её в работу, внутри задачи чат с фото и таймер работы. Неисправности с Доски задач попадают туда автоматически. Меню → «InStudio».',
    'merch-sizes': '📦 Обновление склада: размерная сетка — одна карточка на модель. Вместо «Hoodie M / L / XL» тремя товарами — одна карточка с остатками по размерам XS–3XL. Продажа с выбором размера (списание именно с него), поставки, перемещения и возвраты — тоже по размерам, размер виден в истории и Excel. Старые товары работают как раньше. Меню → «Склад».',
  };

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text && !newTemplate) return;
    setSaving(true);
    try {
      if (editingPost) {
        // Редактирование: обновляем текст/аудиторию/формат; postedAtISO НЕ трогаем,
        // чтобы правка не зажигала зелёные точки «новая новость» заново
        await updateDoc(doc(db, 'news_posts', editingPost.id), {
          text: text || TEMPLATE_FALLBACK[newTemplate] || '',
          template: newTemplate || null,
          audience: newAudience,
          editedAtISO: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        });
        toast.success('Новость обновлена');
      } else {
        await addDoc(collection(db, 'news_posts'), {
          text: text || TEMPLATE_FALLBACK[newTemplate] || '',
          template: newTemplate || null,
          source: newTemplate ? 'release' : 'manual',
          author: user?.displayName || '',
          audience: newAudience,
          postedAtISO: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        });
        toast.success('Новость опубликована');
      }
      setNewTemplate('');
      setNewText('');
      setNewAudience('all'); // не тянем аудиторию прошлого поста в следующий
      setShowAdd(false);
      setEditingPost(null);
    } catch (e) {
      toast.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post) => {
    if (!window.confirm('Удалить новость?')) return;
    try { await deleteDoc(doc(db, 'news_posts', post.id)); } catch { toast.error('Не удалось удалить'); }
  };

  const fmtDate = (iso) => {
    try { return format(new Date(iso), 'd MMMM yyyy, HH:mm', { locale: ru }); } catch { return ''; }
  };

  // ── Панель «кто посмотрел» (видит только Дильшат) ─────────────────────────
  const NEWS_ROLES = ['chef', 'manager', 'admin', 'viewer', 'komdir', 'rop']; // роли с доступом к /news
  const myClub = (user?.club || '').toUpperCase();
  const readersFor = (post) => {
    const out = [];
    for (const [email, p] of Object.entries(USER_ROLES)) {
      if (!email.includes('@')) continue;                 // легаси-логины без почты
      if (email === 'dilshat.r@hj.fit') continue;         // автор не считается
      if (email === (user?.email || '').toLowerCase()) continue; // себя не показываем
      if (!NEWS_ROLES.includes(p.role)) continue;
      if (post.audience === 'managers' && p.role !== 'manager' && p.role !== 'chef') continue;
      if (post.audience === 'sales' && p.role !== 'komdir' && p.role !== 'rop' && p.role !== 'chef') continue;
      // Менеджер видит просмотры только своего клуба
      if (user?.role === 'manager' && (p.club || '').toUpperCase() !== myClub) continue;
      out.push({
        email,
        name: seenMap[email]?.name || p.displayName || email.split('@')[0],
        role: p.role,
        club: p.club,
        seen: !!(ackMap[post.id] && ackMap[post.id].has(email)), // галочка = нажал «Ознакомлен»
      });
    }
    out.sort((a, b) => (b.seen - a.seen) || a.name.localeCompare(b.name, 'ru'));
    return out;
  };
  const viewPost = canSeeViews ? (shownPosts.find(p => p.id === viewPostId) || shownPosts[0] || null) : null;
  const viewReaders = viewPost ? readersFor(viewPost) : [];
  const viewSeenCount = viewReaders.filter(r => r.seen).length;

  const renderReaders = (rs) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rs.map(r => (
        <div key={r.email} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 10,
          background: r.seen ? 'rgba(95,156,129,0.07)' : 'transparent',
          border: '1px solid ' + (r.seen ? 'rgba(95,156,129,0.18)' : 'var(--border)'),
        }}>
          {r.seen
            ? <Check size={12} style={{ color: '#5F9C81', flexShrink: 0 }} />
            : <Eye size={12} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }} />}
          <span style={{ fontSize: 12, fontWeight: 700, color: r.seen ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
            {r.club || (r.role === 'chef' ? 'шеф' : r.role === 'viewer' ? 'наблюд.' : r.role)}
          </span>
        </div>
      ))}
    </div>
  );

  const readersPanelBody = viewPost && (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Eye size={14} style={{ color: 'var(--accent-purple)' }} />
        <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)' }}>Просмотры</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: viewSeenCount === viewReaders.length ? '#5F9C81' : 'var(--text-muted)' }}>
          {viewSeenCount}/{viewReaders.length}
        </span>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.45 }}>
        {fmtDate(viewPost.postedAtISO)}<br />«{(viewPost.text || '').slice(0, 70)}{(viewPost.text || '').length > 70 ? '…' : ''}»
      </div>
      {renderReaders(viewReaders)}
    </>
  );

  return (
    <div className="animate-fade" style={{ display: 'flex', gap: 20, alignItems: 'flex-start', justifyContent: 'center', paddingBottom: 40 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680, flex: '1 1 680px', minWidth: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(85,128,168,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Newspaper size={20} style={{ color: '#5580A8' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Новости</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Обновления платформы и объявления</p>
          </div>
        </div>
        {canPost && (
          <button onClick={() => setShowAdd(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12,
            border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
          }}>
            <Plus size={14} /> Добавить
          </button>
        )}
      </div>

      {/* Окошки аудиторий: Общие / Менеджерам / Отдел продаж — по ролям.
          На мобильном — горизонтальная лента чипов без переноса */}
      {(canSeeManagers || canSeeSales) && (
        <div style={isMobile
          ? { display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }
          : { display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            ['all', `Общие (${generalPosts.length})`],
            ...(canSeeManagers ? [['managers', `👔 Менеджерам (${managerPosts.length})`]] : []),
            ...(canSeeSales ? [['sales', `💼 Отдел продаж (${salesPosts.length})`]] : []),
          ].map(([id, label]) => (
            <button key={id} onClick={() => setAudienceTab(id)} style={{
              position: 'relative', flexShrink: 0, whiteSpace: 'nowrap',
              padding: isMobile ? '8px 14px' : '8px 16px', borderRadius: isMobile ? 999 : 12, fontSize: 12, fontWeight: 800, cursor: 'pointer',
              border: '1px solid ' + (audienceTab === id ? 'var(--accent-purple)' : 'var(--border)'),
              background: audienceTab === id ? 'var(--accent-purple)' : 'transparent',
              color: audienceTab === id ? '#fff' : 'var(--text-muted)',
            }}>
              {label}
              {audienceTab !== id && tabUnread(id) && (
                <span style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: '50%', background: '#5F9C81', boxShadow: '0 0 6px #5F9C81', border: '2px solid var(--bg-primary)' }} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Feed */}
      {shownPosts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
          Новостей пока нет
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shownPosts.map(p => (
            <div key={p.id} style={{
              // На мобильном карточка компактнее (паддинги меньше)
              background: 'var(--bg-card)', borderRadius: isMobile ? 14 : 16, padding: isMobile ? '12px 13px' : '16px 18px',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${p.source === 'telegram' ? '#2AABEE' : p.source === 'release' ? '#5F9C81' : 'var(--accent-purple)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 900, padding: '3px 9px', borderRadius: 7,
                  background: p.source === 'telegram' ? 'rgba(42,171,238,0.12)' : p.source === 'release' ? 'rgba(95,156,129,0.12)' : 'rgba(125,111,179,0.12)',
                  color: p.source === 'telegram' ? '#2AABEE' : p.source === 'release' ? '#5F9C81' : 'var(--accent-purple)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {p.source === 'telegram' ? <><Send size={9} /> Telegram</>
                    : p.source === 'release' ? `🚀 Релиз${p.author && p.author !== 'Релиз' ? ` · ${p.author}` : ''}`
                    : `HJ Track${p.author ? ` · ${p.author}` : ''}`}
                </span>
                {p.audience === 'managers' && (
                  <span style={{ fontSize: 9, fontWeight: 900, padding: '3px 9px', borderRadius: 7, background: 'rgba(192,143,79,0.12)', color: '#C08F4F', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    👔 Менеджерам
                  </span>
                )}
                {p.audience === 'sales' && (
                  <span style={{ fontSize: 9, fontWeight: 900, padding: '3px 9px', borderRadius: 7, background: 'rgba(14,165,233,0.12)', color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    💼 Отдел продаж
                  </span>
                )}
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>{fmtDate(p.postedAtISO)}{p.editedAtISO ? ' · изменено' : ''}</span>
                {canSeeViews && (() => {
                  const rs = readersFor(p);
                  const n = rs.filter(r => r.seen).length;
                  const active = isWide && viewPost?.id === p.id;
                  return (
                    <button
                      // Широкий экран — панель справа; мобильный — шторка снизу
                      onClick={() => { if (isWide) setViewPostId(p.id); else if (isMobile) setSheetPostId(p.id); }}
                      title="Кто посмотрел"
                      style={{
                        marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                        padding: isMobile ? '6px 10px' : '3px 9px', borderRadius: 8, cursor: (isWide || isMobile) ? 'pointer' : 'default',
                        border: '1px solid ' + (active ? 'var(--accent-purple)' : 'var(--border)'),
                        background: active ? 'rgba(125,111,179,0.10)' : 'transparent',
                        color: n === rs.length ? '#5F9C81' : 'var(--text-muted)',
                        fontSize: 10, fontWeight: 800,
                      }}
                    >
                      <Eye size={11} /> {n}/{rs.length}
                    </button>
                  );
                })()}
                {canPost && (
                  <>
                    <button onClick={() => openEdit(p)} title="Редактировать" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0, opacity: 0.4 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
                    ><Edit3 size={13} /></button>
                    <button onClick={() => handleDelete(p)} title="Удалить" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0, opacity: 0.4 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
                    ><Trash2 size={13} /></button>
                  </>
                )}
              </div>
              {p.template && RICH_TEMPLATES[p.template] ? (
                React.createElement(RICH_TEMPLATES[p.template])
              ) : p.text && (
                <div style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6 }}>{renderNewsText(p.text)}</div>
              )}
              {p.mediaNote && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 6 }}>{p.mediaNote}</div>
              )}
              {myEmail && (
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  {hasAcked(p) ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#5F9C81', background: 'rgba(95,156,129,0.1)', border: '1px solid rgba(95,156,129,0.25)', padding: '7px 14px', borderRadius: 10, width: isMobile ? '100%' : 'auto', minHeight: isMobile ? 42 : 'auto' }}>
                      <Check size={14} /> Вы ознакомлены
                    </span>
                  ) : (
                    // На мобильном — крупная кнопка во всю ширину (удобно пальцем)
                    <button onClick={() => ackPost(p)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: isMobile ? 13 : 12, fontWeight: 800, color: '#fff', background: 'var(--accent-purple)', border: 'none', padding: isMobile ? '12px 16px' : '8px 16px', borderRadius: isMobile ? 12 : 10, cursor: 'pointer', width: isMobile ? '100%' : 'auto', minHeight: isMobile ? 44 : 'auto' }}>
                      <Check size={14} /> Ознакомлен
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add modal (chef). На мобильном — шторка снизу */}
      {showAdd && (
        <div onClick={() => !saving && closeModal()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: isMobile ? '100%' : 480, maxHeight: isMobile ? '92vh' : 'none', overflowY: 'auto', background: 'var(--bg-card)', borderRadius: isMobile ? '20px 20px 0 0' : 20, border: '1px solid var(--border)', padding: isMobile ? '16px 16px 24px' : 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>{editingPost ? 'Редактировать новость' : 'Новая новость'}</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['all', '📢 Всем'], ['managers', '👔 Менеджерам'], ['sales', '💼 Отделу продаж']].map(([id, label]) => (
                <button key={id} onClick={() => setNewAudience(id)} style={{
                  flex: 1, padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: '1px solid ' + (newAudience === id ? 'var(--accent-purple)' : 'var(--border)'),
                  background: newAudience === id ? 'var(--accent-purple)' : 'transparent',
                  color: newAudience === id ? '#fff' : 'var(--text-muted)',
                }}>{label}</button>
              ))}
            </div>
            {/* Шаблон: обычный текст или готовый анонс */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Формат</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['', '📝 Обычный текст'], ['shift-board', '📣 Анонс: Доска задач']].map(([id, label]) => (
                  <button key={id || 'plain'} onClick={() => setNewTemplate(id)} style={{
                    flex: 1, padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
                    border: '1px solid ' + (newTemplate === id ? 'var(--accent-purple)' : 'var(--border)'),
                    background: newTemplate === id ? 'var(--accent-purple)' : 'transparent',
                    color: newTemplate === id ? '#fff' : 'var(--text-muted)',
                  }}>{label}</button>
                ))}
              </div>
            </div>

            {newTemplate ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', lineHeight: 1.5, fontWeight: 500 }}>
                Будет опубликована <b style={{ color: 'var(--text-primary)' }}>готовая карточка-анонс</b> «Доска задач» (превью доски, типы записей, что умеет). Текст ниже можно не заполнять — он используется как краткая подпись в уведомлении.
              </div>
            ) : null}

            <textarea
              autoFocus
              rows={newTemplate ? 3 : 7}
              placeholder={newTemplate ? 'Короткая подпись (необязательно)…' : 'Текст новости…'}
              value={newText}
              onChange={e => setNewText(e.target.value)}
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontWeight: 500, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
            />
            <button
              onClick={handleAdd}
              disabled={saving || (!newText.trim() && !newTemplate)}
              style={{ padding: '13px', borderRadius: 14, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: saving || (!newText.trim() && !newTemplate) ? 0.5 : 1 }}
            >
              {editingPost ? 'Сохранить изменения' : 'Опубликовать'}
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Мобильная шторка «кто посмотрел» — открывается кнопкой-глазом на карточке */}
    {canSeeViews && isMobile && sheetPostId && (() => {
      const p = posts.find(x => x.id === sheetPostId);
      if (!p) return null;
      const rs = readersFor(p);
      const n = rs.filter(r => r.seen).length;
      return ReactDOM.createPortal(
        <div onClick={() => setSheetPostId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 520, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '75vh', overflowY: 'auto', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', borderRadius: '20px 20px 0 0', padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Eye size={14} style={{ color: 'var(--accent-purple)' }} />
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)' }}>Просмотры</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: n === rs.length ? '#5F9C81' : 'var(--text-muted)' }}>{n}/{rs.length}</span>
              <button onClick={() => setSheetPostId(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, lineHeight: 0 }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.45 }}>
              {fmtDate(p.postedAtISO)}<br />«{(p.text || '').slice(0, 70)}{(p.text || '').length > 70 ? '…' : ''}»
            </div>
            {renderReaders(rs)}
          </div>
        </div>,
        document.body
      );
    })()}

    {/* Правая панель просмотров — все шефы, только широкий экран */}
    {canSeeViews && isWide && viewPost && (
      <aside style={{
        width: 272, flex: '0 0 272px', position: 'sticky', top: 8,
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
        maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
      }}>
        {readersPanelBody}
      </aside>
    )}
    </div>
  );
};

export default NewsPage;
