import { FieldPath, Timestamp } from 'firebase-admin/firestore'
import { timingSafeEqual } from 'node:crypto'

// Выгрузка склада и журнала мерча для зеркала в платформе маркетинга.
// Папка `_lib` не становится функцией Vercel — тут вся логика, а
// `api/merch-sync.js` только подключает firebase-admin.
// Контракт и правила опроса: docs/merch-sync-api.md
// Модель данных сверена с прод-сборкой (ticket-tracker-inky.vercel.app) на
// 15.10.2026 — там есть размеры, возвраты и перемещения, которых нет в GitHub.

export const DEFAULT_LIMIT = 1000
export const MAX_LIMIT = 2000

// Возвраты и перемещения помечаются временем по часам браузера
// (`new Date().toISOString()`), а не сервера. Их ищем с запасом на
// расхождение часов; повторная выдача тех же записей безопасна (upsert по id).
export const CLIENT_CLOCK_SLACK_MS = 15 * 60 * 1000

export class BadRequestError extends Error {}

// Как приложение пишет журнал merch_sales (MerchPage.jsx, SalesPage.jsx):
// продажа — qty > 0; поставка («Складская поставка») — единственная запись
// с qty < 0, кроме пересорта; пересорт — «Пересорт», qty = факт минус было;
// бесплатная выдача — isFree, а причина лежит в paymentMethod. Возврат не
// удаляет продажу, а ставит returned + returnedAtISO и возвращает остаток.
const ADJUSTMENT_METHOD = 'Пересорт'
const FREE_REASONS = ['Бартер', 'Победитель', 'Маркетинг', 'Подарок', 'Другое']

// Только нужные поля: фото товара (base64) и личные данные покупателя не читаем
const PRODUCT_FIELDS = ['name', 'sku', 'club', 'category', 'costPrice', 'salePrice', 'employeePrice', 'stock', 'minStock', 'sizes', 'createdAt', 'updatedAt']
const MOVEMENT_FIELDS = ['productId', 'productName', 'size', 'sku', 'category', 'club', 'qty', 'costPrice', 'salePrice', 'totalSum', 'netProfit', 'paymentMethod', 'isFree', 'buyerType', 'returned', 'returnedAtISO', 'createdAt']
const TRANSFER_FIELDS = ['productId', 'productName', 'sku', 'category', 'size', 'fromClub', 'toClub', 'qty', 'receivedQty', 'status', 'createdAtISO', 'resolvedAtISO']
const HISTORY_FIELDS = ['type', 'productId', 'saleId']

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const toIso = (v) => (v instanceof Timestamp ? v.toDate().toISOString() : null)
const isoToIso = (v) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}
const compareTs = (a, b) => a.seconds - b.seconds || a.nanoseconds - b.nanoseconds
const minTs = (...list) => list.reduce((a, b) => (compareTs(a, b) <= 0 ? a : b))

export function toProduct(id, d) {
  const stock = num(d.stock)
  const minStock = num(d.minStock)
  const sizes = d.sizes && typeof d.sizes === 'object' && Object.keys(d.sizes).length > 0
    ? Object.fromEntries(Object.entries(d.sizes).map(([size, count]) => [size, num(count)]))
    : null
  return {
    id,
    club: d.club ?? null,
    name: d.name ?? '',
    sku: d.sku || null,
    category: d.category ?? null,
    costPrice: num(d.costPrice),
    salePrice: num(d.salePrice),
    employeePrice: num(d.employeePrice),
    stock,
    minStock,
    isLowStock: stock <= minStock,
    sizes,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  }
}

