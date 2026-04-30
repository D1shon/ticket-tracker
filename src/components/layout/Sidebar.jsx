import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, Ticket, CheckSquare, Calendar, 
  Archive, Phone, MessageCircle, Settings, LogOut, Sun, Moon, Bell
} from 'lucide-react';

const Sidebar = () => {
  // Load saved theme from localStorage (default: light)
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('herotrack-theme') === 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('herotrack-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const topNav = [
    { icon: LayoutDashboard, label: 'Дашборд',    path: '/dashboard' },
    { icon: Ticket,          label: 'Заявки',      path: '/tickets' },
    { icon: Archive,         label: 'Архив',       path: '/archive' },
    { icon: CheckSquare,     label: 'Чок-листы',   path: '/checklists' },
    { icon: Calendar,        label: 'График',      path: '/schedule' },
    { icon: Phone,           label: 'Созвоны',     path: '/calls' },
  ];

  const bottomNav = [
    { icon: Settings,      label: 'Настройки', path: '/settings' },
  ];

  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(2);

  const notifications = [
    { id: 1, text: 'Пользователь Владимир оставил комментарий в заявке "Разборка серверной"', time: '10 мин назад' },
    { id: 2, text: 'Алексей сменил статус заявки "Фен Борк сломан" на "В работе"', time: '1 час назад' }
  ];

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-text">HEROTRACK</div>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, paddingTop: 8 }}>
        {topNav.map(item => (
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

      {/* Bottom section */}
      <div style={{ borderTop: '1px solid var(--sidebar-border)', paddingTop: 4, paddingBottom: 8, position: 'relative' }}>
        
        {/* Notifications Button */}
        <button
          className={`nav-item ${showNotifications ? 'active' : ''}`}
          onClick={() => {
            setShowNotifications(!showNotifications);
            setUnreadCount(0);
          }}
          style={{ width: '100%', justifyContent: 'flex-start' }}
        >
          <div style={{ position: 'relative' }}>
            <Bell size={17} strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: 'white', fontSize: 9, width: 14, height: 14, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {unreadCount}
              </span>
            )}
          </div>
          <span>Уведомления</span>
        </button>

        {/* Notifications Panel Popup */}
        {showNotifications && (
          <div style={{
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
              {notifications.map(notif => (
                <div key={notif.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', transition: 'background 0.2s', cursor: 'pointer' }} className="hover:bg-[rgba(123,61,255,0.05)]">
                  <p style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>
                    {notif.text}
                  </p>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{notif.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {bottomNav.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <item.icon size={17} strokeWidth={1.8} />
            <span>{item.label}</span>
          </NavLink>
        ))}

        {/* ── DARK MODE TOGGLE ── */}
        <button
          className="theme-toggle"
          onClick={() => setIsDark(d => !d)}
          title={isDark ? 'Переключить в светлый режим' : 'Переключить в тёмный режим'}
        >
          {isDark
            ? <Moon size={17} strokeWidth={1.8} style={{ color: '#7B3DFF', flexShrink: 0 }} />
            : <Sun  size={17} strokeWidth={1.8} style={{ color: '#FB8F41', flexShrink: 0 }} />
          }
          <span style={{ flex: 1 }}>
            {isDark ? 'Тёмная' : 'Светлая'}
          </span>
          {/* Toggle pill */}
          <div className="theme-toggle-icon" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
