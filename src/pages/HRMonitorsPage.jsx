import React, { useState, useEffect, useMemo } from 'react';
import { Heart, Plus, Trash2, ChevronDown, CheckCircle2, Wrench, AlertTriangle, History, ArrowRight } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, where, getDocs
} from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'];

const STATUS_OPTIONS = [
  { value: 'working', label: 'Работает', color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: CheckCircle2 },
  { value: 'broken',  label: 'Сломан',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Wrench },
  { value: 'lost',    label: 'Потерян',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: AlertTriangle },
];

const getStatus = (v) => STATUS_OPTIONS.find(s => s.value === v) || STATUS_OPTIONS[0];

const isWorkingShiftVal = (val) => {
  if (!val) return false;
  const clean = String(val).trim().toLowerCase();
  if (!clean || clean === '—' || clean === '-' || clean === 'x' || clean === 'х') return false;
  const off = ['выходной', 'вых', 'в', 'отпуск', 'отп', 'о', 'больничный', 'бол', 'б', 'off', 'vacation', 'sick'];
  return !off.some(k => clean === k || clean.startsWith(k + '.') || clean.startsWith(k + ' '));
};

const getCurrentShiftName = (date) => {
  const total = date.getHours() * 60 + date.getMinutes();
  const isWeekend = [0, 6].includes(date.getDay());
  if (isWeekend) {
    if (total >= 540 && total < 840)  return 'Утренняя смена (9:00)';
    if (total >= 840 && total < 1140) return 'Дневная смена (14:00)';
    return 'Вечерняя смена (19:00)';
  }
  if (total >= 390 && total < 690)  return 'Утренняя смена (6:30)';
  if (total >= 690 && total < 990)  return 'Дневная смена (11:30)';
  if (total >= 990 && total < 1290) return 'Вечерняя смена (16:30)';
  return 'Ночная смена (21:30)';
};

const getAdminsOnShift = async (club, now) => {
  try {
    const monthKey = format(now, 'yyyy-MM');
    const dayNum   = String(now.getDate());

    const empSnap = await getDocs(query(
      collection(db, 'employees'),
      where('club', '==', club),
      where('monthKey', '==', monthKey)
    ));
    const empMap = {};
    empSnap.docs.forEach(d => {
      const e = d.data();
      if (!e.isService) empMap[d.id] = e.name;
    });
    if (!Object.keys(empMap).length) return [];

    const schedSnap = await getDocs(query(
      collection(db, 'schedules'),
      where('monthKey', '==', monthKey)
    ));
    const working = [];
    schedSnap.docs.forEach(d => {
      const data = d.data();
      if (!empMap[data.employeeId]) return;
      if (isWorkingShiftVal(data.days?.[dayNum])) working.push(empMap[data.employeeId]);
    });
    return [...new Set(working)];
  } catch {
    return [];
  }
};

