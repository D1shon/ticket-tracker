// Обмен сменами (решение шефа 28.10.2026): админы договариваются между собой,
// нажимают «Поменяться сменами», менеджер только подтверждает — и график
// на эти дни меняется автоматически. Поддерживается замена на всю смену,
// на половину дня (утро/вечер от полной смены), обмен сменами в один день
// и обмен днями (взамен коллега берёт мою смену в другой день).
//
// Коллекция shift_swaps: { club, monthKey, status pending|approved|rejected|stale,
//   initiator {email,name,empId}, partner {empId,name,email}, summary,
//   changes [{empId, empName, day, from, to}], note, createdAtISO, decided* }
// Связь «аккаунт ↔ строка графика»: employees/{id}.email (ставится, когда админ
// выбирает себя в графике) либо совпадение имени из профиля с именем строки.
import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { format, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Repeat, Check, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../../lib/firebase';
import { pushNotify } from '../../lib/pushNotify';

const cleanName = (s) => (s || '').replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();

// Полные смены и их половины (утро/вечер). У Nurly Orda, Europe City и
// Promenade полная смена на половины не делится — там доступны только
// замена целиком и обмен сменами.
const FULL_HALVES = {
  '8:30-21:30': ['8:30-14:30', '14:30-21:30'],
  '8:30-20:30': ['8:30-14:30', '14:30-20:30'], // COLIBRI
  '6:30-22:30': ['6:30-14:30', '14:30-22:30'],
};
const halvesOf = (shift) => FULL_HALVES[(shift || '').trim()] || null;
// Две половины → полная смена (если такая есть)
const combine = (a, b) => {
  const set = [a, b].map(x => (x || '').trim()).sort().join('|');
  for (const [full, [m, e]] of Object.entries(FULL_HALVES)) if ([m, e].sort().join('|') === set) return full;
  return null;
};
const pretty = (s) => (s || '').replace('-', '–');

export const dateLabel = (monthKey, day) => {
  try { return format(new Date(`${monthKey}-${String(day).padStart(2, '0')}`), 'd MMMM', { locale: ru }); } catch { return `${day}.${monthKey.slice(5)}`; }
};

// Строка графика, принадлежащая текущему пользователю
export function findMyEmployee(employees, user) {
  if (!user?.email) return null;
  const email = user.email.toLowerCase();
  const byEmail = employees.find(e => (e.email || '').toLowerCase() === email);
  if (byEmail) return byEmail;
  const me = cleanName(user.displayName);
  if (!me) return null;
  return employees.find(e => cleanName(e.name) === me) || null;
}

const btn = (primary) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, cursor: 'pointer',
  fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em',
  border: `1px solid ${primary ? 'var(--accent-purple)' : 'var(--border)'}`,
  background: primary ? 'var(--accent-purple)' : 'var(--bg-hover)', color: primary ? '#fff' : 'var(--text-secondary)',
});
const field = { width: '100%', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, outline: 'none' };
const label = { fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 6, display: 'block' };
const STATUS = {
  pending: { text: 'ждёт подтверждения', color: '#C08F4F' },
  approved: { text: 'подтверждено', color: '#5F9C81' },
  rejected: { text: 'отклонено', color: '#B05555' },
  stale: { text: 'неактуально (график изменился)', color: 'var(--text-muted)' },
};

