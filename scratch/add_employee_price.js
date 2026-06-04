import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── 1. MODIFY MERCHPAGE.JSX ──────────────────────────────────────────────────
const merchPath = path.join(__dirname, '../src/pages/MerchPage.jsx');
let merchContent = fs.readFileSync(merchPath, 'utf8').replace(/\r\n/g, '\n');

// Update productForm initial state
const formOld = `  // Form States (New / Edit Product)
  const [productForm, setProductForm] = useState({
    name: '',
    club: '4YOU',
    category: 'Худи',
    costPrice: '',
    salePrice: '',
    stock: '',
    minStock: '5'
  });`;

const formNew = `  // Form States (New / Edit Product)
  const [productForm, setProductForm] = useState({
    name: '',
    club: '4YOU',
    category: 'Худи',
    costPrice: '',
    salePrice: '',
    employeePrice: '',
    stock: '',
    minStock: '5'
  });`;

if (!merchContent.includes(formOld)) {
  console.error("MerchPage: Form initial state target not found!");
  process.exit(1);
}
merchContent = merchContent.replace(formOld, formNew);

// Update product editing reset:
const editResetOld = `                                    setProductForm({
                                      name: p.name,
                                      club: p.club,
                                      category: p.category,
                                      costPrice: String(p.costPrice || ''),
                                      salePrice: String(p.salePrice || ''),
                                      stock: String(p.stock || ''),
                                      minStock: String(p.minStock || '')
                                    });`;

const editResetNew = `                                    setProductForm({
                                      name: p.name,
                                      club: p.club,
                                      category: p.category,
                                      costPrice: String(p.costPrice || ''),
                                      salePrice: String(p.salePrice || ''),
                                      employeePrice: String(p.employeePrice || ''),
                                      stock: String(p.stock || ''),
                                      minStock: String(p.minStock || '')
                                    });`;

if (!merchContent.includes(editResetOld)) {
  console.error("MerchPage: Edit reset target not found!");
  process.exit(1);
}
merchContent = merchContent.replace(editResetOld, editResetNew);

// Update handleSaveProduct:
const saveProductOld = `    const cost = isChef 
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
      stock: editingProduct ? editingProduct.stock : initialStock,
      minStock: min,
      updatedAt: serverTimestamp()
    };`;

const saveProductNew = `    const cost = isChef 
      ? (parseFloat(productForm.costPrice) || 0) 
      : (editingProduct ? (editingProduct.costPrice || 0) : 0);
    const sale = parseFloat(productForm.salePrice) || 0;
    const employee = parseFloat(productForm.employeePrice) || 0;
    const initialStock = parseInt(productForm.stock) || 0;
    const min = parseInt(productForm.minStock) || 0;

    const data = {
      name: productForm.name.trim(),
      club: productForm.club,
      category: productForm.category,
      costPrice: cost,
      salePrice: sale,
      employeePrice: employee,
      stock: editingProduct ? editingProduct.stock : initialStock,
      minStock: min,
      updatedAt: serverTimestamp()
    };`;

if (!merchContent.includes(saveProductOld)) {
  console.error("MerchPage: handleSaveProduct target not found!");
  process.exit(1);
}
merchContent = merchContent.replace(saveProductOld, saveProductNew);

// Update inventory table headers:
const tableHeaderOld = `                    {isChef && <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-right">Себестоимость</th>}
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-right">Цена продажи</th>`;

const tableHeaderNew = `                    {isChef && <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-right">Себестоимость</th>}
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-right">Цена сотрудника</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest text-right">Цена продажи</th>`;

if (!merchContent.includes(tableHeaderOld)) {
  console.error("MerchPage: tableHeaderOld target not found!");
  process.exit(1);
}
merchContent = merchContent.replace(tableHeaderOld, tableHeaderNew);

// Update inventory table row data rendering:
const tableRowOld = `                        {isChef && (
                          <td className="px-6 py-4 text-right">
                            <span className="font-bold text-xs text-[var(--text-secondary)]">{(p.costPrice || 0).toLocaleString()} ₸</span>
                          </td>
                        )}
                        <td className="px-6 py-4 text-right">
                          <span className="font-extrabold text-sm text-emerald-400">{(p.salePrice || 0).toLocaleString()} ₸</span>
                        </td>`;

const tableRowNew = `                        {isChef && (
                          <td className="px-6 py-4 text-right">
                            <span className="font-bold text-xs text-[var(--text-secondary)]">{(p.costPrice || 0).toLocaleString()} ₸</span>
                          </td>
                        )}
                        <td className="px-6 py-4 text-right">
                          <span className="font-semibold text-xs text-purple-400">{(p.employeePrice || 0).toLocaleString()} ₸</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-extrabold text-sm text-emerald-400">{(p.salePrice || 0).toLocaleString()} ₸</span>
                        </td>`;

if (!merchContent.includes(tableRowOld)) {
  console.error("MerchPage: tableRowOld target not found!");
  process.exit(1);
}
merchContent = merchContent.replace(tableRowOld, tableRowNew);

