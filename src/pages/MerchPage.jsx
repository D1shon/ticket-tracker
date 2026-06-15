import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { 
  collection, query, onSnapshot, setDoc, doc, deleteDoc, 
  serverTimestamp, addDoc, updateDoc, increment, where, getDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useTickets } from '../store/TicketContext';
import { toast } from 'sonner';
import { 
  Package, Plus, Search, ShoppingCart, TrendingUp, History, 
  Trash2, Edit3, CheckCircle, AlertTriangle, ArrowUpRight, 
  ArrowDownLeft, Filter, DollarSign, Store, X, CreditCard, Wallet, Download, ClipboardList,
  Image, Camera, UploadCloud, Users
} from 'lucide-react';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'];
const CATEGORIES = ['Худи', 'Футболки', 'Кепки', 'Шоперы', 'Блокноты', 'Ручки', 'Другое'];

const MerchPage = () => {
  const { user } = useTickets();
  
  // Role & Permissions check
  const isChef = useMemo(() => user?.role === 'chef', [user]);
  const isMarketing = useMemo(() => user?.role === 'marketing', [user]);
  const managerClub = useMemo(() => user?.club || null, [user]);
  const canSelectAllClubs = useMemo(() => isChef || isMarketing, [isChef, isMarketing]);

  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory', 'sales', 'resort'
  const [selectedClub, setSelectedClub] = useState(() => (!canSelectAllClubs && managerClub) ? managerClub : 'ALL');
  const [selectedSku, setSelectedSku] = useState('ALL');
  const [resortValues, setResortValues] = useState({}); // productId -> actual count string
  const [savingResort, setSavingResort] = useState(false);
  const [commissionRates, setCommissionRates] = useState({}); // salespersonName -> rate string
  const [expandedPersons, setExpandedPersons] = useState({}); // salespersonName -> boolean
  const [autoDistributeBySchedule, setAutoDistributeBySchedule] = useState(true);
  const [clubEmployees, setClubEmployees] = useState([]);
  const [clubSchedules, setClubSchedules] = useState({}); // empId -> days object

  // Load all employees and schedules for the selected club to allow auto-assigning by schedule
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

      // Restore saved commission rates from Firestore (Firestore values win on first load)
      const rates = {};
      emps.forEach(emp => {
        const isServ = emp.isService === true || 
                       (emp.name || '').toLowerCase().includes('сервис') || 
                       (emp.name || '').toLowerCase().includes('техник') || 
                       (emp.name || '').toLowerCase().includes('стажер');
        if (isServ) return;
        if (emp.commissionRate != null && emp.commissionRate !== '') {
          rates[emp.name] = String(emp.commissionRate);
        }
      });
      // Always let Firestore values fill in missing entries (don't override edits already in state)
      setCommissionRates(prev => ({ ...rates, ...prev }));
      
      const scheds = {};
      await Promise.all(emps.map(async emp => {
        const schedDocRef = doc(db, 'schedules', emp.id);
        const schedSnap = await getDoc(schedDocRef);
        if (schedSnap.exists()) {
          scheds[emp.id] = schedSnap.data()?.days || {};
        }
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
    const timeVal = hour * 60 + min; // sale time in minutes since midnight
    
    const workingAdmins = [];
    
    // Filter clubEmployees for this club and month, excluding service employees
    const monthEmps = clubEmployees.filter(emp => {
      const isServ = emp.isService === true || 
                     (emp.name || '').toLowerCase().includes('сервис') || 
                     (emp.name || '').toLowerCase().includes('техник') || 
                     (emp.name || '').toLowerCase().includes('стажер');
      return !isServ && emp.monthKey === monthKey && emp.club === clubName;
    });
    
    monthEmps.forEach(emp => {
      const days = clubSchedules[emp.id];
      if (!days) return;
      const shiftStr = days[dayStr];
      if (!shiftStr) return;
      
      const cleanShift = shiftStr.trim().toLowerCase();
      if (!cleanShift || cleanShift === 'выходной') return;
      
      // Parse shift interval, e.g. "9:00-19:00" or "09:00 - 21:00" or "13:30-23:00"
      const parts = cleanShift.split('-');
      if (parts.length === 2) {
        const startPart = parts[0].trim();
        const endPart = parts[1].trim();
        
        const parseTimeToMinutes = (tStr) => {
          const tParts = tStr.split(':');
          if (tParts.length >= 1) {
            const h = parseInt(tParts[0]) || 0;
            const m = parseInt(tParts[1]) || 0;
            return h * 60 + m;
          }
          return null;
        };
        
        const startMin = parseTimeToMinutes(startPart);
        const endMin = parseTimeToMinutes(endPart);
        
        if (startMin !== null && endMin !== null) {
          if (endMin < startMin) {
            // Shift spans midnight (e.g. 14:00 - 02:00)
            if (timeVal >= startMin || timeVal <= endMin) {
              workingAdmins.push(emp.name);
            }
          } else {
            if (timeVal >= startMin && timeVal <= endMin) {
              workingAdmins.push(emp.name);
            }
          }
        }
      }
    });
    
    return workingAdmins;
  }, [clubEmployees, clubSchedules]);
  
  // Sync selectedClub if user updates
  useEffect(() => {
    if (!canSelectAllClubs && managerClub) {
      setSelectedClub(managerClub);
    }
  }, [canSelectAllClubs, managerClub]);

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
    minStock: '5'
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
    salespersonName: ''
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
          const isServ = data.isService === true || nLower.includes('сервис') || nLower.includes('техник') || nLower.includes('стажер');
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

    return () => {
      unsubProducts();
      unsubSales();
      unsubHistory();
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
    const canManage = isChef || (managerClub && product.club === managerClub);
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
    const canManage = isChef || (managerClub && productForm.club === managerClub);
    if (!canManage) return toast.error('Доступ запрещен');
    if (!productForm.name.trim()) return toast.error('Введите название товара');
    
    const cost = isChef 
      ? (parseFloat(productForm.costPrice) || 0) 
      : (editingProduct ? (editingProduct.costPrice || 0) : 0);
    const sale = parseFloat(productForm.salePrice) || 0;
    const employee = parseFloat(productForm.employeePrice) || 0;
    const initialStock = parseInt(productForm.stock) || 0;
    const min = parseInt(productForm.minStock) || 0;

    const data = {
      name: productForm.name.trim(),
      sku: productForm.sku.trim(),
      club: productForm.club,
      category: productForm.category,
      costPrice: cost,
      salePrice: sale,
      employeePrice: employee,
      stock: editingProduct ? editingProduct.stock : initialStock,
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
      setProductForm({ name: '', sku: '', club: managerClub || '4YOU', category: 'Худи', costPrice: '', salePrice: '', employeePrice: '', stock: '', minStock: '5' });
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
      // 1. Create sale record
      await addDoc(collection(db, 'merch_sales'), {
        productId: selectedProductForSale.id,
        productName: selectedProductForSale.name,
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

      // 2. Decrement stock
      await updateDoc(doc(db, 'merch_products', selectedProductForSale.id), {
        stock: increment(-qty),
        updatedAt: serverTimestamp()
      });

      toast.success(isFree ? 'Товар выдан бесплатно!' : 'Продажа успешно проведена!');
      setShowSaleModal(false);
      setSelectedProductForSale(null);
      setSaleForm({ qty: '1', paymentMethod: 'Kaspi', clientName: '', buyerType: 'client', customPrice: '', notes: '', isFree: false, freeReason: 'Бартер', salespersonName: '' });
    } catch (err) {
      console.error(err);
      toast.error('Ошибка проведения продажи');
    }
  };

  const handleDeleteSale = async (sale) => {
    const canManage = isChef || (managerClub && sale.club === managerClub);
    if (!canManage) return toast.error('Доступ запрещен');
    if (!window.confirm(`Вы уверены, что хотите удалить эту операцию (${sale.productName}, ${sale.qty} шт)?`)) return;
    
    try {
      await deleteDoc(doc(db, 'merch_sales', sale.id));
      
      if (sale.productId) {
        await updateDoc(doc(db, 'merch_products', sale.productId), {
          stock: increment(sale.qty), // Reverts sale (adds qty back to stock) or supply (subtracts negative qty from stock)
          updatedAt: serverTimestamp()
        });
      }

      await addDoc(collection(db, 'merch_history'), {
        type: 'delete_sale',
        productId: sale.productId || null,
        productName: sale.productName,
        club: sale.club,
        details: `Удалена операция: "${sale.productName}" (${sale.qty} шт, Сумма: ${sale.totalSum} ₸, Продавец: ${sale.salespersonName || 'нет'})`,
        cashierName: user?.name || user?.email || 'Менеджер',
        createdAt: serverTimestamp()
      });

      toast.success('Операция успешно удалена');
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при удалении операции');
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
        headers = ['Артикул', 'Название', 'Категория', 'Клуб', 'Себестоимость', 'Цена продажи', 'Остаток', 'Мин. остаток'];
        rows = filteredProducts.map(p => [
          p.sku || '', p.name, p.category, p.club, p.costPrice, p.salePrice, p.stock, p.minStock
        ]);
      } else {
        headers = ['Артикул', 'Название', 'Категория', 'Клуб', 'Цена продажи', 'Остаток'];
        rows = filteredProducts.map(p => [
          p.sku || '', p.name, p.category, p.club, p.salePrice, p.stock
        ]);
      }
    } else if (activeTab === 'logs') {
      headers = ['Дата', 'Клуб', 'Операция', 'Детали', 'Исполнитель'];
      rows = filteredLogs.map(log => {
        const dateObj = log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000) : new Date();
        return [
          dateObj.toLocaleString('ru-RU'), log.club, log.type === 'delete' ? 'Удаление' : log.type === 'resort' ? 'Пересорт' : log.type === 'supply' ? 'Поставка' : 'Добавление', log.details, log.cashierName
        ];
      });
    } else {
      if (isChef) {
        headers = ['Дата', 'Клуб', 'Товар', 'Артикул', 'Категория', 'Количество', 'Себестоимость', 'Цена продажи', 'Сумма чека', 'Прибыль', 'Оплата', 'Клиент', 'Провел'];
        rows = filteredSales.map(s => {
          const dateObj = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : new Date();
          return [
            dateObj.toLocaleString('ru-RU'), s.club, s.productName, s.sku || '', s.category, s.qty, s.costPrice, s.salePrice, s.totalSum, s.netProfit, s.paymentMethod, s.clientName, s.cashierName
          ];
        });
      } else {
        headers = ['Дата', 'Клуб', 'Товар', 'Артикул', 'Категория', 'Количество', 'Цена продажи', 'Сумма чека', 'Оплата', 'Клиент', 'Провел'];
        rows = filteredSales.map(s => {
          const dateObj = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : new Date();
          return [
            dateObj.toLocaleString('ru-RU'), s.club, s.productName, s.sku || '', s.category, s.qty, s.salePrice, s.totalSum, s.paymentMethod, s.clientName, s.cashierName
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

  const uniqueSkus = useMemo(() => {
    const skus = new Set();
    products.forEach(p => {
      if (p.sku) skus.add(p.sku);
    });
    return Array.from(skus).sort();
  }, [products]);

  // ─── Filtered Data ─────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const list = products.filter(p => {
      const matchClub = selectedClub === 'ALL' || p.club === selectedClub;
      const matchSku = selectedSku === 'ALL' || p.sku === selectedSku;
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
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
      const matchClub = selectedClub === 'ALL' || s.club === selectedClub;
      const matchSku = selectedSku === 'ALL' || s.sku === selectedSku;
      const matchSearch = s.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.cashierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (s.sku && s.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      
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

  const filteredLogs = useMemo(() => {
    return historyLogs.filter(log => {
      const matchClub = selectedClub === 'ALL' || log.club === selectedClub;
      const matchSku = selectedSku === 'ALL' || (log.details && log.details.includes(`[Арт: ${selectedSku}]`));
      const matchSearch = log.productName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.details?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.cashierName?.toLowerCase().includes(searchTerm.toLowerCase());
      
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
      if (s.qty > 0) {
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
            {canSelectAllClubs ? (
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
          {(isChef || !!managerClub) && !isMarketing && (
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
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
        ) : isChef ? (
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
          {!isMarketing && (
            <>
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
              <button
                onClick={() => setActiveTab('logs')}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'logs' ? 'bg-[var(--accent-purple)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
              >
                <ClipboardList size={14} /> Логи операций
              </button>
              {/* Sales totals tab */}
              {selectedClub !== 'ALL' && (
                <button
                  onClick={() => setActiveTab('nurly-sales')}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'nurly-sales' ? 'bg-purple-600 text-white shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                >
                  <TrendingUp size={14} /> Итого продаж
                </button>
              )}
            </>
          )}
        </div>

        {/* Search Input & CSV Export */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Date Range Selector */}
          <div className="flex items-center gap-2 bg-[var(--bg-card)] px-3 py-2 rounded-2xl border border-[var(--border)] shadow-md h-[42px]">
            <input 
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              onClick={e => { try { e.target.showPicker(); } catch(err) {} }}
              className="bg-transparent border-none outline-none text-xs font-bold text-[var(--text-primary)] w-[115px] cursor-pointer"
              title="Начало периода"
            />
            <span className="text-[var(--text-muted)] text-xs">—</span>
            <input 
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              onClick={e => { try { e.target.showPicker(); } catch(err) {} }}
              className="bg-transparent border-none outline-none text-xs font-bold text-[var(--text-primary)] w-[115px] cursor-pointer"
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
              className="bg-[var(--bg-card)] px-3 py-2 rounded-2xl border border-[var(--border)] text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent-purple)] h-[42px] cursor-pointer"
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
            title="Экспортировать отчет в CSV (Excel)"
            className="p-2.5 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-2xl border border-[var(--border)] flex items-center justify-center transition-all shadow-md h-[42px] w-[42px] shrink-0"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Content Body */}
      {activeTab === 'nurly-sales' ? (
        /* --- SALES TOTALS TAB --- */
        (() => {
          const activeClubForSales = selectedClub;
          const nurlySales = sales.filter(s => s.club === activeClubForSales && (s.qty || 0) > 0);
          // Filter by date range if set
          const filtered = nurlySales.filter(s => {
            if (!s.createdAt?.seconds) return true;
            const d = new Date(s.createdAt.seconds * 1000);
            const dateStr = d.toISOString().slice(0, 10);
            if (startDate && dateStr < startDate) return false;
            if (endDate && dateStr > endDate) return false;
            return true;
          });
          // Group by salespersonName (supporting up to 2 admins per sale, optionally auto-distributing by schedule)
          const byPerson = {};
          filtered.forEach(s => {
            let names = [];
            if (autoDistributeBySchedule && s.createdAt?.seconds) {
              const saleDate = new Date(s.createdAt.seconds * 1000);
              names = getAdminsWorkingAt(saleDate, s.club);
            }
            if (names.length === 0) {
              const rawName = s.salespersonName || 'Не указан';
              names = rawName.split(',').map(n => n.trim()).filter(Boolean);
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
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(139,92,246,0.02))' }}>
                <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#8b5cf6', letterSpacing: '0.08em', marginBottom: 4 }}>{activeClubForSales} · Общая сумма продаж</div>
                <div style={{ fontSize: 32, fontWeight: 950, color: '#8b5cf6' }}>{grandTotal.toLocaleString('ru-RU')} ₸</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{filtered.length} продаж · {Object.keys(byPerson).length} сотрудников{startDate || endDate ? ` · фильтр: ${startDate || '...'} — ${endDate || '...сейчас'}` : ''}</div>
              </div>
              
              {/* Auto distribute toggle */}
              <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                  <input 
                    type="checkbox"
                    checked={autoDistributeBySchedule}
                    onChange={(e) => setAutoDistributeBySchedule(e.target.checked)}
                    style={{ width: 15, height: 15, accentColor: '#8b5cf6', cursor: 'pointer', borderRadius: 4 }}
                  />
                  <span>Распределять продажи по графику смен (по дате и времени смены)</span>
                </label>
              </div>
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
                    const rate = commissionRates[name] || '';
                    const parsedRate = parseFloat(rate) || 0;
                    const award = Math.round((data.total * parsedRate) / 100);
                    // Check if this person is a service employee — no commission for them
                    const empRecord = clubEmployees.find(e => e.name.trim().toLowerCase() === name.trim().toLowerCase());
                    const nLower = name.trim().toLowerCase();
                    const isServicePerson = empRecord?.isService === true || nLower.includes('сервис') || nLower.includes('техник') || nLower.includes('стажер');
                    return (
                      <div key={name} style={{ background: 'var(--bg-hover)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#8b5cf6' }}>
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: '4px 8px', height: '36px' }}>
                                <input 
                                  type="number" 
                                  placeholder="0" 
                                  min="0"
                                  max="100"
                                  value={rate}
                                  onChange={async (e) => {
                                    const val = e.target.value;
                                    setCommissionRates(prev => ({ ...prev, [name]: val }));
                                    
                                    const emp = clubEmployees.find(empObj => empObj.name.trim().toLowerCase() === name.trim().toLowerCase());
                                    if (emp) {
                                      try {
                                        const { doc: fsDoc, updateDoc: fsUpdateDoc } = await import('firebase/firestore');
                                        await fsUpdateDoc(fsDoc(db, 'employees', emp.id), {
                                          commissionRate: val === '' ? null : parseFloat(val)
                                        });
                                      } catch (err) {
                                        console.error('Error saving commission rate:', err);
                                      }
                                    }
                                  }}
                                  style={{ width: 36, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 12, fontWeight: 800, outline: 'none', textAlign: 'center' }} 
                                />
                                <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)' }}>%</span>
                              </div>
                            )}
                            
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 15, fontWeight: 950, color: '#8b5cf6' }}>{data.total.toLocaleString('ru-RU')} ₸</div>
                              {!isServicePerson && parsedRate > 0 && (
                                <div style={{ fontSize: 11, fontWeight: 900, color: '#10b981', marginTop: 1 }}>
                                  Награда: {award.toLocaleString('ru-RU')} ₸
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
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 6, borderLeft: '2px solid rgba(139,92,246,0.2)' }}>
                              {data.sales.map(s => {
                                const sDate = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : new Date();
                                return (
                                  <div key={s.id} className="flex items-center justify-between text-xs py-1 hover:bg-[var(--bg-primary)] rounded px-1">
                                    <div className="flex flex-col">
                                      <span className="font-extrabold text-[var(--text-primary)]">{s.productName} ({s.qty} шт)</span>
                                      <span className="text-[9px] text-[var(--text-muted)]">
                                        {sDate.toLocaleDateString('ru-RU')} в {sDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · {s.paymentMethod}
                                        {s.salespersonName && ` · В чекбоксе: ${s.salespersonName}`}
                                        {autoDistributeBySchedule && s.autoNames && ` · По графику: ${s.autoNames.join(', ')}`}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-emerald-400">{(s.totalSum || 0).toLocaleString()} ₸</span>
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
                        {isChef && (
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
                            {!isMarketing && (
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
                                    freeReason: 'Бартер'
                                  });
                                  setShowSaleModal(true);
                                }}
                                className={`flex items-center gap-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase border transition-all ${isOut ? 'bg-gray-500/10 text-gray-500 border-gray-500/10 cursor-not-allowed' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'}`}
                              >
                                <ShoppingCart size={11} /> Продать
                              </button>
                            )}

                            {!isMarketing && (isChef || (managerClub && p.club === managerClub)) && (
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
                          <button
                            onClick={() => handleDeleteSale(s)}
                            className="p-2 bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-red-500 rounded-lg border border-[var(--border)] transition-all"
                            title="Удалить операцию"
                          >
                            <Trash2 size={12} />
                          </button>
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
      {showProductModal && (isChef || !!managerClub) && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-md relative flex flex-col" style={{maxHeight: '90vh'}}>
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

            <form onSubmit={handleSaveProduct} className="p-5 space-y-4 overflow-y-auto">
              
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-sm relative flex flex-col" style={{maxHeight: '90vh'}}>
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

            <form onSubmit={handleCreateSale} className="p-5 space-y-4 overflow-y-auto">
              
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
                  <label className="text-[10px] font-black uppercase tracking-wider text-[#8b5cf6] block mb-1.5 flex items-center gap-1.5">
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
                            className={`py-1.5 px-2.5 rounded-xl text-[10px] font-black transition-all border text-left flex flex-col ${isSel ? 'bg-purple-600/15 text-[#8b5cf6] border-[#8b5cf6]' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
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
      {showSupplyModal && selectedProductForSupply && (isChef || (managerClub && selectedProductForSupply.club === managerClub)) && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-sm relative flex flex-col" style={{maxHeight: '90vh'}}>
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

            <form onSubmit={handleAddSupply} className="p-5 space-y-4 overflow-y-auto">
              
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
      , document.body)}

    </div>
  );
};

export default MerchPage;
