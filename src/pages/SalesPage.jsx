import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { collection, query, onSnapshot, updateDoc, deleteDoc, doc, increment, serverTimestamp, where, runTransaction } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { isMobileDevice } from '../lib/isMobile';
import { useTickets } from '../store/TicketContext';
import { toast } from 'sonner';
import { TrendingUp, ShoppingCart, Package, Search, Check, X, AlertTriangle, RotateCcw, Gift, Users } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];
const PAYMENT_METHODS = ['Kaspi', 'Наличные', 'Карта'];
const FREE_REASONS = ['Бартер', 'Победитель', 'Маркетинг', 'Подарок', 'Другое'];

const CLUB_COLORS = {
  '4YOU':       '#5580A8',
  'COLIBRI':    '#5F9C81',
  'VILLA':      '#C08F4F',
  'NURLY ORDA': '#7D6FB3',
  'PROMENADE':  '#5F9C96',
  'EUROPE CITY': '#B0688D',
};

const SalesPage = () => {
  const { user } = useTickets();
  // Мобильный режим — только визуальные ветки, логика продаж не меняется
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const isChef = useMemo(() => user?.role === 'chef' || user?.role === 'viewer', [user]);
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
  // Club employees from schedule
  const [todayClubEmployees, setTodayClubEmployees] = useState([]);
  const [selectedSalesperson, setSelectedSalesperson] = useState('');
  const [notes, setNotes] = useState('');
  const [saleSize, setSaleSize] = useState(''); // размер для товаров с размерной сеткой

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

  // Load employees from schedule for activeClub
  useEffect(() => {
    if (!activeClub) { setTodayClubEmployees([]); return; }
    const monthKey = format(new Date(), 'yyyy-MM');
    const todayDay = String(new Date().getDate()); // day number as string '1'..'31'

    let unsub = null;
    const unsubAuth = auth.onAuthStateChanged(firebaseUser => {
      if (!firebaseUser) return;
      const q = query(collection(db, 'employees'), where('monthKey', '==', monthKey), where('club', '==', activeClub));
      unsub = onSnapshot(q, async snap => {
        const empList = snap.docs.map(d => {
          const data = d.data();
          const trimmedName = (data.name || '').trim();
          const nLower = trimmedName.toLowerCase();
          const isServ = data.isService === true || nLower.includes('сервис') || nLower.includes('техник');
          return { id: d.id, ...data, name: trimmedName, isService: isServ };
        }).filter(e => !e.isService);
        if (empList.length === 0) { setTodayClubEmployees([]); return; }
        // Fetch schedule docs for today
        const { doc: fsDoc, getDoc } = await import('firebase/firestore');
        const allEmpList = [];
        await Promise.all(empList.map(async emp => {
          const schedDocRef = fsDoc(db, 'schedules', emp.id);
          const schedSnap = await getDoc(schedDocRef);
          let shiftVal = '';
          if (schedSnap.exists()) {
            shiftVal = schedSnap.data()?.days?.[todayDay] || '';
          }
          // We include every employee, showing their shift value or 'выходной'
          allEmpList.push({ id: emp.id, name: emp.name, shift: shiftVal || 'выходной' });
        }));
        setTodayClubEmployees(allEmpList);
      });
    });
    return () => { unsubAuth(); if (unsub) unsub(); };
  }, [activeClub]);

  // Show all club employees in the selector so any admin can be manually assigned,
  // regardless of today's schedule. Shift label in the button shows working status.
  const filteredEmployees = todayClubEmployees;

  // Products for active club only
  const clubProducts = useMemo(() =>
    products.filter(p => p.club === activeClub && (
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
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
    if (filteredEmployees.length > 0 && !selectedSalesperson) {
      return toast.error('Выберите сотрудника, кому идёт продажа');
    }
    setSubmitting(true);
    try {
      const finalSalePrice = isFree ? 0 : (customPrice !== '' ? (parseFloat(customPrice) || 0) : (selectedProduct.salePrice || 0));
      // Продажа и списание — атомарной транзакцией: либо обе записи, либо ни одной
      await runTransaction(db, async (tx) => {
        const prodRef = doc(db, 'merch_products', selectedProduct.id);
        const prodSnap = await tx.get(prodRef);
        if (!prodSnap.exists()) throw new Error('PRODUCT_MISSING');
        const live = prodSnap.data();
        const liveStock = live.stock || 0;
        if (qty > liveStock) throw new Error(`NOT_ENOUGH:${liveStock}`);
        // Размерная сетка: размер обязателен, списание по размеру
        const hasSizes = live.sizes && Object.keys(live.sizes).length > 0;
        if (hasSizes) {
          if (!saleSize) throw new Error('SIZE_REQUIRED');
          const szStock = live.sizes[saleSize] || 0;
          if (qty > szStock) throw new Error(`NOT_ENOUGH_SIZE:${saleSize}:${szStock}`);
        }
        tx.set(doc(collection(db, 'merch_sales')), {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          size: hasSizes ? saleSize : null,
          category: selectedProduct.category || '',
          sku: selectedProduct.sku || '',
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
          salespersonName: selectedSalesperson || null,
          createdAt: serverTimestamp(),
        });
        tx.update(prodRef, {
          stock: increment(-qty),
          ...(hasSizes ? { [`sizes.${saleSize}`]: increment(-qty) } : {}),
          updatedAt: serverTimestamp(),
        });
      });
      toast.success(`${isFree ? '🎁 Бесплатно' : '✅ Продажа'}: ${selectedProduct.name} × ${qty}`);
      setSelectedProduct(null);
      setSaleSize('');
      setQty(1);
      setSearch('');
      setIsFree(false);
      setCustomPrice('');
      setBuyerType('client');
      setBuyerName('');
      setNotes('');
      setSelectedSalesperson('');
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || '');
      if (msg === 'PRODUCT_MISSING') toast.error('Карточка товара удалена со склада — продажа НЕ проведена. Обновите страницу.');
      else if (msg === 'SIZE_REQUIRED') toast.error('Выберите размер — у этого товара размерная сетка');
      else if (msg.startsWith('NOT_ENOUGH_SIZE')) toast.error(`Недостаточно размера ${msg.split(':')[1]} (остаток: ${msg.split(':')[2]} шт)`);
      else if (msg.startsWith('NOT_ENOUGH')) toast.error(`Недостаточно товара (фактический остаток: ${msg.split(':')[1]} шт) — продажа НЕ проведена`);
      else toast.error('Ошибка при проведении — ничего не записано, попробуйте ещё раз');
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
        ...(sale.size ? { [`sizes.${sale.size}`]: increment(sale.qty) } : {}),
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
          /* Мобильный: лента чипов без переноса, скролл по горизонтали внутри блока */
          <div style={{ display: 'flex', gap: 6, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', paddingBottom: isMobile ? 2 : 0 }}>
            {CLUBS.map(c => {
              const cc = CLUB_COLORS[c];
              const active = activeClub === c;
              return (
                <button key={c} onClick={() => { setActiveClub(c); setSelectedProduct(null); setSearch(''); }}
                  style={{
                    padding: isMobile ? '8px 14px' : '6px 14px', borderRadius: 10, fontSize: 11, fontWeight: 800,
                    whiteSpace: 'nowrap', flexShrink: 0,
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

      {/* Мобильный: одна колонка (товары → продажи дня), форма — шторкой снизу */}
      <div className={isMobile ? 'flex flex-col gap-3' : 'grid grid-cols-1 md:grid-cols-12 gap-4'}>

        {/* LEFT — Product list */}
        <div className={isMobile ? undefined : 'md:col-span-7'} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.07em', marginBottom: 6 }}>Выбери товар</div>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type="text" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 28, paddingRight: 8, paddingTop: 6, paddingBottom: 6, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 12, color: 'var(--text-primary)', outline: 'none' }} />
            </div>
          </div>
          {/* Мобильный: список без внутреннего скролла — страница скроллится сама */}
          <div style={{ flex: 1, overflowY: isMobile ? 'visible' : 'auto', maxHeight: isMobile ? 'none' : 600, padding: 12 }}>
            {loadingProducts ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Загрузка...</div>
            ) : clubProducts.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Package size={24} style={{ margin: '0 auto 6px', opacity: 0.3, display: 'block' }} />
                <div style={{ fontSize: 11, fontWeight: 700 }}>Нет товаров для {activeClub}</div>
              </div>
            ) : (
              /* Мобильный: строго 2 колонки компактных карточек */
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(130px, 1fr))', gap: isMobile ? 8 : 10 }}>
                {clubProducts.map(p => {
                  const isOut = p.stock <= 0;
                  const isSel = selectedProduct?.id === p.id;
                  return (
                    <button key={p.id} onClick={() => { if (!isOut) { setSelectedProduct(p); setQty(1); setSaleSize(''); setCustomPrice(String(p.salePrice || 0)); setBuyerType('client'); setBuyerName(''); setNotes(''); } }} disabled={isOut}
                      style={{
                        textAlign: 'left', border: `1px solid ${isSel ? accentColor : 'var(--border)'}`,
                        borderRadius: 12, overflow: 'hidden', padding: 0, cursor: isOut ? 'not-allowed' : 'pointer',
                        background: isSel ? `${accentColor}08` : 'var(--bg-card)',
                        boxShadow: isSel ? `0 0 0 1px ${accentColor}` : 'none',
                        opacity: isOut ? 0.5 : 1, transition: 'all 0.15s',
                        display: 'flex', flexDirection: 'column'
                      }}>
                      {/* Image container */}
                      {p.imageUrl ? (
                        <div style={{ width: '100%', height: 100, background: '#000', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                          <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          {isOut && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', textTransform: 'uppercase' }}>Нет</div>
                          )}
                        </div>
                      ) : (
                        <div style={{ width: '100%', height: 100, background: 'var(--bg-hover)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)', position: 'relative' }}>
                          <Package size={20} style={{ opacity: 0.25, color: 'var(--text-muted)' }} />
                          <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 650, marginTop: 4 }}>Нет фото</span>
                          {isOut && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', textTransform: 'uppercase' }}>Нет</div>
                          )}
                        </div>
                      )}
                      
                      {/* Content */}
                      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '14px', minHeight: 28 }} title={p.name}>
                            {p.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{p.category}</span>
                            {p.sku && (
                              <span style={{ fontSize: 8, fontWeight: 800, color: accentColor, background: `${accentColor}10`, padding: '1px 4px', borderRadius: 4 }}>
                                {p.sku}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: p.stock <= 3 ? '#C08F4F' : 'var(--text-muted)' }}>
                            {p.sizes && Object.keys(p.sizes).length > 0
                              ? Object.entries(p.sizes).filter(([, v]) => v > 0).map(([sz, v]) => `${sz}·${v}`).join(' ') || '0 шт'
                              : `${p.stock} шт`}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 900, color: accentColor }}>
                            {(p.salePrice || 0).toLocaleString()} ₸
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Form + log */}
        <div className={isMobile ? undefined : 'md:col-span-5'} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Форма продажи: на десктопе — карточка в колонке, на мобильном — шторка снизу через портал */}
          {(() => {
          const formBox = (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: isMobile ? '20px 20px 0 0' : 18, padding: 14, boxShadow: 'var(--shadow-card)',
            ...(isMobile ? { width: '100%', maxHeight: '88vh', overflowY: 'auto', borderLeft: 'none', borderRight: 'none', borderBottom: 'none' } : {}),
          }}>
            <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.07em', marginBottom: 10 }}>Оформить</div>

            {selectedProduct ? (
              <>
                {/* Product chip */}
                <div style={{ background: 'var(--bg-primary)', border: `1px solid var(--border)`, borderRadius: 12, overflow: 'hidden', marginBottom: 10, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                  {selectedProduct.imageUrl ? (
                    /* Мобильный: фото ниже, чтобы форма помещалась в шторку */
                    <div style={{ width: '100%', height: isMobile ? 150 : 240, background: '#08080c', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)' }}>
                      <img src={selectedProduct.imageUrl} alt={selectedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: isMobile ? 120 : 240, background: 'var(--bg-hover)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)' }}>
                      <Package size={36} style={{ opacity: 0.25, color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 650, marginTop: 6 }}>Нет фото</span>
                    </div>
                  )}
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{selectedProduct.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>В наличии: <b style={{ color: selectedProduct.stock <= 3 ? '#C08F4F' : 'var(--text-primary)' }}>{selectedProduct.stock} шт</b></span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: accentColor }}>{(selectedProduct.salePrice || 0).toLocaleString()} ₸</span>
                    </div>
                  </div>
                </div>

                {/* Qty */}
                {/* Мобильный: кнопки ± не меньше 40px под палец */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  {/* Размерная сетка: выбор размера обязателен */}
                  {selectedProduct.sizes && Object.keys(selectedProduct.sizes).length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: '100%', marginBottom: 8 }}>
                      {['XS','S','M','L','XL','XXL','3XL'].filter(sz => (selectedProduct.sizes[sz] || 0) > 0).map(sz => (
                        <button key={sz} onClick={() => setSaleSize(sz)} style={{
                          minHeight: 40, padding: '0 14px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 900,
                          border: saleSize === sz ? '1px solid var(--accent-purple)' : '1px solid var(--border)',
                          background: saleSize === sz ? 'var(--accent-purple)' : 'var(--bg-hover)',
                          color: saleSize === sz ? '#fff' : 'var(--text-primary)',
                        }}>{sz} <span style={{ opacity: 0.7, fontWeight: 700 }}>·{selectedProduct.sizes[sz]}</span></button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: isMobile ? 40 : 32, height: isMobile ? 40 : 32, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: 16, fontWeight: 700, cursor: 'pointer', color: 'var(--text-primary)', flexShrink: 0 }}>−</button>
                  <input type="number" min="1" max={selectedProduct.stock} value={qty}
                    onChange={e => setQty(Math.max(1, Math.min(selectedProduct.stock, parseInt(e.target.value) || 1)))}
                    style={{ flex: 1, textAlign: 'center', padding: '6px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', outline: 'none', minWidth: 0 }} />
                  <button onClick={() => setQty(q => Math.min(selectedProduct.stock, q + 1))} style={{ width: isMobile ? 40 : 32, height: isMobile ? 40 : 32, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: 16, fontWeight: 700, cursor: 'pointer', color: 'var(--text-primary)', flexShrink: 0 }}>+</button>
                </div>

                {/* Free toggle */}
                <button onClick={() => setIsFree(v => !v)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                    padding: '8px 12px', borderRadius: 10, border: `1px solid ${isFree ? '#C08F4F' : 'var(--border)'}`,
                    background: isFree ? 'rgba(192,143,79,0.08)' : 'var(--bg-hover)',
                    color: isFree ? '#C08F4F' : 'var(--text-secondary)',
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
                          border: `1px solid ${freeReason === r ? '#C08F4F' : 'var(--border)'}`,
                          background: freeReason === r ? 'rgba(192,143,79,0.12)' : 'var(--bg-hover)',
                          color: freeReason === r ? '#C08F4F' : 'var(--text-secondary)',
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

                {/* Salesperson selector */}
                {todayClubEmployees.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: '#7D6FB3', letterSpacing: '0.07em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Users size={11} />
                      Кому идёт продажа (выберите до 2 админов)
                    </div>
                    {filteredEmployees.length === 0 ? (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '8px 10px', background: 'var(--bg-hover)', borderRadius: 9, border: '1px solid var(--border)' }}>
                        ⚠️ Нет работающих сегодня сотрудников в графике
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {filteredEmployees.map(emp => {
                          const selectedNames = selectedSalesperson 
                            ? selectedSalesperson.split(',').map(n => n.trim()).filter(Boolean) 
                            : [];
                          const isSel = selectedNames.includes(emp.name);
                          return (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => {
                                let nextNames;
                                if (isSel) {
                                  nextNames = selectedNames.filter(n => n !== emp.name);
                                } else {
                                  if (selectedNames.length < 2) {
                                    nextNames = [...selectedNames, emp.name];
                                  } else {
                                    toast.error('Можно выбрать не более 2 сотрудников');
                                    return;
                                  }
                                }
                                setSelectedSalesperson(nextNames.join(', '));
                              }}
                              style={{
                                padding: '6px 12px', borderRadius: 10, fontSize: 11, fontWeight: 800,
                                border: `1px solid ${isSel ? '#7D6FB3' : 'var(--border)'}`,
                                background: isSel ? 'rgba(125,111,179,0.15)' : 'var(--bg-hover)',
                                color: isSel ? '#7D6FB3' : 'var(--text-secondary)',
                                cursor: 'pointer', transition: 'all 0.15s',
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                              }}
                            >
                              <span>{emp.name.split(' ')[0]}</span>
                              <span style={{ fontSize: 8, opacity: 0.7, fontWeight: 600 }}>{emp.shift}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Итого</span>
                  <span style={{ fontSize: 18, fontWeight: 950, color: isFree ? '#C08F4F' : accentColor }}>
                    {isFree ? '🎁 0 ₸' : `${saleTotal.toLocaleString()} ₸`}
                  </span>
                </div>

                {selectedProduct.stock <= qty && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(192,143,79,0.07)', border: '1px solid rgba(192,143,79,0.2)', borderRadius: 9, marginBottom: 8 }}>
                    <AlertTriangle size={11} color="#C08F4F" />
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#C08F4F' }}>Последний товар на складе</span>
                  </div>
                )}

                {/* Мобильный: кнопки действий выше 40px */}
                <div style={{ display: 'flex', gap: 7 }}>
                  <button onClick={() => { setSelectedProduct(null); setQty(1); setIsFree(false); }}
                    style={{ padding: isMobile ? '12px 16px' : '9px 12px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <X size={13} />
                  </button>
                  <button onClick={handleSubmit} disabled={submitting || qty > selectedProduct.stock}
                    style={{
                      flex: 1, padding: isMobile ? '13px 9px' : '9px', borderRadius: 11, border: 'none',
                      background: submitting ? 'var(--bg-hover)' : isFree ? '#C08F4F' : accentColor,
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
          );
          // Десктоп — форма стоит в правой колонке как раньше
          if (!isMobile) return formBox;
          // Мобильный — форма появляется шторкой снизу только когда выбран товар
          if (!selectedProduct) return null;
          return ReactDOM.createPortal(
            <div
              onClick={() => { setSelectedProduct(null); setQty(1); setIsFree(false); }}
              style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            >
              <div onClick={e => e.stopPropagation()} style={{ width: '100%' }}>{formBox}</div>
            </div>,
            document.body
          );
          })()}

          {/* Today's log */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-card)', flex: 1 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.07em' }}>
              Сегодня · {activeClub} ({clubTodaySales.length})
            </div>
            {/* Мобильный: продажи дня — отдельные карточки, без внутреннего скролла */}
            <div style={isMobile ? { padding: 10, display: 'flex', flexDirection: 'column', gap: 8 } : { maxHeight: 350, overflowY: 'auto' }}>
              {clubTodaySales.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>Продаж ещё нет</div>
              ) : clubTodaySales.map(s => (
                <div key={s.id} style={isMobile
                  ? { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, background: s.isFree ? 'rgba(192,143,79,0.05)' : 'var(--bg-hover)' }
                  : { padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7, background: s.isFree ? 'rgba(192,143,79,0.03)' : 'transparent' }}>
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
                        <span style={{ display: 'block', fontSize: 9, color: '#8E7BB8', fontStyle: 'italic', marginTop: 1 }}>
                          💬 {s.notes}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: s.isFree ? '#C08F4F' : accentColor, flexShrink: 0 }}>
                    {s.isFree ? 'Бесплатно' : `${(s.totalSum || 0).toLocaleString()} ₸`}
                  </div>
                  {/* Мобильный: зона нажатия отмены ≥36px */}
                  <button onClick={() => handleCancelSale(s)} disabled={cancellingId === s.id} title="Отменить"
                    style={{
                      flexShrink: 0, width: isMobile ? 36 : 26, height: isMobile ? 36 : 26, borderRadius: isMobile ? 10 : 7,
                      border: '1px solid rgba(176,106,106,0.2)', background: 'rgba(176,106,106,0.05)',
                      color: cancellingId === s.id ? 'var(--text-muted)' : '#B06A6A',
                      cursor: cancellingId === s.id ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <RotateCcw size={isMobile ? 13 : 10} />
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
