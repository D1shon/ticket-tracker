import React from 'react';
import { Bell } from 'lucide-react';

const Header = () => {
  return (
    <header className="topbar" style={{ marginLeft: '220px', justifyContent: 'flex-end' }}>
      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-lg transition-colors" style={{ color: 'var(--text-secondary)' }}>
          <Bell size={18} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
};

export default Header;
