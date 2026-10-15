import admin from 'firebase-admin'
import { rewriteNews } from '../src/lib/newsRewrite.js'

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

// Кто может публиковать новости — тот и пользуется редактором
const EDITORS = ['dilshat.r@hj.fit']

// POST { text } + Authorization: Bearer <Firebase idToken> → { title, audience, topic, text }
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!idToken) return res.status(401).json({ error: 'no token' })
    let decoded
    try { decoded = await admin.auth().verifyIdToken(idToken) } catch { return res.status(401).json({ error: 'bad token' }) }
    if (!EDITORS.includes((decoded.email || '').toLowerCase())) return res.status(403).json({ error: 'forbidden' })

    const text = String(req.body?.text || '').trim()
    if (text.length < 10) return res.status(400).json({ error: 'text too short' })
    const out = await rewriteNews(text)
    if (!out) return res.status(502).json({ error: 'empty result' })
    return res.json(out)
  } catch (err) {
    console.error('news-rewrite error:', err)
    return res.status(500).json({ error: String(err.message || err).slice(0, 300) })
  }
}
