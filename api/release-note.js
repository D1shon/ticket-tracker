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

// Приёмник релизных анонсов от команды разработки: их репозитории после релиза
// POST-ят сюда анонс, он публикуется во вкладке «Новости» платформы.
// Аутентификация: общий секрет RELEASE_NOTE_SECRET (env Vercel) в заголовке
// x-release-secret, Authorization: Bearer, ?secret= или body.secret.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-release-secret, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const secret = (process.env.RELEASE_NOTE_SECRET || '').trim()
  if (!secret) return res.status(500).json({ error: 'RELEASE_NOTE_SECRET is not configured' })

  const given = String(req.headers['x-release-secret']
    || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    || req.query?.secret
    || req.body?.secret
    || '').trim()
  if (given !== secret) return res.status(403).json({ error: 'forbidden' })

  try {
    const b = req.body ?? {}
    // Гибкий формат: text | body | message; заголовок опционален
    const title = String(b.title || '').trim()
    const bodyText = String(b.text || b.body || b.message || '').trim()
    if (!title && !bodyText) return res.status(400).json({ error: 'text required' })
    const text = [title, bodyText].filter(Boolean).join('\n\n').slice(0, 6000)

    const audience = ['all', 'managers', 'sales'].includes(b.audience) ? b.audience : 'all'
    const project = String(b.project || b.repo || b.source || '').trim()

    // Идемпотентность: если прислали releaseId/version — повторный POST обновит тот же пост
    const key = String(b.releaseId || b.version || '').replace(/[^\w.\-]/g, '')
    const ref = key
      ? admin.firestore().collection('news_posts').doc(`release_${project ? project.replace(/[^\w\-]/g, '') + '_' : ''}${key}`)
      : admin.firestore().collection('news_posts').doc()

    await ref.set({
      text,
      source: 'release',
      author: project || 'Релиз',
      audience,
      postedAtISO: new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })

    return res.json({ ok: true, id: ref.id, audience })
  } catch (err) {
    console.error('release-note error:', err)
    return res.status(500).json({ error: 'internal error' })
  }
}
