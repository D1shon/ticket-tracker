import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Shirt, AlertTriangle, Clock, Users } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { pushNotify } from '../lib/pushNotify';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, doc, setDoc, query, where, getDocs,
} from 'firebase/firestore';
import { format, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE'];

// ── Shift helper (same logic as HRMonitorsPage) ───────────────────────────
const isWorkingShiftVal = (val) => {
  if (!val) return false;
  const clean = String(val).trim().toLowerCase();
  return !(!clean || clean === '—' || clean === '-' || clean === 'x' || clean === 'х');
};

const getEmployeesWithShifts = async (club, date) => {
  try {
    const monthKey = format(date, 'yyyy-MM');
    const dayNum   = String(date.getDate());
    const empSnap  = await getDocs(query(
      collection(db, 'employees'),
      where('club', '==', club),
      where('monthKey', '==', monthKey),
    ));
    const empMap = {};
    empSnap.docs.forEach(d => {
      const e = d.data();
      if (!e.isService && e.name) empMap[d.id] = e.name;
    });
    if (!Object.keys(empMap).length) return [];
    const schedSnap = await getDocs(query(
      collection(db, 'schedules'),
      where('monthKey', '==', monthKey),
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
    result.sort((a, b) => {
      const toMins = t => { const [h, m] = (t || '').split(':').map(Number); return isNaN(h) ? 9999 : h * 60 + (m || 0); };
      return toMins(a.shiftTime) - toMins(b.shiftTime);
    });
    return result;
  } catch { return []; }
};

// ── Input style ───────────────────────────────────────────────────────────
const inputSt = (highlight) => ({
  background: 'var(--bg-hover)',
  border: '1px solid ' + (highlight ? '#ef4444' : 'var(--border)'),
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 16,
  fontWeight: 800,
  color: 'var(--text-primary)',
  outline: 'none',
  width: 76,
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
});

// ── Shared bits ────────────────────────────────────────────────────────────
const StatCell = ({ label, value, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 70 }}>
    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'center' }}>{label}</span>
    <span style={{ fontSize: 24, fontWeight: 900, color: color || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
      {value ?? <span style={{ opacity: 0.25, fontWeight: 500, fontSize: 18 }}>—</span>}
    </span>
  </div>
);

const Op = ({ symbol }) => (
  <span style={{ fontSize: 18, color: 'var(--text-muted)', fontWeight: 300, alignSelf: 'flex-end', paddingBottom: 4, opacity: 0.5 }}>{symbol}</span>
);

// Один «поток» учёта (большие или маленькие полотенца): две формулы —
// утро (остаток вчера + получено = всего) и вечер (всего − осталось = грязных)
const TowelFlow = ({ title, prevCarry, canEdit, received, setReceived, totalManual, setTotalManual, actual, setActual, onBlurField }) => {
  const isFirstDay = prevCarry === null;
  const rc  = received    === '' ? null : Number(received);
  const tm  = totalManual === '' ? null : Number(totalManual);
  const ac  = actual      === '' ? null : Number(actual);
  const total = isFirstDay ? (tm ?? rc) : (prevCarry !== null && rc !== null) ? prevCarry + rc : rc;
  const dirty = (total !== null && ac !== null) ? total - ac : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {title && (
        <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 2, borderBottom: '2px solid var(--border)' }}>
          {title}
        </span>
      )}

      {/* Утро */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Утром — запас на день
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {isFirstDay ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 70 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Получено</span>
                {canEdit ? (
                  <input type="number" min="0" value={received}
                    onChange={e => setReceived(e.target.value)}
                    onBlur={e => onBlurField('received', e.target.value)}
                    style={inputSt(false)} />
                ) : <StatCell label="" value={rc} />}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'flex-end', paddingBottom: 6 }}>всего утром:</span>
              {canEdit ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 70 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#4f8ef7', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Всего утром</span>
                  <input type="number" min="0" value={totalManual}
                    onChange={e => setTotalManual(e.target.value)}
                    onBlur={e => onBlurField('totalManual', e.target.value)}
                    style={{ ...inputSt(false), border: '1px solid #4f8ef7' }} />
                </div>
              ) : (
                <StatCell label="Всего утром" value={total} color="#10b981" />
              )}
            </>
          ) : (
            <>
              <StatCell label="Остаток вчера" value={prevCarry} color="#818cf8" />
              <Op symbol="+" />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 70 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Получено</span>
                {canEdit ? (
                  <input type="number" min="0" value={received}
                    onChange={e => setReceived(e.target.value)}
                    onBlur={e => onBlurField('received', e.target.value)}
                    style={inputSt(false)} />
                ) : <StatCell label="" value={rc} />}
              </div>
              <Op symbol="=" />
              <StatCell label="Всего утром" value={total} color="#10b981" />
            </>
          )}
        </div>
      </div>

      {/* Вечер */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Вечером — итог
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <StatCell label="Всего утром" value={total} color="#10b981" />
          <Op symbol="−" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 70 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Осталось вечером</span>
            {canEdit ? (
              <input type="number" min="0" value={actual}
                onChange={e => setActual(e.target.value)}
                onBlur={e => onBlurField('actual', e.target.value)}
                style={{ ...inputSt(false), border: '1px solid rgba(129,140,248,0.5)' }} />
            ) : <StatCell label="" value={ac} color="#818cf8" />}
          </div>
          <Op symbol="=" />
          <StatCell label="Грязных" value={dirty} color="#f59e0b" />
        </div>
      </div>
    </div>
  );
};

