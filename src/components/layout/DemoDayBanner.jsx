import React, { useState, useEffect, useRef } from 'react';
import { Zap, X, ExternalLink, GripVertical } from 'lucide-react';
import { useTickets } from '../../store/TicketContext';

const POS_KEY = 'hj_demoday_pos_v1';

const DemoDayBanner = () => {
  const { user } = useTickets();
  const [isVisible, setIsVisible] = useState(false);
  const MEET_LINK = "https://meet.google.com/zur-yyin-zdm?time=18:00";

  // Helper to extract time from link (e.g. ?time=18:00 or ?t=18:30 or hash #19:00)
  const getMeetingTime = (link) => {
    try {
      const url = new URL(link);
      const t = url.searchParams.get('time') || url.searchParams.get('t') || url.searchParams.get('start');
      if (t) return t;
      if (url.hash) {
        const hashVal = url.hash.substring(1);
        if (/^\d{2}[:.-]\d{2}$/.test(hashVal)) {
          return hashVal.replace(/[-.]/g, ':');
        }
      }
    } catch (e) {
      const match = link.match(/[?&](?:time|t|start)=([^&]+)/i);
      if (match) return decodeURIComponent(match[1]);
    }
    return null;
  };

  const meetingTime = getMeetingTime(MEET_LINK);

  // Закрытие — только на текущую сессию (перезагрузка вернёт баннер в пятницу до 20:00)
  const closedRef = useRef(false);

  useEffect(() => {
    const checkStatus = () => {
      const now = new Date();
      const isFriday = now.getDay() === 5;
      const isVisibleWindow = now.getHours() < 20;
      setIsVisible(isFriday && isVisibleWindow && !closedRef.current);
    };
    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Перетаскивание: позиция запоминается; вид меняется от расположения ──
  // Режим считаем ОТ КУРСОРА (не от центра баннера!) с гистерезисом — иначе
  // при смене режима баннер меняет размер, центр прыгает и режим начинает
  // переключаться туда-сюда («колбасит» у границы зоны).
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch { return null; }
  })();
  const [pos, setPos] = useState(stored?.x != null ? { x: stored.x, y: stored.y } : null);
  const [mode, setMode] = useState(stored?.mode || 'full');
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef(null);
  const dragRef = useRef(null); // { dx, dy } — смещение точки захвата
  const modeRef = useRef(stored?.mode || 'full');

  // Примерная ширина каждого вида — чтобы при смене вида курсор оставался на баннере
  const MODE_W = { full: 520, side: 210, top: 430 };

  // Гистерезис: войти в боковой режим — ближе 24% к краю, выйти — дальше 34%.
  // Пока курсор между порогами, режим НЕ меняется → никакого дребезга.
  const nextModeFor = (px, py, cur) => {
    const cx = px / window.innerWidth;
    const cy = py / window.innerHeight;
    if (cur === 'side') {
      if (cx > 0.34 && cx < 0.66) return cy < 0.28 ? 'top' : 'full';
      return 'side';
    }
    if (cx < 0.24 || cx > 0.76) return 'side';
    if (cur === 'top') return cy > 0.40 ? 'full' : 'top';
    return cy < 0.30 ? 'top' : 'full';
  };

  const clamp = (p) => {
    const el = rootRef.current;
    const w = el?.offsetWidth || 300;
    const h = el?.offsetHeight || 80;
    return {
      x: Math.min(Math.max(p.x, 8), Math.max(8, window.innerWidth - w - 8)),
      y: Math.min(Math.max(p.y, 8), Math.max(8, window.innerHeight - h - 8)),
    };
  };

  const onPointerDown = (e) => {
    // Кнопки и ссылки — не начинают перетаскивание
    if (e.target.closest('a, button')) return;
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    setDragging(true);
    el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const next = nextModeFor(e.clientX, e.clientY, modeRef.current);
    if (next !== modeRef.current) {
      modeRef.current = next;
      setMode(next);
      // Размер сменится — перехватываем баннер серединой верха под курсор,
      // чтобы точка захвата не оказалась за пределами нового размера
      dragRef.current = { dx: MODE_W[next] / 2, dy: 24 };
    }
    setPos(clamp({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy }));
  };
  const onPointerUp = (e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    rootRef.current?.releasePointerCapture?.(e.pointerId);
    setPos(p => {
      if (p) { try { localStorage.setItem(POS_KEY, JSON.stringify({ ...p, mode: modeRef.current })); } catch {} }
      return p;
    });
  };

  // При ресайзе окна не даём баннеру «уехать» за экран
  useEffect(() => {
    const onResize = () => setPos(p => (p ? clamp(p) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleClose = () => {
    closedRef.current = true;
    setIsVisible(false);
  };

  if (user?.role === 'admin') return null;
  if (!isVisible) return null;

  const posStyle = pos
    ? { left: pos.x, top: pos.y, bottom: 'auto', transform: 'none' }
    : undefined; // дефолт — низ по центру (CSS)

  return (
    <div
      ref={rootRef}
      className={`demo-day-banner mode-${mode} ${dragging ? 'dragging' : ''} ${pos ? '' : 'animate-fade-in'}`}
      style={posStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title="Зажмите и перетащите в удобное место"
    >
      {/* Ручка перетаскивания */}
      <GripVertical className="demo-day-grip" />

      {/* Animated Icon */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div className="absolute inset-0 bg-purple-500/40 blur-lg rounded-full animate-pulse"></div>
        <div className="demo-day-icon-container">
          <Zap className="demo-day-zap-icon" color="white" fill="white" />
        </div>
      </div>

      {/* Content */}
      <div className="demo-day-content">
        <div className="demo-day-label-container">
           <span className="demo-day-label" style={{ color: '#8E7BB8' }}>Weekly Event</span>
           <div className="demo-day-dot" />
           <span className="demo-day-day-label">Friday</span>
           {meetingTime && (
             <>
               <div className="demo-day-dot" />
               <span className="demo-day-label" style={{ color: '#8E7BB8' }}>{meetingTime}</span>
             </>
           )}
        </div>
        <h3 className="demo-day-title">
          СЕГОДНЯ <span style={{ color: '#b275ff' }}>DEMO DAY</span> {meetingTime && <span style={{ color: '#b275ff', marginLeft: 4 }}>в {meetingTime}</span>}
        </h3>
      </div>

      {/* Action Buttons */}
      <div className="demo-day-actions">
        <a
          href={MEET_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="demo-day-btn"
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <span className="demo-day-btn-text">ПРИСОЕДИНИТЬСЯ</span> <ExternalLink className="demo-day-link-icon" />
        </a>

        <button
          onClick={handleClose}
          className="demo-day-close-btn"
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
        >
          <X className="demo-day-close-icon" />
        </button>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-fade-in { animation: fade-in 0.5s cubic-bezier(0.16, 1, 0.3, 1); }

        .demo-day-banner {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 3000;
          width: auto;
          min-width: 400px;
          background: rgba(15, 15, 20, 0.9);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(123, 61, 255, 0.3);
          border-radius: 24px;
          padding: 16px 24px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 20px rgba(123, 61, 255, 0.1);
          display: flex;
          align-items: center;
          gap: 20px;
          cursor: grab;
          user-select: none;
          touch-action: none;
          transition: min-width 0.25s ease, padding 0.25s ease, border-radius 0.25s ease;
        }
        .demo-day-banner:active { cursor: grabbing; }
        /* Во время перетаскивания — без анимаций размера (иначе дёргается при смене вида) */
        .demo-day-banner.dragging { transition: none !important; }

        .demo-day-grip {
          width: 16px; height: 16px; flex-shrink: 0;
          color: rgba(255,255,255,0.25);
        }

        .demo-day-content { flex: 1; min-width: 0; }
        .demo-day-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }

        .demo-day-icon-container {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #7D6FB3, #9b5de5);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 2;
          box-shadow: 0 8px 16px rgba(123, 61, 255, 0.3);
        }

        .demo-day-zap-icon { width: 22px; height: 22px; }

        .demo-day-label-container {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 2px;
        }

        .demo-day-label {
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .demo-day-day-label {
          font-size: 10px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
        }

        .demo-day-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
        }

        .demo-day-title {
          font-size: 16px;
          font-weight: 900;
          color: white;
          letter-spacing: -0.01em;
          white-space: nowrap;
        }

        .demo-day-btn {
          background: #fff;
          color: #000;
          padding: 10px 20px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 800;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(255, 255, 255, 0.2);
          white-space: nowrap;
        }

        .demo-day-link-icon { width: 14px; height: 14px; }

        .demo-day-close-btn {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.03);
          color: rgba(255, 255, 255, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .demo-day-close-icon { width: 16px; height: 16px; }

        /* ── Вид «у бокового края»: компактная вертикальная карточка ── */
        .demo-day-banner.mode-side {
          min-width: 0;
          width: 210px;
          flex-direction: column;
          gap: 12px;
          padding: 22px 16px 16px;
          border-radius: 20px;
          text-align: center;
        }
        .demo-day-banner.mode-side .demo-day-grip { position: absolute; top: 6px; left: 50%; transform: translateX(-50%) rotate(90deg); }
        .demo-day-banner.mode-side .demo-day-label-container { justify-content: center; }
        .demo-day-banner.mode-side .demo-day-title { font-size: 14px; white-space: normal; }
        .demo-day-banner.mode-side .demo-day-actions { flex-direction: column; gap: 8px; width: 100%; }
        .demo-day-banner.mode-side .demo-day-btn { justify-content: center; width: 100%; padding: 9px 12px; }
        .demo-day-banner.mode-side .demo-day-close-btn { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border: none; background: none; }

        /* ── Вид «наверху»: тонкая полоска ── */
        .demo-day-banner.mode-top {
          min-width: 0;
          padding: 8px 16px;
          border-radius: 14px;
          gap: 12px;
        }
        .demo-day-banner.mode-top .demo-day-label-container { display: none; }
        .demo-day-banner.mode-top .demo-day-title { font-size: 13px; }
        .demo-day-banner.mode-top .demo-day-icon-container { width: 30px; height: 30px; border-radius: 10px; }
        .demo-day-banner.mode-top .demo-day-zap-icon { width: 15px; height: 15px; }
        .demo-day-banner.mode-top .demo-day-btn { padding: 6px 12px; font-size: 10px; }
        .demo-day-banner.mode-top .demo-day-close-btn { width: 26px; height: 26px; }

        /* Mobile: скрыт — показывается в мобильной шапке */
        @media (max-width: 640px) {
          .demo-day-banner { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default DemoDayBanner;
