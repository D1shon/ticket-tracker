import React, { useState, useEffect, useMemo } from 'react';
import {
  Wifi, WifiOff, Plus, Trash2, Edit3, Check, X,
  Clock, Users, Shield, Activity, ChevronDown, Settings2
} from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  collection, onSnapshot, setDoc, deleteDoc, doc, query, where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTickets } from '../store/TicketContext';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'ТЕСТ'];

// Format MAC nicely: aabbccddeeff -> AA:BB:CC:DD:EE:FF
const formatMac = (mac) => {
  if (!mac) return '';
  return mac.replace(/[^a-fA-F0-9]/g, '').toUpperCase().match(/.{1,2}/g)?.join(':') || mac;
};

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return '0 мин';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} мин`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs} ч ${remMins} мин`;
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

const StatusDot = ({ online }) => (
  <div style={{
    width: 10, height: 10, borderRadius: '50%',
    background: online ? '#22c55e' : 'var(--text-muted)',
    boxShadow: online ? '0 0 8px #22c55e' : 'none',
    animation: online ? 'pulse 2s infinite' : 'none',
    flexShrink: 0,
  }} />
);

const AttendancePage = () => {
  const { user } = useTickets();
  const isChef = user?.role === 'chef';
  const userClub = user?.club?.toUpperCase();

  const [selectedClub, setSelectedClub] = useState(userClub || CLUBS[0]);
  const [employees, setEmployees] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [agentStatus, setAgentStatus] = useState(null);
  const [clubConfig, setClubConfig] = useState({}); // { routerIp: '192.168.1.1' }

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [formName, setFormName] = useState('');
  const [formMac, setFormMac] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingIp, setEditingIp] = useState(false);
  const [formIp, setFormIp] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');

  // ── Load employees for selected club ──────────────────────────────
  useEffect(() => {
    if (!selectedClub) return;
    const q = query(collection(db, 'wifi_employees'), where('clubId', '==', selectedClub));
    return onSnapshot(q, (snap) => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    });
  }, [selectedClub]);

  // ── Load club config (router IP) ──────────────────────────────────
  useEffect(() => {
    if (!selectedClub) return;
    return onSnapshot(doc(db, 'wifi_clubs', selectedClub), (snap) => {
      if (snap.exists()) setClubConfig(snap.data());
      else setClubConfig({});
    });
  }, [selectedClub]);

  // ── Load today's sessions ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedClub) return;
    const q = query(collection(db, 'wifi_sessions'), where('clubId', '==', selectedClub), where('date', '==', today));
    return onSnapshot(q, (snap) => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [selectedClub, today]);

  // ── Load agent heartbeat ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedClub) return;
    return onSnapshot(doc(db, 'wifi_agents', selectedClub), (snap) => {
      if (snap.exists()) setAgentStatus(snap.data());
      else setAgentStatus(null);
    });
  }, [selectedClub]);

  // ── Save router IP ────────────────────────────────────────────────
  const saveRouterIp = async () => {
    if (!formIp.trim()) return;
    await setDoc(doc(db, 'wifi_clubs', selectedClub), {
      clubId: selectedClub,
      routerIp: formIp.trim(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    setEditingIp(false);
  };

  // Merge employees with their session data
  const enrichedEmployees = useMemo(() => {
    return employees.map(emp => {
      const session = sessions.find(s => s.macAddress === emp.macAddress);
      return { ...emp, session };
    });
  }, [employees, sessions]);

  // Agent last seen: was it within last 3 minutes?
  const agentAlive = agentStatus?.lastSeen
    ? (Date.now() - new Date(agentStatus.lastSeen.seconds ? agentStatus.lastSeen.seconds * 1000 : agentStatus.lastSeen).getTime()) < 3 * 60 * 1000
    : false;

  const onlineCount = enrichedEmployees.filter(e => e.session?.isOnline && agentAlive).length;

  // ── Save employee ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formName.trim() || !formMac.trim()) return;
    setSaving(true);
    const mac = formatMac(formMac.trim());
    const id = editingEmp ? editingEmp.id : `${selectedClub}_${mac.replace(/:/g, '')}`;
    try {
      await setDoc(doc(db, 'wifi_employees', id), {
        clubId: selectedClub,
        name: formName.trim(),
        macAddress: mac,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setShowAddModal(false);
      setEditingEmp(null);
      setFormName('');
      setFormMac('');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (emp) => {
    setEditingEmp(emp);
    setFormName(emp.name);
    setFormMac(emp.macAddress);
    setShowAddModal(true);
  };

  const handleDelete = async (emp) => {
    if (!window.confirm(`Удалить ${emp.name}?`)) return;
    try {
      console.log('[delete] Удаляю:', emp.id, emp);
      await deleteDoc(doc(db, 'wifi_employees', emp.id));
      console.log('[delete] Успешно удалён:', emp.id);
    } catch (err) {
      console.error('[delete] Ошибка:', err);
      alert(`Ошибка удаления: ${err.message}`);
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingEmp(null);
    setFormName('');
    setFormMac('');
  };

  return (
    <div className="animate-fade" style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: 4 }}>
            WiFi Чекин
          </h1>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Авто-фиксация прихода по MAC-адресу
          </p>
        </div>
        <LiveClock />
      </div>

      {/* ── Router IP config ── */}
      <div style={{
        marginBottom: 20, padding: '16px 20px',
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <Wifi size={18} color="var(--accent-purple)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
            IP-адрес роутера клуба {selectedClub}
          </div>
          {editingIp ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input
                value={formIp}
                onChange={e => setFormIp(e.target.value)}
                placeholder="192.168.1.1"
                autoFocus
                style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid var(--accent-purple)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, outline: 'none', fontFamily: 'monospace', width: 160 }}
                onKeyDown={e => { if (e.key === 'Enter') saveRouterIp(); if (e.key === 'Escape') setEditingIp(false); }}
              />
              <button onClick={saveRouterIp} style={{ padding: '7px 14px', borderRadius: 10, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontWeight: 900, fontSize: 11, cursor: 'pointer' }}>Сохранить</button>
              <button onClick={() => setEditingIp(false)} style={{ padding: '7px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>Отмена</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: clubConfig.routerIp ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                {clubConfig.routerIp || 'Не задан'}
              </span>
              <button
                onClick={() => { setFormIp(clubConfig.routerIp || ''); setEditingIp(true); }}
                style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Edit3 size={11} /> Изменить
              </button>
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, maxWidth: 260, lineHeight: 1.5 }}>
          Агент автоматически определит свой клуб по IP шлюза сети. Обычно это адрес роутера: <code style={{ background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 4 }}>192.168.x.1</code>
        </div>
      </div>
      {isChef && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {CLUBS.map(club => (
            <button
              key={club}
              onClick={() => setSelectedClub(club)}
              style={{
                padding: '8px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
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

      {/* ── Stats row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Сотрудников', value: employees.length, icon: Users, color: '#7B3DFF' },
          { label: 'Онлайн сейчас', value: onlineCount, icon: Wifi, color: '#22c55e' },
          { label: 'Клуб', value: selectedClub, icon: Shield, color: '#f59e0b' },
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

        {/* Agent status */}
        <div style={{
          background: 'var(--bg-card)', border: `1px solid ${agentAlive ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
          borderRadius: 20, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: agentAlive ? 'rgba(34,197,94,0.1)' : 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Activity size={18} color={agentAlive ? '#22c55e' : 'var(--text-muted)'} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Агент</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: agentAlive ? '#22c55e' : 'var(--text-muted)' }}>
              {agentAlive ? 'АКТИВЕН' : 'OFFLINE'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Agent offline warning ── */}
      {!agentAlive && employees.length > 0 && (
        <div style={{
          marginBottom: 16, padding: '12px 18px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 16, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <WifiOff size={16} color="#ef4444" style={{ flexShrink: 0 }} />
          <div>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#ef4444' }}>Агент не активен</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
              Запустите wifi-agent.mjs на компьютере в клубе, чтобы отслеживать присутствие
            </span>
          </div>
        </div>
      )}

      {/* ── Remote Diagnostics Panel ── (только для chef) */}
      {isChef && agentStatus?.lastScanAt && (
        <div style={{
          marginBottom: 16,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 20, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 18px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} color="var(--accent-purple)" />
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Диагностика · Последнее сканирование
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {agentStatus.version && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 6 }}>
                  v{agentStatus.version}
                </span>
              )}
              {agentStatus.subnet && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {agentStatus.subnet}
                </span>
              )}
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {agentStatus.lastScanAt
                  ? format(new Date(agentStatus.lastScanAt), 'HH:mm:ss')
                  : '—'
                }
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: agentStatus.lastScanDevicesTotal > 0 ? '#22c55e' : '#f59e0b',
                background: agentStatus.lastScanDevicesTotal > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                padding: '2px 8px', borderRadius: 6,
              }}>
                {agentStatus.lastScanDevicesTotal ?? 0} устройств в сети
              </span>
            </div>
          </div>

          {/* Per-employee match status */}
          {agentStatus.lastScanEmployees?.length > 0 && (
            <div style={{ padding: '10px 18px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {agentStatus.lastScanEmployees.map((emp, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', borderRadius: 10,
                  background: emp.found ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.06)',
                  border: `1px solid ${emp.found ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)'}`,
                }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: emp.found ? '#22c55e' : '#ef4444',
                    boxShadow: emp.found ? '0 0 6px #22c55e' : 'none',
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: emp.found ? '#22c55e' : '#ef4444' }}>
                    {emp.name}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {emp.mac}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Raw MACs found in network */}
          {agentStatus.lastScanMacs?.length > 0 && (
            <details style={{ padding: '0 18px 10px' }}>
              <summary style={{ fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 700, userSelect: 'none', marginBottom: 6 }}>
                Все MAC-адреса в сети ({agentStatus.lastScanMacs.length})
              </summary>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 100, overflowY: 'auto' }}>
                {agentStatus.lastScanMacs.map((mac, i) => {
                  const isEmployeeMac = employees.some(e => (e.macAddress || '').toUpperCase() === mac);
                  return (
                    <span key={i} style={{
                      fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                      padding: '2px 6px', borderRadius: 4,
                      background: isEmployeeMac ? 'rgba(123,61,255,0.15)' : 'var(--bg-hover)',
                      color: isEmployeeMac ? 'var(--accent-purple)' : 'var(--text-muted)',
                      border: isEmployeeMac ? '1px solid rgba(123,61,255,0.3)' : '1px solid var(--border)',
                    }}>
                      {mac}
                    </span>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Employee list + Add button ── */}

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 24, overflow: 'hidden' }}>
        {/* List header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Сотрудники · {selectedClub}
          </span>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 12, border: 'none',
              background: 'var(--accent-purple)', color: '#fff',
              fontWeight: 800, fontSize: 11, cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}
          >
            <Plus size={14} /> Добавить
          </button>
        </div>

        {/* Employee rows */}
        {enrichedEmployees.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Wifi size={40} style={{ margin: '0 auto 12px', opacity: 0.2, display: 'block' }} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>Нет сотрудников</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Добавьте сотрудника с MAC-адресом его телефона</div>
          </div>
        ) : (
          enrichedEmployees.map((emp, idx) => {
            // If agent is dead → nobody can be truly online (data is stale)
            const isOnline = emp.session?.isOnline && agentAlive;
            const arrivedAt = emp.session?.arrivedAt;
            const leftAt = emp.session?.leftAt;
            const arrivedStr = arrivedAt
              ? format(new Date(arrivedAt.seconds ? arrivedAt.seconds * 1000 : arrivedAt), 'HH:mm')
              : null;
            const leftStr = leftAt
              ? format(new Date(leftAt.seconds ? leftAt.seconds * 1000 : leftAt), 'HH:mm')
              : null;

            return (
              <div
                key={emp.id}
                style={{
                  padding: '14px 20px',
                  borderBottom: idx < enrichedEmployees.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: isOnline ? 'rgba(34,197,94,0.03)' : 'transparent',
                  transition: 'background 0.2s',
                }}
              >
                <StatusDot online={isOnline} />

                {/* Avatar */}
                <div style={{
                  width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                  background: isOnline ? 'rgba(34,197,94,0.12)' : 'var(--bg-hover)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 14,
                  color: isOnline ? '#22c55e' : 'var(--text-muted)',
                  border: `1px solid ${isOnline ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
                }}>
                  {(emp.name || '?')[0].toUpperCase()}
                </div>

                {/* Name + MAC */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>{emp.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {formatMac(emp.macAddress)}
                    </span>
                    {emp.session && typeof emp.session.totalSeconds === 'number' && emp.session.totalSeconds > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 800,
                        color: 'var(--accent-purple)',
                        background: 'rgba(123,61,255,0.08)',
                        padding: '2px 8px', borderRadius: 8,
                        display: 'inline-flex', alignItems: 'center', gap: 4
                      }}>
                        <Clock size={10} /> В сети сегодня: {formatDuration(emp.session.totalSeconds)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status / time */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {isOnline ? (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 900, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ОНЛАЙН</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', marginTop: 2 }}>
                        <Clock size={10} /> {arrivedStr ? `Пришёл в ${arrivedStr}` : 'Только что'}
                      </div>
                    </>
                  ) : arrivedStr ? (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>ОФФЛАЙН</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', marginTop: 2 }}>
                        <Clock size={10} /> Пришёл в {arrivedStr}
                      </div>
                      {leftStr && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#f97316', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', marginTop: 2 }}>
                          <Clock size={10} /> Ушёл в {leftStr}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>ОФФЛАЙН</div>
                      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', marginTop: 2, opacity: 0.6 }}>
                        Ещё не приходил
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => handleEdit(emp)} style={{ padding: 8, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                    <Edit3 size={13} />
                  </button>
                  <button onClick={() => handleDelete(emp)} style={{ padding: 8, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', cursor: 'pointer', color: '#ef4444', display: 'flex' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Download agent card ── */}
      <div style={{
        marginTop: 20, padding: '20px 24px',
        background: 'linear-gradient(135deg, rgba(123,61,255,0.1), rgba(123,61,255,0.03))',
        border: '1px solid rgba(123,61,255,0.25)', borderRadius: 20,
        display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🖥️ Агент для сканирования сети
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8, fontWeight: 500, marginBottom: 12 }}>
            Скачайте агент и запустите его на компьютере в клубе:<br />
            <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>1.</span> Скачать файл ниже<br />
            <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>2.</span> Установить Node.js с <strong>nodejs.org</strong><br />
            <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>3.</span> Открыть терминал в папке с файлом<br />
            <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>4.</span> Запустить: <code style={{ background: 'var(--bg-hover)', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>npm install firebase && node wifi-agent.mjs</code>
          </div>
          <a
            href="/wifi-agent.mjs"
            download="wifi-agent.mjs"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 20px', borderRadius: 12,
              background: 'var(--accent-purple)', color: '#fff',
              fontWeight: 900, fontSize: 12, textDecoration: 'none',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              boxShadow: '0 4px 16px rgba(123,61,255,0.3)',
              transition: 'opacity 0.2s',
            }}
            onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
            onMouseOut={e => e.currentTarget.style.opacity = '1'}
          >
            ⬇ Скачать wifi-agent.mjs
          </a>
        </div>
      </div>


      {/* ── Add / Edit Modal ── */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 24, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 40px 80px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                {editingEmp ? 'Изменить' : 'Новый сотрудник'}
              </h2>
              <button onClick={handleCloseModal} style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Имя сотрудника
                </label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Например: Диас"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  MAC-адрес телефона / устройства
                </label>
                <input
                  value={formMac}
                  onChange={e => setFormMac(e.target.value)}
                  placeholder="AA:BB:CC:DD:EE:FF"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontWeight: 500, lineHeight: 1.5 }}>
                  Android: Настройки → О телефоне → MAC-адрес WiFi<br />
                  iPhone: Настройки → Wi-Fi → (i) → отключить «Частный адрес»
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formMac.trim()}
                style={{
                  padding: '14px', borderRadius: 14, border: 'none',
                  background: saving || !formName.trim() || !formMac.trim() ? 'var(--bg-hover)' : 'var(--accent-purple)',
                  color: saving || !formName.trim() || !formMac.trim() ? 'var(--text-muted)' : '#fff',
                  fontWeight: 900, fontSize: 13, cursor: saving ? 'wait' : 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Check size={16} /> {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
};

export default AttendancePage;