export function toMovement(id, d) {
  const rawQty = num(d.qty)
  const method = d.paymentMethod ?? null
  let type
  if (method === ADJUSTMENT_METHOD) type = 'adjustment'
  else if (rawQty < 0) type = 'supply'
  // Записи до появления isFree узнаём по причине выдачи
  else if (d.isFree === true || (d.isFree === undefined && FREE_REASONS.includes(method))) type = 'free'
  else type = 'sale'

  const isOutflow = type === 'sale' || type === 'free'
  // Возвращённая продажа остаётся в журнале, но в деньгах и остатке её нет —
  // так же считает и само приложение
  const returned = isOutflow && d.returned === true
  return {
    id,
    productId: d.productId ?? null,
    productName: d.productName ?? '',
    sku: d.sku || null,
    category: d.category || null,
    club: d.club ?? null,
    size: d.size || null,
    type,
    qty: Math.abs(rawQty),
    // У пересорта qty уже со знаком остатка, у остальных знак обратный
    stockDelta: returned ? 0 : type === 'adjustment' ? rawQty : -rawQty,
    unitPrice: num(d.salePrice),
    unitCost: num(d.costPrice),
    revenue: type === 'sale' && !returned ? num(d.totalSum) : 0,
    netProfit: isOutflow && !returned ? num(d.netProfit) : 0,
    paymentMethod: type === 'sale' ? method : null,
    freeReason: type === 'free' ? method : null,
    buyerType: isOutflow ? (d.buyerType ?? 'client') : null,
    returned,
    returnedAt: returned ? isoToIso(d.returnedAtISO) : null,
    createdAt: toIso(d.createdAt),
  }
}

// Перемещение между складами (merch_transfers): при создании товар сразу
// списывается у отправителя, у получателя появляется только после приёмки
// (status accepted, receivedQty может быть меньше qty); при отказе — rejected,
// товар возвращается отправителю. Сами остатки уже видны в products.
export function toTransfer(id, d) {
  return {
    id,
    productId: d.productId ?? null,
    productName: d.productName ?? '',
    sku: d.sku || null,
    category: d.category || null,
    size: d.size || null,
    fromClub: d.fromClub ?? null,
    toClub: d.toClub ?? null,
    qty: num(d.qty),
    receivedQty: d.receivedQty === undefined || d.receivedQty === null ? null : num(d.receivedQty),
    status: d.status ?? null,
    createdAt: isoToIso(d.createdAtISO),
    resolvedAt: isoToIso(d.resolvedAtISO),
  }
}

// ─── Курсор ──────────────────────────────────────────────────────────────────
// Метки берутся из Firestore (readTime запроса и createdAt последней записи),
// а не из часов Vercel: всё, что закоммичено позже, гарантированно новее.
const tsToPair = (t) => [t.seconds, t.nanoseconds]

const pairToTs = (p) => {
  if (!Array.isArray(p) || p.length < 2) throw new BadRequestError('cursor: повреждён')
  const [s, n] = p
  if (!Number.isInteger(s) || !Number.isInteger(n) || n < 0 || n > 999999999) {
    throw new BadRequestError('cursor: повреждён')
  }
  return new Timestamp(s, n)
}

// products/history — readTime прошлых чтений; clientTime — от него с запасом
// ищутся возвраты и перемещения; movement — последнее отданное движение.
export function encodeCursor({ products, history, clientTime, movement }) {
  return Buffer.from(JSON.stringify({
    v: 1,
    p: tsToPair(products),
    h: tsToPair(history),
    c: tsToPair(clientTime),
    m: movement ? [...tsToPair(movement.ts), movement.id] : null,
  })).toString('base64url')
}

export function decodeCursor(raw) {
  if (typeof raw !== 'string' || !raw) throw new BadRequestError('cursor: ожидается строка из прошлого ответа')
  let c
  try {
    c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    throw new BadRequestError('cursor: повреждён')
  }
  if (!c || c.v !== 1) throw new BadRequestError('cursor: неизвестная версия')
  const products = pairToTs(c.p)
  const history = pairToTs(c.h)
  const clientTime = pairToTs(c.c)
  let movement = null
  if (c.m !== null) {
    if (!Array.isArray(c.m) || typeof c.m[2] !== 'string' || !c.m[2] || c.m[2].length > 1500) {
      throw new BadRequestError('cursor: повреждён')
    }
    movement = { ts: pairToTs(c.m), id: c.m[2] }
  }
  return { products, history, clientTime, movement }
}

export function parseLimit(raw) {
  if (raw === undefined || raw === '') return DEFAULT_LIMIT
  const n = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    throw new BadRequestError(`limit: целое от 1 до ${MAX_LIMIT}`)
  }
  return n
}

