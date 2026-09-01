import React, { useState, useEffect, useRef } from 'react';
import { isMobileDevice } from '../../lib/isMobile';
import useSheetDrag from '../../lib/useSheetDrag';
import useNavLayout, { applyDrop } from '../../lib/useNavLayout';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Ticket, CheckSquare, Calendar, CalendarDays,
  Archive, Phone, Settings, LogOut, Sun, Moon, Bell, MapPin,
  MoreHorizontal, X, ChevronRight, Package, TrendingUp, BookOpen, FileText, Heart, Shirt, BarChart2,
  RefreshCw, ShoppingBag, ClipboardList, Star, Newspaper, MessageCircle,
  ChevronDown as ChevronDownIcon, Briefcase, Users as UsersIcon, Target, ClipboardCheck, Lock, Sparkles, UserPlus, QrCode,
  MonitorSmartphone, Home, Plus, Folder, RotateCcw, ShieldAlert
} from 'lucide-react';
import DailyReport from './DailyReport';
import { useNotifications } from '../../store/NotificationContext';
import { useTickets } from '../../store/TicketContext';
import { showStaffNav } from '../../lib/access';
import { db } from '../../lib/firebase';
import { doc, collection, query, where, onSnapshot } from 'firebase/firestore';

// Returns true if any monitor in this club hasn't been checked today
const useMonitorAlert = (club) => {
  const [alert, setAlert] = useState(false);
  useEffect(() => {
    if (!club) { setAlert(false); return; }
    const today = new Date().toISOString().slice(0, 10);
    const q = query(collection(db, 'hr_monitors'), where('club', '==', club));
    return onSnapshot(q, snap => {
      const docs = snap.docs;
      setAlert(docs.length > 0 && docs.some(d => d.data().lastCheckedDate !== today));
    }, () => setAlert(false));
  }, [club]);
  return alert;
};

// Returns true if yesterday's towel record for this club is missing or incomplete
const useTowelAlert = (club) => {
  const [alert, setAlert] = useState(false);
  useEffect(() => {
    if (!club) { setAlert(false); return; }
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yStr  = d.toISOString().slice(0, 10);
    const docId = `${yStr}_${club.replace(/\s+/g, '_')}`;
    return onSnapshot(doc(db, 'towel_records', docId), snap => {
      if (!snap.exists()) { setAlert(true); return; }
      const data = snap.data();
      setAlert(data.dirtyTotal == null || data.actualCount == null);
    }, () => setAlert(false));
  }, [club]);
  return alert;
};

// Green dot on «Новости» while the freshest VISIBLE post is newer than the last visit
const useNewsAlert = (role) => {
  const [latest, setLatest] = useState(null);
  const [seenTick, setSeenTick] = useState(0);
  const canSeeManagers = role === 'manager' || role === 'chef';
  const canSeeSales = role === 'komdir' || role === 'rop' || role === 'chef'; // отдел продаж: КД + РОПы
  useEffect(() => {
    const onSeen = () => setSeenTick(t => t + 1);
    window.addEventListener('hj-news-seen', onSeen);
    return () => window.removeEventListener('hj-news-seen', onSeen);
  }, []);
  useEffect(() => {
    return onSnapshot(collection(db, 'news_posts'), snap => {
      // Свежесть считаем ПО ВКЛАДКАМ: общая / менеджерам / отделу продаж —
      // точка горит, пока не открыта КАЖДАЯ вкладка с новым постом.
      let general = '', managers = '', sales = '';
      snap.docs.forEach(d => {
        const data = d.data();
        const t = data.postedAtISO || '';
        if (data.audience === 'managers') { if (canSeeManagers && t > managers) managers = t; }
        else if (data.audience === 'sales') { if (canSeeSales && t > sales) sales = t; }
        else if (t > general) general = t;
      });
      setLatest({ general, managers, sales });
    }, () => setLatest(null));
  }, [canSeeManagers, canSeeSales]);
  void seenTick;
  const seenOf = (key) => {
    try {
      const marker = localStorage.getItem(key) || '';
      const legacy = localStorage.getItem('hj_news_seen') || ''; // старая общая отметка (миграция)
      return marker > legacy ? marker : legacy;
    } catch { return ''; }
  };
  if (!latest) return false;
  return (!!latest.general && latest.general > seenOf('hj_news_seen_tab_all'))
    || (!!latest.managers && latest.managers > seenOf('hj_news_seen_tab_managers'))
    || (!!latest.sales && latest.sales > seenOf('hj_news_seen_tab_sales'));
};

/* ─── All nav items ──────────────────────────────────────────── */
const ALL_NAV = [
  { icon: Newspaper,       label: 'Новости',      path: '/news',        primary: true  },
  { icon: RefreshCw,       label: 'Доска задач',  path: '/shift-board', primary: true  },
  { icon: Ticket,          label: 'Заявки',     path: '/tickets',     primary: true  },
  { icon: Calendar,        label: 'График',      path: '/schedule',    primary: true  },
  { icon: CheckSquare,     label: 'Чек-листы',  path: '/checklists',  primary: true  },
  { icon: Package,         label: 'Склад',       path: '/merch',       primary: true  },
  { icon: TrendingUp,      label: 'Продажи',    path: '/sales',       primary: true  },
  { icon: LayoutDashboard, label: 'Дашборд',    path: '/dashboard',   primary: false },
  { icon: Archive,         label: 'Архив',       path: '/archive',     primary: false },
  { icon: Heart,           label: 'Пульсометры', path: '/hr-monitors', primary: false },
  { icon: Shirt,           label: 'Учет полотенец', path: '/towels',   primary: false },
  { icon: ShoppingBag,     label: 'Утерянные вещи', path: '/lost-items', primary: false },
  { icon: Star,            label: 'Отзывы',       path: '/reviews',     primary: false },
  { icon: QrCode,          label: 'QR-отзывы',    path: '/qr-reviews',  primary: false },
  { icon: Target,          label: 'Лиды',         path: '/leads',       primary: false },
  { icon: Sparkles,        label: 'Помощник',     path: '/assistant',   primary: false },
  { icon: UserPlus,        label: 'Сотрудники',   path: '/staff',       primary: false },
  { icon: CalendarDays,    label: 'Календарь',   path: '/calendar',    primary: false },
  { icon: MonitorSmartphone, label: 'InStudio',  path: '/instudio',    primary: false },
  { icon: BarChart2,       label: 'Посещения',   path: '/club-visits', primary: false },
  { icon: MapPin,          label: 'Чекин',       path: '/attendance',  primary: false },
  { icon: Phone,           label: 'Созвоны',     path: '/calls',       primary: false },
  { icon: BookOpen,        label: 'Гайдбук',     path: '/guidebook',   primary: false },
  { icon: ShieldAlert,     label: 'Регламент травм', path: '/injury-protocol', primary: false },
  { icon: FileText,        label: 'Соглашение',  path: '/policy',      primary: false },
  { icon: Settings,        label: 'Настройки',   path: '/settings',    primary: false },
];

