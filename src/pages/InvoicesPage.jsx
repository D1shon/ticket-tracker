import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Receipt, Plus, X, Clock, Check, Ban, Trash2, User, Camera } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useTickets } from '../store/TicketContext';
import { isMobileDevice } from '../lib/isMobile';
import { pushNotify } from '../lib/pushNotify';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

/*
 * Счета на оплату — менеджеры загружают счета (фото + описание работы и дата),
 * шеф подтверждает или отклоняет. Каждый клуб видит только свои счета,
 * шеф — все с фильтром. Хранение: коллекция invoices, всё старше 31 дня
 * удаляется автоматически при открытии страницы.
 */

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];

const STATUSES = {
  pending:  { label: 'Ждёт подтверждения', color: '#b39a5e' },
  approved: { label: 'Подтверждён',        color: '#7d9c87' },
  rejected: { label: 'Отклонён',           color: '#9c7d7d' },
};

// Сжатие фото счёта: до 1280px по большей стороне, JPEG 0.6 — текст на счёте
// остаётся читаемым, а файл лёгкий (обычно 100–300 КБ вместо мегабайтов)
const compressInvoicePhoto = (file) => new Promise((resolve, reject) => {
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

const InvoicesPage = () => {
  const { user } = useTickets();
  const myEmail = (user?.email || '').toLowerCase();
  const myName = user?.displayName || user?.email || '';
  const isChef = user?.role === 'chef';
  const myClub = user?.club?.toUpperCase() || null;

  const [invoices, setInvoices] = useState([]);
  const [clubFilter, setClubFilter] = useState('ALL'); // только для шефа
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoView, setPhotoView] = useState(null);
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  const [form, setForm] = useState({ workDesc: '', workDate: new Date().toISOString().slice(0, 10), amount: '', photos: [], club: myClub || '4YOU' });
  const cleanedRef = useRef(false);

  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'invoices'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
      setInvoices(list);

      // Хранение месяц: всё старше 31 дня тихо удаляем (один раз за сессию)
      if (!cleanedRef.current) {
        cleanedRef.current = true;
        const cutoff = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
        list.filter(i => (i.createdAtISO || '') < cutoff)
          .forEach(i => deleteDoc(doc(db, 'invoices', i.id)).catch(() => {}));
      }
    }, err => console.error('[invoices]', err));
  }, []);

  const visible = useMemo(() => {
    let list = invoices;
    if (!isChef) list = list.filter(i => i.club === myClub);
    else if (clubFilter !== 'ALL') list = list.filter(i => i.club === clubFilter);
    if (statusFilter !== 'ALL') list = list.filter(i => (i.status || 'pending') === statusFilter);
    // Ожидающие всегда сверху, внутри — свежие первыми
    return [...list].sort((a, b) => {
      const ap = (a.status || 'pending') === 'pending' ? 0 : 1;
      const bp = (b.status || 'pending') === 'pending' ? 0 : 1;
      return ap - bp || (b.createdAtISO || '').localeCompare(a.createdAtISO || '');
    });
  }, [invoices, isChef, myClub, clubFilter, statusFilter]);

  const counts = useMemo(() => {
    const base = isChef ? (clubFilter === 'ALL' ? invoices : invoices.filter(i => i.club === clubFilter)) : invoices.filter(i => i.club === myClub);
    const c = { ALL: base.length, pending: 0, approved: 0, rejected: 0 };
    base.forEach(i => { c[i.status || 'pending'] = (c[i.status || 'pending'] || 0) + 1; });
    return c;
  }, [invoices, isChef, myClub, clubFilter]);

  // Принимаем фото И PDF (счета обычно приходят PDF-файлами). PDF кладём как есть
  // (лимит документа Firestore 1 МБ), картинки сжимаем. HEIC с iPhone браузер
  // декодировать не умеет — говорим об этом прямо, а не молчим.
  const onPhoto = async (ev) => {
    const files = [...(ev.target.files || [])].slice(0, 3);
    for (const f of files) {
      if (f.type === 'application/pdf') {
        if (f.size > 700 * 1024) { toast.error(`PDF «${f.name}» больше 700 КБ — сфотографируйте счёт или сожмите файл`); continue; }
        const data = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result); r.onerror = rej;
          r.readAsDataURL(f);
        }).catch(() => null);
        if (data) setForm(prev => ({ ...prev, photos: [...prev.photos, data].slice(0, 3) }));
        continue;
      }
      if (!f.type.startsWith('image/') ) { toast.error(`«${f.name}»: поддерживаются фото и PDF`); continue; }
      try {
        const b = await compressInvoicePhoto(f);
        setForm(prev => ({ ...prev, photos: [...prev.photos, b].slice(0, 3) }));
      } catch {
        toast.error(/hei[cf]/i.test(f.type + f.name)
          ? 'Формат HEIC не открывается в браузере — в настройках камеры iPhone выберите «Наиболее совместимые» или пришлите скриншот счёта'
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

  const handleCreate = async () => {
    if (!form.workDesc.trim()) return toast.error('Опишите, за какую работу счёт');
    const amountNum = Number(String(form.amount).replace(/\s/g, ''));
    if (!form.amount.trim() || !amountNum) return toast.error('Укажите сумму счёта');
    if (form.photos.length === 0) return toast.error('Прикрепите фото или PDF счёта');
    // Лимит документа Firestore — 1 МБ: не даём собрать вложения тяжелее ~900 КБ
    if (form.photos.reduce((n, p) => n + p.length, 0) > 900 * 1024) {
      return toast.error('Вложения слишком большие — оставьте не больше одного PDF или уберите лишнее фото');
    }
    // Менеджер заперт на своём клубе; шеф выбирает клуб в форме
    const club = isChef ? (form.club || '4YOU') : myClub;
    if (!club) return toast.error('Не определён клуб');
    setSaving(true);
    try {
      await addDoc(collection(db, 'invoices'), {
        club,
        workDesc: form.workDesc.trim(),
        workDateISO: form.workDate || null,
        amount: amountNum,
        photos: form.photos,
        status: 'pending',
        createdByName: myName, createdByEmail: myEmail,
        createdAtISO: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
      pushNotify({
        title: '🧾 Счёт на оплату · ' + club,
        body: `${form.workDesc.trim().slice(0, 80)}${form.amount ? ` · ${Number(String(form.amount).replace(/\s/g, '')).toLocaleString('ru-RU')} ₸` : ''} — ${myName}`,
        roles: ['chef'], excludeEmail: myEmail, url: '/invoices', tag: 'invoice',
      });
      toast.success('Счёт отправлен на подтверждение');
      setShowAdd(false);
      setForm({ workDesc: '', workDate: new Date().toISOString().slice(0, 10), amount: '', photos: [], club: myClub || form.club || '4YOU' });
    } catch (e) { console.error(e); toast.error('Не удалось сохранить счёт'); }
    finally { setSaving(false); }
  };

  const decide = async (inv, status) => {
    let rejectNote = null;
    if (status === 'rejected') {
      rejectNote = window.prompt('Причина отклонения (видна менеджеру):', '') || null;
    }
    try {
      await updateDoc(doc(db, 'invoices', inv.id), {
        status, decidedBy: myName, decidedAtISO: new Date().toISOString(),
        ...(rejectNote !== null ? { rejectNote } : {}),
        updatedAt: serverTimestamp(),
      });
      // Подтверждённый счёт — в очередь на отправку в HJ Fin (fin.herosjourney.kz).
      // Отправитель подключится, когда команда HJ Fin даст API; очередь не чистится
      // вместе со счетами, так что ничего не потеряется и уедет задним числом.
      if (status === 'approved') {
        addDoc(collection(db, 'hjfin_outbox'), {
          invoiceId: inv.id,
          club: inv.club, workDesc: inv.workDesc || '', workDateISO: inv.workDateISO || null,
          amount: inv.amount ?? null, photos: inv.photos || [],
          createdByName: inv.createdByName || '', createdByEmail: inv.createdByEmail || '',
          invoiceCreatedAtISO: inv.createdAtISO || null,
          approvedBy: myName, approvedAtISO: new Date().toISOString(),
          status: 'pending', // pending → sent (проставит отправитель)
        }).catch(e => console.error('[hjfin_outbox]', e));
      }
      toast.success(status === 'approved' ? 'Счёт подтверждён' : 'Счёт отклонён');
      if (inv.createdByEmail && inv.createdByEmail !== myEmail) {
        pushNotify({
          title: status === 'approved' ? '✅ Счёт подтверждён' : '❌ Счёт отклонён',
          body: `${inv.club}: ${(inv.workDesc || '').slice(0, 70)}${rejectNote ? ` · ${rejectNote.slice(0, 60)}` : ''}`,
          emails: [inv.createdByEmail], url: '/invoices', tag: 'invoice',
        });
      }
    } catch { toast.error('Не удалось изменить статус'); }
  };

  const canDelete = (inv) => isChef || ((inv.createdByEmail || '').toLowerCase() === myEmail && (inv.status || 'pending') === 'pending');
  const removeInvoice = async (inv) => {
    if (!window.confirm('Удалить счёт?')) return;
    try { await deleteDoc(doc(db, 'invoices', inv.id)); toast.success('Счёт удалён'); }
    catch { toast.error('Не удалось удалить'); }
  };

  const fmtDate = (iso) => { try { return format(new Date(iso), 'd MMM HH:mm', { locale: ru }); } catch { return ''; } };
  const fmtWorkDate = (d) => { try { return format(new Date(d + 'T00:00:00'), 'd MMMM yyyy', { locale: ru }); } catch { return d || ''; } };

  const chipStyle = (active, color) => ({
    padding: isMobile ? '8px 14px' : '7px 14px', borderRadius: isMobile ? 999 : 8, cursor: 'pointer',
    fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0,
    border: active ? `1px solid ${color || 'var(--text-secondary)'}` : '1px solid var(--border)',
    background: active ? 'var(--bg-hover)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
  });
  const mInput = isMobile ? { ...inputStyle, fontSize: 16 } : inputStyle;

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Receipt size={18} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>Счета на оплату</h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>
            {isChef ? 'Подтверждение счетов от клубов · хранятся 1 месяц' : `Клуб ${myClub || ''} · счёт подтверждает шеф · хранятся 1 месяц`}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10,
          border: '1px solid var(--accent-purple)', background: 'var(--accent-purple)', color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
        }}>
          <Plus size={14} /> Загрузить счёт
        </button>
      </div>

      {/* Фильтр по клубу — только шефу */}
      {isChef && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', paddingBottom: isMobile ? 2 : 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', flexShrink: 0 }}>Клуб:</span>
          {['ALL', ...CLUBS].map(c => (
            <button key={c} onClick={() => setClubFilter(c)} style={chipStyle(clubFilter === c)}>
              {c === 'ALL' ? 'Все' : c}
              <span style={{ marginLeft: 6, opacity: 0.6, fontWeight: 700 }}>
                {c === 'ALL' ? invoices.length : invoices.filter(i => i.club === c).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Фильтр по статусу */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', paddingBottom: isMobile ? 2 : 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', flexShrink: 0 }}>Статус:</span>
        {[['ALL', 'Все', null], ['pending', STATUSES.pending.label, STATUSES.pending.color], ['approved', STATUSES.approved.label, STATUSES.approved.color], ['rejected', STATUSES.rejected.label, STATUSES.rejected.color]].map(([id, label, color]) => (
          <button key={id} onClick={() => setStatusFilter(id)} style={chipStyle(statusFilter === id, color ? color + '66' : null)}>
            {color && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, marginRight: 6 }} />}
            {label}
            <span style={{ marginLeft: 6, opacity: 0.6, fontWeight: 700 }}>{counts[id] || 0}</span>
          </button>
        ))}
      </div>

      {/* Список счетов */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.length === 0 ? (
          <div style={{ padding: '32px 12px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600, background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 14 }}>
            {isChef ? 'Счетов пока нет' : 'Счетов пока нет — нажмите «Загрузить счёт»'}
          </div>
        ) : visible.map(inv => {
          const st = STATUSES[inv.status || 'pending'];
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
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>
                Работа: {fmtWorkDate(inv.workDateISO)}
              </div>

              {/* Фото счёта */}
              {(inv.photos || []).length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {inv.photos.map((p, i) => isPdf(p) ? (
                    <button key={i} onClick={() => openAttachment(p)} style={{ width: 84, height: 84, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--text-secondary)' }}>
                      <Receipt size={20} />
                      <span style={{ fontSize: 9.5, fontWeight: 900 }}>PDF</span>
                    </button>
                  ) : (
                    <img key={i} src={p} alt="счёт" onClick={() => openAttachment(p)}
                      style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', cursor: 'zoom-in' }} />
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

              {/* Действия */}
              <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap', alignItems: 'center' }}>
                {isChef && (inv.status || 'pending') === 'pending' && (
                  <>
                    <button onClick={() => decide(inv, 'approved')} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: isMobile ? '11px 16px' : '8px 15px', borderRadius: 9,
                      border: '1px solid #7d9c8755', background: 'rgba(125,156,135,0.1)', color: '#7d9c87', fontSize: 11.5, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      <Check size={13} /> Подтвердить
                    </button>
                    <button onClick={() => decide(inv, 'rejected')} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: isMobile ? '11px 16px' : '8px 15px', borderRadius: 9,
                      border: '1px solid #9c7d7d55', background: 'transparent', color: '#9c7d7d', fontSize: 11.5, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      <Ban size={13} /> Отклонить
                    </button>
                  </>
                )}
                {isChef && inv.status === 'rejected' && (
                  <button onClick={() => decide(inv, 'approved')} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9,
                    border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  }}>↩ Всё-таки подтвердить</button>
                )}
                {canDelete(inv) && (
                  <button onClick={() => removeInvoice(inv)} title="Удалить" style={{ marginLeft: 'auto', padding: isMobile ? 10 : 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 0, opacity: 0.55 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Модалка «Загрузить счёт» */}
      {showAdd && ReactDOM.createPortal(
        <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: isMobile ? '100%' : 460, maxHeight: isMobile ? '92dvh' : '86vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? '20px 20px 0 0' : 18, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>Счёт на оплату{myClub ? ` · ${myClub}` : ''}</div>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isChef && (
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 5 }}>Клуб *</div>
                  <select value={form.club} onChange={e => setForm(f => ({ ...f, club: e.target.value }))} style={mInput}>
                    {CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 5 }}>За какую работу счёт *</div>
                <textarea value={form.workDesc} onChange={e => setForm(f => ({ ...f, workDesc: e.target.value }))} rows={3}
                  placeholder="Например: замена ламп в кардиозоне, вызов сантехника…"
                  style={{ ...mInput, resize: 'vertical', minHeight: 68, fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 5 }}>Когда была работа</div>
                  <input type="date" value={form.workDate} onChange={e => setForm(f => ({ ...f, workDate: e.target.value }))}
                    onClick={e => { try { e.target.showPicker(); } catch {} }} style={mInput} />
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 5 }}>Сумма, ₸ *</div>
                  <input type="text" inputMode="numeric" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/[^\d\s]/g, '') }))}
                    placeholder="Например: 45 000" style={mInput} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 6 }}>Фото или PDF счёта * (до 3, фото сжимаются сами)</div>
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
                      <button onClick={() => setForm(f => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }))}
                        style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--text-muted)', color: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}>
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {form.photos.length < 3 && (
                    <label style={{ width: 74, height: 74, borderRadius: 10, border: '1.5px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <Camera size={18} />
                      <span style={{ fontSize: 9, fontWeight: 800 }}>Файл</span>
                      <input type="file" accept="image/*,application/pdf" multiple onChange={onPhoto} style={{ display: 'none' }} />
                    </label>
                  )}
                </div>
              </div>

              <button onClick={handleCreate} disabled={saving} style={{
                padding: '13px', borderRadius: 12, border: 'none', background: 'var(--accent-purple)', color: '#fff',
                fontSize: 12.5, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'Сохранение…' : 'Отправить на подтверждение'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Просмотр фото на весь экран */}
      {photoView && ReactDOM.createPortal(
        <div onClick={() => setPhotoView(null)} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, cursor: 'zoom-out' }}>
          <img src={photoView} alt="счёт" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10 }} />
        </div>,
        document.body
      )}
    </div>
  );
};

export default InvoicesPage;
