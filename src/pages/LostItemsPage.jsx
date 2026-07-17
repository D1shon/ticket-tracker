import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingBag, Camera, Plus, Trash2, X, Check, Clock, Phone, User } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { pushNotify } from '../lib/pushNotify';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE'];
const MONTH_MS = 30 * 24 * 3600 * 1000;

// Same compression as warehouse photos: 480px JPEG ≈ 25 KB
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
  img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
  img.src = objectUrl;
});

const LostItemsPage = () => {
  const { user } = useTickets();
  const isChef = user?.role === 'chef';
  const userClub = user?.club || null;
  // Chef and managers can delete any item any time; admins — only month-old ones
  const canDeleteAnytime = user?.role === 'chef' || user?.role === 'manager';

  const [activeClub, setActiveClub] = useState(userClub || '4YOU');
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('stored'); // 'stored' | 'returned' | 'old' | 'all'

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  // Return form
  const [returnItem, setReturnItem] = useState(null); // item being returned
  const [returnName, setReturnName] = useState('');
  const [returnPhone, setReturnPhone] = useState('');
  const [returning, setReturning] = useState(false);

  // Fullscreen photo preview
  const [previewPhoto, setPreviewPhoto] = useState(null);

  // Per-club subscription — only the selected club's photos are downloaded
  useEffect(() => {
    const q = query(collection(db, 'lost_items'), where('club', '==', activeClub));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.acceptedAtISO || '').localeCompare(a.acceptedAtISO || ''));
      setItems(list);
    }, err => console.error('[lost_items]', err));
  }, [activeClub]);

  const now = Date.now();
  const oldItems = useMemo(
    () => items.filter(i => i.status === 'stored' && i.acceptedAtISO && (now - new Date(i.acceptedAtISO).getTime()) > MONTH_MS),
    [items, now]
  );

  const visible = useMemo(() => {
    if (filter === 'stored')   return items.filter(i => i.status === 'stored');
    if (filter === 'returned') return items.filter(i => i.status === 'returned');
    if (filter === 'old')      return oldItems;
    return items;
  }, [items, filter, oldItems]);

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Выберите фотографию');
    try {
      setPhoto(await compressImageToBase64(file));
    } catch {
      toast.error('Не удалось обработать фото');
    }
    e.target.value = '';
  };

  const handleAccept = async () => {
    if (!photo) return toast.error('Сначала сфотографируйте вещь');
    setSaving(true);
    try {
      await addDoc(collection(db, 'lost_items'), {
        club: activeClub,
        photo,
        note: note.trim() || '',
        status: 'stored',
        acceptedAtISO: new Date().toISOString(),
        acceptedBy: user?.displayName || user?.email || '',
        createdAt: serverTimestamp(),
      });
      toast.success('Вещь принята на хранение');
      pushNotify({
        title: '🧳 Утерянная вещь принята',
        body: `${activeClub}: ${note.trim() || 'новая вещь'} — принял(а) ${user?.displayName || ''}`,
        club: activeClub,
        excludeEmail: user?.email || '',
        url: '/lost-items',
      });
      setPhoto(null);
      setNote('');
      setShowAdd(false);
    } catch (e) {
      toast.error('Ошибка сохранения: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  // Valid phone: 11+ digits (87771234567 / +7 777 123 45 67)
  const phoneDigits = returnPhone.replace(/\D/g, '');
  const phoneValid = phoneDigits.length >= 11;

  const handleReturn = async () => {
    const phone = returnPhone.trim();
    if (!phoneValid) return toast.error('Укажите полный номер телефона');
    setReturning(true);
    try {
      await updateDoc(doc(db, 'lost_items', returnItem.id), {
        status: 'returned',
        returnedTo: { name: '', phone },
        returnedAtISO: new Date().toISOString(),
        returnedBy: user?.displayName || user?.email || '',
      });
      toast.success(`Вещь возвращена: ${phone}`);
      pushNotify({
        title: '✅ Утерянная вещь возвращена',
        body: `${activeClub}: ${returnItem.note || 'вещь'} → ${phone}`,
        club: activeClub,
        excludeEmail: user?.email || '',
        url: '/lost-items',
      });
      setReturnItem(null);
      setReturnName('');
      setReturnPhone('');
    } catch (e) {
      toast.error('Не удалось сохранить');
    } finally {
      setReturning(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm('Удалить вещь? Это означает, что вещь утилизирована (выкинута).')) return;
    try {
      await deleteDoc(doc(db, 'lost_items', item.id));
      toast.success('Вещь удалена (утилизирована)');
    } catch {
      toast.error('Не удалось удалить');
    }
  };

  const fmtDate = (iso) => {
    try { return format(new Date(iso), 'd MMMM yyyy, HH:mm', { locale: ru }); } catch { return '—'; }
  };
  const daysStored = (iso) => {
    try { return Math.floor((now - new Date(iso).getTime()) / 86400000); } catch { return 0; }
  };

  // Аккаунты без клуба (шефы, Ком-Дир) видят все клубы
  const visibleClubs = (isChef || !userClub) ? CLUBS : [userClub];

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingBag size={20} style={{ color: '#8b5cf6' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Утерянные вещи</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Приём, хранение и возврат забытых вещей</p>
          </div>
        </div>
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
      </div>

      {/* Accept button */}
      <button
        onClick={() => setShowAdd(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '14px 20px', borderRadius: 16, border: 'none',
          background: 'var(--accent-purple)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(139,92,246,0.3)',
        }}
      >
        <Camera size={18} /> Принять вещь
      </button>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { id: 'stored',   label: `Хранятся (${items.filter(i => i.status === 'stored').length})` },
          { id: 'returned', label: `Возвращены (${items.filter(i => i.status === 'returned').length})` },
          { id: 'old',      label: `⚠️ Лежат больше месяца (${oldItems.length})` },
          { id: 'all',      label: 'Все' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: '1px solid ' + (filter === f.id ? (f.id === 'old' ? '#f59e0b' : 'var(--accent-purple)') : 'var(--border)'),
            background: filter === f.id ? (f.id === 'old' ? 'rgba(245,158,11,0.15)' : 'var(--accent-purple)') : 'transparent',
            color: filter === f.id ? (f.id === 'old' ? '#f59e0b' : '#fff') : 'var(--text-muted)',
          }}>{f.label}</button>
        ))}
      </div>

      {filter === 'old' && oldItems.length > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
          Эти вещи хранятся больше месяца — их можно удалить (вещь выкинута)
        </div>
      )}

      {/* Items — compact rows */}
      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
          {filter === 'old' ? 'Нет вещей, лежащих больше месяца' : filter === 'returned' ? 'Возвращённых вещей пока нет' : 'Вещей пока нет'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(item => {
            const isOld = item.status === 'stored' && item.acceptedAtISO && (now - new Date(item.acceptedAtISO).getTime()) > MONTH_MS;
            const accent = item.status === 'returned' ? '#10b981' : isOld ? '#f59e0b' : '#8b5cf6';
            return (
              <div key={item.id} style={{
                background: 'var(--bg-card)', borderRadius: 14,
                border: '1px solid var(--border)', borderLeft: `3px solid ${accent}`,
                padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                {/* Thumbnail — tap to enlarge */}
                <div
                  onClick={() => item.photo && setPreviewPhoto(item.photo)}
                  style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-hover)', flexShrink: 0, cursor: item.photo ? 'zoom-in' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {item.photo
                    ? <img src={item.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <ShoppingBag size={20} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                  }
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      {item.note || 'Без описания'}
                    </span>
                    <span style={{ fontSize: 8, fontWeight: 900, padding: '2px 7px', borderRadius: 6, background: `${accent}18`, color: accent, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                      {item.status === 'returned' ? '✓ Возвращена' : isOld ? `⚠ ${daysStored(item.acceptedAtISO)} дн.` : 'Хранится'}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <Clock size={9} /> {fmtDate(item.acceptedAtISO)}
                    {item.acceptedBy && <span>· {item.acceptedBy}</span>}
                  </div>
                  {item.status === 'returned' && item.returnedTo && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      {item.returnedTo.name && <><User size={9} /> {item.returnedTo.name}</>}
                      <Phone size={9} /> {item.returnedTo.phone}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {item.status === 'stored' && (
                    <button
                      onClick={() => { setReturnItem(item); setReturnName(''); setReturnPhone(''); }}
                      style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Возвращено
                    </button>
                  )}
                  {(isOld || canDeleteAnytime) && (
                    <button
                      onClick={() => handleDelete(item)}
                      title="Удалить вещь"
                      style={{ padding: '8px 9px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', lineHeight: 0 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Fullscreen photo preview ── */}
      {previewPhoto && (
        <div onClick={() => setPreviewPhoto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          <img src={previewPhoto} alt="" style={{ maxWidth: '100%', maxHeight: '90dvh', borderRadius: 16 }} />
          <button onClick={() => setPreviewPhoto(null)} style={{ position: 'fixed', top: 'calc(16px + env(safe-area-inset-top))', right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 12, padding: 10, color: '#fff', cursor: 'pointer', lineHeight: 0 }}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* ── Accept modal ── */}
      {showAdd && (
        <div onClick={() => !saving && setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--bg-card)', borderRadius: 20, border: '1px solid var(--border)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90dvh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Принять вещь · {activeClub}</h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
            </div>

            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} />

            {photo ? (
              <div style={{ position: 'relative' }}>
                <img src={photo} alt="" style={{ width: '100%', borderRadius: 14, display: 'block' }} />
                <button onClick={() => fileRef.current?.click()} style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                  <Camera size={13} /> Переснять
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '40px 20px', borderRadius: 16, border: '2px dashed var(--border)', background: 'var(--bg-hover)',
                color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              }}>
                <Camera size={32} style={{ color: 'var(--accent-purple)' }} />
                Сфотографировать вещь
              </button>
            )}

            <input
              placeholder="Описание (что за вещь, где нашли)…"
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }}
            />

            <button
              onClick={handleAccept}
              disabled={saving || !photo}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '13px', borderRadius: 14, border: 'none',
                background: 'var(--accent-purple)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                opacity: saving || !photo ? 0.5 : 1,
              }}
            >
              <Check size={16} /> {saving ? 'Сохранение…' : 'Принято'}
            </button>
          </div>
        </div>
      )}

      {/* ── Return modal ── */}
      {returnItem && (
        <div onClick={() => !returning && setReturnItem(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--bg-card)', borderRadius: 20, border: '1px solid var(--border)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Возврат вещи</h3>
              <button onClick={() => setReturnItem(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
            </div>
            {returnItem.photo && <img src={returnItem.photo} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 14 }} />}
            <input
              autoFocus
              type="tel"
              placeholder="Номер телефона получателя"
              value={returnPhone}
              onChange={e => setReturnPhone(e.target.value)}
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }}
            />
            <button
              onClick={handleReturn}
              disabled={returning || !phoneValid}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '13px', borderRadius: 14, border: 'none',
                background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                opacity: returning || !phoneValid ? 0.5 : 1,
              }}
            >
              <Check size={16} /> {returning ? 'Сохранение…' : 'Вещь возвращена'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LostItemsPage;
