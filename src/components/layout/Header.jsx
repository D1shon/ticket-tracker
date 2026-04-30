import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Bell } from 'lucide-react';

const CLUBS = ['ВСЕ', '4YOU', 'COLIBRI', 'VILLA', 'NURLY ORCA', 'MY TASK'];

const Header = ({ activeClub, setActiveClub, onCreateTicket }) => {
  const location = useLocation();
  const [localClub, setLocalClub] = useState('ВСЕ');

  const club = activeClub || localClub;
  const setClub = setActiveClub || setLocalClub;

  return (
    <header className="topbar" style={{ marginLeft: '220px' }}>
      {/* Club tabs */}
      <div className="flex items-center gap-1 flex-1">
        {CLUBS.map(c => (
          <button
            key={c}
            onClick={() => setClub(c)}
            className={`club-tab ${club === c ? 'active' : ''}`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
          <Bell size={18} color="var(--text-secondary)" strokeWidth={1.8} />
        </button>
        {onCreateTicket && (
          <button onClick={onCreateTicket} className="btn-create flex items-center gap-1.5">
            <Plus size={14} strokeWidth={2.5} />
            СОЗДАТЬ ЗАЯВКУ
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
