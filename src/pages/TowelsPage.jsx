import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Shirt, AlertTriangle, Clock, Users, Camera, Trash2, Plus, X, PackageX, Edit3 } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { pushNotify } from '../lib/pushNotify';
import { db } from '../lib/firebase';
import {
  collection, onSnapshot, doc, setDoc, addDoc, deleteDoc, query, where, getDocs,
} from 'firebase/firestore';
import { format, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';
import { isMobileDevice } from '../lib/isMobile';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];

// Сжатие фото (как в товарах/утерянных вещах): 480px JPEG ≈ 25 КБ
const compressImageToBase64 = (file) => new Promise((resolve, reject) => {
  const img = new window.Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    const MAX_SIZE = 480;
    let { width, height } = img;
    if (width > MAX_SIZE || height > MAX_SIZE) {
      if (width > height) { height = Math.round((height * MAX_SIZE) / width); width = MAX_SIZE; }
      else { width = Math.round((width * MAX_SIZE) / height); height = MAX_SIZE; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    resolve(canvas.toDataURL('image/jpeg', 0.65));
  };
  img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Не удалось прочитать изображение')); };
  img.src = objectUrl;
});

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
// mobile: крупнее зона ввода (≥44px высоты — удобно пальцем)
const inputSt = (highlight, mobile) => ({
  background: 'var(--bg-hover)',
  border: '1px solid ' + (highlight ? '#B06A6A' : 'var(--border)'),
  borderRadius: mobile ? 10 : 8,
  padding: mobile ? '12px 10px' : '7px 10px',
  fontSize: 16,
  fontWeight: 800,
  color: 'var(--text-primary)',
  outline: 'none',
  width: mobile ? 86 : 76,
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
  boxSizing: 'border-box',
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
const TowelFlow = ({ title, prevCarry, canEdit, received, setReceived, totalManual, setTotalManual, actual, setActual, onBlurField, isMobile }) => {
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
                    style={inputSt(false, isMobile)} />
                ) : <StatCell label="" value={rc} />}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'flex-end', paddingBottom: 6 }}>всего утром:</span>
              {canEdit ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 70 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#5580A8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Всего утром</span>
                  <input type="number" min="0" value={totalManual}
                    onChange={e => setTotalManual(e.target.value)}
                    onBlur={e => onBlurField('totalManual', e.target.value)}
                    style={{ ...inputSt(false, isMobile), border: '1px solid #5580A8' }} />
                </div>
              ) : (
                <StatCell label="Всего утром" value={total} color="#5F9C81" />
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
                    style={inputSt(false, isMobile)} />
                ) : <StatCell label="" value={rc} />}
              </div>
              <Op symbol="=" />
              <StatCell label="Всего утром" value={total} color="#5F9C81" />
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
          <StatCell label="Всего утром" value={total} color="#5F9C81" />
          <Op symbol="−" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 70 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Осталось вечером</span>
            {canEdit ? (
              <input type="number" min="0" value={actual}
                onChange={e => setActual(e.target.value)}
                onBlur={e => onBlurField('actual', e.target.value)}
                style={{ ...inputSt(false, isMobile), border: '1px solid rgba(129,140,248,0.5)' }} />
            ) : <StatCell label="" value={ac} color="#818cf8" />}
          </div>
          <Op symbol="=" />
          <StatCell label="Грязных" value={dirty} color="#C08F4F" />
        </div>
      </div>
    </div>
  );
};

