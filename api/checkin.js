import admin from 'firebase-admin'

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

// Fallback ip_map used when Firestore is unavailable (quota exhausted, cold start)
const FALLBACK_IP_MAP = {
  '77.240.35.17':  'COLIBRI',
  '95.161.225.166': 'VILLA',
  '92.46.44.66':   '4YOU',
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
    ipMapCache = snap.data()?.ips ?? {}
    ipMapCachedAt = now
    return ipMapCache
  } catch (err) {
    console.warn('ip_map read failed, using fallback:', err.message)
    return ipMapCache ?? FALLBACK_IP_MAP
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

  const { userId, userName, localSubnetOk } = req.body ?? {}
  if (!userId) return res.status(400).json({ error: 'userId required' })

  try {
    const ipMap = await getIpMap()
    const clubId = ipMap[ip] ?? null

    // Fire-and-forget — quota exhaustion must not block the checkin response
    admin.firestore().collection('checkins').add({
      userId,
      userName: userName ?? null,
      clubId,
      ipAddress: ip,
      localSubnetOk: localSubnetOk ?? null,
      status: clubId ? 'verified' : 'failed',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      date: new Date().toISOString().split('T')[0],
    }).catch(err => console.error('checkin log failed:', err.message))

    return res.json({ allowed: !!clubId, clubId, ip })
  } catch (err) {
    console.error('checkin error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
