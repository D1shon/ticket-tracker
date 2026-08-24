import admin from 'firebase-admin'

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
  // REST instead of gRPC — avoids RESOURCE_EXHAUSTED on serverless cold starts
  try { admin.firestore().settings({ preferRest: true }) } catch {}
}

// Fallback ip_map used when Firestore is unavailable (quota exhausted, cold start)
const FALLBACK_IP_MAP = {
  '77.240.35.17':   'COLIBRI',
  '95.161.225.166': 'VILLA',
  '92.46.44.66':    '4YOU',
  '95.141.141.57':  'NURLY ORDA',
  '62.32.84.138':   'PROMENADE',
  '95.59.126.26':   'EUROPE CITY',
}

// In-memory cache — persists across warm invocations, reloads on cold start
let ipMapCache = null
let ipMapCachedAt = 0
const IP_MAP_TTL = 5 * 60 * 1000

async function getIpMap() {
  const now = Date.now()
  if (ipMapCache && now - ipMapCachedAt < IP_MAP_TTL) return ipMapCache
  try {
    const snap = await admin.firestore().collection('checkin_config').doc('ip_map').get()
    const ips = snap.data()?.ips
    // Пустой/отсутствующий конфиг (например, случайно очистили в настройках) —
    // не оставляем чекин без единого IP: подмешиваем захардкоженный фолбэк
    ipMapCache = (ips && Object.keys(ips).length > 0) ? ips : { ...FALLBACK_IP_MAP, ...(ips ?? {}) }
    ipMapCachedAt = now
    return ipMapCache
  } catch (err) {
    console.warn('ip_map read failed, using fallback:', err.message)
    // Always merge with FALLBACK so hardcoded IPs are guaranteed even with stale cache
    return { ...FALLBACK_IP_MAP, ...(ipMapCache ?? {}) }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ip = (req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '')
    .split(',')[0]
    .trim()

  const { userId, userName, userClub, localSubnetOk, checkType } = req.body ?? {}
  if (!userId) return res.status(400).json({ error: 'userId required' })

  try {
    const ipMap = await getIpMap()
    const clubId = ipMap[ip] ?? null

    // Fire-and-forget — quota exhaustion must not block the checkin response
    admin.firestore().collection('checkins').add({
      userId,
      userName: userName ?? null,
      // Клуб сотрудника из приложения: по нему менеджер видит НЕУДАЧНЫЕ попытки
      // (clubId у них null — IP не из сети клуба, фильтр по clubId их не находит)
      userClub: userClub ?? null,
      clubId,
      ipAddress: ip,
      localSubnetOk: localSubnetOk ?? null,
      checkType: checkType === 'out' ? 'out' : 'in',
      status: clubId ? 'verified' : 'failed',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      // Дата по Алматы (UTC+5): чекин в 00:00–04:59 ночи не должен уезжать во «вчера»
      date: new Date(Date.now() + 5 * 3600 * 1000).toISOString().split('T')[0],
    }).catch(err => console.error('checkin log failed:', err.message))

    return res.json({ allowed: !!clubId, clubId, ip, v: 3 })
  } catch (err) {
    console.error('checkin error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
