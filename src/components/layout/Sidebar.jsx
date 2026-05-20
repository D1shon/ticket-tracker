import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Ticket, CheckSquare, Calendar, 
  Archive, Phone, MessageCircle, Settings, LogOut, Sun, Moon, Bell, MapPin,
  Menu, X
} from 'lucide-react';
import { useNotifications } from '../../store/NotificationContext';

const Sidebar = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  
  // Load saved theme from localStorage (default: light)
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('hjtrack-theme') === 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('hjtrack-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Close sidebar on navigation (mobile)
  const handleNavClick = () => {
    if (window.innerWidth <= 768) {
      setIsOpen(false);
    }
  };

  const topNav = [
    { icon: LayoutDashboard, label: 'Дашборд',    path: '/dashboard' },
    { icon: Ticket,          label: 'Заявки',      path: '/tickets' },
    { icon: Archive,         label: 'Архив',       path: '/archive' },
    { icon: CheckSquare,     label: 'Чек-листы',   path: '/checklists' },
    { icon: Calendar,        label: 'График',      path: '/schedule' },
    { icon: MapPin,          label: 'Чекин',       path: '/attendance' },
    { icon: Phone,           label: 'Созвоны',     path: '/calls' },
  ];

  const bottomNav = [
    { icon: Settings,      label: 'Настройки', path: '/settings' },
  ];

  const { notifications, readIds, unreadCount, markRead, markAllRead } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);

  const timeAgo = (isoString) => {
    if (!isoString) return '';
    const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
    if (diff < 60)   return 'только что';
    if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
    return `${Math.floor(diff / 86400)} д назад`;
  };

  return (
    <>
      {/* Mobile Toggle Button */}
      <button 
        className="mobile-nav-toggle"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed', top: 16, left: 16, zIndex: 1001,
          background: 'var(--accent-purple)', color: '#fff', border: 'none',
          padding: 10, borderRadius: 12, display: 'none'
        }}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay for Mobile */}
      <div 
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={() => setIsOpen(false)}
      />

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="logo-text">HJTRACK</div>
        </div>

        {/* Main nav */}
        <nav style={{ flex: 1, paddingTop: 8 }}>
          {topNav.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div style={{ borderTop: '1px solid var(--sidebar-border)', paddingTop: 4, paddingBottom: 8, position: 'relative' }}>
          
          <button
            className={`nav-item ${showNotifications ? 'active' : ''}`}
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications && unreadCount > 0) {
                setTimeout(markAllRead, 800);
              }
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
            <div className="notifications-popup" style={{
              position: 'absolute',
              left: '230px',
              bottom: '40px',
              width: '320px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
              zIndex: 100,
              overflow: 'hidden'
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 'bold', fontSize: 13, color: 'var(--text-primary)' }}>
                Новые сообщения
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {notifications.slice(0, 10).map(notif => {
                  const isUnread = !readIds?.has?.(notif.id);
                  return (
                    <div 
                      key={notif.id} 
                      onClick={() => {
                        markRead(notif.id);
                        if (notif.ticketId) {
                          navigate(`/tickets/${notif.ticketId}`);
                        }
                        setShowNotifications(false);
                        setIsOpen(false);
                      }}
                      style={{ 
                        padding: '12px 16px', 
                        borderBottom: '1px solid var(--border)', 
                        transition: 'background 0.2s', 
                        cursor: notif.ticketId ? 'pointer' : 'default',
                        background: isUnread ? 'rgba(123,61,255,0.06)' : 'transparent'
                      }} 
                    >
                      <p style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>
                        <span style={{ fontWeight: isUnread ? 700 : 500 }}>{notif.title}</span>
                        <br />
                        <span style={{ color: 'var(--text-secondary)' }}>{notif.description}</span>
                      </p>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(notif.createdAt)}</span>
                    </div>
                  );
                })}
                {notifications.length === 0 && (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    Нет новых уведомлений
                  </div>
                )}
              </div>
            </div>
          )}

          {bottomNav.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
            </NavLink>
          ))}

          <button
            className="theme-toggle"
            onClick={() => setIsDark(d => !d)}
          >
            {isDark
              ? <Moon size={17} strokeWidth={1.8} style={{ color: '#7B3DFF', flexShrink: 0 }} />
              : <Sun  size={17} strokeWidth={1.8} style={{ color: '#FB8F41', flexShrink: 0 }} />
            }
            <span style={{ flex: 1 }}>
              {isDark ? 'Тёмная' : 'Светлая'}
            </span>
            <div className="theme-toggle-icon" />
          </button>
        </div>
      </aside>

      <style>{`
        @media (max-width: 768px) {
          .mobile-nav-toggle { display: flex !important; }
          .sidebar { 
            transform: translateX(-100%); 
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1000;
            width: 280px !important;
          }
          .sidebar.open { transform: translateX(0); }
          .sidebar-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
            z-index: 999; opacity: 0; pointer-events: none; transition: opacity 0.3s;
          }
          .sidebar-overlay.visible { opacity: 1; pointer-events: auto; }
          .notifications-popup { left: 0 !important; bottom: 60px !important; width: calc(100vw - 32px) !important; margin-left: 16px; }
        }
      `}</style>
    </>
  );
};

export default Sidebar;
