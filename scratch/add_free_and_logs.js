import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../src/pages/MerchPage.jsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Update saleForm initial state:
const saleFormOld = `  // Form States (New Sale)
  const [saleForm, setSaleForm] = useState({
    qty: '1',
    paymentMethod: 'Kaspi',
    clientName: '',
    buyerType: 'client',
    customPrice: '',
    notes: ''
  });`;

const saleFormNew = `  // Form States (New Sale)
  const [saleForm, setSaleForm] = useState({
    qty: '1',
    paymentMethod: 'Kaspi',
    clientName: '',
    buyerType: 'client',
    customPrice: '',
    notes: '',
    isFree: false,
    freeReason: 'Бартер'
  });`;

if (!content.includes(saleFormOld)) {
  console.error("saleFormOld target not found!");
  process.exit(1);
}
content = content.replace(saleFormOld, saleFormNew);


// 2. Add historyLogs and loadingHistory states, and subscription:
const stateTarget = `  const [loadingSales, setLoadingSales] = useState(true);`;
const stateReplacement = `  const [loadingSales, setLoadingSales] = useState(true);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);`;

if (!content.includes(stateTarget)) {
  console.error("stateTarget not found!");
  process.exit(1);
}
content = content.replace(stateTarget, stateReplacement);


// Add the subscription:
const subTarget = `    setLoadingSales(true);
    const qSales = query(collection(db, 'merch_sales'));
    const unsubSales = onSnapshot(qSales, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort sales by date desc
      setSales(list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setLoadingSales(false);
    }, (error) => {
      console.error('Error fetching sales history:', error);
      setLoadingSales(false);
    });`;

const subReplacement = `    setLoadingSales(true);
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

    setLoadingHistory(true);
    const qHistory = query(collection(db, 'merch_history'));
    const unsubHistory = onSnapshot(qHistory, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistoryLogs(list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setLoadingHistory(false);
    }, (error) => {
      console.error('Error fetching history logs:', error);
      setLoadingHistory(false);
    });`;

if (!content.includes(subTarget)) {
  console.error("subTarget not found!");
  process.exit(1);
}
content = content.replace(subTarget, subReplacement);

// Return unsubHistory:
const returnUnsubTarget = `    return () => {
      unsubProducts();
      unsubSales();
    };`;

const returnUnsubReplacement = `    return () => {
      unsubProducts();
      unsubSales();
      unsubHistory();
    };`;

if (!content.includes(returnUnsubTarget)) {
  console.error("returnUnsubTarget not found!");
  process.exit(1);
}
content = content.replace(returnUnsubTarget, returnUnsubReplacement);


// 3. Update handleCreateSale to support free sale:
const createSaleOld = `  const handleCreateSale = async (e) => {
    e.preventDefault();
    const qty = parseInt(saleForm.qty) || 0;
    if (qty <= 0) return toast.error('Укажите корректное количество');
    if (qty > selectedProductForSale.stock) return toast.error(\`Недостаточно товара на складе (в наличии: \${selectedProductForSale.stock} шт)\`);

    const salePrice = parseFloat(saleForm.customPrice) >= 0 ? parseFloat(saleForm.customPrice) : selectedProductForSale.salePrice;
    const totalSum = qty * salePrice;
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
        salePrice,
        totalSum,
        netProfit,
        paymentMethod: saleForm.paymentMethod,
        buyerType: saleForm.buyerType || 'client',
        clientName: saleForm.clientName.trim() || (saleForm.buyerType === 'employee' ? 'Сотрудник' : 'Гость'),
        notes: saleForm.notes.trim() || null,
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
      setSaleForm({ qty: '1', paymentMethod: 'Kaspi', clientName: '', buyerType: 'client', customPrice: '', notes: '' });
    } catch (err) {
      console.error(err);
      toast.error('Ошибка проведения продажи');
    }
  };`;

