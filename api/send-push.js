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

// In-memory token cache — survives warm invocations, protects against
// Firestore quota exhaustion (Spark plan)
let tokensCache = null
let tokensCachedAt = 0
const TOKENS_TTL = 5 * 60 * 1000

async function getAllTokens() {
  const now = Date.now()
  if (tokensCache && now - tokensCachedAt < TOKENS_TTL) return tokensCache
  try {
    const snap = await admin.firestore().collection('push_tokens').get()
    tokensCache = snap.docs.map(d => ({ token: d.id, ...d.data() }))
    tokensCachedAt = now
    return tokensCache
  } catch (err) {
    console.warn('push_tokens read failed, using stale cache:', err.message)
    return tokensCache ?? []
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { title, body, club, excludeEmail, url, tag, tokens: clientTokens } = req.body ?? {}
  if (!title) return res.status(400).json({ error: 'title required' })

  try {
    let tokens = []
    if (Array.isArray(clientTokens) && clientTokens.length > 0) {
      // Recipient list resolved by the client (client SDK reads are not
      // affected by the admin-quota issue on the Spark plan)
      tokens = clientTokens.filter(t => typeof t === 'string' && t.length > 20).slice(0, 500)
    } else {
      const allTokens = await getAllTokens()
      const exclude = (excludeEmail || '').toLowerCase()
      allTokens.forEach(t => {
        if (exclude && (t.email || '').toLowerCase() === exclude) return
        // Chefs (club=null) get everything; others only their club's events
        if (club && t.club && (t.club || '').toUpperCase() !== (club || '').toUpperCase()) return
        tokens.push(t.token)
      })
    }

    if (tokens.length === 0) return res.json({ sent: 0, reason: 'no matching tokens' })

    // Notification payload — displayed natively by the browser/OS.
    // Required for iOS: data-only messages don't wake the service worker there.
    const absoluteUrl = `https://ticket-tracker-inky.vercel.app${url || '/'}`
    const message = {
      notification: {
        title: String(title).slice(0, 120),
        body: String(body || '').slice(0, 240),
      },
      webpush: {
        headers: { Urgency: 'high', TTL: '86400' },
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          ...(tag ? { tag } : {}),
        },
        fcmOptions: { link: absoluteUrl },
      },
    }

    const result = await admin.messaging().sendEachForMulticast({ tokens, ...message })

    // Clean up dead tokens
    const deletions = []
    result.responses.forEach((r, i) => {
      const code = r.error?.code || ''
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
        deletions.push(admin.firestore().collection('push_tokens').doc(tokens[i]).delete())
      }
    })
    await Promise.allSettled(deletions)

    return res.json({ sent: result.successCount, failed: result.failureCount, cleaned: deletions.length })
  } catch (err) {
    console.error('send-push error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
