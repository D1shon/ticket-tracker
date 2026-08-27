import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, X, Clock, Users, Shield, History, ChevronDown, ClipboardList, Camera } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { collection, onSnapshot, query, where, doc, addDoc, Timestamp } from 'firebase/firestore';
import { db, getStorageLazy } from '../lib/firebase';
import { useTickets, USER_ROLES } from '../store/TicketContext';
import { isMobileDevice } from '../lib/isMobile';

const CHECKOUT_CHECKLIST = [
  'Посчитать пульсы, проверить каждый и отметить',
  'Посчитать полотенца, заполнить в треке',
  'Убраться в рабочей зоне',
  'Отписаться по задачам на завтра (передачи, посылки, поручения)',
  'Сверить кассу, зафоткать и отправить в чат',
];

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];

// Роль/подпись сотрудника по email (для фильтров и бейджей в чекине)
const roleInfoOf = (email) => USER_ROLES[(email || '').toLowerCase().trim()] || null;
const ROLE_LABEL = { manager: 'Менеджер', admin: 'Админ', rop: 'РОП', komdir: 'Ком-Дир', chef: 'Шеф', marketing: 'Маркетинг', viewer: 'Наблюдатель' };
const roleLabelOf = (email) => {
  const i = roleInfoOf(email);
  if (!i) return '';
  if (i.role === 'rop' && i.mop) return 'МОП';
  return ROLE_LABEL[i.role] || i.role;
};
// ОП (отдел продаж) = РОП/МОП (rop) и Ком-Дир
const isOpEmail = (email) => { const r = roleInfoOf(email)?.role; return r === 'rop' || r === 'komdir'; };
const isAdminEmail = (email) => roleInfoOf(email)?.role === 'admin';

// ── WebRTC local subnet check ─────────────────────────────────────
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

const formatCheckinTime = (ts) => {
  if (!ts) return '—';
  const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return isNaN(d.getTime()) ? '—' : format(d, 'HH:mm');
};

const LiveClock = ({ compact = false }) => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: compact ? 18 : 22, fontWeight: 900, color: 'var(--accent-purple)', fontVariantNumeric: 'tabular-nums' }}>
        {format(time, 'HH:mm:ss')}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {format(time, 'dd MMMM yyyy', { locale: ru })}
      </div>
    </div>
  );
};

