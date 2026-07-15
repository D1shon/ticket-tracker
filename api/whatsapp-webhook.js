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

// Verify token — вводится в настройках вебхука Meta, чтобы подтвердить, что URL наш
const VERIFY_TOKEN = 'hj-wa-verify-3d91b7c44a'

export default async function handler(req, res) {
  // Meta проверяет вебхук GET-запросом при подключении
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }
    return res.status(403).json({ error: 'verify failed' })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const entries = req.body?.entry || []
    const writes = []

    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {}
        const phoneNumberId = value.metadata?.phone_number_id || ''
        const displayPhone = value.metadata?.display_phone_number || ''

        // Входящие сообщения от клиентов
        for (const msg of value.messages || []) {
          const contact = (value.contacts || []).find(c => c.wa_id === msg.from)
          writes.push(admin.firestore().collection('wa_messages').doc(msg.id).set({
            direction: 'in',
            phoneNumberId,
            displayPhone,
            from: msg.from,
            contactName: contact?.profile?.name || '',
            type: msg.type || 'text',
            text: msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || '',
            hasMedia: ['image', 'video', 'audio', 'document', 'sticker'].includes(msg.type),
            timestampISO: new Date((+msg.timestamp || 0) * 1000).toISOString(),
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true }))
        }

        // Статусы наших сообщений (sent/delivered/read) — для времени ответа
        for (const st of value.statuses || []) {
          writes.push(admin.firestore().collection('wa_statuses').doc(`${st.id}_${st.status}`).set({
            messageId: st.id,
            status: st.status,
            recipient: st.recipient_id || '',
            phoneNumberId,
            timestampISO: new Date((+st.timestamp || 0) * 1000).toISOString(),
          }, { merge: true }))
        }
      }
    }

    await Promise.allSettled(writes)
    // Meta требует быстрый 200, иначе начнёт ретраить
    return res.status(200).json({ ok: true, saved: writes.length })
  } catch (err) {
    console.error('whatsapp-webhook error:', err)
    return res.status(200).json({ ok: false })
  }
}
