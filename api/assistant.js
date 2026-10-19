// ИИ-помощник для сотрудников: отвечает по гайдбуку (Firestore). Модель — Gemini.
// Гайдбук читаем клиентским SDK Firebase (анонимный вход) — как в облачных
// рутинах. firebase-admin на serverless упирается в квоту Firestore (429) и
// возвращает пусто, поэтому его здесь НЕ используем.
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore'
import { vertexGenerate } from '../src/lib/vertex.js'
import { platformText, PLATFORM_PAGES } from '../src/lib/assistantKnowledge.js'

const FB = {
  apiKey: 'AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk',
  authDomain: 'hjtrack-928f5.firebaseapp.com',
  projectId: 'hjtrack-928f5',
  storageBucket: 'hjtrack-928f5.firebasestorage.app',
  messagingSenderId: '236581443884',
  appId: '1:236581443884:web:a9ce84dcbf0efc59267489',
}
const fbApp = getApps().length ? getApps()[0] : initializeApp(FB)
let authReady = false
async function ensureAuth() {
  if (authReady) return
  try { await signInAnonymously(getAuth(fbApp)); authReady = true } catch { /* правила открыты — чтение возможно и без auth */ }
}

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'
// Классификатор лидов анализирует переписку (контекст) → отдельная, более «думающая»
// модель. Можно переопределить через GEMINI_LEAD_MODEL (напр. gemini-2.5-pro) без правки кода.
const LEAD_MODEL = process.env.GEMINI_LEAD_MODEL || 'gemini-2.5-flash'

// Цепочка для ИИ-чата (freeChat), когда нет платного ANTHROPIC_API_KEY:
// DeepSeek (дёшево, умно — reasoner) → Gemini → Groq → Mistral → OpenRouter (бесплатные),
// первый успешный ответ побеждает. Все — OpenAI-совместимый формат (messages/choices).
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-reasoner'
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest'
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'

async function callOpenAICompatible(baseUrl, key, model, sys, messages) {
  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: sys }, ...messages],
      temperature: 0.7,
      max_tokens: 2048,
    }),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`${r.status} ${t.slice(0, 200)}`)
  }
  const data = await r.json()
  const text = data?.choices?.[0]?.message?.content || ''
  if (!text.trim()) throw new Error('empty response')
  return text
}

// Гайдбук меняется редко — кэшируем разделы на 10 минут (Spark-квота Firestore).
let guideCache = null // массив разделов
let guideCachedAt = 0
const GUIDE_TTL = 10 * 60 * 1000

async function getGuideSections() {
  const now = Date.now()
  if (guideCache && now - guideCachedAt < GUIDE_TTL) return guideCache
  try {
    await ensureAuth()
    const snap = await getDocs(collection(getFirestore(fbApp), 'guidebook'))
    guideCache = snap.docs.map(d => {
      const x = d.data()
      // Контент статьи хранится в массиве blocks ([{type,text}]), а не в поле content
      const content = Array.isArray(x.blocks)
        ? x.blocks.map(b => (b && b.text ? String(b.text) : '')).filter(Boolean).join('\n')
        : (x.content || '')
      return { section: x.section || '', subsection: x.subsection || '', title: x.title || '', content }
    })
    guideCachedAt = now
    return guideCache
  } catch (err) {
    console.warn('guidebook read failed:', err.message)
    return guideCache ?? []
  }
}

// ── RAG: подбираем только релевантные разделы под вопрос (лексический скоринг) ──
const RU_STOP = new Set(['как', 'что', 'где', 'это', 'для', 'при', 'или', 'кто', 'чем', 'так', 'вот', 'мне', 'нам', 'все', 'нужно', 'можно', 'если', 'быть', 'есть', 'the', 'and', 'you', 'for'])
function tokenize(s) {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length >= 3 && !RU_STOP.has(w))
}
function countHits(hay, needle) {
  let idx = hay.indexOf(needle), c = 0
  while (idx !== -1 && c < 5) { c++; idx = hay.indexOf(needle, idx + needle.length) }
  return c
}
const asBlock = (sec) => `## ${sec.section}${sec.subsection ? ' / ' + sec.subsection : ''} — ${sec.title}\n${(sec.content || '').slice(0, 4000)}`
// Пока гайдбук помещается — отдаём его ЦЕЛИКОМ (надёжнее лексического RAG).
// Gemini 2.5 Flash держит ~1M токенов контекста, так что 100k+ символов — не проблема.
const FULL_GUIDE_LIMIT = 150000

