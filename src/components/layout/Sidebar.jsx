import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Ticket, 
  CheckSquare, 
  Calendar, 
  Archive,
  Phone,
  MessageCircle,
  Settings,
  LogOut
} from 'lucide-react';
import { useTickets } from '../../store/TicketContext';

const Sidebar = () => {
  const { logout } = useTickets();

  const topNav = [
    { icon: LayoutDashboard, label: 'Дашборд', path: '/dashboard' },
    { icon: Ticket, label: 'Заявки', path: '/tickets' },
    { icon: Archive, label: 'Архив', path: '/archive' },
    { icon: CheckSquare, label: 'Чок-листы', path: '/checklists' },
    { icon: Calendar, label: 'График', path: '/schedule' },
    { icon: Phone, label: 'Созвоны', path: '/calls' },
  ];

  const bottomNav = [
    { icon: MessageCircle, label: 'Чат', path: '/chat' },
    { icon: Settings, label: 'Настройки', path: '/settings' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-text">HEROTRACK</div>
      </div>
      <nav className="flex-1 py-3">
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
      <div className="py-3" style={{ borderTop: '1px solid var(--border)' }}>
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
        <button onClick={logout} className="nav-item w-full text-left" style={{ color: '#ef4444' }}>
          <LogOut size={17} strokeWidth={1.8} />
          <span>Выйти</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
