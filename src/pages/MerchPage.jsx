import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, onSnapshot, setDoc, doc, deleteDoc, 
  serverTimestamp, addDoc, updateDoc, increment
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useTickets } from '../store/TicketContext';
import { toast } from 'sonner';
import { 
  Package, Plus, Search, ShoppingCart, TrendingUp, History, 
  Trash2, Edit3, CheckCircle, AlertTriangle, ArrowUpRight, 
  ArrowDownLeft, Filter, DollarSign, Store, X, CreditCard, Wallet, Download, ClipboardList
} from 'lucide-react';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'];
const CATEGORIES = ['Худи', 'Футболки', 'Кепки', 'Шоперы', 'Блокноты', 'Ручки', 'Другое'];

const MerchPage = () => {
  const { user } = useTickets();
  
  // Role & Permissions check
  const isChef = useMemo(() => user?.role === 'chef', [user]);
  const managerClub = useMemo(() => user?.club || null, [user]);

  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory', 'sales', 'resort'
  const [selectedClub, setSelectedClub] = useState(() => (!isChef && managerClub) ? managerClub : 'ALL');
  const [resortValues, setResortValues] = useState({}); // productId -> actual count string
  const [savingResort, setSavingResort] = useState(false);
  
  // Sync selectedClub if user updates
  useEffect(() => {
    if (!isChef && managerClub) {
      setSelectedClub(managerClub);
    }
  }, [isChef, managerClub]);

  // Data States
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingSales, setLoadingSales] = useState(true);
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [selectedProductForSale, setSelectedProductForSale] = useState(null);
  
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [selectedProductForSupply, setSelectedProductForSupply] = useState(null);

  // Form States (New / Edit Product)
  const [productForm, setProductForm] = useState({
    name: '',
    club: '4YOU',
    category: 'Худи',
    costPrice: '',
    salePrice: '',
    stock: '',
    minStock: '5'
  });

  // Form States (New Sale)
  const [saleForm, setSaleForm] = useState({
    qty: '1',
    paymentMethod: 'Kaspi',
    clientName: ''
  });

  // Form States (Supply / Restock)
  const [supplyForm, setSupplyForm] = useState({
    qty: '10',
    notes: ''
  });

  // ─── Firebase Subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    setLoadingProducts(true);
    const qProducts = query(collection(db, 'merch_products'));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(list);
      setLoadingProducts(false);
    }, (error) => {
      console.error('Error fetching merch inventory:', error);
      toast.error('Ошибка загрузки склада');
      setLoadingProducts(false);
    });

    setLoadingSales(true);
    const qSales = query(collection(db, 'merch_sales'));
    const unsubSales = onSnapshot(qSales, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort sales by date desc
      setSales(list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setLoadingSales(false);
    }, (error) => {
      console.error('Error fetching sales history:', error);
      setLoadingSales(false);
    });

    return () => {
      unsubProducts();
      unsubSales();
    };
  }, []);

  // ─── CRUD Actions ──────────────────────────────────────────────────────────
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    const canManage = isChef || (managerClub && productForm.club === managerClub);
    if (!canManage) return toast.error('Доступ запрещен');
    if (!productForm.name.trim()) return toast.error('Введите название товара');
    
    const cost = isChef 
      ? (parseFloat(productForm.costPrice) || 0) 
      : (editingProduct ? (editingProduct.costPrice || 0) : 0);
    const sale = parseFloat(productForm.salePrice) || 0;
    const initialStock = parseInt(productForm.stock) || 0;
    const min = parseInt(productForm.minStock) || 0;

    const data = {
      name: productForm.name.trim(),
      club: productForm.club,
      category: productForm.category,
      costPrice: cost,
      salePrice: sale,
      stock: editingProduct ? editingProduct.stock : initialStock, // Don't overwrite stock on edit
      minStock: min,
      updatedAt: serverTimestamp()
    };

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'merch_products', editingProduct.id), data);
        toast.success('Товар успешно обновлен');
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, 'merch_products'), data);
        toast.success('Товар добавлен в инвентарь');
      }
      setShowProductModal(false);
      setEditingProduct(null);
      setProductForm({ name: '', club: managerClub || '4YOU', category: 'Худи', costPrice: '', salePrice: '', stock: '', minStock: '5' });
    } catch (err) {
      console.error(err);
      toast.error('Ошибка сохранения товара');
    }
  };

  const handleDeleteProduct = async (id) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const canDelete = isChef || (managerClub && product.club === managerClub);
    if (!canDelete) return toast.error('Доступ запрещен');
    if (!window.confirm('Вы уверены, что хотите удалить этот товар из базы?')) return;
    try {
      await deleteDoc(doc(db, 'merch_products', id));
      toast.success('Товар удален');
    } catch (err) {
      toast.error('Не удалось удалить товар');
    }
  };

  const handleCreateSale = async (e) => {
    e.preventDefault();
    const qty = parseInt(saleForm.qty) || 0;
    if (qty <= 0) return toast.error('Укажите корректное количество');
    if (qty > selectedProductForSale.stock) return toast.error(`Недостаточно товара на складе (в наличии: ${selectedProductForSale.stock} шт)`);

    const totalSum = qty * selectedProductForSale.salePrice;
    const netProfit = totalSum - (qty * (selectedProductForSale.costPrice || 0));

    try {
      // 1. Create sale record
      await addDoc(collection(db, 'merch_sales'), {
        productId: selectedProductForSale.id,
        productName: selectedProductForSale.name,
        category: selectedProductForSale.category,
        club: selectedProductForSale.club,
        qty,
        costPrice: selectedProductForSale.costPrice || 0,
        salePrice: selectedProductForSale.salePrice,
        totalSum,
        netProfit,
        paymentMethod: saleForm.paymentMethod,
        clientName: saleForm.clientName.trim() || 'Гость',
        cashierName: user?.name || user?.email || 'Менеджер',
        createdAt: serverTimestamp()
      });

      // 2. Decrement stock
      await updateDoc(doc(db, 'merch_products', selectedProductForSale.id), {
        stock: increment(-qty),
        updatedAt: serverTimestamp()
      });

      toast.success('Продажа успешно проведена!');
      setShowSaleModal(false);
      setSelectedProductForSale(null);
      setSaleForm({ qty: '1', paymentMethod: 'Kaspi', clientName: '' });
    } catch (err) {
      console.error(err);
      toast.error('Ошибка проведения продажи');
    }
  };

  const handleAddSupply = async (e) => {
    e.preventDefault();
    const product = selectedProductForSupply;
    if (!product) return;
    const canSupply = isChef || (managerClub && product.club === managerClub);
    if (!canSupply) return toast.error('Доступ запрещен');
    const qty = parseInt(supplyForm.qty) || 0;
    if (qty <= 0) return toast.error('Укажите корректное количество');

    try {
      // 1. Update stock
      await updateDoc(doc(db, 'merch_products', product.id), {
        stock: increment(qty),
        updatedAt: serverTimestamp()
      });

      // 2. Log supply event in transactions/sales
      await addDoc(collection(db, 'merch_sales'), {
        productId: product.id,
        productName: product.name,
        category: product.category,
        club: product.club,
        qty: -qty, // Negative quantity represents supply/restock
        costPrice: product.costPrice || 0,
        salePrice: 0,
        totalSum: -(qty * (product.costPrice || 0)),
        netProfit: 0,
        paymentMethod: 'Складская поставка',
        clientName: supplyForm.notes.trim() || 'Поставка',
        cashierName: user?.name || user?.email || 'Менеджер',
        createdAt: serverTimestamp()
      });

      toast.success('Запасы успешно пополнены!');
      setShowSupplyModal(false);
      setSelectedProductForSupply(null);
      setSupplyForm({ qty: '10', notes: '' });
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при пополнении запасов');
    }
  };

  // ─── Resort (Inventory Recount) ────────────────────────────────────────────
  const handleSaveResort = async () => {
    const changed = Object.entries(resortValues).filter(([id, val]) => {
      const prod = products.find(p => p.id === id);
      const canResort = isChef || (managerClub && prod?.club === managerClub);
      return prod && canResort && val !== '' && parseInt(val) !== prod.stock;
    });
    if (changed.length === 0) return toast.error('Нет изменений для сохранения');
    setSavingResort(true);
    try {
      await Promise.all(changed.map(async ([id, val]) => {
        const prod = products.find(p => p.id === id);
        const actual = parseInt(val);
        const diff = actual - prod.stock;
        await updateDoc(doc(db, 'merch_products', id), {
          stock: actual,
          updatedAt: serverTimestamp(),
        });
        // Log adjustment
        await addDoc(collection(db, 'merch_sales'), {
          productId: id,
          productName: prod.name,
          category: prod.category || '',
          club: prod.club,
          qty: diff,
          costPrice: prod.costPrice || 0,
          salePrice: 0,
          totalSum: 0,
          netProfit: 0,
          paymentMethod: 'Пересорт',
          clientName: `Факт: ${actual} шт (было: ${prod.stock})`,
          cashierName: user?.name || user?.email || 'Менеджер',
          createdAt: serverTimestamp(),
        });
      }));
      toast.success(`Пересорт сохранён: ${changed.length} позиций обновлено`);
      setResortValues({});
      setActiveTab('inventory');
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при сохранении пересорта');
    } finally {
      setSavingResort(false);
    }
  };

  // ─── CSV Export Function ────────────────────────────────────────────────────
  const handleExportCSV = () => {
    let headers = [];
    let rows = [];
    
    if (activeTab === 'inventory') {
      if (isChef) {
        headers = ['Название', 'Категория', 'Клуб', 'Себестоимость', 'Цена продажи', 'Остаток', 'Мин. остаток'];
        rows = filteredProducts.map(p => [
          p.name, p.category, p.club, p.costPrice, p.salePrice, p.stock, p.minStock
        ]);
      } else {
        headers = ['Название', 'Категория', 'Клуб', 'Цена продажи', 'Остаток'];
        rows = filteredProducts.map(p => [
          p.name, p.category, p.club, p.salePrice, p.stock
        ]);
      }
    } else {
      if (isChef) {
        headers = ['Дата', 'Клуб', 'Товар', 'Категория', 'Количество', 'Себестоимость', 'Цена продажи', 'Сумма чека', 'Прибыль', 'Оплата', 'Клиент', 'Провел'];
        rows = filteredSales.map(s => {
          const dateObj = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : new Date();
          return [
            dateObj.toLocaleString('ru-RU'), s.club, s.productName, s.category, s.qty, s.costPrice, s.salePrice, s.totalSum, s.netProfit, s.paymentMethod, s.clientName, s.cashierName
          ];
        });
      } else {
        headers = ['Дата', 'Клуб', 'Товар', 'Категория', 'Количество', 'Цена продажи', 'Сумма чека', 'Оплата', 'Клиент', 'Провел'];
        rows = filteredSales.map(s => {
          const dateObj = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : new Date();
          return [
            dateObj.toLocaleString('ru-RU'), s.club, s.productName, s.category, s.qty, s.salePrice, s.totalSum, s.paymentMethod, s.clientName, s.cashierName
          ];
        });
      }
    }

    const csvContent = "\uFEFF" + [
      headers.join(';'),
      ...rows.map(r => r.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `merch_${activeTab}_${selectedClub}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Экспорт успешно завершен!');
  };

  // ─── Filtered Data ─────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchClub = selectedClub === 'ALL' || p.club === selectedClub;
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.category.toLowerCase().includes(searchTerm.toLowerCase());
      return matchClub && matchSearch;
    });
  }, [products, selectedClub, searchTerm]);

  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const matchClub = selectedClub === 'ALL' || s.club === selectedClub;
      const matchSearch = s.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.cashierName.toLowerCase().includes(searchTerm.toLowerCase());
      return matchClub && matchSearch;
    });
  }, [sales, selectedClub, searchTerm]);

  // ─── Analytics Computations ────────────────────────────────────────────────
  const stats = useMemo(() => {
    let totalStockItems = 0;
    let totalInventoryCostValue = 0;
    let totalSalesRevenue = 0;
    let totalNetProfit = 0;
    let lowStockCount = 0;

    const activeProducts = products.filter(p => selectedClub === 'ALL' || p.club === selectedClub);
    const activeSales = sales.filter(s => selectedClub === 'ALL' || s.club === selectedClub);

    activeProducts.forEach(p => {
      totalStockItems += (p.stock || 0);
      totalInventoryCostValue += (p.stock || 0) * (p.costPrice || 0);
      if ((p.stock || 0) <= (p.minStock || 0)) {
        lowStockCount++;
      }
    });

    activeSales.forEach(s => {
      if (s.qty > 0) {
        totalSalesRevenue += (s.totalSum || 0);
        totalNetProfit += (s.netProfit || 0);
      }
    });

    return {
      totalStockItems,
      totalInventoryCostValue,
      totalSalesRevenue,
      totalNetProfit,
      lowStockCount
    };
  }, [products, sales, selectedClub]);

  return (
    <div className="space-y-6 animate-fade">
      
      {/* Header Panel */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[var(--bg-card)] p-5 rounded-3xl border border-[var(--border)] shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-[var(--accent-purple)] border border-purple-500/10">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-[var(--text-primary)] italic uppercase tracking-tight">
              Учет Мерча и Продаж
            </h1>
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">
              Инвентаризация и управление складом по клубам
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Club Filter */}
          <div className="flex bg-[var(--bg-primary)] p-1 rounded-xl border border-[var(--border)]">
            {isChef ? (
              <>
                <button 
                  onClick={() => setSelectedClub('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedClub === 'ALL' ? 'bg-[var(--accent-purple)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  Все клубы
                </button>
                {CLUBS.map(club => (
                  <button 
                    key={club}
                    onClick={() => setSelectedClub(club)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedClub === club ? 'bg-[var(--accent-purple)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                  >
                    {club}
                  </button>
                ))}
              </>
            ) : (
              <span className="px-4 py-1.5 text-xs font-black uppercase text-[var(--accent-purple)] tracking-wider">
                Клуб: {selectedClub}
              </span>
            )}
          </div>

          {/* Add Product Button */}
          {(isChef || !!managerClub) && (
            <button
              onClick={() => {
                setEditingProduct(null);
                setProductForm({ name: '', club: selectedClub === 'ALL' ? '4YOU' : selectedClub, category: 'Худи', costPrice: '', salePrice: '', stock: '', minStock: '5' });
                setShowProductModal(true);
              }}
              className="flex items-center gap-2 bg-[var(--accent-purple)] hover:bg-purple-600 text-white font-bold text-xs uppercase px-4 py-2.5 rounded-xl border border-purple-400/20 shadow-lg shadow-purple-500/10 transition-all"
            >
              <Plus size={14} /> Добавить товар
            </button>
          )}
        </div>
      </div>

      {/* Analytics Dashboard Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {isChef ? (
          <>
            {/* Total Cost Value (Chef only) */}
            <div className="bg-[var(--bg-card)] p-5 rounded-3xl border border-[var(--border)] shadow-md flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Стоимость склада</span>
                <span className="text-xl md:text-2xl font-black text-[var(--text-primary)] tracking-tight block mt-1">
                  {stats.totalInventoryCostValue.toLocaleString()} ₸
                </span>
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest block mt-1">
                  {stats.totalStockItems} шт. в наличии
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                <Store size={20} />
              </div>
            </div>

            {/* Revenue */}
            <div className="bg-[var(--bg-card)] p-5 rounded-3xl border border-[var(--border)] shadow-md flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Выручка продаж</span>
                <span className="text-xl md:text-2xl font-black text-emerald-400 tracking-tight block mt-1">
                  {stats.totalSalesRevenue.toLocaleString()} ₸
                </span>
                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block mt-1">
                  Все проведенные чеки
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <ArrowUpRight size={20} />
              </div>
            </div>

            {/* Net Profit (Chef only) */}
            <div className="bg-[var(--bg-card)] p-5 rounded-3xl border border-[var(--border)] shadow-md flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Чистая прибыль</span>
                <span className="text-xl md:text-2xl font-black text-purple-400 tracking-tight block mt-1">
                  {stats.totalNetProfit.toLocaleString()} ₸
                </span>
                <span className="text-[9px] font-bold text-purple-400 uppercase tracking-widest block mt-1">
                  Маржинальность учтена
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                <DollarSign size={20} />
              </div>
            </div>

            {/* Low Stock Alerts */}
            <div className={`bg-[var(--bg-card)] p-5 rounded-3xl border shadow-md flex items-center justify-between transition-all ${stats.lowStockCount > 0 ? 'border-orange-500/30 bg-orange-500/5' : 'border-[var(--border)]'}`}>
              <div>
                <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Мало на складе</span>
                <span className={`text-xl md:text-2xl font-black tracking-tight block mt-1 ${stats.lowStockCount > 0 ? 'text-orange-400' : 'text-[var(--text-primary)]'}`}>
                  {stats.lowStockCount} товаров
                </span>
                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block mt-1">
                  Требуется пополнение
                </span>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.lowStockCount > 0 ? 'bg-orange-500/10 text-orange-400' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                <AlertTriangle size={20} />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Revenue card for manager */}
            <div className="bg-[var(--bg-card)] p-5 rounded-3xl border border-[var(--border)] shadow-md flex items-center justify-between col-span-2 md:col-span-2">
              <div>
                <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Выручка клуба ({selectedClub})</span>
                <span className="text-xl md:text-2xl font-black text-emerald-400 tracking-tight block mt-1">
                  {stats.totalSalesRevenue.toLocaleString()} ₸
                </span>
                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block mt-1">
                  Ваши продажи по клубу
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <ArrowUpRight size={20} />
              </div>
            </div>

            {/* Total items count for manager */}
            <div className="bg-[var(--bg-card)] p-5 rounded-3xl border border-[var(--border)] shadow-md flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Товары на складе</span>
                <span className="text-xl md:text-2xl font-black text-[var(--text-primary)] tracking-tight block mt-1">
                  {stats.totalStockItems} шт.
                </span>
                <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest block mt-1">
                  Всего единиц в наличии
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                <Store size={20} />
              </div>
            </div>

            {/* Low stock alerts for manager */}
            <div className={`bg-[var(--bg-card)] p-5 rounded-3xl border shadow-md flex items-center justify-between transition-all ${stats.lowStockCount > 0 ? 'border-orange-500/30 bg-orange-500/5' : 'border-[var(--border)]'}`}>
              <div>
                <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Мало на складе</span>
                <span className={`text-xl md:text-2xl font-black tracking-tight block mt-1 ${stats.lowStockCount > 0 ? 'text-orange-400' : 'text-[var(--text-primary)]'}`}>
                  {stats.lowStockCount} позиций
                </span>
                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block mt-1">
                  Сообщите о поставке
                </span>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.lowStockCount > 0 ? 'bg-orange-500/10 text-orange-400' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                <AlertTriangle size={20} />
              </div>
            </div>
          </>
        )}

      </div>

      {/* Tabs, Search & Export Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Navigation Tabs */}
        <div className="flex gap-1.5 p-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-fit">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'inventory' ? 'bg-[var(--accent-purple)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
          >
            <Store size={14} /> Склад
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'sales' ? 'bg-[var(--accent-purple)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
          >
            <History size={14} /> История продаж
          </button>
          {(isChef || !!managerClub) && (
            <button
              onClick={() => { setActiveTab('resort'); setResortValues({}); }}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'resort' ? 'bg-orange-500 text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
            >
              <ClipboardList size={14} /> Пересорт
            </button>
          )}
        </div>

        {/* Search Input & CSV Export */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input 
              type="text"
              placeholder={activeTab === 'inventory' ? 'Поиск товара или категории...' : 'Поиск чеков / кассира...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent-purple)] transition-all"
            />
          </div>

          <button
            onClick={handleExportCSV}
            title="Экспортировать отчет в CSV (Excel)"
            className="p-2.5 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-2xl border border-[var(--border)] flex items-center justify-center transition-all shadow-md"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Content Body */}
      {activeTab === 'resort' ? (
        /* --- RESORT (INVENTORY RECOUNT) TAB --- */
        <div className="bg-[var(--bg-card)] rounded-3xl border border-orange-500/20 shadow-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between" style={{ background: 'rgba(245,158,11,0.04)' }}>
            <div>
              <div className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wide flex items-center gap-2">
                <ClipboardList size={16} className="text-orange-400" /> Пересорт / Инвентаризация
              </div>
              <div className="text-[10px] text-[var(--text-muted)] font-bold mt-0.5 uppercase tracking-widest">
                Введите фактическое кол-во для каждой позиции — остаток будет обновлён автоматически
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setActiveTab('inventory'); setResortValues({}); }}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-[var(--border)] bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveResort}
                disabled={savingResort}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-all disabled:opacity-50"
              >
                {savingResort ? 'Сохраняем...' : 'Сохранить пересорт'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-left bg-[var(--bg-hover)]/30">
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Товар</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Клуб</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-center">Система</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-center">Факт</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-center">Разница</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => {
                  const factVal = resortValues[p.id] ?? '';
                  const fact = factVal === '' ? null : parseInt(factVal);
                  const diff = fact !== null ? fact - p.stock : null;
                  const hasDiff = diff !== null && diff !== 0;
                  return (
                    <tr key={p.id} className={`border-b border-[var(--border)] transition-colors ${hasDiff ? 'bg-orange-500/5' : 'hover:bg-[var(--bg-hover)]/30'}`}>
                      <td className="px-6 py-3">
                        <span className="font-extrabold text-sm text-[var(--text-primary)] block">{p.name}</span>
                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">{p.category}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-0.5 text-[10px] font-black bg-purple-500/10 text-purple-400 rounded-lg border border-purple-500/20 uppercase">{p.club}</span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className="font-black text-sm text-[var(--text-primary)]">{p.stock} шт</span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <input
                          type="number"
                          min="0"
                          placeholder={String(p.stock)}
                          value={factVal}
                          onChange={e => setResortValues(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-20 text-center font-black text-sm rounded-lg border outline-none py-1.5 px-2 transition-all"
                          style={{
                            background: hasDiff ? 'rgba(245,158,11,0.08)' : 'var(--bg-hover)',
                            borderColor: hasDiff ? '#f59e0b' : 'var(--border)',
                            color: hasDiff ? '#f59e0b' : 'var(--text-primary)',
                          }}
                        />
                      </td>
                      <td className="px-6 py-3 text-center">
                        {diff === null ? (
                          <span className="text-[var(--text-muted)] text-xs">—</span>
                        ) : diff === 0 ? (
                          <span className="text-emerald-400 font-black text-xs">✔ OK</span>
                        ) : (
                          <span className={`font-black text-sm ${diff > 0 ? 'text-blue-400' : 'text-red-500'}`}>
                            {diff > 0 ? '+' : ''}{diff} шт
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'inventory' ? (
        /* --- INVENTORY LIST TAB --- */
        <div className="bg-[var(--bg-card)] rounded-3xl border border-[var(--border)] shadow-xl overflow-hidden">
          {loadingProducts ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Загрузка инвентаря...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-20 text-center text-[var(--text-muted)]">
              <Package size={48} className="mx-auto opacity-35 mb-4 text-purple-400" />
              <p className="text-sm font-bold uppercase tracking-wider">Нет товаров на складе</p>
              <p className="text-xs mt-1">Добавьте новый товар или измените фильтр клуба</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left bg-[var(--bg-hover)]/30">
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Товар / Категория</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Клуб</th>
                    {isChef && <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-right">Себестоимость</th>}
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-right">Цена продажи</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-center">В наличии</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-center">Статус</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const isLow = p.stock <= p.minStock;
                    const isOut = p.stock === 0;

                    return (
                      <tr key={p.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)]/40 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-extrabold text-sm text-[var(--text-primary)] block">{p.name}</span>
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mt-0.5 block">{p.category}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 text-[10px] font-black bg-purple-500/10 text-purple-400 rounded-lg border border-purple-500/20 uppercase">
                            {p.club}
                          </span>
                        </td>
                        {isChef && (
                          <td className="px-6 py-4 text-right">
                            <span className="font-bold text-xs text-[var(--text-secondary)]">{(p.costPrice || 0).toLocaleString()} ₸</span>
                          </td>
                        )}
                        <td className="px-6 py-4 text-right">
                          <span className="font-extrabold text-sm text-emerald-400">{(p.salePrice || 0).toLocaleString()} ₸</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`font-black text-sm ${isOut ? 'text-red-500' : isLow ? 'text-orange-400' : 'text-[var(--text-primary)]'}`}>
                            {p.stock}
                          </span>
                          <span className="text-[9px] font-bold text-[var(--text-muted)] block">мин: {p.minStock}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-center">
                            {isOut ? (
                              <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 text-[9px] font-black uppercase tracking-wider">Нет</span>
                            ) : isLow ? (
                              <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-black uppercase tracking-wider">Мало</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider">ОК</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2.5">
                            {/* Sell Button */}
                            <button
                              disabled={isOut}
                              onClick={() => {
                                setSelectedProductForSale(p);
                                setShowSaleModal(true);
                              }}
                              className={`flex items-center gap-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase border transition-all ${isOut ? 'bg-gray-500/10 text-gray-500 border-gray-500/10 cursor-not-allowed' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'}`}
                            >
                              <ShoppingCart size={11} /> Продать
                            </button>

                            {(isChef || (managerClub && p.club === managerClub)) && (
                              <>
                                {/* Restock Button */}
                                <button
                                  onClick={() => {
                                    setSelectedProductForSupply(p);
                                    setShowSupplyModal(true);
                                  }}
                                  className="flex items-center gap-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all"
                                >
                                  + Поставка
                                </button>

                                {/* Edit Button */}
                                <button
                                  onClick={() => {
                                    setEditingProduct(p);
                                    setProductForm({
                                      name: p.name,
                                      club: p.club,
                                      category: p.category,
                                      costPrice: String(p.costPrice || ''),
                                      salePrice: String(p.salePrice || ''),
                                      stock: String(p.stock || ''),
                                      minStock: String(p.minStock || '')
                                    });
                                    setShowProductModal(true);
                                  }}
                                  className="p-2 bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-purple-400 rounded-lg border border-[var(--border)] transition-all"
                                >
                                  <Edit3 size={12} />
                                </button>

                                {/* Delete Button */}
                                <button
                                  onClick={() => handleDeleteProduct(p.id)}
                                  className="p-2 bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-red-500 rounded-lg border border-[var(--border)] transition-all"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* --- SALES TRANSACTIONS TAB --- */
        <div className="bg-[var(--bg-card)] rounded-3xl border border-[var(--border)] shadow-xl overflow-hidden">
          {loadingSales ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Загрузка истории...</span>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="py-20 text-center text-[var(--text-muted)]">
              <History size={48} className="mx-auto opacity-35 mb-4 text-purple-400" />
              <p className="text-sm font-bold uppercase tracking-wider">Нет транзакций</p>
              <p className="text-xs mt-1">Здесь будут отображаться продажи и складские поставки</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left bg-[var(--bg-hover)]/30">
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Дата / Время</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Объект</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Товар</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-center">Кол-во</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-right">Сумма чека</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Оплата</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Провел</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((s) => {
                    const isSale = s.qty > 0;
                    const dateObj = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : new Date();
                    
                    return (
                      <tr key={s.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)]/40 transition-colors">
                        <td className="px-6 py-4 text-xs font-semibold text-[var(--text-secondary)]">
                          {dateObj.toLocaleDateString('ru-RU')} в {dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-black uppercase text-[var(--text-primary)]">{s.club}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-extrabold text-sm text-[var(--text-primary)] block">{s.productName}</span>
                          <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest">{s.category}</span>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-sm">
                          {isSale ? (
                            <span className="text-emerald-400">+{s.qty} шт</span>
                          ) : (
                            <span className="text-blue-400">{s.qty} шт</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right font-black">
                          {isSale ? (
                            <span className="text-emerald-400">+{(s.totalSum || 0).toLocaleString()} ₸</span>
                          ) : (
                            <span className="text-blue-400">{(s.totalSum || 0).toLocaleString()} ₸</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                            {s.paymentMethod === 'Kaspi' ? (
                              <><span className="w-2 h-2 rounded-full bg-red-500"></span> Kaspi</>
                            ) : s.paymentMethod === 'Наличные' ? (
                              <><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Наличные</>
                            ) : s.paymentMethod === 'Складская поставка' ? (
                              <><span className="w-2 h-2 rounded-full bg-blue-500"></span> Склад</>
                            ) : (
                              <><span className="w-2 h-2 rounded-full bg-gray-500"></span> {s.paymentMethod}</>
                            )}
                          </div>
                          {s.clientName && s.clientName !== 'Гость' && (
                            <span className="text-[10px] text-[var(--text-muted)] block mt-0.5">Клиент: {s.clientName}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-[var(--text-secondary)]">
                          {s.cashierName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL: ADD / EDIT PRODUCT ─── */}
      {showProductModal && (isChef || !!managerClub) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative">
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-md font-black text-[var(--text-primary)] uppercase italic tracking-wider flex items-center gap-2">
                <Store size={18} className="text-[var(--accent-purple)]" />
                {editingProduct ? 'Редактировать товар' : 'Добавить товар'}
              </h3>
              <button 
                onClick={() => setShowProductModal(false)}
                className="p-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-5 space-y-4">
              
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Название товара</label>
                <input 
                  type="text"
                  placeholder="Худи Black Edition XL"
                  value={productForm.name}
                  onChange={e => setProductForm({...productForm, name: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Клуб</label>
                  <select 
                    value={productForm.club}
                    disabled={!isChef}
                    onChange={e => setProductForm({...productForm, club: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all disabled:opacity-50"
                  >
                    {CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Категория</label>
                  <select 
                    value={productForm.category}
                    onChange={e => setProductForm({...productForm, category: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {isChef ? (
                  <>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Себестоимость (₸)</label>
                      <input 
                        type="number"
                        placeholder="5000"
                        value={productForm.costPrice}
                        onChange={e => setProductForm({...productForm, costPrice: e.target.value})}
                        className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Цена продажи (₸)</label>
                      <input 
                        type="number"
                        placeholder="12000"
                        value={productForm.salePrice}
                        onChange={e => setProductForm({...productForm, salePrice: e.target.value})}
                        className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                      />
                    </div>
                  </>
                ) : (
                  <div className="col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Цена продажи (₸)</label>
                    <input 
                      type="number"
                      placeholder="12000"
                      value={productForm.salePrice}
                      onChange={e => setProductForm({...productForm, salePrice: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Начальный остаток</label>
                  <input 
                    type="number"
                    placeholder="25"
                    disabled={!!editingProduct}
                    value={productForm.stock}
                    onChange={e => setProductForm({...productForm, stock: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Минимум для алерта</label>
                  <input 
                    type="number"
                    placeholder="5"
                    value={productForm.minStock}
                    onChange={e => setProductForm({...productForm, minStock: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border)] flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)]/80 transition-all"
                >
                  Отмена
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[var(--accent-purple)] hover:bg-purple-600 text-white shadow-lg transition-all"
                >
                  {editingProduct ? 'Сохранить изменения' : 'Создать'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: RECORD A SALE ─── */}
      {showSaleModal && selectedProductForSale && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden relative">
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-md font-black text-[var(--text-primary)] uppercase italic tracking-wider flex items-center gap-2">
                <ShoppingCart size={18} className="text-emerald-400" />
                Оформить продажу
              </h3>
              <button 
                onClick={() => setShowSaleModal(false)}
                className="p-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSale} className="p-5 space-y-4">
              
              <div className="p-4 bg-[var(--bg-primary)] rounded-2xl border border-[var(--border)]">
                <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest">{selectedProductForSale.category} • {selectedProductForSale.club}</span>
                <h4 className="font-extrabold text-sm text-[var(--text-primary)] mt-1">{selectedProductForSale.name}</h4>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--border)]/60">
                  <span className="text-xs text-[var(--text-secondary)] font-semibold">Цена:</span>
                  <span className="font-black text-sm text-emerald-400">{selectedProductForSale.salePrice.toLocaleString()} ₸</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-[var(--text-secondary)] font-semibold">В наличии:</span>
                  <span className="font-bold text-xs text-[var(--text-primary)]">{selectedProductForSale.stock} шт</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Количество (шт)</label>
                  <input 
                    type="number"
                    min="1"
                    max={selectedProductForSale.stock}
                    value={saleForm.qty}
                    onChange={e => setSaleForm({...saleForm, qty: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Тип оплаты</label>
                  <select 
                    value={saleForm.paymentMethod}
                    onChange={e => setSaleForm({...saleForm, paymentMethod: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                  >
                    <option value="Kaspi">Kaspi</option>
                    <option value="Наличные">Наличные</option>
                    <option value="Карта">Карта</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Имя клиента (необязательно)</label>
                <input 
                  type="text"
                  placeholder="Аскар А."
                  value={saleForm.clientName}
                  onChange={e => setSaleForm({...saleForm, clientName: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                />
              </div>

              {/* Total Calculation Display */}
              <div className="pt-2 flex items-center justify-between border-t border-[var(--border)]">
                <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Итого к оплате:</span>
                <span className="text-lg font-black text-emerald-400">
                  {((parseInt(saleForm.qty) || 0) * selectedProductForSale.salePrice).toLocaleString()} ₸
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setShowSaleModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)]/80 transition-all"
                >
                  Отмена
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg transition-all"
                >
                  Провести чек
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: SUPPLY / RESTOCK ─── */}
      {showSupplyModal && selectedProductForSupply && (isChef || (managerClub && selectedProductForSupply.club === managerClub)) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden relative">
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-md font-black text-[var(--text-primary)] uppercase italic tracking-wider flex items-center gap-2">
                <Plus size={18} className="text-blue-400" />
                Поставка товара
              </h3>
              <button 
                onClick={() => setShowSupplyModal(false)}
                className="p-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSupply} className="p-5 space-y-4">
              
              <div className="p-4 bg-[var(--bg-primary)] rounded-2xl border border-[var(--border)]">
                <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest">{selectedProductForSupply.category} • {selectedProductForSupply.club}</span>
                <h4 className="font-extrabold text-sm text-[var(--text-primary)] mt-1">{selectedProductForSupply.name}</h4>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--border)]/60">
                  <span className="text-xs text-[var(--text-secondary)] font-semibold">Текущий остаток:</span>
                  <span className="font-black text-sm text-[var(--text-primary)]">{selectedProductForSupply.stock} шт</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Количество к поставке (шт)</label>
                <input 
                  type="number"
                  min="1"
                  value={supplyForm.qty}
                  onChange={e => setSupplyForm({...supplyForm, qty: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Заметки / Номер партии (необязательно)</label>
                <input 
                  type="text"
                  placeholder="Новая партия от поставщика"
                  value={supplyForm.notes}
                  onChange={e => setSupplyForm({...supplyForm, notes: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setShowSupplyModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)]/80 transition-all"
                >
                  Отмена
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-blue-500 hover:bg-blue-600 text-white shadow-lg transition-all"
                >
                  Провести поставку
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default MerchPage;
