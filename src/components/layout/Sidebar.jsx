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
    { icon: Bell,          label: 'Уведомления', path: '/notifications' },
    { icon: Settings,      label: 'Настройки', path: '/settings' },
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
      <div style={{ borderTop: '1px solid var(--sidebar-border)', paddingTop: 4, paddingBottom: 8 }}>
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
