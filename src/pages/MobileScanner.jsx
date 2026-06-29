import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, X, Smartphone } from 'lucide-react';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTickets } from '../store/TicketContext';

async function getLocalIPs() {
  return new Promise(resolve => {
    const ips = new Set();
    let pc;
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      pc.onicecandidate = e => {
        if (!e.candidate) { resolve([...ips]); return; }
        const m = /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/.exec(e.candidate.candidate);
        if (m && !m[1].startsWith('127.')) ips.add(m[1]);
      };
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => resolve([]));
    } catch { resolve([]); return; }
    setTimeout(() => { try { pc.close(); } catch {} resolve([...ips]); }, 2000);
  });
}

function onGatewaySubnet(localIPs, gatewayIp) {
  const prefix = gatewayIp.split('.').slice(0, 3).join('.');
  return localIPs.some(ip => ip.startsWith(prefix + '.'));
}

const MobileScanner = () => {
  const { user } = useTickets();
  const [status, setStatus] = useState('idle'); // idle, verifying, success, error
  const [result, setResult] = useState(null); // { allowed, clubId, ip }
  const [showInstallPrompt, setShowInstallPrompt] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [gateways, setGateways] = useState({});

  // fallback: support legacy ?admin=Name URL param for backwards compat
  const [adminName, setAdminName] = useState('');

  useEffect(() => {
    return onSnapshot(doc(db, 'checkin_config', 'ip_map'), snap => {
      if (snap.exists()) setGateways(snap.data().gateways ?? {});
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('admin');
    if (name) setAdminName(name);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallPrompt(false);
    }
  }, []);

  const displayName = user?.displayName || adminName || 'Сотрудник';

  const handleCheckin = async () => {
    setStatus('verifying');
    setResult(null);
    try {
      // WebRTC: собираем как дополнительную инфо, не блокируем
      let localSubnetOk = null;
      const gwList = Object.keys(gateways);
      if (gwList.length > 0) {
        const localIPs = await getLocalIPs();
        if (localIPs.length > 0) {
          localSubnetOk = gwList.some(gw => onGatewaySubnet(localIPs, gw));
        }
      }

      // Сервер принимает окончательное решение
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.email || adminName || 'unknown',
          userName: user?.displayName || adminName || null,
          localSubnetOk,
        }),
      });
      const data = await res.json();
      setResult(data);
      setStatus(data.allowed ? 'success' : 'error');
    } catch (err) {
      console.error('checkin fetch error:', err);
      setResult({ allowed: false, ip: null });
      setStatus('error');
    }
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
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.03em' }}>Чекин прошёл</h1>
        <p style={{ color: '#8e8e93', fontSize: 14, marginBottom: 8 }}>
          Добро пожаловать, <b style={{ color: '#fff' }}>{displayName}</b>
        </p>
        {result?.clubId && (
          <p style={{ color: '#22c55e', fontSize: 13, fontWeight: 700, marginBottom: 40, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {result.clubId}
          </p>
        )}
        <button onClick={() => setStatus('idle')} style={{ width: '100%', padding: '18px', borderRadius: 16, background: '#1c1c1e', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none' }}>
          Готово
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{ height: '100vh', background: '#000', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, animation: 'scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
          <X size={40} color="#000" strokeWidth={3} />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.03em', color: '#ef4444' }}>Нет доступа</h1>
        {result?.localNetworkError ? (
          <p style={{ color: '#8e8e93', fontSize: 13, marginBottom: 8, textAlign: 'center', lineHeight: 1.6 }}>
            Ваш IP: <code style={{ color: '#fff', background: '#1c1c1e', padding: '2px 8px', borderRadius: 6 }}>{result.ip}</code><br />
            Нужна подсеть: <code style={{ color: '#f59e0b', background: '#1c1c1e', padding: '2px 8px', borderRadius: 6 }}>{result.expectedSubnet}</code>
          </p>
        ) : result?.ip ? (
          <p style={{ color: '#8e8e93', fontSize: 13, marginBottom: 8, textAlign: 'center', lineHeight: 1.6 }}>
            Ваш IP: <code style={{ color: '#fff', background: '#1c1c1e', padding: '2px 8px', borderRadius: 6 }}>{result.ip}</code>
          </p>
        ) : null}
        <p style={{ color: '#8e8e93', fontSize: 13, marginBottom: 40, textAlign: 'center', lineHeight: 1.6 }}>
          Подключитесь к WiFi клуба и попробуйте снова.
        </p>
        <button onClick={() => setStatus('idle')} style={{ width: '100%', padding: '18px', borderRadius: 16, background: '#1c1c1e', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none' }}>
          Попробовать снова
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', background: '#000', color: '#fff', padding: '24px 20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {showInstallPrompt && <InstallPrompt />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 60 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          HJTRACK <span style={{ color: 'var(--accent-purple)' }}>●</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.1)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: '#22c55e' }}>IP CHECK ACTIVE</span>
        </div>
      </div>

      {status === 'idle' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.04em' }}>
              Привет,<br />{displayName}
            </h2>
            <p style={{ color: '#8e8e93', fontSize: 15, lineHeight: 1.6 }}>
              Нажмите кнопку, чтобы<br />подтвердить своё присутствие.
            </p>
          </div>
          <button
            onClick={handleCheckin}
            style={{ width: '100%', padding: '24px', borderRadius: 24, background: 'var(--accent-purple)', color: '#fff', fontSize: 16, fontWeight: 800, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, boxShadow: '0 20px 40px rgba(139,92,246,0.25)', cursor: 'pointer' }}
          >
            <ShieldCheck size={22} />
            ОТМЕТИТЬСЯ
          </button>
        </div>
      )}

      {status === 'verifying' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-purple)', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ marginTop: 24, fontSize: 13, fontWeight: 700, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Проверка IP-адреса...
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default MobileScanner;