// ─── Сборка ответа ──────────────────────────────────────────────────────────
// state = null — полная выгрузка: все товары, перемещения и движения с начала,
// без удалений (получатель пересобирает зеркало). Иначе — изменения после курсора.
export async function buildSyncPayload(db, { state, limit }) {
  const products = state
    ? db.collection('merch_products').where('updatedAt', '>', state.products)
    : db.collection('merch_products')

  let movements = db.collection('merch_sales').orderBy('createdAt').orderBy(FieldPath.documentId())
  if (state?.movement) movements = movements.startAfter(state.movement.ts, state.movement.id)

  const sinceClientIso = state
    ? new Date(state.clientTime.toMillis() - CLIENT_CLOCK_SLACK_MS).toISOString()
    : null
  const changedSince = (collection, field, fields) =>
    db.collection(collection).where(field, '>', sinceClientIso).select(...fields).get()

  const [productsSnap, movementsSnap, historySnap, returnsSnap, ...transferSnaps] = await Promise.all([
    products.select(...PRODUCT_FIELDS).get(),
    movements.select(...MOVEMENT_FIELDS).limit(limit + 1).get(),
    state
      ? db.collection('merch_history').where('createdAt', '>', state.history).select(...HISTORY_FIELDS).get()
      : null,
    // Возврат меняет старую продажу, а не создаёт новую — в ленту по createdAt он не попадёт
    state ? changedSince('merch_sales', 'returnedAtISO', MOVEMENT_FIELDS) : null,
    ...(state
      ? [changedSince('merch_transfers', 'createdAtISO', TRANSFER_FIELDS), changedSince('merch_transfers', 'resolvedAtISO', TRANSFER_FIELDS)]
      : [db.collection('merch_transfers').select(...TRANSFER_FIELDS).get()]),
  ])

  const movementDocs = movementsSnap.docs.slice(0, limit)
  const last = movementDocs.at(-1)
  const pageIds = new Set(movementDocs.map(d => d.id))
  const returnedDocs = (returnsSnap?.docs ?? []).filter(d => !pageIds.has(d.id))

  const transfers = new Map()
  for (const snap of transferSnaps) for (const d of snap.docs) transfers.set(d.id, toTransfer(d.id, d.data()))
  const byCreated = (a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id)

  const deleted = { products: [], movements: [] }
  for (const doc of historySnap?.docs ?? []) {
    const h = doc.data()
    if (h.type === 'delete' && h.productId) deleted.products.push(h.productId)
    // saleId пишется с 15.10.2026; старые записи удаления без него не опознать
    if (h.type === 'delete_sale' && h.saleId) deleted.movements.push(h.saleId)
  }

  // При полной выгрузке всё, что случилось до самого раннего из чтений, уже учтено
  const earliestFullRead = state ? null : minTs(productsSnap.readTime, movementsSnap.readTime, transferSnaps[0].readTime)

  return {
    full: !state,
    hasMore: movementsSnap.docs.length > limit,
    cursor: encodeCursor({
      products: productsSnap.readTime,
      history: historySnap ? historySnap.readTime : earliestFullRead,
      clientTime: state ? minTs(returnsSnap.readTime, ...transferSnaps.map(s => s.readTime)) : earliestFullRead,
      movement: last ? { ts: last.get('createdAt'), id: last.id } : (state?.movement ?? null),
    }),
    products: productsSnap.docs.map(d => toProduct(d.id, d.data())),
    movements: [...movementDocs, ...returnedDocs].map(d => toMovement(d.id, d.data())),
    transfers: [...transfers.values()].sort(byCreated),
    deleted,
  }
}

// ─── HTTP ───────────────────────────────────────────────────────────────────
// Постоянное сравнение секретов — не выдаёт длину/префикс по времени ответа.
const secretsMatch = (a, b) => {
  const ba = Buffer.from(String(a || ''))
  const bb = Buffer.from(String(b || ''))
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb)
}

export function createMerchSyncHandler({ getDb, getApiKey }) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const expected = getApiKey()
    if (!expected) return res.status(503).json({ error: 'MERCH_API_KEY is not configured' })
    if (!secretsMatch(req.headers['x-api-key'], expected)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    res.setHeader('Cache-Control', 'no-store')

    let state, limit
    try {
      const { cursor, limit: rawLimit } = req.query || {}
      state = cursor === undefined ? null : decodeCursor(cursor)
      limit = parseLimit(rawLimit)
    } catch (err) {
      if (err instanceof BadRequestError) return res.status(400).json({ error: err.message })
      throw err
    }

    try {
      return res.status(200).json(await buildSyncPayload(getDb(), { state, limit }))
    } catch (err) {
      console.error('[merch-sync] read failed:', err.message)
      return res.status(500).json({ error: 'Firestore read failed' })
    }
  }
}