const createSaleNew = `  const handleCreateSale = async (e) => {
    e.preventDefault();
    const qty = parseInt(saleForm.qty) || 0;
    if (qty <= 0) return toast.error('Укажите корректное количество');
    if (qty > selectedProductForSale.stock) return toast.error(\`Недостаточно товара на складе (в наличии: \${selectedProductForSale.stock} шт)\`);

    const isFree = !!saleForm.isFree;
    const salePrice = isFree ? 0 : (parseFloat(saleForm.customPrice) >= 0 ? parseFloat(saleForm.customPrice) : selectedProductForSale.salePrice);
    const totalSum = qty * salePrice;
    const netProfit = isFree 
      ? -(qty * (selectedProductForSale.costPrice || 0))
      : totalSum - (qty * (selectedProductForSale.costPrice || 0));

    try {
      // 1. Create sale record
      await addDoc(collection(db, 'merch_sales'), {
        productId: selectedProductForSale.id,
        productName: selectedProductForSale.name,
        category: selectedProductForSale.category,
        club: selectedProductForSale.club,
        qty,
        costPrice: selectedProductForSale.costPrice || 0,
        salePrice,
        totalSum,
        netProfit,
        paymentMethod: isFree ? saleForm.freeReason : saleForm.paymentMethod,
        isFree,
        buyerType: isFree ? 'client' : (saleForm.buyerType || 'client'),
        clientName: saleForm.clientName.trim() || (saleForm.buyerType === 'employee' && !isFree ? 'Сотрудник' : 'Гость'),
        notes: saleForm.notes.trim() || null,
        cashierName: user?.name || user?.email || 'Менеджер',
        createdAt: serverTimestamp()
      });

      // 2. Decrement stock
      await updateDoc(doc(db, 'merch_products', selectedProductForSale.id), {
        stock: increment(-qty),
        updatedAt: serverTimestamp()
      });

      toast.success(isFree ? 'Товар выдан бесплатно!' : 'Продажа успешно проведена!');
      setShowSaleModal(false);
      setSelectedProductForSale(null);
      setSaleForm({ qty: '1', paymentMethod: 'Kaspi', clientName: '', buyerType: 'client', customPrice: '', notes: '', isFree: false, freeReason: 'Бартер' });
    } catch (err) {
      console.error(err);
      toast.error('Ошибка проведения продажи');
    }
  };`;

if (!content.includes(createSaleOld)) {
  console.error("createSaleOld target not found!");
  process.exit(1);
}
content = content.replace(createSaleOld, createSaleNew);


// 4. Update handleDeleteProduct to log to history logs:
const deleteOld = `  const handleDeleteProduct = async (id) => {
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
  };`;

const deleteNew = `  const handleDeleteProduct = async (id) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const canDelete = isChef || (managerClub && product.club === managerClub);
    if (!canDelete) return toast.error('Доступ запрещен');
    if (!window.confirm('Вы уверены, что хотите удалить этот товар из базы?')) return;
    try {
      // 1. Log deletion history before deleting
      await addDoc(collection(db, 'merch_history'), {
        type: 'delete',
        productId: id,
        productName: product.name,
        club: product.club,
        details: \`Удален товар: "\${product.name}" (Остаток: \${product.stock} шт, Цена: \${product.salePrice} ₸)\`,
        cashierName: user?.name || user?.email || 'Менеджер',
        createdAt: serverTimestamp()
      });

      // 2. Delete document
      await deleteDoc(doc(db, 'merch_products', id));
      toast.success('Товар удален');
    } catch (err) {
      toast.error('Не удалось удалить товар');
    }
  };`;

if (!content.includes(deleteOld)) {
  console.error("deleteOld target not found!");
  process.exit(1);
}
content = content.replace(deleteOld, deleteNew);


// 5. Update handleSaveResort to log to history logs:
const resortOld = `        // Log adjustment
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
          clientName: \`Факт: \${actual} шт (было: \${prod.stock})\`,
          cashierName: user?.name || user?.email || 'Менеджер',
          createdAt: serverTimestamp(),
        });
      }));
      toast.success(\`Пересорт сохранён: \${changed.length} позиций обновлено\`);`;

const resortNew = `        // Log adjustment
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
          clientName: \`Факт: \${actual} шт (было: \${prod.stock})\`,
          cashierName: user?.name || user?.email || 'Менеджер',
          createdAt: serverTimestamp(),
        });

        // Log in merch_history (audit logs)
        await addDoc(collection(db, 'merch_history'), {
          type: 'resort',
          productId: id,
          productName: prod.name,
          club: prod.club,
          details: \`Корректировка остатка товара "\${prod.name}": факт \${actual} шт (было \${prod.stock} шт, разница: \${diff > 0 ? '+' : ''}\${diff} шт)\`,
          cashierName: user?.name || user?.email || 'Менеджер',
          createdAt: serverTimestamp()
        });
      }));
      toast.success(\`Пересорт сохранён: \${changed.length} позиций обновлено\`);`;