const AttendancePage = () => {
  const { user } = useTickets();
  // «Видит все клубы» — шеф, наблюдатель и Ком-Дир (переключаются по клубам + режим ОП)
  const isChef = user?.role === 'chef' || user?.role === 'viewer' || user?.role === 'komdir';
  const userClub = user?.club?.toUpperCase();
  const viewerIsRop = user?.role === 'rop'; // РОП и МОП — только свой клуб, без админов

  const [opMode, setOpMode] = useState(false); // шеф: режим «ОП» (отдел продаж, все клубы)
  const [selectedClub, setSelectedClub] = useState(userClub || CLUBS[0]);

  // Мобильная вёрстка — только визуал, логика не меняется
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Фильтр строк чекина по роли смотрящего:
  // • шеф/Ком-Дир + режим ОП → ТОЛЬКО отдел продаж (РОП/МОП/Ком-Дир);
  // • РОП/МОП → свой клуб, БЕЗ админов;
  // • общий список «По клубам» (админам/менеджерам/шефу) → БЕЗ отдела продаж —
  //   МОП/РОП/Ком-Дир не попадают в список к администраторам, они только в разделе «ОП».
  const passRole = (email) => {
    if (isChef && opMode) return isOpEmail(email);
    if (viewerIsRop) return !isAdminEmail(email);
    return !isOpEmail(email);
  };
  const [ipCheckins, setIpCheckins]     = useState([]);
  const [failedCheckins, setFailedCheckins] = useState([]);
  const [checkinStatus, setCheckinStatus] = useState('idle'); // idle | loading | ok | err
  const [checkinResult, setCheckinResult] = useState(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checkedItems, setCheckedItems] = useState([]);
  const [photoStoragePath, setPhotoStoragePath] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [gateways, setGateways]           = useState({});

  // «Сегодня» пересчитывается каждую минуту: у менеджеров страница висит открытой
  // сутками, и после полуночи список продолжал показывать вчерашний день —
  // «админы отметились, а у менеджеров не видно».
  const [today, setToday] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  useEffect(() => {
    const iv = setInterval(() => {
      const t = format(new Date(), 'yyyy-MM-dd');
      setToday(prev => (prev === t ? prev : t));
    }, 60000);
    return () => clearInterval(iv);
  }, []);

  // История отметок (менеджеры и шефы)
  const canSeeHistory = user?.role === 'chef' || user?.role === 'manager' || user?.role === 'viewer' || user?.role === 'komdir';
  const [viewMode, setViewMode]         = useState('today'); // 'today' | 'history'
  const [historyDate, setHistoryDate]   = useState(today);
  const [historyCheckins, setHistoryCheckins] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);

  // ── Load gateway map ─────────────────────────────────────────────
  useEffect(() => {
    return onSnapshot(doc(db, 'checkin_config', 'ip_map'), snap => {
      if (snap.exists()) setGateways(snap.data().gateways ?? {});
    });
  }, []);

  // ── Load today's IP checkins ──────────────────────────────────────
  useEffect(() => {
    const club = isChef ? selectedClub : userClub;
    if (!club) return;
    const q = query(collection(db, 'checkins'), where('date', '==', today), where('clubId', '==', club));
    return onSnapshot(q, snap => {
      setIpCheckins(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [selectedClub, today, isChef, userClub]);

  // ── Load today's FAILED attempts (не из сети клуба) ────────────────
  // У них clubId = null, поэтому основной запрос их не видит; фильтруем по
  // userClub — клубу сотрудника из приложения (пишется с августа 2026).
  useEffect(() => {
    const club = isChef ? selectedClub : userClub;
    if (!club) return;
    const q = query(collection(db, 'checkins'), where('date', '==', today), where('userClub', '==', club), where('status', '==', 'failed'));
    return onSnapshot(q, snap => {
      setFailedCheckins(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => setFailedCheckins([]));
  }, [selectedClub, today, isChef, userClub]);

  // ── Load history checkins for the selected date ───────────────────
  useEffect(() => {
    if (!canSeeHistory || viewMode !== 'history') return;
    const club = isChef ? selectedClub : userClub;
    if (!club) return;
    const q = query(collection(db, 'checkins'), where('date', '==', historyDate), where('clubId', '==', club));
    return onSnapshot(q, snap => {
      setHistoryCheckins(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [canSeeHistory, viewMode, historyDate, selectedClub, isChef, userClub]);

  // История: группировка по сотруднику — приход, уход, длительность
  const historyByUser = useMemo(() => {
    const ts = (x) => x.timestamp?.seconds ?? (new Date(x.timestamp || 0).getTime() / 1000);
    const byUser = {};
    [...historyCheckins].filter(c => passRole(c.userId)).sort((a, b) => ts(a) - ts(b)).forEach(c => {
      const key = (c.userId || c.userName || '?').toLowerCase();
      if (!byUser[key]) byUser[key] = { name: c.userName || c.userId, marks: [] };
      byUser[key].marks.push(c);
    });
    return Object.entries(byUser).map(([key, u]) => {
      const ins  = u.marks.filter(m => (m.checkType || 'in') === 'in');
      const outs = u.marks.filter(m => m.checkType === 'out');
      const firstIn = ins[0] || null;
      const lastOut = outs.length ? outs[outs.length - 1] : null;
      let duration = null;
      if (firstIn && lastOut) {
        const mins = Math.round((ts(lastOut) - ts(firstIn)) / 60);
        if (mins > 0) duration = `${Math.floor(mins / 60)}ч ${String(mins % 60).padStart(2, '0')}м`;
      }
      return { key, name: u.name, marks: u.marks, firstIn, lastOut, duration };
    }).sort((a, b) => (a.firstIn ? ts(a.firstIn) : Infinity) - (b.firstIn ? ts(b.firstIn) : Infinity));
  }, [historyCheckins, opMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Загрузка фото кассы (обязательно перед чекаутом) ─────────────
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    try {
      const storage = await getStorageLazy();
      const { ref, uploadBytes } = await import('firebase/storage');
      const safeName = (user?.email || 'unknown').replace(/[^a-z0-9]/gi, '_');
      const path = `checkout_photos/${safeName}_${Date.now()}.jpg`;
      await uploadBytes(ref(storage, path), file, { contentType: file.type || 'image/jpeg' });
      await addDoc(collection(db, 'checkout_photos'), {
        userId: user?.email || 'unknown',
        userName: user?.displayName || null,
        club: user?.club || null,
        storagePath: path,
        uploadedAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000),
      });
      setPhotoStoragePath(path);
    } catch {
      setPhotoPreviewUrl(null);
      alert('Не удалось загрузить фото. Попробуйте ещё раз.');
    } finally {
      setPhotoUploading(false);
    }
  };

  // ── IP check-in ───────────────────────────────────────────────────
  const handleCheckin = async (type = 'in') => {
    setCheckinStatus('loading');
    setCheckinResult(null);
    try {
      // WebRTC: собираем локальный IP как дополнительную инфо, не блокируем
      let localSubnetOk = null;
      const gwList = Object.keys(gateways);
      if (gwList.length > 0) {
        const localIPs = await getLocalIPs();
        if (localIPs.length > 0) {
          localSubnetOk = gwList.some(gw => onGatewaySubnet(localIPs, gw));
        }
      }

      // Сервер принимает окончательное решение по публичному IP
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.email || 'unknown', userName: user?.displayName || null, userClub: user?.club || null, localSubnetOk, checkType: type }),
      });
      const data = await res.json();
      setCheckinResult(data);
      setCheckinStatus(data.allowed ? 'ok' : 'err');
    } catch {
      setCheckinStatus('err');
      setCheckinResult(null);
    }
  };

  const sortedCheckins = [...ipCheckins].filter(c => passRole(c.userId)).sort((a, b) => {
    const ts = (x) => x.timestamp?.seconds ?? (new Date(x.timestamp || 0).getTime() / 1000);
    return ts(a) - ts(b);
  });

  return (
    <div className="animate-fade" style={{ maxWidth: 700, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: isMobile ? 16 : 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 19 : 22, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: 4 }}>
            Чекин
          </h1>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Фиксация прихода по IP клуба
          </p>
        </div>
        <LiveClock compact={isMobile} />
      </div>

      {/* ── Режим: Клубы / ОП (только шеф) ── */}
      {isChef && (
        <div style={{ display: 'flex', gap: 8, marginBottom: isMobile ? 12 : 16 }}>
          {/* На мобильном кнопки режима тянутся на всю ширину (зона нажатия ≥40px) */}
          <button onClick={() => setOpMode(false)} style={{ flex: isMobile ? 1 : 'none', minHeight: isMobile ? 40 : undefined, padding: '8px 18px', borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid ' + (!opMode ? 'var(--accent-purple)' : 'var(--border)'), background: !opMode ? 'var(--accent-purple)' : 'var(--bg-card)', color: !opMode ? '#fff' : 'var(--text-secondary)' }}>По клубам</button>
          <button onClick={() => setOpMode(true)} style={{ flex: isMobile ? 1 : 'none', minHeight: isMobile ? 40 : undefined, padding: '8px 18px', borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid ' + (opMode ? '#0ea5e9' : 'var(--border)'), background: opMode ? '#0ea5e9' : 'var(--bg-card)', color: opMode ? '#fff' : 'var(--text-secondary)' }}>💼 ОП (продажи)</button>
        </div>
      )}

      {/* ── Club tabs (все, кто видит все клубы) — работают и в режиме ОП ── */}
      {isChef && (
        // На мобильном табы клубов — горизонтальная лента без переноса (скролл внутри блока, не страницы)
        <div style={isMobile
          ? { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', paddingBottom: 2 }
          : { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {CLUBS.map(club => (
            <button
              key={club}
              onClick={() => setSelectedClub(club)}
              style={{
                padding: isMobile ? '9px 14px' : '8px 18px', borderRadius: 12, cursor: 'pointer',
                fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                whiteSpace: 'nowrap', flexShrink: 0,
                background: selectedClub === club ? 'var(--accent-purple)' : 'var(--bg-card)',
                color: selectedClub === club ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${selectedClub === club ? 'var(--accent-purple)' : 'var(--border)'}`,
                transition: 'all 0.2s',
              }}
            >
              {club}
            </button>
          ))}
        </div>
      )}

      {isChef && opMode && (
        <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 12, background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.25)', fontSize: 12, fontWeight: 700, color: '#0ea5e9' }}>
          💼 Отдел продаж (РОП, МОП, Ком-Дир) · {selectedClub}
        </div>
      )}

      {/* ── Сегодня / История ── */}
      {canSeeHistory && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {[['today', 'Сегодня', Clock], ['history', 'История', History]].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setViewMode(id)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              flex: isMobile ? 1 : 'none', minHeight: isMobile ? 40 : undefined,
              padding: '8px 16px', borderRadius: 12, fontSize: 12, fontWeight: 800, cursor: 'pointer',
              border: '1px solid ' + (viewMode === id ? 'var(--accent-purple)' : 'var(--border)'),
              background: viewMode === id ? 'var(--accent-purple)' : 'transparent',
              color: viewMode === id ? '#fff' : 'var(--text-muted)',
            }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Stats ── */}
      {/* На мобильном — компактные плитки в 2 колонки, значения без обрезки */}
      {viewMode === 'today' && <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: isMobile ? 8 : 12, marginBottom: isMobile ? 16 : 20 }}>
        {[
          { label: 'Отметились сегодня', value: ipCheckins.length, icon: Users,       color: '#7D6FB3' },
          { label: 'Клуб',               value: isChef ? selectedClub : (userClub || '—'), icon: Shield, color: '#C08F4F' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 16 : 20, padding: isMobile ? '12px 12px' : '16px 20px', display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, minWidth: 0 }}>
            <div style={{ width: isMobile ? 34 : 40, height: isMobile ? 34 : 40, borderRadius: 12, background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <s.icon size={isMobile ? 16 : 18} color={s.color} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 900, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>}

      {/* ── Кнопка чекина (менеджеры и админы) ── */}
      {viewMode === 'today' && !isChef && (
        <div style={{ marginBottom: 20 }}>
          {checkinStatus === 'ok' ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14,
              background: 'rgba(95,156,129,0.08)', border: '1px solid rgba(95,156,129,0.25)',
              borderRadius: 20, padding: isMobile ? '12px 14px' : '16px 20px',
            }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#5F9C81', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShieldCheck size={20} color="#000" strokeWidth={3} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#5F9C81' }}>Чекин прошёл!</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>
                  {checkinResult?.clubId ? `Клуб: ${checkinResult.clubId}` : 'Время зафиксировано'}
                </div>
              </div>
              <button
                onClick={() => { setCheckinStatus('idle'); setCheckinResult(null); }}
                style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Сбросить
              </button>
            </div>
          ) : checkinStatus === 'err' ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, flexWrap: isMobile ? 'wrap' : 'nowrap',
              background: 'rgba(176,106,106,0.08)', border: '1px solid rgba(176,106,106,0.25)',
              borderRadius: 20, padding: isMobile ? '12px 14px' : '16px 20px',
            }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#B06A6A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <X size={20} color="#fff" strokeWidth={3} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#B06A6A' }}>Нет доступа</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>
                  {checkinResult?.localNetworkError
                    ? `Ваш IP: ${checkinResult.localIp} — не в подсети ${checkinResult.expectedSubnet}. Подключитесь к WiFi клуба`
                    : checkinResult?.ip
                      ? `Ваш IP: ${checkinResult.ip} — не в списке клубов`
                      : 'Подключитесь к WiFi клуба'}
                </div>
              </div>
              <button
                onClick={() => { setCheckinStatus('idle'); setCheckinResult(null); }}
                style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Повторить
              </button>
            </div>
          ) : checkinStatus === 'loading' ? (
            <button
              disabled
              style={{
                width: '100%', padding: '18px 24px', borderRadius: 20,
                border: '1px solid var(--border)', cursor: 'wait',
                background: 'var(--bg-card)', color: 'var(--text-muted)',
                fontWeight: 900, fontSize: 15, letterSpacing: '0.04em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--text-muted)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
              Проверка IP...
            </button>
          ) : (
            // На мобильном кнопки друг под другом — каждая крупная, во всю ширину
            <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
              <button
                onClick={() => handleCheckin('in')}
                style={{
                  flex: 1, width: isMobile ? '100%' : undefined, minHeight: isMobile ? 56 : undefined,
                  padding: '18px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  background: 'var(--accent-purple)', color: '#fff',
                  fontWeight: 900, fontSize: 14, letterSpacing: '0.04em', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 12px 32px rgba(125,111,179,0.2)',
                }}
              >
                <ShieldCheck size={18} />
                Check-in
              </button>
              <button
                onClick={() => {
                  if (user?.role === 'admin') {
                    setCheckedItems([]);
                    setPhotoStoragePath(null);
                    setPhotoPreviewUrl(null);
                    setPhotoUploading(false);
                    setChecklistOpen(true);
                  } else {
                    handleCheckin('out');
                  }
                }}
                style={{
                  flex: 1, width: isMobile ? '100%' : undefined, minHeight: isMobile ? 48 : undefined,
                  padding: isMobile ? '14px 20px' : '18px 20px', borderRadius: 20, cursor: 'pointer',
                  border: '1px solid rgba(192,143,79,0.4)',
                  background: 'rgba(192,143,79,0.08)', color: '#C08F4F',
                  fontWeight: 900, fontSize: 14, letterSpacing: '0.04em', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <X size={18} />
                Check-out
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── История отметок ── */}
      {viewMode === 'history' && canSeeHistory && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Date switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setHistoryDate(format(subDays(new Date(historyDate + 'T12:00:00'), 1), 'yyyy-MM-dd'))}
              style={{ padding: isMobile ? '11px 16px' : '9px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 900, cursor: 'pointer' }}>←</button>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--accent-purple)', cursor: 'pointer' }}>
              <Clock size={13} style={{ color: 'var(--accent-purple)' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                {format(new Date(historyDate + 'T12:00:00'), 'd MMMM yyyy', { locale: ru })}
              </span>
              <input type="date" value={historyDate} max={today}
                onChange={e => e.target.value && setHistoryDate(e.target.value)}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
            </div>
            <button onClick={() => historyDate < today && setHistoryDate(format(addDays(new Date(historyDate + 'T12:00:00'), 1), 'yyyy-MM-dd'))}
              disabled={historyDate >= today}
              style={{ padding: isMobile ? '11px 16px' : '9px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: historyDate >= today ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 900, cursor: historyDate >= today ? 'default' : 'pointer', opacity: historyDate >= today ? 0.4 : 1 }}>→</button>
            {historyDate !== today && (
              <button onClick={() => setHistoryDate(today)} style={{ padding: '9px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Сегодня</button>
            )}
          </div>

          {/* Grouped by employee */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 16 : 24, overflow: 'hidden' }}>
            <div style={{ padding: isMobile ? '12px 14px' : '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <History size={15} color="#7D6FB3" />
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Отметки за {format(new Date(historyDate + 'T12:00:00'), 'd MMMM', { locale: ru })}
              </span>
              {historyByUser.length > 0 && (
                <span style={{ marginLeft: 'auto', background: 'rgba(125,111,179,0.12)', color: '#7D6FB3', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 900 }}>
                  {historyByUser.length} чел.
                </span>
              )}
            </div>
            {historyByUser.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
                Отметок за этот день нет
              </div>
            ) : historyByUser.map((u, i) => (
              <div key={u.key} style={{ borderBottom: i < historyByUser.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div
                  onClick={() => setExpandedUser(expandedUser === u.key ? null : u.key)}
                  style={{ padding: isMobile ? '10px 12px' : '14px 20px', display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, cursor: 'pointer' }}
                >
                  <div style={{ width: isMobile ? 34 : 38, height: isMobile ? 34 : 38, borderRadius: 12, flexShrink: 0, background: 'rgba(125,111,179,0.1)', border: '1px solid rgba(125,111,179,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: isMobile ? 13 : 15, color: '#7D6FB3' }}>
                    {(u.name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                    {u.duration && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>на смене: {u.duration}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', gap: isMobile ? 10 : 16 }}>
                    <div>
                      <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 900, color: '#5F9C81', fontVariantNumeric: 'tabular-nums' }}>{formatCheckinTime(u.firstIn?.timestamp)}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>приход</div>
                    </div>
                    <div>
                      <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 900, color: '#C08F4F', fontVariantNumeric: 'tabular-nums' }}>{formatCheckinTime(u.lastOut?.timestamp)}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>уход</div>
                    </div>
                  </div>
                  <ChevronDown size={15} style={{ color: 'var(--text-muted)', transform: expandedUser === u.key ? 'rotate(180deg)' : 'none', transition: '0.2s', flexShrink: 0 }} />
                </div>
                {expandedUser === u.key && (
                  <div style={{ padding: isMobile ? '0 12px 12px 56px' : '0 20px 14px 72px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {u.marks.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.checkType === 'out' ? '#C08F4F' : '#5F9C81', flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatCheckinTime(m.timestamp)}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{m.checkType === 'out' ? 'check-out' : 'check-in'}</span>
                        {m.ipAddress && <span style={{ color: 'var(--text-muted)', opacity: 0.6, fontSize: 10 }}>· IP {m.ipAddress}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Список чекинов сегодня ── */}
      {viewMode === 'today' && <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 16 : 24, overflow: 'hidden' }}>
        <div style={{ padding: isMobile ? '12px 14px' : '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={15} color="#7D6FB3" />
          <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Кто пришёл сегодня
          </span>
          {sortedCheckins.length > 0 && (
            <span style={{ marginLeft: 'auto', background: 'rgba(95,156,129,0.12)', color: '#5F9C81', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 900 }}>
              {sortedCheckins.length}
            </span>
          )}
        </div>

        {sortedCheckins.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <ShieldCheck size={36} style={{ margin: '0 auto 12px', opacity: 0.12, display: 'block' }} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>Ещё никто не отметился</div>
            <div style={{ fontSize: 11, marginTop: 4, fontWeight: 500 }}>Подключитесь к WiFi клуба и нажмите «ОТМЕТИТЬСЯ»</div>
          </div>
        ) : (
          sortedCheckins.map((c, i) => {
            const isOut = c.checkType === 'out';
            const color = isOut ? '#C08F4F' : '#5F9C81';
            return (
            <div
              key={c.id}
              style={{
                padding: isMobile ? '10px 12px' : '14px 20px',
                borderBottom: i < sortedCheckins.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14,
              }}
            >
              <div style={{
                width: isMobile ? 34 : 38, height: isMobile ? 34 : 38, borderRadius: 12, flexShrink: 0,
                background: isOut ? 'rgba(192,143,79,0.1)' : 'rgba(95,156,129,0.1)',
                border: `1px solid ${isOut ? 'rgba(192,143,79,0.25)' : 'rgba(95,156,129,0.2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: isMobile ? 13 : 15, color,
              }}>
                {(c.userName || c.userId || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.userName || c.userId}
                </div>
                {(() => {
                  const rl = roleLabelOf(c.userId);
                  const showClub = isChef && c.clubId;
                  if (!rl && !showClub) return null;
                  return (
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 2, letterSpacing: '0.05em' }}>
                      {rl}{rl && showClub ? ' · ' : ''}{showClub ? c.clubId : ''}
                    </div>
                  );
                })()}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {formatCheckinTime(c.timestamp)}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 1, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                  {isOut ? 'уход · check-out' : 'приход · check-in'}
                </div>
              </div>
            </div>
            );
          })
        )}
      </div>}

      {/* ── Попытки не из сети клуба (failed) — видно менеджеру/шефу ── */}
      {failedCheckins.length > 0 && (
        <div style={{ marginTop: 14, background: 'var(--bg-card)', border: '1px solid rgba(192,143,79,0.35)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#C08F4F' }}>Попытки не из сети клуба</span>
          </div>
          {failedCheckins
            .slice()
            .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0))
            .map((c, i, arr) => (
              <div key={c.id} style={{ padding: isMobile ? '9px 12px' : '11px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: isMobile ? 12.5 : 13.5, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.userName || c.userId}
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', marginTop: 1 }}>
                    Телефон был не на Wi-Fi клуба (мобильный интернет) — отметка не засчитана
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 900, color: '#C08F4F', fontVariantNumeric: 'tabular-nums' }}>{formatCheckinTime(c.timestamp)}</div>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.checkType === 'out' ? 'уход' : 'приход'}</div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ── Чеклист перед чекаутом (только для администраторов) ── */}
      {checklistOpen && (
        <div
          onClick={() => setChecklistOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 24, width: '100%', maxWidth: 420,
              boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
              overflow: 'hidden',
            }}
          >
            {/* Шапка */}
            <div style={{
              padding: '18px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                background: 'rgba(192,143,79,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ClipboardList size={17} color="#C08F4F" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Чеклист перед уходом
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginTop: 1 }}>
                  Отметьте все пункты, чтобы выйти
                </div>
              </div>
              <button
                onClick={() => setChecklistOpen(false)}
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Пункты чеклиста */}
            <div style={{ padding: '10px 0' }}>
              {CHECKOUT_CHECKLIST.map((item, idx) => {
                const checked = checkedItems.includes(idx);
                return (
                  <div
                    key={idx}
                    onClick={() => setCheckedItems(prev =>
                      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                    )}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '11px 20px', cursor: 'pointer',
                      transition: 'background 0.15s',
                      background: checked ? 'rgba(95,156,129,0.06)' : 'transparent',
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1,
                      border: `2px solid ${checked ? '#5F9C81' : 'var(--border)'}`,
                      background: checked ? '#5F9C81' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}>
                      {checked && (
                        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                          <path d="M1 4L4 7.5L10 1" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span style={{
                      fontSize: 13, fontWeight: 700, lineHeight: 1.4,
                      color: checked ? 'var(--text-muted)' : 'var(--text-primary)',
                      textDecoration: checked ? 'line-through' : 'none',
                      transition: 'all 0.15s',
                    }}>
                      {idx + 1}. {item}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Фото кассы — обязательно */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#C08F4F', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                Фото кассы — обязательно
              </div>
              {photoStoragePath ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src={photoPreviewUrl} alt="касса" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, border: '2px solid #5F9C81', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#5F9C81' }}>Фото прикреплено ✓</div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>
                      Заменить
                      <input type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>
              ) : photoUploading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #C08F4F', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Загружаем фото...</span>
                </div>
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 14, border: '1.5px dashed rgba(192,143,79,0.4)', background: 'rgba(192,143,79,0.04)', cursor: 'pointer' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(192,143,79,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Camera size={16} color="#C08F4F" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>Сфотографировать кассу</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginTop: 1 }}>Нажмите, чтобы открыть камеру</div>
                  </div>
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                </label>
              )}
            </div>

            {/* Прогресс + кнопка подтверждения */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, background: '#5F9C81',
                    width: `${(checkedItems.length / CHECKOUT_CHECKLIST.length) * 100}%`,
                    transition: 'width 0.25s ease',
                  }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {checkedItems.length}/{CHECKOUT_CHECKLIST.length}
                </span>
              </div>
              {(() => {
                const allChecked = checkedItems.length >= CHECKOUT_CHECKLIST.length;
                const canConfirm = allChecked && !!photoStoragePath;
                const remaining = CHECKOUT_CHECKLIST.length - checkedItems.length;
                const label = !allChecked
                  ? `Осталось ${remaining} пункт${remaining === 1 ? '' : remaining < 5 ? 'а' : 'ов'}`
                  : !photoStoragePath
                    ? 'Прикрепите фото кассы'
                    : 'Подтвердить чекаут ✓';
                return (
                  <button
                    disabled={!canConfirm}
                    onClick={() => { setChecklistOpen(false); handleCheckin('out'); }}
                    style={{
                      width: '100%', padding: '14px 20px', borderRadius: 16, border: 'none',
                      cursor: canConfirm ? 'pointer' : 'not-allowed',
                      background: canConfirm ? '#C08F4F' : 'var(--bg-hover)',
                      color: canConfirm ? '#fff' : 'var(--text-muted)',
                      fontWeight: 900, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase',
                      transition: 'all 0.2s',
                    }}
                  >
                    {label}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default AttendancePage;