const HRMonitorsPage = () => {
  const { user } = useTickets();
  const isChef    = user?.role === 'chef';
  const isAdmin   = user?.role === 'admin';
  const userClub  = user?.club || null;

  const [activeTab,    setActiveTab]    = useState('monitors'); // 'monitors' | 'history'
  const [activeClub,   setActiveClub]   = useState(userClub || 'COLIBRI');
  const [monitors,     setMonitors]     = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [newId,        setNewId]        = useState('');
  const [adding,       setAdding]       = useState(false);

  useEffect(() => {
    // filter client-side to avoid composite index requirement
    return onSnapshot(collection(db, 'hr_monitors'), snap => {
      setMonitors(
        snap.docs
          .map(d => ({ docId: d.id, ...d.data() }))
          .filter(m => m.club === activeClub)
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
      );
    }, err => console.error('[hr_monitors]', err));
  }, [activeClub]);

  useEffect(() => {
    // only filter by club — no orderBy — avoids composite index
    const q = query(
      collection(db, 'hr_monitor_history'),
      where('club', '==', activeClub)
    );
    return onSnapshot(q, snap => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.changedAt?.seconds ?? (a.changedAtISO ? new Date(a.changedAtISO).getTime() / 1000 : 0);
          const tb = b.changedAt?.seconds ?? (b.changedAtISO ? new Date(b.changedAtISO).getTime() / 1000 : 0);
          return tb - ta;
        });
      setHistoryItems(items);
    }, err => console.error('[hr_monitor_history]', err));
  }, [activeClub]);

  useEffect(() => {
    const close = () => setOpenDropdown(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const canEdit = isChef || (!isAdmin && user?.role === 'manager');
  const visibleClubs = isChef ? CLUBS : [userClub].filter(Boolean);

  const stats = useMemo(() => ({
    total:   monitors.length,
    working: monitors.filter(m => m.status === 'working').length,
    broken:  monitors.filter(m => m.status === 'broken').length,
    lost:    monitors.filter(m => m.status === 'lost').length,
  }), [monitors]);

  const handleAdd = async () => {
    const trimmed = newId.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await addDoc(collection(db, 'hr_monitors'), {
        monitorId: trimmed, club: activeClub,
        status: 'working', lostAt: null,
        createdAt: serverTimestamp(),
      });
      setNewId('');
    } finally { setAdding(false); }
  };

  const handleStatusChange = async (docId, monitorId, currentStatus, newStatus) => {
    if (currentStatus === newStatus) { setOpenDropdown(null); return; }
    setOpenDropdown(null);
    const now      = new Date();
    const lostAt   = newStatus === 'lost' ? now.toISOString() : null;

    try {
      await updateDoc(doc(db, 'hr_monitors', docId), { status: newStatus, lostAt });
    } catch (e) {
      console.error('[hr_monitors] updateDoc failed:', e);
      return;
    }

    try {
      const shiftName = getCurrentShiftName(now);
      const admins    = await getAdminsOnShift(activeClub, now);
      await addDoc(collection(db, 'hr_monitor_history'), {
        monitorDocId:  docId,
        monitorId,
        club:          activeClub,
        oldStatus:     currentStatus,
        newStatus,
        shiftName,
        adminsOnShift: admins,
        changedAt:     serverTimestamp(),
        changedAtISO:  now.toISOString(),
      });
    } catch (e) {
      console.error('[hr_monitor_history] addDoc failed:', e);
    }
  };

  const handleDelete = async (docId) => {
    await deleteDoc(doc(db, 'hr_monitors', docId));
  };

  // ── shared club/tab bar ──────────────────────────────────────────
  const ClubTabs = () => visibleClubs.length > 1 ? (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {visibleClubs.map(club => (
        <button key={club} onClick={() => setActiveClub(club)} style={{
          padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          border: '1px solid ' + (activeClub === club ? 'var(--accent-purple)' : 'var(--border)'),
          background: activeClub === club ? 'var(--accent-purple)' : 'transparent',
          color: activeClub === club ? '#fff' : 'var(--text-muted)',
        }}>{club}</button>
      ))}
    </div>
  ) : null;

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Heart size={20} style={{ color: '#ef4444' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Пульсометры</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Учёт и статусы пульсометров клуба</p>
          </div>
        </div>
        <ClubTabs />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {[
          { id: 'monitors', label: 'Пульсометры', icon: Heart },
          { id: 'history',  label: 'История',     icon: History },
        ].map(tab => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 10, fontSize: 13, fontWeight: active ? 800 : 600,
              cursor: 'pointer', border: '1px solid ' + (active ? 'var(--accent-purple)' : 'var(--border)'),
              background: active ? 'var(--accent-purple)' : 'transparent',
              color: active ? '#fff' : 'var(--text-muted)',
            }}>
              <tab.icon size={14} />
              {tab.label}
              {tab.id === 'history' && historyItems.length > 0 && (
                <span style={{ background: active ? 'rgba(255,255,255,0.25)' : 'var(--border)', borderRadius: 8, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>
                  {historyItems.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── MONITORS TAB ── */}
      {activeTab === 'monitors' && (<>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Всего',    value: stats.total,   color: 'var(--accent-purple)', bg: 'rgba(123,61,255,0.08)' },
            { label: 'Работает', value: stats.working, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
            { label: 'Сломан',   value: stats.broken,  color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
            { label: 'Потерян',  value: stats.lost,    color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 12, padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 76 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: s.color, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Add */}
        {canEdit && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', width: 220, fontWeight: 600 }}
              placeholder="ID пульсометра..."
              value={newId}
              onChange={e => setNewId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button onClick={handleAdd} disabled={adding || !newId.trim()} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, border: 'none',
              background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              opacity: adding || !newId.trim() ? 0.5 : 1,
            }}>
              <Plus size={15} /> Добавить
            </button>
          </div>
        )}

        {/* Grid */}
        {monitors.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
            Пульсометры ещё не добавлены
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {monitors.map(monitor => {
              const st     = getStatus(monitor.status);
              const Icon   = st.icon;
              const isOpen = openDropdown === monitor.docId;
              return (
                <div key={monitor.docId} style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${monitor.status !== 'working' ? st.color + '40' : 'var(--border)'}`,
                  borderRadius: 14, padding: '12px 14px',
                  display: 'flex', flexDirection: 'column', gap: 8, position: 'relative',
                }}>
                  {canEdit && (
                    <button onClick={() => handleDelete(monitor.docId)} style={{
                      position: 'absolute', top: 8, right: 8, background: 'none', border: 'none',
                      color: 'var(--text-muted)', cursor: 'pointer', padding: 2, borderRadius: 6, opacity: 0.4, lineHeight: 0,
                    }}><Trash2 size={12} /></button>
                  )}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', paddingRight: 16 }}>{monitor.monitorId}</div>
                    {monitor.status === 'lost' && monitor.lostAt && (
                      <div style={{ fontSize: 9, color: '#ef4444', fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
                        {format(new Date(monitor.lostAt), 'd MMM yyyy, HH:mm', { locale: ru })}
                      </div>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={e => { e.stopPropagation(); setOpenDropdown(isOpen ? null : monitor.docId); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 9px', borderRadius: 8,
                        background: st.bg, border: `1px solid ${st.color}40`,
                        color: st.color, cursor: canEdit ? 'pointer' : 'default', fontSize: 11, fontWeight: 700,
                      }}
                    >
                      <Icon size={11} strokeWidth={2.5} />
                      <span style={{ flex: 1, textAlign: 'left' }}>{st.label}</span>
                      {canEdit && <ChevronDown size={10} style={{ opacity: 0.7, transform: isOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />}
                    </button>
                    {isOpen && canEdit && (
                      <div onClick={e => e.stopPropagation()} style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 10, overflow: 'hidden', zIndex: 50,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                      }}>
                        {STATUS_OPTIONS.map(opt => {
                          const OptIcon = opt.icon;
                          return (
                            <button key={opt.value}
                              onClick={() => handleStatusChange(monitor.docId, monitor.monitorId, monitor.status, opt.value)}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                                background: monitor.status === opt.value ? opt.bg : 'transparent',
                                border: 'none', color: opt.color, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                borderBottom: opt.value !== 'lost' ? '1px solid var(--border)' : 'none',
                              }}
                            >
                              <OptIcon size={12} strokeWidth={2.5} />
                              {opt.label}
                              {monitor.status === opt.value && <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.5 }}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>)}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {historyItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
              История изменений пуста
            </div>
          ) : historyItems.map(entry => {
            const oldSt = getStatus(entry.oldStatus);
            const newSt = getStatus(entry.newStatus);
            const OldIcon = oldSt.icon;
            const NewIcon = newSt.icon;
            const dateStr = entry.changedAtISO
              ? format(new Date(entry.changedAtISO), 'd MMMM yyyy, HH:mm', { locale: ru })
              : '—';

            return (
              <div key={entry.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 16, padding: '14px 18px',
                borderLeft: `3px solid ${newSt.color}`,
              }}>
                {/* Top row: monitor ID + transition */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>{entry.monitorId}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: oldSt.color, background: oldSt.bg, padding: '3px 8px', borderRadius: 6 }}>
                      <OldIcon size={10} strokeWidth={2.5} />{oldSt.label}
                    </span>
                    <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: newSt.color, background: newSt.bg, padding: '3px 8px', borderRadius: 6 }}>
                      <NewIcon size={10} strokeWidth={2.5} />{newSt.label}
                    </span>
                  </div>
                </div>

                {/* Date + shift */}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
                  {dateStr} · <span style={{ color: 'var(--accent-purple)' }}>{entry.shiftName}</span>
                </div>

                {/* Admins */}
                {entry.adminsOnShift && entry.adminsOnShift.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Работали:
                    </span>
                    {entry.adminsOnShift.map((name, i) => (
                      <span key={i} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 6 }}>
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Данные о смене не найдены
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HRMonitorsPage;
