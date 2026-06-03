import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Ticket, CheckSquare, Calendar, 
  Archive, Phone, Settings, LogOut, Sun, Moon, Bell, MapPin,
  MoreHorizontal, X, ChevronRight, Package, TrendingUp
} from 'lucide-react';
import { useNotifications } from '../../store/NotificationContext';
import { useTickets } from '../../store/TicketContext';

/* ─── All nav items ──────────────────────────────────────────── */
const ALL_NAV = [
  { icon: Ticket,          label: 'Заявки',     path: '/tickets',     primary: true  },
  { icon: Calendar,        label: 'График',      path: '/schedule',    primary: true  },
  { icon: CheckSquare,     label: 'Чек-листы',  path: '/checklists',  primary: true  },
  { icon: Package,         label: 'Склад',       path: '/merch',       primary: true  },
  { icon: TrendingUp,      label: 'Продажи',    path: '/sales',       primary: true  },
  { icon: LayoutDashboard, label: 'Дашборд',    path: '/dashboard',   primary: false },
  { icon: Archive,         label: 'Архив',       path: '/archive',     primary: false },
  { icon: MapPin,          label: 'Чекин',       path: '/attendance',  primary: false },
  { icon: Phone,           label: 'Созвоны',     path: '/calls',       primary: false },
  { icon: Settings,        label: 'Настройки',   path: '/settings',    primary: false },
];

/* ─── Desktop Sidebar ────────────────────────────────────────── */
const DesktopSidebar = () => {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(() => localStorage.getItem('hjtrack-theme') === 'dark');
  const { notifications, readIds, unreadCount, markRead, markAllRead } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);

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

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-text">HJTRACK</div>
      </div>

      <nav style={{ flex: 1, paddingTop: 8 }}>
        {ALL_NAV.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <item.icon size={17} strokeWidth={1.8} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div style={{ borderTop: '1px solid var(--sidebar-border)', paddingTop: 4, paddingBottom: 8, position: 'relative' }}>
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

        {showNotifications && (
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
      </div>
    </aside>
  );
};

/* ─── Mobile Layout ──────────────────────────────────────────── */
const MobileNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, readIds, unreadCount, markRead, markAllRead } = useNotifications();
  const [isDark, setIsDark] = useState(() => localStorage.getItem('hjtrack-theme') === 'dark');
  const [showMore, setShowMore] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const sheetRef = useRef(null);

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

  // Bottom nav: 4 primary tabs + "More" button
  const primaryTabs = ALL_NAV.filter(n => n.primary);
  const secondaryItems = ALL_NAV.filter(n => !n.primary);

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
        <div style={{ fontWeight: 900, fontSize: 16, letterSpacing: '0.06em', color: 'var(--accent-purple)', fontStyle: 'italic' }}>
          HJTRACK
        </div>
        {/* Notification bell */}
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
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
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
        <button
          onClick={() => { setShowNotifications(false); setShowMore(v => !v); }}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, border: 'none', background: 'transparent', cursor: 'pointer',
            color: (showMore || isMoreActive) ? 'var(--accent-purple)' : 'var(--text-muted)',
            transition: 'color 0.2s', position: 'relative',
          }}
        >
          {(showMore || isMoreActive) && (
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 32, height: 3, background: 'var(--accent-purple)', borderRadius: '0 0 4px 4px' }} />
          )}
          <MoreHorizontal size={20} strokeWidth={1.8} />
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Ещё</span>
        </button>
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
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => handleTabClick(item.path)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 24px', background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    color: active ? 'var(--accent-purple)' : 'var(--text-primary)',
                    borderLeft: active ? '3px solid var(--accent-purple)' : '3px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <item.icon size={20} strokeWidth={1.8} />
                  <span style={{ flex: 1, fontSize: 15, fontWeight: active ? 700 : 500 }}>{item.label}</span>
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
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
          </div>
        </>
      )}

      {/* ── Notifications Bottom Sheet ── */}
      {showNotifications && (
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
