import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Ticket, CheckSquare, Calendar,
  Archive, Phone, Settings, LogOut, Sun, Moon, Bell, MapPin,
  MoreHorizontal, X, ChevronRight, Package, TrendingUp, BookOpen, FileText, Heart, Shirt, BarChart2
} from 'lucide-react';
import { useNotifications } from '../../store/NotificationContext';
import { useTickets } from '../../store/TicketContext';
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

/* ─── All nav items ──────────────────────────────────────────── */
const ALL_NAV = [
  { icon: Ticket,          label: 'Заявки',     path: '/tickets',     primary: true  },
  { icon: Calendar,        label: 'График',      path: '/schedule',    primary: true  },
  { icon: CheckSquare,     label: 'Чек-листы',  path: '/checklists',  primary: true  },
  { icon: Package,         label: 'Склад',       path: '/merch',       primary: true  },
  { icon: TrendingUp,      label: 'Продажи',    path: '/sales',       primary: true  },
  { icon: LayoutDashboard, label: 'Дашборд',    path: '/dashboard',   primary: false },
  { icon: Archive,         label: 'Архив',       path: '/archive',     primary: false },
  { icon: Heart,           label: 'Пульсометры', path: '/hr-monitors', primary: false },
  { icon: Shirt,           label: 'Учет полотенец', path: '/towels',   primary: false },
  { icon: MapPin,          label: 'Чекин',       path: '/attendance',  primary: false },
  { icon: BarChart2,       label: 'Посещения',   path: '/club-visits', primary: false },
  { icon: Phone,           label: 'Созвоны',     path: '/calls',       primary: false },
  { icon: BookOpen,        label: 'Гайдбук',     path: '/guidebook',   primary: false },
  { icon: FileText,        label: 'Соглашение',  path: '/policy',      primary: false },
  { icon: Settings,        label: 'Настройки',   path: '/settings',    primary: false },
];