// ── Single day card ────────────────────────────────────────────────────────
const DayCard = ({ date, club, record, prevCarry, prevCarrySmall, prevShortage, isToday, canEdit, onSave }) => {
  const hasSmall = club === 'NURLY ORDA'; // маленькие полотенца + кг — только Nurly Orda
  const isFirstDay = prevCarry === null;

  const [cleanReceived,    setCleanReceived]    = useState('');
  const [cleanTotalManual, setCleanTotalManual] = useState(''); // first day only
  const [actualCount,      setActualCount]      = useState('');
  const [smallReceived,    setSmallReceived]    = useState('');
  const [smallTotalManual, setSmallTotalManual] = useState('');
  const [smallActual,      setSmallActual]      = useState('');
  const [laundryKg,        setLaundryKg]        = useState('');

  useEffect(() => {
    if (record?.cleanReceived    != null) setCleanReceived(String(record.cleanReceived));
    if (record?.cleanTotalManual != null) setCleanTotalManual(String(record.cleanTotalManual));
    if (record?.actualCount      != null) setActualCount(String(record.actualCount));
    if (record?.smallReceived    != null) setSmallReceived(String(record.smallReceived));
    if (record?.smallTotalManual != null) setSmallTotalManual(String(record.smallTotalManual));
    if (record?.smallActual      != null) setSmallActual(String(record.smallActual));
    if (record?.laundryKg        != null) setLaundryKg(String(record.laundryKg));
  }, [record?.cleanReceived, record?.cleanTotalManual, record?.actualCount, record?.smallReceived, record?.smallTotalManual, record?.smallActual, record?.laundryKg]);

  const num = (v) => (v === '' ? null : Number(v));

  // Любое поле теряет фокус → сохраняем весь снимок дня
  const saveAll = () => {
    onSave(date, {
      cleanReceived:    num(cleanReceived),
      cleanTotalManual: num(cleanTotalManual),
      actualCount:      num(actualCount),
      smallReceived:    num(smallReceived),
      smallTotalManual: num(smallTotalManual),
      smallActual:      num(smallActual),
      laundryKg:        num(laundryKg),
    });
  };

  const dateLabel = format(new Date(date + 'T12:00:00'), 'd MMMM yyyy', { locale: ru });

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid ' + (isToday ? 'rgba(123,61,255,0.35)' : 'var(--border)'),
      borderRadius: 16, padding: '16px 20px',
      boxShadow: isToday ? '0 4px 24px rgba(123,61,255,0.08)' : 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>{dateLabel}</span>
        {isToday && (
          <span style={{ fontSize: 9, fontWeight: 800, background: 'var(--accent-purple)', color: '#fff', padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>сегодня</span>
        )}
        {isFirstDay && (
          <span style={{ fontSize: 9, fontWeight: 800, background: 'rgba(79,142,247,0.15)', color: '#4f8ef7', padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>первый день</span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          {prevShortage === -1 && (
            <span style={{ fontSize: 10, fontWeight: 800, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={10} />
              Вчера не заполнили
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: hasSmall ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr', gap: 24 }}>
        <TowelFlow
          title={hasSmall ? '🛁 Большие полотенца' : null}
          prevCarry={prevCarry}
          canEdit={canEdit}
          received={cleanReceived}       setReceived={setCleanReceived}
          totalManual={cleanTotalManual} setTotalManual={setCleanTotalManual}
          actual={actualCount}           setActual={setActualCount}
          onBlurField={saveAll}
        />
        {hasSmall && (
          <TowelFlow
            title="🤍 Маленькие полотенца"
            prevCarry={prevCarrySmall}
            canEdit={canEdit}
            received={smallReceived}       setReceived={setSmallReceived}
            totalManual={smallTotalManual} setTotalManual={setSmallTotalManual}
            actual={smallActual}           setActual={setSmallActual}
            onBlurField={saveAll}
          />
        )}
      </div>

      {/* Сдано в стирку, кг — только Nurly Orda */}
      {hasSmall && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, paddingTop: 14, borderTop: '1px dashed var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            ⚖️ Сдано в стирку
          </span>
          {canEdit ? (
            <input type="number" min="0" step="0.1" value={laundryKg}
              onChange={e => setLaundryKg(e.target.value)}
              onBlur={saveAll}
              style={{ ...inputSt(false), border: '1px solid rgba(245,158,11,0.5)', width: 90 }} />
          ) : (
            <span style={{ fontSize: 24, fontWeight: 900, color: '#f59e0b' }}>{record?.laundryKg ?? <span style={{ opacity: 0.25, fontWeight: 500, fontSize: 18 }}>—</span>}</span>
          )}
          <span style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b' }}>кг</span>
        </div>
      )}
    </div>
  );
};

// ── Schedule panel ─────────────────────────────────────────────────────────
const SchedulePanel = ({ employees }) => {
  if (!employees.length) return null;

  // Group by shiftTime
  const byTime = {};
  employees.forEach(({ name, shiftTime }) => {
    if (!byTime[shiftTime]) byTime[shiftTime] = [];
    byTime[shiftTime].push(name);
  });

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '14px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Users size={15} style={{ color: '#4f8ef7' }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          В смене сегодня
        </span>
        <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, background: 'rgba(79,142,247,0.12)', color: '#4f8ef7', padding: '1px 7px', borderRadius: 5 }}>
          {employees.length} чел.
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {Object.entries(byTime).map(([time, names]) => (
          <div key={time} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.2)', borderRadius: 8, padding: '4px 9px', flexShrink: 0 }}>
              <Clock size={11} color="#4f8ef7" />
              <span style={{ fontSize: 12, fontWeight: 800, color: '#4f8ef7' }}>{time}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {names.map(n => (
                <span key={n} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px' }}>
                  {n}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────
const TowelsPage = () => {
  const { user } = useTickets();
  const isChef   = user?.role === 'chef' || user?.role === 'viewer';
  const isAdmin  = user?.role === 'admin';
  const userClub = user?.club?.toUpperCase() || null;

  const [activeClub,    setActiveClub]    = useState(userClub || 'COLIBRI');
  const [records,       setRecords]       = useState({});
  const [shiftEmployees, setShiftEmployees] = useState([]);

  const canEdit      = isChef || isAdmin || user?.role === 'manager';
  const visibleClubs = isChef ? CLUBS : [userClub].filter(Boolean);
  const club         = isChef ? activeClub : userClub;

  const today    = format(new Date(), 'yyyy-MM-dd');
  const todayObj = new Date();

  // Firestore subscription
  useEffect(() => {
    if (!club) return;
    const q = query(collection(db, 'towel_records'), where('club', '==', club));
    return onSnapshot(q, snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.data().date] = { docId: d.id, ...d.data() }; });
      setRecords(map);
    }, err => console.error('[towel_records]', err));
  }, [club]);

  // Load today's shift employees
  useEffect(() => {
    if (!club) return;
    getEmployeesWithShifts(club, todayObj).then(setShiftEmployees);
  }, [club]);

  // Dates to show: today always + any dates with data, newest first
  const datesToShow = useMemo(() => {
    const set = new Set([today]);
    Object.keys(records).forEach(d => set.add(d));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [records, today]);

  // Carry-over = yesterday's clean remaining (actualCount = осталось чистых)
  const getPrevCarry = useCallback((date) => {
    const [y, m, d] = date.split('-').map(Number);
    const prevDate = format(subDays(new Date(y, m - 1, d), 1), 'yyyy-MM-dd');
    const prev = records[prevDate];
    if (!prev) return null;
    return prev.actualCount ?? null;
  }, [records]);

  // То же для маленьких полотенец (Nurly Orda)
  const getPrevCarrySmall = useCallback((date) => {
    const [y, m, d] = date.split('-').map(Number);
    const prevDate = format(subDays(new Date(y, m - 1, d), 1), 'yyyy-MM-dd');
    const prev = records[prevDate];
    if (!prev) return null;
    return prev.smallActual ?? null;
  }, [records]);

  // Yesterday's дефицит: if no actualCount recorded at all
  const getPrevShortage = useCallback((date) => {
    const [y, m, d] = date.split('-').map(Number);
    const prevDate = format(subDays(new Date(y, m - 1, d), 1), 'yyyy-MM-dd');
    const prev = records[prevDate];
    if (!prev) return null;
    // Show alert if yesterday data is incomplete (no actual count)
    return prev.actualCount == null ? -1 : null;
  }, [records]);

  const handleSave = useCallback(async (date, fields) => {
    if (!club) return;

    // Recompute cleanTotal and remainder
    const prevCarry = getPrevCarry(date);
    const isFirstDay = prevCarry === null;

    const cr  = fields.cleanReceived    ?? null;
    const ctm = fields.cleanTotalManual ?? null;
    const ac  = fields.actualCount      ?? null;

    const cleanTotal = isFirstDay
      ? (ctm ?? cr)
      : (prevCarry !== null && cr !== null) ? prevCarry + cr : cr;

    const dirtyTotal = (cleanTotal !== null && ac !== null) ? cleanTotal - ac : null;

    // Маленькие полотенца (Nurly Orda) — та же арифметика
    const prevCarrySmall = getPrevCarrySmall(date);
    const sr  = fields.smallReceived    ?? null;
    const stm = fields.smallTotalManual ?? null;
    const sac = fields.smallActual      ?? null;
    const smallTotal = prevCarrySmall === null
      ? (stm ?? sr)
      : (prevCarrySmall !== null && sr !== null) ? prevCarrySmall + sr : sr;
    const smallDirty = (smallTotal !== null && sac !== null) ? smallTotal - sac : null;

    const docId = `${date}_${club.replace(/\s+/g, '_')}`;
    try {
      await setDoc(doc(db, 'towel_records', docId), {
        date, club,
        cleanReceived:    cr,
        cleanTotalManual: ctm,
        actualCount:      ac,
        dirtyTotal,
        remainder: ac,
        smallReceived:    sr,
        smallTotalManual: stm,
        smallActual:      sac,
        smallDirty,
        laundryKg:        fields.laundryKg ?? null,
      }, { merge: true });
      // Notify when the actual count is filled in — the day is done.
      // Same tag → repeated edits replace the notification instead of spamming.
      if (ac !== null) {
        pushNotify({
          title: '🧺 Полотенца учтены',
          body: `${club} за ${date}: чистых ${cleanTotal ?? '—'}, факт ${ac}${dirtyTotal !== null ? `, грязных ${dirtyTotal}` : ''}`
            + (sac !== null ? ` · маленьких: ${sac} остат.${smallDirty !== null ? `, грязных ${smallDirty}` : ''}` : '')
            + (fields.laundryKg != null ? ` · стирка ${fields.laundryKg} кг` : ''),
          club,
          excludeEmail: user?.email || '',
          url: '/towels',
          tag: `towels-${date}-${club}`,
        });
      }
    } catch (e) {
      console.error('[towel_records]', e);
      toast.error('Не удалось сохранить');
    }
  }, [club, getPrevCarry, getPrevCarrySmall, user]);

  // Summary strip for today
  const todayRec    = records[today];
  const todayCarry  = getPrevCarry(today);
  const todayCr     = todayRec?.cleanReceived ?? null;
  const todayCtm    = todayRec?.cleanTotalManual ?? null;
  const todayAc     = todayRec?.actualCount ?? null;
  const todayIsFirst = todayCarry === null;
  const todayCleanTotal = todayIsFirst
    ? (todayCtm ?? todayCr)
    : (todayCarry !== null && todayCr !== null) ? todayCarry + todayCr : todayCr;
  const todayDirtyTotal = (todayCleanTotal !== null && todayAc !== null) ? todayCleanTotal - todayAc : null;

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(79,142,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shirt size={20} style={{ color: '#4f8ef7' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Учет полотенец</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Приход, расход и остатки</p>
          </div>
        </div>
        {visibleClubs.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {visibleClubs.map(c => (
              <button key={c} onClick={() => setActiveClub(c)} style={{
                padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: '1px solid ' + (activeClub === c ? 'var(--accent-purple)' : 'var(--border)'),
                background: activeClub === c ? 'var(--accent-purple)' : 'transparent',
                color: activeClub === c ? '#fff' : 'var(--text-muted)',
              }}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {/* Today summary strip */}
      {todayCleanTotal !== null && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Всего чистых',    value: todayCleanTotal,  color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
            { label: 'Осталось чистых', value: todayAc,          color: '#818cf8', bg: 'rgba(129,140,248,0.08)' },
            { label: 'Грязных',         value: todayDirtyTotal,  color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
            ...(club === 'NURLY ORDA' ? [
              { label: 'Маленьких осталось', value: todayRec?.smallActual ?? null, color: '#06b6d4', bg: 'rgba(6,182,212,0.08)' },
              { label: 'Маленьких грязных',  value: todayRec?.smallDirty ?? null,  color: '#ec4899', bg: 'rgba(236,72,153,0.08)' },
              { label: 'Стирка, кг',         value: todayRec?.laundryKg ?? null,   color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
            ] : []),
          ].filter(s => s.value !== null).map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 12, padding: '10px 18px', minWidth: 100 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: s.color, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Schedule panel */}
      <SchedulePanel employees={shiftEmployees} />

      {/* Day cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {datesToShow.map(date => (
          <DayCard
            key={date}
            date={date}
            club={club}
            record={records[date]}
            prevCarry={getPrevCarry(date)}
            prevCarrySmall={getPrevCarrySmall(date)}
            prevShortage={getPrevShortage(date)}
            isToday={date === today}
            canEdit={canEdit}
            onSave={handleSave}
          />
        ))}
      </div>
    </div>
  );
};

export default TowelsPage;