function buildGuide(sections, question, maxChars = 15000) {
  // Небольшой гайдбук — целиком, чтобы модель точно видела всё (без промахов RAG)
  const full = sections.map(asBlock).join('\n\n')
  if (full.length <= FULL_GUIDE_LIMIT) return full

  // Большой гайдбук — подбираем релевантные разделы (лексический скоринг)
  const qt = [...new Set(tokenize(question))]
  const scored = sections.map(sec => {
    const head = (sec.section + ' ' + sec.subsection + ' ' + sec.title).toLowerCase()
    const body = (sec.content || '').toLowerCase()
    let score = 0
    for (const t of qt) { if (head.includes(t)) score += 3; score += countHits(body, t) }
    return { sec, score }
  }).sort((a, b) => b.score - a.score)
  const relevant = scored.filter(s => s.score > 0).slice(0, 8)
  const chosen = (relevant.length ? relevant : scored).map(s => s.sec)
  let out = '', used = 0
  for (const sec of chosen) {
    const block = asBlock(sec)
    if (used + block.length > maxChars) break
    out += block + '\n\n'; used += block.length + 2
  }
  return out.trim()
}

// ── Третий источник: оферта + политика конфиденциальности (коллекция policy_documents) ──
// Оферта хранится под именем клуба, политика — под `${club}_privacy`. Кэш 10 мин.
let policyCache = null
let policyCachedAt = 0
async function getPolicyDocs() {
  const now = Date.now()
  if (policyCache && now - policyCachedAt < GUIDE_TTL) return policyCache
  try {
    await ensureAuth()
    const snap = await getDocs(collection(getFirestore(fbApp), 'policy_documents'))
    const map = {}
    snap.docs.forEach(d => {
      map[d.id] = Array.isArray(d.data().sections) ? d.data().sections : []
    })
    policyCache = map
    policyCachedAt = now
    return map
  } catch (err) {
    console.warn('policy read failed:', err.message)
    return policyCache ?? {}
  }
}

// RAG по оферте+политике клуба: подбираем разделы, релевантные вопросу (лексический
// скоринг). Без этого модель на длинном тексте хватала не тот раздел.
function buildPolicy(map, club, question) {
  const key = (club || '4YOU').toUpperCase()
  const offerSecs = (map[key] || map['4YOU'] || []).map(s => ({ ...s, _src: 'Договор-оферта' }))
  const privSecs = (map[`${key}_privacy`] || map['4YOU_privacy'] || []).map(s => ({ ...s, _src: 'Политика конфиденциальности' }))
  const all = [...offerSecs, ...privSecs]
  if (!all.length) return ''
  // Ищем по ОСНОВАМ слов (первые 5 букв) — иначе рус. морфология ломает совпадение
  // («данные»≠«данных», «персональные»≠«персональных», «договор»≠«договора»).
  const qt = [...new Set(tokenize(question).map(w => w.slice(0, 5)))]
  const scored = all.map(sec => {
    const head = (sec.title || '').toLowerCase()
    const body = (sec.body || '').toLowerCase()
    let score = 0
    for (const t of qt) { if (head.includes(t)) score += 4; score += countHits(body, t) }
    return { sec, score }
  }).sort((a, b) => b.score - a.score)
  const relevant = scored.filter(s => s.score > 0).slice(0, 8).map(s => s.sec)
  // если ничего не сматчилось — берём начальные разделы (термины, предмет договора)
  const chosen = relevant.length ? relevant : all.slice(0, 6)
  let out = '', used = 0
  for (const sec of chosen) {
    const block = `[${sec._src}] ${sec.title || ''}\n${(sec.body || '').slice(0, 5000)}`
    if (used + block.length > 40000) break
    out += block + '\n\n'; used += block.length
  }
  return out.trim()
}

// ── Четвёртый источник: свежие новости платформы (релизы и объявления за 45 дней) ──
let newsCache = null
let newsCachedAt = 0
async function getRecentNews() {
  const now = Date.now()
  if (newsCache && now - newsCachedAt < GUIDE_TTL) return newsCache
  try {
    await ensureAuth()
    const cutoff = new Date(now - 45 * 24 * 3600 * 1000).toISOString()
    const snap = await getDocs(query(collection(getFirestore(fbApp), 'news_posts'), where('postedAtISO', '>=', cutoff)))
    newsCache = snap.docs
      .map(d => d.data())
      .filter(n => (n.text || '').trim())
      .sort((a, b) => (b.postedAtISO || '').localeCompare(a.postedAtISO || ''))
      .slice(0, 40)
      .map(n => `[${(n.postedAtISO || '').slice(0, 10)} · ${n.audience === 'managers' ? 'менеджерам' : n.audience === 'admins' ? 'админам' : n.audience === 'sales' ? 'отделу продаж' : 'всем'}]\n${(n.text || '').slice(0, 1800)}`)
      .join('\n\n')
    newsCachedAt = now
    return newsCache
  } catch (err) {
    console.warn('news read failed:', err.message)
    return newsCache ?? ''
  }
}

