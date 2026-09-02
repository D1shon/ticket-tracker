import React, { useState, useEffect, useMemo } from 'react';
import { Cross, Plus, Trash2, Camera, X, Minus, Check, Pencil, AlertTriangle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { useTickets } from '../store/TicketContext';
import { pushNotify } from '../lib/pushNotify';
import { isMobileDevice } from '../lib/isMobile';
import { toast } from 'sonner';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];

// Стандартный состав аптечки: приказ МЗ РК № 125 от 10.07.2023 (обязательная база)
// + спортивная надстройка под травмы зала (лёд, глюкоза, тейп, тонометр — см. регламент травм).
const STANDARD_KIT = [
  { name: 'Бинт марлевый стерильный', qty: 5, minQty: 2 },
  { name: 'Бинт марлевый нестерильный', qty: 5, minQty: 2 },
  { name: 'Бинт эластичный', qty: 3, minQty: 1 },
  { name: 'Перевязочный пакет', qty: 3, minQty: 1 },
  { name: 'Лейкопластырь (рулон)', qty: 2, minQty: 1 },
  { name: 'Пластыри бактерицидные (набор)', qty: 2, minQty: 1 },
  { name: 'Жгут кровоостанавливающий', qty: 1, minQty: 1 },
  { name: 'Ножницы тупоконечные', qty: 1, minQty: 1 },
  { name: 'Перчатки медицинские (пары)', qty: 10, minQty: 4 },
  { name: 'Карманная маска для ИВЛ', qty: 1, minQty: 1 },
  { name: 'Салфетки антисептические', qty: 10, minQty: 5 },
  { name: 'Охлаждающий пакет (мгновенный лёд)', qty: 3, minQty: 2 },
  { name: 'Одеяло спасательное (изотермическое)', qty: 1, minQty: 1 },
  { name: 'Косынка-бандаж', qty: 2, minQty: 1 },
  { name: 'Глюкоза / декстроза (таблетки или гель)', qty: 5, minQty: 2 },
  { name: 'Спортивный тейп', qty: 2, minQty: 1 },
  { name: 'Хлоргексидин (флакон)', qty: 2, minQty: 1 },
  { name: 'Тонометр', qty: 1, minQty: 1 },
  { name: 'Инструкция по оказанию первой помощи', qty: 1, minQty: 1 },
];