if (!content.includes(resortOld)) {
  console.error("resortOld target not found!");
  process.exit(1);
}
content = content.replace(resortOld, resortNew);


// Also log product supply (handleAddSupply):
const supplyOld = `      // 2. Log supply event in transactions/sales
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
      });`;

const supplyNew = `      // 2. Log supply event in transactions/sales
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

      // Log in merch_history (audit logs)
      await addDoc(collection(db, 'merch_history'), {
        type: 'supply',
        productId: product.id,
        productName: product.name,
        club: product.club,
        details: \`Поставка товара "\${product.name}": +\${qty} шт (примечание: \${supplyForm.notes.trim() || 'нет'})\`,
        cashierName: user?.name || user?.email || 'Менеджер',
        createdAt: serverTimestamp()
      });`;

if (!content.includes(supplyOld)) {
  console.error("supplyOld target not found!");
  process.exit(1);
}
content = content.replace(supplyOld, supplyNew);


// Also log product creation in handleSaveProduct:
const createProdOld = `      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, 'merch_products'), data);
        toast.success('Товар добавлен в инвентарь');
      }`;

const createProdNew = `      } else {
        data.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'merch_products'), data);
        toast.success('Товар добавлен в инвентарь');

        // Log in merch_history (audit logs)
        await addDoc(collection(db, 'merch_history'), {
          type: 'create',
          productId: docRef.id,
          productName: data.name,
          club: data.club,
          details: \`Добавлен новый товар: "\${data.name}" (Начальный остаток: \${data.stock} шт, Цена: \${data.salePrice} ₸)\`,
          cashierName: user?.name || user?.email || 'Менеджер',
          createdAt: serverTimestamp()
        });
      }`;

if (!content.includes(createProdOld)) {
  console.error("createProdOld target not found!");
  process.exit(1);
}
content = content.replace(createProdOld, createProdNew);


// 6. Update Sell Button click in inventory table:
const sellButtonOld = `                              onClick={() => {
                                setSelectedProductForSale(p);
                                setSaleForm({
                                  qty: '1',
                                  paymentMethod: 'Kaspi',
                                  clientName: '',
                                  buyerType: 'client',
                                  customPrice: String(p.salePrice),
                                  notes: ''
                                });
                                setShowSaleModal(true);
                              }}`;

const sellButtonNew = `                              onClick={() => {
                                setSelectedProductForSale(p);
                                setSaleForm({
                                  qty: '1',
                                  paymentMethod: 'Kaspi',
                                  clientName: '',
                                  buyerType: 'client',
                                  customPrice: String(p.salePrice),
                                  notes: '',
                                  isFree: false,
                                  freeReason: 'Бартер'
                                });
                                setShowSaleModal(true);
                              }}`;

if (!content.includes(sellButtonOld)) {
  console.error("sellButtonOld target not found!");
  process.exit(1);
}
content = content.replace(sellButtonOld, sellButtonNew);


// 7. Update filteredLogs definition and CSV export handler in MerchPage:
const filteredSalesTarget = `  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const matchClub = selectedClub === 'ALL' || s.club === selectedClub;
      const matchSearch = s.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.cashierName.toLowerCase().includes(searchTerm.toLowerCase());
      return matchClub && matchSearch;
    });
  }, [sales, selectedClub, searchTerm]);`;

const filteredSalesReplacement = `  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const matchClub = selectedClub === 'ALL' || s.club === selectedClub;
      const matchSearch = s.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.cashierName.toLowerCase().includes(searchTerm.toLowerCase());
      return matchClub && matchSearch;
    });
  }, [sales, selectedClub, searchTerm]);

  const filteredLogs = useMemo(() => {
    return historyLogs.filter(log => {
      const matchClub = selectedClub === 'ALL' || log.club === selectedClub;
      const matchSearch = log.productName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.details?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.cashierName?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchClub && matchSearch;
    });
  }, [historyLogs, selectedClub, searchTerm]);`;

if (!content.includes(filteredSalesTarget)) {
  console.error("filteredSalesTarget not found!");
  process.exit(1);
}
content = content.replace(filteredSalesTarget, filteredSalesReplacement);


// CSV export updates:
const csvExportOld = `      } else {
        headers = ['Дата', 'Клуб', 'Товар', 'Категория', 'Количество', 'Цена продажи', 'Сумма чека', 'Оплата', 'Клиент', 'Провел'];
        rows = filteredSales.map(s => {
          const dateObj = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : new Date();
          return [
            dateObj.toLocaleString('ru-RU'), s.club, s.productName, s.category, s.qty, s.salePrice, s.totalSum, s.paymentMethod, s.clientName, s.cashierName
          ];
        });
      }
    }`;