// Системный промпт умного помощника: четыре источника + карта платформы со ссылками.
// Ответ — JSON, чтобы клиент мог нарисовать кнопки «перейти на страницу».
const SYSTEM = (guide, policy, news) => `Ты — встроенный помощник платформы HJ Track для сотрудников сети фитнес-клубов Hero's Journey. Твоя задача — дать максимально полный, практичный ответ и показать, где именно на платформе это делается.

ИСТОЧНИКИ (все ниже): «ПЛАТФОРМА HJ TRACK» (все вкладки, кому доступны, как в них работать, с path для ссылок), «ГАЙДБУК» (стандарты сервиса, регламенты, скрипты), «ОФЕРТА И ПОЛИТИКА» (договор с клиентом, абонементы, заморозка, возврат, персональные данные), «НОВОСТИ» (последние релизы приложения атлета, POS-кассы, Админки и самой платформы — что изменилось недавно).

КАК ОТВЕЧАТЬ:
1. Собери ответ из ВСЕХ источников, где есть что-то по теме: регламент из гайдбука + где это сделать на платформе + что недавно менялось по новостям + условия из оферты, если касается договора. Не ограничивайся одним источником.
2. Отвечай ПОЛНО: по шагам (1. 2. 3.), с конкретными названиями вкладок и кнопок, сроками, цифрами, готовыми фразами для клиента, если это ситуация общения. Без «воды», но ничего важного не выбрасывай.
3. Даже если вопрос связан с платформой КОСВЕННО (например, «клиент жалуется на пропавшую куртку» → Утерянные вещи + регламент + единое окно обращений; «не пришёл пуш» → Настройки/уведомления; «стажёр вышел первый день» → Адаптация + Гайдбук/Экскурсия + Академия) — сам сделай связку и укажи нужные страницы.
4. Учитывай роль и клуб спрашивающего: подсказывай то, что ему доступно; если функция доступна другой роли — так и скажи, кому.
5. Если по части вопроса данных нет — ответь на то, что есть, и честно скажи, чего нет и у кого уточнить (управляющий/шеф). Не выдумывай вкладки, кнопки, сроки и пункты договора.
6. Уточняющие вопросы («а дальше?», «а если нет?») понимай в контексте предыдущих сообщений диалога.
7. Не про работу и не про платформу (личное, развлечения) — коротко и дружелюбно верни к работе, offtopic: true.
8. Пиши на русском, обычным текстом без markdown-символов (без **, ##, звёздочек-маркеров, обратных кавычек). Нумерованные списки «1. 2. 3.», подпункты — через тире «— ». Абзацы — через пустую строку.
9. Собеседник — СОТРУДНИК клуба (не клиент): отвечай ему как коллеге. Готовые фразы для клиента давай отдельно в кавычках. Не пиши в тексте «path: /...» — страницы называй по имени («вкладка «Утерянные вещи»»), а path указывай только в links/related.

ФОРМАТ ОТВЕТА — строго JSON:
{
  "answer": "полный текст ответа",
  "links": [{"path": "/lost-items", "label": "Утерянные вещи", "why": "принять и зафиксировать вещь"}],
  "related": [{"path": "/guidebook", "label": "Гайдбук → 12. Обращения клиентов"}],
  "sources": ["Гайдбук: Communication / 12. Обращения клиентов — единое окно", "Новости 2026-10-15"],
  "offtopic": false
}
links — 1–3 страницы, где выполняется действие из ответа (path только из списка платформы). related — 0–3 косвенно полезные страницы или разделы гайдбука. sources — откуда взят ответ (кратко). Если offtopic — links и related пустые.

=== ПЛАТФОРМА HJ TRACK ===
${platformText()}
=== КОНЕЦ ПЛАТФОРМЫ ===

=== ГАЙДБУК ===
${guide || '(гайдбук пока пуст)'}
=== КОНЕЦ ГАЙДБУКА ===

=== ОФЕРТА И ПОЛИТИКА ===
${policy || '(оферта пока не добавлена)'}
=== КОНЕЦ ОФЕРТЫ ===

=== НОВОСТИ (свежие релизы, новое сверху) ===
${news || '(новостей нет)'}
=== КОНЕЦ НОВОСТЕЙ ===`

