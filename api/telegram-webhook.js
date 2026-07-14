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

// Shared secret embedded in the webhook URL — Telegram is the only caller that knows it
const WEBHOOK_SECRET = 'hj-tg-news-8f24c1a97d'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (req.query?.secret !== WEBHOOK_SECRET) return res.status(403).json({ error: 'forbidden' })

  try {
    const update = req.body ?? {}
    const post = update.channel_post || update.edited_channel_post
    if (!post) return res.json({ ok: true, skipped: 'not a channel post' })

    const text = post.text || post.caption || ''
    const hasMedia = !!(post.photo || post.video || post.document || post.animation)
    if (!text && !hasMedia) return res.json({ ok: true, skipped: 'empty' })

    const docId = `${post.chat?.id || 'ch'}_${post.message_id}`
    await admin.firestore().collection('news_posts').doc(docId).set({
      text,
      hasMedia,
      mediaNote: hasMedia && !text ? '📎 Вложение (смотрите в Telegram)' : hasMedia ? '📎 + вложение в Telegram' : null,
      channelTitle: post.chat?.title || '',
      messageId: post.message_id,
      source: 'telegram',
      postedAtISO: new Date((post.edit_date || post.date) * 1000).toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })

    return res.json({ ok: true })
  } catch (err) {
    console.error('telegram-webhook error:', err)
    // Always 200 — otherwise Telegram keeps retrying the same broken update
    return res.json({ ok: false })
  }
}
