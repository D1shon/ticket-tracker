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
      const isBeforeSevenPM = now.getHours() < 19; // Stay visible until 19:00 (7 PM)
      
      // Check if user already closed it today
      const todayKey = `demo_day_closed_${format(now, 'yyyy-MM-dd')}`;
      const isClosedManually = localStorage.getItem(todayKey);

      if (isFriday && isBeforeSevenPM && !isClosedManually) {
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
      className="demo-day-banner animate-fade-in"
    >
      {/* Animated Icon */}
      <div style={{ position: 'relative' }}>
        <div className="absolute inset-0 bg-purple-500/40 blur-lg rounded-full animate-pulse"></div>
        <div className="demo-day-icon-container">
          <Zap className="demo-day-zap-icon" color="white" fill="white" />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div className="demo-day-label-container">
           <span className="demo-day-label" style={{ color: '#a855f7' }}>Weekly Event</span>
           <div className="demo-day-dot" />
           <span className="demo-day-day-label">Friday</span>
           {meetingTime && (
             <>
               <div className="demo-day-dot" />
               <span className="demo-day-label" style={{ color: '#a855f7' }}>{meetingTime}</span>
             </>
           )}
        </div>
        <h3 className="demo-day-title">
          СЕГОДНЯ <span style={{ color: '#b275ff' }}>DEMO DAY</span> {meetingTime && <span style={{ color: '#b275ff', marginLeft: 4 }}>в {meetingTime}</span>}
        </h3>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'inherit' }}>
        <a 
          href={MEET_LINK} 
          target="_blank" 
          rel="noopener noreferrer"
          className="demo-day-btn"
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          ПРИСОЕДИНИТЬСЯ <ExternalLink className="demo-day-link-icon" />
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
        }
        
        .demo-day-icon-container {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #7B3DFF, #9b5de5);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 2;
          box-shadow: 0 8px 16px rgba(123, 61, 255, 0.3);
        }
        
        .demo-day-zap-icon {
          width: 22px;
          height: 22px;
        }
        
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
        
        .demo-day-link-icon {
          width: 14px;
          height: 14px;
        }
        
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
        }
        
        .demo-day-close-icon {
          width: 16px;
          height: 16px;
        }

        /* Mobile styling: hide completely as it is shown in the mobile top navigation header */
        @media (max-width: 640px) {
          .demo-day-banner {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default DemoDayBanner;
