import React, { useEffect, useRef, useState } from 'react';
import { useNotifications } from '../../store/NotificationContext';
import { useNavigate } from 'react-router-dom';

const NotificationPopup = () => {
  const { popupNotif, dismissPopup } = useNotifications();
  const navigate = useNavigate();
  const cardRef = useRef(null);
  const timers = useRef([]);

  const [notif, setNotif] = useState(null);
  const [cardVisible, setCardVisible] = useState(false);
  const [textVisible, setTextVisible] = useState(false);

  const after = (ms, fn) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; };
  const clearAll = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const fly = () => {
    const card = cardRef.current;
    const bell = document.getElementById('notification-bell-btn');
    if (!card || !bell) { close(); return; }

    const cR = card.getBoundingClientRect();
    const bR = bell.getBoundingClientRect();
    const dx = (bR.left + bR.width / 2) - (cR.left + cR.width / 2);
    const dy = (bR.top  + bR.height / 2) - (cR.top  + cR.height / 2);

    card.style.transition = 'transform 0.52s cubic-bezier(0.55,0,1,0.75), opacity 0.42s ease 0.08s';
    card.style.transform  = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.06)`;
    card.style.opacity    = '0';

    after(620, close);
  };

  const close = () => {
    clearAll();
    setCardVisible(false);
    setTextVisible(false);
    after(420, () => {
      setNotif(null);
      dismissPopup();
    });
  };

  useEffect(() => {
    if (!popupNotif) return;
    clearAll();
    setCardVisible(false);
    setTextVisible(false);

    if (cardRef.current) {
      cardRef.current.style.transition = '';
      cardRef.current.style.transform  = '';
      cardRef.current.style.opacity    = '';
    }

    setNotif(popupNotif);
    after(80,   () => setCardVisible(true));
    after(880,  () => setTextVisible(true));
    after(4600, fly);

    return clearAll;
  }, [popupNotif?.id]);

  if (!notif) return null;

  const txt = (delay = 0) => ({
    opacity:    textVisible ? 1 : 0,
    transform:  textVisible ? 'translateY(0)' : 'translateY(7px)',
    transition: `opacity 0.3s ease ${delay}s, transform 0.3s ease ${delay}s`,
  });

  return (
    <>
      <style>{`@keyframes hjFlip{0%{transform:rotateY(0)}40%{transform:rotateY(200deg)}72%{transform:rotateY(348deg)}100%{transform:rotateY(360deg)}}`}</style>

      {/* overlay */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(9,10,15,0.68)',
        opacity: cardVisible ? 1 : 0,
        transition: 'opacity 0.36s ease',
        zIndex: 9990,
        pointerEvents: cardVisible ? 'auto' : 'none',
      }} onClick={close} />

      {/* card */}
      <div
        ref={cardRef}
        style={{
          position: 'fixed', top: '50%', left: '50%',
          width: 296,
          background: 'var(--bg-card)',
          border: '1px solid rgba(200,168,75,0.22)',
          borderRadius: 22,
          padding: '30px 22px 22px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          boxShadow: '0 32px 72px rgba(0,0,0,0.6), 0 0 48px rgba(200,168,75,0.1)',
          zIndex: 9991,
          opacity:   cardVisible ? 1 : 0,
          transform: cardVisible
            ? 'translate(-50%,-50%) scale(1)'
            : 'translate(-50%,-50%) scale(0.8)',
          transition: 'opacity 0.42s ease, transform 0.42s cubic-bezier(0.34,1.5,0.64,1)',
        }}
      >
        {/* HJ mark */}
        <div style={{
          width: 68, height: 68,
          background: 'rgba(200,168,75,0.12)',
          border: '1.5px solid rgba(200,168,75,0.25)',
          borderRadius: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 900, color: '#C8A84B',
          marginBottom: 20,
          perspective: 600,
        }}>
          <span style={{
            display: 'block',
            transformStyle: 'preserve-3d',
            animation: cardVisible ? 'hjFlip 0.72s cubic-bezier(0.4,0,0.2,1) forwards' : 'none',
          }}>HJ</span>
        </div>

        {/* eyebrow */}
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: '#C8A84B', marginBottom: 8,
          ...txt(0),
        }}>
          Новое уведомление
        </div>

        {/* title */}
        <div style={{
          fontSize: 16, fontWeight: 600, lineHeight: 1.45,
          textAlign: 'center', color: 'var(--text-primary)', marginBottom: 5,
          ...txt(0.07),
        }}>
          {notif.title}
        </div>

        {/* description */}
        <div style={{
          fontSize: 12.5, color: 'var(--text-secondary)',
          textAlign: 'center', marginBottom: 22,
          ...txt(0.13),
        }}>
          {notif.description}
        </div>

        {/* action button */}
        <button
          onClick={() => {
            clearAll();
            fly();
            if (notif.ticketId) {
              setTimeout(() => navigate(`/tickets/${notif.ticketId}`), 80);
            }
          }}
          style={{
            width: '100%', padding: '11px 0',
            background: '#C8A84B', color: '#080600',
            fontSize: 13.5, fontWeight: 700, letterSpacing: '0.04em',
            border: 'none', borderRadius: 12, cursor: 'pointer',
            ...txt(0.18),
          }}
        >
          {notif.ticketId ? 'Открыть заявку' : 'Посмотреть'}
        </button>

        {/* dismiss */}
        <button
          onClick={() => { clearAll(); fly(); }}
          style={{
            marginTop: 10, fontSize: 12,
            color: 'var(--text-muted)',
            background: 'none', border: 'none', cursor: 'pointer',
            ...txt(0.24),
          }}
        >
          Закрыть
        </button>
      </div>
    </>
  );
};

export default NotificationPopup;
