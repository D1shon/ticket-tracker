import React, { useState, useEffect } from 'react';
import { QrCode, ShieldCheck, CheckCircle2, Navigation, X, RefreshCcw, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const MobileScanner = () => {
  const [status, setStatus] = useState('idle'); // idle, scanning, verifying, success
  const [gpsLocked, setGpsLocked] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [adminName, setAdminName] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('admin');
    if (name) setAdminName(name);

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    
    if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallPrompt(false);
    }

    setTimeout(() => setGpsLocked(true), 1500);
  }, []);

  const handleScanSimulation = () => {
    setStatus('verifying');
    setTimeout(async () => {
      try {
        if (adminName) {
          await updateDoc(doc(db, 'attendance_sync', adminName), {
            status: 'verified',
            timestamp: Date.now()
          });
        }
        setStatus('success');
      } catch (error) {
        setStatus('idle');
      }
    }, 2000);
  };

  const InstallPrompt = () => (
    <div style={{ position: 'fixed', top: 16, left: 16, right: 16, background: '#1c1c1e', borderRadius: 20, padding: 16, zIndex: 2000, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', border: '1px solid #2c2c2e', animation: 'slideDown 0.5s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
         <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Smartphone size={20} />
         </div>
         <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Установить HJTRACK</div>
            <div style={{ fontSize: 11, color: '#8e8e93' }}>{isIOS ? 'Нажмите «Поделиться» → «На экран Домой»' : 'Меню → Установить'}</div>
         </div>
         <button onClick={() => setShowInstallPrompt(false)} style={{ background: 'none', border: 'none', color: '#8e8e93' }}><X size={18} /></button>
      </div>
    </div>
  );

  if (status === 'success') {
    return (
      <div style={{ height: '100vh', background: '#000', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, animation: 'scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
           <CheckCircle2 size={40} color="#000" strokeWidth={3} />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.03em' }}>Успешно</h1>
        <p style={{ color: '#8e8e93', fontSize: 14, marginBottom: 40 }}>Смена для <b>{adminName}</b> открыта</p>
        <button onClick={() => setStatus('idle')} style={{ width: '100%', padding: '18px', borderRadius: 16, background: '#1c1c1e', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none' }}>Готово</button>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', background: '#000', color: '#fff', padding: '24px 20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {showInstallPrompt && <InstallPrompt />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 60 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>HJTRACK <span style={{ color: 'var(--accent-purple)' }}>●</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: gpsLocked ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)' }}>
           <div style={{ width: 6, height: 6, borderRadius: '50%', background: gpsLocked ? '#22c55e' : '#8e8e93' }} />
           <span style={{ fontSize: 10, fontWeight: 800, color: gpsLocked ? '#22c55e' : '#8e8e93' }}>GPS {gpsLocked ? 'ACTIVE' : 'FIXING...'}</span>
        </div>
      </div>

      {status === 'idle' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.04em' }}>Привет,<br />{adminName || 'Админ'}</h2>
            <p style={{ color: '#8e8e93', fontSize: 15, lineHeight: 1.6 }}>Нажмите кнопку ниже, чтобы<br />подтвердить свое присутствие.</p>
          </div>
          <button 
            onClick={() => setStatus('scanning')}
            style={{ width: '100%', padding: '24px', borderRadius: 24, background: 'var(--accent-purple)', color: '#fff', fontSize: 16, fontWeight: 800, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, boxShadow: '0 20px 40px rgba(139,92,246,0.25)' }}
          >
            <QrCode size={20} />
            СКАНЕР QR
          </button>
        </div>
      )}

      {status === 'scanning' && (
        <div style={{ flex: 1, position: 'relative', borderRadius: 40, overflow: 'hidden', background: '#111' }}>
           <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 240, height: 240, border: '2px solid rgba(255,255,255,0.1)', borderRadius: 48, position: 'relative' }}>
                 <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 2, background: 'var(--accent-purple)', boxShadow: '0 0 20px var(--accent-purple)', animation: 'scanLine 2s infinite linear' }} />
              </div>
           </div>
           <button onClick={() => setStatus('idle')} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} /></button>
           <div onClick={handleScanSimulation} style={{ position: 'absolute', inset: 0, cursor: 'pointer' }} />
        </div>
      )}

      {status === 'verifying' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-purple)', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ marginTop: 24, fontSize: 13, fontWeight: 700, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Проверка GPS...</p>
        </div>
      )}

      <style>{`
        @keyframes scanLine { 0% { top: 0%; } 100% { top: 100%; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default MobileScanner;
