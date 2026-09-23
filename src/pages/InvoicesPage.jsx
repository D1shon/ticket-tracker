import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Dumbbell, Receipt, Plus, X, Clock, Check, Ban, Trash2, User, Camera, Wrench } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useTickets } from '../store/TicketContext';
import { isMobileDevice } from '../lib/isMobile';
import { pushNotify } from '../lib/pushNotify';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

/*
 * Тренажеры — ремонт оборудования с двойным подтверждением шефа.
 * Флоу: менеджер заводит ПРОБЛЕМУ (фото тренажёра + описание) → шеф решает
 * «чинить или нет» → менеджер грузит СЧЁТ на оплату ремонта и отмечает, какие
 * одобренные проблемы он закрывает — они склеиваются в одну карточку счёта →
 * шеф подтверждает оплату (подтверждённый счёт уходит в очередь HJ Fin).
 * Коллекции: equip_problems (проблемы) + invoices (счета, problemIds[]).
 * Счета старше 31 дня чистятся вместе с их проблемами; открытые проблемы живут,
 * пока их не решат.
 */

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];

const P_STATUSES = {
  new:             { label: 'Ждёт решения: чинить?', color: '#b39a5e' },
  repair_approved: { label: 'Ремонт одобрен',        color: '#7A94B8' },
  rejected:        { label: 'Ремонт отклонён',       color: '#9c7d7d' },
};
const I_STATUSES = {
  pending:  { label: 'Ждёт оплаты',          color: '#b39a5e' },
  approved: { label: 'Оплата подтверждена',  color: '#7d9c87' },
  rejected: { label: 'Счёт отклонён',        color: '#9c7d7d' },
};

// Сжатие фото: до 1280px по большей стороне, JPEG 0.6 — читаемо и легко
const compressPhoto = (file) => new Promise((resolve, reject) => {
  const img = new window.Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    const MAX = 1280;
    let { width, height } = img;
    if (width > MAX || height > MAX) {
      if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
      else { width = Math.round((width * MAX) / height); height = MAX; }
    }
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    c.getContext('2d').drawImage(img, 0, 0, width, height);
    resolve(c.toDataURL('image/jpeg', 0.6));
  };
  img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('bad image')); };
  img.src = objectUrl;
});

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 13px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, outline: 'none',
};
const labelStyle = { fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 5 };

