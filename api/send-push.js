import admin from 'firebase-admin'

// Роли, легитимно видящие все клубы (token.club=null по задумке). Только им клубный
// пуш уходит без совпадения клуба; всем остальным — строго по своему клубу.
const GLOBAL_ROLES = new Set(['chef', 'komdir', 'viewer']) // синхронно с pushNotify.js и колокольчиком

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

  // Временно: НЕ рассылаем push-итоги WhatsApp (по запросу). Анализ в ленте
  // продолжает работать. Чтобы вернуть WhatsApp-уведомления — удалить этот блок.
  if (/whatsapp/i.test(String(title))) {
    return res.json({ sent: 0, reason: 'whatsapp push disabled' })
  }

  try {
    let tokens = []
    if (Array.isArray(clientTokens) && clientTokens.length > 0) {
      // Recipient list resolved by the client (client SDK reads are not
      // affected by the admin-quota issue on the Spark plan)
      tokens = clientTokens.filter(t => typeof t === 'string' && t.length > 20).slice(0, 500)
    } else {
      const allTokens = await getAllTokens()
      const exclude = (excludeEmail || '').toLowerCase()
      const clubNorm = (club || '').toUpperCase()
      allTokens.forEach(t => {
        if (exclude && (t.email || '').toLowerCase() === exclude) return
        // Клубный пуш → только точный клуб ИЛИ глобальная роль (шеф/Ком-Дир).
        // Пустой/чужой клуб у обычной роли НЕ получает (фикс межклубной утечки).
        if (club) {
          const tClub = (t.club || '').toUpperCase()
          const inClubs = Array.isArray(t.clubs) && t.clubs.some(c => (c || '').toUpperCase() === clubNorm)
          if (!GLOBAL_ROLES.has(t.role || '') && tClub !== clubNorm && !inClubs) return
        }
        tokens.push(t.token)
      })
    }

    // РОП получают ТОЛЬКО Demo Day и «Новый лид» — больше ничего вообще.
    // Централизованно вырезаем токены роли 'rop' из любого другого пуша,
    // кем бы он ни был инициирован (клиент, мост, облачная рутина).
    const ropAllowed = /demo day|demo-day|лид|lead/i.test(String(title)) || tag === 'demo-day' || /^lead/i.test(String(tag || '')) || tag === 'shift-board'
    if (!ropAllowed) {
      try {
        const all = await getAllTokens()
        const ropSet = new Set(all.filter(t => (t.role || '') === 'rop').map(t => t.token))
        if (ropSet.size) tokens = tokens.filter(tk => !ropSet.has(tk))
      } catch {}
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
