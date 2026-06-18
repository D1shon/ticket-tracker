import React, { useState, useEffect, useMemo } from 'react';
import { Heart, Plus, Trash2, ChevronDown, CheckCircle2, Wrench, AlertTriangle } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'];

const STATUS_OPTIONS = [
  { value: 'working',  label: 'Работает',  color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: CheckCircle2 },
  { value: 'broken',   label: 'Сломан',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Wrench },
  { value: 'lost',     label: 'Потерян',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: AlertTriangle },
];

const getStatus = (v) => STATUS_OPTIONS.find(s => s.value === v) || STATUS_OPTIONS[0];

const HRMonitorsPage = () => {
  const { user } = useTickets();
  const isChef = user?.role === 'chef';
  const isAdmin = user?.role === 'admin';
  const userClub = user?.club || null;

  const [activeClub, setActiveClub] = useState(userClub || 'COLIBRI');
  const [monitors, setMonitors] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null); // docId of open dropdown
  const [newId, setNewId] = useState('');
  const [adding, setAdding] = useState(false);

  // Real-time snapshot for active club
  useEffect(() => {
    const q = query(
      collection(db, 'hr_monitors'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setMonitors(
        snap.docs
          .map(d => ({ docId: d.id, ...d.data() }))
          .filter(m => m.club === activeClub)
      );
    });
    return () => unsub();
  }, [activeClub]);

  // Close dropdown on outside click
  useEffect(() => {
    const handle = () => setOpenDropdown(null);
    document.addEventListener('click', handle);
    return () => document.removeEventListener('click', handle);
  }, []);

  const canEdit = isChef || (!isAdmin && user?.role === 'manager');

  const handleAdd = async () => {
    const trimmed = newId.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await addDoc(collection(db, 'hr_monitors'), {
        monitorId: trimmed,
        club: activeClub,
        status: 'working',
        lostAt: null,
        createdAt: serverTimestamp(),
      });
      setNewId('');
    } finally {
      setAdding(false);
    }
  };

  const handleStatusChange = async (docId, newStatus) => {
    const ref = doc(db, 'hr_monitors', docId);
    await updateDoc(ref, {
      status: newStatus,
      lostAt: newStatus === 'lost' ? new Date().toISOString() : null,
    });
    setOpenDropdown(null);
  };

  const handleDelete = async (docId) => {
    await deleteDoc(doc(db, 'hr_monitors', docId));
  };

  const stats = useMemo(() => ({
    total:   monitors.length,
    working: monitors.filter(m => m.status === 'working').length,
    broken:  monitors.filter(m => m.status === 'broken').length,
    lost:    monitors.filter(m => m.status === 'lost').length,
  }), [monitors]);

  const visibleClubs = isChef ? CLUBS : [userClub].filter(Boolean);

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Heart size={20} style={{ color: '#ef4444' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
              Пульсометры
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>
              Учёт и статусы пульсометров клуба
            </p>
          </div>
        </div>

        {/* Club tabs */}
        {visibleClubs.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {visibleClubs.map(club => (
              <button
                key={club}
                onClick={() => setActiveClub(club)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 10,
                  border: '1px solid ' + (activeClub === club ? 'var(--accent-purple)' : 'var(--border)'),
                  background: activeClub === club ? 'var(--accent-purple)' : 'transparent',
                  color: activeClub === club ? '#fff' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}
              >
                {club}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Всего', value: stats.total, color: 'var(--accent-purple)', bg: 'rgba(123,61,255,0.08)' },
          { label: 'Работает', value: stats.working, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { label: 'Сломан', value: stats.broken, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
          { label: 'Потерян', value: stats.lost, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 12, padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: s.color, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Add row */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
              padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none',
              width: 220, fontWeight: 600
            }}
            placeholder="ID пульсометра..."
            value={newId}
            onChange={e => setNewId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newId.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 12, border: 'none',
              background: 'var(--accent-purple)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              opacity: adding || !newId.trim() ? 0.5 : 1
            }}
          >
            <Plus size={15} /> Добавить
          </button>
        </div>
      )}

      {/* Table */}
      {monitors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
          Пульсометры ещё не добавлены
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 40px', gap: 12, padding: '0 4px', marginBottom: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>ID пульсометра</span>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Статус</span>
            <span />
          </div>

          {monitors.map(monitor => {
            const st = getStatus(monitor.status);
            const Icon = st.icon;
            const isOpen = openDropdown === monitor.docId;

            return (
              <div
                key={monitor.docId}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 180px 40px', gap: 12, alignItems: 'center',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: '12px 16px'
                }}
              >
                {/* ID */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                    {monitor.monitorId}
                  </span>
                  {monitor.status === 'lost' && monitor.lostAt && (
                    <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, opacity: 0.8 }}>
                      Утерян: {format(new Date(monitor.lostAt), 'd MMM yyyy, HH:mm', { locale: ru })}
                    </span>
                  )}
                </div>

                {/* Status dropdown */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={e => { e.stopPropagation(); setOpenDropdown(isOpen ? null : monitor.docId); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 12px', borderRadius: 10,
                      background: st.bg, border: `1px solid ${st.color}40`,
                      color: st.color, cursor: canEdit ? 'pointer' : 'default',
                      fontSize: 13, fontWeight: 700
                    }}
                  >
                    <Icon size={14} strokeWidth={2.5} />
                    <span style={{ flex: 1, textAlign: 'left' }}>{st.label}</span>
                    {canEdit && <ChevronDown size={13} style={{ opacity: 0.7, transform: isOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />}
                  </button>

                  {isOpen && canEdit && (
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 12, overflow: 'hidden', zIndex: 50,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
                      }}
                    >
                      {STATUS_OPTIONS.map(opt => {
                        const OptIcon = opt.icon;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => handleStatusChange(monitor.docId, opt.value)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                              padding: '11px 14px', background: monitor.status === opt.value ? opt.bg : 'transparent',
                              border: 'none', color: opt.color, fontSize: 13, fontWeight: 700,
                              cursor: 'pointer', textAlign: 'left',
                              borderBottom: opt.value !== 'lost' ? '1px solid var(--border)' : 'none'
                            }}
                          >
                            <OptIcon size={14} strokeWidth={2.5} />
                            {opt.label}
                            {monitor.status === opt.value && (
                              <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Delete */}
                {canEdit && (
                  <button
                    onClick={() => handleDelete(monitor.docId)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Trash2 size={15} />
                  </button>
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
