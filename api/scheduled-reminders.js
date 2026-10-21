import admin from 'firebase-admin'
import { pushCategoryOf } from '../src/lib/pushPrefs.js'

// Личный фильтр уведомлений: токены с выключенным разделом (muted) пуш не получают
const notMuted = (url) => (t) => {
  const cat = pushCategoryOf(url)
  return !cat || !(Array.isArray(t.muted) && t.muted.includes(cat))
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
  try { admin.firestore().settings({ preferRest: true }) } catch {}
}

// All times — Almaty (UTC+5, no DST), minutes from midnight.
// Each reminder fires once per day (atomic marker in `checklist_reminders`).
function dueReminders(alm) {
  const dow = alm.getUTCDay()
  const weekend = dow === 0 || dow === 6
  const nowMin = alm.getUTCHours() * 60 + alm.getUTCMinutes()
  const dateStr = alm.toISOString().slice(0, 10)
  const due = []
  // Fires within [t, t+6) — covers ping intervals and small delays
  const inWin = (t) => nowMin >= t && nowMin < t + 6

  // Каждое напоминание адресовано ролям (roles) — РОПы, Ком-Дир, наблюдатели
  // и маркетинг служебные пуши не получают.
  // 1. Daily check-in at 6:30 — чекинятся клубные сотрудники
  if (inWin(390)) {
    due.push({ id: `${dateStr}_checkin`, title: '✅ Чекин', body: 'Произведите чекин — отметьтесь в приложении', club: null, url: '/scan', roles: ['manager', 'admin'] })
  }

  // 2. Shift checklists — 5 minutes before each shift.
  // ДЕРЖАТЬ В СИНХРОНЕ с src/data/checklistData.js (getShiftsForDate):
  // 2026-09 дневная (11:30/14:00) и вечерняя (16:30) смены убраны из чек-листов.
  const shifts = weekend
    ? [
        { id: 'morning', name: 'Утренняя смена', time: '9:00',  min: 540 },
        { id: 'evening', name: 'Вечерняя смена', time: '19:00', min: 1140 },
      ]
    : [
        { id: 'morning', name: 'Утренняя смена', time: '6:30',  min: 390 },
        { id: 'night',   name: 'Ночная смена',   time: '21:30', min: 1290 },
      ]
  // Чек-листы — функция менеджеров, админам эти пуши не нужны
  shifts.forEach(s => {
    if (s.min - nowMin > 0 && s.min - nowMin <= 6) {
      due.push({ id: `${dateStr}_${s.id}`, title: '📋 Чек-лист смены', body: `${s.name} в ${s.time} — через 5 минут начало, откройте чек-лист`, club: null, url: '/checklists', roles: ['manager', 'chef'] })
    }
  })

  // 3. HR monitors & towels check
  if (!weekend) {
    // Weekdays: 22:00, all clubs at once — проверку делают админы и менеджеры
    if (inWin(1320)) {
      due.push({ id: `${dateStr}_mt_all`, title: '💓 Проверка пульсометров и полотенец', body: 'Проведите проверку пульсометров и учёт полотенец', club: null, url: '/hr-monitors', roles: ['manager', 'admin'] })
    }
  } else {
    // Weekends: per-club times — 4YOU 19:00, VILLA 19:00, COLIBRI 21:00, NURLY ORDA 21:30, PROMENADE 19:00
    const perClub = [
      ['4YOU',       1140],
      ['VILLA',      1140],
      ['COLIBRI',    1260],
      ['NURLY ORDA', 1290],
      ['PROMENADE',  1140],
    ]
    perClub.forEach(([club, t]) => {
      if (inWin(t)) {
        due.push({ id: `${dateStr}_mt_${club.replace(/\s+/g, '')}`, title: '💓 Проверка пульсометров и полотенец', body: `${club}: проведите проверку пульсометров и учёт полотенец`, club, url: '/hr-monitors', roles: ['manager', 'admin'] })
      }
    })
  }

  // 4. Отчёт дня (Чек-листы → «Отчёт дня»): будни 21:30, выходные 20:00
  const opsMin = weekend ? 1200 : 1290
  if (inWin(opsMin)) {
    due.push({
      id: `${dateStr}_ops_report`,
      title: '📝 Отчёт дня',
      body: 'Заполните отчёт дня: события за смену или отметка «всё хорошо» в календаре',
      club: null, url: '/checklists', roles: ['manager', 'admin'],
    })
  }

  return due
}

let tokensCache = null
let tokensCachedAt = 0

