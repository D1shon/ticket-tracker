import React from 'react';
import { Bell, Search, User } from 'lucide-react';
import { useTickets } from '../../store/TicketContext';

const Header = () => {
  const { user } = useTickets();

  return (
    <header className="h-16 glass fixed top-0 right-0 left-64 flex items-center justify-between px-6 z-30">
      <div className="flex items-center bg-muted/50 px-3 py-1.5 rounded-xl w-96 border border-border">
        <Search size={18} className="text-muted-foreground" />
        <input 
          type="text" 
          placeholder="Поиск задач..." 
          className="bg-transparent border-none focus:ring-0 text-sm ml-2 w-full text-foreground"
        />
      </div>

      <div className="flex items-center gap-4">
        <button className="p-2 hover:bg-muted rounded-full transition-all relative">
          <Bell size={20} className="text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border-2 border-background"></span>
        </button>
        
        <div className="flex items-center gap-3 pl-4 border-l border-border">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-foreground">{user?.email?.split('@')[0]}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.email?.split('@')[1]?.split('.')[0] || 'User'}</p>
          </div>
          <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center border border-border">
            <User size={20} className="text-muted-foreground" />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
