import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../src/pages/MerchPage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalizing CRLF
content = content.replace(/\r\n/g, '\n');

// 1. Update the saleForm state declaration:
const stateOld = `  // Form States (New Sale)
  const [saleForm, setSaleForm] = useState({
    qty: '1',
    paymentMethod: 'Kaspi',
    clientName: ''
  });`;

const stateNew = `  // Form States (New Sale)
  const [saleForm, setSaleForm] = useState({
    qty: '1',
    paymentMethod: 'Kaspi',
    clientName: '',
    buyerType: 'client',
    customPrice: '',
    notes: ''
  });`;

if (!content.includes(stateOld)) {
  console.error("State declaration target not found!");
  process.exit(1);
}
content = content.replace(stateOld, stateNew);


// 2. Update the sell button click handler where we initialize setSaleForm:
const clickOld = `                              onClick={() => {
                                setSelectedProductForSale(p);
                                setShowSaleModal(true);
                              }}`;

const clickNew = `                              onClick={() => {
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

if (!content.includes(clickOld)) {
  console.error("Sell button click handler target not found!");
  process.exit(1);
}
content = content.replace(clickOld, clickNew);


// 3. Update handleCreateSale:
const handleSaleOld = `  const handleCreateSale = async (e) => {
    e.preventDefault();
    const qty = parseInt(saleForm.qty) || 0;
    if (qty <= 0) return toast.error('Укажите корректное количество');
    if (qty > selectedProductForSale.stock) return toast.error(\`Недостаточно товара на складе (в наличии: \${selectedProductForSale.stock} шт)\`);

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
  };`;

const handleSaleNew = `  const handleCreateSale = async (e) => {
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

if (!content.includes(handleSaleOld)) {
  console.error("handleCreateSale target not found!");
  process.exit(1);
}
content = content.replace(handleSaleOld, handleSaleNew);


// 4. Update the sales history table row to display employee tag and comments (notes):
const tableOld = `                          {s.clientName && s.clientName !== 'Гость' && (
                            <span className="text-[10px] text-[var(--text-muted)] block mt-0.5">Клиент: {s.clientName}</span>
                          )}`;

const tableNew = `                          {s.clientName && s.clientName !== 'Гость' && (
                            <span className="text-[10px] text-[var(--text-muted)] block mt-0.5">
                              {s.buyerType === 'employee' ? 'Сотрудник: ' : 'Клиент: '}{s.clientName}
                            </span>
                          )}
                          {s.notes && (
                            <span className="text-[10px] italic text-purple-400 block mt-0.5 bg-purple-500/5 py-0.5 px-1.5 rounded w-fit border border-purple-500/10">
                              💬 {s.notes}
                            </span>
                          )}`;

if (!content.includes(tableOld)) {
  console.error("Sales history table row target not found!");
  process.exit(1);
}
content = content.replace(tableOld, tableNew);


// 5. Update the MODAL: RECORD A SALE UI body:
const modalUIOld = `              <div className="grid grid-cols-2 gap-4">
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
              </div>`;

const modalUINew = `              {/* Buyer Type Switcher */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Кто покупает?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSaleForm({ ...saleForm, buyerType: 'client' })}
                    className={\`py-2 px-3 rounded-xl text-xs font-bold border transition-all \${saleForm.buyerType === 'client' ? 'bg-[var(--accent-purple)] text-white border-[var(--accent-purple)] shadow-sm' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}\`}
                  >
                    Клиент
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaleForm({ ...saleForm, buyerType: 'employee' })}
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

              <div>
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

              {/* Total Calculation Display */}
              <div className="pt-2 flex items-center justify-between border-t border-[var(--border)]">
                <span className="text-xs font-bold text-[var(--text-muted)] uppercase">Итого к оплате:</span>
                <span className="text-lg font-black text-emerald-400">
                  {((parseInt(saleForm.qty) || 0) * (parseFloat(saleForm.customPrice) || 0)).toLocaleString()} ₸
                </span>
              </div>`;

if (!content.includes(modalUIOld)) {
  console.error("Modal UI target not found!");
  process.exit(1);
}
content = content.replace(modalUIOld, modalUINew);


fs.writeFileSync(filePath, content, 'utf8');
console.log("Sale modal customization applied successfully!");
