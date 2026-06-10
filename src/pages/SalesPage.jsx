import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTickets } from '../store/TicketContext';
import { toast } from 'sonner';
import { TrendingUp, ShoppingCart, Package, Search, Check, X, AlertTriangle, RotateCcw, Gift } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'];
const PAYMENT_METHODS = ['Kaspi', 'Наличные', 'Карта'];
const FREE_REASONS = ['Бартер', 'Победитель', 'Маркетинг', 'Подарок', 'Другое'];

const CLUB_COLORS = {
  '4YOU':       '#3b82f6',
  'COLIBRI':    '#10b981',
  'VILLA':      '#f59e0b',
  'NURLY ORDA': '#8b5cf6',
};

const SalesPage = () => {
  const { user } = useTickets();
  const isChef = useMemo(() => user?.role === 'chef', [user]);
  const userClub = useMemo(() => user?.club || null, [user]);

  // Chef can select any club; admin/manager is locked to their club
  const [activeClub, setActiveClub] = useState(() => isChef ? (CLUBS[0]) : userClub);
  useEffect(() => {
    if (!isChef && userClub) setActiveClub(userClub);
  }, [isChef, userClub]);

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [todaySales, setTodaySales] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('Kaspi');
  const [isFree, setIsFree] = useState(false);
  const [freeReason, setFreeReason] = useState('Бартер');
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [buyerType, setBuyerType] = useState('client');
  const [customPrice, setCustomPrice] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setLoadingProducts(true);
    const unsub = onSnapshot(query(collection(db, 'merch_products')), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingProducts(false);
    }, err => { console.error(err); setLoadingProducts(false); });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'merch_sales')), snap => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => {
          if (!s.createdAt?.seconds) return false;
          return format(new Date(s.createdAt.seconds * 1000), 'yyyy-MM-dd') === todayStr && s.qty > 0;
        })
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setTodaySales(list);
    });
    return unsub;
  }, []);

  // Products for active club only
  const clubProducts = useMemo(() =>
    products.filter(p => p.club === activeClub && (
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.toLowerCase().includes(search.toLowerCase())
    )),
    [products, activeClub, search]
  );

  // Today sales for active club
  const clubTodaySales = useMemo(() =>
    todaySales.filter(s => s.club === activeClub),
    [todaySales, activeClub]
  );

  const currentSalePrice = isFree ? 0 : (customPrice !== '' ? (parseFloat(customPrice) || 0) : (selectedProduct?.salePrice || 0));
  const saleTotal = currentSalePrice * qty;

  const handleSubmit = async () => {
    if (!selectedProduct) return toast.error('Выберите товар');
    if (qty <= 0) return toast.error('Укажите количество');
    if (qty > selectedProduct.stock) return toast.error(`Недостаточно товара (в наличии: ${selectedProduct.stock} шт)`);
    setSubmitting(true);
    try {
      const finalSalePrice = isFree ? 0 : (customPrice !== '' ? (parseFloat(customPrice) || 0) : (selectedProduct.salePrice || 0));
      await addDoc(collection(db, 'merch_sales'), {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        category: selectedProduct.category || '',
        club: activeClub,
        qty,
        costPrice: selectedProduct.costPrice || 0,
        salePrice: finalSalePrice,
        totalSum: saleTotal,
        netProfit: isFree ? -(selectedProduct.costPrice || 0) * qty : saleTotal - (selectedProduct.costPrice || 0) * qty,
        paymentMethod: isFree ? freeReason : paymentMethod,
        isFree,
        buyerType: isFree ? 'client' : buyerType,
        clientName: buyerName.trim() || (buyerType === 'employee' ? 'Сотрудник' : 'Гость'),
        notes: notes.trim() || null,
        cashierName: user?.name || user?.email || 'Менеджер',
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'merch_products', selectedProduct.id), {
        stock: increment(-qty),
        updatedAt: serverTimestamp(),
      });
      toast.success(`${isFree ? '🎁 Бесплатно' : '✅ Продажа'}: ${selectedProduct.name} × ${qty}`);
      setSelectedProduct(null);
      setQty(1);
      setSearch('');
      setIsFree(false);
      setCustomPrice('');
      setBuyerType('client');
      setBuyerName('');
      setNotes('');
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при проведении');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSale = async (sale) => {
    if (cancellingId) return;
    setCancellingId(sale.id);
    try {
      await updateDoc(doc(db, 'merch_products', sale.productId), {
        stock: increment(sale.qty),
        updatedAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, 'merch_sales', sale.id));
      toast.success(`Отменено: ${sale.productName} × ${sale.qty}`);
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при отмене');
    } finally {
      setCancellingId(null);
    }
  };

  const accentColor = CLUB_COLORS[activeClub] || 'var(--accent-purple)';

  return (
    <div className="animate-fade" style={{ maxWidth: 1280, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 20, padding: '16px 20px', marginBottom: 14, boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: isChef ? 14 : 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `${accentColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrendingUp size={18} color={accentColor} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 16, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase', margin: 0 }}>
              Продажи · <span style={{ color: accentColor }}>{activeClub}</span>
            </h1>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>
              {format(new Date(), 'dd MMMM yyyy', { locale: ru })} · Чеков: {clubTodaySales.length}
            </div>
          </div>
          {isChef && (
            <div style={{ textAlign: 'right', fontSize: 18, fontWeight: 950, color: accentColor }}>
              {clubTodaySales.reduce((s, x) => s + (x.totalSum || 0), 0).toLocaleString()} ₸
            </div>
          )}
        </div>

        {/* Club selector — Chef only */}
        {isChef && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CLUBS.map(c => {
              const cc = CLUB_COLORS[c];
              const active = activeClub === c;
              return (
                <button key={c} onClick={() => { setActiveClub(c); setSelectedProduct(null); setSearch(''); }}
                  style={{
                    padding: '6px 14px', borderRadius: 10, fontSize: 11, fontWeight: 800,
                    border: `1px solid ${active ? cc : 'var(--border)'}`,
                    background: active ? `${cc}18` : 'var(--bg-hover)',
                    color: active ? cc : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >{c}</button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">

        {/* LEFT — Product list */}
        <div className="md:col-span-7" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.07em', marginBottom: 6 }}>Выбери товар</div>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type="text" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 28, paddingRight: 8, paddingTop: 6, paddingBottom: 6, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 12, color: 'var(--text-primary)', outline: 'none' }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 600 }}>
            {loadingProducts ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Загрузка...</div>
            ) : clubProducts.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Package size={24} style={{ margin: '0 auto 6px', opacity: 0.3, display: 'block' }} />
                <div style={{ fontSize: 11, fontWeight: 700 }}>Нет товаров для {activeClub}</div>
              </div>
            ) : clubProducts.map(p => {
              const isOut = p.stock <= 0;
              const isSel = selectedProduct?.id === p.id;
              return (
                <button key={p.id} onClick={() => { if (!isOut) { setSelectedProduct(p); setQty(1); setCustomPrice(String(p.salePrice || 0)); setBuyerType('client'); setBuyerName(''); setNotes(''); } }} disabled={isOut}
                  style={{
                    width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--border)',
                    padding: '10px 14px', cursor: isOut ? 'not-allowed' : 'pointer',
                    background: isSel ? `${accentColor}10` : isOut ? 'var(--bg-hover)' : 'transparent',
                    borderLeft: isSel ? `3px solid ${accentColor}` : '3px solid transparent',
                    opacity: isOut ? 0.5 : 1, transition: 'all 0.12s',
                  }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} style={{ width: 54, height: 54, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 54, height: 54, borderRadius: 10, background: 'var(--bg-hover)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Package size={20} style={{ opacity: 0.3, color: 'var(--text-muted)' }} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{p.category} · {isOut ? '❌ Нет' : `${p.stock} шт`}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: accentColor, flexShrink: 0, marginLeft: 6 }}>{(p.salePrice || 0).toLocaleString()} ₸</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT — Form + log */}
        <div className="md:col-span-5" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Form */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: 14, boxShadow: 'var(--shadow-card)' }}>
            <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.07em', marginBottom: 10 }}>Оформить</div>

            {selectedProduct ? (
              <>
                {/* Product chip */}
                <div style={{ background: 'var(--bg-primary)', border: `1px solid var(--border)`, borderRadius: 12, overflow: 'hidden', marginBottom: 10, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                  {selectedProduct.imageUrl ? (
                    <div style={{ width: '100%', height: 240, background: '#08080c', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)' }}>
                      <img src={selectedProduct.imageUrl} alt={selectedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: 240, background: 'var(--bg-hover)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)' }}>
                      <Package size={36} style={{ opacity: 0.25, color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 650, marginTop: 6 }}>Нет фото</span>
                    </div>
                  )}
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{selectedProduct.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>В наличии: <b style={{ color: selectedProduct.stock <= 3 ? '#f59e0b' : 'var(--text-primary)' }}>{selectedProduct.stock} шт</b></span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: accentColor }}>{(selectedProduct.salePrice || 0).toLocaleString()} ₸</span>
                    </div>
                  </div>
                </div>

                {/* Qty */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: 16, fontWeight: 700, cursor: 'pointer', color: 'var(--text-primary)' }}>−</button>
                  <input type="number" min="1" max={selectedProduct.stock} value={qty}
                    onChange={e => setQty(Math.max(1, Math.min(selectedProduct.stock, parseInt(e.target.value) || 1)))}
                    style={{ flex: 1, textAlign: 'center', padding: '6px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', outline: 'none' }} />
                  <button onClick={() => setQty(q => Math.min(selectedProduct.stock, q + 1))} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: 16, fontWeight: 700, cursor: 'pointer', color: 'var(--text-primary)' }}>+</button>
                </div>

                {/* Free toggle */}
                <button onClick={() => setIsFree(v => !v)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                    padding: '8px 12px', borderRadius: 10, border: `1px solid ${isFree ? '#f59e0b' : 'var(--border)'}`,
                    background: isFree ? 'rgba(245,158,11,0.08)' : 'var(--bg-hover)',
                    color: isFree ? '#f59e0b' : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: 11, fontWeight: 800, transition: 'all 0.15s',
                  }}>
                  <Gift size={13} />
                  {isFree ? '🎁 Бесплатно / Бартер' : 'Платная продажа'}
                </button>

                {/* Buyer Type (Client/Employee) Switcher */}
                {!isFree && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <button type="button" onClick={() => { setBuyerType('client'); setCustomPrice(String(selectedProduct.salePrice || 0)); }}
                      style={{
                        flex: 1, padding: '6px', borderRadius: 9, fontSize: 10, fontWeight: 800,
                        border: `1px solid ${buyerType === 'client' ? accentColor : 'var(--border)'}`,
                        background: buyerType === 'client' ? `${accentColor}12` : 'var(--bg-hover)',
                        color: buyerType === 'client' ? accentColor : 'var(--text-secondary)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>Клиент</button>
                    <button type="button" onClick={() => { setBuyerType('employee'); setCustomPrice(String(selectedProduct.employeePrice || selectedProduct.salePrice || 0)); }}
                      style={{
                        flex: 1, padding: '6px', borderRadius: 9, fontSize: 10, fontWeight: 800,
                        border: `1px solid ${buyerType === 'employee' ? accentColor : 'var(--border)'}`,
                        background: buyerType === 'employee' ? `${accentColor}12` : 'var(--bg-hover)',
                        color: buyerType === 'employee' ? accentColor : 'var(--text-secondary)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>Сотрудник</button>
                  </div>
                )}

                {/* Free reason OR payment method */}
                {isFree ? (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                    {FREE_REASONS.map(r => (
                      <button key={r} onClick={() => setFreeReason(r)}
                        style={{
                          padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 800,
                          border: `1px solid ${freeReason === r ? '#f59e0b' : 'var(--border)'}`,
                          background: freeReason === r ? 'rgba(245,158,11,0.12)' : 'var(--bg-hover)',
                          color: freeReason === r ? '#f59e0b' : 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}>{r}</button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                    {PAYMENT_METHODS.map(m => (
                      <button key={m} onClick={() => setPaymentMethod(m)}
                        style={{
                          flex: 1, padding: '6px 4px', borderRadius: 9, fontSize: 10, fontWeight: 800,
                          border: `1px solid ${paymentMethod === m ? accentColor : 'var(--border)'}`,
                          background: paymentMethod === m ? `${accentColor}12` : 'var(--bg-hover)',
                          color: paymentMethod === m ? accentColor : 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}>{m}</button>
                    ))}
                  </div>
                )}

                {/* Custom price editing (if not free) */}
                {!isFree && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.07em', marginBottom: 4 }}>Редактировать цену (₸ за шт)</div>
                    <input type="number" min="0" value={customPrice} onChange={e => setCustomPrice(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', outline: 'none' }} />
                  </div>
                )}

                {/* Buyer name input */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.07em', marginBottom: 4 }}>
                    {buyerType === 'employee' ? 'Имя сотрудника' : 'Имя клиента (необязательно)'}
                  </div>
                  <input type="text" placeholder={buyerType === 'employee' ? 'Иван И.' : 'Аскар А.'} value={buyerName} onChange={e => setBuyerName(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 12, color: 'var(--text-primary)', outline: 'none' }} />
                </div>

                {/* Comments / Notes */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.07em', marginBottom: 4 }}>Комментарий к продаже</div>
                  <textarea rows="2" placeholder="Укажите детали..." value={notes} onChange={e => setNotes(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 11, color: 'var(--text-primary)', outline: 'none', resize: 'none' }} />
                </div>

                {/* Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Итого</span>
                  <span style={{ fontSize: 18, fontWeight: 950, color: isFree ? '#f59e0b' : accentColor }}>
                    {isFree ? '🎁 0 ₸' : `${saleTotal.toLocaleString()} ₸`}
                  </span>
                </div>

                {selectedProduct.stock <= qty && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 9, marginBottom: 8 }}>
                    <AlertTriangle size={11} color="#f59e0b" />
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>Последний товар на складе</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 7 }}>
                  <button onClick={() => { setSelectedProduct(null); setQty(1); setIsFree(false); }}
                    style={{ padding: '9px 12px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <X size={13} />
                  </button>
                  <button onClick={handleSubmit} disabled={submitting || qty > selectedProduct.stock}
                    style={{
                      flex: 1, padding: '9px', borderRadius: 11, border: 'none',
                      background: submitting ? 'var(--bg-hover)' : isFree ? '#f59e0b' : accentColor,
                      color: submitting ? 'var(--text-muted)' : '#fff',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      fontSize: 11, fontWeight: 900, textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}>
                    {isFree ? <Gift size={13} /> : <Check size={13} />}
                    {submitting ? 'Ждите...' : isFree ? 'Выдать бесплатно' : 'Провести продажу'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <ShoppingCart size={24} style={{ margin: '0 auto 6px', opacity: 0.25, display: 'block' }} />
                <div style={{ fontSize: 11, fontWeight: 700 }}>Выберите товар слева</div>
              </div>
            )}
          </div>

          {/* Today's log */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-card)', flex: 1 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.07em' }}>
              Сегодня · {activeClub} ({clubTodaySales.length})
            </div>
            <div style={{ maxHeight: 350, overflowY: 'auto' }}>
              {clubTodaySales.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>Продаж ещё нет</div>
              ) : clubTodaySales.map(s => (
                <div key={s.id} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7, background: s.isFree ? 'rgba(245,158,11,0.03)' : 'transparent' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.isFree ? '🎁 ' : ''}{s.productName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {s.qty} шт · {s.paymentMethod}
                      {s.clientName && s.clientName !== 'Гость' && (
                        <span style={{ display: 'block', fontSize: 9, color: 'var(--text-secondary)', marginTop: 1 }}>
                          {s.buyerType === 'employee' ? '💼 Сотр: ' : '👤 Кл: '}{s.clientName}
                        </span>
                      )}
                      {s.notes && (
                        <span style={{ display: 'block', fontSize: 9, color: '#a855f7', fontStyle: 'italic', marginTop: 1 }}>
                          💬 {s.notes}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: s.isFree ? '#f59e0b' : accentColor, flexShrink: 0 }}>
                    {s.isFree ? 'Бесплатно' : `${(s.totalSum || 0).toLocaleString()} ₸`}
                  </div>
                  <button onClick={() => handleCancelSale(s)} disabled={cancellingId === s.id} title="Отменить"
                    style={{
                      flexShrink: 0, width: 26, height: 26, borderRadius: 7,
                      border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)',
                      color: cancellingId === s.id ? 'var(--text-muted)' : '#ef4444',
                      cursor: cancellingId === s.id ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <RotateCcw size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesPage;
