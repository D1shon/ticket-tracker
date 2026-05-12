import React, { useState, useEffect } from 'react';
import { QrCode, MapPin, ShieldCheck, Camera, Smartphone, CheckCircle2, Lock, Navigation, X, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const MobileScanner = () => {
  const [status, setStatus] = useState('idle'); // idle, scanning, verifying, success
  const [gpsLocked, setGpsLocked] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [adminName, setAdminName] = useState('');
  const videoRef = React.useRef(null);

  useEffect(() => {
    // Get admin name from URL params
    const params = new URLSearchParams(window.location.search);
    const name = params.get('admin');
    if (name) setAdminName(name);

    // Detect OS
    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    
    // Check if already in standalone mode
    if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallPrompt(false);
    }

    setTimeout(() => setGpsLocked(true), 2000);
  }, []);

  const InstallPrompt = () => (
    <div style={{ 
      position: 'fixed', top: 20, left: 20, right: 20, background: 'var(--accent-purple)', 
      borderRadius: 24, padding: '20px', zIndex: 2000, boxShadow: '0 20px 40px rgba(139, 92, 246, 0.4)',
      animation: 'slideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
         <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Smartphone size={24} />
         </div>
         <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>Установите приложение</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Для быстрого доступа</div>
         </div>
         <button onClick={() => setShowInstallPrompt(false)} style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.5 }}><X size={20} /></button>
      </div>
      
      <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 16, padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.4 }}>
        {isIOS ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Нажмите <div style={{ background: '#fff', borderRadius: 6, padding: 4, display: 'inline-flex' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg></div> и выберите <b>«На экран Домой»</b>
          </div>
        ) : (
          "Нажмите на три точки в углу и выберите «Установить приложение»"
        )}
      </div>
    </div>
  );

  const startScan = () => {
    setStatus('scanning');
  };

  const handleScanSimulation = () => {
    setStatus('verifying');
    
    setTimeout(async () => {
      try {
        if (adminName) {
          // Send signal to Firebase that this admin is verified
          await updateDoc(doc(db, 'attendance_sync', adminName), {
            status: 'verified',
            timestamp: Date.now(),
            geo: 'Verified'
          });
        }
        setStatus('success');
      } catch (error) {
        console.error("Verification failed:", error);
        alert("Ошибка верификации. Попробуйте еще раз.");
        setStatus('idle');
      }
    }, 2500);
  };

  if (status === 'success') {
    return (
      <div style={{ height: '100vh', background: '#09090b', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', marginBottom: 24, animation: 'scaleIn 0.5s ease-out' }}>
           <CheckCircle2 size={48} />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>ВЕРИФИЦИРОВАНО</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 32 }}>Смена успешно открыта для: <b>{adminName}</b></p>
        
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 24, padding: 20, textAlign: 'left' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Время:</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{format(new Date(), 'HH:mm:ss')}</span>
           </div>
           <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Локация:</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#22c55e' }}>VILLA (Verified)</span>
           </div>
        </div>

        <button 
          onClick={() => setStatus('idle')}
          style={{ marginTop: 'auto', width: '100%', padding: '18px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, fontWeight: 800 }}
        >
          ЗАКРЫТЬ
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', background: '#09090b', color: '#fff', padding: 24, display: 'flex', flexDirection: 'column' }}>
      {showInstallPrompt && <InstallPrompt />}
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
           <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={24} />
           </div>
           <div>
              <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.02em' }}>HJTRACK <span style={{ color: 'var(--accent-purple)' }}>MOBILE</span></div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Security Terminal</div>
           </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: gpsLocked ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', padding: '6px 10px', borderRadius: 10, border: gpsLocked ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(239,68,68,0.2)' }}>
           <Navigation size={12} color={gpsLocked ? '#22c55e' : '#ef4444'} />
           <span style={{ fontSize: 10, fontWeight: 900, color: gpsLocked ? '#22c55e' : '#ef4444' }}>{gpsLocked ? 'GPS: OK' : 'GPS: FIXING...'}</span>
        </div>
      </div>

      {status === 'idle' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 140, height: 140, borderRadius: 40, background: 'rgba(124, 58, 237, 0.05)', border: '1px solid rgba(124, 58, 237, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-purple)', marginBottom: 32 }}>
             <QrCode size={64} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 12 }}>{adminName ? `Привет, ${adminName}` : 'Готовы к работе?'}</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 1.5, marginBottom: 40 }}>
            {adminName ? 'Нажмите кнопку ниже, чтобы начать сканирование QR-кода на компьютере.' : 'Для открытия смены отсканируйте динамический QR-код на рабочем компьютере.'}
          </p>
          <button 
            onClick={startScan}
            style={{ width: '100%', padding: '20px', borderRadius: 24, background: 'var(--accent-purple)', color: '#fff', fontSize: 15, fontWeight: 900, border: 'none', boxShadow: '0 10px 30px rgba(139,92,246,0.3)' }}
          >
            ОТКРЫТЬ СКАНЕР
          </button>
        </div>
      )}

      {status === 'scanning' && (
        <div style={{ flex: 1, position: 'relative', borderRadius: 32, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#000' }}>
           <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 220, height: 220, border: '2px solid var(--accent-purple)', borderRadius: 40, position: 'relative' }}>
                 {/* Scanning laser line */}
                 <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 2, background: 'var(--accent-purple)', boxShadow: '0 0 15px var(--accent-purple)', animation: 'mobileScanLine 2s infinite' }} />
                 
                 {/* Corner decorations */}
                 <div style={{ position: 'absolute', top: -2, left: -2, width: 30, height: 30, borderTop: '4px solid var(--accent-purple)', borderLeft: '4px solid var(--accent-purple)', borderRadius: '12px 0 0 0' }} />
                 <div style={{ position: 'absolute', top: -2, right: -2, width: 30, height: 30, borderTop: '4px solid var(--accent-purple)', borderRight: '4px solid var(--accent-purple)', borderRadius: '0 12px 0 0' }} />
                 <div style={{ position: 'absolute', bottom: -2, left: -2, width: 30, height: 30, borderBottom: '4px solid var(--accent-purple)', borderLeft: '4px solid var(--accent-purple)', borderRadius: '0 0 0 12px' }} />
                 <div style={{ position: 'absolute', bottom: -2, right: -2, width: 30, height: 30, borderBottom: '4px solid var(--accent-purple)', borderRight: '4px solid var(--accent-purple)', borderRadius: '0 0 12px 0' }} />
              </div>
           </div>
           
           {/* Instructions overlay */}
           <div style={{ position: 'absolute', bottom: 32, left: 0, right: 0, textAlign: 'center' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Наведите камеру на QR-код
              </p>
           </div>

           {/* Close Button */}
           <button 
             onClick={() => setStatus('idle')}
             style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
           >
             <X size={20} />
           </button>

           {/* Simulation Click for demo purposes */}
           <div 
             onClick={handleScanSimulation}
             style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
           />
        </div>
      )}

      {status === 'verifying' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', border: '4px solid rgba(139,92,246,0.1)', borderTopColor: 'var(--accent-purple)', animation: 'spin 1s linear infinite', marginBottom: 32 }} />
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>ВЕРИФИКАЦИЯ...</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center' }}>
            Проверяем GPS и идентификатор устройства
          </p>
        </div>
      )}

      {/* Footer Info */}
      <div style={{ marginTop: 24, padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
         <Smartphone size={20} color="rgba(255,255,255,0.3)" />
         <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Устройство привязано</div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>iPhone 15 Pro (ID: 8821)</div>
         </div>
      </div>

      <style>{`
        @keyframes mobileScanLine {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { 
          from { transform: translateY(-100%); opacity: 0; } 
          to { transform: translateY(0); opacity: 1; } 
        }
      `}</style>
    </div>
  );
};

export default MobileScanner;
