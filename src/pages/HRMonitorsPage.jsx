import React, { useState, useEffect, useMemo } from 'react';
import { Heart, Plus, Trash2, ChevronDown, CheckCircle2, Wrench, AlertTriangle, History, ArrowRight, Pencil, Check, X, Activity, LogIn, Eye, Timer } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, where, getDocs
} from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

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
    const empSnap = await getDocs(query(collection(db, 'employees'), where('club', '==', club), where('monthKey', '==', monthKey)));
    const empMap = {};
    empSnap.docs.forEach(d => { const e = d.data(); if (!e.isService) empMap[d.id] = e.name; });
    if (!Object.keys(empMap).length) return [];
    const schedSnap = await getDocs(query(collection(db, 'schedules'), where('monthKey', '==', monthKey)));
    const working = [];
    schedSnap.docs.forEach(d => {
      const data = d.data();
      if (!empMap[data.employeeId]) return;
      if (isWorkingShiftVal(data.days?.[dayNum])) working.push(empMap[data.employeeId]);
    });
    return [...new Set(working)];
  } catch { return []; }
};

// Returns [{ name, shiftTime }] sorted by shift start time
const getEmployeesWithShifts = async (club, date) => {
  try {
    const monthKey = format(date, 'yyyy-MM');
    const dayNum   = String(date.getDate());

    const empSnap = await getDocs(query(
      collection(db, 'employees'),
      where('club', '==', club),
      where('monthKey', '==', monthKey)
    ));
    const empMap = {};
    empSnap.docs.forEach(d => {
      const e = d.data();
      if (!e.isService && e.name) empMap[d.id] = e.name;
    });
    if (!Object.keys(empMap).length) return [];

    const schedSnap = await getDocs(query(
      collection(db, 'schedules'),
      where('monthKey', '==', monthKey)
    ));

    const seen = new Set();
    const result = [];
    schedSnap.docs.forEach(d => {
      const data = d.data();
      const name = empMap[data.employeeId];
      if (!name) return;
      const val = data.days?.[dayNum];
      if (!isWorkingShiftVal(val)) return;
      if (seen.has(name)) return;
      seen.add(name);
      result.push({ name, shiftTime: String(val).trim() });
    });

    // Sort by parsed time (HH:MM or H:MM)
    result.sort((a, b) => {
      const toMins = t => {
        const [h, m] = (t || '').split(':').map(Number);
        return isNaN(h) ? 9999 : h * 60 + (m || 0);
      };
      return toMins(a.shiftTime) - toMins(b.shiftTime);
    });

    return result;
  } catch { return []; }
};