const csvExportNew = `      } else {
        headers = ['Дата', 'Клуб', 'Товар', 'Категория', 'Количество', 'Цена продажи', 'Сумма чека', 'Оплата', 'Клиент', 'Провел'];
        rows = filteredSales.map(s => {
          const dateObj = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : new Date();
          return [
            dateObj.toLocaleString('ru-RU'), s.club, s.productName, s.category, s.qty, s.salePrice, s.totalSum, s.paymentMethod, s.clientName, s.cashierName
          ];
        });
      }
    } else if (activeTab === 'logs') {
      headers = ['Дата', 'Клуб', 'Операция', 'Детали', 'Исполнитель'];
      rows = filteredLogs.map(log => {
        const dateObj = log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000) : new Date();
        return [
          dateObj.toLocaleString('ru-RU'), log.club, log.type === 'delete' ? 'Удаление' : log.type === 'resort' ? 'Пересорт' : log.type === 'supply' ? 'Поставка' : 'Добавление', log.details, log.cashierName
        ];
      });
    }`;

if (!content.includes(csvExportOld)) {
  console.error("csvExportOld target not found!");
  process.exit(1);
}
content = content.replace(csvExportOld, csvExportNew);


// 8. Add tab button for "Логи операций":
const tabButtonsOld = `          {(isChef || !!managerClub) && (
            <button
              onClick={() => { setActiveTab('resort'); setResortValues({}); }}
              className={\`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 \${activeTab === 'resort' ? 'bg-orange-500 text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}\`}
            >
              <ClipboardList size={14} /> Пересорт
            </button>
          )}
        </div>`;

const tabButtonsNew = `          {(isChef || !!managerClub) && (
            <button
              onClick={() => { setActiveTab('resort'); setResortValues({}); }}
              className={\`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 \${activeTab === 'resort' ? 'bg-orange-500 text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}\`}
            >
              <ClipboardList size={14} /> Пересорт
            </button>
          )}
          <button
            onClick={() => setActiveTab('logs')}
            className={\`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 \${activeTab === 'logs' ? 'bg-[var(--accent-purple)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}\`}
          >
            <ClipboardList size={14} /> Логи операций
          </button>
        </div>`;

if (!content.includes(tabButtonsOld)) {
  console.error("tabButtonsOld target not found!");
  process.exit(1);
}
content = content.replace(tabButtonsOld, tabButtonsNew);


// 9. Add logs rendering block and Sell Modal update:
const renderingLogsBlock = `      {/* Content Body */}
      {activeTab === 'resort' ? (`;

const renderingLogsBlockReplacement = `      {/* Content Body */}
      {activeTab === 'logs' ? (
        /* --- HISTORY AUDIT LOGS TAB --- */
        <div className="bg-[var(--bg-card)] rounded-3xl border border-[var(--border)] shadow-xl overflow-hidden">
          {loadingHistory ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Загрузка логов...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-20 text-center text-[var(--text-muted)]">
              <ClipboardList size={48} className="mx-auto opacity-35 mb-4 text-purple-400" />
              <p className="text-sm font-bold uppercase tracking-wider">Нет записей в логах</p>
              <p className="text-xs mt-1">Здесь будут отображаться операции пересорта, удалений и поставок</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left bg-[var(--bg-hover)]/30">
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Дата / Время</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Объект</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Операция</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Описание</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Исполнитель</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => {
                    const dateObj = log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000) : new Date();
                    
                    return (
                      <tr key={log.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)]/40 transition-colors">
                        <td className="px-6 py-4 text-xs font-semibold text-[var(--text-secondary)]">
                          {dateObj.toLocaleDateString('ru-RU')} в {dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-black uppercase text-[var(--text-primary)]">{log.club}</span>
                        </td>
                        <td className="px-6 py-4">
                          {log.type === 'delete' ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 text-[9px] font-black uppercase tracking-wider">Удаление</span>
                          ) : log.type === 'resort' ? (
                            <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-black uppercase tracking-wider">Пересорт</span>
                          ) : log.type === 'supply' ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-black uppercase tracking-wider">Поставка</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider">Добавление</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-[var(--text-primary)]" style={{ maxWidth: '300px', wordBreak: 'break-word' }}>
                          {log.details}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-[var(--text-secondary)]">
                          {log.cashierName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === 'resort' ? (`;

