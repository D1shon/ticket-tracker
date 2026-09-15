import React, { useState, useEffect, useMemo } from 'react';
import { NAV_ITEMS, navAllowed, baseNavAllowed } from '../lib/navAccess';
import { User, Mail, Globe, Bell, Shield, LogOut, CheckCircle2, Sliders, Edit3, Link2, Check, X, MapPin, Plus, Trash2, Pencil, UserPlus, Users, FileText } from 'lucide-react';
import { useTickets, USER_ROLES } from '../store/TicketContext';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'sonner';
import { enablePush, disablePush, isPushEnabled, getPushToken } from '../lib/push';
import { isMobileDevice } from '../lib/isMobile';

const DEFAULT_POLICY_URLS = {
  '4YOU': 'https://herosjourney.kz/policy/4you',
  'COLIBRI': 'https://herosjourney.kz/policy/colibri',
  'VILLA': 'https://herosjourney.kz/policy/villa',
  'NURLY ORDA': 'https://herosjourney.kz/policy/nurlyorda',
  'PROMENADE': 'https://herosjourney.kz/policy/promenade',
  'EUROPE CITY': 'https://herosjourney.kz/policy/europecity',
};

const SettingsPage = () => {
  const { user, logout, updateDisplayName } = useTickets();
  const navigate = useNavigate();
  const isChef = user?.role === 'chef';
  const userClubUpper = user?.club?.toUpperCase();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Мобильный режим — только визуальные изменения
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const [pushEnabled, setPushEnabled] = useState(() => isPushEnabled());
  const [pushBusy, setPushBusy] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [emailReports, setEmailReports] = useState(false);

  const handlePushToggle = async (next) => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (next) {
        await enablePush(user);
        setPushEnabled(true);
        toast.success('Push-уведомления включены на этом устройстве');
      } else {
        await disablePush();
        setPushEnabled(false);
        toast.success('Push-уведомления отключены');
      }
    } catch (e) {
      toast.error(e?.message || 'Не удалось включить push');
      setPushEnabled(isPushEnabled());
    } finally {
      setPushBusy(false);
    }
  };

  const [clubsConfig, setClubsConfig] = useState({});
  const [editingClub, setEditingClub] = useState(null); // clubName being edited
  const [editUrlText, setEditUrlText] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);

  // IP map state (chef only)
  const [ipMap, setIpMap]           = useState({}); // { publicIp: clubId }
  const [gatewayMap, setGatewayMap] = useState({}); // { localGatewayIp: clubId }
  const [newIp, setNewIp]           = useState('');
  const [newIpClub, setNewIpClub]   = useState('4YOU');
  const [savingIp, setSavingIp]     = useState(false);
  const [newGw, setNewGw]           = useState('');
  const [newGwClub, setNewGwClub]   = useState('4YOU');
  const [savingGw, setSavingGw]     = useState(false);

  // Admin accounts management (chef + manager)
  const isManagerRole = user?.role === 'manager';
  const canManageAdmins = isChef || isManagerRole;
  const [appUsers, setAppUsers]           = useState({}); // { email: {displayName, club, ...} }
  const [newAdminName, setNewAdminName]   = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminClub, setNewAdminClub]   = useState(user?.club || '4YOU');
  const [savingAdmin, setSavingAdmin]     = useState(false);

  // Load dynamic admin accounts
  useEffect(() => {
    if (!canManageAdmins) return;
    return onSnapshot(collection(db, 'app_users'), (snap) => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setAppUsers(map);
    }, err => console.error('[app_users]', err));
  }, [canManageAdmins]);

  // Live push subscription status per email (who actually receives notifications)
  const [pushByEmail, setPushByEmail] = useState({});
  useEffect(() => {
    if (!canManageAdmins) return;
    return onSnapshot(collection(db, 'push_tokens'), (snap) => {
      const map = {};
      snap.docs.forEach(d => {
        const t = d.data();
        const email = (t.email || '').toLowerCase();
        if (!email) return;
        // Working subscription: installed app (standalone) or Android.
        // Legacy iOS Safari-tab tokens don't deliver — treated as not working.
        const isAndroid = /Android/i.test(t.ua || '');
        const isIOSSafariTab = /iPhone|iPad/.test(t.ua || '') && t.standalone !== true && /Safari\//.test(t.ua || '');
        const working = t.standalone === true || isAndroid || !isIOSSafariTab;
        if (working) map[email] = true;
        else if (!(email in map)) map[email] = false;
      });
      setPushByEmail(map);
    }, err => console.error('[push_tokens]', err));
  }, [canManageAdmins]);

  const PushBadge = ({ email }) => {
    const key = (email || '').toLowerCase();
    const st = pushByEmail[key]; // true = работает, false = подписка битая, undefined = нет
    const ok = st === true;
    return (
      <span style={{
        fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
        background: ok ? 'rgba(95,156,129,0.12)' : 'rgba(148,163,184,0.12)',
        color: ok ? '#5F9C81' : 'var(--text-muted)',
        border: `1px solid ${ok ? 'rgba(95,156,129,0.3)' : 'var(--border)'}`,
      }}>
        {ok ? '🔔 Push вкл' : '🔕 Push выкл'}
      </span>
    );
  };

  const handleAddAdmin = async () => {
    const email = newAdminEmail.trim().toLowerCase();
    const name  = newAdminName.trim();
    const club  = isManagerRole ? user?.club : newAdminClub;
    if (!email || !name || !club) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Некорректный email');
      return;
    }
    if (email in USER_ROLES || email in appUsers) {
      toast.error('Этот email уже зарегистрирован в системе');
      return;
    }
    setSavingAdmin(true);
    try {
      await setDoc(doc(db, 'app_users', email), {
        role: 'admin', // manager-created accounts are always admins
        club,
        displayName: name,
        addedBy: user?.email || '',
        createdAtISO: new Date().toISOString(),
      });
      setNewAdminName('');
      setNewAdminEmail('');
      toast.success(`Аккаунт для ${name} создан — вход по почте ${email}`);
    } catch (e) {
      toast.error('Ошибка: ' + (e?.message || e));
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleRemoveAdmin = async (a) => {
    try {
      if (a.dynamic) {
        // Manager-created account — just delete the doc
        await deleteDoc(doc(db, 'app_users', a.email));
      } else {
        // Hardcoded account — mark as revoked in Firestore
        await setDoc(doc(db, 'app_users', a.email), {
          revoked: true,
          revokedBy: user?.email || '',
          revokedAtISO: new Date().toISOString(),
        });
      }
      toast.success(`Доступ для ${a.name} удалён`);
    } catch (e) {
      toast.error('Не удалось удалить доступ');
    }
  };

  // Load clubs config from Firestore
  useEffect(() => {
    return onSnapshot(collection(db, 'wifi_clubs'), (snap) => {
      const config = {};
      snap.docs.forEach(doc => {
        config[doc.id] = doc.data();
      });
      setClubsConfig(config);
    });
  }, []);

  // Load IP map + gateway map from Firestore (chef only)
  useEffect(() => {
    if (!isChef) return;
    return onSnapshot(doc(db, 'checkin_config', 'ip_map'), (snap) => {
      if (snap.exists()) {
        setIpMap(snap.data().ips ?? {});
        setGatewayMap(snap.data().gateways ?? {});
      }
    });
  }, [isChef]);

  const saveIpMap = async (updatedMap) => {
    await updateDoc(doc(db, 'checkin_config', 'ip_map'), { ips: updatedMap, updatedAt: new Date().toISOString() });
  };

  const saveGatewayMap = async (updatedMap) => {
    await updateDoc(doc(db, 'checkin_config', 'ip_map'), { gateways: updatedMap, updatedAt: new Date().toISOString() });
  };

  const handleAddGateway = async () => {
    const trimmed = newGw.trim();
    if (!trimmed || !newGwClub) return;
    setSavingGw(true);
    try {
      await saveGatewayMap({ ...gatewayMap, [trimmed]: newGwClub });
      setNewGw('');
    } finally { setSavingGw(false); }
  };

  const handleRemoveGateway = async (gw) => {
    const updated = { ...gatewayMap };
    delete updated[gw];
    await saveGatewayMap(updated);
  };

  const handleAddIp = async () => {
    const trimmed = newIp.trim();
    if (!trimmed || !newIpClub) return;
    setSavingIp(true);
    try {
      const updated = { ...ipMap, [trimmed]: newIpClub };
      await saveIpMap(updated);
      setNewIp('');
    } catch (err) {
      console.error('Error saving IP:', err);
    } finally {
      setSavingIp(false);
    }
  };

  const handleRemoveIp = async (ip) => {
    const updated = { ...ipMap };
    delete updated[ip];
    try {
      await saveIpMap(updated);
    } catch (err) {
      console.error('Error removing IP:', err);
    }
  };

  // User details from context
  const userName = user?.displayName || "Пользователь";
  const userEmail = user?.email || "—";
  const userRole = user?.role === 'komdir' ? 'КОМ-ДИР' : user?.mop ? 'МОП' : user?.role === 'rop' ? 'РОП' : (user?.role?.toUpperCase() || "ADMIN");
  const userClub = user?.club || "Все Клубы";

  const CLUBS = [
    { name: '4YOU', color: '#5580A8' },
    { name: 'COLIBRI', color: '#9b5de5' },
    { name: 'VILLA', color: '#C08F4F' },
    { name: 'NURLY ORDA', color: '#5F9C81' },
    { name: 'PROMENADE', color: '#5F9C96' },
    { name: 'EUROPE CITY', color: '#B0688D' },
  ];

  // мобайл: переключатели крупнее (удобно пальцем)
  const Toggle = ({ enabled, setEnabled }) => (
    <button
      onClick={() => setEnabled(!enabled)}
      style={{
        width: isMobile ? 56 : 44, height: isMobile ? 32 : 24, borderRadius: isMobile ? 16 : 12, background: enabled ? 'var(--accent-purple)' : 'var(--bg-hover)',
        position: 'relative', border: enabled ? 'none' : '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', flexShrink: 0
      }}
    >
      <div style={{
        position: 'absolute', top: isMobile ? 3 : 3, left: enabled ? (isMobile ? 27 : 23) : 3,
        width: isMobile ? 26 : 18, height: isMobile ? 26 : 18, borderRadius: '50%', background: '#fff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }} />
    </button>
  );

  return (
    <div className="animate-fade" style={{ maxWidth: 1000, margin: '0 auto', padding: '10px 0 40px 0' }}>
      {/* Header — мобайл: компактнее */}
      <div style={{ marginBottom: isMobile ? 20 : 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Sliders size={isMobile ? 20 : 24} color="var(--accent-purple)" />
          <h1 style={{ fontSize: isMobile ? 19 : 28, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
            Настройки
          </h1>
        </div>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Управление профилем и конфигурация сети
        </p>
      </div>

      {/* Создание аккаунтов МОП — шеф и менеджеры (у РОПов — в левом меню) */}
      {(isChef || user?.role === 'manager') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '18px 20px', marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(14,165,233,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <UserPlus size={22} style={{ color: '#0ea5e9' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>Сотрудники (МОП)</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Создать аккаунты МОП по клубам</div>
          </div>
          <button onClick={() => navigate('/staff')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, border: 'none', background: '#0ea5e9', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>
            <UserPlus size={15} /> Создать
          </button>
        </div>
      )}

      {/* Сотрудники и доступы — полное управление аккаунтами (ТОЛЬКО Дильшат) */}
      {(user?.email || '').toLowerCase() === 'dilshat.r@hj.fit' && (
        <StaffAccessPanel appUsers={appUsers} isMobile={isMobile} myEmail={(user?.email || '').toLowerCase()} />
      )}

      {/* мобайл: всё в одну колонку, секции — компактные карточки */}
      <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr', gap: isMobile ? 12 : 24, marginBottom: isMobile ? 20 : 40 }}>
        {/* Profile Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 16 : 28, padding: isMobile ? 16 : 32, display: 'flex', flexDirection: 'column', gap: isMobile ? 18 : 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--accent-purple-bg)', border: '1px solid var(--accent-purple-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={32} color="var(--accent-purple)" />
            </div>
            <div style={{ flex: 1 }}>
              {editingName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { updateDisplayName(nameInput); setEditingName(false); }
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    style={{ fontSize: 16, fontWeight: 800, background: 'var(--bg-hover)', border: '1px solid var(--accent-purple)', borderRadius: 10, padding: '6px 12px', color: 'var(--text-primary)', outline: 'none', width: 140 }}
                  />
                  <button onClick={() => { updateDisplayName(nameInput); setEditingName(false); }} style={{ background: 'var(--accent-purple)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }}>
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditingName(false)} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{userName}</h2>
                  {user?.role === 'admin' && (
                    <button onClick={() => { setNameInput(userName); setEditingName(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center' }}>
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              )}
              <span style={{ fontSize: 10, fontWeight: 800, background: 'var(--accent-purple)', color: '#fff', padding: '4px 10px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {userRole}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'var(--bg-hover)', borderRadius: 16, border: '1px solid var(--border)' }}>
              <Mail size={14} color="var(--text-muted)" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: 60 }}>Email</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginLeft: 'auto' }}>{userEmail}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'var(--bg-hover)', borderRadius: 16, border: '1px solid var(--border)' }}>
              <Globe size={14} color="var(--text-muted)" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: 120 }}>Привязанный клуб</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginLeft: 'auto' }}>{userClub}</span>
            </div>
            {user?.role === 'manager' && (
              <a href="/policy" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'var(--bg-hover)', borderRadius: 16, border: '1px solid var(--border)', textDecoration: 'none' }}>
                <FileText size={14} color="var(--accent-purple)" />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Соглашение и оферта</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-purple)', marginLeft: 'auto' }}>Открыть →</span>
              </a>
            )}
          </div>

          <button 
            onClick={logout}
            style={{
              marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '16px', borderRadius: 18, background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.05em'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--accent-purple)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <LogOut size={16} />
            Выйти из системы
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 24 }}>
          {/* Notifications Card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 16 : 28, padding: isMobile ? 16 : 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isMobile ? 18 : 28 }}>
              <Bell size={16} color="var(--accent-purple)" />
              <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Уведомления</h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', itemsCenter: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Push-уведомления</h4>
                  <p style={{ fontSize: 11, color: pushEnabled ? '#5F9C81' : 'var(--text-muted)', fontWeight: 600 }}>
                    {pushBusy ? '⏳ Подключение…' : pushEnabled ? '✓ Включены на этом устройстве' : '× Отключены'}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {pushEnabled && (
                    <button
                      onClick={async () => {
                        const token = getPushToken();
                        if (!token) { toast.error('Токен не найден — выключите и включите тумблер'); return; }
                        toast.info('Тест придёт через ~7 секунд — сверните приложение или заблокируйте телефон');
                        setTimeout(async () => {
                          try {
                            const r = await fetch('/api/send-push', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ title: '🔔 Тест уведомлений', body: 'Всё работает! Это тестовое уведомление HJ Track.', url: '/settings', tokens: [token] }),
                            });
                            const j = await r.json();
                            if (j.sent !== 1) toast.error('Отправка не удалась — выключите и включите тумблер');
                          } catch {}
                        }, 6000);
                      }}
                      style={{ padding: '7px 14px', borderRadius: 10, border: '1px solid var(--accent-purple)', background: 'transparent', color: 'var(--accent-purple)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                    >
                      Тест
                    </button>
                  )}
                  <Toggle enabled={pushEnabled} setEnabled={handlePushToggle} />
                </div>
              </div>
              <div style={{ display: 'flex', itemsCenter: 'center', justifyContent: 'space-between' }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Звуковые алерты (SLA)</h4>
                <Toggle enabled={soundEnabled} setEnabled={setSoundEnabled} />
              </div>
              <div style={{ display: 'flex', itemsCenter: 'center', justifyContent: 'space-between' }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>E-mail отчеты</h4>
                <Toggle enabled={emailReports} setEnabled={setEmailReports} />
              </div>
            </div>
          </div>

          {/* Security Card */}
          <div style={{ background: 'linear-gradient(135deg, rgba(125,111,179,0.1), rgba(0,0,0,0))', border: '1px solid var(--border)', borderRadius: isMobile ? 16 : 28, padding: isMobile ? 16 : 32, position: 'relative', overflow: 'hidden' }}>
            <Shield size={80} style={{ position: 'absolute', right: -10, bottom: -10, opacity: 0.05, color: 'var(--accent-purple)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-purple)' }} />
              <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Статус безопасности</h3>
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6, maxWidth: '85%' }}>
              Ваш аккаунт имеет права «Главного менеджера». Вам доступен мониторинг всех линий.
            </p>
          </div>
        </div>
      </div>

      {/* Network Management — chef/manager only */}
      {user?.role !== 'admin' && <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 16 : 32, padding: isMobile ? 16 : 40 }}>
        <h2 style={{ fontSize: isMobile ? 16 : 24, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', marginBottom: 8, textTransform: 'uppercase' }}>
          Управление сетью
        </h2>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: isMobile ? 18 : 32 }}>
          Конфигурация объектов мониторинга
        </p>

        {/* мобайл: клубные карточки в одну колонку */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: isMobile ? 10 : 20 }}>
          {CLUBS.map(club => {
            const currentUrl = clubsConfig[club.name]?.userAgreementUrl || DEFAULT_POLICY_URLS[club.name] || '';
            const isEditing = editingClub === club.name;
            const canEdit = isChef || (user?.role === 'manager' && userClubUpper === club.name);

            return (
              <div key={club.name} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: isMobile ? 14 : 20, padding: isMobile ? 14 : 24, transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ fontSize: 15, fontWeight: 900, fontStyle: 'italic', color: club.color }}>{club.name}</h4>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                    <CheckCircle2 size={12} color="var(--text-muted)" />
                  </div>
                </div>

                {/* Policy URL Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Договор-оферта (URL)
                  </span>

                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="text"
                        value={editUrlText}
                        onChange={e => setEditUrlText(e.target.value)}
                        style={{
                          flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)',
                          borderRadius: 8, padding: '6px 8px', fontSize: 11, color: 'var(--text-primary)',
                          outline: 'none'
                        }}
                      />
                      <button
                        onClick={async () => {
                          if (!editUrlText.trim()) return;
                          setSavingUrl(true);
                          try {
                            await setDoc(doc(db, 'wifi_clubs', club.name), {
                              clubId: club.name,
                              userAgreementUrl: editUrlText.trim(),
                              updatedAt: new Date().toISOString()
                            }, { merge: true });
                            setEditingClub(null);
                          } catch (err) {
                            console.error('Error saving agreement URL:', err);
                          } finally {
                            setSavingUrl(false);
                          }
                        }}
                        disabled={savingUrl}
                        style={{ background: 'none', border: 'none', color: '#5F9C81', cursor: 'pointer', padding: 4 }}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingClub(null)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: 4 }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <a
                        href={currentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%', fontWeight: 600 }}
                      >
                        {currentUrl.replace('https://', '')}
                      </a>
                      {canEdit && (
                        <button
                          onClick={() => {
                            setEditingClub(club.name);
                            setEditUrlText(currentUrl);
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                          title="Редактировать ссылку"
                        >
                          <Edit3 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status: OK</span>
                </div>
                <div style={{ width: '100%', height: 4, background: 'var(--bg-card)', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ width: '100%', height: '100%', background: club.color, opacity: 0.8 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>}

      {/* ── IP Checkin Map (chef only) ── */}
      {isChef && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 16 : 32, padding: isMobile ? 16 : 40, marginTop: isMobile ? 12 : 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <MapPin size={isMobile ? 18 : 22} color="var(--accent-purple)" />
            <h2 style={{ fontSize: isMobile ? 16 : 24, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
              IP-адреса чекина
            </h2>
          </div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: isMobile ? 18 : 32 }}>
            Внешние IP-адреса клубов для проверки присутствия
          </p>

          {/* Existing entries */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {Object.entries(ipMap).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Нет добавленных IP-адресов</p>
            ) : (
              Object.entries(ipMap).map(([ip, clubId]) => {
                const club = CLUBS.find(c => c.name === clubId);
                return (
                  <div key={ip} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'var(--bg-hover)', borderRadius: 16, border: '1px solid var(--border)' }}>
                    <code style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{ip}</code>
                    <span style={{ fontSize: 11, fontWeight: 800, color: club?.color ?? 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 90, textAlign: 'right' }}>
                      {clubId}
                    </span>
                    <button
                      onClick={() => handleRemoveIp(ip)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: isMobile ? 10 : 4, display: 'flex', alignItems: 'center' }}
                      title="Удалить"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Add new IP */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newIp}
              onChange={e => setNewIp(e.target.value)}
              placeholder="91.147.86.40"
              style={{ flex: 1, minWidth: 160, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontFamily: 'monospace' }}
              onKeyDown={e => { if (e.key === 'Enter') handleAddIp(); }}
            />
            <select
              value={newIpClub}
              onChange={e => setNewIpClub(e.target.value)}
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
            >
              {CLUBS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <button
              onClick={handleAddIp}
              disabled={savingIp || !newIp.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 12, background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: savingIp ? 'wait' : 'pointer', opacity: !newIp.trim() ? 0.5 : 1 }}
            >
              <Plus size={16} />
              Добавить
            </button>
          </div>
        </div>
      )}

      {/* ── Gateway IP Map (chef only) ── */}
      {isChef && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 16 : 32, padding: isMobile ? 16 : 40, marginTop: isMobile ? 12 : 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <MapPin size={isMobile ? 18 : 22} color="#5F9C81" />
            <h2 style={{ fontSize: isMobile ? 16 : 24, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
              IP роутера (локальный)
            </h2>
          </div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
            Шлюз клубного WiFi — проверка подсети устройства
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 28, lineHeight: 1.6 }}>
            При чекине приложение определяет локальный IP устройства (WebRTC) и проверяет, что оно находится в подсети роутера.
            Например, если роутер <code style={{ background: 'var(--bg-hover)', padding: '1px 6px', borderRadius: 4 }}>192.168.26.1</code>, то устройство должно быть в диапазоне <code style={{ background: 'var(--bg-hover)', padding: '1px 6px', borderRadius: 4 }}>192.168.26.*</code>.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {Object.entries(gatewayMap).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Нет добавленных шлюзов</p>
            ) : (
              Object.entries(gatewayMap).map(([gw, clubId]) => {
                const club = CLUBS.find(c => c.name === clubId);
                return (
                  <div key={gw} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'var(--bg-hover)', borderRadius: 16, border: '1px solid var(--border)' }}>
                    <code style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{gw}</code>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, fontFamily: 'monospace' }}>
                      подсеть: {gw.split('.').slice(0, 3).join('.')}.*
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: club?.color ?? 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 90, textAlign: 'right' }}>
                      {clubId}
                    </span>
                    <button onClick={() => handleRemoveGateway(gw)} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: isMobile ? 10 : 4, display: 'flex' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newGw}
              onChange={e => setNewGw(e.target.value)}
              placeholder="192.168.26.1"
              style={{ flex: 1, minWidth: 160, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontFamily: 'monospace' }}
              onKeyDown={e => { if (e.key === 'Enter') handleAddGateway(); }}
            />
            <select
              value={newGwClub}
              onChange={e => setNewGwClub(e.target.value)}
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
            >
              {CLUBS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <button
              onClick={handleAddGateway}
              disabled={savingGw || !newGw.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 12, background: '#5F9C81', color: '#000', fontSize: 13, fontWeight: 700, border: 'none', cursor: savingGw ? 'wait' : 'pointer', opacity: !newGw.trim() ? 0.5 : 1 }}
            >
              <Plus size={16} />
              Добавить
            </button>
          </div>
        </div>
      )}

      {/* ── Команда ── */}
      {userRole !== 'ADMIN' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 16 : 32, padding: isMobile ? 16 : 40, marginTop: isMobile ? 12 : 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Shield size={isMobile ? 18 : 22} color="var(--accent-purple)" />
            <h2 style={{ fontSize: isMobile ? 16 : 24, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
              Команда
            </h2>
          </div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: isMobile ? 18 : 32 }}>
            Зарегистрированные пользователи и их права доступа
          </p>

          {/* Chefs — видны только шефам */}
          {isChef && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#C08F4F' }} />
              <span style={{ fontSize: 10, fontWeight: 900, color: '#C08F4F', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Шеф · Полный доступ
              </span>
            </div>
            <div style={{ background: 'rgba(192,143,79,0.05)', border: '1px solid rgba(192,143,79,0.15)', borderRadius: 16, padding: '12px 16px', marginBottom: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1.6 }}>
              Видит все клубы · Все заявки · График и финансы всех · Управление командой · Архив
            </div>
            {Object.entries(USER_ROLES)
              .filter(([, u]) => u.role === 'chef')
              .map(([email, u]) => ({ name: u.displayName, email }))
              .map(u => (
              <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14, background: 'var(--bg-hover)', border: '1px solid var(--border)', marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(192,143,79,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: '#C08F4F', flexShrink: 0 }}>{u.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{u.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{u.email}</div>
                </div>
                <PushBadge email={u.email} />
                <span style={{ fontSize: 9, fontWeight: 900, background: '#C08F4F', color: '#000', padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>ШЕФ</span>
              </div>
            ))}
          </div>
          )}

          {/* Clubs with managers — шеф видит все клубы, остальные только свой */}
          {CLUBS.filter(c => isChef || c.name.toUpperCase() === userClubUpper).map(c => ({
            club: c.name, color: c.color,
            desc: 'Видит заявки своего клуба · График · Чекин · Чек-листы',
            members: Object.entries(USER_ROLES)
              .filter(([, u]) => u.role === 'manager' && (u.club || '').toUpperCase() === c.name.toUpperCase())
              .map(([email, u]) => ({ name: u.displayName, email })),
          })).map(section => (
            <div key={section.club} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: section.color }} />
                <span style={{ fontSize: 10, fontWeight: 900, color: section.color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {section.club} · Менеджер
                </span>
              </div>
              <div style={{ background: `${section.color}08`, border: `1px solid ${section.color}20`, borderRadius: 16, padding: '12px 16px', marginBottom: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1.6 }}>
                {section.desc}
              </div>
              {section.members.map(u => {
                const clubUrl = clubsConfig[section.club]?.userAgreementUrl || DEFAULT_POLICY_URLS[section.club] || '';
                return (
                  <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14, background: 'var(--bg-hover)', border: '1px solid var(--border)', marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: `${section.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: section.color, flexShrink: 0 }}>{u.name[0]}</div>
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {u.name}
                        <span style={{ fontSize: 9, fontWeight: 900, background: `${section.color}20`, color: section.color, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>МЕН.</span>
                        <PushBadge email={u.email} />
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{u.email}</div>
                    </div>
                    
                    {/* Agreement Link Badge */}
                    <a
                      href={clubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 10,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        textDecoration: 'none',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
                    >
                      <Link2 size={12} color="var(--accent-purple)" />
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Договор-оферта</span>
                    </a>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Other roles: marketing, viewer, komdir, rop — только для шефа (кросс-клубные) */}
          {isChef && (() => {
            const ROLE_META = {
              komdir:    { label: 'Ком-Дир', badge: 'КД', color: '#0ea5e9', desc: 'Коммерческий директор · Новости, отзывы, лиды, склад, утерянные вещи, соглашения' },
              rop:       { label: 'РОП', badge: 'РОП', color: '#7D6FB3', desc: 'Руководитель отдела продаж · Права как у Ком-Дира' },
              marketing: { label: 'Маркетинг', badge: 'МАРК.', color: '#B0688D', desc: 'Доступ к складу и мерчу всех клубов' },
              viewer:    { label: 'Наблюдатель', badge: 'VIEW', color: '#64748b', desc: 'Просмотр чек-листов, склада, продаж и посещений без редактирования' },
            };
            // Реальные РОП/Ком-Дир/маркетинг/наблюдатели (БЕЗ флага mop)
            const others = Object.entries(USER_ROLES)
              .filter(([, u]) => (u.role === 'komdir' || u.role === 'rop' || u.role === 'marketing' || u.role === 'viewer') && !u.mop);
            // Команда МОП (rop + mop) — относятся к клубу РОПа, который их создал
            const mops = Object.entries(USER_ROLES)
              .filter(([, u]) => u.role === 'rop' && u.mop)
              .sort((a, b) => (a[1].club || '').localeCompare(b[1].club || ''));
            if (others.length === 0 && mops.length === 0) return null;
            return (
              <>
                {others.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#64748b' }} />
                      <span style={{ fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Другие роли
                      </span>
                    </div>
                    {others.map(([email, u]) => {
                      const meta = ROLE_META[u.role];
                      return (
                        <div key={email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14, background: 'var(--bg-hover)', border: '1px solid var(--border)', marginBottom: 8 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${meta.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: meta.color, flexShrink: 0 }}>{(u.displayName || '?')[0]}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {u.displayName}
                              <span style={{ fontSize: 9, fontWeight: 900, background: `${meta.color}20`, color: meta.color, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>{meta.badge}</span>
                              <PushBadge email={email} />
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{email} · {meta.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {mops.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#5F9C96' }} />
                      <span style={{ fontSize: 10, fontWeight: 900, color: '#5F9C96', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Команда МОП ({mops.length})
                      </span>
                    </div>
                    {mops.map(([email, u]) => {
                      const color = '#5F9C96';
                      const club = u.club || '—';
                      const creator = appUsers?.[email]?.createdBy;
                      return (
                        <div key={email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14, background: 'var(--bg-hover)', border: '1px solid var(--border)', marginBottom: 8 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color, flexShrink: 0 }}>{(u.displayName || '?')[0]}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {u.displayName}
                              <span style={{ fontSize: 9, fontWeight: 900, background: `${color}20`, color, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>МОП</span>
                              <span style={{ fontSize: 9, fontWeight: 900, background: 'var(--bg-card)', color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase', border: '1px solid var(--border)' }}>{club}</span>
                              <PushBadge email={email} />
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{email} · Команда МОП · {club}{creator ? ` · создал(а): ${creator}` : ''}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── Admin Accounts — chef/manager can create admin access ── */}
      {canManageAdmins && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 16 : 32, padding: isMobile ? 16 : 40, marginTop: isMobile ? 12 : 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Users size={isMobile ? 18 : 22} color="var(--accent-purple)" />
            <h2 style={{ fontSize: isMobile ? 16 : 24, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase', margin: 0 }}>
              Админы
            </h2>
          </div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: isMobile ? 18 : 32 }}>
            Аккаунты с доступом к платформе · роль ADMIN
          </p>

          {(isChef ? CLUBS.map(c => c.name) : [user?.club]).filter(Boolean).map(clubName => {
            const clubColor = (CLUBS.find(c => c.name === clubName) || {}).color || 'var(--accent-purple)';
            const staticAdmins = Object.entries(USER_ROLES)
              .filter(([email, u]) => u.role === 'admin' && u.club === clubName && !(email in appUsers));
            // МОПы (role:'rop', mop:true) управляются на странице /staff — здесь только админы,
            // иначе МОП отображается с бейджем ADMIN и его можно случайно удалить как админа
            const dynamicAdmins = Object.entries(appUsers)
              .filter(([, u]) => !u.revoked && (u.role || 'admin') === 'admin' && (u.club || '').toUpperCase() === clubName.toUpperCase());
            const allAdmins = [
              ...staticAdmins.map(([email, u]) => ({ email, name: u.displayName, dynamic: false })),
              ...dynamicAdmins.map(([email, u]) => ({ email, name: u.displayName, dynamic: true, addedBy: u.addedBy })),
            ];
            return (
              <div key={clubName} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: clubColor }} />
                  <span style={{ fontSize: 10, fontWeight: 900, color: clubColor, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {clubName} · Админы ({allAdmins.length})
                  </span>
                </div>
                {allAdmins.length === 0 ? (
                  <div style={{ padding: '14px 16px', border: '1px dashed var(--border)', borderRadius: 14, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                    Пока нет админов
                  </div>
                ) : allAdmins.map(a => (
                  <div key={a.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14, background: 'var(--bg-hover)', border: '1px solid var(--border)', marginBottom: 8 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: `${clubColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: clubColor, flexShrink: 0 }}>
                      {(a.name || '?')[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {a.name}
                        <span style={{ fontSize: 9, fontWeight: 900, background: `${clubColor}20`, color: clubColor, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>ADMIN</span>
                        {a.dynamic && (
                          <span style={{ fontSize: 9, fontWeight: 800, background: 'rgba(95,156,129,0.15)', color: '#5F9C81', padding: '3px 8px', borderRadius: 6 }}>
                            добавлен вручную
                          </span>
                        )}
                        <PushBadge email={a.email} />
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.email}</div>
                    </div>
                    <button onClick={() => handleRemoveAdmin(a)} title="Удалить доступ" style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                      padding: 6, borderRadius: 8, lineHeight: 0, opacity: 0.4, flexShrink: 0, transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
                    ><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Add new admin */}
          <div style={{ background: 'rgba(125,111,179,0.05)', border: '1px solid rgba(125,111,179,0.2)', borderRadius: isMobile ? 14 : 20, padding: isMobile ? 14 : '20px 24px', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <UserPlus size={15} color="var(--accent-purple)" />
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Добавить сотрудника
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 160, flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Имя</label>
                <input
                  placeholder="Имя сотрудника..."
                  value={newAdminName}
                  onChange={e => setNewAdminName(e.target.value)}
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', outline: 'none', width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 200, flex: 1.4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Почта (для входа)</label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={newAdminEmail}
                  onChange={e => setNewAdminEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddAdmin()}
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', outline: 'none', width: '100%' }}
                />
              </div>
              {isChef && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Клуб</label>
                  <select
                    value={newAdminClub}
                    onChange={e => setNewAdminClub(e.target.value)}
                    style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                  >
                    {CLUBS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <button
                onClick={handleAddAdmin}
                disabled={savingAdmin || !newAdminName.trim() || !newAdminEmail.trim()}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: isMobile ? '13px 20px' : '11px 20px', borderRadius: 12,
                  minHeight: isMobile ? 44 : undefined, width: isMobile ? '100%' : undefined,
                  border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 800,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  opacity: savingAdmin || !newAdminName.trim() || !newAdminEmail.trim() ? 0.5 : 1,
                }}
              >
                <Plus size={15} /> Добавить
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 14, lineHeight: 1.6 }}>
              Новый сотрудник получит роль <b style={{ color: 'var(--accent-purple)' }}>ADMIN</b>{isManagerRole ? <> клуба <b style={{ color: 'var(--accent-purple)' }}>{user?.club}</b></> : null}.
              Вход — просто по почте, без пароля. Чекин будет работать сразу после первого входа.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Сотрудники и доступы: добавление аккаунтов любой роли + поштучный доступ
// к вкладкам (tabsExtra/tabsHidden в app_users). Видит только Дильшат. ───────
const ACCESS_ROLES = [
  { id: 'manager',    label: 'Менеджер',    needsClub: true },
  { id: 'admin',      label: 'Администратор', needsClub: true },
  { id: 'rop',        label: 'РОП',         needsClub: true },
  { id: 'mop',        label: 'МОП',         needsClub: true },
  { id: 'komdir',     label: 'Ком-Дир',     needsClub: false },
  { id: 'marketing',  label: 'Маркетинг',   needsClub: false },
  { id: 'viewer',     label: 'Наблюдатель', needsClub: false },
  { id: 'tech',       label: 'Техник',      needsClub: false },
  { id: 'lostviewer', label: 'Утерянные вещи (просмотр)', needsClub: false },
];
const ROLE_LABEL = Object.fromEntries(ACCESS_ROLES.map(r => [r.id, r.label]));
const ACCESS_CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];

const StaffAccessPanel = ({ appUsers, isMobile, myEmail }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ email: '', name: '', role: 'admin', club: '4YOU' });
  const [saving, setSaving] = useState(false);
  const [editUser, setEditUser] = useState(null); // {email, profile} — редактор вкладок
  const [draftTabs, setDraftTabs] = useState({}); // path -> bool (эффективный доступ)
  const [roleUser, setRoleUser] = useState(null); // сотрудник в модалке «Повысить»
  const [roleDraft, setRoleDraft] = useState({ role: 'manager', club: '4YOU' });

  // Общий список: USER_ROLES (код + смерженные динамики) + пометки из app_users.
  // «Зашит в код» = есть в USER_ROLES, а его app_users-док (если есть) без role —
  // такие доки хранят только перекрытия вкладок/revoked.
  const users = useMemo(() => {
    const map = {};
    Object.entries(USER_ROLES).forEach(([email, p]) => {
      if (!email.includes('@')) return;
      map[email] = { email, role: p.role, club: p.club || null, displayName: p.displayName || email.split('@')[0], mop: !!p.mop, tabsExtra: p.tabsExtra || [], tabsHidden: p.tabsHidden || [], isStatic: true, revoked: false };
    });
    Object.entries(appUsers || {}).forEach(([emailRaw, p]) => {
      const e = emailRaw.toLowerCase();
      if (map[e]) {
        map[e].revoked = !!p.revoked;
        if (Array.isArray(p.tabsExtra)) map[e].tabsExtra = p.tabsExtra;
        if (Array.isArray(p.tabsHidden)) map[e].tabsHidden = p.tabsHidden;
        if (p.role) map[e].isStatic = false; // док с ролью = динамический аккаунт
      } else {
        map[e] = { email: e, role: p.role || 'admin', club: p.club || null, displayName: p.displayName || e.split('@')[0], mop: !!p.mop, revoked: !!p.revoked, tabsExtra: p.tabsExtra || [], tabsHidden: p.tabsHidden || [], isStatic: false };
      }
    });
    const list = Object.values(map);
    list.sort((a, b) => (a.club || 'ЯЯ').localeCompare(b.club || 'ЯЯ', 'ru') || (a.displayName || '').localeCompare(b.displayName || '', 'ru'));
    const query = q.trim().toLowerCase();
    return query
      ? list.filter(u => (u.displayName || '').toLowerCase().includes(query) || u.email.includes(query) || (u.club || '').toLowerCase().includes(query))
      : list;
  }, [appUsers, q]);

  const addUser = async () => {
    const email = form.email.trim().toLowerCase();
    if (!email.includes('@')) { toast.error('Укажите корректный email'); return; }
    if (email in USER_ROLES && !(appUsers || {})[email]) { toast.error('Такой сотрудник уже есть'); return; }
    const roleDef = ACCESS_ROLES.find(r => r.id === form.role);
    setSaving(true);
    try {
      await setDoc(doc(db, 'app_users', email), {
        role: form.role === 'mop' ? 'rop' : form.role,
        mop: form.role === 'mop',
        club: roleDef?.needsClub ? form.club : null,
        displayName: form.name.trim() || email.split('@')[0],
        addedBy: myEmail,
        createdAtISO: new Date().toISOString(),
      }, { merge: true });
      toast.success(`${form.name.trim() || email} добавлен(а): ${ROLE_LABEL[form.role]}${roleDef?.needsClub ? ' · ' + form.club : ''}`);
      setForm({ email: '', name: '', role: 'admin', club: '4YOU' });
    } catch { toast.error('Не удалось добавить'); }
    finally { setSaving(false); }
  };

  const removeUser = async (u) => {
    if (u.email === myEmail) return;
    if (u.isStatic) {
      // revoke в рантайме работает только для зашитых АДМИНОВ; остальные роли — только через код
      if (u.role !== 'admin') { toast.error('Эта роль зашита в код — попросите Клода убрать аккаунт'); return; }
      if (!window.confirm(`${u.displayName} зашит(а) в код — отключить доступ (revoke)?`)) return;
      try { await setDoc(doc(db, 'app_users', u.email), { revoked: true, revokedBy: myEmail, revokedAtISO: new Date().toISOString() }, { merge: true }); toast.success('Доступ отключён'); } catch { toast.error('Ошибка'); }
    } else {
      if (!window.confirm(`Удалить аккаунт ${u.displayName} (${u.email})?`)) return;
      try { await deleteDoc(doc(db, 'app_users', u.email)); toast.success('Удалён'); } catch { toast.error('Ошибка'); }
    }
  };

  // ── Повышение / смена роли ──
  const openRoleEditor = (u) => {
    if (u.isStatic && u.role === 'chef') { toast.error('Роль шефа меняется только в коде'); return; }
    const uiRole = u.mop ? 'mop' : u.role;
    setRoleDraft({ role: ACCESS_ROLES.some(r => r.id === uiRole) ? uiRole : 'manager', club: u.club || '4YOU' });
    setRoleUser(u);
  };
  const saveRole = async () => {
    if (!roleUser) return;
    const def = ACCESS_ROLES.find(r => r.id === roleDraft.role);
    const realRole = roleDraft.role === 'mop' ? 'rop' : roleDraft.role;
    const isMop = roleDraft.role === 'mop';
    const club = def?.needsClub ? roleDraft.club : null;
    try {
      if (roleUser.isStatic) {
        // Зашитый аккаунт: роль из кода не трогаем, кладём перекрытие
        await setDoc(doc(db, 'app_users', roleUser.email), {
          roleOverride: realRole, mopOverride: isMop, clubOverride: club,
          roleEditedBy: myEmail, roleEditedAtISO: new Date().toISOString(),
        }, { merge: true });
      } else {
        await setDoc(doc(db, 'app_users', roleUser.email), {
          role: realRole, mop: isMop, club,
          roleEditedBy: myEmail, roleEditedAtISO: new Date().toISOString(),
        }, { merge: true });
      }
      toast.success(`${roleUser.displayName}: теперь ${ROLE_LABEL[roleDraft.role]}${club ? ' · ' + club : ''}`);
      setRoleUser(null);
    } catch { toast.error('Не удалось изменить роль'); }
  };

  // ── Редактор доступа к вкладкам ──
  const openTabsEditor = (u) => {
    const eff = {};
    NAV_ITEMS.forEach(({ path }) => { eff[path] = navAllowed(u, path); });
    setDraftTabs(eff);
    setEditUser(u);
  };
  const saveTabs = async () => {
    if (!editUser) return;
    // Разница с базой роли → tabsExtra / tabsHidden
    const base = { role: editUser.role, club: editUser.club, mop: editUser.mop, email: editUser.email };
    const tabsExtra = [], tabsHidden = [];
    NAV_ITEMS.forEach(({ path }) => {
      const baseOn = baseNavAllowed(base, path);
      const want = !!draftTabs[path];
      if (want && !baseOn) tabsExtra.push(path);
      if (!want && baseOn) tabsHidden.push(path);
    });
    try {
      await setDoc(doc(db, 'app_users', editUser.email), {
        tabsExtra, tabsHidden,
        tabsEditedBy: myEmail, tabsEditedAtISO: new Date().toISOString(),
      }, { merge: true });
      toast.success('Доступ к вкладкам обновлён');
      setEditUser(null);
    } catch { toast.error('Не удалось сохранить'); }
  };

  const roleBadge = (u) => u.mop ? 'МОП' : (ROLE_LABEL[u.role] || u.role);

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '18px 20px', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => setOpen(v => !v)}>
        <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(125,111,179,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Shield size={22} style={{ color: 'var(--accent-purple)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>Сотрудники и доступы</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Добавление аккаунтов любой роли и настройка вкладок каждому</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-purple)' }}>{open ? 'Свернуть ▲' : 'Открыть ▼'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 16 }}>
          {/* Добавление сотрудника */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 14 }}>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@почта.com"
              style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, outline: 'none' }} />
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Имя"
              style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, outline: 'none' }} />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, outline: 'none' }}>
              {ACCESS_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <select value={form.club} onChange={e => setForm(f => ({ ...f, club: e.target.value }))}
              disabled={!ACCESS_ROLES.find(r => r.id === form.role)?.needsClub}
              style={{ padding: '10px 8px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, outline: 'none', opacity: ACCESS_ROLES.find(r => r.id === form.role)?.needsClub ? 1 : 0.4 }}>
              {ACCESS_CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={addUser} disabled={saving} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
              <UserPlus size={14} /> Добавить
            </button>
          </div>

          {/* Поиск + список */}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по имени, почте или клубу…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600, outline: 'none', marginBottom: 10 }} />
          <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {users.map(u => (
              <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)', opacity: u.revoked ? 0.45 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {u.displayName}
                    <span style={{ fontSize: 9, fontWeight: 900, background: 'rgba(125,111,179,0.14)', color: 'var(--accent-purple)', padding: '2px 7px', borderRadius: 6, textTransform: 'uppercase' }}>{roleBadge(u)}</span>
                    {u.club && <span style={{ fontSize: 9, fontWeight: 900, background: 'var(--bg-card)', color: 'var(--text-secondary)', padding: '2px 7px', borderRadius: 6, border: '1px solid var(--border)' }}>{u.club}</span>}
                    {(u.tabsExtra?.length || u.tabsHidden?.length) ? <span title="Доступ к вкладкам изменён" style={{ fontSize: 9, fontWeight: 900, background: 'rgba(192,143,79,0.14)', color: '#C08F4F', padding: '2px 7px', borderRadius: 6 }}>вкладки ✎</span> : null}
                    {u.revoked && <span style={{ fontSize: 9, fontWeight: 900, color: '#B06A6A' }}>отключён</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}{u.isStatic ? ' · зашит в код' : ''}</div>
                </div>
                <button onClick={() => openRoleEditor(u)} title="Повысить / сменить роль" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(95,156,129,0.4)', background: 'rgba(95,156,129,0.08)', color: '#5F9C81', fontSize: 11, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>
                  <Pencil size={12} /> Роль
                </button>
                <button onClick={() => openTabsEditor(u)} title="Доступ к вкладкам" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>
                  <Sliders size={12} /> Вкладки
                </button>
                {u.email !== myEmail && (
                  <button onClick={() => removeUser(u)} title={u.isStatic ? 'Отключить доступ' : 'Удалить аккаунт'} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 5, lineHeight: 0, opacity: 0.5, flexShrink: 0 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Модалка «Повысить / сменить роль» */}
      {roleUser && (
        <div onClick={() => setRoleUser(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: isMobile ? '100%' : 400, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? '20px 20px 0 0' : 18, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>Повысить / сменить роль</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>{roleUser.displayName} · сейчас: {roleBadge(roleUser)}{roleUser.club ? ' · ' + roleUser.club : ''}</div>
              </div>
              <button onClick={() => setRoleUser(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
            </div>
            <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 6 }}>Новая роль</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
              {ACCESS_ROLES.map(r => (
                <button key={r.id} onClick={() => setRoleDraft(d => ({ ...d, role: r.id }))}
                  style={{
                    padding: '9px 10px', borderRadius: 11, fontSize: 12, fontWeight: 800, cursor: 'pointer', textAlign: 'left',
                    border: '1px solid ' + (roleDraft.role === r.id ? 'var(--accent-purple)' : 'var(--border)'),
                    background: roleDraft.role === r.id ? 'var(--accent-purple)' : 'var(--bg-hover)',
                    color: roleDraft.role === r.id ? '#fff' : 'var(--text-secondary)',
                  }}>{r.label}</button>
              ))}
            </div>
            {ACCESS_ROLES.find(r => r.id === roleDraft.role)?.needsClub && (
              <>
                <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 6 }}>Клуб</div>
                <select value={roleDraft.club} onChange={e => setRoleDraft(d => ({ ...d, club: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 10px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, outline: 'none', marginBottom: 12 }}>
                  {ACCESS_CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setRoleUser(null)} style={{ padding: '11px 18px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase' }}>Отмена</button>
              <button onClick={saveRole} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: '#5F9C81', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase' }}>Применить</button>
            </div>
          </div>
        </div>
      )}

      {/* Редактор доступа к вкладкам */}
      {editUser && (
        <div onClick={() => setEditUser(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: isMobile ? '100%' : 460, maxHeight: '84vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? '20px 20px 0 0' : 18, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>Доступ к вкладкам</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>{editUser.displayName} · {roleBadge(editUser)}{editUser.club ? ' · ' + editUser.club : ''}</div>
              </div>
              <button onClick={() => setEditUser(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
              Галочка = вкладка видна. Отличия от стандартного набора роли помечаются автоматически.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 4 }}>
              {NAV_ITEMS.filter(n => n.path !== '/settings').map(({ path, label }) => {
                const on = !!draftTabs[path];
                const baseOn = baseNavAllowed({ role: editUser.role, club: editUser.club, mop: editUser.mop, email: editUser.email }, path);
                const changed = on !== baseOn;
                return (
                  <label key={path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 10, cursor: 'pointer', background: changed ? 'rgba(192,143,79,0.08)' : 'transparent', border: '1px solid ' + (changed ? 'rgba(192,143,79,0.3)' : 'transparent') }}>
                    <input type="checkbox" checked={on} onChange={e => setDraftTabs(d => ({ ...d, [path]: e.target.checked }))} style={{ width: 16, height: 16, accentColor: 'var(--accent-purple)' }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
                    {changed && <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: '#C08F4F' }}>{baseOn ? 'скрыта' : 'добавлена'}</span>}
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setEditUser(null)} style={{ padding: '11px 18px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase' }}>Отмена</button>
              <button onClick={saveTabs} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase' }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