/* ─── Desktop Sidebar ────────────────────────────────────────── */
const DesktopSidebar = () => {
  const { user, logout } = useTickets();
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(() => localStorage.getItem('hjtrack-theme') === 'dark');
  const { notifications, readIds, unreadCount, markRead, markAllRead } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const _alertClub = (user?.role === 'admin' || user?.role === 'manager') ? (user?.club?.toUpperCase() || null) : null;
  const towelAlert   = useTowelAlert(_alertClub);
  const monitorAlert = useMonitorAlert(_alertClub);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('hjtrack-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const timeAgo = (iso) => {
    if (!iso) return '';
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60)    return 'только что';
    if (d < 3600)  return `${Math.floor(d / 60)} мин назад`;
    if (d < 86400) return `${Math.floor(d / 3600)} ч назад`;
    return `${Math.floor(d / 86400)} д назад`;
  };

  const VIEWER_HIDDEN = new Set(['/tickets', '/schedule', '/calls', '/dashboard', '/archive']);

  const allowedNav = ALL_NAV.filter(item => {
    if (user?.role === 'admin') {
      return item.path === '/schedule' || item.path === '/sales' || item.path === '/settings' || item.path === '/guidebook' || item.path === '/policy' || item.path === '/hr-monitors' || item.path === '/towels';
    }
    if (user?.role === 'marketing') {
      return item.path === '/merch' || item.path === '/policy';
    }
    if (user?.role === 'viewer') {
      return !VIEWER_HIDDEN.has(item.path);
    }
    return true;
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-text">HJTRACK</div>
      </div>

      <nav style={{ flex: 1, paddingTop: 8 }}>
        {allowedNav.map(item => {
          const isTowelAlert   = item.path === '/towels'       && towelAlert;
          const isMonitorAlert = item.path === '/hr-monitors'  && monitorAlert;
          const isAlerted      = isTowelAlert || isMonitorAlert;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              style={isAlerted ? { boxShadow: '0 0 0 1.5px #ef4444', borderRadius: 10, position: 'relative' } : undefined}
            >
              <item.icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
              {isAlerted && (
                <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0, boxShadow: '0 0 6px #ef4444' }} />
              )}
            </NavLink>
          );
        })}
      </nav>

      <div style={{ borderTop: '1px solid var(--sidebar-border)', paddingTop: 4, paddingBottom: 8, position: 'relative' }}>
      {user?.role !== 'admin' && (
        <button
          className={`nav-item ${showNotifications ? 'active' : ''}`}
          onClick={() => {
            setShowNotifications(!showNotifications);
            if (!showNotifications && unreadCount > 0) setTimeout(markAllRead, 800);
          }}
          style={{ width: '100%', justifyContent: 'flex-start' }}
        >
          <div style={{ position: 'relative' }}>
            <Bell size={17} strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', fontSize: 9, width: 14, height: 14, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {unreadCount}
              </span>
            )}
          </div>
          <span>Уведомления</span>
        </button>
      )}

        {user?.role !== 'admin' && showNotifications && (
          <div style={{ position: 'absolute', left: 230, bottom: 40, width: 320, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.2)', zIndex: 100, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 'bold', fontSize: 13, color: 'var(--text-primary)' }}>Новые сообщения</div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {notifications.slice(0, 10).map(n => {
                const isUnread = !readIds?.has?.(n.id);
                return (
                  <div key={n.id} onClick={() => { markRead(n.id); if (n.ticketId) navigate(`/tickets/${n.ticketId}`); setShowNotifications(false); }}
                    style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: n.ticketId ? 'pointer' : 'default', background: isUnread ? 'rgba(123,61,255,0.06)' : 'transparent' }}>
                    <p style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>
                      <span style={{ fontWeight: isUnread ? 700 : 500 }}>{n.title}</span><br />
                      <span style={{ color: 'var(--text-secondary)' }}>{n.description}</span>
                    </p>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(n.createdAt)}</span>
                  </div>
                );
              })}
              {notifications.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Нет новых уведомлений</div>
              )}
            </div>
          </div>
        )}

        <button className="theme-toggle" onClick={() => setIsDark(d => !d)}>
          {isDark
            ? <Moon size={17} strokeWidth={1.8} style={{ color: '#7B3DFF', flexShrink: 0 }} />
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
  const { user, logout } = useTickets();
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, readIds, unreadCount, markRead, markAllRead } = useNotifications();
  const [isDark, setIsDark] = useState(() => localStorage.getItem('hjtrack-theme') === 'dark');
  const _alertClubM  = (user?.role === 'admin' || user?.role === 'manager') ? (user?.club?.toUpperCase() || null) : null;
  const towelAlert   = useTowelAlert(_alertClubM);
  const monitorAlert = useMonitorAlert(_alertClubM);
  const [showMore, setShowMore] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const sheetRef = useRef(null);
  const [isDemoDayActive, setIsDemoDayActive] = useState(false);

  useEffect(() => {
    const checkStatus = () => {
      const now = new Date();
      const isFriday = now.getDay() === 5; // 5 is Friday
      const isBeforeSevenPM = now.getHours() < 19; // Stay visible until 19:00
      setIsDemoDayActive(isFriday && isBeforeSevenPM);
    };
    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('hjtrack-theme', isDark ? 'dark' : 'light');
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

  const VIEWER_HIDDEN_M = new Set(['/tickets', '/schedule', '/calls', '/dashboard', '/archive']);

  const allowedNav = ALL_NAV.filter(item => {
    if (user?.role === 'admin') {
      return item.path === '/schedule' || item.path === '/sales' || item.path === '/settings' || item.path === '/guidebook' || item.path === '/policy' || item.path === '/hr-monitors' || item.path === '/towels';
    }
    if (user?.role === 'marketing') {
      return item.path === '/merch' || item.path === '/policy';
    }
    if (user?.role === 'viewer') {
      return !VIEWER_HIDDEN_M.has(item.path);
    }
    return true;
  });

  // Bottom nav: 4 primary tabs + "More" button
  const primaryTabs = allowedNav.filter(n => n.primary);
  const secondaryItems = allowedNav.filter(n => !n.primary);

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const handleTabClick = (path) => {
    setShowMore(false);
    setShowNotifications(false);
    navigate(path);
  };

  const isMoreActive = secondaryItems.some(i => isActive(i.path));

  return (
    <>
      {/* ── Mobile Top Bar ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: 52,
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
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
              onClick={() => { setShowMore(false); setShowNotifications(v => !v); if (!showNotifications && unreadCount > 0) setTimeout(markAllRead, 800); }}
              style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--text-secondary)' }}
            >
              <Bell size={20} strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 4, background: '#ef4444', color: '#fff', fontSize: 9, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}
        </div>

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
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#a855f7', animation: 'pulse-header-dot 1.5s infinite' }}></span>
            DEMO DAY 18:00
          </a>
        )}
      </div>

      {/* ── Bottom Tab Bar ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 64,
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'stretch',
        zIndex: 200,
        paddingBottom: 'env(safe-area-inset-bottom)',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
      }}>
        {primaryTabs.map(item => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => handleTabClick(item.path)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifycontent: 'center',
                gap: 3, border: 'none', background: 'transparent', cursor: 'pointer',
                color: active ? 'var(--accent-purple)' : 'var(--text-muted)',
                transition: 'color 0.2s',
                position: 'relative',
              }}
            >
              {active && (
                <div style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 32, height: 3, background: 'var(--accent-purple)', borderRadius: '0 0 4px 4px',
                }} />
              )}
              <item.icon size={active ? 22 : 20} strokeWidth={active ? 2.2 : 1.8} />
              <span style={{ fontSize: 9, fontWeight: active ? 800 : 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                {item.label}
              </span>
            </button>
          );
        })}

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
            {(towelAlert && secondaryItems.some(i => i.path === '/towels') || monitorAlert && secondaryItems.some(i => i.path === '/hr-monitors')) && (
              <span style={{ position: 'absolute', top: 6, right: 'calc(50% - 14px)', width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
            )}
            <MoreHorizontal size={20} strokeWidth={1.8} />
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Ещё</span>
          </button>
        )}
      </div>

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
              position: 'fixed', bottom: 64, left: 0, right: 0,
              background: 'var(--bg-card)',
              borderRadius: '20px 20px 0 0',
              border: '1px solid var(--border)',
              borderBottom: 'none',
              zIndex: 301,
              padding: '12px 0 8px',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
              animation: 'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)',
            }}
          >
            {/* Handle */}
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 4, margin: '0 auto 12px' }} />

            {secondaryItems.map(item => {
              const active   = isActive(item.path);
              const isAl     = (item.path === '/towels' && towelAlert) || (item.path === '/hr-monitors' && monitorAlert);
              return (
                <button
                  key={item.path}
                  onClick={() => handleTabClick(item.path)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 24px', background: isAl ? 'rgba(239,68,68,0.04)' : 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    color: active ? 'var(--accent-purple)' : isAl ? '#ef4444' : 'var(--text-primary)',
                    borderLeft: active ? '3px solid var(--accent-purple)' : isAl ? '3px solid #ef4444' : '3px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <item.icon size={20} strokeWidth={1.8} />
                  <span style={{ flex: 1, fontSize: 15, fontWeight: active || isAl ? 700 : 500 }}>{item.label}</span>
                  {isAl
                    ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444', flexShrink: 0 }} />
                    : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                  }
                </button>
              );
            })}

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
                  ? <><Moon size={15} style={{ color: '#7B3DFF' }} /> Тёмная</>
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
              position: 'fixed', bottom: 64, left: 0, right: 0,
              background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
              border: '1px solid var(--border)', borderBottom: 'none',
              zIndex: 301, boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
              animation: 'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)',
              maxHeight: '70vh', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 4, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>Уведомления</span>
                {unreadCount > 0 && <span style={{ fontSize: 11, background: '#ef4444', color: '#fff', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>{unreadCount} новых</span>}
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 16 }}>
              {notifications.slice(0, 15).map(n => {
                const isUnread = !readIds?.has?.(n.id);
                return (
                  <div
                    key={n.id}
                    onClick={() => { markRead(n.id); if (n.ticketId) { navigate(`/tickets/${n.ticketId}`); setShowNotifications(false); } }}
                    style={{
                      padding: '12px 20px', borderBottom: '1px solid var(--border)',
                      background: isUnread ? 'rgba(123,61,255,0.05)' : 'transparent',
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
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return isMobile ? <MobileNav /> : <DesktopSidebar />;
};

export default Sidebar;