if (!content.includes(renderingLogsBlock)) {
  console.error("renderingLogsBlock target not found!");
  process.exit(1);
}
content = content.replace(renderingLogsBlock, renderingLogsBlockReplacement);


// 10. Update Sell Modal UI inside MerchPage.jsx:
const modalUIExactOld = `              {/* Buyer Type Switcher */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Кто покупает?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSaleForm({ ...saleForm, buyerType: 'client', customPrice: String(selectedProductForSale.salePrice || 0) })}
                    className={\`py-2 px-3 rounded-xl text-xs font-bold border transition-all \${saleForm.buyerType === 'client' ? 'bg-[var(--accent-purple)] text-white border-[var(--accent-purple)] shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}\`}
                  >
                    Клиент
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaleForm({ ...saleForm, buyerType: 'employee', customPrice: String(selectedProductForSale.employeePrice || selectedProductForSale.salePrice || 0) })}
                    className={\`py-2 px-3 rounded-xl text-xs font-bold border transition-all \${saleForm.buyerType === 'employee' ? 'bg-[var(--accent-purple)] text-white border-[var(--accent-purple)] shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}\`}
                  >
                    Сотрудник
                  </button>
                </div>
              </div>

              {/* Inputs Grid */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Кол-во (шт)</label>
                  <input 
                    type="number"
                    min="1"
                    max={selectedProductForSale.stock}
                    value={saleForm.qty}
                    onChange={e => setSaleForm({...saleForm, qty: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Цена (₸/шт)</label>
                  <input 
                    type="number"
                    min="0"
                    value={saleForm.customPrice}
                    onChange={e => setSaleForm({...saleForm, customPrice: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-bold text-emerald-400 outline-none focus:border-[var(--accent-purple)] transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Оплата</label>
                  <select 
                    value={saleForm.paymentMethod}
                    onChange={e => setSaleForm({...saleForm, paymentMethod: e.target.value})}
                    className="w-full px-2 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                  >
                    <option value="Kaspi">Kaspi</option>
                    <option value="Наличные">Наличные</option>
                    <option value="Карта">Карта</option>
                  </select>
                </div>
              </div>`;

const modalUIExactNew = `              {/* Sale Type (Paid/Free) Switcher */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Тип продажи</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSaleForm({ ...saleForm, isFree: false, paymentMethod: 'Kaspi' })}
                    className={\`py-2 px-3 rounded-xl text-xs font-bold border transition-all \${!saleForm.isFree ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}\`}
                  >
                    Платная продажа
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaleForm({ ...saleForm, isFree: true, paymentMethod: 'Бартер' })}
                    className={\`py-2 px-3 rounded-xl text-xs font-bold border transition-all \${saleForm.isFree ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}\`}
                  >
                    🎁 Бесплатно / Бартер
                  </button>
                </div>
              </div>

              {!saleForm.isFree ? (
                <>
                  {/* Buyer Type Switcher */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Кто покупает?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSaleForm({ ...saleForm, buyerType: 'client', customPrice: String(selectedProductForSale.salePrice || 0) })}
                        className={\`py-2 px-3 rounded-xl text-xs font-bold border transition-all \${saleForm.buyerType === 'client' ? 'bg-[var(--accent-purple)] text-white border-[var(--accent-purple)] shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}\`}
                      >
                        Клиент
                      </button>
                      <button
                        type="button"
                        onClick={() => setSaleForm({ ...saleForm, buyerType: 'employee', customPrice: String(selectedProductForSale.employeePrice || selectedProductForSale.salePrice || 0) })}
                        className={\`py-2 px-3 rounded-xl text-xs font-bold border transition-all \${saleForm.buyerType === 'employee' ? 'bg-[var(--accent-purple)] text-white border-[var(--accent-purple)] shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}\`}
                      >
                        Сотрудник
                      </button>
                    </div>
                  </div>

                  {/* Inputs Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Кол-во (шт)</label>
                      <input 
                        type="number"
                        min="1"
                        max={selectedProductForSale.stock}
                        value={saleForm.qty}
                        onChange={e => setSaleForm({...saleForm, qty: e.target.value})}
                        className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Цена (₸/шт)</label>
                      <input 
                        type="number"
                        min="0"
                        value={saleForm.customPrice}
                        onChange={e => setSaleForm({...saleForm, customPrice: e.target.value})}
                        className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-bold text-emerald-400 outline-none focus:border-[var(--accent-purple)] transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Оплата</label>
                      <select 
                        value={saleForm.paymentMethod}
                        onChange={e => setSaleForm({...saleForm, paymentMethod: e.target.value})}
                        className="w-full px-2 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                      >
                        <option value="Kaspi">Kaspi</option>
                        <option value="Наличные">Наличные</option>
                        <option value="Карта">Карта</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Free Reasons Switcher */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Причина списания</label>
                    <div className="grid grid-cols-5 gap-1">
                      {['Бартер', 'Победитель', 'Маркетинг', 'Подарок', 'Другое'].map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setSaleForm({ ...saleForm, freeReason: r })}
                          className={\`py-1.5 rounded-lg text-[9px] font-black uppercase border text-center transition-all \${saleForm.freeReason === r ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}\`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quantity input for free sale */}
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
                </>
              )}`;

