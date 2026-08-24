import React, { useState, useEffect, useCallback } from 'react';
import { Share2, RefreshCw, ClipboardList } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { format, subDays } from 'date-fns';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];

const isWorkingShiftVal = (val) => {
  if (!val) return false;
  const clean = String(val).trim().toLowerCase();
  if (!clean || clean === '—' || clean === '-' || clean === 'x' || clean === 'х') return false;
  const off = ['выходной', 'вых', 'в', 'отпуск', 'отп', 'о', 'больничный', 'бол', 'б', 'off', 'vacation', 'sick'];
  return !off.some(k => clean === k || clean.startsWith(k + '.') || clean.startsWith(k + ' '));
};

// "8:30-14:30" → { start, end } in minutes; null for non-time values
const parseShiftRange = (val) => {
  const m = String(val).trim().match(/^(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  return { start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4] };
};

// Morning crew: shift starts before 12:00. Evening crew: shift ends 18:00+
// (or overnight). Full-day shifts fall into both. Unparsable values → both.
const worksMorning = (val) => {
  const r = parseShiftRange(val);
  return r ? r.start < 720 : true;
};
const worksEvening = (val) => {
  const r = parseShiftRange(val);
  return r ? (r.end >= 1080 || r.end < r.start) : true;
};

const ShiftReportPage = () => {
  const { user } = useTickets();
  const isChef = user?.role === 'chef';
  const userClub = user?.club || null;

  const [activeClub, setActiveClub] = useState(userClub || '4YOU');
  const [reportType, setReportType] = useState('open'); // 'open' | 'close'
  const [guardName, setGuardName]   = useState('');
  const [data, setData]             = useState(null); // { names, clean, monitors }
  const [loading, setLoading]       = useState(true);

  const loadData = useCallback(async (club) => {
    setLoading(true);
    setData(null);
    try {
      const today = new Date();
      const monthKey = format(today, 'yyyy-MM');
      const dayNum = String(today.getDate());
      const todayStr = format(today, 'yyyy-MM-dd');
      const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd');

      // 1. Who is on shift today (per schedule)
      const empSnap = await getDocs(query(collection(db, 'employees'), where('club', '==', club), where('monthKey', '==', monthKey)));
      const empMap = {};
      empSnap.docs.forEach(d => {
        const e = d.data();
        const n = (e.name || '').toLowerCase();
        if (e.isService || n.includes('сервис') || n.includes('техник') || !e.name) return;
        empMap[d.id] = e.name;
      });
      const schedSnap = await getDocs(query(collection(db, 'schedules'), where('monthKey', '==', monthKey)));
      const morning = [];
      const evening = [];
      schedSnap.docs.forEach(d => {
        const s = d.data();
        const name = empMap[s.employeeId];
        if (!name) return;
        const val = s.days?.[dayNum];
        if (!isWorkingShiftVal(val)) return;
        if (worksMorning(val)) morning.push(name);
        if (worksEvening(val)) evening.push(name);
      });

      // 2. Towels for today
      const towelId = (dStr) => `${dStr}_${club.replace(/\s+/g, '_')}`;
      const [tToday, tYest] = await Promise.all([
        getDoc(doc(db, 'towel_records', towelId(todayStr))),
        getDoc(doc(db, 'towel_records', towelId(yesterdayStr))),
      ]);
      const td = tToday.exists() ? tToday.data() : {};
      const yd = tYest.exists() ? tYest.data() : {};
      const carry = yd.actualCount ?? null;
      const clean = td.cleanTotalManual
        ?? (carry != null ? carry + (td.cleanReceived ?? 0) : (td.cleanReceived ?? null));

      // 3. Working HR monitors count
      const monSnap = await getDocs(query(collection(db, 'hr_monitors'), where('club', '==', club)));
      const monitors = monSnap.docs.filter(d => (d.data().status || 'working') === 'working').length;

      setData({
        namesMorning: [...new Set(morning)],
        namesEvening: [...new Set(evening)],
        clean,                                  // чистых на утро
        received: td.cleanReceived ?? null,     // получено сегодня
        remaining: td.actualCount ?? null,      // осталось (фактический пересчёт)
        dirty: td.dirtyTotal ?? null,           // грязных
        monitors,
      });
    } catch (e) {
      console.error('[shift report]', e);
      setData({ names: [], clean: null, monitors: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(activeClub); }, [activeClub, loadData]);

  const reportText = () => {
    const d = data || {};
    const names = reportType === 'open' ? d.namesMorning : d.namesEvening;
    const lines = [
      reportType === 'open' ? 'Смена открыта' : 'Смена закрыта',
      (names && names.length) ? names.join('/') : '—',
    ];
    if (reportType === 'open') {
      lines.push(`Чистых: ${d.clean ?? '—'}`);
      lines.push(`Получено: ${d.received ?? '—'}`);
    } else {
      lines.push(`Осталось: ${d.remaining ?? '—'}`);
      lines.push(`Грязных: ${d.dirty ?? '—'}`);
    }
    lines.push(`Пульсометры ${d.monitors ?? '—'}`);
    lines.push(`Охранник: ${guardName.trim()}`);
    return lines.join('\n');
  };

  const sendToWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(reportText())}`, '_blank');
  };

  const visibleClubs = isChef ? CLUBS : [userClub].filter(Boolean);

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520, margin: '0 auto', paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(37,211,102,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ClipboardList size={20} style={{ color: '#25D366' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Отчёт за смену</h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Готовое сообщение для группы WhatsApp</p>
        </div>
      </div>

      {/* Club tabs (chef only) */}
      {visibleClubs.length > 1 && (
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
      )}

      {/* Open / Close toggle */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[['open', '🌅 Смена открыта'], ['close', '🌙 Смена закрыта']].map(([id, label]) => (
          <button key={id} onClick={() => setReportType(id)} style={{
            flex: 1, padding: '13px', borderRadius: 14, fontSize: 13, fontWeight: 800, cursor: 'pointer',
            border: '1px solid ' + (reportType === id ? 'var(--accent-purple)' : 'var(--border)'),
            background: reportType === id ? 'var(--accent-purple)' : 'var(--bg-card)',
            color: reportType === id ? '#fff' : 'var(--text-muted)',
          }}>{label}</button>
        ))}
      </div>

      {/* Guard name */}
      <input
        placeholder="Охранник (имя)…"
        value={guardName}
        onChange={e => setGuardName(e.target.value)}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '13px 16px', fontSize: 15, color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }}
      />

      {/* Preview */}
      <div style={{ position: 'relative', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
        {loading ? 'Собираю данные из платформы…' : reportText()}
        <button
          onClick={() => loadData(activeClub)}
          title="Обновить данные"
          style={{ position: 'absolute', top: 10, right: 10, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: 7, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 0 }}
        >
          <RefreshCw size={13} style={loading ? { animation: 'spin 0.8s linear infinite' } : undefined} />
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.6 }}>
        Смена — из графика на сегодня · Чистых — из учёта полотенец · Пульсометры — рабочие из вкладки пульсометров
      </div>

      {/* Send */}
      <button
        onClick={sendToWhatsApp}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '15px', borderRadius: 16, border: 'none',
          background: '#25D366', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
          opacity: loading ? 0.5 : 1,
          boxShadow: '0 6px 20px rgba(37,211,102,0.3)',
        }}
      >
        <Share2 size={17} /> Отправить в WhatsApp
      </button>
    </div>
  );
};

export default ShiftReportPage;
