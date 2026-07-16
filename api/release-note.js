import admin from 'firebase-admin'
import { timingSafeEqual } from 'node:crypto'

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

// Постоянное сравнение секретов — не выдаёт длину/префикс по времени ответа.
const secretsMatch = (a, b) => {
  const ba = Buffer.from(String(a || ''))
  const bb = Buffer.from(String(b || ''))
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb)
}

// POST /api/release-note — автопубликация анонса релиза в ленту «Новости».
// Вызывается release-notes workflow'ом из hj-ai-review (server-to-server,
// секрет в заголовке). Никакого CORS: браузеру этот endpoint не нужен.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const expected = process.env.RELEASE_NOTE_SECRET
  if (!expected) {
    // Секрет не настроен в окружении — честный 503, а не тихий приём всего подряд.
    return res.status(503).json({ error: 'RELEASE_NOTE_SECRET is not configured' })
  }
  if (!secretsMatch(req.headers['x-release-secret'], expected)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { text, product } = req.body || {}
  if (typeof text !== 'string' || !text.trim() || text.length > 8000) {
    return res.status(400).json({ error: 'text: непустая строка до 8000 символов' })
  }

  try {
    const doc = await admin.firestore().collection('news_posts').add({
      text: text.trim(),
      source: 'release',
      product: typeof product === 'string' ? product.slice(0, 100) : '',
      author: '',
      postedAtISO: new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    return res.status(200).json({ ok: true, id: doc.id })
  } catch (err) {
    console.error('[release-note] write failed:', err.message)
    return res.status(500).json({ error: 'Firestore write failed' })
  }
}
