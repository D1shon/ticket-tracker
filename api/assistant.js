// ИИ-помощник для сотрудников: отвечает по гайдбуку (Firestore). Модель — Gemini.
// Гайдбук читаем клиентским SDK Firebase (анонимный вход) — как в облачных
// рутинах. firebase-admin на serverless упирается в квоту Firestore (429) и
// возвращает пусто, поэтому его здесь НЕ используем.
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

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

// Второй источник знаний — описание самой платформы HJ Track (её вкладки и функции).
const PLATFORM_INFO = `HJ Track (он же HJTRACK, «трак», «трэк») — рабочая платформа сети клубов Hero's Journey для сотрудников. Открывается в браузере и как приложение (PWA) на телефоне. Разделы и функции:
- Новости — объявления и релизы; аудитории «всем / менеджерам / отдел продаж»; видно, кто посмотрел.
- Заявки — задачи и заявки на обслуживание (поломки, розетки, оборудование); статусы, приоритеты, комментарии.
- График — расписание смен сотрудников, процент продаж/награда.
- Чек-листы — чек-листы открытия и закрытия смены.
- Склад — товары, продажи, остатки, награда/комиссия админам.
- Продажи, Дашборд, Архив — сводки и история.
- Учёт полотенец — приход чистого, грязные; для NURLY ORDA ещё маленькие полотенца и кг.
- Пульсометры — учёт пульсометров. Утерянные вещи — забытые вещи клиентов.
- Отзывы — три источника: 2ГИС (отвечать можно прямо из платформы), QR-отзывы клиентов (сканируют QR в шкафчиках, оценка 1-5 и текст), WhatsApp (анализ переписок).
- Лиды — заявки клиентов про цены/абонементы из рабочего WhatsApp + «живые визиты» вручную; статусы «Принято» и «Связались».
- Чекин — отметка прихода/ухода на смену по IP клуба (сканер).
- Созвоны — видеозвонки для команды (личные и групповые).
- Гайдбук — база знаний, стандарты и регламенты. Соглашения — документы.
- Настройки — команда своего клуба, включение push-уведомлений, смена пароля.
- Помощник — этот ИИ-чат (по гайдбуку и платформе).
- Отчёт за сегодня — кнопка у шефа и отдельных аккаунтов: сводка событий дня.
Push-уведомления (включаются в Настройках): чекаут, Demo Day (пятница), новые отзывы 2ГИС и QR, новые лиды.
Вход по email и паролю. Роли: Шеф, Менеджер, Администратор, Ком-Дир, РОП, маркетинг.
Клубы: 4YOU, COLIBRI, VILLA (Алматы), NURLY ORDA (Астана), PROMENADE (Алматы), EUROPE CITY (Алматы).`

