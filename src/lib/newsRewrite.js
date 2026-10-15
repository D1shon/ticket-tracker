// «Сделать понятно»: переписывает сырой релиз-нот из Slack в читабельную новость
// для сотрудников и определяет адресата/тему. Серверный модуль (api/), Vertex AI
// (gemini-2.5-flash) через сервисный аккаунт проекта — биллинг hjtrack, без GEMINI_API_KEY.
import crypto from 'node:crypto'

export const NEWS_AUDIENCES = ['all', 'admins', 'managers', 'sales']
export const NEWS_TOPICS = ['app', 'admin', 'pos', 'track', 'rules', 'promo', 'other']

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')

let tokenCache = { token: null, exp: 0 }
async function vertexToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60_000) return tokenCache.token
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) throw new Error('FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY not set')
  const now = Math.floor(Date.now() / 1000)
  const head = b64url({ alg: 'RS256', typ: 'JWT' })
  const body = b64url({ iss: clientEmail, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${body}.${sig}`,
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('vertex token: ' + JSON.stringify(j).slice(0, 200))
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }
  return j.access_token
}

const PROMPT = `Ты редактор внутренних новостей сети фитнес-клубов Hero's Journey (Казахстан). Тебе дают сырой релиз-нот от команды разработки (из Slack). Перепиши его так, чтобы администратор клуба или менеджер понял с первого раза, что изменилось и что ему делать.

Наши продукты (называй их ТОЛЬКО так, при первом упоминании — с пояснением в скобках):
- «POS-касса (Поска)» — кассовая программа на ресепшене; разработчики часто пишут просто «касса».
- «Админка (admin.herosjourney)» — панель управления клиентами, абонементами, расписанием.
- «Приложение атлета» — мобильное приложение клиентов Hero's Journey.
- «HJ Track» — наша внутренняя платформа сотрудников (заявки, чек-листы, склад, новости).
- «Академия» — обучение сотрудников.

Правила текста:
- Простой разговорный русский, без жаргона разработчиков. Термины вроде «тумблер», «эндпоинт», «фича», «деплой» — заменяй на человеческие.
- Факты не выдумывай и не теряй. Если в исходнике что-то непонятно — напиши как есть, но проще.
- Структура строго такая (заголовки с двоеточием на отдельной строке, пункты через «• »):
  1-я строка — короткий заголовок с одним эмодзи в начале (до 60 символов).
  «Что изменилось:» — 1–4 пункта вида «• Название — что именно».
  «Кого касается:» — одна строка, конкретно (например «Админы на ресепшене — при продаже абонемента»).
  «Что делать:» — 1–3 пункта, конкретные действия; если делать ничего не нужно, так и напиши: «• Ничего — всё работает само».
  «Пример:» — необязательно, одна строка с бытовым примером, если он реально помогает понять.
- Объём: 400–900 символов. Короче — лучше, если смысл не теряется.

Адресат (audience), ровно одно значение:
- "admins" — касается работы на ресепшене: POS-касса, продажи абонементов, чекин, обслуживание клиентов.
- "managers" — управление клубом, отчёты, финансы, админка в части управления, персонал.
- "sales" — отдел продаж, лиды, тарифы, акции для продаж.
- "all" — касается всех или это приложение атлета (о нём должны знать все).
Тема (topic), ровно одно значение: "app" (приложение атлета), "admin" (админка), "pos" (POS-касса), "track" (HJ Track), "rules" (регламенты и правила), "promo" (акции и мероприятия), "other".

Верни ТОЛЬКО JSON без пояснений: {"title": "...", "audience": "...", "topic": "...", "text": "..."} — где text это весь готовый текст новости целиком, включая заголовок первой строкой.`

async function askJson(prompt, temperature = 0.2) {
  const token = await vertexToken()
  const project = process.env.FIREBASE_PROJECT_ID || 'hjtrack-928f5'
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/gemini-2.5-flash:generateContent`
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json' },
    }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error('vertex ' + r.status + ': ' + JSON.stringify(j.error || j).slice(0, 300))
  const out = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
  try { return JSON.parse(out) } catch { return JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) }
}

const VERIFY_PROMPT = `Ты ревизор фактов. Есть ИСХОДНИК (релиз-нот от разработчиков) и ПЕРЕСКАЗ для сотрудников. Проверь пересказ ТОЛЬКО на достоверность:
1. Нет ли в пересказе утверждений, которых НЕТ в исходнике (выдуманные функции, цифры, названия, сроки, клубы, действия сотрудника, которых исходник не требует).
2. Не искажён ли смысл (перепутано «раньше/теперь», «включено/выключено», кто и где, условия «если…»).
3. Не потерян ли важный факт, из-за которого сотрудник сделает ошибку (цифры, названия клубов/программ, условия, что именно нужно делать).
4. Верные ли названия продуктов: «POS-касса (Поска)», «Админка (admin.herosjourney)», «Приложение атлета», «HJ Track».
Стиль, краткость, эмодзи и структуру НЕ оценивай. Пункт «Что делать: Ничего — всё работает само» допустим, если исходник не требует действий.
НЕ считай ошибкой: отсутствие даты релиза и строки «Технические улучшения: N»; разделы «Кого касается», «Что делать» и «Пример» — это формат пересказа, они выводятся из исходника, а не цитируются; сокращение второстепенных деталей (переименования кнопок, косметика, внутренние механизмы), если сотрудник из-за этого не ошибётся. Ошибка — только выдумка, искажение или потеря факта, который влияет на действия сотрудника или ответ клиенту (цифры, сроки, условия, названия клубов/программ, кто и где).

Верни ТОЛЬКО JSON: {"ok": true|false, "issues": ["краткое описание каждой найденной ошибки"], "text": "исправленный пересказ целиком (та же структура), если ok=false; иначе пустая строка"}. Исправляя, меняй только ошибочные места, остальное оставляй как есть.`

// Сверка результата с исходником. Возвращает { ok, issues, text } — text только при ok=false
export async function verifyNews(raw, text) {
  const v = await askJson(`${VERIFY_PROMPT}\n\nИСХОДНИК:\n${raw}\n\nПЕРЕСКАЗ:\n${text}`, 0)
  return {
    ok: v.ok !== false,
    issues: Array.isArray(v.issues) ? v.issues.map(String).slice(0, 10) : [],
    text: String(v.text || '').trim(),
  }
}

// Переписать + проверить. До двух кругов ревизии: нашли ошибку → берём исправленный
// ревизором текст → проверяем снова. После второго круга публикуем последнюю
// исправленную версию: она всегда ближе к исходнику, чем первый пересказ, а
// исходник без обработки читать не будут (ради этого всё и затевалось).
export async function rewriteNews(raw) {
  const src = String(raw || '').trim().slice(0, 8000)
  if (!src) return null
  const parsed = await askJson(`${PROMPT}\n\nИСХОДНЫЙ ТЕКСТ:\n${src}`)
  let text = String(parsed.text || '').trim()
  if (!text) return null
  const issues = []
  for (let round = 0; round < 2; round++) {
    const v = await verifyNews(src, text)
    if (v.ok) break
    issues.push(...v.issues)
    if (!v.text) break
    text = v.text
  }
  return {
    title: String(parsed.title || '').trim().slice(0, 120),
    audience: NEWS_AUDIENCES.includes(parsed.audience) ? parsed.audience : 'all',
    topic: NEWS_TOPICS.includes(parsed.topic) ? parsed.topic : 'other',
    text: text.slice(0, 4000),
    issues, // что ревизор поправил — для лога
  }
}