const HRMonitorsPage = () => {
  const { user } = useTickets();
  const isChef    = user?.role === 'chef' || user?.role === 'viewer';
  const isAdmin   = user?.role === 'admin';
  const userClub  = user?.club || null;

  const [activeTab,      setActiveTab]      = useState('monitors'); // 'monitors' | 'history' | 'activity'
  const [activeClub,     setActiveClub]     = useState(userClub || 'COLIBRI');
  const [monitors,       setMonitors]       = useState([]);
  const [historyItems,   setHistoryItems]   = useState([]);
  const [activityItems,  setActivityItems]  = useState([]);
  const [openDropdown,   setOpenDropdown]   = useState(null);
  const [newId,          setNewId]          = useState('');
  const [adding,         setAdding]         = useState(false);
  const [editingDocId,   setEditingDocId]   = useState(null);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [editValue,      setEditValue]      = useState('');
  const pageVisitLogged  = React.useRef(false);
  const activityDateRef  = React.useRef(null);
  const [shiftEmployees, setShiftEmployees] = useState([]);

  const canSeeActivity = isChef || user?.role === 'manager';
  const todayStr = new Date().toISOString().slice(0, 10);
  const [activityDate, setActivityDate] = useState(todayStr);

  useEffect(() => {
    // filter client-side to avoid composite index requirement
    return onSnapshot(collection(db, 'hr_monitors'), snap => {
      setMonitors(
        snap.docs
          .map(d => ({ docId: d.id, ...d.data() }))
          .filter(m => m.club === activeClub)
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
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

  // Log page visit for admin accounts (once per mount)
  useEffect(() => {
    if (!isAdmin || pageVisitLogged.current) return;
    pageVisitLogged.current = true;
    const now = new Date();
    addDoc(collection(db, 'hr_monitor_activity'), {
      type:         'page_visit',
      adminEmail:   user.email,
      adminName:    user.displayName,
      club:         user.club,
      date:         now.toISOString().slice(0, 10),
      timestampISO: now.toISOString(),
    }).catch(() => {});
  }, [isAdmin, user]);

  // Load activity log for chef/manager
  useEffect(() => {
    if (!canSeeActivity) return;
    const q = query(
      collection(db, 'hr_monitor_activity'),
      where('club', '==', isChef ? activeClub : userClub)
    );
    return onSnapshot(q, snap => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => new Date(b.timestampISO) - new Date(a.timestampISO));
      setActivityItems(items);
    }, err => console.error('[hr_monitor_activity]', err));
  }, [canSeeActivity, activeClub, isChef, userClub]);

  // Fetch employees on shift (with times) for the selected activity date
  useEffect(() => {
    if (!canSeeActivity) return;
    const club = isChef ? activeClub : userClub;
    if (!club) return;
    const [y, m, d] = activityDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0);
    getEmployeesWithShifts(club, dateObj).then(setShiftEmployees);
  }, [canSeeActivity, activityDate, activeClub, isChef, userClub]);

  useEffect(() => {
    const close = () => setOpenDropdown(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const canEdit = isChef || isAdmin || user?.role === 'manager';
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
      toast.success(`Пульсометр "${trimmed}" добавлен`);
    } catch (e) {
      console.error('[hr_monitors] addDoc failed:', e);
      toast.error('Не удалось добавить пульсометр: ' + (e?.message || e));
    } finally {
      setAdding(false);
    }
  };

  const handleEditStart = (monitor) => {
    setEditingDocId(monitor.docId);
    setEditValue(monitor.monitorId);
    setOpenDropdown(null);
  };

  const handleEditSave = async () => {
    const trimmed = editValue.trim();
    if (!trimmed) { setEditingDocId(null); return; }
    try {
      await updateDoc(doc(db, 'hr_monitors', editingDocId), { monitorId: trimmed });
      toast.success('ID обновлён');
    } catch (e) {
      console.error('[hr_monitors] updateDoc (rename) failed:', e);
      toast.error('Не удалось сохранить: ' + (e?.message || e));
    } finally {
      setEditingDocId(null);
    }
  };

  const handleStatusChange = async (docId, monitorId, currentStatus, newStatus) => {
    if (currentStatus === newStatus) { setOpenDropdown(null); return; }
    setOpenDropdown(null);
    const now       = new Date();
    const lostAt    = newStatus === 'lost'   ? now.toISOString() : null;
    const brokenAt  = newStatus === 'broken' ? now.toISOString() : null;

    try {
      await updateDoc(doc(db, 'hr_monitors', docId), { status: newStatus, lostAt, brokenAt });
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

  const handleCheck = async (docId) => {
    const now = new Date();
    try {
      await updateDoc(doc(db, 'hr_monitors', docId), {
        lastCheckedDate: todayStr,
        lastCheckedAt:   now.toISOString(),
      });

      // If all OTHER monitors are already checked today → this was the last one
      const others = monitors.filter(m => m.docId !== docId);
      const allOthersDone = others.every(m => m.lastCheckedDate === todayStr);

      if (allOthersDone) {
        // Compute duration from earliest lastCheckedAt today
        const times = others
          .filter(m => m.lastCheckedDate === todayStr && m.lastCheckedAt)
          .map(m => m.lastCheckedAt);
        times.push(now.toISOString());

        const earliest  = times.reduce((min, t) => (t < min ? t : min));
        const durMs     = now.getTime() - new Date(earliest).getTime();
        const durMin    = Math.floor(durMs / 60000);
        const durSec    = Math.floor((durMs % 60000) / 1000);
        const durText   = durMin > 0 ? `${durMin} мин ${durSec} сек` : `${durSec} сек`;

        await addDoc(collection(db, 'hr_monitor_activity'), {
          type:          'check_complete',
          club:          activeClub,
          date:          todayStr,
          timestampISO:  now.toISOString(),
          adminName:     user.displayName,
          adminEmail:    user.email,
          durationMs:    durMs,
          durationText:  durText,
          totalMonitors: monitors.length,
        });
      }
    } catch (e) {
      toast.error('Ошибка при сохранении');
    }
  };

  const handleDeleteHistory = async (entryId) => {
    try {
      await deleteDoc(doc(db, 'hr_monitor_history', entryId));
    } catch (e) {
      console.error('[hr_monitor_history] deleteDoc failed:', e);
      toast.error('Не удалось удалить запись');
    }
  };

  const canDeleteHistory = isChef || user?.role === 'manager';

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
          ...( !isAdmin ? [{ id: 'history',  label: 'История',    icon: History }] : [] ),
          ...( canSeeActivity ? [{ id: 'activity', label: 'Активность', icon: Activity }] : [] ),
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

        {/* Search */}
        <div style={{ position: 'relative', maxWidth: 260 }}>
          <input
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '9px 14px 9px 36px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', width: '100%', fontWeight: 600 }}
            placeholder="Поиск по ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
              <X size={13} />
            </button>
          )}
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
        {(() => {
          const filtered = searchQuery.trim()
            ? monitors.filter(m => m.monitorId?.toLowerCase().includes(searchQuery.trim().toLowerCase()))
            : monitors;
          if (monitors.length === 0) return (
            <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
              Пульсометры ещё не добавлены
            </div>
          );
          if (filtered.length === 0) return (
            <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
              Ничего не найдено по запросу «{searchQuery}»
            </div>
          );
          const checkedCount = monitors.filter(m => m.lastCheckedDate === todayStr).length;
          const totalCount   = monitors.length;
          return (
          <>
          {totalCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Проверено сегодня:</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: checkedCount === totalCount ? '#10b981' : '#f59e0b', minWidth: 36 }}>
                {checkedCount}/{totalCount}
              </span>
              <div style={{ flex: 1, height: 5, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(checkedCount / totalCount) * 100}%`, height: '100%', background: checkedCount === totalCount ? '#10b981' : '#f59e0b', borderRadius: 4, transition: 'width 0.4s' }} />
              </div>
              {checkedCount === totalCount && (
                <span style={{ fontSize: 11, fontWeight: 800, color: '#10b981', whiteSpace: 'nowrap' }}>✓ Все!</span>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {filtered.map(monitor => {
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
                  {canEdit && editingDocId !== monitor.docId && (
                    <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                      <button onClick={() => handleEditStart(monitor)} style={{
                        background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, borderRadius: 6, opacity: 0.4, lineHeight: 0,
                      }}><Pencil size={11} /></button>
                      <button onClick={() => handleDelete(monitor.docId)} style={{
                        background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, borderRadius: 6, opacity: 0.4, lineHeight: 0,
                      }}><Trash2 size={11} /></button>
                    </div>
                  )}
                  <div>
                    {editingDocId === monitor.docId ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleEditSave(); if (e.key === 'Escape') setEditingDocId(null); }}
                          style={{ background: 'var(--bg-hover)', border: '1px solid var(--accent-purple)', borderRadius: 7, padding: '3px 7px', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', outline: 'none', width: '100%' }}
                        />
                        <button onClick={handleEditSave} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: 2, lineHeight: 0 }}><Check size={14} /></button>
                        <button onClick={() => setEditingDocId(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2, lineHeight: 0 }}><X size={14} /></button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', paddingRight: canEdit ? 36 : 0 }}>{monitor.monitorId}</div>
                    )}
                    {monitor.status === 'lost' && monitor.lostAt && (
                      <div style={{ fontSize: 9, color: '#ef4444', fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
                        с {format(new Date(monitor.lostAt), 'd MMM yyyy, HH:mm', { locale: ru })}
                      </div>
                    )}
                    {monitor.status === 'broken' && monitor.brokenAt && (
                      <div style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
                        с {format(new Date(monitor.brokenAt), 'd MMM yyyy, HH:mm', { locale: ru })}
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
                  {/* Daily check button */}
                  {(() => {
                    const checked = monitor.lastCheckedDate === todayStr;
                    return (
                      <button
                        onClick={() => !checked && canEdit && handleCheck(monitor.docId)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                          padding: '5px 8px', borderRadius: 8, marginTop: 2,
                          background: checked ? 'rgba(16,185,129,0.12)' : 'var(--bg-hover)',
                          border: `1px solid ${checked ? 'rgba(16,185,129,0.35)' : 'var(--border)'}`,
                          color: checked ? '#10b981' : 'var(--text-muted)',
                          cursor: checked || !canEdit ? 'default' : 'pointer',
                          fontSize: 10, fontWeight: 700,
                        }}
                      >
                        <Check size={10} strokeWidth={checked ? 3 : 2} style={{ opacity: checked ? 1 : 0.35 }} />
                        {checked ? 'Проверен' : 'Проверить'}
                      </button>
                    );
                  })()}
                </div>
              );
            })}
          </div>
          </>
          );
        })()}
      </>)}

      {/* ── HISTORY TAB ── (chef + manager only) */}
      {activeTab === 'history' && !isAdmin && (
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
                position: 'relative',
              }}>
                {canDeleteHistory && (
                  <button onClick={() => handleDeleteHistory(entry.id)} style={{
                    position: 'absolute', top: 10, right: 10, background: 'none', border: 'none',
                    color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 6,
                    opacity: 0.4, lineHeight: 0, transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
                  ><Trash2 size={13} /></button>
                )}
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

      {/* ── ACTIVITY TAB ── (chef + manager only) */}
      {activeTab === 'activity' && canSeeActivity && (() => {
        const filteredItems  = activityItems.filter(item => item.date === activityDate);
        const loginCount     = filteredItems.filter(e => e.type === 'login').length;
        const visitCount     = filteredItems.filter(e => e.type === 'page_visit').length;
        const checkCompletes = filteredItems.filter(e => e.type === 'check_complete');
        const isToday = activityDate === todayStr;
        const formattedDate = format(new Date(activityDate + 'T12:00:00'), 'd MMMM yyyy', { locale: ru });

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Date picker row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => setActivityDate(todayStr)}
                style={{
                  padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  border: '1px solid ' + (isToday ? 'var(--accent-purple)' : 'var(--border)'),
                  background: isToday ? 'var(--accent-purple)' : 'transparent',
                  color: isToday ? '#fff' : 'var(--text-muted)',
                }}
              >Сегодня</button>
              <div
                onClick={() => activityDateRef.current?.showPicker?.() ?? activityDateRef.current?.click()}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid ' + (!isToday ? 'var(--accent-purple)' : 'var(--border)'), cursor: 'pointer', userSelect: 'none' }}
              >
                <Activity size={13} style={{ color: !isToday ? 'var(--accent-purple)' : 'var(--text-muted)' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: !isToday ? 'var(--accent-purple)' : 'var(--text-muted)' }}>
                  {isToday ? 'Выбрать дату' : formattedDate}
                </span>
                <input
                  ref={activityDateRef}
                  type="date"
                  value={activityDate}
                  max={todayStr}
                  onChange={e => e.target.value && setActivityDate(e.target.value)}
                  style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
                />
              </div>
              {(loginCount > 0 || visitCount > 0 || checkCompletes.length > 0) && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginLeft: 4 }}>
                  {loginCount > 0 && `${loginCount} вход${loginCount > 1 ? 'а' : ''}`}
                  {loginCount > 0 && visitCount > 0 && ' · '}
                  {visitCount > 0 && `${visitCount} просмотр${visitCount > 1 ? 'а' : ''}`}
                  {(loginCount > 0 || visitCount > 0) && checkCompletes.length > 0 && ' · '}
                  {checkCompletes.length > 0 && `${checkCompletes.length} проверк${checkCompletes.length > 1 ? 'и' : 'а'}`}
                </span>
              )}
            </div>

            {/* Employees on shift grouped by time */}
            {(() => {
              // Group by shiftTime
              const byTime = {};
              shiftEmployees.forEach(({ name, shiftTime }) => {
                if (!byTime[shiftTime]) byTime[shiftTime] = [];
                byTime[shiftTime].push(name);
              });
              const times = Object.keys(byTime); // already sorted from getEmployeesWithShifts
              return (
                <div style={{ background: 'rgba(123,61,255,0.06)', border: '1px solid rgba(123,61,255,0.2)', borderRadius: 14, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Сотрудники в смене · {formattedDate}
                  </div>
                  {shiftEmployees.length === 0 ? (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Нет данных</span>
                  ) : times.map(time => (
                    <div key={time} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{
                        flexShrink: 0, minWidth: 42, fontSize: 13, fontWeight: 900,
                        color: 'var(--accent-purple)', fontVariantNumeric: 'tabular-nums',
                      }}>{time}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {byTime[time].map((name, i) => (
                          <span key={i} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 8 }}>
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
                Активности за {formattedDate} не найдено
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredItems.map(item => {
                  const isLogin = item.type === 'login';
                  const isCheck = item.type === 'check_complete';
                  const Icon    = isLogin ? LogIn : isCheck ? Timer : Eye;
                  const color   = isLogin ? '#10b981' : isCheck ? '#4f8ef7' : '#818cf8';
                  const bg      = isLogin ? 'rgba(16,185,129,0.08)' : isCheck ? 'rgba(79,142,247,0.08)' : 'rgba(129,140,248,0.08)';
                  const label   = isLogin ? 'Вход в систему' : isCheck ? 'Проверка пульсометров' : 'Открыл пульсометры';
                  const timeStr = item.timestampISO
                    ? format(new Date(item.timestampISO), 'HH:mm', { locale: ru })
                    : '—';
                  return (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: bg, border: `1px solid ${color}20`,
                      borderRadius: 12, padding: '10px 14px',
                    }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={13} style={{ color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{item.adminName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                          {label}
                          {isCheck && item.durationText && (
                            <span style={{ marginLeft: 6, color, fontWeight: 800 }}>
                              · за {item.durationText}
                            </span>
                          )}
                          {isCheck && item.totalMonitors && (
                            <span style={{ marginLeft: 4, opacity: 0.6 }}>
                              ({item.totalMonitors} шт.)
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 900, color, flexShrink: 0 }}>{timeStr}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default HRMonitorsPage;