async function getTokens(clientTokens) {
  // Client passes [{ t, club, role, muted }] — resolved with the client SDK (admin reads hit quota).
  // muted ОБЯЗАТЕЛЬНО прокидывать дальше: иначе напоминания обходят личный фильтр уведомлений
  if (Array.isArray(clientTokens) && clientTokens.length > 0) {
    const list = clientTokens
      .filter(x => x && typeof x.t === 'string' && x.t.length > 20)
      .slice(0, 500)
      .map(x => ({ token: x.t, club: x.club || null, role: x.role || null, muted: Array.isArray(x.muted) ? x.muted : null }))
    // Старый бандл клиента muted не шлёт — дозаполняем из серверного кеша,
    // чтобы фильтр уведомлений работал независимо от версии пингующего клиента
    if (list.some(x => x.muted === null)) {
      try {
        const srv = await getServerTokens()
        const mutedById = new Map(srv.map(t => [t.token, t.muted]))
        for (const x of list) if (x.muted === null) x.muted = mutedById.get(x.token) || null
      } catch {}
    }
    return list
  }
  return getServerTokens()
}

async function getServerTokens() {
  const now = Date.now()
  if (tokensCache && now - tokensCachedAt < 10 * 60 * 1000) return tokensCache
  try {
    const snap = await admin.firestore().collection('push_tokens').get()
    tokensCache = snap.docs.map(d => ({ token: d.id, club: d.data().club || null, role: d.data().role || null, muted: d.data().muted || null }))
    tokensCachedAt = now
    return tokensCache
  } catch (err) {
    console.warn('push_tokens read failed:', err.message)
    return tokensCache ?? []
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const alm = new Date(Date.now() + 5 * 3600 * 1000)
    const due = dueReminders(alm)
    const nowMin = alm.getUTCHours() * 60 + alm.getUTCMinutes()
    const dateStr = alm.toISOString().slice(0, 10)
    const inWin = (t) => nowMin >= t && nowMin < t + 6

    // Токены читаем ТОЛЬКО когда реально есть что отправлять (вне окон — ноль
    // чтений Firestore): пинги приходят от всех клиентов каждую минуту окна
    const needTokens = due.length > 0 || inWin(480) || inWin(600)
    const allTokens = needTokens ? await getTokens(req.body?.tokens) : []
    const results = []

    for (const r of due) {
      // Atomic once-per-day: create() fails if the marker exists
      try {
        await admin.firestore().collection('checklist_reminders').doc(r.id).create({
          sentAtISO: new Date().toISOString(),
          title: r.title,
        })
      } catch (e) {
        if (String(e.code) === '6' || /already exists/i.test(e.message || '')) {
          results.push({ id: r.id, skipped: 'already sent' })
          continue
        }
        console.warn('marker create failed, continuing:', e.message)
      }

      const tokens = allTokens
        .filter(t => !r.club || !t.club || (t.club || '').toUpperCase() === r.club.toUpperCase())
        // Только адресованные роли; токены без роли (старые подписки) не получают
        // служебные пуши — роль допишется при следующем открытии приложения
        .filter(t => !r.roles || r.roles.includes(t.role))
        .filter(notMuted(r.url))
        .map(t => t.token)
      if (tokens.length === 0) { results.push({ id: r.id, sent: 0 }); continue }

      const out = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: r.title, body: r.body },
        webpush: {
          headers: { Urgency: 'high', TTL: '1800' },
          notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: r.id },
          // track.hj.fit не в DNS — ссылки только на рабочий домен
          fcmOptions: { link: `https://ticket-tracker-inky.vercel.app${r.url}` },
        },
      })
      results.push({ id: r.id, sent: out.successCount, failed: out.failureCount })
    }

    // 5. Calendar events — 08:00 Almaty: push today's events per club
    if (inWin(480)) {
      try {
        const evSnap = await admin.firestore().collection('calendar_events')
          .where('date', '==', dateStr)
          .get()
        const byClub = {}
        evSnap.docs.forEach(d => {
          const ev = d.data()
          if (ev.deleted) return
          const club = (ev.club || '').toUpperCase()
          if (!byClub[club]) byClub[club] = []
          byClub[club].push(ev.title || 'Событие')
        })
        for (const [club, titles] of Object.entries(byClub)) {
          const id = `${dateStr}_cal_${club}`
          const body = titles.length === 1 ? titles[0] : `${titles[0]} и ещё ${titles.length - 1}`
          try {
            await admin.firestore().collection('checklist_reminders').doc(id).create({ sentAtISO: new Date().toISOString(), title: '📅 Событие сегодня' })
          } catch (e) {
            if (String(e.code) === '6' || /already exists/i.test(e.message || '')) { results.push({ id, skipped: 'already sent' }); continue }
          }
          const tokens = allTokens
            .filter(t => (t.club || '').toUpperCase() === club)
            .filter(t => ['manager', 'admin', 'chef'].includes(t.role))
            .filter(notMuted('/calendar'))
            .map(t => t.token)
          if (!tokens.length) { results.push({ id, sent: 0 }); continue }
          const out = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title: '📅 Событие сегодня', body },
            webpush: {
              headers: { Urgency: 'high', TTL: '3600' },
              notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: id },
              fcmOptions: { link: 'https://ticket-tracker-inky.vercel.app/calendar' },
            },
          })
          results.push({ id, sent: out.successCount, failed: out.failureCount })
        }
      } catch (calErr) {
        console.warn('calendar push failed:', calErr.message)
      }
    }

    // 6. Обзвон клиента после травмы — 10:00 Almaty, в день ticket.followUpDate.
    // Маркер по ticketId (не по дате) — напоминание одноразовое, а не ежедневное.
    if (inWin(600)) {
      try {
        const injSnap = await admin.firestore().collection('tickets')
          .where('isInjury', '==', true)
          .where('followUpDate', '==', dateStr)
          .get()
        for (const d of injSnap.docs) {
          const t = d.data()
          if (t.followUpDone) continue
          const id = `injury_followup_${d.id}`
          try {
            await admin.firestore().collection('checklist_reminders').doc(id).create({ sentAtISO: new Date().toISOString(), title: '📞 Обзвон после травмы' })
          } catch (e) {
            if (String(e.code) === '6' || /already exists/i.test(e.message || '')) { results.push({ id, skipped: 'already sent' }); continue }
          }
          const club = (t.club || '').toUpperCase()
          const tokens = allTokens
            .filter(tk => (tk.club || '').toUpperCase() === club)
            .filter(tk => ['manager', 'chef'].includes(tk.role))
            .filter(notMuted('/tickets'))
            .map(tk => tk.token)
          if (!tokens.length) { results.push({ id, sent: 0 }); continue }
          const out = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title: '📞 Обзвон после травмы', body: `Позвоните клиенту, узнайте самочувствие — «${t.title || 'заявка'}»` },
            webpush: {
              headers: { Urgency: 'high', TTL: '3600' },
              notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: id },
              fcmOptions: { link: `https://ticket-tracker-inky.vercel.app/tickets/${d.id}` },
            },
          })
          results.push({ id, sent: out.successCount, failed: out.failureCount })
        }
      } catch (injErr) {
        console.warn('injury followup push failed:', injErr.message)
      }
    }

    // 7. Залежавшиеся находки — 10:00 Almaty. Вещь, хранящаяся > 30 дней,
    // получает первый пуш менеджерам клуба (отметка staleNotifiedAtISO на доке),
    // через 7 дней — второй, с общим числом залежавшихся в клубе (staleNotified2AtISO).
    // Суточный маркер ставится ДО запроса — lost_items читаются один раз в день.
    if (inWin(600)) {
      const dayMarker = `${dateStr}_lost_stale`
      let runLost = true
      try {
        await admin.firestore().collection('checklist_reminders').doc(dayMarker).create({ sentAtISO: new Date().toISOString(), title: '📦 Залежавшиеся вещи' })
      } catch (e) {
        if (String(e.code) === '6' || /already exists/i.test(e.message || '')) runLost = false
      }
      if (runLost) {
        try {
          const nowMs = Date.now()
          const MONTH_MS = 30 * 24 * 3600 * 1000
          const WEEK_MS = 7 * 24 * 3600 * 1000
          const lostSnap = await admin.firestore().collection('lost_items')
            .where('status', '==', 'stored')
            .get()
          const first = {}   // club -> [{ ref, name }]
          const second = {}  // club -> [{ ref, name }]
          const staleTotal = {} // club -> число всех залежавшихся
          for (const d of lostSnap.docs) {
            const it = d.data()
            if (!it.acceptedAtISO || nowMs - new Date(it.acceptedAtISO).getTime() <= MONTH_MS) continue
            const club = (it.club || '').toUpperCase()
            if (!club) continue
            staleTotal[club] = (staleTotal[club] || 0) + 1
            const entry = { ref: d.ref, name: (it.note || '').trim() || 'вещь без описания' }
            if (!it.staleNotifiedAtISO) {
              (first[club] ||= []).push(entry)
            } else if (!it.staleNotified2AtISO && nowMs - new Date(it.staleNotifiedAtISO).getTime() >= WEEK_MS) {
              (second[club] ||= []).push(entry)
            }
          }
          const nowISO = new Date().toISOString()
          const sendLost = async (club, id, title, body, entries, field) => {
            const batch = admin.firestore().batch()
            entries.forEach(e => batch.update(e.ref, { [field]: nowISO }))
            await batch.commit()
            const tokens = allTokens
              .filter(tk => (tk.club || '').toUpperCase() === club)
              .filter(tk => tk.role === 'manager')
              .filter(notMuted('/lost-items'))
              .map(tk => tk.token)
            if (!tokens.length) { results.push({ id, sent: 0 }); return }
            const out = await admin.messaging().sendEachForMulticast({
              tokens,
              notification: { title, body },
              webpush: {
                headers: { Urgency: 'high', TTL: '3600' },
                notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: id },
                fcmOptions: { link: 'https://ticket-tracker-inky.vercel.app/lost-items' },
              },
            })
            results.push({ id, sent: out.successCount, failed: out.failureCount })
          }
          for (const [club, entries] of Object.entries(first)) {
            const names = entries.slice(0, 3).map(e => e.name).join(', ')
            const body = entries.length === 1
              ? `«${names}» хранится больше месяца — свяжитесь с владельцем или решите судьбу вещи`
              : `${entries.length} вещей перешли рубеж 30 дней: ${names}${entries.length > 3 ? '…' : ''}`
            await sendLost(club, `${dateStr}_lost1_${club.replace(/\s+/g, '')}`, '📦 Вещь залежалась', body, entries, 'staleNotifiedAtISO')
          }
          for (const [club, entries] of Object.entries(second)) {
            const total = staleTotal[club] || entries.length
            const body = `В клубе ${club} уже ${total} ${total === 1 ? 'вещь' : total < 5 ? 'вещи' : 'вещей'} старше месяца — пора разобрать находки`
            await sendLost(club, `${dateStr}_lost2_${club.replace(/\s+/g, '')}`, '📦 Находок накопилось много', body, entries, 'staleNotified2AtISO')
          }
        } catch (lostErr) {
          console.warn('lost items stale push failed:', lostErr.message)
        }
      }
    }

    // 8. Ночная уборка базы (решение шефа 21.10.2026), окно 03:00 Алматы, раз в день:
    //    новости старше 45 дней (+ их отметки «Ознакомлен»), возвращённые находки
    //    старше 31 дня (+ полные фото). Расписания и заявки НЕ трогаем — хранятся полностью.
    //    Окно 10:00 — в нём есть пинги от открытых клиентов (ночью функцию никто не дёргает).
    if (inWin(600)) {
      const marker = `${dateStr}_cleanup`
      let run = true
      try {
        await admin.firestore().collection('checklist_reminders').doc(marker).create({ sentAtISO: new Date().toISOString(), title: '🧹 Уборка базы' })
      } catch (e) {
        if (String(e.code) === '6' || /already exists/i.test(e.message || '')) run = false
      }
      if (run) {
        const fs = admin.firestore()
        const stats = { news: 0, acks: 0, lost: 0, photos: 0 }
        try {
          const newsCutoff = new Date(Date.now() - 45 * 864e5).toISOString()
          const oldNews = await fs.collection('news_posts').where('postedAtISO', '<', newsCutoff).select().get()
          for (const d of oldNews.docs) {
            const acks = await fs.collection('news_acks').where('postId', '==', d.id).select().get()
            for (const a of acks.docs) { await a.ref.delete(); stats.acks++ }
            await d.ref.delete(); stats.news++
          }
          const lostCutoff = new Date(Date.now() - 31 * 864e5).toISOString()
          const returned = await fs.collection('lost_items').where('status', '==', 'returned').select('returnedAtISO', 'acceptedAtISO').get()
          for (const d of returned.docs) {
            const x = d.data()
            if ((x.returnedAtISO || x.acceptedAtISO || '') >= lostCutoff) continue
            await fs.collection('lost_item_photos').doc(d.id).delete().then(() => { stats.photos++ }).catch(() => {})
            await d.ref.delete(); stats.lost++
          }
          results.push({ id: marker, cleanup: stats })
        } catch (e) {
          console.warn('cleanup failed:', e.message)
          results.push({ id: marker, cleanup: stats, error: e.message })
        }
      }
    }

    if (!due.length && !results.length) return res.json({ ok: true, reason: 'no due reminders' })
    return res.json({ ok: true, results })
  } catch (err) {
    console.error('scheduled-reminders error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
