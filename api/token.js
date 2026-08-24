import crypto from 'crypto'

// Выпуск JWT (HS256) для интеграции. Payload: { club, role, iat, exp }.
// Подпись — секретом TOKEN_SECRET (env Vercel). Тем же секретом другая сторона
// ВАЛИДИРУЕТ токен (симметрично). Это server-to-server: секрет по сети не гуляет
// в браузер — endpoint дёргают только доверенные системы.
//
// Аутентификация вызова: тот же TOKEN_SECRET в заголовке
// Authorization: Bearer <secret>  или  x-issue-secret: <secret>  или  ?secret=
// (в HS256 кто может валидировать — тот и так может выпускать, отдельный ключ
//  ничего не усилит, поэтому используем один).

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const signJwt = (payload, secret) => {
  const header = { alg: 'HS256', typ: 'JWT' }
  const seg = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = crypto.createHmac('sha256', secret).update(seg).digest()
  return `${seg}.${b64url(sig)}`
}

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY']
const MAX_TTL = 60 * 60 * 24 * 30 // 30 дней — потолок
const DEFAULT_TTL = 60 * 60 * 24  // 24 часа

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-issue-secret, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const secret = (process.env.TOKEN_SECRET || '').trim()
  if (!secret) return res.status(500).json({ error: 'TOKEN_SECRET is not configured' })

  const given = String(req.headers['x-issue-secret']
    || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    || req.query?.secret
    || req.body?.secret
    || '').trim()
  if (given !== secret) return res.status(403).json({ error: 'forbidden' })

  const b = req.body ?? {}
  const club = String(b.club || '').trim().toUpperCase()
  const role = String(b.role || '').trim().toLowerCase()
  if (!club) return res.status(400).json({ error: 'club required' })
  if (!role) return res.status(400).json({ error: 'role required' })
  if (!CLUBS.includes(club)) return res.status(400).json({ error: `unknown club, expected one of: ${CLUBS.join(', ')}` })

  let ttl = parseInt(b.ttl, 10)
  if (!Number.isFinite(ttl) || ttl <= 0) ttl = DEFAULT_TTL
  ttl = Math.min(ttl, MAX_TTL)

  const now = Math.floor(Date.now() / 1000)
  const payload = { club, role, iat: now, exp: now + ttl }
  const token = signJwt(payload, secret)

  return res.json({ token, club, role, exp: payload.exp, expiresInSec: ttl })
}
