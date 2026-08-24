import React, { useEffect, useState, useRef } from 'react';
import { isMobileDevice } from '../../lib/isMobile';
import { useNotifications } from '../../store/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';

// Маленькая плашка «Новое сообщение», выезжающая ИЗ колокольчика.
// ПК — колокольчик справа сверху (#notification-bell-btn),
// мобайл — колокольчик слева сверху (#notification-bell-mobile).
// Направление выезда подстраивается: если колокольчик справа — плашка выезжает
// влево, если слева — вправо.
const NotificationPopup = () => {
  const { popupNotif, dismissPopup } = useNotifications();
  const navigate = useNavigate();
  const [notif, setNotif] = useState(null);
  const [shown, setShown] = useState(false);
  const [pos, setPos] = useState({ top: 20, right: 16, side: 'right' });
  const timers = useRef([]);
  const after = (ms, fn) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; };
  const clearAll = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useEffect(() => {
    if (!popupNotif) return;
    clearAll();
    const isMobile = isMobileDevice();
    const bell = document.getElementById(isMobile ? 'notification-bell-mobile' : 'notification-bell-btn')
      || document.getElementById('notification-bell-btn')
      || document.getElementById('notification-bell-mobile');
    let p;
    if (bell) {
      const b = bell.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      if (cx > window.innerWidth / 2) {
        p = { top: cy, right: Math.round(window.innerWidth - b.left + 8), side: 'right' };
      } else {
        p = { top: cy, left: Math.round(b.right + 8), side: 'left' };
      }
    } else {
      p = { top: 20, right: 16, side: 'right' };
    }
    setPos(p);
    setNotif(popupNotif);
    setShown(false);
    after(40, () => setShown(true));
    after(3600, () => { setShown(false); after(340, () => { setNotif(null); dismissPopup(); }); });
    return clearAll;
  }, [popupNotif?.id]);

  if (!notif) return null;

  const go = () => {
    clearAll();
    setShown(false);
    if (notif.ticketId) navigate(`/tickets/${notif.ticketId}`);
    after(320, () => { setNotif(null); dismissPopup(); });
  };

  const originX = pos.side === 'right' ? 'right' : 'left';
  const tuck = pos.side === 'right' ? '10px' : '-10px'; // старт «внутри» колокольчика

  return (
    <div
      onClick={go}
      style={{
        position: 'fixed',
        top: pos.top,
        ...(pos.side === 'right' ? { right: pos.right } : { left: pos.left }),
        transform: shown
          ? 'translateY(-50%) translateX(0) scale(1)'
          : `translateY(-50%) translateX(${tuck}) scale(0.5)`,
        transformOrigin: `${originX} center`,
        opacity: shown ? 1 : 0,
        transition: 'opacity 0.3s ease, transform 0.42s cubic-bezier(0.34,1.45,0.6,1)',
        zIndex: 9995,
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-card)',
        border: '1px solid rgba(200,168,75,0.4)',
        color: 'var(--text-primary)',
        borderRadius: 999,
        padding: '8px 15px 8px 9px',
        boxShadow: '0 10px 26px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'flex', width: 24, height: 24, borderRadius: '50%', background: 'rgba(200,168,75,0.16)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Bell size={14} style={{ color: '#C8A84B' }} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 700 }}>Новое сообщение</span>
    </div>
  );
};

export default NotificationPopup;