/* ─── Группы навигации (для шефов и менеджеров) ───────────────── */
const NAV_GROUPS = [
  { id: 'manager', label: 'Для менеджера', icon: Briefcase, paths: ['/tickets', '/schedule', '/checklists', '/archive', '/merch'] },
  { id: 'admins',  label: 'Админы',        icon: UsersIcon, paths: ['/sales', '/hr-monitors', '/towels', '/lost-items', '/club-visits', '/attendance', '/guidebook', '/leads', '/assistant'] },
];

const useNavGroups = () => {
  const [openGroups, setOpenGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hj_nav_groups') || '{}'); } catch { return {}; }
  });
  // Явно задаём состояние группы (открыть/закрыть). Выбор пользователя сохраняется
  // и уважается даже когда открыта страница внутри группы — тогда её можно свернуть.
  const setGroupOpen = (id, val) => setOpenGroups(prev => {
    const next = { ...prev, [id]: val };
    try { localStorage.setItem('hj_nav_groups', JSON.stringify(next)); } catch {}
    return next;
  });
  return [openGroups, setGroupOpen];
};

/* ─── Desktop Sidebar ────────────────────────────────────────── */
const DesktopSidebar = () => {
  const { user, logout, switchClub } = useTickets();
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(() => localStorage.getItem('hjtrack-theme') === 'dark');
  const { notifications, readIds, unreadCount, markRead, markAllRead } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const _alertClub = (user?.role === 'admin' || user?.role === 'manager') ? (user?.club?.toUpperCase() || null) : null;
  const towelAlert   = useTowelAlert(_alertClub);
  const monitorAlert = useMonitorAlert(_alertClub);
  const newsAlert    = useNewsAlert(user?.role);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('hjtrack-theme', isDark ? 'dark' : 'light');
    // Android status bar follows the app theme
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim();
      themeMeta.setAttribute('content', bg || (isDark ? '#0f0f14' : '#FFFFFF'));
    }
  }, [isDark]);

  const timeAgo = (iso) => {
    if (!iso) return '';
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60)    return 'только что';
    if (d < 3600)  return `${Math.floor(d / 60)} мин назад`;
    if (d < 86400) return `${Math.floor(d / 3600)} ч назад`;
    return `${Math.floor(d / 86400)} д назад`;
  };

  const VIEWER_HIDDEN = new Set(['/tickets', '/schedule', '/calls', '/dashboard', '/archive', '/lost-items', '/reviews', '/leads']);

  const allowedNav = ALL_NAV.filter(item => {
    if (item.path === '/staff') return showStaffNav(user); // только реальный РОП; у шефа — в Настройках
    // Техник (tech): только Чек-листы и InStudio, по всем клубам
    if (user?.role === 'tech') return item.path === '/checklists' || item.path === '/instudio';
    // Наблюдатель «Утерянные вещи»: только эта вкладка, просмотр
    if (user?.role === 'lostviewer') return item.path === '/lost-items' || item.path === '/merch';
    if (user?.role === 'admin') {
      // Чек-листы — только админам Europe City
      if (item.path === '/checklists') return (user.club || '').toUpperCase() === 'EUROPE CITY';
      return item.path === '/shift-board' || item.path === '/calendar' || item.path === '/instudio' || item.path === '/schedule' || item.path === '/sales' || item.path === '/settings' || item.path === '/guidebook' || item.path === '/injury-protocol' || item.path === '/policy' || item.path === '/hr-monitors' || item.path === '/towels' || item.path === '/attendance' || item.path === '/club-visits' || item.path === '/lost-items' || item.path === '/news' || item.path === '/leads' || item.path === '/assistant';
    }
    if (user?.role === 'marketing') {
      return item.path === '/merch' || item.path === '/policy' || item.path === '/shift-board' || item.path === '/calendar' || item.path === '/instudio';
    }
    if (user?.role === 'komdir' || user?.role === 'rop') {
      // Передача смены — видна всем в отделе, включая Ком-Дира, РОП и МОП
      if (item.path === '/shift-board') return true;
      return item.path === '/news' || item.path === '/merch' || item.path === '/policy' || item.path === '/settings' || item.path === '/reviews' || item.path === '/qr-reviews' || item.path === '/leads' || item.path === '/lost-items' || item.path === '/assistant' || item.path === '/attendance' || item.path === '/club-visits' || item.path === '/calendar' || item.path === '/instudio';
    }
    if (user?.role === 'viewer') {
      return !VIEWER_HIDDEN.has(item.path);
    }
    // У менеджеров «Соглашение» живёт в Настройках
    if (user?.role === 'manager' && (item.path === '/policy' || item.path === '/qr-reviews')) return false;
    return true;
  });

  // Группировка шторками — только у шефов и менеджеров
  const useGrouping = user?.role === 'chef' || user?.role === 'manager';
  const [openGroups, setGroupOpen] = useNavGroups();
  const location = useLocation();

  // ── Персональная раскладка меню: drag&drop порядок + свои группы ──
  const allowedPaths = allowedNav.map(i => i.path);
  const byPath = Object.fromEntries(allowedNav.map(i => [i.path, i]));
  // Стандартная раскладка повторяет прежний статичный порядок:
  // Новости / Доска задач / Дашборд, затем группы (у шефов/менеджеров), затем остальное
  const defaultRows = (() => {
    const allowed = new Set(allowedPaths);
    const rows = [];
    ['/news', '/shift-board', '/dashboard'].forEach(p => { if (allowed.has(p)) rows.push({ type: 'item', path: p }); });
    if (useGrouping) {
      NAV_GROUPS.forEach(g => {
        const items = g.paths.filter(p => allowed.has(p));
        if (items.length) rows.push({ type: 'group', id: g.id, label: g.label, items });
      });
    }
    return rows; // остальные пункты допишет normalize внутри useNavLayout
  })();
  const { rows, save, reset, isCustom } = useNavLayout(user, allowedPaths, defaultRows);

  // ── Drag&drop мышью: перетаскивание пунктов/групп; удержание над пунктом ~2с — объединение.
  // Нарочно НЕ HTML5 DnD: перетаскивание <a> браузеры превращают в «перенос ссылки»
  // (ghost с URL, drop не срабатывает), поэтому жест собран вручную на mousedown/mousemove ──
  const [dragKey, setDragKey] = useState(null);          // {kind:'item',path} | {kind:'group',id}
  const [dropHint, setDropHintState] = useState(null);   // {key, mode:'before'|'after'|'into'}
  const [ghost, setGhost] = useState(null);              // {x, y, label} — «призрак» у курсора
  const dropHintRef = useRef(null);
  const setDropHint = (h) => { dropHintRef.current = h; setDropHintState(h); };
  const mergeTimerRef = useRef(null);                    // {key, t}
  const rowNodes = useRef(new Map());                    // key → {el, target, mergeable}
  const dragStateRef = useRef(null);                     // {drag, label, startX, startY, moved}
  const suppressClickRef = useRef(false);                // гасим клик-навигацию после переноса
  const keyOf = (t) => t.kind === 'group' ? 'g:' + t.id : 'i:' + t.path;
  const clearMergeTimer = () => { if (mergeTimerRef.current) { clearTimeout(mergeTimerRef.current.t); mergeTimerRef.current = null; } };
  const endDrag = () => { clearMergeTimer(); setDragKey(null); setDropHint(null); setGhost(null); };

  const registerRow = (key, target, mergeable) => (el) => {
    if (el) rowNodes.current.set(key, { el, target, mergeable });
    else rowNodes.current.delete(key);
  };

  const beginPress = (e, drag, label) => {
    if (e.button !== 0) return;
    e.preventDefault(); // глушим нативный drag ссылки и выделение текста; click всё равно придёт
    const st = { drag, label, startX: e.clientX, startY: e.clientY, moved: false };
    dragStateRef.current = st;

    const onMove = (ev) => {
      const s = dragStateRef.current; if (!s) return;
      if (!s.moved) {
        if (Math.abs(ev.clientX - s.startX) + Math.abs(ev.clientY - s.startY) < 6) return;
        s.moved = true;
        setDragKey(s.drag);
        document.body.style.userSelect = 'none';
      }
      setGhost({ x: ev.clientX, y: ev.clientY, label: s.label });
      let found = null;
      for (const [key, info] of rowNodes.current) {
        const r = info.el.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom && ev.clientX >= r.left && ev.clientX <= r.right) {
          found = { key, info, rect: r };
          break;
        }
      }
      if (!found || keyOf(s.drag) === found.key) { clearMergeTimer(); setDropHint(null); return; }
      const ratio = (ev.clientY - found.rect.top) / Math.max(found.rect.height, 1);
      // mergeable: пункт верхнего уровня (→ новая группа) или заголовок группы (→ внутрь);
      // пункты внутри групп принимают только before/after
      const canMerge = found.info.mergeable && s.drag.kind === 'item';
      const inMiddle = canMerge && ratio > 0.3 && ratio < 0.7;
      const cur = dropHintRef.current;
      if (inMiddle) {
        if (cur?.key === found.key && cur.mode === 'into') return; // объединение уже «вооружено»
        if (mergeTimerRef.current?.key !== found.key) {
          clearMergeTimer();
          const key = found.key;
          mergeTimerRef.current = { key, t: setTimeout(() => { setDropHint({ key, mode: 'into' }); }, 2000) };
        }
      } else if (mergeTimerRef.current) {
        clearMergeTimer();
      }
      const mode = ratio < 0.5 ? 'before' : 'after';
      if (!inMiddle || cur?.mode !== 'into') {
        if (!cur || cur.key !== found.key || cur.mode !== mode) setDropHint({ key: found.key, mode });
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const s = dragStateRef.current;
      dragStateRef.current = null;
      document.body.style.userSelect = '';
      if (!s || !s.moved) { endDrag(); return; } // обычный клик — навигация пройдёт сама
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 0);
      const hint = dropHintRef.current;
      const targetInfo = hint ? rowNodes.current.get(hint.key) : null;
      if (hint && targetInfo) {
        const makeLabel = () => window.prompt('Название новой группы:', 'Группа');
        const next = applyDrop(rows, s.drag, targetInfo.target, hint.mode, makeLabel);
        if (next !== rows) save(next);
      }
      endDrag();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const guardClick = (e) => { if (suppressClickRef.current) { e.preventDefault(); e.stopPropagation(); } };

  const hintStyle = (target) => {
    const h = dropHint;
    if (!h || h.key !== keyOf(target)) return {};
    if (h.mode === 'into') return { outline: '2px solid var(--accent-purple)', outlineOffset: '-2px', borderRadius: 10, background: 'rgba(125,111,179,0.10)' };
    return h.mode === 'before'
      ? { boxShadow: 'inset 0 2px 0 0 var(--accent-purple)' }
      : { boxShadow: 'inset 0 -2px 0 0 var(--accent-purple)' };
  };

  const renderItem = (item, indent = false) => {
    const isTowelAlert   = item.path === '/towels'       && towelAlert;
    const isMonitorAlert = item.path === '/hr-monitors'  && monitorAlert;
    const isAlerted      = isTowelAlert || isMonitorAlert;
    const isNewsAlert    = item.path === '/news' && newsAlert;

    return (
      <NavLink
        key={item.path}
        to={item.path}
        draggable={false}
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        style={{
          ...(isAlerted ? { boxShadow: '0 0 0 1.5px #B06A6A', borderRadius: 10, position: 'relative' } : {}),
          ...(indent ? { paddingLeft: 34 } : {}),
        }}
      >
        <item.icon size={17} strokeWidth={1.8} />
        <span>{item.label}</span>
        {isAlerted && (
          <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: '#B06A6A', flexShrink: 0, boxShadow: '0 0 6px #B06A6A' }} />
        )}
        {isNewsAlert && (
          <span style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#5F9C81', flexShrink: 0, boxShadow: '0 0 6px #5F9C81' }} />
        )}
      </NavLink>
    );
  };

  const renderItemRow = (item, indent = false) => {
    const target = { kind: 'item', path: item.path };
    return (
      <div
        key={item.path}
        ref={registerRow(keyOf(target), target, !indent)}
        onMouseDown={(e) => beginPress(e, target, item.label)}
        onClickCapture={guardClick}
        style={{ opacity: dragKey && keyOf(dragKey) === keyOf(target) ? 0.4 : 1, ...hintStyle(target) }}
      >
        {renderItem(item, indent)}
      </div>
    );
  };

  const renderGroupRow = (row) => {
    const target = { kind: 'group', id: row.id };
    const items = row.items.map(p => byPath[p]).filter(Boolean);
    const active = row.items.includes(location.pathname);
    // Явный выбор пользователя (если группу уже сворачивали/раскрывали) важнее авто-раскрытия
    const open = (row.id in openGroups) ? !!openGroups[row.id] : active;
    const groupAlert = (row.items.includes('/towels') && towelAlert) || (row.items.includes('/hr-monitors') && monitorAlert);
    const GIcon = NAV_GROUPS.find(g => g.id === row.id)?.icon || Folder;
    return (
      <div key={row.id}>
        <div
          ref={registerRow(keyOf(target), target, true)}
          onMouseDown={(e) => beginPress(e, target, row.label)}
          style={{ opacity: dragKey && keyOf(dragKey) === keyOf(target) ? 0.4 : 1, ...hintStyle(target) }}
        >
          <button
            onClick={(e) => { if (suppressClickRef.current) return; setGroupOpen(row.id, !open); }}
            onDoubleClick={() => {
              const v = window.prompt('Название группы:', row.label);
              if (v && v.trim()) save(rows.map(r => r.type === 'group' && r.id === row.id ? { ...r, label: v.trim() } : r));
            }}
            className="nav-item"
            title="Двойной клик — переименовать группу"
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <GIcon size={17} strokeWidth={1.8} />
            <span style={{ fontWeight: 700 }}>{row.label}</span>
            {groupAlert && !open && (
              <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: '#B06A6A', flexShrink: 0, boxShadow: '0 0 6px #B06A6A' }} />
            )}
            <ChevronDownIcon size={14} style={{ marginLeft: groupAlert && !open ? 6 : 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s', flexShrink: 0, opacity: 0.6 }} />
          </button>
        </div>
        {open && items.map(item => renderItemRow(item, true))}
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-text">HJTRACK</div>
      </div>

      {/* Переключатель клуба для мультиклубного менеджера */}
      {user?.clubs?.length > 1 && (
        <div style={{ padding: '4px 12px 8px' }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, paddingLeft: 2 }}>Клуб</div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-hover)', borderRadius: 10, padding: 3 }}>
            {user.clubs.map(c => (
              <button key={c} onClick={() => switchClub(c)} style={{ flex: 1, padding: '7px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap', background: user.club === c ? 'var(--accent-purple)' : 'transparent', color: user.club === c ? '#fff' : 'var(--text-muted)' }}>{c}</button>
            ))}
          </div>
        </div>
      )}

      <nav style={{ flex: 1, paddingTop: 8 }}>
        {rows.map(row => row.type === 'group'
          ? renderGroupRow(row)
          : (byPath[row.path] ? renderItemRow(byPath[row.path]) : null))}
      </nav>

      {/* «Призрак» перетаскиваемого пункта у курсора */}
      {ghost && (
        <div style={{
          position: 'fixed', left: ghost.x + 14, top: ghost.y + 6, zIndex: 9999,
          pointerEvents: 'none', padding: '7px 14px', borderRadius: 10,
          background: 'var(--bg-card)', border: '1px solid var(--accent-purple)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)', fontSize: 13, fontWeight: 700,
          color: 'var(--text-primary)', whiteSpace: 'nowrap',
        }}>
          {ghost.label}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--sidebar-border)', paddingTop: 4, paddingBottom: 8, position: 'relative' }}>
        {isCustom && (
          <button
            onClick={() => { if (window.confirm('Вернуть стандартный порядок меню?')) reset(); }}
            className="nav-item"
            style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
          >
            <RotateCcw size={14} strokeWidth={1.8} style={{ flexShrink: 0 }} />
            <span>Сбросить меню</span>
          </button>
        )}
        <DailyReport />

        <button className="theme-toggle" onClick={() => setIsDark(d => !d)}>
          {isDark
            ? <Moon size={17} strokeWidth={1.8} style={{ color: '#7D6FB3', flexShrink: 0 }} />
            : <Sun  size={17} strokeWidth={1.8} style={{ color: '#FB8F41', flexShrink: 0 }} />
          }
          <span style={{ flex: 1 }}>{isDark ? 'Тёмная' : 'Светлая'}</span>
          <div className="theme-toggle-icon" />
        </button>

        <button 
          onClick={logout}
          className="nav-item"
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', color: 'var(--accent-red)', cursor: 'pointer' }}
        >
          <LogOut size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
          <span>Выйти</span>
        </button>
      </div>
    </aside>
  );
};