// Update product form modal UI to add the employeePrice field:
// Note: standard managers can also see/edit it, so we display employeePrice for both chef and manager.
const formUIOld = `              <div className="grid grid-cols-2 gap-4">
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
              </div>`;

const formUINew = `              {isChef ? (
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
              )}`;

if (!merchContent.includes(formUIOld)) {
  console.error("MerchPage: formUIOld target not found!");
  process.exit(1);
}
merchContent = merchContent.replace(formUIOld, formUINew);

// Update buyerType switcher in MerchPage Sale Modal to handle setting custom price to employeePrice or salePrice
const switcherOld = `              {/* Buyer Type Switcher */}
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
              </div>`;

const switcherNew = `              {/* Buyer Type Switcher */}
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
              </div>`;

if (!merchContent.includes(switcherOld)) {
  console.error("MerchPage: switcherOld target not found!");
  process.exit(1);
}
merchContent = merchContent.replace(switcherOld, switcherNew);

fs.writeFileSync(merchPath, merchContent, 'utf8');
console.log("MerchPage configured successfully!");


// ─── 2. MODIFY SALESPAGE.JSX ──────────────────────────────────────────────────
const salesPath = path.join(__dirname, '../src/pages/SalesPage.jsx');
let salesContent = fs.readFileSync(salesPath, 'utf8').replace(/\r\n/g, '\n');

// Update when selecting product to set correct customPrice
const clickOld = `                    <button key={p.id} onClick={() => { if (!isOut) { setSelectedProduct(p); setQty(1); setCustomPrice(String(p.salePrice || 0)); setBuyerType('client'); setBuyerName(''); setNotes(''); } }} disabled={isOut}`;
const clickNew = `                    <button key={p.id} onClick={() => { if (!isOut) { setSelectedProduct(p); setQty(1); setCustomPrice(String(p.salePrice || 0)); setBuyerType('client'); setBuyerName(''); setNotes(''); } }} disabled={isOut}`;

// Actually it's already updated, but let's update buyer switcher inside SalesPage:
const switcherTarget = `                {/* Buyer Type (Client/Employee) Switcher */}
                {!isFree && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <button type="button" onClick={() => setBuyerType('client')}
                      style={{
                        flex: 1, padding: '6px', borderRadius: 9, fontSize: 10, fontWeight: 800,
                        border: \`1px solid \${buyerType === 'client' ? accentColor : 'var(--border)'}\`,
                        background: buyerType === 'client' ? \`\${accentColor}12\` : 'var(--bg-hover)',
                        color: buyerType === 'client' ? accentColor : 'var(--text-secondary)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>Клиент</button>
                    <button type="button" onClick={() => setBuyerType('employee')}
                      style={{
                        flex: 1, padding: '6px', borderRadius: 9, fontSize: 10, fontWeight: 800,
                        border: \`1px solid \${buyerType === 'employee' ? accentColor : 'var(--border)'}\`,
                        background: buyerType === 'employee' ? \`\${accentColor}12\` : 'var(--bg-hover)',
                        color: buyerType === 'employee' ? accentColor : 'var(--text-secondary)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>Сотрудник</button>
                  </div>
                )}`;

const switcherReplacement = `                {/* Buyer Type (Client/Employee) Switcher */}
                {!isFree && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <button type="button" onClick={() => { setBuyerType('client'); setCustomPrice(String(selectedProduct.salePrice || 0)); }}
                      style={{
                        flex: 1, padding: '6px', borderRadius: 9, fontSize: 10, fontWeight: 800,
                        border: \`1px solid \${buyerType === 'client' ? accentColor : 'var(--border)'}\`,
                        background: buyerType === 'client' ? \`\${accentColor}12\` : 'var(--bg-hover)',
                        color: buyerType === 'client' ? accentColor : 'var(--text-secondary)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>Клиент</button>
                    <button type="button" onClick={() => { setBuyerType('employee'); setCustomPrice(String(selectedProduct.employeePrice || selectedProduct.salePrice || 0)); }}
                      style={{
                        flex: 1, padding: '6px', borderRadius: 9, fontSize: 10, fontWeight: 800,
                        border: \`1px solid \${buyerType === 'employee' ? accentColor : 'var(--border)'}\`,
                        background: buyerType === 'employee' ? \`\${accentColor}12\` : 'var(--bg-hover)',
                        color: buyerType === 'employee' ? accentColor : 'var(--text-secondary)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>Сотрудник</button>
                  </div>
                )}`;

if (!salesContent.includes(switcherTarget)) {
  console.error("SalesPage: switcherTarget not found!");
  process.exit(1);
}
salesContent = salesContent.replace(switcherTarget, switcherReplacement);

// Also let's update CSV export headers in MerchPage if needed. Let's see if isChef CSV headers need to be updated.
// The user only asked for "прописываться должны в продажах и на складе". Yes, showing it on screen is the most important.

fs.writeFileSync(salesPath, salesContent, 'utf8');
console.log("SalesPage configured successfully!");
