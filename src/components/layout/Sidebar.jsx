import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
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

const CLUBS = ['ВСЕ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORCA', 'MY TASK'];

const Sidebar = ({ activeClub, setActiveClub, onCreateTicket }) => {
  const { logout } = useTickets();

  const topNav = [
    { icon: LayoutDashboard, label: 'Дашборд', path: '/dashboard' },
    { icon: Ticket, label: 'Заявки', path: '/tickets' },
    { icon: Archive, label: 'Архив', path: '/archive' },
    { icon: CheckSquare, label: 'Чек-листы', path: '/checklists' },
    { icon: Calendar, label: 'График', path: '/schedule' },
    { icon: Phone, label: 'Созвоны', path: '/calls' },
  ];

  const bottomNav = [
    { icon: MessageCircle, label: 'Чат', path: '/chat' },
    { icon: Settings, label: 'Настройки', path: '/settings' },
  ];

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-text">HEROTRACK</div>
      </div>

      {/* Main Nav */}
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

      {/* Bottom Nav */}
      <div className="border-t border-app py-3">
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
        <button
          onClick={logout}
          className="nav-item w-full text-left"
          style={{ color: 'var(--accent-red)' }}
        >
          <LogOut size={17} strokeWidth={1.8} />
          <span>Выйти</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