// ── Single day card ────────────────────────────────────────────────────────
const DayCard = ({ date, club, record, prevCarry, prevCarrySmall, prevShortage, newCarryIn, isToday, canEdit, onSave, isMobile }) => {
  const hasSmall = club === 'NURLY ORDA'; // маленькие полотенца + кг — только Nurly Orda
  const isFirstDay = prevCarry === null;

  const [cleanReceived,    setCleanReceived]    = useState('');
  const [cleanTotalManual, setCleanTotalManual] = useState(''); // first day only
  const [actualCount,      setActualCount]      = useState('');
  const [smallReceived,    setSmallReceived]    = useState('');
  const [smallTotalManual, setSmallTotalManual] = useState('');
  const [smallActual,      setSmallActual]      = useState('');
  const [laundryKg,        setLaundryKg]        = useState('');
  const [newDelivered,     setNewDelivered]     = useState(''); // поставка новых полотенец
  const [newTaken,         setNewTaken]         = useState(''); // взято новых в оборот

  useEffect(() => {
    if (record?.cleanReceived    != null) setCleanReceived(String(record.cleanReceived));
    if (record?.cleanTotalManual != null) setCleanTotalManual(String(record.cleanTotalManual));
    if (record?.actualCount      != null) setActualCount(String(record.actualCount));
    if (record?.smallReceived    != null) setSmallReceived(String(record.smallReceived));
    if (record?.smallTotalManual != null) setSmallTotalManual(String(record.smallTotalManual));
    if (record?.smallActual      != null) setSmallActual(String(record.smallActual));
    if (record?.laundryKg        != null) setLaundryKg(String(record.laundryKg));
    if (record?.newDelivered     != null) setNewDelivered(String(record.newDelivered));
    if (record?.newTaken         != null) setNewTaken(String(record.newTaken));
  }, [record?.cleanReceived, record?.cleanTotalManual, record?.actualCount, record?.smallReceived, record?.smallTotalManual, record?.smallActual, record?.laundryKg, record?.newDelivered, record?.newTaken]);

  const num = (v) => (v === '' ? null : Number(v));

  // Остаток новых на складе к концу этого дня = было + поставка − взято
  const newBalance = (newCarryIn || 0) + (num(newDelivered) ?? 0) - (num(newTaken) ?? 0);

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
      newDelivered:     num(newDelivered),
      newTaken:         num(newTaken),
    });
  };

  const dateLabel = format(new Date(date + 'T12:00:00'), 'd MMMM yyyy', { locale: ru });

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid ' + (isToday ? 'rgba(125,111,179,0.35)' : 'var(--border)'),
      borderRadius: 16, padding: isMobile ? '12px 14px' : '16px 20px', // мобайл: компактнее
      boxShadow: isToday ? '0 4px 24px rgba(125,111,179,0.08)' : 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>{dateLabel}</span>
        {isToday && (
          <span style={{ fontSize: 9, fontWeight: 800, background: 'var(--accent-purple)', color: '#fff', padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>сегодня</span>
        )}
        {isFirstDay && (
          <span style={{ fontSize: 9, fontWeight: 800, background: 'rgba(85,128,168,0.15)', color: '#5580A8', padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>первый день</span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          {prevShortage === -1 && (
            <span style={{ fontSize: 10, fontWeight: 800, color: '#B06A6A', display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={10} />
              Вчера не заполнили
            </span>
          )}
        </div>
      </div>

      {/* мобайл: потоки строго в одну колонку, без горизонтального скролла */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (hasSmall ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr'), gap: isMobile ? 16 : 24 }}>
        <TowelFlow
          title={hasSmall ? '🛁 Большие полотенца' : null}
          prevCarry={prevCarry}
          canEdit={canEdit}
          received={cleanReceived}       setReceived={setCleanReceived}
          totalManual={cleanTotalManual} setTotalManual={setCleanTotalManual}
          actual={actualCount}           setActual={setActualCount}
          onBlurField={saveAll}
          isMobile={isMobile}
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
            isMobile={isMobile}
          />
        )}
      </div>

      {/* Приход в чистом виде, кг — только Nurly Orda */}
      {hasSmall && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, paddingTop: 14, borderTop: '1px dashed var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            ⚖️ Приход в чистом виде
          </span>
          {canEdit ? (
            <input type="number" min="0" step="0.1" value={laundryKg}
              onChange={e => setLaundryKg(e.target.value)}
              onBlur={saveAll}
              style={{ ...inputSt(false, isMobile), border: '1px solid rgba(192,143,79,0.5)', width: 90 }} />
          ) : (
            <span style={{ fontSize: 24, fontWeight: 900, color: '#C08F4F' }}>{record?.laundryKg ?? <span style={{ opacity: 0.25, fontWeight: 500, fontSize: 18 }}>—</span>}</span>
          )}
          <span style={{ fontSize: 12, fontWeight: 800, color: '#C08F4F' }}>кг</span>
        </div>
      )}

      {/* 📦 Новые полотенца — склад: было + поставка − взято в оборот = на складе */}
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          📦 Новые полотенца (склад)
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <StatCell label="Было на складе" value={newCarryIn || 0} color="#818cf8" />
          <Op symbol="+" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 70 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#5F9C81', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Поставка</span>
            {canEdit ? (
              <input type="number" min="0" value={newDelivered}
                onChange={e => setNewDelivered(e.target.value)}
                onBlur={saveAll}
                style={{ ...inputSt(false, isMobile), border: '1px solid rgba(95,156,129,0.5)' }} />
            ) : <StatCell label="" value={num(newDelivered)} color="#5F9C81" />}
          </div>
          <Op symbol="−" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 70 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#C08F4F', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Взято в оборот</span>
            {canEdit ? (
              <input type="number" min="0" value={newTaken}
                onChange={e => setNewTaken(e.target.value)}
                onBlur={saveAll}
                style={{ ...inputSt(false, isMobile), border: '1px solid rgba(192,143,79,0.5)' }} />
            ) : <StatCell label="" value={num(newTaken)} color="#C08F4F" />}
          </div>
          <Op symbol="=" />
          <StatCell label="На складе" value={newBalance} color="#5580A8" />
        </div>
      </div>
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
        <Users size={15} style={{ color: '#5580A8' }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          В смене сегодня
        </span>
        <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, background: 'rgba(85,128,168,0.12)', color: '#5580A8', padding: '1px 7px', borderRadius: 5 }}>
          {employees.length} чел.
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {Object.entries(byTime).map(([time, names]) => (
          <div key={time} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(85,128,168,0.1)', border: '1px solid rgba(85,128,168,0.2)', borderRadius: 8, padding: '4px 9px', flexShrink: 0 }}>
              <Clock size={11} color="#5580A8" />
              <span style={{ fontSize: 12, fontWeight: 800, color: '#5580A8' }}>{time}</span>
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

  // Мобильный режим — только визуальные изменения
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Брак и списание
  const [pageView,   setPageView]   = useState('log'); // 'log' | 'writeoff'
  const [writeoffs,  setWriteoffs]  = useState([]);
  const [showWo,     setShowWo]     = useState(false);
  const [woPhoto,    setWoPhoto]    = useState('');
  const [woQty,      setWoQty]      = useState('');
  const [woComment,  setWoComment]  = useState('');
  const [woSaving,   setWoSaving]   = useState(false);
  const [editingWoId, setEditingWoId] = useState(null); // id редактируемого списания или null (новое)
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const woFileRef = useRef(null);

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

  // Брак и списание — подписка по клубу
  useEffect(() => {
    if (!club) return;
    const q = query(collection(db, 'towel_writeoffs'), where('club', '==', club));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
      setWriteoffs(list);
    }, err => console.error('[towel_writeoffs]', err));
  }, [club]);

  const handleWoPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Выберите фотографию');
    try { setWoPhoto(await compressImageToBase64(file)); } catch { toast.error('Не удалось обработать фото'); }
    e.target.value = '';
  };

  const resetWoForm = () => { setWoPhoto(''); setWoQty(''); setWoComment(''); setEditingWoId(null); };
  const openAddWo = () => { resetWoForm(); setShowWo(true); };
  const openEditWo = (w) => {
    setEditingWoId(w.id);
    setWoPhoto(w.photo || '');
    setWoQty(w.qty != null ? String(w.qty) : '');
    setWoComment(w.comment || '');
    setShowWo(true);
  };
  const closeWo = () => { setShowWo(false); resetWoForm(); };

  const handleSaveWriteoff = async () => {
    if (!club) return;
    if (!woPhoto && !woComment.trim()) return toast.error('Добавьте фото или комментарий');
    setWoSaving(true);
    try {
      const base = {
        qty: woQty === '' ? null : Number(woQty),
        photo: woPhoto || '',
        comment: woComment.trim(),
      };
      if (editingWoId) {
        await setDoc(doc(db, 'towel_writeoffs', editingWoId), { ...base, updatedAtISO: new Date().toISOString() }, { merge: true });
        toast.success('Списание обновлено');
      } else {
        await addDoc(collection(db, 'towel_writeoffs'), {
          ...base, club,
          createdAtISO: new Date().toISOString(),
          addedBy: user?.displayName || user?.email || '',
        });
        toast.success('Списание добавлено');
      }
      closeWo();
    } catch (e) {
      toast.error('Не удалось сохранить: ' + (e?.message || e));
    } finally { setWoSaving(false); }
  };

  const handleDeleteWriteoff = async (id) => {
    if (!window.confirm('Удалить эту запись списания?')) return;
    try { await deleteDoc(doc(db, 'towel_writeoffs', id)); toast.success('Удалено'); }
    catch { toast.error('Не удалось удалить'); }
  };

  const woTotal = useMemo(() => writeoffs.reduce((s, w) => s + (w.qty || 0), 0), [writeoffs]);
  const fmtWoDate = (iso) => { try { return format(new Date(iso), 'd MMMM yyyy, HH:mm', { locale: ru }); } catch { return ''; } };

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

  // Остаток новых полотенец к НАЧАЛУ дня = (поставки − взято) по всем прошлым датам
  const getNewCarryIn = useCallback((date) => {
    return Object.keys(records)
      .filter(d => d < date)
      .reduce((sum, d) => sum + (records[d].newDelivered || 0) - (records[d].newTaken || 0), 0);
  }, [records]);

  // Текущий остаток новых на складе (вся история)
  const currentNewStock = useMemo(() =>
    Object.keys(records).reduce((sum, d) => sum + (records[d].newDelivered || 0) - (records[d].newTaken || 0), 0),
  [records]);

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
        newDelivered:     fields.newDelivered ?? null,
        newTaken:         fields.newTaken ?? null,
      }, { merge: true });
      // Notify when the actual count is filled in — the day is done.
      // Same tag → repeated edits replace the notification instead of spamming.
      if (ac !== null) {
        pushNotify({
          title: '🧺 Полотенца учтены',
          body: `${club} за ${date}: чистых ${cleanTotal ?? '—'}, факт ${ac}${dirtyTotal !== null ? `, грязных ${dirtyTotal}` : ''}`
            + (sac !== null ? ` · маленьких: ${sac} остат.${smallDirty !== null ? `, грязных ${smallDirty}` : ''}` : '')
            + (fields.laundryKg != null ? ` · приход чистого ${fields.laundryKg} кг` : ''),
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
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(85,128,168,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shirt size={20} style={{ color: '#5580A8' }} />
          </div>
          <div>
            <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Учет полотенец</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Приход, расход и остатки</p>
          </div>
        </div>
        {visibleClubs.length > 1 && (
          /* мобайл: клубные табы — горизонтальная лента чипов без переноса */
          <div style={isMobile
            ? { display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap', width: '100%', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }
            : { display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {visibleClubs.map(c => (
              <button key={c} onClick={() => setActiveClub(c)} style={{
                padding: isMobile ? '8px 14px' : '6px 14px', borderRadius: isMobile ? 999 : 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
                border: '1px solid ' + (activeClub === c ? 'var(--accent-purple)' : 'var(--border)'),
                background: activeClub === c ? 'var(--accent-purple)' : 'transparent',
                color: activeClub === c ? '#fff' : 'var(--text-muted)',
              }}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {/* Вкладки: Учёт / Брак и списание — на мобильном лента без переноса */}
      <div style={isMobile
        ? { display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch' }
        : { display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['log', 'Учёт'], ['writeoff', `🚫 Брак и списание${writeoffs.length ? ` (${writeoffs.length})` : ''}`]].map(([id, label]) => (
          <button key={id} onClick={() => setPageView(id)} style={{
            padding: isMobile ? '10px 16px' : '8px 16px', borderRadius: isMobile ? 999 : 10, fontSize: 12, fontWeight: 800, cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
            border: '1px solid ' + (pageView === id ? (id === 'writeoff' ? '#B06A6A' : 'var(--accent-purple)') : 'var(--border)'),
            background: pageView === id ? (id === 'writeoff' ? 'rgba(176,106,106,0.15)' : 'var(--accent-purple)') : 'transparent',
            color: pageView === id ? (id === 'writeoff' ? '#B06A6A' : '#fff') : 'var(--text-muted)',
          }}>{label}</button>
        ))}
      </div>

      {pageView === 'log' && (<>
      {/* Новые полотенца — остаток на складе (всегда виден) */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ background: 'rgba(85,128,168,0.08)', border: '1px solid #5580A830', borderRadius: 12, padding: '10px 18px', minWidth: 150 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#5580A8', lineHeight: 1 }}>{currentNewStock}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#5580A8', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>📦 Новых на складе</div>
        </div>
      </div>

      {/* Today summary strip */}
      {todayCleanTotal !== null && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Всего чистых',    value: todayCleanTotal,  color: '#5F9C81', bg: 'rgba(95,156,129,0.08)' },
            { label: 'Осталось чистых', value: todayAc,          color: '#818cf8', bg: 'rgba(129,140,248,0.08)' },
            { label: 'Грязных',         value: todayDirtyTotal,  color: '#C08F4F', bg: 'rgba(192,143,79,0.08)' },
            ...(club === 'NURLY ORDA' ? [
              { label: 'Маленьких осталось', value: todayRec?.smallActual ?? null, color: '#06b6d4', bg: 'rgba(6,182,212,0.08)' },
              { label: 'Маленьких грязных',  value: todayRec?.smallDirty ?? null,  color: '#B0688D', bg: 'rgba(176,104,141,0.08)' },
              { label: 'Стирка, кг',         value: todayRec?.laundryKg ?? null,   color: '#C08F4F', bg: 'rgba(192,143,79,0.08)' },
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
            newCarryIn={getNewCarryIn(date)}
            isToday={date === today}
            canEdit={canEdit}
            onSave={handleSave}
            isMobile={isMobile}
          />
        ))}
      </div>
      </>)}

      {pageView === 'writeoff' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ background: 'rgba(176,106,106,0.08)', border: '1px solid rgba(176,106,106,0.25)', borderRadius: 12, padding: '10px 18px', minWidth: 150 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#B06A6A', lineHeight: 1 }}>{woTotal}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#B06A6A', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>🚫 Списано полотенец</div>
            </div>
            {canEdit && (
              <button onClick={openAddWo} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 12, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                <Plus size={16} /> Добавить списание
              </button>
            )}
          </div>

          {writeoffs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, lineHeight: 1.7 }}>
              <PackageX size={30} style={{ opacity: 0.4, marginBottom: 8 }} /><br />
              Списаний пока нет. Нажмите «Добавить списание», приложите фото и опишите причину.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {writeoffs.map(w => (
                <div key={w.id} style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', borderLeft: '3px solid #B06A6A', padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div onClick={() => w.photo && setPreviewPhoto(w.photo)} style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-hover)', flexShrink: 0, cursor: w.photo ? 'zoom-in' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {w.photo ? <img src={w.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <PackageX size={20} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {w.qty != null && <span style={{ fontSize: 13, fontWeight: 900, color: '#B06A6A' }}>−{w.qty} шт</span>}
                      <span style={{ fontSize: 8, fontWeight: 900, padding: '2px 7px', borderRadius: 6, background: 'rgba(176,106,106,0.12)', color: '#B06A6A', textTransform: 'uppercase' }}>Списание</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{fmtWoDate(w.createdAtISO)}</span>
                    </div>
                    {w.comment && <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{w.comment}</div>}
                    {w.addedBy && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>Добавил: {w.addedBy}</div>}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {/* мобайл: зона нажатия иконок ≥36px */}
                      <button onClick={() => openEditWo(w)} title="Редактировать" style={{ minWidth: isMobile ? 38 : undefined, minHeight: isMobile ? 38 : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 9px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer', lineHeight: 0 }}>
                        <Edit3 size={isMobile ? 15 : 13} />
                      </button>
                      <button onClick={() => handleDeleteWriteoff(w.id)} title="Удалить" style={{ minWidth: isMobile ? 38 : undefined, minHeight: isMobile ? 38 : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 9px', borderRadius: 10, border: '1px solid rgba(176,106,106,0.3)', background: 'rgba(176,106,106,0.08)', color: '#B06A6A', cursor: 'pointer', lineHeight: 0 }}>
                        <Trash2 size={isMobile ? 15 : 13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Модалка добавления списания (портал в body — fixed ломается из-за animate-fade страницы) ── */}
      {showWo && ReactDOM.createPortal((
        // мобайл: модалка-шторка прижата к низу
        <div onClick={() => !woSaving && closeWo()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: isMobile ? '100%' : 420, background: 'var(--bg-card)', borderRadius: isMobile ? '20px 20px 0 0' : 20, border: '1px solid var(--border)', padding: isMobile ? 16 : 20, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>{editingWoId ? 'Редактировать списание' : 'Списание'} · {club}</h3>
              <button onClick={closeWo} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
            </div>
            <input ref={woFileRef} type="file" accept="image/*" capture="environment" onChange={handleWoPhoto} style={{ display: 'none' }} />
            {woPhoto ? (
              <div style={{ position: 'relative', maxHeight: 190, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-hover)', borderRadius: 14, overflow: 'hidden', flexShrink: 0 }}>
                <img src={woPhoto} alt="" style={{ maxHeight: 190, maxWidth: '100%', objectFit: 'contain', display: 'block' }} />
                <button onClick={() => woFileRef.current?.click()} style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 10, border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                  <Camera size={13} /> Переснять
                </button>
              </div>
            ) : (
              <button onClick={() => woFileRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '26px 20px', borderRadius: 16, border: '2px dashed var(--border)', background: 'var(--bg-hover)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                <Camera size={28} style={{ color: 'var(--accent-purple)' }} />
                Сфотографировать (почему списали)
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Кол-во:</span>
              <input type="number" min="0" value={woQty} onChange={e => setWoQty(e.target.value)} placeholder="шт" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', outline: 'none', width: 110, textAlign: 'center' }} />
            </div>
            <textarea placeholder="Комментарий: причина списания…" value={woComment} onChange={e => setWoComment(e.target.value)} rows={3} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontWeight: 600, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <button onClick={handleSaveWriteoff} disabled={woSaving} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 14, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: woSaving ? 0.6 : 1 }}>
              {woSaving ? 'Сохранение…' : (editingWoId ? 'Сохранить изменения' : 'Сохранить списание')}
            </button>
          </div>
        </div>
      ), document.body)}

      {/* Просмотр фото на весь экран (портал) */}
      {previewPhoto && ReactDOM.createPortal((
        <div onClick={() => setPreviewPhoto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          <img src={previewPhoto} alt="" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 16 }} />
        </div>
      ), document.body)}
    </div>
  );
};

export default TowelsPage;