const SYSTEM = (guide, policy) => `Ты — встроенный помощник платформы HJ Track для сотрудников сети фитнес-клубов Hero's Journey (клубы: 4YOU, COLIBRI, VILLA, NURLY ORDA, PROMENADE, EUROPE CITY).

У тебя ТРИ источника знаний, все ниже: «О ПЛАТФОРМЕ HJ TRACK» (описание приложения, его вкладок и функций), «ГАЙДБУК» (стандарты обслуживания и регламенты клуба) и «ОФЕРТА И ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ» (публичный договор-оферта с клиентом и правила обработки персональных данных).

Правила:
- Вопросы про платформу HJ Track (упоминания «HJ Track», «HJTRACK», «трак», «трэк», приложение, вкладка, функция, кнопка, «как ... в приложении/на платформе», уведомления, роли, отзывы, лиды, чек-ин и т.п.) — отвечай по разделу «О ПЛАТФОРМЕ HJ TRACK» (и по гайдбуку, если релевантно).
- Вопросы про работу в клубе, сервис, правила, ситуации с клиентами — отвечай по гайдбуку.
- Вопросы про договор с клиентом, оферту, условия членства, абонемент, заморозку, возврат, оплату, ответственность, предмет договора, права/обязанности сторон, персональные данные, конфиденциальность, обработку/хранение данных — это РАБОЧИЕ вопросы, отвечай по разделу «ОФЕРТА И ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ» (ищи ответ в нём внимательно, даже если вопрос сформулирован коротко). НЕ считай такие вопросы болтовнёй.
- Отвечай ТОЛЬКО на основе этих трёх источников. НЕ используй общие знания и НЕ выдумывай вкладки, кнопки, функции, шаги, статусы, пункты договора, которых нет ни в описании платформы, ни в гайдбуке, ни в оферте.
- Если ответа нет НИ в одном из трёх источников — ответь честно ровно так: «Пока нет информации по этому вопросу в гайдбуке, оферте и описании платформы. Уточните у управляющего или шефа — и мы добавим это.»
- Если вопрос совсем НЕ про работу и НЕ про платформу (личное, развлечения, болтовня, общие темы) — ответь РОВНО этой фразой и ничем больше: «Давай работать 🙂 На такие вопросы у тебя есть ChatGPT.»
- Пиши ОБЫЧНЫМ текстом, БЕЗ markdown-разметки: не используй **, ##, одиночные * и обратные кавычки. Списки оформляй как «1. 2. 3.» или тире.
- Отвечай кратко, по делу, без «воды», но ПОЛНОСТЬЮ (не обрывай мысль).

=== О ПЛАТФОРМЕ HJ TRACK ===
${PLATFORM_INFO}
=== КОНЕЦ ОПИСАНИЯ ПЛАТФОРМЫ ===

=== ГАЙДБУК (стандарты и регламенты клуба) ===
${guide || '(гайдбук пока пуст)'}
=== КОНЕЦ ГАЙДБУКА ===

=== ОФЕРТА И ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ ===
${policy || '(оферта пока не добавлена)'}
=== КОНЕЦ ОФЕРТЫ ===`

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

  // ── Ветка: классификатор лидов по смыслу (дёргает wa-bridge). fail-open → {lead:true} ──
  if (req.body?.classifyLead !== undefined) {
    const text = String(req.body.classifyLead || '').trim().slice(0, 1000)
    if (!text) return res.json({ lead: false })
    const k = process.env.GEMINI_API_KEY
    if (!k) return res.json({ lead: true, reason: 'no-key' })

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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${LEAD_MODEL}:generateContent?key=${k}`
      let r
      for (let i = 0; i < 2; i++) {
        r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          // Даём модели «подумать» над контекстом (анализ), ответ — короткий JSON.
          generationConfig: { temperature: 0, maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 1024 } },
        }) })
        if (r.ok || (r.status !== 503 && r.status !== 429)) break
        await new Promise(res2 => setTimeout(res2, 700))
      }
      if (!r.ok) return res.json({ lead: true, reason: 'gemini-' + r.status })
      const data = await r.json()
      const out = (data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '')
      const m = out.match(/"lead"\s*:\s*(true|false)/i)
      const lead = m ? m[1].toLowerCase() === 'true' : (!/false/i.test(out) && /true/i.test(out))
      const rm = out.match(/"reason"\s*:\s*"([^"]{0,120})"/i)
      return res.json({ lead, reason: rm ? rm[1] : undefined })
    } catch (e) {
      console.error('classifyLead error:', e.message)
      return res.json({ lead: true, reason: 'error' })
    }
  }

  const { question, role, club } = req.body ?? {}
  const { history } = req.body ?? {}
  const q = String(question || '').trim().slice(0, 1000)
  if (!q) return res.status(400).json({ error: 'question required' })

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    return res.json({ answer: 'Помощник ещё не подключён — не задан ключ ИИ. Обратитесь к администратору платформы (нужно добавить GEMINI_API_KEY).' })
  }

  try {
    const sections = await getGuideSections()
    const guide = buildGuide(sections, q) // весь гайдбук (или релевантные разделы, если большой)
    const policyMap = await getPolicyDocs()
    const policy = buildPolicy(policyMap, club, q) // релевантные разделы оферты/политики клуба
    // Роль/клуб и подсказку про контекст — в систему; сам диалог — в contents.
    const sys = SYSTEM(guide, policy) + `\n\nСпрашивает: роль ${role || 'сотрудник'}${club ? `, клуб ${club}` : ''}. Учитывай предыдущие сообщения диалога: если вопрос уточняющий (напр. «а как ещё?», «а дальше?»), отвечай в контексте прошлых вопросов.`
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
    // Gemini требует, чтобы диалог начинался с реплики user
    while (contents.length > 1 && contents[0].role !== 'user') contents.shift()
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`
    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents,
      // thinkingBudget:0 — flash-latest это «думающая» модель, её «мысли»
      // съедали бюджет токенов и ответ обрывался. Отключаем + даём запас.
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
    })
    // flash-latest иногда кратковременно перегружена (503) — один повтор
    let r
    for (let attempt = 0; attempt < 2; attempt++) {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
      if (r.ok || (r.status !== 503 && r.status !== 429)) break
      await new Promise(res2 => setTimeout(res2, 900))
    }
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      console.error('gemini error', r.status, t.slice(0, 300))
      return res.json({ answer: r.status === 429
        ? 'Лимит бесплатных запросов ИИ на сегодня исчерпан. Нужно обновить ключ Gemini (или включить биллинг).'
        : 'Не удалось получить ответ от ИИ. Попробуйте ещё раз через минуту.' })
    }
    const data = await r.json()
    let answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim()
      || 'Не удалось сформулировать ответ. Переформулируйте вопрос.'
    // подстраховка: убираем возможную markdown-разметку (жирный/код/заголовки)
    answer = answer.replace(/\*\*/g, '').replace(/`/g, '').replace(/^#{1,6}\s+/gm, '')
    return res.json({ answer })
  } catch (err) {
    console.error('assistant error:', err.message)
    return res.status(500).json({ answer: 'Ошибка помощника. Попробуйте ещё раз.' })
  }
}