if (!content.includes(modalUIExactOld)) {
  console.error("modalUIExactOld target not found!");
  process.exit(1);
}
content = content.replace(modalUIExactOld, modalUIExactNew);


// 11. Update lower fields of the modal:
const clientNameOld = `              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">
                  {saleForm.buyerType === 'employee' ? 'Имя сотрудника' : 'Имя клиента (необязательно)'}
                </label>
                <input 
                  type="text"
                  placeholder={saleForm.buyerType === 'employee' ? 'Иван И.' : 'Аскар А.'}
                  value={saleForm.clientName}
                  onChange={e => setSaleForm({...saleForm, clientName: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                />
              </div>`;

const clientNameNew = `              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">
                  {!saleForm.isFree && saleForm.buyerType === 'employee' ? 'Имя сотрудника' : 'Имя клиента (необязательно)'}
                </label>
                <input 
                  type="text"
                  placeholder={!saleForm.isFree && saleForm.buyerType === 'employee' ? 'Иван И.' : 'Аскар А.'}
                  value={saleForm.clientName}
                  onChange={e => setSaleForm({...saleForm, clientName: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                />
              </div>`;

if (!content.includes(clientNameOld)) {
  console.error("clientNameOld target not found!");
  process.exit(1);
}
content = content.replace(clientNameOld, clientNameNew);


const totalCalculationOld = `              {/* Total Calculation Display */}
              <div className="pt-2 flex items-center justify-between border-t border-[var(--border)]">
                <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Итого к оплате:</span>
                <span className="text-lg font-black text-emerald-400">
                  {((parseInt(saleForm.qty) || 0) * (parseFloat(saleForm.customPrice) || 0)).toLocaleString()} ₸
                </span>
              </div>`;

const totalCalculationNew = `              {/* Total Calculation Display */}
              <div className="pt-2 flex items-center justify-between border-t border-[var(--border)]">
                <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Итого к оплате:</span>
                <span className={\`text-lg font-black \&quot;\${saleForm.isFree ? 'text-orange-500' : 'text-emerald-400'}\&quot;\`}>
                  {saleForm.isFree ? '🎁 0' : ((parseInt(saleForm.qty) || 0) * (parseFloat(saleForm.customPrice) || 0)).toLocaleString()} ₸
                </span>
              </div>`;

// Wait, let's normalize the string above. It has HTML/escaped double quotes \&quot; which was an artifact of writing template literals inside string.
// Let's replace it with:
// `${saleForm.isFree ? 'text-orange-500' : 'text-emerald-400'}`

const totalCalculationCorrectedNew = `              {/* Total Calculation Display */}
              <div className="pt-2 flex items-center justify-between border-t border-[var(--border)]">
                <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Итого к оплате:</span>
                <span className={\`text-lg font-black \${saleForm.isFree ? 'text-orange-500' : 'text-emerald-400'}\`}>
                  {saleForm.isFree ? '🎁 0' : ((parseInt(saleForm.qty) || 0) * (parseFloat(saleForm.customPrice) || 0)).toLocaleString()} ₸
                </span>
              </div>`;

if (!content.includes(totalCalculationOld)) {
  console.error("totalCalculationOld target not found!");
  process.exit(1);
}
content = content.replace(totalCalculationOld, totalCalculationCorrectedNew);


fs.writeFileSync(filePath, content, 'utf8');
console.log("MerchPage updated successfully with Free sale option & Operational audit logs!");
