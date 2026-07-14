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

// Shift start times in minutes (Almaty, UTC+5, no DST)
const WEEKDAY_SHIFTS = [
  { id: 'morning', name: 'Утренняя смена', time: '6:30',  min: 390 },
  { id: 'day',     name: 'Дневная смена',  time: '11:30', min: 690 },
  { id: 'evening', name: 'Вечерняя смена', time: '16:30', min: 990 },
  { id: 'night',   name: 'Ночная смена',   time: '21:30', min: 1290 },
]
const WEEKEND_SHIFTS = [
  { id: 'morning', name: 'Утренняя смена', time: '9:00',  min: 540 },
  { id: 'day',     name: 'Дневная смена',  time: '14:00', min: 840 },
  { id: 'evening', name: 'Вечерняя смена', time: '19:00', min: 1140 },
]

let tokensCache = null
let tokensCachedAt = 0

async function getTokens(clientTokens) {
  if (Array.isArray(clientTokens) && clientTokens.length > 0) {
    return clientTokens.filter(t => typeof t === 'string' && t.length > 20).slice(0, 500)
  }
  const now = Date.now()
  if (tokensCache && now - tokensCachedAt < 10 * 60 * 1000) return tokensCache
  try {
    const snap = await admin.firestore().collection('push_tokens').get()
    tokensCache = snap.docs.map(d => d.id)
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
    // Current time in Almaty (UTC+5)
    const almaty = new Date(Date.now() + 5 * 3600 * 1000)
    const dow = almaty.getUTCDay()
    const isWeekend = dow === 0 || dow === 6
    const shifts = isWeekend ? WEEKEND_SHIFTS : WEEKDAY_SHIFTS
    const nowMin = almaty.getUTCHours() * 60 + almaty.getUTCMinutes()

    // Fire within the 6-minute window before a shift starts, never after
    const target = shifts.find(s => s.min - nowMin > 0 && s.min - nowMin <= 6)
    if (!target) return res.json({ ok: true, reason: 'no shift window', nowMin })

    // Atomic dedup: create() fails if the marker already exists
    const dateStr = almaty.toISOString().slice(0, 10)
    const markerId = `${dateStr}_${target.id}`
    try {
      await admin.firestore().collection('checklist_reminders').doc(markerId).create({
        shift: target.id,
        shiftTime: target.time,
        sentAtISO: new Date().toISOString(),
      })
    } catch (e) {
      if (String(e.code) === '6' || /already exists/i.test(e.message || '')) {
        return res.json({ ok: true, reason: 'already sent', markerId })
      }
      console.warn('marker create failed, continuing anyway:', e.message)
    }

    const tokens = await getTokens(req.body?.tokens)
    if (tokens.length === 0) return res.json({ ok: true, sent: 0, reason: 'no tokens' })

    const result = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: '📋 Чек-лист смены',
        body: `${target.name} в ${target.time} — через 5 минут начало, откройте чек-лист`,
      },
      webpush: {
        headers: { Urgency: 'high', TTL: '1800' },
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: `checklist-${markerId}`,
        },
        fcmOptions: { link: 'https://ticket-tracker-inky.vercel.app/checklists' },
      },
    })

    return res.json({ ok: true, sent: result.successCount, failed: result.failureCount, shift: target.id })
  } catch (err) {
    console.error('checklist-reminder error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
