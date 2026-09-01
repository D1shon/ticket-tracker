import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import useSheetDrag from '../lib/useSheetDrag';
import { 
  collection, query, onSnapshot, setDoc, doc, deleteDoc,
  serverTimestamp, addDoc, updateDoc, increment, where, getDoc, runTransaction
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { isMobileDevice } from '../lib/isMobile';
import { useTickets } from '../store/TicketContext';
import { pushNotify } from '../lib/pushNotify';
import { toast } from 'sonner';
import { 
  Package, Plus, Search, ShoppingCart, TrendingUp, History, 
  Trash2, Edit3, CheckCircle, AlertTriangle, ArrowUpRight, 
  ArrowDownLeft, Filter, DollarSign, Store, X, CreditCard, Wallet, Download, ClipboardList,
  Image, Camera, UploadCloud, Users, RotateCcw
} from 'lucide-react';

// ГОЛОВНОЙ СКЛАД — центральное хранилище (не фитнес-клуб): существует только в
// складском модуле (вкладка, товары, перемещения). В чекин/календарь/отзывы НЕ добавлять.
const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY', 'ГОЛОВНОЙ СКЛАД'];
const CATEGORIES = ['Худи', 'Футболки', 'Кепки', 'Шоперы', 'Блокноты', 'Ручки', 'Другое'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

const MerchPage = () => {
  const { user } = useTickets();

  // Мобильный режим — только визуальные ветки (таблицы → карточки), логика не меняется
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Role & Permissions check
  const isChef = useMemo(() => user?.role === 'chef' || user?.role === 'viewer', [user]);
  const isMarketing = useMemo(() => user?.role === 'marketing', [user]);
  // Гульдане (маркетинг) дополнительно открыты «История продаж» и «Перемещения»
  const marketingExtra = isMarketing && (user?.email || '').toLowerCase() === 'guldana.k@hj.fit';
  // Ком-Дир и РОП: мониторинг всего склада (включая себестоимость и выручку), но без продаж и редактирования
  const isKomdir = useMemo(() => user?.role === 'komdir' || user?.role === 'rop', [user]);
  const canSeeCost = isChef || isKomdir;
  // managerClub даёт права управления складом — у РОПа его быть не должно (только мониторинг)
  const managerClub = useMemo(() => (user?.role === 'manager' ? user?.club || null : null), [user]);
  // РОП заперт на своём клубе; Ком-Дир видит все
  const lockedClub = useMemo(() => managerClub || (user?.role === 'rop' ? user?.club || null : null), [user, managerClub]);
  const canSelectAllClubs = useMemo(() => isChef || isMarketing || user?.role === 'komdir' || user?.role === 'lostviewer', [isChef, isMarketing, user]);
  // Наблюдатель (Луиза): полные права менеджера склада, но сразу по всем клубам
  // (без себестоимости — как у обычного менеджера). isLostviewerFull подставляется
  // везде, где обычно проверяют «шеф или менеджер СВОЕГО клуба».
  const isLostviewerFull = user?.role === 'lostviewer';

  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory', 'sales', 'resort'
  const [selectedClub, setSelectedClub] = useState(() => (!canSelectAllClubs && lockedClub) ? lockedClub : 'ALL');
  const [selectedSku, setSelectedSku] = useState('ALL');
  const [resortValues, setResortValues] = useState({}); // productId -> actual count string
  const [savingResort, setSavingResort] = useState(false);
  const [autoDistributeBySchedule, setAutoDistributeBySchedule] = useState(true);
  const [commissionRates, setCommissionRates] = useState({}); // salespersonName -> rate string
  const [expandedPersons, setExpandedPersons] = useState({}); // salespersonName -> boolean
  const [clubEmployees, setClubEmployees] = useState([]);
  const [clubSchedules, setClubSchedules] = useState({});

  const myName = user?.displayName || user?.name || user?.email || 'Сотрудник';
  const myEmail = (user?.email || '').toLowerCase();

  // ─── Перемещения мерча между студиями ───────────────────────────────
  const [merchTransfers, setMerchTransfers] = useState([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedProductForTransfer, setSelectedProductForTransfer] = useState(null);
  const [transferForm, setTransferForm] = useState({ qty: '', toClub: '', size: '' });
  const [transferBusy, setTransferBusy] = useState(false);
  const [mismatchOpen, setMismatchOpen] = useState(null); // id перемещения с открытым вводом «другое кол-во»
  const [mismatchQty, setMismatchQty] = useState('');
  // Клуб, чью приёмку я обрабатываю (у менеджера — свой; шеф/Ком-Дир видят все)
  const myTransferClub = managerClub || (user?.role === 'rop' ? user?.club : null) || null;
  const canManageTransfers = isChef || !!managerClub || isLostviewerFull; // создавать/принимать может шеф и менеджер

  // Load employees and schedules for the selected club
  useEffect(() => {
    if (selectedClub === 'ALL') {
      setClubEmployees([]);
      setClubSchedules({});
      return;
    }
    const q = query(collection(db, 'employees'), where('club', '==', selectedClub));
    const unsubEmps = onSnapshot(q, async snap => {
      const emps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setClubEmployees(emps);

      // Reset rates to this club's employees only — prevents bleed-over between clubs
      const rates = {};
      emps.forEach(emp => {
        const isServ = emp.isService === true ||
                       (emp.name || '').toLowerCase().includes('сервис') ||
                       (emp.name || '').toLowerCase().includes('техник');
        if (isServ) return;
        if (emp.commissionRate != null && emp.commissionRate !== '') {
          rates[emp.name] = String(emp.commissionRate);
        }
      });
      setCommissionRates(rates);

      const scheds = {};
      await Promise.all(emps.map(async emp => {
        const schedSnap = await getDoc(doc(db, 'schedules', emp.id));
        if (schedSnap.exists()) scheds[emp.id] = schedSnap.data()?.days || {};
      }));
      setClubSchedules(scheds);
    });
    return () => unsubEmps();
  }, [selectedClub]);

  const getAdminsWorkingAt = useCallback((saleDate, clubName) => {
    const monthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
    const dayStr = String(saleDate.getDate());
    const hour = saleDate.getHours();
    const min = saleDate.getMinutes();
    const timeVal = hour * 60 + min;
    const workingAdmins = [];
    const monthEmps = clubEmployees.filter(emp => {
      const isServ = emp.isService === true ||
                     (emp.name || '').toLowerCase().includes('сервис') ||
                     (emp.name || '').toLowerCase().includes('техник');
      return !isServ && emp.monthKey === monthKey && emp.club === clubName;
    });
    monthEmps.forEach(emp => {
      const days = clubSchedules[emp.id];
      if (!days) return;
      const shiftStr = days[dayStr];
      if (!shiftStr) return;
      const cleanShift = shiftStr.trim().toLowerCase();
      if (!cleanShift || cleanShift === 'выходной') return;
      const parts = cleanShift.split('-');
      if (parts.length === 2) {
        const parse = t => { const [h, m] = t.trim().split(':'); return parseInt(h) * 60 + (parseInt(m) || 0); };
        const startMin = parse(parts[0]);
        const endMin = parse(parts[1]);
        if (endMin < startMin ? (timeVal >= startMin || timeVal <= endMin) : (timeVal >= startMin && timeVal <= endMin)) {
          workingAdmins.push(emp.name);
        }
      }
    });
    return workingAdmins;
  }, [clubEmployees, clubSchedules]);

  // Sync selectedClub if user updates
  useEffect(() => {
    if (!canSelectAllClubs && lockedClub) {
      setSelectedClub(lockedClub);
    }
  }, [canSelectAllClubs, lockedClub]);

  // Data States
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingSales, setLoadingSales] = useState(true);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('default'); // 'default', 'date', 'alphabet'
  
  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const [showSaleModal, setShowSaleModal] = useState(false);
  const [selectedProductForSale, setSelectedProductForSale] = useState(null);

  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [selectedProductForSupply, setSelectedProductForSupply] = useState(null);

  // Свайп вниз — закрыть мобильную шторку (общий жест приложения)
  const productSheetRef = useRef(null);
  const saleSheetRef = useRef(null);
  const transferSheetRef = useRef(null);
  const supplySheetRef = useRef(null);
  useSheetDrag(productSheetRef, showProductModal, () => setShowProductModal(false));
  useSheetDrag(saleSheetRef, showSaleModal, () => setShowSaleModal(false));
  useSheetDrag(supplySheetRef, showSupplyModal, () => setShowSupplyModal(false));
  useSheetDrag(transferSheetRef, showTransferModal, () => { if (!transferBusy) setShowTransferModal(false); });

  // Photo upload state
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState(0);
  const photoInputRef = useRef(null);

  // Form States (New / Edit Product)
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    club: '4YOU',
    category: 'Худи',
    costPrice: '',
    salePrice: '',
    employeePrice: '',
    stock: '',
    minStock: '5',
    // Размерная сетка: одна карточка = модель, остатки по размерам
    useSizes: false,
    sizes: {}
  });

  // Form States (New Sale)
  const [saleForm, setSaleForm] = useState({
    qty: '1',
    paymentMethod: 'Kaspi',
    clientName: '',
    buyerType: 'client',
    customPrice: '',
    notes: '',
    isFree: false,
    freeReason: 'Бартер',
    salespersonName: '',
    size: '' // размер для товаров с размерной сеткой
  });

  const [todayClubEmployees, setTodayClubEmployees] = useState([]);

  // Load employees for currently selected club from schedule
  useEffect(() => {
    const activeClubForEmployees = selectedProductForSale?.club || (selectedClub !== 'ALL' ? selectedClub : null);
    if (!activeClubForEmployees) {
      setTodayClubEmployees([]);
      return;
    }
    const monthKey = new Date().toISOString().slice(0, 7); // yyyy-MM
    const todayDay = String(new Date().getDate()); // day number '1'..'31'

    let unsub = null;
    const unsubAuth = auth.onAuthStateChanged(firebaseUser => {
      if (!firebaseUser) return;
      const q = query(collection(db, 'employees'), where('monthKey', '==', monthKey), where('club', '==', activeClubForEmployees));
      unsub = onSnapshot(q, async snap => {
        const empList = snap.docs.map(d => {
          const data = d.data();
          const nLower = (data.name || '').toLowerCase();
          const isServ = data.isService === true || nLower.includes('сервис') || nLower.includes('техник');
          return { id: d.id, ...data, isService: isServ };
        }).filter(e => !e.isService);
        if (empList.length === 0) { setTodayClubEmployees([]); return; }
        
        const { doc: fsDoc, getDoc } = await import('firebase/firestore');
        const allEmpList = [];
        const newRates = {};
        await Promise.all(empList.map(async emp => {
          const schedDocRef = fsDoc(db, 'schedules', emp.id);
          const schedSnap = await getDoc(schedDocRef);
          let shiftVal = '';
          if (schedSnap.exists()) {
            shiftVal = schedSnap.data()?.days?.[todayDay] || '';
          }
          allEmpList.push({ id: emp.id, name: emp.name, shift: shiftVal || 'выходной', commissionRate: emp.commissionRate });
          if (emp.commissionRate !== undefined && emp.commissionRate !== null) {
            newRates[emp.name] = String(emp.commissionRate);
          }
        }));
        setTodayClubEmployees(allEmpList);
        setCommissionRates(prev => ({ ...newRates, ...prev }));
      });
    });
    return () => { unsubAuth(); if (unsub) unsub(); };
  }, [selectedProductForSale?.club, selectedClub]);

  const filteredEmployees = useMemo(() => {
    const activeClubName = selectedProductForSale?.club || (selectedClub !== 'ALL' ? selectedClub : null);
    return todayClubEmployees.filter(emp => {
      if (activeClubName === 'NURLY ORDA') {
        return true; // Show all for Nurly Orda
      }
      const cleanShift = (emp.shift || '').trim().toLowerCase();
      return cleanShift && cleanShift !== 'выходной'; // Only show working employees for other clubs
    });
  }, [todayClubEmployees, selectedProductForSale?.club, selectedClub]);

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

    setLoadingHistory(true);
    const qHistory = query(collection(db, 'merch_history'));
    const unsubHistory = onSnapshot(qHistory, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistoryLogs(list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setLoadingHistory(false);
    }, (error) => {
      console.error('Error fetching history logs:', error);
      setLoadingHistory(false);
    });

    const qTransfers = query(collection(db, 'merch_transfers'));
    const unsubTransfers = onSnapshot(qTransfers, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
      setMerchTransfers(list);
    }, (error) => console.error('Error fetching merch transfers:', error));

    return () => {
      unsubProducts();
      unsubSales();
      unsubHistory();
      unsubTransfers();
    };
  }, []);

  // ─── Photo Handlers ────────────────────────────────────────────────────────
  // Оптимизировано: сжатие происходит на клиенте мгновенно при выборе файла.
  // Это исключает задержки при сохранении товара.
  const [photoBase64, setPhotoBase64] = useState(null);

  const compressImageToBase64 = (file) => new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX_SIZE = 480; // 480px идеальный размер для превью в списке и карточке продажи
      let { width, height } = img;
      if (width > MAX_SIZE || height > MAX_SIZE) {
        if (width > height) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        } else {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      // Качество 0.65 дает супер-легкий файл (~15–35 KB)
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    img.src = objectUrl;
  });

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Выберите файл изображения');
    
    setPhotoUploading(true);
    try {
      const base64 = await compressImageToBase64(file);
      setPhotoBase64(base64);
      setPhotoPreview(base64);
    } catch (err) {
      toast.error('Ошибка при обработке фото');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleDeletePhoto = async (product) => {
    const canManage = isChef || (managerClub && product.club === managerClub) || isLostviewerFull;
    if (!canManage) return toast.error('Доступ запрещен');
    if (!window.confirm('Удалить фото товара?')) return;
    try {
      await updateDoc(doc(db, 'merch_products', product.id), { imageUrl: null, updatedAt: serverTimestamp() });
      toast.success('Фото удалено');
    } catch (err) {
      console.error(err);
      toast.error('Ошибка удаления фото');
    }
  };

  // ─── CRUD Actions ──────────────────────────────────────────────────────────
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    const canManage = isChef || (managerClub && productForm.club === managerClub) || isLostviewerFull;
    if (!canManage) return toast.error('Доступ запрещен');
    if (!productForm.name.trim()) return toast.error('Введите название товара');
    
    const cost = isChef 
      ? (parseFloat(productForm.costPrice) || 0) 
      : (editingProduct ? (editingProduct.costPrice || 0) : 0);
    const sale = parseFloat(productForm.salePrice) || 0;
    const employee = parseFloat(productForm.employeePrice) || 0;
    const initialStock = parseInt(productForm.stock) || 0;
    const min = parseInt(productForm.minStock) || 0;

    // Размерная сетка: остаток считается суммой по размерам
    let sizesMap = null;
    if (productForm.useSizes) {
      sizesMap = {};
      SIZES.forEach(sz => {
        const n = parseInt(productForm.sizes?.[sz]) || 0;
        if (n > 0) sizesMap[sz] = n;
      });
    }
    const sizesTotal = sizesMap ? Object.values(sizesMap).reduce((a, b) => a + b, 0) : null;

    const data = {
      name: productForm.name.trim(),
      sku: productForm.sku.trim(),
      club: productForm.club,
      category: productForm.category,
      costPrice: cost,
      salePrice: sale,
      employeePrice: employee,
      // С сеткой размеров stock всегда = сумма размеров (и при создании, и при правке)
      stock: sizesMap ? sizesTotal : (editingProduct ? editingProduct.stock : initialStock),
      sizes: sizesMap,
      minStock: min,
      updatedAt: serverTimestamp()
    };

    // Сохраняем фото в одну операцию
    if (photoBase64) {
      data.imageUrl = photoBase64;
    } else if (editingProduct) {
      // При редактировании оставляем старое фото, если не нажали "Убрать фото"
      data.imageUrl = photoPreview ? editingProduct.imageUrl || null : null;
    } else {
      data.imageUrl = null;
    }

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'merch_products', editingProduct.id), data);
        toast.success('Товар успешно обновлен');
      } else {
        data.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'merch_products'), data);
        toast.success('Товар добавлен в инвентарь');

        // Log in merch_history (audit logs)
        await addDoc(collection(db, 'merch_history'), {
          type: 'create',
          productId: docRef.id,
          productName: data.name,
          club: data.club,
          details: `Добавлен новый товар: "${data.name}"${data.sku ? ` [Арт: ${data.sku}]` : ''} (Начальный остаток: ${data.stock} шт, Цена: ${data.salePrice} ₸)`,
          cashierName: user?.name || user?.email || 'Менеджер',
          createdAt: serverTimestamp()
        });
      }

      setShowProductModal(false);
      setEditingProduct(null);
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoBase64(null);
      setProductForm({ name: '', sku: '', club: managerClub || '4YOU', category: 'Худи', costPrice: '', salePrice: '', employeePrice: '', stock: '', minStock: '5', useSizes: false, sizes: {} });
    } catch (err) {
      console.error(err);
      toast.error('Ошибка сохранения товара');
    }
  };
  const handleDeleteProduct = async (id) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const canDelete = isChef || (managerClub && product.club === managerClub) || isLostviewerFull;
    if (!canDelete) return toast.error('Доступ запрещен');
    if (!window.confirm('Вы уверены, что хотите удалить этот товар из базы?')) return;
    try {
      // 1. Log deletion history before deleting
      await addDoc(collection(db, 'merch_history'), {
        type: 'delete',
        productId: id,
        productName: product.name,
        club: product.club,
        details: `Удален товар: "${product.name}"${product.sku ? ` [Арт: ${product.sku}]` : ''} (Остаток: ${product.stock} шт, Цена: ${product.salePrice} ₸)`,
        cashierName: user?.name || user?.email || 'Менеджер',
        createdAt: serverTimestamp()
      });

      // 2. Delete document
      await deleteDoc(doc(db, 'merch_products', id));
      toast.success('Товар удален');
    } catch (err) {
      toast.error('Не удалось удалить товар');
    }
  };

  // ─── Перемещения: поиск товара-близнеца на складе-получателе ──────────
  // Сопоставление товара на складе-получателе: по артикулу, если он есть у ОБОИХ,
  // иначе по названию+категории. Раньше товар с артикулом не находил карточку без
  // артикула (и наоборот) — при приёмке плодились дубли, и продажи «не минусовали» остаток.
  const findDestProduct = (toClub, src) => products.find(p => {
    if (p.club !== toClub) return false;
    const srcSku = String(src.sku || '').trim().toLowerCase();
    const pSku = String(p.sku || '').trim().toLowerCase();
    if (srcSku && pSku) return srcSku === pSku;
    return String(p.name || '').trim().toLowerCase() === String(src.name || '').trim().toLowerCase()
      && (p.category || 'Другое') === (src.category || 'Другое');
  });

  const openTransferModal = (p) => {
    setSelectedProductForTransfer(p);
    setTransferForm({ qty: '', toClub: '', size: '' });
    setShowTransferModal(true);
  };

  const handleCreateTransfer = async () => {
    const src = selectedProductForTransfer;
    if (!src) return;
    const qty = parseInt(transferForm.qty) || 0;
    const toClub = transferForm.toClub;
    if (qty <= 0) return toast.error('Укажите количество');
    if (qty > (src.stock || 0)) return toast.error(`Недостаточно на складе (в наличии: ${src.stock || 0})`);
    if (!toClub || toClub === src.club) return toast.error('Выберите студию-получателя');
    if (src.sizes && Object.keys(src.sizes).length > 0) {
      if (!transferForm.size) return toast.error('Выберите размер — у товара размерная сетка');
      if (qty > (src.sizes[transferForm.size] || 0)) return toast.error(`Недостаточно размера ${transferForm.size} (остаток: ${src.sizes[transferForm.size] || 0})`);
    }
    setTransferBusy(true);
    try {
      // Товар физически уезжает → сразу списываем со склада-источника (+ размер)
      const srcHasSizes = src.sizes && Object.keys(src.sizes).length > 0;
      await updateDoc(doc(db, 'merch_products', src.id), {
        stock: increment(-qty),
        ...(srcHasSizes ? { [`sizes.${transferForm.size}`]: increment(-qty) } : {}),
        updatedAt: serverTimestamp()
      });
      await addDoc(collection(db, 'merch_transfers'), {
        fromClub: src.club, toClub,
        size: srcHasSizes ? transferForm.size : null,
        productId: src.id, productName: src.name, sku: src.sku || null, category: src.category || 'Другое',
        costPrice: src.costPrice || 0, salePrice: src.salePrice || 0, employeePrice: src.employeePrice || 0,
        imageUrl: src.imageUrl || null,
        qty, status: 'pending',
        createdByName: myName, createdByEmail: myEmail,
        createdAtISO: new Date().toISOString(),
      });
      await addDoc(collection(db, 'merch_history'), {
        type: 'transfer_out', productId: src.id, productName: src.name, club: src.club,
        details: `Перемещение ${qty} шт «${src.name}» → ${toClub} (ожидает приёмки)`,
        cashierName: myName, createdAt: serverTimestamp(),
      });
      pushNotify({
        title: `📦 Поставка на ${toClub}`,
        body: `${qty} шт «${src.name}» из ${src.club} — примите на складе`,
        club: toClub, excludeEmail: myEmail, url: '/merch', tag: 'merch-transfer',
        roles: ['manager', 'chef'],
      });
      toast.success('Перемещение создано — ждём приёмки');
      setShowTransferModal(false);
      setSelectedProductForTransfer(null);
      setTransferForm({ qty: '', toClub: '', size: '' });
    } catch (e) {
      toast.error('Не удалось создать перемещение: ' + (e?.message || e));
    } finally { setTransferBusy(false); }
  };

  const handleAcceptTransfer = async (t, receivedQtyRaw) => {
    const recv = parseInt(receivedQtyRaw);
    if (isNaN(recv) || recv < 0) return toast.error('Некорректное количество');
    setTransferBusy(true);
    try {
      const dest = findDestProduct(t.toClub, { sku: t.sku, name: t.productName, category: t.category });
      if (dest) {
        await updateDoc(doc(db, 'merch_products', dest.id), {
          stock: increment(recv),
          // Перемещение с размером кладём в размер получателя (создаст ключ, если его не было)
          ...(t.size ? { [`sizes.${t.size}`]: increment(recv) } : {}),
          updatedAt: serverTimestamp()
        });
      } else {
        // На складе-получателе такого товара нет — заводим карточку копией источника
        await addDoc(collection(db, 'merch_products'), {
          name: t.productName, sku: t.sku || '', club: t.toClub, category: t.category || 'Другое',
          costPrice: t.costPrice || 0, salePrice: t.salePrice || 0, employeePrice: t.employeePrice || 0,
          stock: recv, minStock: 5, imageUrl: t.imageUrl || null,
          ...(t.size ? { sizes: { [t.size]: recv } } : {}),
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }
      const mismatch = recv !== t.qty;
      await updateDoc(doc(db, 'merch_transfers', t.id), {
        status: 'accepted', receivedQty: recv,
        note: mismatch ? `Принято ${recv} из ${t.qty}` : '',
        resolvedByName: myName, resolvedByEmail: myEmail, resolvedAtISO: new Date().toISOString(),
      });
      await addDoc(collection(db, 'merch_history'), {
        type: 'transfer_in', productName: t.productName, club: t.toClub,
        details: `Приёмка ${recv} шт «${t.productName}» из ${t.fromClub}${mismatch ? ` (отправлено ${t.qty})` : ''}`,
        cashierName: myName, createdAt: serverTimestamp(),
      });
      if (t.createdByEmail) pushNotify({
        title: mismatch ? '⚠️ Поставка принята частично' : '✅ Поставка принята',
        body: `${t.toClub}: принято ${recv}${mismatch ? ` из ${t.qty}` : ''} шт «${t.productName}»`,
        emails: [t.createdByEmail], url: '/merch', tag: 'merch-transfer',
      });
      toast.success('Поставка принята');
      setMismatchOpen(null); setMismatchQty('');
    } catch (e) {
      toast.error('Не удалось принять: ' + (e?.message || e));
    } finally { setTransferBusy(false); }
  };

  const handleRejectTransfer = async (t) => {
    if (!window.confirm(`Отклонить поставку ${t.qty} шт «${t.productName}»? Товар вернётся на склад ${t.fromClub}.`)) return;
    setTransferBusy(true);
    try {
      // Возвращаем товар источнику (если карточку удалили — создаём заново)
      try {
        await updateDoc(doc(db, 'merch_products', t.productId), {
          stock: increment(t.qty),
          ...(t.size ? { [`sizes.${t.size}`]: increment(t.qty) } : {}),
          updatedAt: serverTimestamp()
        });
      } catch {
        await addDoc(collection(db, 'merch_products'), {
          name: t.productName, sku: t.sku || '', club: t.fromClub, category: t.category || 'Другое',
          costPrice: t.costPrice || 0, salePrice: t.salePrice || 0, employeePrice: t.employeePrice || 0,
          stock: t.qty, minStock: 5, imageUrl: t.imageUrl || null,
          ...(t.size ? { sizes: { [t.size]: t.qty } } : {}),
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, 'merch_transfers', t.id), {
        status: 'rejected', resolvedByName: myName, resolvedByEmail: myEmail, resolvedAtISO: new Date().toISOString(),
      });
      await addDoc(collection(db, 'merch_history'), {
        type: 'transfer_rejected', productName: t.productName, club: t.fromClub,
        details: `Отклонена поставка ${t.qty} шт «${t.productName}» → ${t.toClub}; товар возвращён`,
        cashierName: myName, createdAt: serverTimestamp(),
      });
      if (t.createdByEmail) pushNotify({
        title: '❌ Поставка отклонена',
        body: `${t.toClub} отклонил ${t.qty} шт «${t.productName}» — товар вернулся`,
        emails: [t.createdByEmail], url: '/merch', tag: 'merch-transfer',
      });
      toast.success('Отклонено, товар возвращён источнику');
    } catch (e) {
      toast.error('Не удалось отклонить: ' + (e?.message || e));
    } finally { setTransferBusy(false); }
  };

  // Входящие ожидающие приёмки (для меня): менеджер — свой клуб; шеф/Ком-Дир — все
  const incomingPending = merchTransfers.filter(t => t.status === 'pending'
    && (isChef || isKomdir || isLostviewerFull ? true : t.toClub === myTransferClub));
  const canAcceptTransfer = (t) => isChef || (managerClub && t.toClub === managerClub) || isLostviewerFull;
  // Перемещения для вкладки истории: шеф/Ком-Дир — все; менеджер — где участвует его клуб
  const myTransfersList = (isChef || isKomdir || marketingExtra || isLostviewerFull) ? merchTransfers
    : merchTransfers.filter(t => t.fromClub === myTransferClub || t.toClub === myTransferClub);

  const handleCreateSale = async (e) => {
    e.preventDefault();
    const qty = parseInt(saleForm.qty) || 0;
    if (qty <= 0) return toast.error('Укажите корректное количество');
    if (qty > selectedProductForSale.stock) return toast.error(`Недостаточно товара на складе (в наличии: ${selectedProductForSale.stock} шт)`);
    if (filteredEmployees.length > 0 && !saleForm.salespersonName) {
      return toast.error('Выберите сотрудника, кому идёт продажа');
    }

    const isFree = !!saleForm.isFree;
    const salePrice = isFree ? 0 : (parseFloat(saleForm.customPrice) >= 0 ? parseFloat(saleForm.customPrice) : selectedProductForSale.salePrice);
    const totalSum = qty * salePrice;
    const netProfit = isFree 
      ? -(qty * (selectedProductForSale.costPrice || 0))
      : totalSum - (qty * (selectedProductForSale.costPrice || 0));

    try {
      // Продажа и списание со склада — АТОМАРНО: либо обе записи, либо ни одной.
      // Раньше шли двумя операциями: продажа записывалась, а списание могло молча упасть
      // (карточка удалена/пересоздана) — остаток «не минусовался».
      await runTransaction(db, async (tx) => {
        const prodRef = doc(db, 'merch_products', selectedProductForSale.id);
        const prodSnap = await tx.get(prodRef);
        if (!prodSnap.exists()) throw new Error('PRODUCT_MISSING');
        const live = prodSnap.data();
        const liveStock = live.stock || 0;
        if (qty > liveStock) throw new Error(`NOT_ENOUGH:${liveStock}`);
        // Товар с размерной сеткой: размер обязателен, списание по размеру
        const hasSizes = live.sizes && Object.keys(live.sizes).length > 0;
        if (hasSizes) {
          if (!saleForm.size) throw new Error('SIZE_REQUIRED');
          const szStock = live.sizes[saleForm.size] || 0;
          if (qty > szStock) throw new Error(`NOT_ENOUGH_SIZE:${saleForm.size}:${szStock}`);
        }
        tx.set(doc(collection(db, 'merch_sales')), {
          productId: selectedProductForSale.id,
          productName: selectedProductForSale.name,
          size: hasSizes ? saleForm.size : null,
          sku: selectedProductForSale.sku || null,
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
          salespersonName: saleForm.salespersonName || null,
          createdAt: serverTimestamp()
        });
        tx.update(prodRef, {
          stock: increment(-qty),
          ...(hasSizes ? { [`sizes.${saleForm.size}`]: increment(-qty) } : {}),
          updatedAt: serverTimestamp(),
        });
      });

      toast.success(isFree ? 'Товар выдан бесплатно!' : 'Продажа успешно проведена!');
      pushNotify({
        title: isFree ? '🎁 Бесплатная выдача' : '🛒 Продажа',
        body: `${selectedProductForSale.club}: ${selectedProductForSale.name} × ${qty}${isFree ? '' : ` — ${totalSum.toLocaleString('ru-RU')} ₸`}${saleForm.salespersonName ? ` · ${saleForm.salespersonName}` : ''}`,
        club: selectedProductForSale.club,
        excludeEmail: user?.email || '',
        url: '/merch',
      });
      setShowSaleModal(false);
      setSelectedProductForSale(null);
      setSaleForm({ qty: '1', paymentMethod: 'Kaspi', clientName: '', buyerType: 'client', customPrice: '', notes: '', isFree: false, freeReason: 'Бартер', salespersonName: '', size: '' });
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || '');
      if (msg === 'PRODUCT_MISSING') toast.error('Карточка товара удалена со склада — продажа НЕ проведена. Обновите страницу.');
      else if (msg === 'SIZE_REQUIRED') toast.error('Выберите размер — у этого товара размерная сетка');
      else if (msg.startsWith('NOT_ENOUGH_SIZE')) toast.error(`Недостаточно размера ${msg.split(':')[1]} (остаток: ${msg.split(':')[2]} шт) — продажа НЕ проведена`);
      else if (msg.startsWith('NOT_ENOUGH')) toast.error(`Недостаточно товара на складе (фактический остаток: ${msg.split(':')[1]} шт) — продажа НЕ проведена`);
      else toast.error('Ошибка проведения продажи — ничего не записано, попробуйте ещё раз');
    }
  };

  const handleDeleteSale = async (sale) => {
    const canManage = isChef || (managerClub && sale.club === managerClub) || isLostviewerFull;
    if (!canManage) return toast.error('Доступ запрещен');
    if (sale.returned) return toast.error('Эта продажа уже возвращена');
    // Запись пересорта — НЕ продажа: остаток уже скорректирован при инвентаризации.
    // «Возврат»/«удаление с изменением склада» для неё повторно применил бы diff и испортил остатки.
    const isResort = sale.paymentMethod === 'Пересорт';
    // Продажа (qty>0) → это ВОЗВРАТ (товар обратно на склад). Поставка (qty<0) → удаление.
    const isSale = !isResort && (sale.qty || 0) > 0;
    const confirmMsg = isResort
      ? `Удалить запись пересорта («${sale.productName}», ${sale.qty} шт)?\n\nОстаток на складе НЕ изменится — только запись из истории.`
      : isSale
      ? `Оформить возврат: «${sale.productName}» — ${sale.qty} шт, ${(sale.totalSum || 0).toLocaleString()} ₸?\n\nТовар вернётся на склад, продажа отменится. Возврат можно сделать в любое время.`
      : `Удалить эту операцию (${sale.productName}, ${sale.qty} шт)?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      if (isSale) {
        // Возврат: чек НЕ удаляем — помечаем возвращённым, чтобы он остался
        // виден в истории продаж (как обычная продажа, но с бейджем «Возвращена»)
        await updateDoc(doc(db, 'merch_sales', sale.id), {
          returned: true,
          returnedAtISO: new Date().toISOString(),
          returnedBy: user?.name || user?.email || 'Менеджер',
        });
      } else {
        // Пересорт/поставка — удаляем запись как раньше
        await deleteDoc(doc(db, 'merch_sales', sale.id));
      }

      // Возврат остатка — только если позиция ещё существует на складе
      // (товар могли удалить при чистке нулевых остатков, история продаж при этом живёт отдельно).
      // Пересорт склад не трогает.
      if (!isResort && sale.productId && products.some(p => p.id === sale.productId)) {
        await updateDoc(doc(db, 'merch_products', sale.productId), {
          stock: increment(sale.qty), // Reverts sale (adds qty back to stock) or supply (subtracts negative qty from stock)
          // Размерная сетка: возвращаем и в размер (для поставок qty<0 — корректно уменьшает)
          ...(sale.size ? { [`sizes.${sale.size}`]: increment(sale.qty) } : {}),
          updatedAt: serverTimestamp()
        }).catch(() => {}); // позиция могла исчезнуть между проверкой и записью
      }

      await addDoc(collection(db, 'merch_history'), {
        type: isSale ? 'return_sale' : 'delete_sale',
        productId: sale.productId || null,
        productName: sale.productName,
        club: sale.club,
        details: isSale
          ? `Возврат продажи: «${sale.productName}» (${sale.qty} шт, Сумма: ${sale.totalSum} ₸, Продавец: ${sale.salespersonName || 'нет'}) — товар возвращён на склад`
          : `Удалена операция: "${sale.productName}" (${sale.qty} шт, Сумма: ${sale.totalSum} ₸, Продавец: ${sale.salespersonName || 'нет'})`,
        cashierName: user?.name || user?.email || 'Менеджер',
        createdAt: serverTimestamp()
      });

      toast.success(isSale ? 'Возврат оформлен — товар вернулся на склад' : 'Операция успешно удалена');
    } catch (err) {
      console.error(err);
      toast.error(isSale ? 'Ошибка при возврате' : 'Ошибка при удалении операции');
    }
  };

  const handleAddSupply = async (e) => {
    e.preventDefault();
    const product = selectedProductForSupply;
    if (!product) return;
    const canSupply = isChef || (managerClub && product.club === managerClub) || isLostviewerFull;
    if (!canSupply) return toast.error('Доступ запрещен');
    const qty = parseInt(supplyForm.qty) || 0;
    if (qty <= 0) return toast.error('Укажите корректное количество');
    const hasSizes = product.sizes && Object.keys(product.sizes).length > 0;
    if (hasSizes && !supplyForm.size) return toast.error('Выберите размер поставки — у товара размерная сетка');

    try {
      // 1. Update stock (+ размер для сеточных товаров)
      await updateDoc(doc(db, 'merch_products', product.id), {
        stock: increment(qty),
        ...(hasSizes ? { [`sizes.${supplyForm.size}`]: increment(qty) } : {}),
        updatedAt: serverTimestamp()
      });

      // 2. Log supply event in transactions/sales
      await addDoc(collection(db, 'merch_sales'), {
        productId: product.id,
        productName: product.name,
        size: hasSizes ? supplyForm.size : null,
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
        details: `Поставка товара "${product.name}"${product.sku ? ` [Арт: ${product.sku}]` : ''}: +${qty} шт (примечание: ${supplyForm.notes.trim() || 'нет'})`,
        cashierName: user?.name || user?.email || 'Менеджер',
        createdAt: serverTimestamp()
      });

      toast.success('Запасы успешно пополнены!');
      pushNotify({
        title: '📦 Поставка товара',
        body: `${product.club}: ${product.name} +${qty} шт`,
        club: product.club,
        excludeEmail: user?.email || '',
        url: '/merch',
      });
      setShowSupplyModal(false);
      setSelectedProductForSupply(null);
      setSupplyForm({ qty: '10', notes: '', size: '' });
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при пополнении запасов');
    }
  };

  // ─── Resort (Inventory Recount) ────────────────────────────────────────────
  const handleSaveResort = async () => {
    const changed = Object.entries(resortValues).filter(([id, val]) => {
      const prod = products.find(p => p.id === id);
      const canResort = isChef || (managerClub && prod?.club === managerClub) || isLostviewerFull;
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

        // Log in merch_history (audit logs)
        await addDoc(collection(db, 'merch_history'), {
          type: 'resort',
          productId: id,
          productName: prod.name,
          club: prod.club,
          details: `Корректировка остатка товара "${prod.name}"${prod.sku ? ` [Арт: ${prod.sku}]` : ''}: факт ${actual} шт (было ${prod.stock} шт, разница: ${diff > 0 ? '+' : ''}${diff} шт)`,
          cashierName: user?.name || user?.email || 'Менеджер',
          createdAt: serverTimestamp()
        });
      }));
      toast.success(`Пересорт сохранён: ${changed.length} позиций обновлено`);
      pushNotify({
        title: '🔁 Пересорт склада',
        body: `Обновлено позиций: ${changed.length}`,
        club: selectedClub !== 'ALL' ? selectedClub : null,
        excludeEmail: user?.email || '',
        url: '/merch',
      });
      setResortValues({});
      setActiveTab('inventory');
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при сохранении пересорта');
    } finally {
      setSavingResort(false);
    }
  };
  // ─── Excel Export: полный отчёт склада одним файлом (все листы) ─────────────
  // Учитывает фильтры клуба и периода дат; поиск и активная вкладка не влияют.
  const handleExportCSV = async () => {
    try {
      const XLSX = await import('xlsx');

      const clubOk = (c) => selectedClub === 'ALL' || c === selectedClub;
      const dateOf = (x) => x?.createdAt?.seconds ? new Date(x.createdAt.seconds * 1000)
        : x?.createdAtISO ? new Date(x.createdAtISO)
        : x?.createdAt ? new Date(x.createdAt) : null;
      const inDates = (d) => {
        if (!d) return true;
        if (startDate && d < new Date(startDate + 'T00:00:00')) return false;
        if (endDate && d > new Date(endDate + 'T23:59:59')) return false;
        return true;
      };
      const fmt = (d) => d ? d.toLocaleString('ru-RU') : '';

      // 1. Склад
      const invRows = products.filter(p => clubOk(p.club)).map(p => ({
        'Артикул': p.sku || '', 'Название': p.name, 'Категория': p.category, 'Клуб': p.club,
        ...(canSeeCost ? { 'Себестоимость': p.costPrice } : {}),
        'Цена продажи': p.salePrice, 'Остаток': p.stock, 'Мин. остаток': p.minStock,
      }));

      // 2. Продажи (оплаченные, без возвратов и бесплатных выдач)
      const saleRows = sales
        .filter(s => !s.returned && !s.isFree && clubOk(s.club) && inDates(dateOf(s)))
        .map(s => ({
          'Дата': fmt(dateOf(s)), 'Клуб': s.club, 'Товар': s.productName, 'Размер': s.size || '', 'Артикул': s.sku || '',
          'Категория': s.category, 'Количество': s.qty,
          ...(canSeeCost ? { 'Себестоимость': s.costPrice } : {}),
          'Цена продажи': s.salePrice, 'Сумма чека': s.totalSum,
          ...(canSeeCost ? { 'Прибыль': s.netProfit } : {}),
          'Оплата': s.paymentMethod, 'Покупатель': s.buyerType || '', 'Клиент': s.clientName || '',
          'Продавец': s.salespersonName || '', 'Провел': s.cashierName, 'Примечание': s.notes || '',
        }));

      // 3. Возвраты
      const returnRows = sales
        .filter(s => s.returned && clubOk(s.club))
        .filter(s => inDates(s.returnedAtISO ? new Date(s.returnedAtISO) : dateOf(s)))
        .map(s => ({
          'Дата продажи': fmt(dateOf(s)), 'Дата возврата': s.returnedAtISO ? fmt(new Date(s.returnedAtISO)) : '',
          'Клуб': s.club, 'Товар': s.productName, 'Артикул': s.sku || '', 'Категория': s.category,
          'Количество': s.qty, 'Сумма чека': s.totalSum, 'Оплата': s.paymentMethod,
          'Клиент': s.clientName || '', 'Провел продажу': s.cashierName, 'Оформил возврат': s.returnedBy || '',
        }));

      // 4. Маркетинг (бесплатные выдачи: бартер, победители, подарки и т.д.)
      const freeRows = sales
        .filter(s => s.isFree && !s.returned && clubOk(s.club) && inDates(dateOf(s)))
        .map(s => ({
          'Дата': fmt(dateOf(s)), 'Клуб': s.club, 'Товар': s.productName, 'Артикул': s.sku || '',
          'Категория': s.category, 'Количество': s.qty,
          ...(canSeeCost ? { 'Себестоимость': s.costPrice } : {}),
          'Причина выдачи': s.paymentMethod || s.freeReason || '', 'Получатель': s.clientName || '',
          'Провел': s.cashierName, 'Примечание': s.notes || '',
        }));

      // 5. Перемещения между студиями
      const transferStatus = { pending: 'Ожидает приёмки', accepted: 'Принято', rejected: 'Отклонено' };
      const transferRows = merchTransfers
        .filter(t => selectedClub === 'ALL' || t.fromClub === selectedClub || t.toClub === selectedClub)
        .filter(t => inDates(t.createdAtISO ? new Date(t.createdAtISO) : null))
        .map(t => ({
          'Дата': t.createdAtISO ? fmt(new Date(t.createdAtISO)) : '', 'Откуда': t.fromClub, 'Куда': t.toClub,
          'Товар': t.productName, 'Артикул': t.sku || '', 'Категория': t.category, 'Количество': t.qty,
          'Статус': transferStatus[t.status] || t.status, 'Создал': t.createdByName || '',
        }));

      // 6. Журнал операций
      const logType = { delete: 'Удаление', resort: 'Пересорт', supply: 'Поставка', transfer_out: 'Перемещение (отправка)', transfer_in: 'Перемещение (приёмка)' };
      const logRows = historyLogs
        .filter(l => clubOk(l.club) && inDates(dateOf(l)))
        .map(l => ({
          'Дата': fmt(dateOf(l)), 'Клуб': l.club, 'Операция': logType[l.type] || 'Добавление',
          'Детали': l.details, 'Исполнитель': l.cashierName,
        }));

      const wb = XLSX.utils.book_new();
      const addSheet = (name, rows) => {
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Нет данных': '' }]);
        XLSX.utils.book_append_sheet(wb, ws, name);
      };
      addSheet('Склад', invRows);
      addSheet('Продажи', saleRows);
      addSheet('Возвраты', returnRows);
      addSheet('Маркетинг', freeRows);
      addSheet('Перемещения', transferRows);
      addSheet('Журнал', logRows);

      XLSX.writeFile(wb, `merch_report_${selectedClub}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Полный отчёт выгружен: склад, продажи, возвраты, маркетинг, перемещения, журнал');
    } catch (e) {
      console.error(e);
      toast.error('Не удалось сформировать отчёт');
    }
  };

  const uniqueSkus = useMemo(() => {
    const skus = new Set();
    products.forEach(p => {
      if (p.sku) skus.add(p.sku);
    });
    return Array.from(skus).sort();
  }, [products]);

  const MONTH_NAMES = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  const availableMonths = useMemo(() => {
    const now = new Date();
    const months = [];
    // Show up to 12 months back
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    return months;
  }, []);

  const selectedMonth = useMemo(() => {
    if (!startDate || !endDate) return null;
    const [sy, sm] = startDate.split('-').map(Number);
    const [ey, em] = endDate.split('-').map(Number);
    if (sy === ey && sm === em) return `${sy}-${sm}`;
    return null;
  }, [startDate, endDate]);

  const setMonth = (year, month) => {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
    const key = `${year}-${month}`;
    if (selectedMonth === key) { setStartDate(''); setEndDate(''); }
    else { setStartDate(firstDay); setEndDate(lastDay); }
  };

  // ─── Filtered Data ─────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const list = products.filter(p => {
      const matchClub = selectedClub === 'ALL' || p.club === selectedClub;
      const matchSku = selectedSku === 'ALL' || p.sku === selectedSku;
      // Поиск по ключевому слову: название, категория, артикул, клуб
      const q = searchTerm.toLowerCase();
      const matchSearch = !q || [p.name, p.category, p.sku, p.club]
        .some(v => (v || '').toLowerCase().includes(q));
      return matchClub && matchSku && matchSearch;
    });

    if (sortBy === 'alphabet') {
      return [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'date') {
      return [...list].sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA; // Newer first
      });
    }

    return list;
  }, [products, selectedClub, selectedSku, searchTerm, sortBy]);

  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      if (s.returned) return false; // возвраты — в отдельной вкладке «Возвраты»
      const matchClub = selectedClub === 'ALL' || s.club === selectedClub;
      const matchSku = selectedSku === 'ALL' || s.sku === selectedSku;
      // Поиск по ключевому слову: товар, кассир, артикул, клиент, продавец,
      // примечание, способ оплаты/причина выдачи (напр. «маркетинг»), категория, клуб
      const q = searchTerm.toLowerCase();
      const matchSearch = !q || [
        s.productName, s.cashierName, s.sku, s.clientName, s.salespersonName,
        s.notes, s.paymentMethod, s.freeReason, s.category, s.club, s.buyerType,
      ].some(v => (v || '').toLowerCase().includes(q));
      
      let matchDate = true;
      if (s.createdAt) {
        const dateObj = s.createdAt.seconds ? new Date(s.createdAt.seconds * 1000) : new Date(s.createdAt);
        if (startDate) {
          const start = new Date(startDate + 'T00:00:00');
          if (dateObj < start) matchDate = false;
        }
        if (endDate) {
          const end = new Date(endDate + 'T23:59:59');
          if (dateObj > end) matchDate = false;
        }
      }
      return matchClub && matchSku && matchSearch && matchDate;
    });
  }, [sales, selectedClub, selectedSku, searchTerm, startDate, endDate]);

  // ── Вкладка «Маркетинг»: все бесплатные выдачи (бартер/победители/маркетинг/подарки) ──
  const [freeReasonFilter, setFreeReasonFilter] = useState('ALL');
  const filteredFreeSales = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return sales.filter(s => {
      if (!s.isFree) return false;
      if (selectedClub !== 'ALL' && s.club !== selectedClub) return false;
      if (freeReasonFilter !== 'ALL' && (s.paymentMethod || '') !== freeReasonFilter) return false;
      if (q && ![s.productName, s.clientName, s.notes, s.paymentMethod, s.cashierName, s.club, s.sku]
        .some(v => (v || '').toLowerCase().includes(q))) return false;
      if (s.createdAt) {
        const d = s.createdAt.seconds ? new Date(s.createdAt.seconds * 1000) : new Date(s.createdAt);
        if (startDate && d < new Date(startDate + 'T00:00:00')) return false;
        if (endDate && d > new Date(endDate + 'T23:59:59')) return false;
      }
      return true;
    });
  }, [sales, selectedClub, freeReasonFilter, searchTerm, startDate, endDate]);

  // ── Вкладка «Возвраты»: помеченные возвращёнными чеки ──
  const filteredReturns = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return sales.filter(s => {
      if (!s.returned) return false;
      if (selectedClub !== 'ALL' && s.club !== selectedClub) return false;
      if (q && ![s.productName, s.cashierName, s.sku, s.clientName, s.returnedBy, s.club]
        .some(v => (v || '').toLowerCase().includes(q))) return false;
      const iso = s.returnedAtISO || (s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000).toISOString() : null);
      if (iso) {
        const d = new Date(iso);
        if (startDate && d < new Date(startDate + 'T00:00:00')) return false;
        if (endDate && d > new Date(endDate + 'T23:59:59')) return false;
      }
      return true;
    }).sort((a, b) => (b.returnedAtISO || '').localeCompare(a.returnedAtISO || ''));
  }, [sales, selectedClub, searchTerm, startDate, endDate]);

  const filteredLogs = useMemo(() => {
    return historyLogs.filter(log => {
      const matchClub = selectedClub === 'ALL' || log.club === selectedClub;
      const matchSku = selectedSku === 'ALL' || (log.details && log.details.includes(`[Арт: ${selectedSku}]`));
      const q = searchTerm.toLowerCase();
      const matchSearch = !q || [log.productName, log.details, log.cashierName, log.club, log.type]
        .some(v => (v || '').toLowerCase().includes(q));
      
      let matchDate = true;
      if (log.createdAt) {
        const dateObj = log.createdAt.seconds ? new Date(log.createdAt.seconds * 1000) : new Date(log.createdAt);
        if (startDate) {
          const start = new Date(startDate + 'T00:00:00');
          if (dateObj < start) matchDate = false;
        }
        if (endDate) {
          const end = new Date(endDate + 'T23:59:59');
          if (dateObj > end) matchDate = false;
        }
      }
      return matchClub && matchSku && matchSearch && matchDate;
    });
  }, [historyLogs, selectedClub, selectedSku, searchTerm, startDate, endDate]);

  // ─── Analytics Computations ────────────────────────────────────────────────
  const stats = useMemo(() => {
    let totalStockItems = 0;
    let totalInventoryCostValue = 0;
    let totalSalesRevenue = 0;
    let totalNetProfit = 0;

    let todaySalesRevenue = 0;
    let todayNetProfit = 0;
    let monthSalesRevenue = 0;
    let monthNetProfit = 0;
    let periodSalesRevenue = 0;
    let periodNetProfit = 0;

    let lowStockCount = 0;

    const activeProducts = products.filter(p => {
      const matchClub = selectedClub === 'ALL' || p.club === selectedClub;
      const matchSku = selectedSku === 'ALL' || p.sku === selectedSku;
      return matchClub && matchSku;
    });
    const activeSales = sales.filter(s => {
      const matchClub = selectedClub === 'ALL' || s.club === selectedClub;
      const matchSku = selectedSku === 'ALL' || s.sku === selectedSku;
      return matchClub && matchSku;
    });

    activeProducts.forEach(p => {
      totalStockItems += (p.stock || 0);
      totalInventoryCostValue += (p.stock || 0) * (p.costPrice || 0);
      if ((p.stock || 0) <= (p.minStock || 0)) {
        lowStockCount++;
      }
    });

    const now = new Date();
    const filterStart = startDate ? new Date(startDate + 'T00:00:00') : null;
    const filterEnd = endDate ? new Date(endDate + 'T23:59:59') : null;

    activeSales.forEach(s => {
      if (s.qty > 0 && s.paymentMethod !== 'Пересорт' && !s.returned) {
        const saleSum = s.totalSum || 0;
        const saleProfit = s.netProfit || 0;

        totalSalesRevenue += saleSum;
        totalNetProfit += saleProfit;

        // Parse date
        const dateObj = s.createdAt?.seconds 
          ? new Date(s.createdAt.seconds * 1000) 
          : (s.createdAt ? new Date(s.createdAt) : new Date());

        // 1. Check if today
        const isToday = dateObj.getFullYear() === now.getFullYear() &&
                        dateObj.getMonth() === now.getMonth() &&
                        dateObj.getDate() === now.getDate();
        if (isToday) {
          todaySalesRevenue += saleSum;
          todayNetProfit += saleProfit;
        }

        // 2. Check if this month
        const isThisMonth = dateObj.getFullYear() === now.getFullYear() &&
                            dateObj.getMonth() === now.getMonth();
        if (isThisMonth) {
          monthSalesRevenue += saleSum;
          monthNetProfit += saleProfit;
        }

        // 3. Check if in selected period
        let inPeriod = true;
        if (filterStart && dateObj < filterStart) inPeriod = false;
        if (filterEnd && dateObj > filterEnd) inPeriod = false;
        if (inPeriod) {
          periodSalesRevenue += saleSum;
          periodNetProfit += saleProfit;
        }
      }
    });

    return {
      totalStockItems,
      totalInventoryCostValue,
      totalSalesRevenue,
      totalNetProfit,
      todaySalesRevenue,
      todayNetProfit,
      monthSalesRevenue,
      monthNetProfit,
      periodSalesRevenue,
      periodNetProfit,
      lowStockCount
    };
  }, [products, sales, selectedClub, selectedSku, startDate, endDate]);

  return (
    <div className="space-y-6 animate-fade">
      
      {/* Header Panel */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[var(--bg-card)] p-5 rounded-3xl border border-[var(--border)] shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-[var(--accent-purple)] border border-purple-500/10">
            <Package size={24} />
          </div>
          <div>
            <h1 className={`${isMobile ? 'text-lg' : 'text-xl'} font-black text-[var(--text-primary)] italic uppercase tracking-tight`}>
              Учет Мерча и Продаж
            </h1>
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">
              Инвентаризация и управление складом по клубам
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Club Filter — на мобильном лента без переноса со скроллом внутри блока */}
          <div className={`flex bg-[var(--bg-primary)] p-1 rounded-xl border border-[var(--border)] ${isMobile ? 'w-full overflow-x-auto' : ''}`} style={isMobile ? { WebkitOverflowScrolling: 'touch' } : undefined}>
            {canSelectAllClubs ? (
              <>
                <button
                  onClick={() => setSelectedClub('ALL')}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedClub === 'ALL' ? 'bg-[var(--accent-purple)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  Все клубы
                </button>
                {CLUBS.map(club => (
                  <button
                    key={club}
                    onClick={() => setSelectedClub(club)}
                    className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedClub === club ? 'bg-[var(--accent-purple)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
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

          {/* SKU / Article Filter */}
          {uniqueSkus.length > 0 && (
            <div className="flex bg-[var(--bg-primary)] p-1 rounded-xl border border-[var(--border)]">
              <select
                value={selectedSku}
                onChange={e => setSelectedSku(e.target.value)}
                className="bg-transparent border-none outline-none text-xs font-bold text-[var(--text-secondary)] px-2 py-1.5 cursor-pointer focus:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-hover)] transition-all"
              >
                <option value="ALL">Все артикулы</option>
                {uniqueSkus.map(sku => (
                  <option key={sku} value={sku}>{sku}</option>
                ))}
              </select>
            </div>
          )}

          {/* Add Product Button */}
          {(isChef || !!managerClub || isLostviewerFull) && !isMarketing && (
            <button
              onClick={() => {
                setEditingProduct(null);
                setProductForm({ name: '', sku: '', club: selectedClub === 'ALL' ? '4YOU' : selectedClub, category: 'Худи', costPrice: '', salePrice: '', employeePrice: '', stock: '', minStock: '5' });
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
      <div className="merch-stats grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        
        {isMarketing ? (
          <>
            {/* Total items count for marketing */}
            <div className="bg-[var(--bg-card)] p-5 rounded-3xl border border-[var(--border)] shadow-md flex items-center justify-between col-span-2">
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

            {/* Low stock alerts for marketing */}
            <div className={`bg-[var(--bg-card)] p-5 rounded-3xl border shadow-md flex items-center justify-between transition-all col-span-2 ${stats.lowStockCount > 0 ? 'border-orange-500/30 bg-orange-500/5' : 'border-[var(--border)]'}`}>
              <div>
                <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Мало на складе</span>
                <span className={`text-xl md:text-2xl font-black tracking-tight block mt-1 ${stats.lowStockCount > 0 ? 'text-orange-400' : 'text-[var(--text-primary)]'}`}>
                  {stats.lowStockCount} позиций
                </span>
                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block mt-1">
                  В наличии в клубах
                </span>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.lowStockCount > 0 ? 'bg-orange-500/10 text-orange-400' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                <AlertTriangle size={20} />
              </div>
            </div>
          </>
        ) : canSeeCost ? (
          <>
            {/* Total Cost Value (Chef + Komdir) */}
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
            <div className="bg-[var(--bg-card)] p-5 rounded-3xl border border-[var(--border)] shadow-md flex flex-col justify-between">
              <div className="flex items-center justify-between w-full">
                <div>
                  <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Выручка продаж</span>
                  <span className="text-xl md:text-2xl font-black text-emerald-400 tracking-tight block mt-1">
                    {stats.totalSalesRevenue.toLocaleString()} ₸
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <ArrowUpRight size={20} />
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-1.5 w-full">
                <div>
                  <span className="text-[8px] font-black uppercase text-[var(--text-muted)] block">День</span>
                  <span className="text-[11px] font-black text-[var(--text-primary)] block mt-0.5">{stats.todaySalesRevenue.toLocaleString()} ₸</span>
                </div>
                <div className="border-l border-[var(--border)] pl-1.5">
                  <span className="text-[8px] font-black uppercase text-[var(--text-muted)] block">Месяц</span>
                  <span className="text-[11px] font-black text-[var(--text-primary)] block mt-0.5">{stats.monthSalesRevenue.toLocaleString()} ₸</span>
                </div>
                <div className="border-l border-[var(--border)] pl-1.5 flex flex-col justify-between">
                  <div>
                    <span className="text-[8px] font-black uppercase text-[var(--text-muted)] block">Период</span>
                    <span className="text-[11px] font-black text-purple-400 block mt-0.5">{stats.periodSalesRevenue.toLocaleString()} ₸</span>
                  </div>
                  <div className="flex flex-col gap-0.5 mt-1">
                    <input 
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      onClick={e => { try { e.target.showPicker(); } catch(err) {} }}
                      className="bg-[var(--bg-primary)] border border-[var(--border)] rounded px-0.5 py-px text-[7px] font-black text-[var(--text-primary)] outline-none cursor-pointer w-full hover:border-[var(--accent-purple)] transition-colors"
                      title="Начало периода"
                    />
                    <input 
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      onClick={e => { try { e.target.showPicker(); } catch(err) {} }}
                      className="bg-[var(--bg-primary)] border border-[var(--border)] rounded px-0.5 py-px text-[7px] font-black text-[var(--text-primary)] outline-none cursor-pointer w-full hover:border-[var(--accent-purple)] transition-colors"
                      title="Конец периода"
                    />
                    {(startDate || endDate) && (
                      <button 
                        onClick={() => { setStartDate(''); setEndDate(''); }}
                        className="text-[var(--text-muted)] hover:text-red-400 transition-colors text-[7px] font-black text-center mt-0.5 block w-full"
                        title="Сбросить даты"
                      >
                        Сбросить
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Net Profit (Chef only) */}
            <div className="bg-[var(--bg-card)] p-5 rounded-3xl border border-[var(--border)] shadow-md flex flex-col justify-between">
              <div className="flex items-center justify-between w-full">
                <div>
                  <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Чистая прибыль</span>
                  <span className="text-xl md:text-2xl font-black text-purple-400 tracking-tight block mt-1">
                    {stats.totalNetProfit.toLocaleString()} ₸
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0">
                  <DollarSign size={20} />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-1 w-full">
                <div>
                  <span className="text-[8px] font-black uppercase text-[var(--text-muted)] block">День</span>
                  <span className="text-[11px] font-black text-[var(--text-primary)] block mt-0.5">{stats.todayNetProfit.toLocaleString()} ₸</span>
                </div>
                <div className="border-l border-[var(--border)] pl-1.5">
                  <span className="text-[8px] font-black uppercase text-[var(--text-muted)] block">Месяц</span>
                  <span className="text-[11px] font-black text-[var(--text-primary)] block mt-0.5">{stats.monthNetProfit.toLocaleString()} ₸</span>
                </div>
                <div className="border-l border-[var(--border)] pl-1.5">
                  <span className="text-[8px] font-black uppercase text-[var(--text-muted)] block">{(startDate || endDate) ? 'Период' : 'Все'}</span>
                  <span className="text-[11px] font-black text-purple-400 block mt-0.5">{stats.periodNetProfit.toLocaleString()} ₸</span>
                </div>
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
            <div className="bg-[var(--bg-card)] p-5 rounded-3xl border border-[var(--border)] shadow-md flex flex-col justify-between col-span-2 md:col-span-2">
              <div className="flex items-center justify-between w-full">
                <div>
                  <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Выручка клуба ({selectedClub})</span>
                  <span className="text-xl md:text-2xl font-black text-emerald-400 tracking-tight block mt-1">
                    {stats.totalSalesRevenue.toLocaleString()} ₸
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <ArrowUpRight size={20} />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-1.5 w-full">
                <div>
                  <span className="text-[8px] font-black uppercase text-[var(--text-muted)] block">Выручка за день</span>
                  <span className="text-xs md:text-sm font-black text-[var(--text-primary)] block mt-0.5">{stats.todaySalesRevenue.toLocaleString()} ₸</span>
                </div>
                <div className="border-l border-[var(--border)] pl-3">
                  <span className="text-[8px] font-black uppercase text-[var(--text-muted)] block">Выручка за месяц</span>
                  <span className="text-xs md:text-sm font-black text-[var(--text-primary)] block mt-0.5">{stats.monthSalesRevenue.toLocaleString()} ₸</span>
                </div>
                <div className="border-l border-[var(--border)] pl-3 flex flex-col justify-between">
                  <div>
                    <span className="text-[8px] font-black uppercase text-[var(--text-muted)] block">Выручка за период</span>
                    <span className="text-xs md:text-sm font-black text-purple-400 block mt-0.5">{stats.periodSalesRevenue.toLocaleString()} ₸</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <input 
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      onClick={e => { try { e.target.showPicker(); } catch(err) {} }}
                      className="bg-[var(--bg-primary)] border border-[var(--border)] rounded px-1 py-0.5 text-[8px] font-black text-[var(--text-primary)] outline-none cursor-pointer w-[65px] hover:border-[var(--accent-purple)] transition-colors"
                      title="Начало периода"
                    />
                    <span className="text-[var(--text-muted)] text-[8px] font-bold">—</span>
                    <input 
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      onClick={e => { try { e.target.showPicker(); } catch(err) {} }}
                      className="bg-[var(--bg-primary)] border border-[var(--border)] rounded px-1 py-0.5 text-[8px] font-black text-[var(--text-primary)] outline-none cursor-pointer w-[65px] hover:border-[var(--accent-purple)] transition-colors"
                      title="Конец периода"
                    />
                    {(startDate || endDate) && (
                      <button 
                        onClick={() => { setStartDate(''); setEndDate(''); }}
                        className="text-[var(--text-muted)] hover:text-red-400 p-0.5 transition-colors text-[8px] font-black"
                        title="Сбросить даты"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
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

      {/* Входящие поставки (перемещения на приёмку) */}
      {incomingPending.length > 0 && (
        <div className="flex flex-col gap-3">
          {incomingPending.map(t => {
            const canAcc = canAcceptTransfer(t);
            const misOpen = mismatchOpen === t.id;
            return (
              <div key={t.id} className="rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-500/10 to-blue-500/5 p-4">
                <div className="flex items-start gap-3 flex-wrap">
                  {t.imageUrl ? (
                    <img src={t.imageUrl} alt={t.productName} className="w-12 h-12 rounded-xl object-cover border border-[var(--border)] flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                      <Package size={20} className="text-purple-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/25">📦 Поставка</span>
                      <span className="text-[11px] font-bold text-[var(--text-muted)]">{t.fromClub} → <b className="text-[var(--text-primary)]">{t.toClub}</b></span>
                    </div>
                    <div className="text-sm font-extrabold text-[var(--text-primary)] mt-1">
                      {t.qty} шт «{t.productName}»{t.sku ? <span className="text-[var(--text-muted)] font-bold text-xs"> · Арт: {t.sku}</span> : null}
                    </div>
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] mt-0.5">Отправил: {t.createdByName}</div>
                  </div>
                  {canAcc ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {!misOpen ? (
                        <>
                          <button disabled={transferBusy} onClick={() => handleAcceptTransfer(t, t.qty)}
                            className="flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-black uppercase bg-emerald-500 text-white hover:bg-emerald-600 transition-all disabled:opacity-50">
                            <CheckCircle size={14} /> Принять {t.qty}
                          </button>
                          <button disabled={transferBusy} onClick={() => { setMismatchOpen(t.id); setMismatchQty(String(t.qty)); }}
                            className="py-2 px-3 rounded-xl text-xs font-bold uppercase bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border)] hover:text-orange-400 transition-all">
                            Другое кол-во
                          </button>
                          <button disabled={transferBusy} onClick={() => handleRejectTransfer(t)}
                            className="py-2 px-3 rounded-xl text-xs font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all">
                            Отклонить
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-[var(--text-muted)]">Пришло по факту:</span>
                          <input type="number" min="0" value={mismatchQty} onChange={e => setMismatchQty(e.target.value)}
                            className="w-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm font-bold text-[var(--text-primary)] outline-none" autoFocus />
                          <button disabled={transferBusy} onClick={() => handleAcceptTransfer(t, mismatchQty)}
                            className="py-2 px-3 rounded-xl text-xs font-black uppercase bg-emerald-500 text-white hover:bg-emerald-600 transition-all disabled:opacity-50">
                            Принять
                          </button>
                          <button disabled={transferBusy} onClick={() => { setMismatchOpen(null); setMismatchQty(''); }}
                            className="py-2 px-2 rounded-xl text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 self-center">Ждёт приёмки</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs, Search & Export Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Navigation Tabs — на мобильном горизонтальная лента чипов без переноса */}
        <div className={`flex gap-1.5 p-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl ${isMobile ? 'w-full overflow-x-auto' : 'w-fit'}`} style={isMobile ? { WebkitOverflowScrolling: 'touch' } : undefined}>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'inventory' ? 'bg-[var(--accent-purple)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
          >
            <Store size={14} /> Склад
          </button>
          <button
            onClick={() => setActiveTab('marketing')}
            className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'marketing' ? 'bg-pink-500 text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
          >
            🎁 Маркетинг
          </button>
          {(!isMarketing || marketingExtra) && (
            <>
              <button
                onClick={() => setActiveTab('sales')}
                className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'sales' ? 'bg-[var(--accent-purple)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
              >
                <History size={14} /> История продаж
              </button>
              {!isMarketing && (
              <button
                onClick={() => setActiveTab('returns')}
                className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'returns' ? 'bg-amber-500 text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
              >
                <RotateCcw size={14} /> Возвраты
              </button>
              )}
              {(isChef || !!managerClub || isLostviewerFull) && (
                <button
                  onClick={() => { setActiveTab('resort'); setResortValues({}); }}
                  className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'resort' ? 'bg-orange-500 text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                >
                  <ClipboardList size={14} /> Пересорт
                </button>
              )}
              <button
                onClick={() => setActiveTab('transfers')}
                className={`relative shrink-0 whitespace-nowrap px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'transfers' ? 'bg-[var(--accent-purple)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
              >
                <ArrowUpRight size={14} /> Перемещения
                {incomingPending.length > 0 && (
                  <span className="ml-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black">{incomingPending.length}</span>
                )}
              </button>
              {!isMarketing && (
              <button
                onClick={() => setActiveTab('logs')}
                className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'logs' ? 'bg-[var(--accent-purple)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
              >
                <ClipboardList size={14} /> Логи операций
              </button>
              )}
              {/* Sales totals tab */}
              {selectedClub !== 'ALL' && !isMarketing && (
                <button
                  onClick={() => setActiveTab('nurly-sales')}
                  className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'nurly-sales' ? 'bg-purple-600 text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                >
                  <TrendingUp size={14} /> Итого продаж
                </button>
              )}
            </>
          )}
        </div>

        {/* Search Input & CSV Export — на мобильном компактная колонка */}
        <div className={isMobile ? 'flex flex-wrap items-center gap-2 w-full' : 'flex flex-wrap items-center gap-3 w-full sm:w-auto'}>
          {/* Date Range Selector */}
          <div className={`flex items-center gap-2 bg-[var(--bg-card)] px-3 py-2 rounded-2xl border border-[var(--border)] shadow-md h-[42px] ${isMobile ? 'w-full' : ''}`}>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              onClick={e => { try { e.target.showPicker(); } catch(err) {} }}
              className={`bg-transparent border-none outline-none text-xs font-bold text-[var(--text-primary)] cursor-pointer ${isMobile ? 'flex-1 min-w-0' : 'w-[115px]'}`}
              title="Начало периода"
            />
            <span className="text-[var(--text-muted)] text-xs">—</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              onClick={e => { try { e.target.showPicker(); } catch(err) {} }}
              className={`bg-transparent border-none outline-none text-xs font-bold text-[var(--text-primary)] cursor-pointer ${isMobile ? 'flex-1 min-w-0' : 'w-[115px]'}`}
              title="Конец периода"
            />
            {(startDate || endDate) && (
              <button 
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-[var(--text-muted)] hover:text-red-400 p-0.5 transition-colors"
                title="Сбросить даты"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {activeTab === 'inventory' && (
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className={`bg-[var(--bg-card)] px-3 py-2 rounded-2xl border border-[var(--border)] text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] h-[42px] cursor-pointer ${isMobile ? 'w-full' : ''}`}
            >
              <option value="default">Сортировка: По умолчанию</option>
              <option value="date">Сортировка: По дате (новые)</option>
              <option value="alphabet">Сортировка: По алфавиту</option>
            </select>
          )}

          <div className="relative flex-1 sm:w-64">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input 
              type="text"
              placeholder={activeTab === 'inventory' ? 'Поиск товара...' : 'Поиск чеков...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent-purple)] transition-all h-[42px]"
            />
          </div>

          <button
            onClick={handleExportCSV}
            title="Выгрузить полный Excel-отчёт: склад, продажи, возвраты, маркетинг, перемещения, журнал"
            className="p-2.5 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-2xl border border-[var(--border)] flex items-center justify-center transition-all shadow-md h-[42px] w-[42px] shrink-0"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Content Body */}
      {activeTab === 'returns' ? (
        /* --- RETURNS TAB --- */
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-black uppercase tracking-wider">
            <span className="text-[var(--text-muted)]">Возвратов: <b className="text-[var(--text-primary)]">{filteredReturns.length}</b></span>
            <span className="text-[var(--text-muted)]">Товара: <b className="text-[var(--text-primary)]">{filteredReturns.reduce((s, x) => s + (x.qty || 0), 0)} шт</b></span>
            <span className="text-[var(--text-muted)]">На сумму: <b className="text-amber-500">{filteredReturns.reduce((s, x) => s + (x.totalSum || 0), 0).toLocaleString('ru')} ₸</b></span>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
            {filteredReturns.length === 0 ? (
              <div className="text-center py-16 text-[var(--text-muted)] text-sm font-semibold">Возвратов нет</div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {filteredReturns.map(s => {
                  const sold = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : null;
                  const ret = s.returnedAtISO ? new Date(s.returnedAtISO) : null;
                  const fmt = (d) => d ? d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                        <RotateCcw size={16} className="text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <div className="text-sm font-extrabold text-[var(--text-primary)]">{s.productName}{s.size ? ` (${s.size})` : ''} × {s.qty}</div>
                        <div className="text-[11px] font-semibold text-[var(--text-muted)] mt-0.5">
                          {s.club} · продана {fmt(sold)}{s.cashierName ? ` (${s.cashierName})` : ''} · возврат {fmt(ret)}{s.returnedBy ? ` (${s.returnedBy})` : ''}
                        </div>
                        {s.clientName && s.clientName !== 'Гость' && (
                          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Покупатель: {s.clientName}</div>
                        )}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border)]">{s.paymentMethod || '—'}</span>
                      <span className="text-sm font-black text-amber-500 flex-shrink-0">−{(s.totalSum || 0).toLocaleString('ru')} ₸</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'marketing' ? (
        /* --- MARKETING (бесплатные выдачи) TAB --- */
        <div className="flex flex-col gap-4">
          {/* Фильтр по причине + сводка */}
          <div className="flex flex-wrap items-center gap-2">
            {['ALL', 'Маркетинг', 'Бартер', 'Победитель', 'Подарок', 'Другое'].map(r => (
              <button key={r} onClick={() => setFreeReasonFilter(r)}
                className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all ${freeReasonFilter === r ? 'bg-pink-500 text-white border-pink-500' : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)]'}`}>
                {r === 'ALL' ? 'Все причины' : r}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-4 text-[11px] font-black uppercase tracking-wider">
              <span className="text-[var(--text-muted)]">Выдано: <b className="text-[var(--text-primary)]">{filteredFreeSales.reduce((s, x) => s + (x.qty || 0), 0)} шт</b></span>
              {canSeeCost && (
                <span className="text-[var(--text-muted)]">Себестоимость: <b className="text-orange-400">{filteredFreeSales.reduce((s, x) => s + (x.qty || 0) * (x.costPrice || 0), 0).toLocaleString('ru')} ₸</b></span>
              )}
            </div>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
            {filteredFreeSales.length === 0 ? (
              <div className="text-center py-16 text-[var(--text-muted)] text-sm font-semibold">Бесплатных выдач не найдено</div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {filteredFreeSales.map(s => {
                  const d = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : (s.createdAt ? new Date(s.createdAt) : null);
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                      <div className="w-10 h-10 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center flex-shrink-0 text-base">🎁</div>
                      <div className="flex-1 min-w-[180px]">
                        <div className="text-sm font-extrabold text-[var(--text-primary)]">{s.productName}{s.size ? ` (${s.size})` : ''} × {s.qty}</div>
                        <div className="text-[11px] font-semibold text-[var(--text-muted)] mt-0.5">
                          {s.club} · {s.clientName || '—'}{s.notes ? ` · ${s.notes}` : ''} · выдал(а) {s.cashierName}
                          {d ? ` · ${d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20">{s.paymentMethod || 'Бесплатно'}</span>
                      {canSeeCost && (
                        <span className="text-xs font-black text-orange-400 flex-shrink-0">−{((s.qty || 0) * (s.costPrice || 0)).toLocaleString('ru')} ₸</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'transfers' ? (
        /* --- TRANSFERS TAB --- */
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
          {myTransfersList.length === 0 ? (
            <div className="text-center py-16 text-[var(--text-muted)] text-sm font-semibold">Перемещений пока нет</div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {myTransfersList.map(t => {
                const st = t.status;
                const stColor = st === 'accepted' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : st === 'rejected' ? 'text-red-400 bg-red-500/10 border-red-500/20'
                  : 'text-orange-400 bg-orange-500/10 border-orange-500/20';
                const stLabel = st === 'accepted' ? (t.receivedQty !== undefined && t.receivedQty !== t.qty ? `Принято ${t.receivedQty}/${t.qty}` : 'Принято')
                  : st === 'rejected' ? 'Отклонено' : 'Ожидает приёмки';
                return (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                    {t.imageUrl ? (
                      <img src={t.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-[var(--border)] flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--border)] flex items-center justify-center flex-shrink-0"><Package size={16} className="text-[var(--text-muted)] opacity-50" /></div>
                    )}
                    <div className="flex-1 min-w-[160px]">
                      <div className="text-sm font-extrabold text-[var(--text-primary)]">{t.qty} шт «{t.productName}»</div>
                      <div className="text-[11px] font-semibold text-[var(--text-muted)] mt-0.5">
                        {t.fromClub} → <b className="text-[var(--text-secondary)]">{t.toClub}</b> · {t.createdByName}
                        {t.createdAtISO ? ` · ${new Date(t.createdAtISO).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                      </div>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${stColor}`}>{stLabel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === 'nurly-sales' ? (
        /* --- SALES TOTALS TAB --- */
        (() => {
          const activeClubForSales = selectedClub;
          const _now = new Date();
          const currentMonthKey = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
          const nurlySales = sales.filter(s => {
            if (s.club !== activeClubForSales || (s.qty || 0) <= 0 || s.paymentMethod === 'Пересорт' || s.returned) return false;
            if (s.createdAt?.seconds) {
              const d = new Date(s.createdAt.seconds * 1000);
              const saleMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              // When date range is set, use it instead of defaulting to current month
              if (!startDate && !endDate && saleMonth !== currentMonthKey) return false;
            }
            return true;
          });
          // Filter by date range if set
          const filtered = nurlySales.filter(s => {
            if (!s.createdAt?.seconds) return true;
            const d = new Date(s.createdAt.seconds * 1000);
            const dateStr = d.toISOString().slice(0, 10);
            if (startDate && dateStr < startDate) return false;
            if (endDate && dateStr > endDate) return false;
            return true;
          });
          // Checkbox (salespersonName) always wins over schedule.
          // For NURLY ORDA — single name only. For other clubs — split comma-separated names.
          // Schedule is only used when no salesperson was selected at all.
          const byPerson = {};
          filtered.forEach(s => {
            let names = [];
            if (s.salespersonName) {
              names = s.salespersonName.split(',').map(n => n.trim()).filter(Boolean);
            } else if (activeClubForSales !== 'NURLY ORDA' && autoDistributeBySchedule && s.createdAt?.seconds) {
              const saleDate = new Date(s.createdAt.seconds * 1000);
              names = getAdminsWorkingAt(saleDate, s.club);
            }
            if (names.length === 0) names.push('Не указан');
            
            const shareTotal = (s.totalSum || 0) / names.length;
            const shareCount = (s.qty || 0) / names.length;
            
            names.forEach(name => {
              if (!byPerson[name]) byPerson[name] = { sales: [], total: 0, count: 0 };
              byPerson[name].sales.push({ ...s, autoNames: names });
              byPerson[name].total += shareTotal;
              byPerson[name].count += shareCount;
            });
          });
          const grandTotal = filtered.reduce((a, s) => a + (s.totalSum || 0), 0);
          const sortedPersons = Object.entries(byPerson).sort((a, b) => b[1].total - a[1].total);
          return (
            <div className="bg-[var(--bg-card)] rounded-3xl border border-[var(--border)] shadow-xl overflow-hidden">
              {/* Grand total banner */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(125,111,179,0.08), rgba(125,111,179,0.02))' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#7D6FB3', letterSpacing: '0.08em', marginBottom: 4 }}>{activeClubForSales} · Общая сумма продаж</div>
                    <div style={{ fontSize: 32, fontWeight: 950, color: '#7D6FB3' }}>{grandTotal.toLocaleString('ru-RU')} ₸</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{filtered.length} продаж · {Object.keys(byPerson).length} сотрудников</div>
                  </div>
                  {/* Month switcher */}
                  {(() => {
                    const now = new Date();
                    const viewIdx = availableMonths.findIndex(m => selectedMonth === `${m.year}-${m.month}`);
                    const currentIdx = viewIdx >= 0 ? viewIdx : availableMonths.length - 1;
                    const cur = availableMonths[currentIdx];
                    const hasPrev = currentIdx > 0;
                    const hasNext = currentIdx < availableMonths.length - 1;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(125,111,179,0.1)', borderRadius: 12, padding: '6px 10px', border: '1px solid rgba(125,111,179,0.2)' }}>
                        <button
                          onClick={() => hasPrev && setMonth(availableMonths[currentIdx - 1].year, availableMonths[currentIdx - 1].month)}
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: hasPrev ? 'rgba(125,111,179,0.15)' : 'transparent', color: hasPrev ? '#7D6FB3' : 'var(--text-muted)', cursor: hasPrev ? 'pointer' : 'default', fontWeight: 900, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >‹</button>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#7D6FB3', minWidth: 100, textAlign: 'center' }}>{cur?.label}</span>
                        <button
                          onClick={() => hasNext && setMonth(availableMonths[currentIdx + 1].year, availableMonths[currentIdx + 1].month)}
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: hasNext ? 'rgba(125,111,179,0.15)' : 'transparent', color: hasNext ? '#7D6FB3' : 'var(--text-muted)', cursor: hasNext ? 'pointer' : 'default', fontWeight: 900, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >›</button>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Schedule distribution toggle — only for clubs other than NURLY ORDA */}
              {activeClubForSales !== 'NURLY ORDA' && (
                <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={autoDistributeBySchedule}
                      onChange={(e) => setAutoDistributeBySchedule(e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: '#7D6FB3', cursor: 'pointer', borderRadius: 4 }}
                    />
                    <span>Распределять продажи по графику смен (по дате и времени смены)</span>
                  </label>
                </div>
              )}

              {sortedPersons.length === 0 ? (
                <div className="py-20 text-center text-[var(--text-muted)]">
                  <TrendingUp size={48} className="mx-auto opacity-35 mb-4 text-purple-400" />
                  <p className="text-sm font-bold uppercase tracking-wider">Нет данных о продажах</p>
                  <p className="text-xs mt-1">Проведите продажи через страницу «Продажи», чтобы видеть итоги</p>
                </div>
              ) : (
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sortedPersons.map(([name, data], idx) => {
                    const pct = grandTotal > 0 ? Math.round((data.total / grandTotal) * 100) : 0;
                    // Products breakdown for this person
                    const byProduct = {};
                    data.sales.forEach(s => {
                      const pName = s.productName || 'Товар';
                      if (!byProduct[pName]) byProduct[pName] = { qty: 0, total: 0 };
                      byProduct[pName].qty += s.qty || 0;
                      byProduct[pName].total += s.totalSum || 0;
                    });
                    // Check if this person is a service employee — no commission for them
                    const empRecord = clubEmployees.find(e => e.name.trim().toLowerCase() === name.trim().toLowerCase());
                    const nLower = name.trim().toLowerCase();
                    const isServicePerson = empRecord?.isService === true || nLower.includes('сервис') || nLower.includes('техник');

                    const rate = commissionRates[name] || '';
                    const parsedCustom = parseFloat(rate);
                    // Only treat as custom if explicitly set to a positive value; 0 or empty → auto
                    const hasCustomRate = rate !== '' && !isNaN(parsedCustom) && parsedCustom > 0;
                    let awardRaw = 0;
                    if (!isServicePerson) {
                      data.sales.forEach(s => {
                        const numAdmins = s.autoNames?.length || 1;
                        const shareAmount = (s.totalSum || 0) / numAdmins;
                        // NURLY ORDA auto: always 8% of the personal share —
                        // solo → 8% of the sale, pair → 4% of the sale each
                        const saleRate = hasCustomRate ? parsedCustom
                          : activeClubForSales === 'NURLY ORDA' ? 8
                          : (numAdmins === 1 ? 8 : 4);
                        awardRaw += shareAmount * saleRate / 100;
                      });
                    }
                    const award = Math.round(awardRaw);
                    const customRate = hasCustomRate ? parsedCustom : null;
                    return (
                      <div key={name} style={{ background: 'var(--bg-hover)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(125,111,179,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#7D6FB3' }}>
                              {idx + 1}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{data.sales.length} продаж · {data.count} шт</div>
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* Commission rate input — hidden for service employees */}
                            {!isServicePerson && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg-primary)', border: `1px solid ${hasCustomRate ? '#7D6FB3' : 'var(--border)'}`, borderRadius: 10, padding: '4px 8px', height: '36px' }}>
                                  <input
                                    type="number"
                                    placeholder="—"
                                    min="0"
                                    max="100"
                                    value={rate === '0' ? '' : rate}
                                    onChange={async (e) => {
                                      const val = e.target.value;
                                      setCommissionRates(prev => ({ ...prev, [name]: val }));
                                      // Update every month's doc for this employee — otherwise
                                      // other months' values re-populate the cleared rate
                                      const matches = clubEmployees.filter(empObj => empObj.name.trim().toLowerCase() === name.trim().toLowerCase());
                                      try {
                                        const { doc: fsDoc, updateDoc: fsUpdateDoc } = await import('firebase/firestore');
                                        await Promise.all(matches.map(m =>
                                          fsUpdateDoc(fsDoc(db, 'employees', m.id), { commissionRate: val === '' ? null : parseFloat(val) })
                                        ));
                                      } catch (err) {
                                        console.error('Error saving commission rate:', err);
                                      }
                                    }}
                                    style={{ width: 36, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 12, fontWeight: 800, outline: 'none', textAlign: 'center' }}
                                  />
                                  <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)' }}>%</span>
                                </div>
                                {hasCustomRate && (
                                  <button
                                    title="Сбросить на авто (8% соло / 4% пара)"
                                    onClick={async () => {
                                      setCommissionRates(prev => ({ ...prev, [name]: '' }));
                                      const matches = clubEmployees.filter(empObj => empObj.name.trim().toLowerCase() === name.trim().toLowerCase());
                                      try {
                                        const { doc: fsDoc, updateDoc: fsUpdateDoc } = await import('firebase/firestore');
                                        await Promise.all(matches.map(m =>
                                          fsUpdateDoc(fsDoc(db, 'employees', m.id), { commissionRate: null })
                                        ));
                                      } catch (err) {
                                        console.error('Error clearing commission rate:', err);
                                      }
                                    }}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '2px 4px', borderRadius: 6 }}
                                  >×</button>
                                )}
                              </div>
                            )}
                            
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 15, fontWeight: 950, color: '#7D6FB3' }}>{data.total.toLocaleString('ru-RU')} ₸</div>
                              {!isServicePerson && award > 0 && (
                                <div style={{ fontSize: 11, fontWeight: 900, color: '#5F9C81', marginTop: 1 }}>
                                  Награда: {award.toLocaleString('ru-RU')} ₸{customRate !== null ? ` (${customRate}%)` : ''}
                                </div>
                              )}
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{pct}% от общего</div>
                            </div>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, marginBottom: 10, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #7c3aed, #a78bfa)', borderRadius: 4, transition: 'width 0.6s ease' }} />
                        </div>
                        {/* Collapsible individual sales list */}
                        <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
                          <button 
                            onClick={() => setExpandedPersons(prev => ({ ...prev, [name]: !prev[name] }))}
                            className="flex items-center justify-between w-full text-[10px] font-black uppercase text-[var(--accent-purple)] tracking-wider hover:opacity-80 transition-opacity"
                          >
                            <span>{expandedPersons[name] ? '▼ Скрыть транзакции' : '▶ Показать транзакции'}</span>
                            <span>{data.sales.length} шт</span>
                          </button>
                          
                          {expandedPersons[name] && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 6, borderLeft: '2px solid rgba(125,111,179,0.2)' }}>
                              {data.sales.map(s => {
                                const sDate = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : new Date();
                                const numAdmins = s.autoNames?.length || 1;
                                const shareAmount = (s.totalSum || 0) / numAdmins;
                                const saleRate = hasCustomRate ? parsedCustom : (numAdmins === 1 ? 8 : 4);
                                const saleAward = isServicePerson ? 0 : Math.round(shareAmount * saleRate / 100);
                                return (
                                  <div key={s.id} className="flex items-center justify-between text-xs py-1 hover:bg-[var(--bg-primary)] rounded px-1">
                                    <div className="flex flex-col">
                                      <span className="font-extrabold text-[var(--text-primary)]">{s.productName} ({numAdmins > 1 ? `${((s.qty || 0) / numAdmins).toFixed(1)} из ${s.qty}` : s.qty} шт)</span>
                                      <span className="text-[9px] text-[var(--text-muted)]">
                                        {sDate.toLocaleDateString('ru-RU')} в {sDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · {s.paymentMethod}
                                        {s.salespersonName && ` · ${s.salespersonName}`}
                                        {autoDistributeBySchedule && numAdmins > 1 && ` · По графику: ${s.autoNames.join(', ')}`}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div style={{ textAlign: 'right' }}>
                                        <div className="font-bold text-emerald-400">{Math.round(shareAmount).toLocaleString('ru-RU')} ₸</div>
                                        {!isServicePerson && (
                                          <div style={{ fontSize: 9, fontWeight: 900, color: '#a78bfa' }}>
                                            {saleRate}% → {saleAward.toLocaleString('ru-RU')} ₸
                                          </div>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => handleDeleteSale(s)}
                                        className="p-1 hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 rounded transition-all"
                                        title="Удалить продажу"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                              {/* Total reward for this person */}
                              {!isServicePerson && award > 0 && (
                                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed rgba(125,111,179,0.3)', display: 'flex', justifyContent: 'flex-end' }}>
                                  <span style={{ fontSize: 11, fontWeight: 900, color: '#5F9C81' }}>
                                    Итого награда: {award.toLocaleString('ru-RU')} ₸
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()
      ) : activeTab === 'logs' ? (
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
                          ) : log.type === 'transfer_out' ? (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[9px] font-black uppercase tracking-wider">Отправка</span>
                          ) : log.type === 'transfer_in' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider">Приёмка</span>
                          ) : log.type === 'transfer_rejected' ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-black uppercase tracking-wider">Возврат</span>
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
      ) : activeTab === 'resort' ? (
        /* --- RESORT (INVENTORY RECOUNT) TAB --- */
        <div className="bg-[var(--bg-card)] rounded-3xl border border-orange-500/20 shadow-xl overflow-hidden">
          {/* Мобильный: шапка пересорта переносится, кнопки не вылезают за экран */}
          <div className={`border-b border-[var(--border)] flex items-center justify-between flex-wrap gap-3 ${isMobile ? 'px-4 py-3' : 'px-6 py-4'}`} style={{ background: 'rgba(192,143,79,0.04)' }}>
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
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">{p.category}</span>
                          {p.sku && (
                            <>
                              <div className="w-1.5 h-1.5 rounded-full bg-orange-500/30" />
                              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Арт: {p.sku}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-0.5 text-[10px] font-black bg-purple-500/10 text-purple-400 rounded-lg border border-purple-500/20 uppercase">{p.club}</span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className="font-black text-sm text-[var(--text-primary)]">{p.stock} шт</span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        {p.sizes && Object.keys(p.sizes).length > 0 ? (
                          <span className="text-[10px] font-bold text-[var(--text-muted)]" title="У товара размерная сетка — фактические остатки правятся по размерам в карточке товара («Изменить»)">
                            по размерам →<br/>в карточке
                          </span>
                        ) : (
                        <input
                          type="number"
                          min="0"
                          placeholder={String(p.stock)}
                          value={factVal}
                          onChange={e => setResortValues(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-20 text-center font-black text-sm rounded-lg border outline-none py-1.5 px-2 transition-all"
                          style={{
                            background: hasDiff ? 'rgba(192,143,79,0.08)' : 'var(--bg-hover)',
                            borderColor: hasDiff ? '#C08F4F' : 'var(--border)',
                            color: hasDiff ? '#C08F4F' : 'var(--text-primary)',
                          }}
                        />
                        )}
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
          ) : isMobile ? (
            /* Мобильный: вертикальные карточки товара вместо широкой таблицы */
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredProducts.map(p => {
                const isLow = p.stock <= p.minStock;
                const isOut = p.stock === 0;
                const stockColor = isOut ? '#B06A6A' : isLow ? '#C08F4F' : '#5F9C81';
                const canSell = !isMarketing && !isKomdir;
                const canManage = !isMarketing && (isChef || (managerClub && p.club === managerClub) || isLostviewerFull);
                return (
                  <div key={p.id} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
                    {/* Фото + название + цена/остаток */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Image size={16} style={{ opacity: 0.4, color: 'var(--text-muted)' }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', lineHeight: '17px' }}>{p.name}</div>
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>
                          {p.category}{p.sku ? ` · Арт: ${p.sku}` : ''} · {p.club}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#5F9C81', whiteSpace: 'nowrap' }}>{(p.salePrice || 0).toLocaleString()} ₸</div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: stockColor, whiteSpace: 'nowrap', marginTop: 2 }}>
                          {isOut ? 'Нет в наличии' : `${p.stock} шт${isLow ? ' · мало' : ''}`}
                        </div>
                      </div>
                    </div>
                    {/* Размерная сетка: остатки по размерам */}
                    {p.sizes && Object.keys(p.sizes).length > 0 && (
                      <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                        {SIZES.filter(sz => p.sizes[sz] !== undefined).map(sz => (
                          <span key={sz} style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 7, background: (p.sizes[sz] || 0) > 0 ? 'rgba(125,111,179,0.12)' : 'rgba(176,106,106,0.1)', color: (p.sizes[sz] || 0) > 0 ? 'var(--accent-purple)' : '#B06A6A', border: '1px solid var(--border)' }}>
                            {sz}·{p.sizes[sz] || 0}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Доп. цены (по ролям) */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      {canSeeCost && <span>Себест.: <b style={{ color: 'var(--text-secondary)' }}>{(p.costPrice || 0).toLocaleString()} ₸</b></span>}
                      <span>Сотрудник: <b style={{ color: 'var(--accent-purple)' }}>{(p.employeePrice || 0).toLocaleString()} ₸</b></span>
                      <span>Мин: <b style={{ color: 'var(--text-secondary)' }}>{p.minStock}</b></span>
                    </div>
                    {/* Действия — крупные кнопки под палец */}
                    {(canSell || canManage) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        {canSell && (
                          <button
                            disabled={isOut}
                            onClick={() => {
                              setSelectedProductForSale(p);
                              setSaleForm({
                                qty: '1',
                                paymentMethod: 'Kaspi',
                                clientName: '',
                                buyerType: 'client',
                                customPrice: String(p.salePrice),
                                notes: '',
                                isFree: false,
                                freeReason: 'Бартер',
                                size: ''
                              });
                              setShowSaleModal(true);
                            }}
                            style={{ flex: 1, minWidth: 100, height: 40, borderRadius: 11, fontSize: 12, fontWeight: 800, border: `1px solid ${isOut ? 'var(--border)' : 'rgba(95,156,129,0.3)'}`, background: isOut ? 'var(--bg-card)' : 'rgba(95,156,129,0.12)', color: isOut ? 'var(--text-muted)' : '#5F9C81', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: isOut ? 'not-allowed' : 'pointer' }}
                          >
                            <ShoppingCart size={14} /> Продать
                          </button>
                        )}
                        {canManage && (
                          <>
                            <button
                              onClick={() => { setSelectedProductForSupply(p); setShowSupplyModal(true); }}
                              style={{ flex: 1, minWidth: 100, height: 40, borderRadius: 11, fontSize: 12, fontWeight: 800, border: '1px solid rgba(85,128,168,0.3)', background: 'rgba(85,128,168,0.12)', color: '#5580A8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
                            >
                              <Plus size={14} /> Поставка
                            </button>
                            <button
                              disabled={isOut}
                              onClick={() => openTransferModal(p)}
                              style={{ flex: 1, minWidth: 110, height: 40, borderRadius: 11, fontSize: 12, fontWeight: 800, border: `1px solid ${isOut ? 'var(--border)' : 'rgba(125,111,179,0.3)'}`, background: isOut ? 'var(--bg-card)' : 'rgba(125,111,179,0.12)', color: isOut ? 'var(--text-muted)' : 'var(--accent-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: isOut ? 'not-allowed' : 'pointer' }}
                            >
                              <ArrowUpRight size={14} /> Переместить
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {/* Служебные действия: редактирование, фото, удаление (зона ≥36px) */}
                    {canManage && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button
                          onClick={() => {
                            setEditingProduct(p);
                            setPhotoFile(null);
                            setPhotoPreview(p.imageUrl || null);
                            setPhotoBase64(null);
                            setProductForm({
                              name: p.name,
                              sku: p.sku || '',
                              club: p.club,
                              category: p.category,
                              costPrice: String(p.costPrice || ''),
                              salePrice: String(p.salePrice || ''),
                              employeePrice: String(p.employeePrice || ''),
                              stock: String(p.stock || ''),
                              minStock: String(p.minStock || ''),
                              useSizes: !!p.sizes && Object.keys(p.sizes).length > 0,
                              sizes: Object.fromEntries(Object.entries(p.sizes || {}).map(([k, v]) => [k, String(v)]))
                            });
                            setShowProductModal(true);
                          }}
                          style={{ flex: 1, height: 38, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                        >
                          <Edit3 size={13} /> Изменить
                        </button>
                        {p.imageUrl && (
                          <button
                            onClick={() => handleDeletePhoto(p)}
                            title="Удалить фото"
                            style={{ width: 44, height: 38, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: '#C08F4F', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                          >
                            <Image size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteProduct(p.id)}
                          title="Удалить товар"
                          style={{ width: 44, height: 38, borderRadius: 10, border: '1px solid rgba(176,106,106,0.25)', background: 'rgba(176,106,106,0.08)', color: '#B06A6A', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left bg-[var(--bg-hover)]/30">
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Товар / Категория</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Клуб</th>
                    {canSeeCost && <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-right">Себестоимость</th>}
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-right">Цена сотрудника</th>
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
                          <div className="flex items-center gap-3">
                            {/* Product Photo Thumbnail */}
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                className="w-11 h-11 rounded-xl object-cover border border-[var(--border)] flex-shrink-0 shadow-md"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-[var(--bg-hover)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                                <Image size={16} className="text-[var(--text-muted)] opacity-40" />
                              </div>
                            )}
                            <div>
                              <span className="font-extrabold text-sm text-[var(--text-primary)] block">{p.name}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest block">{p.category}</span>
                                {p.sku && (
                                  <>
                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500/20" />
                                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Арт: {p.sku}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 text-[10px] font-black bg-purple-500/10 text-purple-400 rounded-lg border border-purple-500/20 uppercase">
                            {p.club}
                          </span>
                        </td>
                        {canSeeCost && (
                          <td className="px-6 py-4 text-right">
                            <span className="font-bold text-xs text-[var(--text-secondary)]">{(p.costPrice || 0).toLocaleString()} ₸</span>
                          </td>
                        )}
                        <td className="px-6 py-4 text-right">
                          <span className="font-semibold text-xs text-purple-400">{(p.employeePrice || 0).toLocaleString()} ₸</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-extrabold text-sm text-emerald-400">{(p.salePrice || 0).toLocaleString()} ₸</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`font-black text-sm ${isOut ? 'text-red-500' : isLow ? 'text-orange-400' : 'text-[var(--text-primary)]'}`}>
                            {p.stock}
                          </span>
                          <span className="text-[9px] font-bold text-[var(--text-muted)] block">мин: {p.minStock}</span>
                          {/* Размерная сетка: остатки по размерам */}
                          {p.sizes && Object.keys(p.sizes).length > 0 && (
                            <span className="text-[9px] font-black block mt-0.5" style={{ color: 'var(--accent-purple)' }}>
                              {SIZES.filter(sz => p.sizes[sz] !== undefined).map(sz => `${sz}·${p.sizes[sz] || 0}`).join('  ')}
                            </span>
                          )}
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
                            {/* Sell Button — Ком-Дир только смотрит, не продаёт */}
                            {!isMarketing && !isKomdir && (
                              <button
                                disabled={isOut}
                                onClick={() => {
                                  setSelectedProductForSale(p);
                                  setSaleForm({
                                    qty: '1',
                                    paymentMethod: 'Kaspi',
                                    clientName: '',
                                    buyerType: 'client',
                                    customPrice: String(p.salePrice),
                                    notes: '',
                                    isFree: false,
                                    freeReason: 'Бартер',
                                    size: ''
                                  });
                                  setShowSaleModal(true);
                                }}
                                className={`flex items-center gap-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase border transition-all ${isOut ? 'bg-gray-500/10 text-gray-500 border-gray-500/10 cursor-not-allowed' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'}`}
                              >
                                <ShoppingCart size={11} /> Продать
                              </button>
                            )}

                            {!isMarketing && (isChef || (managerClub && p.club === managerClub) || isLostviewerFull) && (
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

                                {/* Transfer Button */}
                                <button
                                  disabled={isOut}
                                  onClick={() => openTransferModal(p)}
                                  title="Переместить в другую студию"
                                  className={`flex items-center gap-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase border transition-all ${isOut ? 'bg-gray-500/10 text-gray-500 border-gray-500/10 cursor-not-allowed' : 'bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20'}`}
                                >
                                  <ArrowUpRight size={11} /> Переместить
                                </button>

                                {/* Edit Button */}
                                <button
                                  onClick={() => {
                                    setEditingProduct(p);
                                    setPhotoFile(null);
                                    setPhotoPreview(p.imageUrl || null);
                                    setPhotoBase64(null);
                                    setProductForm({
                                      name: p.name,
                                      sku: p.sku || '',
                                      club: p.club,
                                      category: p.category,
                                      costPrice: String(p.costPrice || ''),
                                      salePrice: String(p.salePrice || ''),
                                      employeePrice: String(p.employeePrice || ''),
                                      stock: String(p.stock || ''),
                                      minStock: String(p.minStock || '')
                                    });
                                    setShowProductModal(true);
                                  }}
                                  className="p-2 bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-purple-400 rounded-lg border border-[var(--border)] transition-all"
                                >
                                  <Edit3 size={12} />
                                </button>

                                {/* Delete Photo Button */}
                                {p.imageUrl && (
                                  <button
                                    onClick={() => handleDeletePhoto(p)}
                                    title="Удалить фото"
                                    className="p-2 bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-orange-400 rounded-lg border border-[var(--border)] transition-all"
                                  >
                                    <Image size={12} />
                                  </button>
                                )}

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
          ) : isMobile ? (
            /* Мобильный: карточки чеков вместо широкой таблицы */
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredSales.map(s => {
                const isSale = s.qty > 0;
                const isReturned = !!s.returned;
                const dateObj = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : new Date();
                return (
                  <div key={s.id} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, opacity: isReturned ? 0.65 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{s.productName}{s.size ? ` (${s.size})` : ''}</div>
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>
                          {s.club}{s.category ? ` · ${s.category}` : ''}{s.sku ? ` · Арт: ${s.sku}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, whiteSpace: 'nowrap', color: isReturned ? '#C08F4F' : isSale ? '#5F9C81' : '#5580A8', textDecoration: isReturned ? 'line-through' : 'none' }}>
                          {isSale && !isReturned ? '+' : ''}{(s.totalSum || 0).toLocaleString()} ₸
                        </div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: isSale ? '#5F9C81' : '#5580A8', marginTop: 2 }}>{isSale ? '+' : ''}{s.qty} шт</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 8 }}>
                      {s.paymentMethod === 'Складская поставка' ? 'Склад' : s.paymentMethod} · {s.cashierName} · {dateObj.toLocaleDateString('ru-RU')} {dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {s.clientName && s.clientName !== 'Гость' && (
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {s.buyerType === 'employee' ? 'Сотрудник: ' : 'Клиент: '}{s.clientName}
                      </div>
                    )}
                    {s.notes && (
                      <div style={{ fontSize: 10.5, fontStyle: 'italic', color: 'var(--accent-purple)', marginTop: 2 }}>💬 {s.notes}</div>
                    )}
                    {/* Возврат / удаление операции — те же права, что и на десктопе */}
                    {isReturned ? (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#C08F4F' }}>
                        <RotateCcw size={13} /> Возвращена{s.returnedAtISO ? ` · ${new Date(s.returnedAtISO).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}{s.returnedBy ? ` · ${s.returnedBy}` : ''}
                      </div>
                    ) : isMarketing ? null : (
                      <button
                        onClick={() => handleDeleteSale(s)}
                        style={{
                          marginTop: 10, width: '100%', height: 40, borderRadius: 11, fontSize: 12, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
                          border: isSale ? '1px solid rgba(192,143,79,0.3)' : '1px solid var(--border)',
                          background: isSale ? 'rgba(192,143,79,0.1)' : 'var(--bg-card)',
                          color: isSale ? '#C08F4F' : 'var(--text-secondary)',
                        }}
                      >
                        {isSale ? (<><RotateCcw size={14} /> Оформить возврат</>) : (<><Trash2 size={14} /> Удалить операцию</>)}
                      </button>
                    )}
                  </div>
                );
              })}
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
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((s) => {
                    const isSale = s.qty > 0;
                    const isReturned = !!s.returned;
                    const dateObj = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : new Date();

                    return (
                      <tr key={s.id} className={`border-b border-[var(--border)] hover:bg-[var(--bg-hover)]/40 transition-colors ${isReturned ? 'opacity-60' : ''}`}>
                        <td className="px-6 py-4 text-xs font-semibold text-[var(--text-secondary)]">
                          {dateObj.toLocaleDateString('ru-RU')} в {dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-black uppercase text-[var(--text-primary)]">{s.club}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-extrabold text-sm text-[var(--text-primary)] block">{s.productName}{s.size ? ` (${s.size})` : ''}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest">{s.category}</span>
                            {s.sku && (
                              <>
                                <div className="w-1.5 h-1.5 rounded-full bg-purple-500/20" />
                                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Арт: {s.sku}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-sm">
                          {isSale ? (
                            <span className="text-emerald-400">+{s.qty} шт</span>
                          ) : (
                            <span className="text-blue-400">{s.qty} шт</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right font-black">
                          {isReturned ? (
                            <span className="text-amber-500 line-through">{(s.totalSum || 0).toLocaleString()} ₸</span>
                          ) : isSale ? (
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
                            <span className="text-[10px] text-[var(--text-muted)] block mt-0.5">
                              {s.buyerType === 'employee' ? 'Сотрудник: ' : 'Клиент: '}{s.clientName}
                            </span>
                          )}
                          {s.notes && (
                            <span className="text-[10px] italic text-purple-400 block mt-0.5 bg-purple-500/5 py-0.5 px-1.5 rounded w-fit border border-purple-500/10">
                              💬 {s.notes}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-[var(--text-secondary)]">
                          {s.cashierName}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isReturned ? (
                            <span
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 text-amber-500 rounded-lg border border-amber-500/25 text-[11px] font-black uppercase tracking-wide"
                              title={`Возврат оформлен${s.returnedAtISO ? ' ' + new Date(s.returnedAtISO).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}${s.returnedBy ? ' · ' + s.returnedBy : ''}`}
                            >
                              <RotateCcw size={12} /> Возвращена
                            </span>
                          ) : isMarketing ? null : isSale ? (
                            <button
                              onClick={() => handleDeleteSale(s)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 rounded-lg border border-amber-500/25 transition-all text-[11px] font-black uppercase tracking-wide"
                              title="Оформить возврат — товар вернётся на склад (доступно в любое время)"
                            >
                              <RotateCcw size={12} /> Возврат
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeleteSale(s)}
                              className="p-2 bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-red-500 rounded-lg border border-[var(--border)] transition-all"
                              title="Удалить операцию"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
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
      {showProductModal && (isChef || !!managerClub || isLostviewerFull) && ReactDOM.createPortal(
        /* Мобильный: модалка прижата к низу шторкой */
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center z-50 animate-fade ${isMobile ? 'items-end p-0' : 'items-center p-4'}`}>
          <div ref={productSheetRef} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-md relative flex flex-col" style={isMobile ? { maxHeight: '90vh', maxWidth: '100%', borderRadius: '20px 20px 0 0', borderLeft: 'none', borderRight: 'none', borderBottom: 'none' } : { maxHeight: '90vh' }}>
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

            <form onSubmit={handleSaveProduct} data-sheet-scroll className="p-5 space-y-4 overflow-y-auto">
              
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Название товара</label>
                  <input 
                    type="text"
                    placeholder="Худи Black Edition XL"
                    value={productForm.name}
                    onChange={e => setProductForm({...productForm, name: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Артикул</label>
                  <input 
                    type="text"
                    placeholder="H-BLK-XL"
                    value={productForm.sku}
                    onChange={e => setProductForm({...productForm, sku: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                  />
                </div>
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

              {isChef ? (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Себест. (₸)</label>
                    <input 
                      type="number"
                      placeholder="5000"
                      value={productForm.costPrice}
                      onChange={e => setProductForm({...productForm, costPrice: e.target.value})}
                      className="w-full px-2 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Цена сотр. (₸)</label>
                    <input 
                      type="number"
                      placeholder="8000"
                      value={productForm.employeePrice}
                      onChange={e => setProductForm({...productForm, employeePrice: e.target.value})}
                      className="w-full px-2 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Цена прод. (₸)</label>
                    <input 
                      type="number"
                      placeholder="12000"
                      value={productForm.salePrice}
                      onChange={e => setProductForm({...productForm, salePrice: e.target.value})}
                      className="w-full px-2 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Цена сотрудника (₸)</label>
                    <input 
                      type="number"
                      placeholder="8000"
                      value={productForm.employeePrice}
                      onChange={e => setProductForm({...productForm, employeePrice: e.target.value})}
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
                </div>
              )}

              {/* ── Размерная сетка: одна карточка = модель, остатки по размерам ── */}
              <button
                type="button"
                onClick={() => setProductForm({ ...productForm, useSizes: !productForm.useSizes })}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all"
                style={{
                  background: productForm.useSizes ? 'rgba(125,111,179,0.08)' : 'var(--bg-primary)',
                  borderColor: productForm.useSizes ? 'rgba(125,111,179,0.45)' : 'var(--border)',
                }}
              >
                <span className="text-left">
                  <span className="block text-[12px] font-black" style={{ color: 'var(--text-primary)' }}>Размерная сетка</span>
                  <span className="block text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>остатки по размерам (S/M/L…), общий остаток считается сам</span>
                </span>
                <span style={{ width: 40, height: 22, borderRadius: 999, position: 'relative', flexShrink: 0, background: productForm.useSizes ? 'var(--accent-purple)' : 'var(--border)', transition: 'background 0.15s' }}>
                  <span style={{ position: 'absolute', top: 2, left: productForm.useSizes ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                </span>
              </button>

              {productForm.useSizes && (
                <div className="rounded-xl border border-[var(--border)] p-3" style={{ background: 'var(--bg-primary)' }}>
                  <div className="grid grid-cols-4 gap-2">
                    {SIZES.map(sz => (
                      <div key={sz}>
                        <label className="text-[9px] font-black uppercase tracking-wider block mb-1 text-center" style={{ color: 'var(--text-muted)' }}>{sz}</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={productForm.sizes?.[sz] ?? ''}
                          onChange={e => setProductForm({ ...productForm, sizes: { ...(productForm.sizes || {}), [sz]: e.target.value } })}
                          className="w-full px-2 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm font-bold text-center text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)]"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] font-black text-right" style={{ color: 'var(--accent-purple)' }}>
                    Итого: {SIZES.reduce((a, sz) => a + (parseInt(productForm.sizes?.[sz]) || 0), 0)} шт
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {!productForm.useSizes && (
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
                )}
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

              {/* ── Photo Upload Section ── */}
              <div className="border-t border-[var(--border)] pt-4">
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-2">Фото товара</label>
                <div className="flex items-start gap-3">
                  {/* Preview */}
                  <div
                    className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-dashed border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-purple-400 transition-all flex-shrink-0 bg-[var(--bg-primary)] relative group"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {photoPreview ? (
                      <>
                        <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Camera size={20} className="text-white" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-[var(--text-muted)]">
                        <UploadCloud size={22} />
                        <span className="text-[8px] font-black uppercase">Фото</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                  <div className="flex flex-col gap-2 flex-1">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="text-xs font-bold text-purple-400 hover:text-purple-300 border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 rounded-xl px-3 py-2 transition-all text-left"
                    >
                      {photoPreview ? '🔄 Заменить фото' : '📷 Выбрать фото'}
                    </button>
                    {photoPreview && (
                      <button
                        type="button"
                        onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                        className="text-xs font-bold text-red-400 hover:text-red-300 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 rounded-xl px-3 py-2 transition-all text-left"
                      >
                        🗑 Убрать фото
                      </button>
                    )}
                    <span className="text-[9px] text-[var(--text-muted)] font-semibold">JPG/PNG, до 5 МБ</span>
                  </div>
                </div>
                {/* Upload Progress */}
                {photoUploading && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 transition-all duration-300"
                        style={{ width: `${photoUploadProgress}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-bold text-[var(--text-muted)] mt-1 block">Загрузка... {photoUploadProgress}%</span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-[var(--border)] flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => { setShowProductModal(false); setPhotoFile(null); setPhotoPreview(null); setPhotoBase64(null); }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)]/80 transition-all"
                >
                  Отмена
                </button>
                <button 
                  type="submit"
                  disabled={photoUploading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[var(--accent-purple)] hover:bg-purple-600 text-white shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {photoUploading ? `Загрузка ${photoUploadProgress}%...` : (editingProduct ? 'Сохранить изменения' : 'Создать')}
                </button>
              </div>

            </form>
          </div>
        </div>
      , document.body)}

      {/* ─── MODAL: RECORD A SALE ─── */}
      {showSaleModal && selectedProductForSale && ReactDOM.createPortal(
        /* Мобильный: модалка прижата к низу шторкой */
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center z-50 animate-fade ${isMobile ? 'items-end p-0' : 'items-center p-4'}`}>
          <div ref={saleSheetRef} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-sm relative flex flex-col" style={isMobile ? { maxHeight: '90vh', maxWidth: '100%', borderRadius: '20px 20px 0 0', borderLeft: 'none', borderRight: 'none', borderBottom: 'none' } : { maxHeight: '90vh' }}>
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

            <form onSubmit={handleCreateSale} data-sheet-scroll className="p-5 space-y-4 overflow-y-auto">
              
              <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--border)] overflow-hidden">
                {/* Product image banner */}
                {selectedProductForSale.imageUrl && (
                  <div className="w-full h-44 bg-black overflow-hidden">
                    <img
                      src={selectedProductForSale.imageUrl}
                      alt={selectedProductForSale.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <div className="p-4">
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
              </div>

              {/* Sale Type (Paid/Free) Switcher */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Тип продажи</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSaleForm({ ...saleForm, isFree: false, paymentMethod: 'Kaspi' })}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${!saleForm.isFree ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                  >
                    Платная продажа
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaleForm({ ...saleForm, isFree: true, paymentMethod: 'Бартер' })}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${saleForm.isFree ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
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
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${saleForm.buyerType === 'client' ? 'bg-[var(--accent-purple)] text-white border-[var(--accent-purple)] shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                      >
                        Клиент
                      </button>
                      <button
                        type="button"
                        onClick={() => setSaleForm({ ...saleForm, buyerType: 'employee', customPrice: String(selectedProductForSale.employeePrice || selectedProductForSale.salePrice || 0) })}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${saleForm.buyerType === 'employee' ? 'bg-[var(--accent-purple)] text-white border-[var(--accent-purple)] shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                      >
                        Сотрудник
                      </button>
                    </div>
                  </div>

                  {/* Размер — для товаров с размерной сеткой */}
                  {selectedProductForSale.sizes && Object.keys(selectedProductForSale.sizes).length > 0 && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Размер</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {SIZES.filter(sz => (selectedProductForSale.sizes[sz] || 0) > 0).map(sz => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setSaleForm({ ...saleForm, size: sz })}
                            className={`px-3 rounded-xl text-xs font-black border transition-all ${saleForm.size === sz ? 'bg-[var(--accent-purple)] text-white border-[var(--accent-purple)]' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)]'}`}
                            style={{ minHeight: 40 }}
                          >
                            {sz} <span style={{ opacity: 0.7, fontWeight: 700 }}>·{selectedProductForSale.sizes[sz]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

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
                          className={`py-1.5 rounded-lg text-[9px] font-black uppercase border text-center transition-all ${saleForm.freeReason === r ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Размер — для товаров с размерной сеткой (бесплатная выдача тоже списывает) */}
                  {selectedProductForSale.sizes && Object.keys(selectedProductForSale.sizes).length > 0 && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Размер</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {SIZES.filter(sz => (selectedProductForSale.sizes[sz] || 0) > 0).map(sz => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setSaleForm({ ...saleForm, size: sz })}
                            className={`px-3 rounded-xl text-xs font-black border transition-all ${saleForm.size === sz ? 'bg-[var(--accent-purple)] text-white border-[var(--accent-purple)]' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)]'}`}
                            style={{ minHeight: 40 }}
                          >
                            {sz} <span style={{ opacity: 0.7, fontWeight: 700 }}>·{selectedProductForSale.sizes[sz]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

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
              )}

              <div>
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
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Комментарий к продаже</label>
                <textarea 
                  rows="2"
                  placeholder="Укажите детали (например: скидка, вычет из зп и т.д.)"
                  value={saleForm.notes}
                  onChange={e => setSaleForm({...saleForm, notes: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] transition-all resize-none"
                />
              </div>

              {/* Salesperson selector inside modal for all clubs */}
              {todayClubEmployees.length > 0 && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[#7D6FB3] block mb-1.5 flex items-center gap-1.5">
                    <Users size={12} />
                    Кому идет продажа (выберите до 2 админов)
                  </label>
                  {filteredEmployees.length === 0 ? (
                    <div className="text-[10px] text-[var(--text-muted)] p-2.5 bg-[var(--bg-primary)] rounded-xl border border-[var(--border)]">
                      ⚠️ Нет работающих сегодня сотрудников в графике
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {filteredEmployees.map(emp => {
                        const selectedNames = saleForm.salespersonName 
                          ? saleForm.salespersonName.split(',').map(n => n.trim()).filter(Boolean) 
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
                              setSaleForm({ ...saleForm, salespersonName: nextNames.join(', ') });
                            }}
                            className={`py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all border text-left flex flex-col ${isSel ? 'bg-purple-600/15 text-[#7D6FB3] border-[#7D6FB3]' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                          >
                            <span>{emp.name.split(' ')[0]}</span>
                            <span className="text-[8px] opacity-70 font-semibold">{emp.shift}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Total Calculation Display */}
              <div className="pt-2 flex items-center justify-between border-t border-[var(--border)]">
                <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Итого к оплате:</span>
                <span className={`text-lg font-black ${saleForm.isFree ? 'text-orange-500' : 'text-emerald-400'}`}>
                  {saleForm.isFree ? '🎁 0' : ((parseInt(saleForm.qty) || 0) * (parseFloat(saleForm.customPrice) || 0)).toLocaleString()} ₸
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
      , document.body)}

      {/* ─── MODAL: SUPPLY / RESTOCK ─── */}
      {showTransferModal && selectedProductForTransfer && ReactDOM.createPortal(
        /* Мобильный: модалка прижата к низу шторкой */
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center z-50 animate-fade ${isMobile ? 'items-end p-0' : 'items-center p-4'}`} onClick={() => !transferBusy && setShowTransferModal(false)}>
          <div ref={transferSheetRef} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-sm relative flex flex-col" style={isMobile ? { maxHeight: '90vh', maxWidth: '100%', borderRadius: '20px 20px 0 0', borderLeft: 'none', borderRight: 'none', borderBottom: 'none' } : { maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-md font-black text-[var(--text-primary)] uppercase italic tracking-wider flex items-center gap-2">
                <ArrowUpRight size={18} className="text-purple-400" /> Перемещение
              </h3>
              <button onClick={() => setShowTransferModal(false)} className="p-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"><X size={18} /></button>
            </div>

            <div data-sheet-scroll className="p-5 space-y-4 overflow-y-auto">
              <div className="p-4 bg-[var(--bg-primary)] rounded-2xl border border-[var(--border)]">
                <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest">{selectedProductForTransfer.category} • {selectedProductForTransfer.club}</span>
                <h4 className="font-extrabold text-sm text-[var(--text-primary)] mt-1">{selectedProductForTransfer.name}</h4>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--border)]/60">
                  <span className="text-xs text-[var(--text-secondary)] font-semibold">На складе {selectedProductForTransfer.club}:</span>
                  <span className="font-black text-sm text-[var(--text-primary)]">{selectedProductForTransfer.stock} шт</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Куда переместить</label>
                <select value={transferForm.toClub} onChange={e => setTransferForm(f => ({ ...f, toClub: e.target.value }))}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm font-bold text-[var(--text-primary)] outline-none">
                  <option value="">Выберите студию…</option>
                  {CLUBS.filter(c => c !== selectedProductForTransfer.club).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {selectedProductForTransfer.sizes && Object.keys(selectedProductForTransfer.sizes).length > 0 && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Размер</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {SIZES.filter(sz => (selectedProductForTransfer.sizes[sz] || 0) > 0).map(sz => (
                      <button key={sz} type="button" onClick={() => setTransferForm(f => ({ ...f, size: sz }))}
                        className={`px-3 rounded-xl text-xs font-black border transition-all ${transferForm.size === sz ? 'bg-[var(--accent-purple)] text-white border-[var(--accent-purple)]' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)]'}`}
                        style={{ minHeight: 40 }}>
                        {sz} <span style={{ opacity: 0.7, fontWeight: 700 }}>·{selectedProductForTransfer.sizes[sz]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Количество (шт)</label>
                <input type="number" min="1" max={selectedProductForTransfer.stock} value={transferForm.qty}
                  onChange={e => setTransferForm(f => ({ ...f, qty: e.target.value }))} placeholder="0"
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm font-bold text-[var(--text-primary)] outline-none" autoFocus />
              </div>

              <div className="text-[11px] font-semibold text-[var(--text-muted)] leading-relaxed bg-purple-500/5 border border-purple-500/15 rounded-xl px-3 py-2.5">
                Товар спишется со склада <b className="text-[var(--text-secondary)]">{selectedProductForTransfer.club}</b> сразу. На складе-получателе он появится после подтверждения приёмки.
              </div>

              <button onClick={handleCreateTransfer} disabled={transferBusy}
                className="w-full py-3 rounded-xl bg-[var(--accent-purple)] text-white text-sm font-black uppercase tracking-wider hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                <ArrowUpRight size={16} /> {transferBusy ? 'Отправка…' : 'Создать перемещение'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSupplyModal && selectedProductForSupply && (isChef || (managerClub && selectedProductForSupply.club === managerClub) || isLostviewerFull) && ReactDOM.createPortal(
        /* Мобильный: модалка прижата к низу шторкой */
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center z-50 animate-fade ${isMobile ? 'items-end p-0' : 'items-center p-4'}`}>
          <div ref={supplySheetRef} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-sm relative flex flex-col" style={isMobile ? { maxHeight: '90vh', maxWidth: '100%', borderRadius: '20px 20px 0 0', borderLeft: 'none', borderRight: 'none', borderBottom: 'none' } : { maxHeight: '90vh' }}>
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

            <form onSubmit={handleAddSupply} data-sheet-scroll className="p-5 space-y-4 overflow-y-auto">
              
              <div className="p-4 bg-[var(--bg-primary)] rounded-2xl border border-[var(--border)]">
                <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest">{selectedProductForSupply.category} • {selectedProductForSupply.club}</span>
                <h4 className="font-extrabold text-sm text-[var(--text-primary)] mt-1">{selectedProductForSupply.name}</h4>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--border)]/60">
                  <span className="text-xs text-[var(--text-secondary)] font-semibold">Текущий остаток:</span>
                  <span className="font-black text-sm text-[var(--text-primary)]">{selectedProductForSupply.stock} шт</span>
                </div>
              </div>

              {selectedProductForSupply.sizes && Object.keys(selectedProductForSupply.sizes).length > 0 && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Размер поставки</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {SIZES.map(sz => (
                      <button key={sz} type="button" onClick={() => setSupplyForm(f => ({ ...f, size: sz }))}
                        className={`px-3 rounded-xl text-xs font-black border transition-all ${supplyForm.size === sz ? 'bg-[var(--accent-purple)] text-white border-[var(--accent-purple)]' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)]'}`}
                        style={{ minHeight: 40 }}>
                        {sz}{(selectedProductForSupply.sizes[sz] || 0) > 0 ? <span style={{ opacity: 0.7, fontWeight: 700 }}> ·{selectedProductForSupply.sizes[sz]}</span> : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
      , document.body)}

    </div>
  );
};

export default MerchPage;
