import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Ticket, 
  CheckSquare, 
  Calendar, 
  Settings, 
  LogOut 
} from 'lucide-react';
import { useTickets } from '../../store/TicketContext';

const Sidebar = () => {
  const { logout } = useTickets();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Дашборд', path: '/dashboard' },
    { icon: Ticket, label: 'Заявки', path: '/tickets' },
    { icon: CheckSquare, label: 'Чек-лист', path: '/checklist' },
    { icon: Calendar, label: 'График', path: '/schedule' },
  ];

  return (
    <aside className="w-64 glass h-screen fixed left-0 top-0 flex flex-col p-4 z-40">
      <div className="flex items-center gap-3 px-2 mb-8 mt-2">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-white">H</div>
        <span className="font-bold text-xl tracking-tight text-foreground">Herotrack</span>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
              ${isActive 
                ? 'bg-primary/10 text-primary font-medium' 
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'}
            `}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-1 border-t border-border pt-4">
        <button className="flex items-center gap-3 px-3 py-2.5 w-full text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl transition-all">
          <Settings size={20} />
          <span>Настройки</span>
        </button>
        <button 
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 w-full text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
        >
          <LogOut size={20} />
          <span>Выйти</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