// ─── Форма запроса (админ) ───────────────────────────────────────────────────
function SwapForm({ club, monthKey, employees, scheduleData, user, myEmp, onClose, onPickMe }) {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const defaultDay = format(tomorrow, 'yyyy-MM') === monthKey ? format(tomorrow, 'd') : '1';
  const [partnerId, setPartnerId] = useState('');
  const [day, setDay] = useState(defaultDay);
  const [variant, setVariant] = useState('');
  const [giveBack, setGiveBack] = useState(false);
  const [day2, setDay2] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [pickMe, setPickMe] = useState('');

  const daysInMonth = useMemo(() => { const [y, m] = monthKey.split('-').map(Number); return new Date(y, m, 0).getDate(); }, [monthKey]);
  const shiftOf = (emp, d) => ((scheduleData[emp?.id]?.days?.[String(d)] || '') + '').trim();
  const partner = employees.find(e => e.id === partnerId) || null;
  const mine = myEmp ? shiftOf(myEmp, day) : '';
  const theirs = partner ? shiftOf(partner, day) : '';

  // Варианты изменений на выбранный день
  const variants = useMemo(() => {
    if (!myEmp || !partner) return [];
    const out = [];
    const me = myEmp.name, them = partner.name;
    if (theirs && !mine) {
      out.push({ id: 'take_full', title: `Выхожу вместо ${them} на всю смену (${pretty(theirs)})`, changes: [{ empId: partner.id, empName: them, day, from: theirs, to: '' }, { empId: myEmp.id, empName: me, day, from: mine, to: theirs }] });
      const h = halvesOf(theirs);
      if (h) {
        out.push({ id: 'take_morning', title: `Беру утро ${pretty(h[0])}, у ${them} остаётся вечер ${pretty(h[1])}`, changes: [{ empId: partner.id, empName: them, day, from: theirs, to: h[1] }, { empId: myEmp.id, empName: me, day, from: mine, to: h[0] }] });
        out.push({ id: 'take_evening', title: `Беру вечер ${pretty(h[1])}, у ${them} остаётся утро ${pretty(h[0])}`, changes: [{ empId: partner.id, empName: them, day, from: theirs, to: h[0] }, { empId: myEmp.id, empName: me, day, from: mine, to: h[1] }] });
      }
    }
    if (theirs && mine) {
      out.push({ id: 'swap_day', title: `Меняемся сменами: я ${pretty(theirs)}, ${them} ${pretty(mine)}`, changes: [{ empId: partner.id, empName: them, day, from: theirs, to: mine }, { empId: myEmp.id, empName: me, day, from: mine, to: theirs }] });
      const h = halvesOf(theirs);
      if (h) {
        for (const half of h) {
          const full = combine(mine, half);
          const rest = h.find(x => x !== half);
          if (full) out.push({ id: 'take_half_' + half, title: `Беру у ${them} ${pretty(half)} — у меня выходит ${pretty(full)}, у ${them} остаётся ${pretty(rest)}`, changes: [{ empId: partner.id, empName: them, day, from: theirs, to: rest }, { empId: myEmp.id, empName: me, day, from: mine, to: full }] });
        }
      }
      out.push({ id: 'take_all', title: `Выхожу за двоих: ${them} отдыхает, у меня ${combine(mine, theirs) ? pretty(combine(mine, theirs)) : pretty(mine) + ' + ' + pretty(theirs)}`, changes: [{ empId: partner.id, empName: them, day, from: theirs, to: '' }, { empId: myEmp.id, empName: me, day, from: mine, to: combine(mine, theirs) || `${mine}, ${theirs}` }] });
    }
    if (!theirs && mine) {
      out.push({ id: 'give_full', title: `Отдаю свою смену ${pretty(mine)} — выходит ${them}`, changes: [{ empId: myEmp.id, empName: me, day, from: mine, to: '' }, { empId: partner.id, empName: them, day, from: theirs, to: mine }] });
      const h = halvesOf(mine);
      if (h) {
        out.push({ id: 'give_morning', title: `${them} берёт утро ${pretty(h[0])}, у меня остаётся вечер ${pretty(h[1])}`, changes: [{ empId: myEmp.id, empName: me, day, from: mine, to: h[1] }, { empId: partner.id, empName: them, day, from: theirs, to: h[0] }] });
        out.push({ id: 'give_evening', title: `${them} берёт вечер ${pretty(h[1])}, у меня остаётся утро ${pretty(h[0])}`, changes: [{ empId: myEmp.id, empName: me, day, from: mine, to: h[0] }, { empId: partner.id, empName: them, day, from: theirs, to: h[1] }] });
      }
    }
    return out;
  }, [myEmp, partner, day, mine, theirs]);

  useEffect(() => { setVariant(variants[0]?.id || ''); }, [variants]);

  const chosen = variants.find(v => v.id === variant) || null;
  // Обмен днями: взамен коллега берёт мою смену в другой день
  const mine2 = myEmp && day2 ? shiftOf(myEmp, day2) : '';
  const theirs2 = partner && day2 ? shiftOf(partner, day2) : '';
  const giveBackOk = giveBack && day2 && day2 !== day && mine2 && !theirs2;
  const giveBackChanges = giveBackOk ? [{ empId: myEmp.id, empName: myEmp.name, day: day2, from: mine2, to: '' }, { empId: partner.id, empName: partner.name, day: day2, from: theirs2, to: mine2 }] : [];

  const submit = async () => {
    if (!myEmp || !partner || !chosen) return;
    if (giveBack && !giveBackOk) { toast.error('Для обмена днями: в тот день у вас должна быть смена, а у коллеги — выходной'); return; }
    setSending(true);
    try {
      const changes = [...chosen.changes, ...giveBackChanges];
      const summary = `${dateLabel(monthKey, day)}: ${chosen.title}` + (giveBackOk ? `. Взамен ${partner.name} берёт мою смену ${pretty(mine2)} ${dateLabel(monthKey, day2)}` : '');
      const ref = await addDoc(collection(db, 'shift_swaps'), {
        club, monthKey, status: 'pending',
        initiator: { email: user.email, name: myEmp.name, empId: myEmp.id },
        partner: { empId: partner.id, name: partner.name, email: partner.email || null },
        summary, changes, note: note.trim() || null,
        createdAtISO: new Date().toISOString(), createdAt: serverTimestamp(),
      });
      toast.success('Запрос отправлен менеджеру');
      pushNotify({ title: '🔁 Запрос на обмен сменами', body: `${club}: ${summary}`, club, excludeEmail: user.email, url: `/schedule?swap=${ref.id}`, roles: ['manager', 'chef'] });
      if (partner.email) pushNotify({ title: '🔁 Коллега предлагает поменяться сменами', body: summary, emails: [partner.email], url: '/schedule' });
      onClose();
    } catch (e) { toast.error('Не удалось отправить: ' + (e?.message || '')); }
    finally { setSending(false); }
  };

  const dayOptions = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl animate-fade" style={{ padding: 20, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}><Repeat size={16} color="var(--accent-purple)" /> Поменяться сменами</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {!myEmp ? (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Не нашёл вас в графике по имени «{user?.displayName}». Выберите свою строку — запомню её.</p>
            <label style={label}>Кто вы в графике</label>
            <select style={field} value={pickMe} onChange={e => setPickMe(e.target.value)}>
              <option value="">— выбрать —</option>
              {employees.filter(e => !e.email).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button style={btn(true)} disabled={!pickMe} onClick={() => onPickMe(pickMe)}>Это я</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={label}>С кем меняюсь</label>
              <select style={field} value={partnerId} onChange={e => setPartnerId(e.target.value)}>
                <option value="">— выбрать коллегу —</option>
                {employees.filter(e => e.id !== myEmp.id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={label}>День ({format(new Date(`${monthKey}-01`), 'LLLL', { locale: ru })})</label>
              <select style={field} value={day} onChange={e => setDay(e.target.value)}>
                {dayOptions.map(d => <option key={d} value={d}>{dateLabel(monthKey, d)}</option>)}
              </select>
            </div>
            {partner && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div style={{ background: 'var(--bg-hover)', borderRadius: 10, padding: '8px 10px' }}><div style={label}>Я ({myEmp.name})</div><div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{mine ? pretty(mine) : 'выходной'}</div></div>
                <div style={{ background: 'var(--bg-hover)', borderRadius: 10, padding: '8px 10px' }}><div style={label}>{partner.name}</div><div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{theirs ? pretty(theirs) : 'выходной'}</div></div>
              </div>
            )}
            {partner && variants.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>В этот день ни у кого из вас нет смены — меняться нечем.</p>}
            {variants.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={label}>Как меняемся</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {variants.map(v => (
                    <label key={v.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${variant === v.id ? 'var(--accent-purple)' : 'var(--border)'}`, background: variant === v.id ? 'rgba(125,111,179,0.1)' : 'transparent' }}>
                      <input type="radio" name="variant" checked={variant === v.id} onChange={() => setVariant(v.id)} style={{ marginTop: 2 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>{v.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {chosen && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={giveBack} onChange={e => setGiveBack(e.target.checked)} /> Взамен {partner.name} берёт мою смену в другой день
                </label>
                {giveBack && (
                  <div style={{ marginTop: 8 }}>
                    <select style={field} value={day2} onChange={e => setDay2(e.target.value)}>
                      <option value="">— день —</option>
                      {dayOptions.filter(d => d !== day).map(d => <option key={d} value={d}>{dateLabel(monthKey, d)}{shiftOf(myEmp, d) ? ` · я ${pretty(shiftOf(myEmp, d))}` : ' · у меня выходной'}{shiftOf(partner, d) ? ` · ${partner.name} ${pretty(shiftOf(partner, d))}` : ''}</option>)}
                    </select>
                    {day2 && !giveBackOk && <p style={{ fontSize: 11, color: '#B05555', marginTop: 6 }}>Нужен день, где у вас есть смена, а у {partner.name} выходной.</p>}
                  </div>
                )}
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Комментарий менеджеру (необязательно)</label>
              <input style={field} value={note} onChange={e => setNote(e.target.value)} placeholder="Например: договорились с Аминой" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={btn(false)} onClick={onClose}>Отмена</button>
              <button style={{ ...btn(true), opacity: (!chosen || sending) ? 0.5 : 1 }} disabled={!chosen || sending} onClick={submit}><Check size={12} /> Отправить менеджеру</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Панель на странице графика ─────────────────────────────────────────────
// canEditSchedule → менеджер/шеф: список ожидающих запросов с кнопками.
// иначе → админ: кнопка «Поменяться сменами» + статусы своих запросов.
export default function ShiftSwapPanel({ club, monthKey, employees, scheduleData, user, canEditSchedule, updateCell }) {
  const [pending, setPending] = useState([]);
  const [mineList, setMineList] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const myEmail = (user?.email || '').toLowerCase();
  const myEmp = useMemo(() => findMyEmployee(employees, user), [employees, user]);

  // Ожидающие запросы клуба (нужны и менеджеру, и админу — чтобы видеть, что коллега уже отправил)
  useEffect(() => {
    if (!club) return;
    const q = query(collection(db, 'shift_swaps'), where('club', '==', club), where('status', '==', 'pending'));
    return onSnapshot(q, snap => setPending(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAtISO || '').localeCompare(b.createdAtISO || ''))), () => {});
  }, [club]);
  // Мои запросы (админ) — последние решения
  useEffect(() => {
    if (canEditSchedule || !myEmail) return;
    const q = query(collection(db, 'shift_swaps'), where('initiator.email', '==', myEmail));
    return onSnapshot(q, snap => setMineList(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || '')).slice(0, 5)), () => {});
  }, [canEditSchedule, myEmail]);

  const pickMe = async (empId) => {
    try { await updateDoc(doc(db, 'employees', empId), { email: user.email }); toast.success('Запомнил вашу строку в графике'); }
    catch { toast.error('Не удалось сохранить'); }
  };

  // id строки графика = docId расписания (monthKey_…); у старых строк без префикса — добавляем
  const currentValue = (c, mKey) => { const id = c.empId.includes('_') ? c.empId : `${mKey}_${c.empId}`; return ((scheduleData[id]?.days?.[String(c.day)] || '') + '').trim(); };

  const approve = async (req) => {
    setBusy(req.id);
    try {
      // График мог измениться после отправки запроса — тогда не трогаем
      const changed = (req.changes || []).filter(c => currentValue(c, req.monthKey) !== (c.from || '').trim());
      if (changed.length) {
        await updateDoc(doc(db, 'shift_swaps', req.id), { status: 'stale', decidedAtISO: new Date().toISOString(), decidedBy: user.email, decidedByName: user.displayName || '' });
        toast.error('График уже изменился после запроса — отметил как неактуальный');
        return;
      }
      for (const c of req.changes || []) await updateCell(req.monthKey, c.empId, String(c.day), c.to || '');
      await updateDoc(doc(db, 'shift_swaps', req.id), { status: 'approved', decidedAtISO: new Date().toISOString(), decidedBy: user.email, decidedByName: user.displayName || '' });
      toast.success('Смены изменены');
      const emails = [req.initiator?.email, req.partner?.email].filter(Boolean);
      if (emails.length) pushNotify({ title: '✅ Обмен сменами подтверждён', body: req.summary, emails, url: '/schedule' });
    } catch (e) { toast.error('Не удалось применить: ' + (e?.message || '')); }
    finally { setBusy(null); }
  };
  const reject = async (req) => {
    setBusy(req.id);
    try {
      await updateDoc(doc(db, 'shift_swaps', req.id), { status: 'rejected', decidedAtISO: new Date().toISOString(), decidedBy: user.email, decidedByName: user.displayName || '' });
      const emails = [req.initiator?.email, req.partner?.email].filter(Boolean);
      if (emails.length) pushNotify({ title: '❌ Обмен сменами отклонён', body: req.summary, emails, url: '/schedule' });
    } catch { toast.error('Не удалось отклонить'); }
    finally { setBusy(null); }
  };

  if (!club) return null;

  const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 16px' };

  if (canEditSchedule) {
    if (!pending.length) return null;
    return (
      <div style={{ ...card, borderColor: 'rgba(192,143,79,0.5)' }}>
        <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#C08F4F', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Repeat size={12} /> Запросы на обмен сменами · {pending.length}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pending.map(r => (
            <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--bg-hover)' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.4 }}>{r.initiator?.name} → {r.summary}</div>
                {r.monthKey !== monthKey && <div style={{ fontSize: 10, color: '#C08F4F', fontWeight: 700 }}>Другой месяц ({r.monthKey}) — откройте его, чтобы увидеть ячейки</div>}
                {r.note && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>«{r.note}»</div>}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{(r.createdAtISO || '').slice(0, 16).replace('T', ' ')}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...btn(true), opacity: busy === r.id ? 0.5 : 1 }} disabled={busy === r.id} onClick={() => approve(r)}><Check size={12} /> Подтвердить</button>
                <button style={{ ...btn(false), opacity: busy === r.id ? 0.5 : 1 }} disabled={busy === r.id} onClick={() => reject(r)}><X size={12} /> Отклонить</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Админ
  const myPending = pending.filter(r => r.initiator?.email === myEmail || r.partner?.empId === myEmp?.id);
  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <button style={btn(true)} onClick={() => setOpen(true)}><Repeat size={12} /> Поменяться сменами</button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Договорились с коллегой — отправьте запрос, менеджер подтвердит, и график изменится сам.</span>
      </div>
      {(myPending.length > 0 || mineList.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {[...myPending.filter(r => r.initiator?.email !== myEmail), ...mineList].map(r => {
            const st = STATUS[r.status] || STATUS.pending;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '7px 10px', borderRadius: 10, background: 'var(--bg-hover)' }}>
                <Clock size={11} color={st.color} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, flex: 1, minWidth: 0 }}>{r.initiator?.email === myEmail ? '' : `${r.initiator?.name}: `}{r.summary}</span>
                <span style={{ color: st.color, fontWeight: 900, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{st.text}</span>
              </div>
            );
          })}
        </div>
      )}
      {open && <SwapForm club={club} monthKey={monthKey} employees={employees} scheduleData={scheduleData} user={user} myEmp={myEmp} onClose={() => setOpen(false)} onPickMe={pickMe} />}
    </div>
  );
}
