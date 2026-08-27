import admin from 'firebase-admin'

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'hjtrack-928f5.firebasestorage.app',
  })
  try { admin.firestore().settings({ preferRest: true }) } catch {}
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()

  try {
    const now = admin.firestore.Timestamp.now()
    const snap = await admin.firestore()
      .collection('checkout_photos')
      .where('expiresAt', '<', now)
      .limit(200)
      .get()

    if (snap.empty) return res.json({ deleted: 0 })

    const bucket = admin.storage().bucket()
    let deleted = 0

    for (const docSnap of snap.docs) {
      const { storagePath } = docSnap.data()
      try {
        if (storagePath) await bucket.file(storagePath).delete()
      } catch (e) {
        if (!String(e.message).includes('No such object')) {
          console.error('storage delete failed:', e.message)
        }
      }
      await docSnap.ref.delete()
      deleted++
    }

    console.log(`cleanup-checkout-photos: deleted ${deleted}`)
    return res.json({ deleted })
  } catch (err) {
    console.error('cleanup error:', err)
    return res.status(500).json({ error: err.message })
  }
}
