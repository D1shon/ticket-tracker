import admin from 'firebase-admin'

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

  // 2. Shift checklists — 5 minutes before each shift
  const shifts = weekend
    ? [
        { id: 'morning', name: 'Утренняя смена', time: '9:00',  min: 540 },
        { id: 'day',     name: 'Дневная смена',  time: '14:00', min: 840 },
        { id: 'evening', name: 'Вечерняя смена', time: '19:00', min: 1140 },
      ]
    : [
        { id: 'morning', name: 'Утренняя смена', time: '6:30',  min: 390 },
        { id: 'day',     name: 'Дневная смена',  time: '11:30', min: 690 },
        { id: 'evening', name: 'Вечерняя смена', time: '16:30', min: 990 },
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
  // Client passes [{ t, club, role }] — resolved with the client SDK (admin reads hit quota)
  if (Array.isArray(clientTokens) && clientTokens.length > 0) {
    return clientTokens
      .filter(x => x && typeof x.t === 'string' && x.t.length > 20)
      .slice(0, 500)
      .map(x => ({ token: x.t, club: x.club || null, role: x.role || null }))
  }
  const now = Date.now()
  if (tokensCache && now - tokensCachedAt < 10 * 60 * 1000) return tokensCache
  try {
    const snap = await admin.firestore().collection('push_tokens').get()
    tokensCache = snap.docs.map(d => ({ token: d.id, club: d.data().club || null, role: d.data().role || null }))
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

    const allTokens = await getTokens(req.body?.tokens)
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

    if (!due.length && !results.length) return res.json({ ok: true, reason: 'no due reminders' })
    return res.json({ ok: true, results })
  } catch (err) {
    console.error('scheduled-reminders error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