const KNOWN_PATHS = new Set(PLATFORM_PAGES.map(p => p.path))
const PAGE_LABEL = Object.fromEntries(PLATFORM_PAGES.map(p => [p.path, p.name]))
const cleanLinks = (arr, max) => (Array.isArray(arr) ? arr : [])
  .filter(l => l && typeof l.path === 'string' && KNOWN_PATHS.has(l.path.split(/[?#]/)[0]))
  .slice(0, max)
  .map(l => ({ path: l.path.split(/[?#]/)[0], label: String(l.label || PAGE_LABEL[l.path.split(/[?#]/)[0]]).slice(0, 80), why: String(l.why || '').slice(0, 120) }))

// Промпт классификатора лидов (тот же endpoint, ветка classifyLead — вызывает wa-bridge).
// Анализирует ВСЮ переписку (контекст), а не одно сообщение — так «да/сколько?/хочу»
// оцениваются по предыдущим фразам, а тема «точно ли это отдел продаж» ловится надёжнее.
const LEAD_PROMPT = `Ты — фильтр входящих сообщений в рабочий WhatsApp сети фитнес-клубов Hero's Journey. По ПЕРЕПИСКЕ реши, относится ли последнее сообщение клиента к ОТДЕЛУ ПРОДАЖ, то есть это НОВЫЙ ЛИД (потенциальный/новый клиент хочет купить абонемент/тренировку или вступить).
Учитывай ВЕСЬ контекст диалога, а не одну фразу: короткие реплики («да», «сколько?», «а можно?», «хочу») трактуй по смыслу предыдущих сообщений.
ОТДЕЛ ПРОДАЖ / ЛИД (lead=true): интерес к ПОКУПКЕ или вступлению — цена/стоимость/прайс/тарифы абонемента или тренировок; купить/оплатить абонемент, пробную или разовую; рассрочка, акции для покупки, условия вступления; запись как НОВЫЙ клиент.
НЕ ОТДЕЛ ПРОДАЖ (lead=false): жалобы и претензии; вопросы ДЕЙСТВУЮЩЕГО участника по его текущему абонементу/занятиям/билетам («у меня была скидка», «сколько у меня осталось тренировок/билетов», «где мои билеты»); бытовое (парковка, расписание, забытые вещи, режим работы, как пройти); внутренняя переписка сотрудников, поставщики, реклама, спам; просто упоминание слов «скидка/билет/цена» без намерения купить.
Верни СТРОГО JSON: {"lead": true, "reason": "кратко почему"} или {"lead": false, "reason": "кратко почему"}.`

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Ветка: машинный перевод новостей на kk/en (дёргает NewsPage при
  // казахском/английском языке интерфейса; результат кешируется в самом
  // посте news_posts.tr.{lang}, так что каждый пост переводится один раз) ──
  if (req.body?.translateTo !== undefined) {
    const to = req.body.translateTo === 'en' ? 'en' : 'kk'
    const text = String(req.body.text || '').trim().slice(0, 6000)
    if (!text) return res.status(400).json({ error: 'text required' })
    try {
      const langName = to === 'en' ? 'английский' : 'казахский (кириллица)'
      // Vertex по сервисному аккаунту (биллинг проекта); GEMINI_API_KEY больше не нужен
      const out = (await vertexGenerate({
        prompt: `Переведи текст новости фитнес-клуба на ${langName} язык. Сохрани эмодзи, форматирование, переносы строк и нумерацию. Не переводи названия клубов (4YOU, COLIBRI, VILLA, NURLY ORDA, PROMENADE, EUROPE CITY) и бренды (Hero's Journey, HJ Track, WhatsApp, InStudio). В ответе верни ТОЛЬКО перевод, без пояснений и кавычек.\n\n${text}`,
        temperature: 0.2, thinkingBudget: 0,
      })).trim()
      if (!out) return res.status(502).json({ error: 'empty translation' })
      return res.json({ text: out })
    } catch (e) {
      console.error('translateTo error:', e.message)
      return res.status(502).json({ error: e.message })
    }
  }

  // ── Ветка: прокси публичного API отзывов 2ГИС (дёргает облачная рутина —
  // её egress-прокси блокирует public-api.reviews.2gis.com, а Vercel ходит свободно).
  // POST {gisReviews: '<branchId>'} → сырой JSON ответа 2ГИС как есть.
  if (req.body?.gisReviews !== undefined) {
    const bid = String(req.body.gisReviews || '').replace(/\D/g, '')
    if (!bid) return res.status(400).json({ error: 'branchId required' })
    const GIS_KEY = '6e7e1929-4ea9-4a5d-8c05-d601860389bd'
    try {
      const url = `https://public-api.reviews.2gis.com/2.0/branches/${bid}/reviews`
        + `?limit=${Math.min(Number(req.body.limit) || 20, 50)}&is_advertiser=false&sort_by=date_edited&key=${GIS_KEY}&locale=ru_KZ`
      const r = await fetch(url)
      if (!r.ok) return res.status(r.status).json({ error: `2GIS API: ${r.status}` })
      return res.json(await r.json())
    } catch (e) {
      console.error('gisReviews proxy error:', e.message)
      return res.status(502).json({ error: e.message })
    }
  }

  // ── Ветка: классификатор лидов по смыслу (дёргает wa-bridge). fail-open → {lead:true} ──
  if (req.body?.classifyLead !== undefined) {
    const text = String(req.body.classifyLead || '').trim().slice(0, 1000)
    if (!text) return res.json({ lead: false })
    // Контекст переписки: массив {dir:'in'|'out', text} — последние сообщения диалога.
    // «Клиент:» — входящие, «Мы:» — наши ответы. Помогает оценивать короткие реплики.
    const ctx = Array.isArray(req.body.context) ? req.body.context : []
    const transcript = ctx
      .filter(m => m && typeof m.text === 'string' && m.text.trim())
      .slice(-10)
      .map(m => `${m.dir === 'out' ? 'Мы' : 'Клиент'}: ${m.text.trim().slice(0, 300)}`)
      .join('\n')
    const prompt = LEAD_PROMPT
      + (transcript ? `\n\nПЕРЕПИСКА (последние сообщения):\n${transcript}` : '')
      + `\n\nПОСЛЕДНЕЕ сообщение клиента для оценки: «${text}»`

    try {
      // Vertex по сервисному аккаунту; модели даём «подумать» над контекстом, ответ — короткий JSON
      const out = await vertexGenerate({ prompt, model: LEAD_MODEL, temperature: 0, maxOutputTokens: 1500, thinkingBudget: 1024 })
      const m = out.match(/"lead"\s*:\s*(true|false)/i)
      const lead = m ? m[1].toLowerCase() === 'true' : (!/false/i.test(out) && /true/i.test(out))
      const rm = out.match(/"reason"\s*:\s*"([^"]{0,120})"/i)
      return res.json({ lead, reason: rm ? rm[1] : undefined })
    } catch (e) {
      console.error('classifyLead error:', e.message)
      return res.json({ lead: true, reason: 'error' })
    }
  }

  // ── Ветка: совет по заявке (шторка «Совет помощника» в чате заявки) ──
  // Вход: { ticketAdvice: { title, description, club, priority, status, assignee, comments[], similar[] }, role }.
  // Здесь, в отличие от общего помощника, общие профессиональные знания РАЗРЕШЕНЫ:
  // ценность совета — экспертиза по ремонту, хозяйству, клиентским ситуациям.
  if (req.body?.ticketAdvice) {
    const t = req.body.ticketAdvice || {}
    const title = String(t.title || '').trim().slice(0, 300)
    const description = String(t.description || '').trim().slice(0, 3000)
    if (!title && !description) return res.status(400).json({ error: 'ticket required' })
    try {
      const sections = await getGuideSections()
      const guide = buildGuide(sections, `${title} ${description}`, 30000)
      const comments = (Array.isArray(t.comments) ? t.comments : []).slice(-12)
        .map(c => `— ${String(c.author || '').slice(0, 40)}: ${String(c.text || '').slice(0, 500)}`).join('\n')
      const similar = (Array.isArray(t.similar) ? t.similar : []).slice(0, 5)
        .map(s => `• «${String(s.title || '').slice(0, 120)}» (${s.status || ''}, ${s.club || ''}): ${String(s.resolution || '').slice(0, 400)}`).join('\n')
      const sys = `Ты — опытный управляющий сети фитнес-клубов Hero's Journey и технический эксперт по эксплуатации клубов (оборудование, тренажёры, сантехника, электрика, вентиляция, IT и турникеты, хозяйство, клиентские ситуации, персонал). Тебе дают заявку из платформы HJ Track. Дай самые грамотные решения, которые реально помогут её закрыть.

Правила:
- Сначала поставь «диагноз»: что скорее всего происходит и почему (1–3 предложения).
- Затем конкретные шаги в порядке выполнения: что проверить первым (дешёвое и быстрое), что сделать, когда звать подрядчика/техника/разработчиков. Инструменты, материалы, типовые причины, ориентиры по времени — если уместно.
- Используй общие профессиональные знания (как хороший мастер/управляющий), а по правилам сети, регламентам и тому, где что делается на платформе, — опирайся на ГАЙДБУК и ПЛАТФОРМУ ниже. Если есть похожие закрытые заявки — используй их опыт и так и скажи.
- Безопасность: если есть риск травмы, поражения током, затопления, газа — скажи об этом первым пунктом.
- Учитывай переписку в заявке: не повторяй то, что уже сделано, развивай с того места, где остановились.
- Если заявка касается клиента — дай готовую фразу для клиента.
- Пиши на русском, обычным текстом без markdown-символов. Конкретно, без воды.

ФОРМАТ — строго JSON:
{
  "diagnosis": "что происходит и почему",
  "steps": ["шаг 1", "шаг 2", "..."],
  "checks": ["что проверить в первую очередь", "..."],
  "involve": "кого подключить и когда (подрядчик, техник, InStudio, отдел продаж, шеф) или пусто",
  "pitfalls": ["чего не делать", "..."],
  "clientPhrase": "фраза клиенту, если уместно, иначе пустая строка",
  "links": [{"path": "/instudio", "label": "InStudio", "why": "если это техника/софт"}],
  "safety": "предупреждение по безопасности или пустая строка"
}
links — 0–3 страницы HJ Track только из списка платформы.

=== ПЛАТФОРМА HJ TRACK ===
${platformText()}
=== ГАЙДБУК (релевантные разделы) ===
${guide || '(нет)'}
=== КОНЕЦ ===`
      const prompt = `ЗАЯВКА
Клуб: ${t.club || '—'} · Приоритет: ${t.priority || '—'} · Статус: ${t.status || '—'} · Исполнитель: ${t.assignee || '—'}
Заголовок: ${title}
Описание: ${description || '(нет)'}
${comments ? `\nПЕРЕПИСКА В ЗАЯВКЕ (старые → новые):\n${comments}` : ''}
${similar ? `\nПОХОЖИЕ ЗАКРЫТЫЕ ЗАЯВКИ И КАК ИХ РЕШАЛИ:\n${similar}` : ''}
Спрашивает: ${req.body.role || 'сотрудник'}.`
      const out = await vertexGenerate({ system: sys, prompt, json: true, temperature: 0.3, maxOutputTokens: 8192, thinkingBudget: 2048 })
      const arr = (v, n) => (Array.isArray(v) ? v : []).map(x => String(x).trim()).filter(Boolean).slice(0, n)
      return res.json({
        diagnosis: String(out.diagnosis || '').trim().slice(0, 1500),
        steps: arr(out.steps, 10),
        checks: arr(out.checks, 6),
        involve: String(out.involve || '').trim().slice(0, 500),
        pitfalls: arr(out.pitfalls, 5),
        clientPhrase: String(out.clientPhrase || '').trim().slice(0, 600),
        safety: String(out.safety || '').trim().slice(0, 500),
        links: cleanLinks(out.links, 3),
      })
    } catch (err) {
      console.error('ticketAdvice error:', err.message)
      return res.status(500).json({ error: 'Не удалось подготовить совет. Попробуйте ещё раз через минуту.' })
    }
  }

  // ── Ветка: свободный ИИ-чат (Claude, без привязки к гайдбуку/платформе) ──
  // Отдельная вкладка «ИИ-чат» — общий помощник для менеджеров без ограничения
  // тем, в отличие от /assistant (тот отвечает строго по гайдбуку).
  if (req.body?.freeChat) {
    const { question: fq, history: fhistory, role: frole, club: fclub } = req.body
    const fquestion = String(fq || '').trim().slice(0, 4000)
    if (!fquestion) return res.status(400).json({ error: 'question required' })

    const akey = process.env.ANTHROPIC_API_KEY
    const gkey = process.env.GEMINI_API_KEY
    const freeSys = `Ты — универсальный ИИ-помощник для сотрудников сети фитнес-клубов Hero's Journey внутри платформы HJ Track. В отличие от вкладки «Помощник» (та отвечает строго по гайдбуку), ты НЕ ограничен темами: помогай с планированием, текстами, расчётами, идеями, разбором рабочих ситуаций — с чем угодно, что нужно сотруднику.

Ниже — точное описание платформы HJ Track. Если спрашивают про саму платформу (что это, какие функции, вкладки, как что работает в приложении) — отвечай СТРОГО по этому описанию, НЕ придумывай функций, которых там нет (например, HJ Track — это НЕ CRM с базой клиентов, продажами абонементов, турникетами или кассовыми операциями с клиентами — это внутренний рабочий инструмент для СОТРУДНИКОВ клуба).
=== О ПЛАТФОРМЕ HJ TRACK ===
${PLATFORM_INFO}
=== КОНЕЦ ОПИСАНИЯ ПЛАТФОРМЫ ===

По всем остальным темам (не про платформу) отвечай свободно, без ограничений.

ПОИСК В ИНТЕРНЕТЕ: у тебя есть доступ к поиску Google в реальном времени, но используй его ТОЛЬКО когда сотрудник явно просит найти/подобрать товар, поставщика, цену или ссылку (или прямо просит поискать в интернете) — НЕ ищи и НЕ давай ссылки по своей инициативе на вопросы-мнения, советы, обсуждения или общие темы, где ссылка не нужна. Когда поиск уместен — предложи РОВНО 3 варианта: каждый с номером, названием и коротким пояснением (цена/что это/чем хорош). КРИТИЧЕСКИ ВАЖНО про ссылки: URL бери ТОЛЬКО из реальных результатов поиска — НИКОГДА не конструируй и не «восстанавливай» адреса по памяти (выдуманная ссылка хуже её отсутствия). Если точного URL товара в результатах нет — дай ссылку на главную/раздел магазина или напиши название для самостоятельного поиска. Если поиск недоступен — честно скажи, не выдумывай ссылки.
Спрашивает: роль ${frole || 'сотрудник'}${fclub ? `, клуб ${fclub}` : ''}. Пиши обычным текстом, БЕЗ markdown-разметки (без **, ##, обратных кавычек) — фронт не рендерит markdown, оформляй списки как «1. 2. 3.» или тире. Отвечай по делу, но не обрывай мысль.`
    const stripMd = (s) => String(s || '').replace(/\*\*/g, '').replace(/`/g, '').replace(/^#{1,6}\s+/gm, '')

    // Нет ключа Anthropic → бесплатная цепочка провайдеров: Gemini → Groq → Mistral
    // → OpenRouter. Каждый провайдер получает ОДИН И ТОТ ЖЕ контекст диалога, поэтому
    // при переключении середины разговора (квота кончилась) память не теряется.
    // Появится ANTHROPIC_API_KEY — переключимся на Opus (ветка ниже), эта цепочка не тронется.
    if (!akey) {
      const messages = []
      if (Array.isArray(fhistory)) {
        for (const h of fhistory.slice(-20)) {
          const text = String(h?.text || '').slice(0, 4000)
          if (text) messages.push({ role: h?.role === 'bot' ? 'assistant' : 'user', content: text })
        }
      }
      messages.push({ role: 'user', content: fquestion })
      while (messages.length > 1 && messages[0].role !== 'user') messages.shift()

      const providers = []
      // DeepSeek первым — дёшево (доли цента за запрос) и заметно умнее бесплатных
      // моделей ниже по цепочке; reasoner-модель «размышляет» перед ответом.
      if (process.env.DEEPSEEK_API_KEY) providers.push({ name: 'deepseek', run: () =>
        callOpenAICompatible('https://api.deepseek.com/v1', process.env.DEEPSEEK_API_KEY, DEEPSEEK_MODEL, freeSys, messages) })
      if (gkey) providers.push({ name: 'gemini', run: async () => {
        const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
        // google_search — живой поиск Google (grounding): модель сама решает,
        // когда искать; источники приходят в groundingMetadata
        const makeBody = (withSearch) => JSON.stringify({
          systemInstruction: { parts: [{ text: freeSys }] },
          contents,
          ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        })
        let r
        for (let i = 0; i < 3; i++) {
          // 3-я попытка — без поиска (если grounding-квота дня исчерпана)
          r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${gkey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: makeBody(i < 2),
          })
          if (r.ok || (r.status !== 503 && r.status !== 429)) break
          await new Promise(res2 => setTimeout(res2, 700))
        }
        if (!r.ok) throw new Error(`${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`)
        const data = await r.json()
        let text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('')
        if (!text.trim()) throw new Error('empty response')
        // Приложим источники поиска (до 3 ссылок), если модель искала
        const webChunks = (data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
          .map(c => c && c.web).filter(w => w && w.uri)
        if (webChunks.length) {
          const seen = new Set(); const links = []
          for (const w of webChunks) {
            if (seen.has(w.uri)) continue
            seen.add(w.uri); links.push(w)
            if (links.length >= 3) break
          }
          if (links.length) text += '\n\nИсточники:\n' + links.map((w, i) => `${i + 1}. ${w.title || 'ссылка'} — ${w.uri}`).join('\n')
        }
        return text
      }})
      if (process.env.GROQ_API_KEY) providers.push({ name: 'groq', run: () =>
        callOpenAICompatible('https://api.groq.com/openai/v1', process.env.GROQ_API_KEY, GROQ_MODEL, freeSys, messages) })
      if (process.env.MISTRAL_API_KEY) providers.push({ name: 'mistral', run: () =>
        callOpenAICompatible('https://api.mistral.ai/v1', process.env.MISTRAL_API_KEY, MISTRAL_MODEL, freeSys, messages) })
      if (process.env.OPENROUTER_API_KEY) providers.push({ name: 'openrouter', run: () =>
        callOpenAICompatible('https://openrouter.ai/api/v1', process.env.OPENROUTER_API_KEY, OPENROUTER_MODEL, freeSys, messages) })

      if (!providers.length) return res.json({ answer: 'ИИ-чат ещё не подключён — нет ни одного ключа (ANTHROPIC/DEEPSEEK/GEMINI/GROQ/MISTRAL/OPENROUTER). Обратитесь к администратору платформы.' })

      for (const p of providers) {
        try {
          const text = await p.run()
          return res.json({ answer: stripMd(text.trim()) })
        } catch (err) {
          console.warn(`freechat ${p.name} failed:`, err.message)
          // квота/ошибка этого провайдера — пробуем следующего в цепочке
        }
      }
      return res.json({ answer: 'Все бесплатные ИИ сейчас недоступны (дневные лимиты исчерпаны у всех). Попробуйте позже.' })
    }

    const messages = []
    if (Array.isArray(fhistory)) {
      for (const h of fhistory.slice(-20)) {
        const mrole = h?.role === 'bot' ? 'assistant' : 'user'
        const text = String(h?.text || '').slice(0, 4000)
        if (text) messages.push({ role: mrole, content: text })
      }
    }
    messages.push({ role: 'user', content: fquestion })
    while (messages.length > 1 && messages[0].role !== 'user') messages.shift()

    try {
      // Opus + extended thinking: модель «размышляет» невидимо перед ответом —
      // качество важнее скорости (осознанный выбор). budget_tokens должен быть
      // < max_tokens; thinking-блоки не показываем, только type:'text'.
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': akey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-8',
          max_tokens: 8192,
          thinking: { type: 'enabled', budget_tokens: 4096 },
          system: freeSys,
          messages,
        }),
      })
      if (!r.ok) {
        const t = await r.text().catch(() => '')
        console.error('claude-chat error', r.status, t.slice(0, 300))
        return res.json({ answer: r.status === 429
          ? 'Лимит запросов ИИ-чата исчерпан. Попробуйте позже.'
          : 'Не удалось получить ответ от ИИ-чата. Попробуйте ещё раз.' })
      }
      const data = await r.json()
      const answer = stripMd((data?.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('').trim())
        || 'Не удалось сформулировать ответ. Переформулируйте вопрос.'
      return res.json({ answer })
    } catch (err) {
      console.error('claude-chat error:', err.message)
      return res.status(500).json({ answer: 'Ошибка ИИ-чата. Попробуйте ещё раз.' })
    }
  }

  const { question, role, club } = req.body ?? {}
  const { history } = req.body ?? {}
  const q = String(question || '').trim().slice(0, 1000)
  if (!q) return res.status(400).json({ error: 'question required' })

  try {
    // Четыре источника читаются параллельно (все с кешем 10 минут)
    const [sections, policyMap, news] = await Promise.all([getGuideSections(), getPolicyDocs(), getRecentNews()])
    const guide = buildGuide(sections, q) // весь гайдбук (или релевантные разделы, если большой)
    const policy = buildPolicy(policyMap, club, q) // релевантные разделы оферты/политики клуба
    const sys = SYSTEM(guide, policy, news) + `\n\nСпрашивает: роль ${role || 'сотрудник'}${club ? `, клуб ${club}` : ''}.`
    // Память диалога: последние сообщения истории + текущий вопрос
    const contents = []
    if (Array.isArray(history)) {
      for (const h of history.slice(-10)) {
        const role2 = h?.role === 'bot' ? 'model' : 'user'
        const text = String(h?.text || '').slice(0, 2000)
        if (text) contents.push({ role: role2, parts: [{ text }] })
      }
    }
    contents.push({ role: 'user', parts: [{ text: q }] })
    while (contents.length > 1 && contents[0].role !== 'user') contents.shift()

    // Vertex (биллинг проекта, модель «думает» над связками между источниками)
    // Бюджет «размышлений» ограничен, чтобы JSON ответа не обрезался по maxOutputTokens
    const out = await vertexGenerate({ system: sys, contents, json: true, temperature: 0.2, maxOutputTokens: 8192, thinkingBudget: 2048 })
    let answer = String(out?.answer || '').trim()
    if (!answer) return res.json({ answer: 'Не удалось сформулировать ответ. Переформулируйте вопрос.' })
    // Подстраховка от markdown и служебных «(path: /x)» в тексте: кнопки идут отдельно
    answer = answer
      .replace(/\s*\((?:path|путь):\s*\/[\w\-/]*\)/gi, '')
      .replace(/\*\*/g, '').replace(/`/g, '').replace(/^#{1,6}\s+/gm, '')
      .replace(/^(\s*)[*•]\s+/gm, '$1— ')
    return res.json({
      answer,
      links: cleanLinks(out.links, 3),
      related: cleanLinks(out.related, 3),
      sources: (Array.isArray(out.sources) ? out.sources : []).map(s => String(s).slice(0, 120)).slice(0, 5),
      offtopic: out.offtopic === true,
    })
  } catch (err) {
    console.error('assistant error:', err.message)
    return res.status(500).json({ answer: 'Ошибка помощника. Попробуйте ещё раз через минуту.' })
  }
}
