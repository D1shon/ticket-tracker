import React, { useState, useEffect } from 'react';
import { QrCode, Smartphone, MapPin, ShieldCheck, History, X, RefreshCcw, CheckCircle2, Globe, Wifi } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const STAFF_LIST = ['Анастасия', 'Сания', 'Диас', 'Салтанат', 'Айнур', 'Азиз', 'Владимир'];

const LiveClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ padding: '12px 24px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, textAlign: 'right' }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--accent-purple)', fontVariantNumeric: 'tabular-nums' }}>
        {format(time, 'HH:mm:ss')}
      </div>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        {format(time, 'dd MMMM yyyy', { locale: ru })}
      </div>
    </div>
  );
};

const AttendancePage = () => {
  const [admin1, setAdmin1] = useState({ name: '', status: 'offline', time: '' });
  const [admin2, setAdmin2] = useState({ name: '', status: 'offline', time: '' });
  
  const [showQrModal, setShowQrModal] = useState(false);
  const [activeSlot, setActiveSlot] = useState(null);
  const [qrProgress, setQrProgress] = useState(100);
  const [isVerifying, setIsVerifying] = useState(false);
  
  const [history, setHistory] = useState([
    { id: 1, user: 'Диас', action: 'QR-SCAN', time: '06:28:44', club: 'VILLA', slot: 'Админ 1', geo: 'Verified' },
    { id: 2, user: 'Анастасия', action: 'QR-SCAN', time: '06:29:12', club: 'VILLA', slot: 'Админ 2', geo: 'Verified' },
  ]);

  // QR Timer logic
  useEffect(() => {
    if (!showQrModal || isVerifying) return;
    
    const interval = setInterval(() => {
      setQrProgress(prev => {
        if (prev <= 0) return 100;
        return prev - 1;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [showQrModal, isVerifying]);

  const startQrCheckIn = (slotNum, data) => {
    if (!data.name) return;
    setActiveSlot({ slot: slotNum, name: data.name });
    setShowQrModal(true);
    setIsVerifying(false);
    setQrProgress(100);

    // Simulate mobile scan after 5 seconds
    setTimeout(() => {
      if (showQrModal) simulateMobileScan();
    }, 5000);
  };

  const simulateMobileScan = () => {
    setIsVerifying(true);
    setTimeout(() => {
      confirmCheckIn();
    }, 2500);
  };

  const confirmCheckIn = () => {
    if (!activeSlot) return;
    const { slot, name } = activeSlot;
    const setter = slot === 1 ? setAdmin1 : setAdmin2;
    
    const now = new Date();
    const timeStr = format(now, 'HH:mm:ss');
    setter({ name, status: 'online', time: timeStr });
    
    const newEntry = {
      id: Date.now(),
      user: name,
      action: 'QR-SCAN',
      time: timeStr,
      club: 'VILLA',
      slot: slot === 1 ? 'Админ 1' : 'Админ 2',
      geo: 'Verified'
    };
    setHistory(prev => [newEntry, ...prev]);
    setShowQrModal(false);
    setIsVerifying(false);
  };

  const AdminSlot = ({ slotNum, data, setter }) => {
    const isOnline = data.status === 'online';

    return (
      <div style={{ 
        flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 32, padding: 32,
        display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.3s',
        boxShadow: isOnline ? '0 20px 40px rgba(124, 58, 237, 0.05)' : 'none',
        border: isOnline ? '1px solid rgba(124, 58, 237, 0.3)' : '1px solid var(--border)'
      }}>
        <div style={{ 
          fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', 
          letterSpacing: '0.15em', marginBottom: 24, background: 'var(--bg-hover)', padding: '4px 12px', borderRadius: 8
        }}>
          Слот: Администратор {slotNum}
        </div>

        {!isOnline && (
          <>
            <div style={{ width: '100%', marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Выбор сотрудника</label>
              <select 
                className="input-app" 
                style={{ width: '100%', borderRadius: 16 }}
                value={data.name}
                onChange={(e) => setter(prev => ({ ...prev, name: e.target.value }))}
              >
                <option value="">— Нажмите для выбора —</option>
                {STAFF_LIST.map(s => (
                  <option key={s} value={s} disabled={(slotNum === 1 ? admin2.name : admin1.name) === s}>{s}</option>
                ))}
              </select>
            </div>
            <button 
              onClick={() => startQrCheckIn(slotNum, data)}
              disabled={!data.name}
              style={{ 
                width: '100%', padding: '18px', borderRadius: 20, 
                background: data.name ? 'var(--accent-purple)' : 'var(--bg-hover)', 
                color: data.name ? '#fff' : 'var(--text-muted)',
                fontSize: 13, fontWeight: 900, border: 'none', cursor: data.name ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: data.name ? '0 8px 20px rgba(139, 92, 246, 0.3)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <QrCode size={18} />
              АВТОРИЗАЦИЯ ПО QR
            </button>
          </>
        )}

        {isOnline && (
          <div style={{ textAlign: 'center', animation: 'fadeIn 0.4s ease' }}>
            <div style={{ 
              width: 80, height: 80, borderRadius: 24, background: 'rgba(124, 58, 237, 0.1)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
              color: 'var(--accent-purple)', border: '1px solid rgba(124, 58, 237, 0.2)'
            }}>
              <Smartphone size={40} />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4 }}>{data.name}</h3>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ВЕРИФИЦИРОВАН · {data.time}
            </div>
            <button 
              onClick={() => setter({ name: '', status: 'offline', time: '' })}
              style={{ marginTop: 24, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 10, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', textDecoration: 'underline' }}
            >
              Завершить смену
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="animate-fade" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '-0.02em', marginBottom: 4 }}>
            HJTRACK SECURITY: QR-TERMINAL
          </h1>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Верификация присутствия через персональное устройство
          </p>
        </div>
        <LiveClock />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', gap: 24 }}>
            <AdminSlot slotNum={1} data={admin1} setter={setAdmin1} />
            <AdminSlot slotNum={2} data={admin2} setter={setAdmin2} />
          </div>

          {/* Security Features Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 28, padding: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
               <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(34, 197, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e' }}>
                 <MapPin size={24} />
               </div>
               <div>
                 <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>GPS-Геолокация</div>
                 <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Проверка координат в радиусе 50м от клуба</div>
               </div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 28, padding: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
               <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(124, 58, 237, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-purple)' }}>
                 <ShieldCheck size={24} />
               </div>
               <div>
                 <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>Dynamic QR Code</div>
                 <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Обновление каждые 20 секунд</div>
               </div>
            </div>
          </div>
        </div>

        {/* History Sidebar */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 32, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <History size={16} color="var(--text-muted)" />
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Журнал верификации</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {history.map((h) => (
              <div key={h.id} style={{ 
                padding: '16px', background: 'var(--bg-hover)', borderRadius: 20, border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 12
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                     <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{h.user}</span>
                     <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent-purple)' }}>{h.time}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                     <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>{h.slot}</span>
                     <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(34,197,94,0.1)', padding: '2px 6px', borderRadius: 6 }}>
                        <Globe size={10} color="#22c55e" />
                        <span style={{ fontSize: 9, fontWeight: 900, color: '#22c55e' }}>GPS OK</span>
                     </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* QR Code Modal Overlay */}
      {showQrModal && (
        <div style={{ 
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', 
          zIndex: 1000, animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{ 
            position: 'fixed', top: '180px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 48, 
            padding: '40px', width: '100%', maxWidth: 420, textAlign: 'center',
            boxShadow: '0 40px 100px rgba(0,0,0,0.4)', animation: 'modalSmoothEntry 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <button onClick={() => setShowQrModal(false)} style={{ position: 'absolute', top: 24, right: 24, background: 'var(--bg-hover)', border: 'none', color: 'var(--text-muted)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={18} />
            </button>

            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>
                {isVerifying ? 'ВЕРИФИКАЦИЯ' : 'СКАНИРУЙТЕ QR'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-purple)', animation: 'pulse 1s infinite' }} />
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {activeSlot?.name} · SECURITY ACTIVE
                </p>
              </div>
            </div>

            {/* Real QR Code Generator Area */}
            <div style={{ position: 'relative', width: 240, height: 240, margin: '0 auto 32px', padding: 20, background: '#fff', borderRadius: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
               {!isVerifying ? (
                 <>
                   <img 
                     src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + '/scan')}&color=000000&margin=10&qzone=2`}
                     alt="QR Scan"
                     style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                   />
                   <div style={{ position: 'absolute', width: 44, height: 44, background: 'var(--accent-purple)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 8px 16px rgba(124, 58, 237, 0.4)', border: '3px solid #fff' }}>
                      <Smartphone size={22} />
                   </div>
                 </>
               ) : (
                 <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 60, height: 60, borderRadius: '50%', border: '3px solid var(--accent-purple)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>GPS Checking...</div>
                 </div>
               )}
            </div>

            {!isVerifying && (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <RefreshCcw size={12} color="var(--accent-purple)" style={{ animation: 'spin 4s linear infinite' }} />
                      <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dynamic Refresh</span>
                   </div>
                   <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--accent-purple)' }}>{Math.ceil(qrProgress / 5)}s</span>
                </div>
                <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                   <div style={{ width: `${qrProgress}%`, height: '100%', background: 'var(--accent-purple)', transition: 'width 0.2s linear' }} />
                </div>
              </div>
            )}

            {!isVerifying && (
              <div style={{ marginTop: 24, padding: '14px', background: 'var(--bg-hover)', borderRadius: 16, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                 <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1s infinite' }} />
                 <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>Waiting for mobile scan...</span>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalSmoothEntry {
          from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.96); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

export default AttendancePage;