/* ─── Mobile Layout ──────────────────────────────────────────── */
const MobileNav = () => {
  const { user, logout, switchClub } = useTickets();
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, readIds, unreadCount, markRead, markAllRead } = useNotifications();
  const [isDark, setIsDark] = useState(() => localStorage.getItem('hjtrack-theme') === 'dark');
  const _alertClubM  = (user?.role === 'admin' || user?.role === 'manager') ? (user?.club?.toUpperCase() || null) : null;
  const towelAlert   = useTowelAlert(_alertClubM);
  const monitorAlert = useMonitorAlert(_alertClubM);
  const newsAlert    = useNewsAlert(user?.role);
  const [openGroupsM, setGroupOpenM] = useNavGroups();
  const [showMore, setShowMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false); // шторка «+» (быстрое создание)
  const [showNotifications, setShowNotifications] = useState(false);
  const [reloading, setReloading] = useState(false);

  // Hard reload: drop SW caches + re-register so fresh deploy is picked up immediately
  const handleReload = async () => {
    if (reloading) return;
    setReloading(true);
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if (navigator.serviceWorker?.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.update().catch(() => {})));
      }
    } catch {}
    window.location.reload();
  };
  const sheetRef = useRef(null);
  // Свайп вниз — закрыть шторку (общий жест приложения)
  useSheetDrag(sheetRef, showMore || showNotifications, () => { setShowMore(false); setShowNotifications(false); });
  const [isDemoDayActive, setIsDemoDayActive] = useState(false);

  useEffect(() => {
    const checkStatus = () => {
      const now = new Date();
      const isFriday = now.getDay() === 5; // 5 is Friday
      const isVisibleWindow = now.getHours() < 20; // Stay visible until 20:00
      setIsDemoDayActive(isFriday && isVisibleWindow);
    };
    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('hjtrack-theme', isDark ? 'dark' : 'light');
    // Android status bar follows the app theme
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim();
      themeMeta.setAttribute('content', bg || (isDark ? '#0f0f14' : '#FFFFFF'));
    }
  }, [isDark]);

  // Close sheet on outside tap
  useEffect(() => {
    if (!showMore && !showNotifications) return;
    const handler = (e) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target)) {
        setShowMore(false);
        setShowNotifications(false);
      }
    };
    setTimeout(() => document.addEventListener('touchstart', handler), 100);
    return () => document.removeEventListener('touchstart', handler);
  }, [showMore, showNotifications]);

  const timeAgo = (iso) => {
    if (!iso) return '';
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60)    return 'только что';
    if (d < 3600)  return `${Math.floor(d / 60)} мин`;
    if (d < 86400) return `${Math.floor(d / 3600)} ч`;
    return `${Math.floor(d / 86400)} д`;
  };

  const VIEWER_HIDDEN_M = new Set(['/tickets', '/schedule', '/calls', '/dashboard', '/archive', '/lost-items', '/reviews', '/leads']);

  const allowedNav = ALL_NAV.filter(item => {
    if (item.path === '/staff') return showStaffNav(user); // только реальный РОП; у шефа — в Настройках
    // Техник (tech): только Чек-листы и InStudio, по всем клубам
    if (user?.role === 'tech') return item.path === '/checklists' || item.path === '/instudio';
    // Наблюдатель «Утерянные вещи»: только эта вкладка, просмотр
    if (user?.role === 'lostviewer') return item.path === '/lost-items' || item.path === '/merch';
    if (user?.role === 'admin') {
      // Чек-листы — только админам Europe City
      if (item.path === '/checklists') return (user.club || '').toUpperCase() === 'EUROPE CITY';
      return item.path === '/shift-board' || item.path === '/calendar' || item.path === '/instudio' || item.path === '/schedule' || item.path === '/sales' || item.path === '/settings' || item.path === '/guidebook' || item.path === '/injury-protocol' || item.path === '/policy' || item.path === '/hr-monitors' || item.path === '/towels' || item.path === '/attendance' || item.path === '/club-visits' || item.path === '/lost-items' || item.path === '/news' || item.path === '/leads' || item.path === '/assistant';
    }
    if (user?.role === 'marketing') {
      return item.path === '/merch' || item.path === '/policy' || item.path === '/shift-board' || item.path === '/calendar' || item.path === '/instudio';
    }
    if (user?.role === 'komdir' || user?.role === 'rop') {
      // Передача смены — видна всем в отделе, включая Ком-Дира, РОП и МОП
      if (item.path === '/shift-board') return true;
      return item.path === '/news' || item.path === '/merch' || item.path === '/policy' || item.path === '/settings' || item.path === '/reviews' || item.path === '/qr-reviews' || item.path === '/leads' || item.path === '/lost-items' || item.path === '/assistant' || item.path === '/attendance' || item.path === '/club-visits' || item.path === '/calendar' || item.path === '/instudio';
    }
    if (user?.role === 'viewer') {
      return !VIEWER_HIDDEN_M.has(item.path);
    }
    // У менеджеров «Соглашение» живёт в Настройках
    if (user?.role === 'manager' && (item.path === '/policy' || item.path === '/qr-reviews')) return false;
    return true;
  });

  // ── Новый формат: Главная · [2 главных раздела роли] · (+) · Ещё ──
  // Кандидаты в главные табы по приоритету; берём первые два доступных роли
  const MAIN_TAB_CANDIDATES = ['/tickets', '/shift-board', '/checklists', '/instudio', '/merch', '/news'];
  const allowedPaths = new Set(allowedNav.map(n => n.path));
  const mainTabPaths = MAIN_TAB_CANDIDATES.filter(p => allowedPaths.has(p)).slice(0, 2);
  const primaryTabs = mainTabPaths.map(p => allowedNav.find(n => n.path === p)).filter(Boolean);
  // Всё остальное — в «Ещё»
  const secondaryItems = allowedNav.filter(n => !mainTabPaths.includes(n.path));

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const handleTabClick = (path) => {
    setShowMore(false);
    setShowCreate(false);
    setShowNotifications(false);
    navigate(path);
  };

  const isMoreActive = secondaryItems.some(i => isActive(i.path));

  // Кнопка «+»: быстрые действия создания (фильтруются по доступам роли)
  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const CREATE_ACTIONS = [
    { path: '/tickets', to: '/tickets?create=1', icon: Ticket, color: '#5580A8', title: 'Заявку', sub: 'поломка, задача — в работу с таймером' },
    { path: '/shift-board', to: '/shift-board?create=1', icon: RefreshCw, color: '#C08F4F', title: 'Запись на доску задач', sub: 'передача смены, поручение, неисправность' },
    { path: '/instudio', to: '/instudio?create=1', icon: MonitorSmartphone, color: '#B06A6A', title: 'Заявку InStudio', sub: 'техника и софт — разработчикам' },
    { path: '/checklists', to: '/checklists?view=report', icon: CheckSquare, color: '#5F9C81', title: 'Отчёт дня', sub: 'события смены или «всё хорошо»' },
    { path: '/calendar', to: `/calendar/${todayKey}`, icon: CalendarDays, color: '#7D6FB3', title: 'Событие в календарь', sub: 'оплата, ТО, подрядчик' },
  ].filter(a => allowedPaths.has(a.path));

  return (
    <>
      {/* ── Mobile Top Bar ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: 'calc(52px + env(safe-area-inset-top))',
        paddingTop: 'env(safe-area-inset-top)',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 16, paddingRight: 16,
        zIndex: 200,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 16, letterSpacing: '0.06em', color: 'var(--accent-purple)', fontStyle: 'italic' }}>
            HJTRACK
          </div>
          {/* Notification bell */}
          {user?.role !== 'admin' && (
            <button
              id="notification-bell-mobile"
              onClick={() => { setShowMore(false); setShowNotifications(v => !v); if (!showNotifications && unreadCount > 0) setTimeout(markAllRead, 800); }}
              style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--text-secondary)' }}
            >
              <Bell size={20} strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 4, background: '#B06A6A', color: '#fff', fontSize: 9, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Переключатель клуба (мультиклубный менеджер) — тап переключает на другой клуб */}
          {user?.clubs?.length > 1 && (
            <button
              onClick={() => { const i = user.clubs.indexOf(user.club); switchClub(user.clubs[(i + 1) % user.clubs.length]); }}
              title="Переключить клуб"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 9, border: '1px solid var(--accent-purple)', background: 'rgba(125,111,179,0.12)', color: 'var(--accent-purple)', fontSize: 10, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              <RefreshCw size={11} /> {user.club}
            </button>
          )}
          {/* Demo Day Link in Header */}
          {isDemoDayActive && (
            <a
              href="https://meet.google.com/zur-yyin-zdm?time=18:00"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 10,
                background: 'rgba(123, 61, 255, 0.12)',
                border: '1px solid rgba(123, 61, 255, 0.35)',
                color: '#c084fc',
                textDecoration: 'none',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.05em',
                animation: 'pulse-header-border 2s infinite',
              }}
            >
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#8E7BB8', animation: 'pulse-header-dot 1.5s infinite' }}></span>
              DEMO DAY 18:00
            </a>
          )}

          {/* Reload — pick up fresh deploy instantly */}
          <button
            onClick={handleReload}
            title="Обновить приложение"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              color: reloading ? 'var(--accent-purple)' : 'var(--text-secondary)',
              cursor: 'pointer', padding: 0,
            }}
          >
            <RefreshCw size={17} strokeWidth={2} style={reloading ? { animation: 'spin 0.8s linear infinite' } : undefined} />
          </button>
        </div>
      </div>

      {/* ── Bottom Tab Bar ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 'calc(64px + env(safe-area-inset-bottom))',
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'stretch',
        zIndex: 200,
        paddingBottom: 'env(safe-area-inset-bottom)',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
      }}>
        {/* Главная */}
        <button
          onClick={() => handleTabClick('/home')}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, border: 'none', background: 'transparent', cursor: 'pointer',
            color: isActive('/home') ? 'var(--accent-purple)' : 'var(--text-muted)', transition: 'color 0.2s', position: 'relative',
          }}
        >
          {isActive('/home') && <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 32, height: 3, background: 'var(--accent-purple)', borderRadius: '0 0 4px 4px' }} />}
          <Home size={isActive('/home') ? 22 : 20} strokeWidth={isActive('/home') ? 2.2 : 1.8} />
          <span style={{ fontSize: 9, fontWeight: isActive('/home') ? 800 : 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Главная</span>
        </button>

        {primaryTabs[0] && (() => { const item = primaryTabs[0]; const active = isActive(item.path); return (
          <button key={item.path} onClick={() => handleTabClick(item.path)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, border: 'none', background: 'transparent', cursor: 'pointer', color: active ? 'var(--accent-purple)' : 'var(--text-muted)', transition: 'color 0.2s', position: 'relative' }}>
            {active && <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 32, height: 3, background: 'var(--accent-purple)', borderRadius: '0 0 4px 4px' }} />}
            <item.icon size={active ? 22 : 20} strokeWidth={active ? 2.2 : 1.8} />
            <span style={{ fontSize: 9, fontWeight: active ? 800 : 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{item.label}</span>
          </button>
        ); })()}

        {/* Кнопка «+» — быстрое создание */}
        {CREATE_ACTIONS.length > 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            <button
              onClick={() => { setShowMore(false); setShowNotifications(false); setShowCreate(v => !v); }}
              style={{
                width: 52, height: 52, borderRadius: '50%', marginTop: -20,
                background: 'var(--accent-purple)', color: '#fff', border: '3px solid var(--bg-card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(125,111,179,0.45)',
                transform: showCreate ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s',
              }}
            >
              <Plus size={26} strokeWidth={2.4} />
            </button>
          </div>
        )}

        {primaryTabs[1] && (() => { const item = primaryTabs[1]; const active = isActive(item.path); return (
          <button key={item.path} onClick={() => handleTabClick(item.path)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, border: 'none', background: 'transparent', cursor: 'pointer', color: active ? 'var(--accent-purple)' : 'var(--text-muted)', transition: 'color 0.2s', position: 'relative' }}>
            {active && <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 32, height: 3, background: 'var(--accent-purple)', borderRadius: '0 0 4px 4px' }} />}
            <item.icon size={active ? 22 : 20} strokeWidth={active ? 2.2 : 1.8} />
            <span style={{ fontSize: 9, fontWeight: active ? 800 : 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{item.label}</span>
          </button>
        ); })()}

        {/* "More" tab */}
        {secondaryItems.length > 0 && (
          <button
            onClick={() => { setShowNotifications(false); setShowMore(v => !v); }}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifycontent: 'center',
              gap: 3, border: 'none', background: 'transparent', cursor: 'pointer',
              color: (showMore || isMoreActive) ? 'var(--accent-purple)' : 'var(--text-muted)',
              transition: 'color 0.2s', position: 'relative',
            }}
          >
            {(showMore || isMoreActive) && (
              <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 32, height: 3, background: 'var(--accent-purple)', borderRadius: '0 0 4px 4px' }} />
            )}
            {newsAlert && secondaryItems.some(i => i.path === '/news') && !(towelAlert || monitorAlert) && (
              <span style={{ position: 'absolute', top: 6, right: 'calc(50% - 14px)', width: 7, height: 7, borderRadius: '50%', background: '#5F9C81', boxShadow: '0 0 6px #5F9C81' }} />
            )}
            {(towelAlert && secondaryItems.some(i => i.path === '/towels') || monitorAlert && secondaryItems.some(i => i.path === '/hr-monitors')) && (
              <span style={{ position: 'absolute', top: 6, right: 'calc(50% - 14px)', width: 7, height: 7, borderRadius: '50%', background: '#B06A6A', boxShadow: '0 0 6px #B06A6A' }} />
            )}
            <MoreHorizontal size={20} strokeWidth={1.8} />
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Ещё</span>
          </button>
        )}
      </div>

      {/* ── Шторка «+» — быстрое создание ── */}
      {showCreate && (
        <>
          <div onClick={() => setShowCreate(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 300 }} />
          <div style={{
            position: 'fixed', bottom: 'calc(64px + env(safe-area-inset-bottom))', left: 0, right: 0,
            background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', border: '1px solid var(--border)', borderBottom: 'none',
            zIndex: 301, padding: '12px 8px 10px', boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
            animation: 'slideUp 0.22s cubic-bezier(0.4,0,0.2,1)',
          }}>
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 4, margin: '0 auto 10px' }} />
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', padding: '0 16px 10px' }}>Создать</div>
            {CREATE_ACTIONS.map(a => {
              const AIcon = a.icon;
              return (
                <button
                  key={a.title}
                  onClick={() => { setShowCreate(false); navigate(a.to); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '12px 16px',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ width: 38, height: 38, borderRadius: 12, background: `${a.color}1c`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AIcon size={18} style={{ color: a.color }} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>{a.title}</span>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 1 }}>{a.sub}</span>
                  </span>
                  <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)', flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── "More" Bottom Sheet ── */}
      {showMore && (
        <>
          <div
            onClick={() => setShowMore(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 300 }}
          />
          <div
            ref={sheetRef}
            style={{
              position: 'fixed', bottom: 'calc(64px + env(safe-area-inset-bottom))', left: 0, right: 0,
              background: 'var(--bg-card)',
              borderRadius: '20px 20px 0 0',
              border: '1px solid var(--border)',
              borderBottom: 'none',
              zIndex: 301,
              padding: '12px 0 8px',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
              animation: 'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)',
              maxHeight: 'calc(100dvh - 140px)', overflowY: 'auto',
            }}
          >
            {/* Handle */}
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 4, margin: '0 auto 12px' }} />

            {(() => {
              // ── Новый визуал «Ещё»: плитки с подписями по секциям ──
              const META = {
                '/schedule':    { sub: 'смены и зарплата', sect: 1 },
                '/checklists':  { sub: 'проверки и отчёт дня', sect: 1 },
                '/news':        { sub: 'обновления и анонсы', sect: 1 },
                '/attendance':  { sub: 'отметки прихода', sect: 1 },
                '/shift-board': { sub: 'записи смены', sect: 1 },
                '/tickets':     { sub: 'задачи с таймером', sect: 1 },
                '/merch':       { sub: 'мерч: склад и учёт', sect: 2 },
                '/sales':       { sub: 'продажа мерча', sect: 2 },
                '/hr-monitors': { sub: 'проверка датчиков', sect: 2 },
                '/towels':      { sub: 'учёт полотенец', sect: 2 },
                '/lost-items':  { sub: 'находки и возвраты', sect: 2 },
                '/calendar':    { sub: 'оплаты, ТО, подрядчики', sect: 2 },
                '/instudio':    { sub: 'техника — разработчикам', sect: 2 },
                '/club-visits': { sub: 'посещения атлетов', sect: 2 },
                '/reviews':     { sub: '2ГИС и другие', sect: 2 },
                '/qr-reviews':  { sub: 'QR-стойки в залах', sect: 2 },
                '/leads':       { sub: 'лиды WhatsApp', sect: 2 },
                '/dashboard':   { sub: 'сводка и метрики', sect: 2 },
                '/archive':     { sub: 'закрытые заявки', sect: 2 },
                '/calls':       { sub: 'видеосвязь', sect: 3 },
                '/guidebook':   { sub: 'база знаний', sect: 3 },
                '/injury-protocol': { sub: 'действия при травмах', sect: 3 },
                '/policy':      { sub: 'правила платформы', sect: 3 },
                '/assistant':   { sub: 'ИИ по гайдбуку', sect: 3 },
                '/staff':       { sub: 'аккаунты МОП', sect: 3 },
                '/settings':    { sub: 'профиль и push', sect: 3 },
              };
              const SECTIONS = [[1, 'Каждый день'], [2, 'Работа клуба'], [3, 'Прочее']];

              const Tile = ({ item }) => {
                const active = isActive(item.path);
                const isAl   = (item.path === '/towels' && towelAlert) || (item.path === '/hr-monitors' && monitorAlert);
                const isNews = item.path === '/news' && newsAlert;
                const accent = isAl ? '#B06A6A' : isNews ? '#5F9C81' : 'var(--accent-purple)';
                return (
                  <button
                    onClick={() => handleTabClick(item.path)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                      background: active ? 'rgba(125,111,179,0.08)' : 'var(--bg-hover)',
                      border: `1px solid ${active ? 'rgba(125,111,179,0.4)' : 'var(--border)'}`,
                      borderRadius: 14, padding: '11px 12px', cursor: 'pointer', position: 'relative', minWidth: 0,
                    }}
                  >
                    <span style={{ width: 34, height: 34, borderRadius: 11, background: isAl ? 'rgba(176,106,106,0.14)' : isNews ? 'rgba(95,156,129,0.14)' : 'rgba(125,111,179,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <item.icon size={17} strokeWidth={1.9} style={{ color: accent }} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                      <span style={{ display: 'block', fontSize: 9.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{META[item.path]?.sub || ''}</span>
                    </span>
                    {(isAl || isNews) && (
                      <span style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: '50%', background: accent, boxShadow: `0 0 6px ${accent}` }} />
                    )}
                  </button>
                );
              };

              return SECTIONS.map(([sect, label]) => {
                const items = secondaryItems.filter(i => (META[i.path]?.sect ?? 3) === sect);
                if (!items.length) return null;
                return (
                  <div key={sect} style={{ padding: '0 16px 12px' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em', margin: '4px 2px 8px' }}>{label}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {items.map(item => <Tile key={item.path} item={item} />)}
                    </div>
                  </div>
                );
              });
            })()}

            <div style={{ margin: '8px 24px 0' }}>
              <DailyReport compact />
            </div>

            <div style={{ margin: '8px 24px 0', paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Тема</span>
              <button
                onClick={() => setIsDark(d => !d)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 12,
                  background: 'var(--bg-hover)', border: '1px solid var(--border)',
                  cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700,
                }}
              >
                {isDark
                  ? <><Moon size={15} style={{ color: '#7D6FB3' }} /> Тёмная</>
                  : <><Sun size={15} style={{ color: '#FB8F41' }} /> Светлая</>
                }
              </button>
            </div>

            <div style={{ margin: '12px 24px 0', paddingTop: 12, display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={logout}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 12,
                  background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                  cursor: 'pointer', color: 'var(--accent-red)', fontSize: 13, fontWeight: 700,
                }}
              >
                <LogOut size={15} />
                <span>Выйти из системы</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Notifications Bottom Sheet ── */}
      {user?.role !== 'admin' && showNotifications && (
        <>
          <div onClick={() => setShowNotifications(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 300 }} />
          <div
            ref={sheetRef}
            style={{
              position: 'fixed', bottom: 'calc(64px + env(safe-area-inset-bottom))', left: 0, right: 0,
              background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
              border: '1px solid var(--border)', borderBottom: 'none',
              zIndex: 301, boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
              animation: 'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)',
              maxHeight: '70dvh', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 4, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>Уведомления</span>
                {unreadCount > 0 && <span style={{ fontSize: 11, background: '#B06A6A', color: '#fff', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>{unreadCount} новых</span>}
              </div>
            </div>
            <div data-sheet-scroll style={{ overflowY: 'auto', flex: 1, paddingBottom: 16 }}>
              {notifications.slice(0, 15).map(n => {
                const isUnread = !readIds?.has?.(n.id);
                return (
                  <div
                    key={n.id}
                    onClick={() => { markRead(n.id); if (n.ticketId) { navigate(`/tickets/${n.ticketId}`); setShowNotifications(false); } }}
                    style={{
                      padding: '12px 20px', borderBottom: '1px solid var(--border)',
                      background: isUnread ? 'rgba(125,111,179,0.05)' : 'transparent',
                      cursor: n.ticketId ? 'pointer' : 'default',
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                    }}
                  >
                    {isUnread && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-purple)', marginTop: 4, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: isUnread ? 700 : 500, marginBottom: 2, lineHeight: 1.4 }}>{n.title}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.description}</p>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>{timeAgo(n.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
              {notifications.length === 0 && (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  <Bell size={32} style={{ margin: '0 auto 8px', opacity: 0.3, display: 'block' }} />
                  Нет уведомлений
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes pulse-header-dot {
          0% { transform: scale(0.9); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.6; }
        }
        @keyframes pulse-header-border {
          0% { border-color: rgba(123, 61, 255, 0.35); box-shadow: 0 0 0 0 rgba(123, 61, 255, 0.2); }
          50% { border-color: rgba(123, 61, 255, 0.7); box-shadow: 0 0 8px 2px rgba(123, 61, 255, 0.15); }
          100% { border-color: rgba(123, 61, 255, 0.35); box-shadow: 0 0 0 0 rgba(123, 61, 255, 0.2); }
        }
      `}</style>
    </>
  );
};

/* ─── Main export: responsive ────────────────────────────────── */
const Sidebar = () => {
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());

  useEffect(() => {
    const handler = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return isMobile ? <MobileNav /> : <DesktopSidebar />;
};

export default Sidebar;
