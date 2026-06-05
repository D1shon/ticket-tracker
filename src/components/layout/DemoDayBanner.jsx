import React, { useState, useEffect } from 'react';
import { Zap, X, ExternalLink, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { useTickets } from '../../store/TicketContext';

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
      // Regex fallback if URL parsing fails
      const match = link.match(/[?&](?:time|t|start)=([^&]+)/i);
      if (match) return decodeURIComponent(match[1]);
    }
    return null;
  };

  const meetingTime = getMeetingTime(MEET_LINK);

  useEffect(() => {
    const checkStatus = () => {
      const now = new Date();
      const isFriday = now.getDay() === 5; // 5 is Friday
      const isBeforeEightPM = now.getHours() < 20;
      
      // Check if user already closed it today
      const todayKey = `demo_day_closed_${format(now, 'yyyy-MM-dd')}`;
      const isClosedManually = localStorage.getItem(todayKey);

      if (isFriday && !isClosedManually) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const handleClose = () => {
    const todayKey = `demo_day_closed_${format(new Date(), 'yyyy-MM-dd')}`;
    localStorage.setItem(todayKey, 'true');
    setIsVisible(false);
  };

  if (user?.role === 'admin') return null;
  if (!isVisible) return null;

  return (
    <div 
      className="animate-fade-in"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3000,
        width: 'auto',
        minWidth: 400,
        background: 'rgba(15, 15, 20, 0.9)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(123, 61, 255, 0.3)',
        borderRadius: 24,
        padding: '16px 24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 20px rgba(123, 61, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
      }}
    >
      {/* Animated Icon */}
      <div style={{ position: 'relative' }}>
        <div className="absolute inset-0 bg-purple-500/40 blur-lg rounded-full animate-pulse"></div>
        <div style={{
          width: 44, height: 44, 
          background: 'linear-gradient(135deg, #7B3DFF, #9b5de5)', 
          borderRadius: 14, 
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', zIndex: 2,
          boxShadow: '0 8px 16px rgba(123, 61, 255, 0.3)'
        }}>
          <Zap size={22} color="white" fill="white" />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
           <span style={{ fontSize: 10, fontWeight: 900, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Weekly Event</span>
           <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
           <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Friday</span>
           {meetingTime && (
             <>
               <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
               <span style={{ fontSize: 10, fontWeight: 900, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{meetingTime}</span>
             </>
           )}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 900, color: 'white', letterSpacing: '-0.01em' }}>
          СЕГОДНЯ <span style={{ color: '#b275ff' }}>DEMO DAY</span> {meetingTime && <span style={{ color: '#b275ff', marginLeft: 4 }}>в {meetingTime}</span>}
        </h3>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <a 
          href={MEET_LINK} 
          target="_blank" 
          rel="noopener noreferrer"
          style={{
            background: '#fff',
            color: '#000',
            padding: '10px 20px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 800,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(255,255,255,0.2)'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          ПРИСОЕДИНИТЬСЯ <ExternalLink size={14} />
        </a>
        
        <button 
          onClick={handleClose}
          style={{
            width: 32, height: 32,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(255,255,255,0.03)',
            color: 'rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
        >
          <X size={16} />
        </button>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-fade-in { animation: fade-in 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
};

export default DemoDayBanner;