// Сжатие фото до лёгкого base64 (как на складе): ~480px, ~15–35 КБ
const compressImage = (file) => new Promise((resolve, reject) => {
  const img = new window.Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const MAX = 480;
    let { width, height } = img;
    if (width > MAX || height > MAX) {
      if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
      else { width = Math.round(width * MAX / height); height = MAX; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    resolve(canvas.toDataURL('image/jpeg', 0.65));
  };
  img.onerror = () => reject(new Error('bad image'));
  img.src = url;
});

const FirstAidPage = () => {
  const { user } = useTickets();
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const canSeeAll = ['chef', 'viewer', 'komdir'].includes(user?.role);
  const canEdit = ['chef', 'manager', 'admin'].includes(user?.role);
  const myClub = (user?.club || '').toUpperCase();
  const [club, setClub] = useState(() => (canSeeAll ? '4YOU' : (myClub || '4YOU')));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [photoView, setPhotoView] = useState(null); // item для просмотра фото

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'firstaid_items'), where('club', '==', club));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || '').localeCompare(b.name || '', 'ru'));
      setItems(list);
      setLoading(false);
    }, () => setLoading(false));
  }, [club]);

  const lowCount = useMemo(() => items.filter(i => (i.qty ?? 0) < (i.minQty ?? 0)).length, [items]);

  // Пуш команде клуба при пересечении порога «стало мало» (не спамим на каждый минус)
  const notifyLow = (item, newQty) => {
    pushNotify({
      title: '🩹 Аптечка: заканчивается',
      body: `${item.name} — осталось ${newQty} (минимум ${item.minQty ?? 0}) · ${club}`,
      club,
      excludeEmail: user?.email || '',
      url: '/first-aid',
      tag: `firstaid-${item.id}`,
      roles: ['manager', 'chef', 'admin'],
    });
  };

  const setQty = async (item, newQty) => {
    if (!canEdit) return;
    const qty = Math.max(0, newQty);
    try {
      await updateDoc(doc(db, 'firstaid_items', item.id), { qty, updatedAtISO: new Date().toISOString(), updatedBy: user?.email || '' });
      const min = item.minQty ?? 0;
      if ((item.qty ?? 0) >= min && qty < min) notifyLow(item, qty);
    } catch { toast.error('Не удалось сохранить'); }
  };

  const setMin = async (item, minQty) => {
    if (!canEdit) return;
    try { await updateDoc(doc(db, 'firstaid_items', item.id), { minQty: Math.max(0, minQty) }); }
    catch { toast.error('Не удалось сохранить'); }
  };

  const saveName = async (item) => {
    const name = editName.trim();
    setEditingId(null);
    if (!name || name === item.name) return;
    try { await updateDoc(doc(db, 'firstaid_items', item.id), { name }); }
    catch { toast.error('Не удалось переименовать'); }
  };

  const removeItem = async (item) => {
    if (!window.confirm(`Удалить «${item.name}» из аптечки ${club}?`)) return;
    try { await deleteDoc(doc(db, 'firstaid_items', item.id)); }
    catch { toast.error('Не удалось удалить'); }
  };

  const addItem = async () => {
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    try {
      await addDoc(collection(db, 'firstaid_items'), {
        club, name, qty: 1, minQty: 1, photo: null,
        order: Date.now(), createdAtISO: new Date().toISOString(), updatedBy: user?.email || '',
      });
    } catch { toast.error('Не удалось добавить'); }
  };

  const onPhoto = async (item, ev) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    try {
      const photo = await compressImage(f);
      await updateDoc(doc(db, 'firstaid_items', item.id), { photo });
      toast.success('Фото добавлено');
    } catch { toast.error('Не удалось загрузить фото'); }
  };

  const removePhoto = async (item) => {
    try { await updateDoc(doc(db, 'firstaid_items', item.id), { photo: null }); setPhotoView(null); }
    catch { toast.error('Не удалось удалить фото'); }
  };

  const seedStandard = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      STANDARD_KIT.forEach((k, i) => {
        batch.set(doc(collection(db, 'firstaid_items')), {
          club, name: k.name, qty: k.qty, minQty: k.minQty, photo: null,
          order: i, createdAtISO: new Date().toISOString(), updatedBy: user?.email || '', seeded: true,
        });
      });
      await batch.commit();
      toast.success('Аптечка заполнена стандартным составом');
    } catch { toast.error('Не удалось заполнить'); }
    finally { setSeeding(false); }
  };

  return (
    <div className="animate-fade" style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 30 }}>
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(176,106,106,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Cross size={20} style={{ color: '#B06A6A' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Аптечка · {club}</h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>
            Стандарт: приказ МЗ РК № 125 + спортивный набор · при нехватке команда клуба получает push
          </p>
        </div>
        {lowCount > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 900, color: '#B06A6A', background: 'rgba(176,106,106,0.12)', border: '1px solid rgba(176,106,106,0.3)', padding: '6px 12px', borderRadius: 10 }}>
            <AlertTriangle size={13} /> Не хватает: {lowCount}
          </span>
        )}
      </div>

      {/* Табы клубов */}
      {canSeeAll && (
        <div style={{ display: 'flex', gap: 6, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', padding: 5, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, width: isMobile ? '100%' : 'fit-content', WebkitOverflowScrolling: 'touch' }}>
          {CLUBS.map(c => (
            <button key={c} onClick={() => setClub(c)} style={{ padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', background: club === c ? 'var(--accent-purple)' : 'transparent', color: club === c ? '#fff' : 'var(--text-secondary)' }}>{c}</button>
          ))}
        </div>
      )}

      {/* Добавить позицию */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
            placeholder="Добавить компонент (название)…"
            className="input-app"
            style={{ flex: 1, borderRadius: 12, padding: '10px 14px', fontSize: 13 }}
          />
          <button onClick={addItem} disabled={!newName.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, border: 'none', cursor: newName.trim() ? 'pointer' : 'not-allowed', background: newName.trim() ? 'var(--accent-purple)' : 'var(--bg-hover)', color: newName.trim() ? '#fff' : 'var(--text-muted)', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
            <Plus size={15} /> Добавить
          </button>
        </div>
      )}

      {/* Список */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Загрузка…</div>
      ) : items.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 18, padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 14 }}>Аптечка клуба {club} пока пуста</div>
          {canEdit && (
            <button onClick={seedStandard} disabled={seeding} style={{ padding: '12px 20px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 800 }}>
              {seeding ? 'Заполняю…' : '📋 Заполнить стандартным составом (19 позиций)'}
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>
          {items.map(item => {
            const low = (item.qty ?? 0) < (item.minQty ?? 0);
            const editing = editingId === item.id;
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '10px 12px' : '11px 16px', borderBottom: '1px solid var(--border)', background: low ? 'rgba(176,106,106,0.06)' : 'transparent' }}>
                {/* Фото */}
                {item.photo ? (
                  <img src={item.photo} alt="" onClick={() => setPhotoView(item)} style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }} />
                ) : canEdit ? (
                  <label style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }} title="Добавить фото">
                    <Camera size={15} style={{ color: 'var(--text-muted)' }} />
                    <input type="file" accept="image/*" onChange={e => onPhoto(item, e)} style={{ display: 'none' }} />
                  </label>
                ) : (
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg-hover)', flexShrink: 0 }} />
                )}

                {/* Название */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editing ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveName(item); if (e.key === 'Escape') setEditingId(null); }}
                      onBlur={() => saveName(item)}
                      className="input-app"
                      style={{ width: '100%', borderRadius: 8, padding: '5px 8px', fontSize: 13 }}
                    />
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                      {low && <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 900, color: '#B06A6A', background: 'rgba(176,106,106,0.14)', padding: '2px 7px', borderRadius: 6, textTransform: 'uppercase' }}>Мало</span>}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    минимум:
                    {canEdit ? (
                      <input
                        type="number" min="0" value={item.minQty ?? 0}
                        onChange={e => setMin(item, parseInt(e.target.value || '0', 10))}
                        style={{ width: 44, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700, padding: '1px 4px' }}
                      />
                    ) : (item.minQty ?? 0)}
                  </div>
                </div>

                {/* Количество */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {canEdit && (
                    <button onClick={() => setQty(item, (item.qty ?? 0) - 1)} style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={13} /></button>
                  )}
                  <span style={{ minWidth: 34, textAlign: 'center', fontSize: 15, fontWeight: 900, color: low ? '#B06A6A' : 'var(--text-primary)' }}>{item.qty ?? 0}</span>
                  {canEdit && (
                    <button onClick={() => setQty(item, (item.qty ?? 0) + 1)} style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={13} /></button>
                  )}
                </div>

                {/* Действия */}
                {canEdit && !editing && (
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => { setEditingId(item.id); setEditName(item.name); }} title="Переименовать" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 5, lineHeight: 0, opacity: 0.5 }}><Pencil size={13} /></button>
                    <button onClick={() => removeItem(item)} title="Удалить" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 5, lineHeight: 0, opacity: 0.5 }}><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Просмотр фото */}
      {photoView && (
        <div onClick={() => setPhotoView(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 18, padding: 14, maxWidth: 420, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', flex: 1 }}>{photoView.name}</span>
              <button onClick={() => setPhotoView(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><X size={16} /></button>
            </div>
            <img src={photoView.photo} alt={photoView.name} style={{ width: '100%', borderRadius: 12 }} />
            {canEdit && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <label style={{ flex: 1, textAlign: 'center', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Заменить фото
                  <input type="file" accept="image/*" onChange={e => { onPhoto(photoView, e); setPhotoView(null); }} style={{ display: 'none' }} />
                </label>
                <button onClick={() => removePhoto(photoView)} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(176,106,106,0.35)', background: 'rgba(176,106,106,0.08)', color: '#B06A6A', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Удалить фото</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FirstAidPage;
