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
    const db = admin.firestore()
    const configSnap = await db.collection('checkin_config').doc('ip_map').get()
    const ipMap = configSnap.data()?.ips ?? {}
    const clubId = ipMap[ip] ?? null

    await db.collection('checkins').add({
      userId,
      userName: userName ?? null,
      clubId,
      ipAddress: ip,
      localSubnetOk: localSubnetOk ?? null,
      status: clubId ? 'verified' : 'failed',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      date: new Date().toISOString().split('T')[0],
    })

    return res.json({ allowed: !!clubId, clubId, ip })
  } catch (err) {
    console.error('checkin error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
