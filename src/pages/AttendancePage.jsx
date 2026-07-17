import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, X, Clock, Users, Shield, History, ChevronDown } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTickets } from '../store/TicketContext';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE'];

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

const LiveClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent-purple)', fontVariantNumeric: 'tabular-nums' }}>
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
  const isChef = user?.role === 'chef' || user?.role === 'viewer';
  const userClub = user?.club?.toUpperCase();

  const [selectedClub, setSelectedClub] = useState(userClub || CLUBS[0]);
  const [ipCheckins, setIpCheckins]     = useState([]);
  const [checkinStatus, setCheckinStatus] = useState('idle'); // idle | loading | ok | err
  const [checkinResult, setCheckinResult] = useState(null);
  const [gateways, setGateways]           = useState({});

  const today = format(new Date(), 'yyyy-MM-dd');

  // История отметок (менеджеры и шефы)
  const canSeeHistory = user?.role === 'chef' || user?.role === 'manager' || user?.role === 'viewer';
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
    const q = query(
      collection(db, 'checkins'),
      where('date', '==', today),
      where('clubId', '==', club)
    );
    return onSnapshot(q, snap => {
      setIpCheckins(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [selectedClub, today, isChef, userClub]);

  // ── Load history checkins for the selected date ───────────────────
  useEffect(() => {
    if (!canSeeHistory || viewMode !== 'history') return;
    const club = isChef ? selectedClub : userClub;
    if (!club) return;
    const q = query(
      collection(db, 'checkins'),
      where('date', '==', historyDate),
      where('clubId', '==', club)
    );
    return onSnapshot(q, snap => {
      setHistoryCheckins(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [canSeeHistory, viewMode, historyDate, selectedClub, isChef, userClub]);

  // История: группировка по сотруднику — приход, уход, длительность
  const historyByUser = useMemo(() => {
    const ts = (x) => x.timestamp?.seconds ?? (new Date(x.timestamp || 0).getTime() / 1000);
    const byUser = {};
    [...historyCheckins].sort((a, b) => ts(a) - ts(b)).forEach(c => {
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
  }, [historyCheckins]);

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
        body: JSON.stringify({ userId: user?.email || 'unknown', userName: user?.displayName || null, localSubnetOk, checkType: type }),
      });
      const data = await res.json();
      setCheckinResult(data);
      setCheckinStatus(data.allowed ? 'ok' : 'err');
    } catch {
      setCheckinStatus('err');
      setCheckinResult(null);
    }
  };

  const sortedCheckins = [...ipCheckins].sort((a, b) => {
    const ts = (x) => x.timestamp?.seconds ?? (new Date(x.timestamp || 0).getTime() / 1000);
    return ts(a) - ts(b);
  });

  return (
    <div className="animate-fade" style={{ maxWidth: 700, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: 4 }}>
            Чекин
          </h1>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Фиксация прихода по IP клуба
          </p>
        </div>
        <LiveClock />
      </div>

      {/* ── Club tabs (chef only) ── */}
      {isChef && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {CLUBS.map(club => (
            <button
              key={club}
              onClick={() => setSelectedClub(club)}
              style={{
                padding: '8px 18px', borderRadius: 12, cursor: 'pointer',
                fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
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

      {/* ── Сегодня / История ── */}
      {canSeeHistory && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {[['today', 'Сегодня', Clock], ['history', 'История', History]].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setViewMode(id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
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
      {viewMode === 'today' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Отметились сегодня', value: ipCheckins.length, icon: Users,       color: '#7B3DFF' },
          { label: 'Клуб',               value: isChef ? selectedClub : (userClub || '—'), icon: Shield, color: '#f59e0b' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <s.icon size={18} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>}

      {/* ── Кнопка чекина (менеджеры и админы) ── */}
      {viewMode === 'today' && !isChef && (
        <div style={{ marginBottom: 20 }}>
          {checkinStatus === 'ok' ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 20, padding: '16px 20px',
            }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShieldCheck size={20} color="#000" strokeWidth={3} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#22c55e' }}>Чекин прошёл!</div>
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
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 20, padding: '16px 20px',
            }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <X size={20} color="#fff" strokeWidth={3} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#ef4444' }}>Нет доступа</div>
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
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => handleCheckin('in')}
                style={{
                  flex: 1, padding: '18px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  background: 'var(--accent-purple)', color: '#fff',
                  fontWeight: 900, fontSize: 14, letterSpacing: '0.04em', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 12px 32px rgba(139,92,246,0.2)',
                }}
              >
                <ShieldCheck size={18} />
                Check-in
              </button>
              <button
                onClick={() => handleCheckin('out')}
                style={{
                  flex: 1, padding: '18px 20px', borderRadius: 20, cursor: 'pointer',
                  border: '1px solid rgba(245,158,11,0.4)',
                  background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
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
              style={{ padding: '9px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 900, cursor: 'pointer' }}>←</button>
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
              style={{ padding: '9px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: historyDate >= today ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 900, cursor: historyDate >= today ? 'default' : 'pointer', opacity: historyDate >= today ? 0.4 : 1 }}>→</button>
            {historyDate !== today && (
              <button onClick={() => setHistoryDate(today)} style={{ padding: '9px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Сегодня</button>
            )}
          </div>

          {/* Grouped by employee */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 24, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <History size={15} color="#7B3DFF" />
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Отметки за {format(new Date(historyDate + 'T12:00:00'), 'd MMMM', { locale: ru })}
              </span>
              {historyByUser.length > 0 && (
                <span style={{ marginLeft: 'auto', background: 'rgba(123,61,255,0.12)', color: '#7B3DFF', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 900 }}>
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
                  style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: 'rgba(123,61,255,0.1)', border: '1px solid rgba(123,61,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, color: '#7B3DFF' }}>
                    {(u.name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{u.name}</div>
                    {u.duration && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>на смене: {u.duration}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>{formatCheckinTime(u.firstIn?.timestamp)}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>приход</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{formatCheckinTime(u.lastOut?.timestamp)}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>уход</div>
                    </div>
                  </div>
                  <ChevronDown size={15} style={{ color: 'var(--text-muted)', transform: expandedUser === u.key ? 'rotate(180deg)' : 'none', transition: '0.2s', flexShrink: 0 }} />
                </div>
                {expandedUser === u.key && (
                  <div style={{ padding: '0 20px 14px 72px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {u.marks.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.checkType === 'out' ? '#f59e0b' : '#22c55e', flexShrink: 0 }} />
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
      {viewMode === 'today' && <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 24, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={15} color="#7B3DFF" />
          <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Кто пришёл сегодня
          </span>
          {ipCheckins.length > 0 && (
            <span style={{ marginLeft: 'auto', background: 'rgba(34,197,94,0.12)', color: '#22c55e', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 900 }}>
              {ipCheckins.length}
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
            const color = isOut ? '#f59e0b' : '#22c55e';
            return (
            <div
              key={c.id}
              style={{
                padding: '14px 20px',
                borderBottom: i < sortedCheckins.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex', alignItems: 'center', gap: 14,
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                background: isOut ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${isOut ? 'rgba(245,158,11,0.25)' : 'rgba(34,197,94,0.2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 15, color,
              }}>
                {(c.userName || c.userId || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {c.userName || c.userId}
                </div>
                {isChef && c.clubId && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 2, letterSpacing: '0.05em' }}>
                    {c.clubId}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {formatCheckinTime(c.timestamp)}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 1, letterSpacing: '0.06em' }}>
                  {isOut ? 'уход · check-out' : 'приход · check-in'}
                </div>
              </div>
            </div>
            );
          })
        )}
      </div>}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default AttendancePage;
