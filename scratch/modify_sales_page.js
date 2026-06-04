import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../src/pages/SalesPage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalizing CRLF
content = content.replace(/\r\n/g, '\n');

// 1. Add state variables:
const stateOld = `  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);`;

const stateNew = `  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [buyerType, setBuyerType] = useState('client');
  const [customPrice, setCustomPrice] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [notes, setNotes] = useState('');`;

if (!content.includes(stateOld)) {
  console.error("State target not found!");
  process.exit(1);
}
content = content.replace(stateOld, stateNew);


// 2. Update when selecting product (handling spaces correctly):
const selectOld = `                <button key={p.id} onClick={() => { if (!isOut) { setSelectedProduct(p); setQty(1); } }} disabled={isOut}`;
const selectNew = `                <button key={p.id} onClick={() => { if (!isOut) { setSelectedProduct(p); setQty(1); setCustomPrice(String(p.salePrice || 0)); setBuyerType('client'); setBuyerName(''); setNotes(''); } }} disabled={isOut}`;

if (!content.includes(selectOld)) {
  console.error("Select handler target not found!");
  process.exit(1);
}
content = content.replace(selectOld, selectNew);


// 3. Update saleTotal:
const totalOld = `  const saleTotal = isFree ? 0 : (selectedProduct ? (selectedProduct.salePrice || 0) * qty : 0);`;
const totalNew = `  const currentSalePrice = isFree ? 0 : (customPrice !== '' ? (parseFloat(customPrice) || 0) : (selectedProduct?.salePrice || 0));
  const saleTotal = currentSalePrice * qty;`;

if (!content.includes(totalOld)) {
  console.error("saleTotal calculation target not found!");
  process.exit(1);
}
content = content.replace(totalOld, totalNew);


// 4. Update handleSubmit:
const submitOld = `  const handleSubmit = async () => {
    if (!selectedProduct) return toast.error('Выберите товар');
    if (qty <= 0) return toast.error('Укажите количество');
    if (qty > selectedProduct.stock) return toast.error(\`Недостаточно товара (в наличии: \${selectedProduct.stock} шт)\`);
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'merch_sales'), {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        category: selectedProduct.category || '',
        club: activeClub,
        qty,
        costPrice: selectedProduct.costPrice || 0,
        salePrice: isFree ? 0 : (selectedProduct.salePrice || 0),
        totalSum: saleTotal,
        netProfit: isFree ? -(selectedProduct.costPrice || 0) * qty : saleTotal - (selectedProduct.costPrice || 0) * qty,
        paymentMethod: isFree ? freeReason : paymentMethod,
        isFree,
        clientName: 'Гость',
        cashierName: user?.name || user?.email || 'Менеджер',
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'merch_products', selectedProduct.id), {
        stock: increment(-qty),
        updatedAt: serverTimestamp(),
      });
      toast.success(\`\${isFree ? '🎁 Бесплатно' : '✅ Продажа'}: \${selectedProduct.name} × \${qty}\`);
      setSelectedProduct(null);
      setQty(1);
      setSearch('');
      setIsFree(false);
    } catch (err) {`;

const submitNew = `  const handleSubmit = async () => {
    if (!selectedProduct) return toast.error('Выберите товар');
    if (qty <= 0) return toast.error('Укажите количество');
    if (qty > selectedProduct.stock) return toast.error(\`Недостаточно товара (в наличии: \${selectedProduct.stock} шт)\`);
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
      toast.success(\`\${isFree ? '🎁 Бесплатно' : '✅ Продажа'}: \${selectedProduct.name} × \${qty}\`);
      setSelectedProduct(null);
      setQty(1);
      setSearch('');
      setIsFree(false);
      setCustomPrice('');
      setBuyerType('client');
      setBuyerName('');
      setNotes('');
    } catch (err) {`;

if (!content.includes(submitOld)) {
  console.error("handleSubmit target not found!");
  process.exit(1);
}
content = content.replace(submitOld, submitNew);


// 5. Update the form UI inside the panel (handling camelCase check):
const uiTarget = `                {/* Free reason OR payment method */}
                {isFree ? (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                    {FREE_REASONS.map(r => (
                      <button key={r} onClick={() => setFreeReason(r)}
                        style={{
                          padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 800,
                          border: \`1px solid \${freeReason === r ? '#f59e0b' : 'var(--border)'}\`,
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
                          border: \`1px solid \${paymentMethod === m ? accentColor : 'var(--border)'}\`,
                          background: paymentMethod === m ? \`\${accentColor}12\` : 'var(--bg-hover)',
                          color: paymentMethod === m ? accentColor : 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}>{m}</button>
                    ))}
                  </div>
                )}

                {/* Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Итого</span>
                  <span style={{ fontSize: 18, fontWeight: 950, color: isFree ? '#f59e0b' : accentColor }}>
                    {isFree ? '🎁 0 ₸' : \`\${saleTotal.toLocaleString()} ₸\`}
                  </span>
                </div>`;

const uiReplacement = `                {/* Buyer Type (Client/Employee) Switcher */}
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
                )}

                {/* Free reason OR payment method */}
                {isFree ? (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                    {FREE_REASONS.map(r => (
                      <button key={r} onClick={() => setFreeReason(r)}
                        style={{
                          padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 800,
                          border: \`1px solid \${freeReason === r ? '#f59e0b' : 'var(--border)'}\`,
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
                          border: \`1px solid \${paymentMethod === m ? accentColor : 'var(--border)'}\`,
                          background: paymentMethod === m ? \`\${accentColor}12\` : 'var(--bg-hover)',
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
                    {isFree ? '🎁 0 ₸' : \`\${saleTotal.toLocaleString()} ₸\`}
                  </span>
                </div>`;

if (!content.includes(uiTarget)) {
  console.error("UI target code not found!");
  process.exit(1);
}
content = content.replace(uiTarget, uiReplacement);


// 6. Update today's sales log:
const logOld = `                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.isFree ? '🎁 ' : ''}{s.productName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.qty} шт · {s.paymentMethod}</div>
                  </div>`;

const logNew = `                  <div style={{ flex: 1, minWidth: 0 }}>
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
                  </div>`;

if (!content.includes(logOld)) {
  console.error("Log target not found!");
  process.exit(1);
}
content = content.replace(logOld, logNew);


fs.writeFileSync(filePath, content, 'utf8');
console.log("SalesPage customized successfully!");