const InvoicesPage = () => {
  const { user } = useTickets();
  const myEmail = (user?.email || '').toLowerCase();
  const myName = user?.displayName || user?.email || '';
  const isChef = user?.role === 'chef';
  const myClub = user?.club?.toUpperCase() || null;

  const [problems, setProblems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [clubFilter, setClubFilter] = useState('ALL'); // только для шефа
  const [showAddProblem, setShowAddProblem] = useState(false);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoView, setPhotoView] = useState(null);
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  const cleanedRef = useRef(false);

  const emptyProblem = { desc: '', photos: [], club: myClub || '4YOU' };
  const emptyInvoice = { workDesc: '', workDate: new Date().toISOString().slice(0, 10), amount: '', photos: [], club: myClub || '4YOU', problemIds: [] };
  const [pForm, setPForm] = useState(emptyProblem);
  const [iForm, setIForm] = useState(emptyInvoice);

  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    const un1 = onSnapshot(collection(db, 'equip_problems'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
      setProblems(list);
    }, err => console.error('[equip_problems]', err));
    const un2 = onSnapshot(collection(db, 'invoices'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
      setInvoices(list);
      // Хранение месяц: старые счета чистим один раз за сессию
      if (!cleanedRef.current) {
        cleanedRef.current = true;
        const cutoff = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
        list.filter(i => (i.createdAtISO || '') < cutoff).forEach(i => {
          deleteDoc(doc(db, 'invoices', i.id)).catch(() => {});
          (i.problemIds || []).forEach(pid => deleteDoc(doc(db, 'equip_problems', pid)).catch(() => {}));
        });
      }
    }, err => console.error('[invoices]', err));
    return () => { un1(); un2(); };
  }, []);

  const clubOk = (c) => isChef ? (clubFilter === 'ALL' || c === clubFilter) : c === myClub;

  // Проблемы без счёта — отдельные карточки; прикреплённые к счёту живут внутри него
  const openProblems = useMemo(
    () => problems.filter(p => clubOk(p.club) && (p.status || 'new') !== 'invoiced')
      .sort((a, b) => {
        const w = (s) => s === 'new' ? 0 : s === 'repair_approved' ? 1 : 2;
        return w(a.status || 'new') - w(b.status || 'new') || (b.createdAtISO || '').localeCompare(a.createdAtISO || '');
      }),
    [problems, isChef, myClub, clubFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const visibleInvoices = useMemo(
    () => invoices.filter(i => clubOk(i.club))
      .sort((a, b) => {
        const ap = (a.status || 'pending') === 'pending' ? 0 : 1;
        const bp = (b.status || 'pending') === 'pending' ? 0 : 1;
        return ap - bp || (b.createdAtISO || '').localeCompare(a.createdAtISO || '');
      }),
    [invoices, isChef, myClub, clubFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const problemById = useMemo(() => Object.fromEntries(problems.map(p => [p.id, p])), [problems]);

  // Одобренные к ремонту проблемы клуба — их можно закрыть загружаемым счётом
  const attachableProblems = useMemo(() => {
    const club = isChef ? iForm.club : myClub;
    return problems.filter(p => p.club === club && (p.status || 'new') === 'repair_approved');
  }, [problems, isChef, myClub, iForm.club]);

  // ── Фото: общий обработчик (фото сжимаются; в счёте разрешён и PDF ≤700КБ) ──
  const handleFiles = (setter, allowPdf) => async (ev) => {
    const files = [...(ev.target.files || [])].slice(0, 3);
    for (const f of files) {
      if (allowPdf && f.type === 'application/pdf') {
        if (f.size > 700 * 1024) { toast.error(`PDF «${f.name}» больше 700 КБ — сфотографируйте счёт или сожмите файл`); continue; }
        const data = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result); r.onerror = rej;
          r.readAsDataURL(f);
        }).catch(() => null);
        if (data) setter(prev => ({ ...prev, photos: [...prev.photos, data].slice(0, 3) }));
        continue;
      }
      if (!f.type.startsWith('image/')) { toast.error(`«${f.name}»: поддерживаются фото${allowPdf ? ' и PDF' : ''}`); continue; }
      try {
        const b = await compressPhoto(f);
        setter(prev => ({ ...prev, photos: [...prev.photos, b].slice(0, 3) }));
      } catch {
        toast.error(/hei[cf]/i.test(f.type + f.name)
          ? 'Формат HEIC не открывается в браузере — в настройках камеры iPhone выберите «Наиболее совместимые» или пришлите скриншот'
          : 'Не удалось обработать фото — попробуйте другой файл');
      }
    }
    ev.target.value = '';
  };

  const isPdf = (p) => typeof p === 'string' && p.startsWith('data:application/pdf');
  const openAttachment = (p) => {
    if (!isPdf(p)) { setPhotoView(p); return; }
    try {
      const b64 = p.slice(p.indexOf(',') + 1);
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { toast.error('Не удалось открыть PDF'); }
  };

  // ── Проблема тренажёра ──
  const createProblem = async () => {
    if (!pForm.desc.trim()) return toast.error('Опишите проблему тренажёра');
    if (pForm.photos.length === 0) return toast.error('Прикрепите фото тренажёра');
    const club = isChef ? pForm.club : myClub;
    if (!club) return toast.error('Не определён клуб');
    setSaving(true);
    try {
      await addDoc(collection(db, 'equip_problems'), {
        club, desc: pForm.desc.trim(), photos: pForm.photos,
        status: 'new',
        createdByName: myName, createdByEmail: myEmail,
        createdAtISO: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
      pushNotify({
        title: '🏋️ Тренажёр: новая проблема · ' + club,
        body: `${pForm.desc.trim().slice(0, 90)} — ${myName}`,
        roles: ['chef'], excludeEmail: myEmail, url: '/invoices', tag: 'equip',
      });
      toast.success('Проблема отправлена шефу на решение');
      setShowAddProblem(false);
      setPForm({ ...emptyProblem, club });
    } catch (e) { console.error(e); toast.error('Не удалось сохранить'); }
    finally { setSaving(false); }
  };

  const decideProblem = async (p, status) => {
    let note = null;
    if (status === 'rejected') note = window.prompt('Почему не чиним (видно менеджеру):', '') || null;
    try {
      await updateDoc(doc(db, 'equip_problems', p.id), {
        status, decidedBy: myName, decidedAtISO: new Date().toISOString(),
        ...(note !== null ? { rejectNote: note } : {}),
        updatedAt: serverTimestamp(),
      });
      toast.success(status === 'repair_approved' ? 'Ремонт одобрен' : 'Ремонт отклонён');
      if (p.createdByEmail && p.createdByEmail !== myEmail) {
        pushNotify({
          title: status === 'repair_approved' ? '🔧 Ремонт одобрен — можно чинить' : '❌ Ремонт отклонён',
          body: `${p.club}: ${(p.desc || '').slice(0, 70)}${note ? ` · ${note.slice(0, 60)}` : ''}`,
          emails: [p.createdByEmail], url: '/invoices', tag: 'equip',
        });
      }
    } catch { toast.error('Не удалось изменить статус'); }
  };

  const deleteProblem = async (p) => {
    if (!window.confirm('Удалить проблему?')) return;
    try { await deleteDoc(doc(db, 'equip_problems', p.id)); toast.success('Удалена'); }
    catch { toast.error('Не удалось удалить'); }
  };

  // ── Счёт на оплату ──
  const createInvoice = async () => {
    if (!iForm.workDesc.trim()) return toast.error('Опишите, за какую работу счёт');
    const amountNum = Number(String(iForm.amount).replace(/\s/g, ''));
    if (!iForm.amount.trim() || !amountNum) return toast.error('Укажите сумму счёта');
    if (iForm.photos.length === 0) return toast.error('Прикрепите фото или PDF счёта');
    if (iForm.photos.reduce((n, p) => n + p.length, 0) > 900 * 1024) {
      return toast.error('Вложения слишком большие — оставьте не больше одного PDF или уберите лишнее фото');
    }
    const club = isChef ? iForm.club : myClub;
    if (!club) return toast.error('Не определён клуб');
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'invoices'), {
        club,
        workDesc: iForm.workDesc.trim(),
        workDateISO: iForm.workDate || null,
        amount: amountNum,
        photos: iForm.photos,
        problemIds: iForm.problemIds,
        status: 'pending',
        createdByName: myName, createdByEmail: myEmail,
        createdAtISO: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
      // Выбранные проблемы прикрепляются к счёту и уходят из списка проблем
      await Promise.all(iForm.problemIds.map(pid =>
        updateDoc(doc(db, 'equip_problems', pid), { status: 'invoiced', invoiceId: ref.id, updatedAt: serverTimestamp() }).catch(() => {})
      ));
      pushNotify({
        title: '🧾 Счёт за ремонт · ' + club,
        body: `${iForm.workDesc.trim().slice(0, 70)} · ${amountNum.toLocaleString('ru-RU')} ₸${iForm.problemIds.length ? ` · проблем: ${iForm.problemIds.length}` : ''} — ${myName}`,
        roles: ['chef'], excludeEmail: myEmail, url: '/invoices', tag: 'equip',
      });
      toast.success('Счёт отправлен шефу на подтверждение оплаты');
      setShowAddInvoice(false);
      setIForm({ ...emptyInvoice, club });
    } catch (e) { console.error(e); toast.error('Не удалось сохранить счёт'); }
    finally { setSaving(false); }
  };

  const decideInvoice = async (inv, status) => {
    let rejectNote = null;
    if (status === 'rejected') rejectNote = window.prompt('Причина отклонения (видна менеджеру):', '') || null;
    try {
      await updateDoc(doc(db, 'invoices', inv.id), {
        status, decidedBy: myName, decidedAtISO: new Date().toISOString(),
        ...(rejectNote !== null ? { rejectNote } : {}),
        updatedAt: serverTimestamp(),
      });
      // Оплата подтверждена → очередь HJ Fin (fin.herosjourney.kz). Отправитель
      // подключится, когда команда HJ Fin даст API; очередь переживает чистку счетов.
      if (status === 'approved') {
        addDoc(collection(db, 'hjfin_outbox'), {
          invoiceId: inv.id,
          club: inv.club, workDesc: inv.workDesc || '', workDateISO: inv.workDateISO || null,
          amount: inv.amount ?? null, photos: inv.photos || [],
          problems: (inv.problemIds || []).map(pid => ({ id: pid, desc: problemById[pid]?.desc || '' })),
          createdByName: inv.createdByName || '', createdByEmail: inv.createdByEmail || '',
          invoiceCreatedAtISO: inv.createdAtISO || null,
          approvedBy: myName, approvedAtISO: new Date().toISOString(),
          status: 'pending', // pending → sent (проставит отправитель)
        }).catch(e => console.error('[hjfin_outbox]', e));
      }
      toast.success(status === 'approved' ? 'Оплата подтверждена' : 'Счёт отклонён');
      if (inv.createdByEmail && inv.createdByEmail !== myEmail) {
        pushNotify({
          title: status === 'approved' ? '✅ Оплата счёта подтверждена' : '❌ Счёт отклонён',
          body: `${inv.club}: ${(inv.workDesc || '').slice(0, 70)}${rejectNote ? ` · ${rejectNote.slice(0, 60)}` : ''}`,
          emails: [inv.createdByEmail], url: '/invoices', tag: 'equip',
        });
      }
    } catch { toast.error('Не удалось изменить статус'); }
  };

  const canDeleteInvoice = (inv) => isChef || ((inv.createdByEmail || '').toLowerCase() === myEmail && (inv.status || 'pending') === 'pending');
  const removeInvoice = async (inv) => {
    if (!window.confirm('Удалить счёт? Прикреплённые проблемы вернутся в список.')) return;
    try {
      await deleteDoc(doc(db, 'invoices', inv.id));
      // Проблемы возвращаются в «ремонт одобрен», чтобы не потерялись
      (inv.problemIds || []).forEach(pid =>
        updateDoc(doc(db, 'equip_problems', pid), { status: 'repair_approved', invoiceId: null }).catch(() => {})
      );
      toast.success('Счёт удалён');
    } catch { toast.error('Не удалось удалить'); }
  };

  const canDeleteProblem = (p) => isChef || ((p.createdByEmail || '').toLowerCase() === myEmail && (p.status || 'new') === 'new');

  const fmtDate = (iso) => { try { return format(new Date(iso), 'd MMM HH:mm', { locale: ru }); } catch { return ''; } };
  const fmtWorkDate = (d) => { try { return format(new Date(d + 'T00:00:00'), 'd MMMM yyyy', { locale: ru }); } catch { return d || ''; } };

  const chipStyle = (active) => ({
    padding: isMobile ? '8px 14px' : '7px 14px', borderRadius: isMobile ? 999 : 8, cursor: 'pointer',
    fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0,
    border: active ? '1px solid var(--text-secondary)' : '1px solid var(--border)',
    background: active ? 'var(--bg-hover)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
  });
  const actionBtn = (color, filled) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: isMobile ? '11px 16px' : '8px 15px', borderRadius: 9,
    border: `1px solid ${color}55`, background: filled ? `${color}1a` : 'transparent', color,
    fontSize: 11.5, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
  });
  const mInput = isMobile ? { ...inputStyle, fontSize: 16 } : inputStyle;
  const sectionTitle = { fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', margin: '6px 0 0' };

  const renderPhotos = (photos, size = 84) => (photos || []).length > 0 && (
    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
      {photos.map((p, i) => isPdf(p) ? (
        <button key={i} onClick={() => openAttachment(p)} style={{ width: size, height: size, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--text-secondary)' }}>
          <Receipt size={20} />
          <span style={{ fontSize: 9.5, fontWeight: 900 }}>PDF</span>
        </button>
      ) : (
        <img key={i} src={p} alt="" onClick={() => openAttachment(p)}
          style={{ width: size, height: size, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', cursor: 'zoom-in' }} />
      ))}
    </div>
  );

  const photoPicker = (form, setter, allowPdf) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {form.photos.map((p, i) => (
        <div key={i} style={{ position: 'relative' }}>
          {isPdf(p) ? (
            <div style={{ width: 74, height: 74, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--text-secondary)' }}>
              <Receipt size={18} />
              <span style={{ fontSize: 9, fontWeight: 900 }}>PDF</span>
            </div>
          ) : (
            <img src={p} alt="" style={{ width: 74, height: 74, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
          )}
          <button onClick={() => setter(f => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }))}
            style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--text-muted)', color: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}>
            <X size={11} />
          </button>
        </div>
      ))}
      {form.photos.length < 3 && (
        <label style={{ width: 74, height: 74, borderRadius: 10, border: '1.5px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: 'var(--text-muted)' }}>
          <Camera size={18} />
          <span style={{ fontSize: 9, fontWeight: 800 }}>Файл</span>
          <input type="file" accept={allowPdf ? 'image/*,application/pdf' : 'image/*'} multiple onChange={handleFiles(setter, allowPdf)} style={{ display: 'none' }} />
        </label>
      )}
    </div>
  );

  const clubSelect = (form, setter) => isChef && (
    <div>
      <div style={labelStyle}>Клуб *</div>
      <select value={form.club} onChange={e => setter(f => ({ ...f, club: e.target.value }))} style={mInput}>
        {CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );

  const modalShell = (onClose, title, children) => ReactDOM.createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: isMobile ? '100%' : 470, maxHeight: isMobile ? '92dvh' : '86vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? '20px 20px 0 0' : 18, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Dumbbell size={18} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>Тренажеры</h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>
            Проблема → шеф решает «чинить?» → счёт → шеф подтверждает оплату{!isChef && myClub ? ` · клуб ${myClub}` : ''}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => { setPForm({ ...emptyProblem, club: myClub || pForm.club }); setShowAddProblem(true); }} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
          }}>
            <Wrench size={14} /> Сообщить о проблеме
          </button>
          <button onClick={() => { setIForm({ ...emptyInvoice, club: myClub || iForm.club }); setShowAddInvoice(true); }} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10,
            border: '1px solid var(--accent-purple)', background: 'var(--accent-purple)', color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
          }}>
            <Plus size={14} /> Загрузить счёт
          </button>
        </div>
      </div>

      {/* Фильтр по клубу — только шефу */}
      {isChef && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', paddingBottom: isMobile ? 2 : 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', flexShrink: 0 }}>Клуб:</span>
          {['ALL', ...CLUBS].map(c => (
            <button key={c} onClick={() => setClubFilter(c)} style={chipStyle(clubFilter === c)}>
              {c === 'ALL' ? 'Все' : c}
              <span style={{ marginLeft: 6, opacity: 0.6, fontWeight: 700 }}>
                {c === 'ALL'
                  ? problems.filter(p => (p.status || 'new') !== 'invoiced').length + invoices.length
                  : problems.filter(p => p.club === c && (p.status || 'new') !== 'invoiced').length + invoices.filter(i => i.club === c).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Проблемы тренажёров ── */}
      <div style={sectionTitle}>Проблемы тренажёров · {openProblems.length}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {openProblems.length === 0 ? (
          <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 14 }}>
            Открытых проблем нет — «Сообщить о проблеме», если тренажёр сломался
          </div>
        ) : openProblems.map(p => {
          const st = P_STATUSES[p.status || 'new'];
          return (
            <div key={p.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: isMobile ? '13px 14px' : '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: st.color }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color }} /> {st.label}
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{p.club}</span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.desc}</div>
              {renderPhotos(p.photos)}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><User size={11} /> {p.createdByName}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>· <Clock size={11} /> {fmtDate(p.createdAtISO)}</span>
                {p.decidedBy && (p.status === 'repair_approved' || p.status === 'rejected') && (
                  <span>· {p.status === 'repair_approved' ? 'одобрил' : 'отклонил'} {p.decidedBy}</span>
                )}
              </div>
              {p.rejectNote && p.status === 'rejected' && (
                <div style={{ marginTop: 7, fontSize: 11.5, fontWeight: 600, color: '#9c7d7d', background: 'rgba(156,125,125,0.08)', border: '1px solid rgba(156,125,125,0.25)', borderRadius: 9, padding: '7px 11px' }}>
                  Причина: {p.rejectNote}
                </div>
              )}
              <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap', alignItems: 'center' }}>
                {isChef && (p.status || 'new') === 'new' && (
                  <>
                    <button onClick={() => decideProblem(p, 'repair_approved')} style={actionBtn('#7A94B8', true)}>
                      <Wrench size={13} /> Чинить
                    </button>
                    <button onClick={() => decideProblem(p, 'rejected')} style={actionBtn('#9c7d7d')}>
                      <Ban size={13} /> Не чинить
                    </button>
                  </>
                )}
                {isChef && p.status === 'rejected' && (
                  <button onClick={() => decideProblem(p, 'repair_approved')} style={{ ...actionBtn('var(--text-secondary)'), border: '1px solid var(--border)', textTransform: 'none', letterSpacing: 0, fontWeight: 800 }}>↩ Всё-таки чинить</button>
                )}
                {p.status === 'repair_approved' && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)' }}>Ждёт счёта — при загрузке счёта отметьте эту проблему</span>
                )}
                {canDeleteProblem(p) && (
                  <button onClick={() => deleteProblem(p)} title="Удалить" style={{ marginLeft: 'auto', padding: isMobile ? 10 : 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 0, opacity: 0.55 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Счета на оплату ── */}
      <div style={sectionTitle}>Счета на оплату · {visibleInvoices.length}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleInvoices.length === 0 ? (
          <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 14 }}>
            Счетов пока нет
          </div>
        ) : visibleInvoices.map(inv => {
          const st = I_STATUSES[inv.status || 'pending'];
          const attached = (inv.problemIds || []).map(pid => problemById[pid]).filter(Boolean);
          return (
            <div key={inv.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: isMobile ? '13px 14px' : '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: st.color }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color }} /> {st.label}
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{inv.club}</span>
                {inv.amount != null && (
                  <span style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--text-primary)' }}>{Number(inv.amount).toLocaleString('ru-RU')} ₸</span>
                )}
              </div>

              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{inv.workDesc}</div>
              {inv.workDateISO && (
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>Работа: {fmtWorkDate(inv.workDateISO)}</div>
              )}
              {renderPhotos(inv.photos)}

              {/* Проблемы, которые закрывает этот счёт — «одно окошко» */}
              {attached.length > 0 && (
                <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Закрывает проблемы · {attached.length}</div>
                  {attached.map(p => (
                    <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
                      {(p.photos || [])[0] && !isPdf(p.photos[0]) && (
                        <img src={p.photos[0]} alt="" onClick={() => openAttachment(p.photos[0])}
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in', flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{p.desc}</div>
                        <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>{p.createdByName} · {fmtDate(p.createdAtISO)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><User size={11} /> {inv.createdByName}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>· <Clock size={11} /> загружен {fmtDate(inv.createdAtISO)}</span>
                {inv.decidedBy && inv.status !== 'pending' && (
                  <span>· {inv.status === 'approved' ? 'подтвердил' : 'отклонил'} {inv.decidedBy} {fmtDate(inv.decidedAtISO)}</span>
                )}
              </div>
              {inv.rejectNote && inv.status === 'rejected' && (
                <div style={{ marginTop: 7, fontSize: 11.5, fontWeight: 600, color: '#9c7d7d', background: 'rgba(156,125,125,0.08)', border: '1px solid rgba(156,125,125,0.25)', borderRadius: 9, padding: '7px 11px' }}>
                  Причина: {inv.rejectNote}
                </div>
              )}

              <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap', alignItems: 'center' }}>
                {isChef && (inv.status || 'pending') === 'pending' && (
                  <>
                    <button onClick={() => decideInvoice(inv, 'approved')} style={actionBtn('#7d9c87', true)}>
                      <Check size={13} /> Подтвердить оплату
                    </button>
                    <button onClick={() => decideInvoice(inv, 'rejected')} style={actionBtn('#9c7d7d')}>
                      <Ban size={13} /> Отклонить
                    </button>
                  </>
                )}
                {isChef && inv.status === 'rejected' && (
                  <button onClick={() => decideInvoice(inv, 'approved')} style={{ ...actionBtn('var(--text-secondary)'), border: '1px solid var(--border)', textTransform: 'none', letterSpacing: 0, fontWeight: 800 }}>↩ Всё-таки оплатить</button>
                )}
                {canDeleteInvoice(inv) && (
                  <button onClick={() => removeInvoice(inv)} title="Удалить" style={{ marginLeft: 'auto', padding: isMobile ? 10 : 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 0, opacity: 0.55 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Модалка «Сообщить о проблеме» */}
      {showAddProblem && modalShell(() => setShowAddProblem(false), 'Проблема тренажёра' + (!isChef && myClub ? ` · ${myClub}` : ''), (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {clubSelect(pForm, setPForm)}
          <div>
            <div style={labelStyle}>Что случилось *</div>
            <textarea value={pForm.desc} onChange={e => setPForm(f => ({ ...f, desc: e.target.value }))} rows={3}
              placeholder="Например: беговая дорожка №3 — скрипит полотно, останавливается под нагрузкой"
              style={{ ...mInput, resize: 'vertical', minHeight: 68, fontFamily: 'inherit' }} />
          </div>
          <div>
            <div style={labelStyle}>Фото тренажёра * (до 3)</div>
            {photoPicker(pForm, setPForm, false)}
          </div>
          <button onClick={createProblem} disabled={saving} style={{
            padding: '13px', borderRadius: 12, border: 'none', background: 'var(--accent-purple)', color: '#fff',
            fontSize: 12.5, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: saving ? 0.6 : 1,
          }}>
            {saving ? 'Сохранение…' : 'Отправить шефу на решение'}
          </button>
        </div>
      ))}

      {/* Модалка «Загрузить счёт» */}
      {showAddInvoice && modalShell(() => setShowAddInvoice(false), 'Счёт на оплату ремонта' + (!isChef && myClub ? ` · ${myClub}` : ''), (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {clubSelect(iForm, setIForm)}
          <div>
            <div style={labelStyle}>За какую работу счёт *</div>
            <textarea value={iForm.workDesc} onChange={e => setIForm(f => ({ ...f, workDesc: e.target.value }))} rows={3}
              placeholder="Например: замена полотна и ТО беговой дорожки №3"
              style={{ ...mInput, resize: 'vertical', minHeight: 68, fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={labelStyle}>Когда была работа</div>
              <input type="date" value={iForm.workDate} onChange={e => setIForm(f => ({ ...f, workDate: e.target.value }))}
                onClick={e => { try { e.target.showPicker(); } catch {} }} style={mInput} />
            </div>
            <div>
              <div style={labelStyle}>Сумма, ₸ *</div>
              <input type="text" inputMode="numeric" value={iForm.amount} onChange={e => setIForm(f => ({ ...f, amount: e.target.value.replace(/[^\d\s]/g, '') }))}
                placeholder="Например: 45 000" style={mInput} />
            </div>
          </div>

          {/* Какие одобренные проблемы закрывает счёт */}
          <div>
            <div style={labelStyle}>Какие проблемы закрывает счёт</div>
            {attachableProblems.length === 0 ? (
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', padding: '8px 2px' }}>
                Нет одобренных к ремонту проблем{isChef ? ' в этом клубе' : ''} — счёт можно загрузить и без привязки
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {attachableProblems.map(p => {
                  const on = iForm.problemIds.includes(p.id);
                  return (
                    <label key={p.id} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: on ? '1px solid var(--accent-purple)' : '1px solid var(--border)', background: on ? 'rgba(125,111,179,0.08)' : 'var(--bg-hover)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={on}
                        onChange={() => setIForm(f => ({ ...f, problemIds: on ? f.problemIds.filter(x => x !== p.id) : [...f.problemIds, p.id] }))}
                        style={{ accentColor: 'var(--accent-purple)', width: 15, height: 15, flexShrink: 0 }} />
                      {(p.photos || [])[0] && !isPdf(p.photos[0]) && (
                        <img src={p.photos[0]} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--border)', flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{p.desc}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div style={labelStyle}>Фото или PDF счёта * (до 3, фото сжимаются сами)</div>
            {photoPicker(iForm, setIForm, true)}
          </div>
          <button onClick={createInvoice} disabled={saving} style={{
            padding: '13px', borderRadius: 12, border: 'none', background: 'var(--accent-purple)', color: '#fff',
            fontSize: 12.5, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: saving ? 0.6 : 1,
          }}>
            {saving ? 'Сохранение…' : 'Отправить на подтверждение оплаты'}
          </button>
        </div>
      ))}

      {/* Просмотр фото на весь экран */}
      {photoView && ReactDOM.createPortal(
        <div onClick={() => setPhotoView(null)} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, cursor: 'zoom-out' }}>
          <img src={photoView} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10 }} />
        </div>,
        document.body
      )}
    </div>
  );
};

export default InvoicesPage;
