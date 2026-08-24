// Шлюз в Slack: платформа и мосты шлют сюда { text }, мы пересылаем в канал.
// URL вебхука хранится в переменной окружения Vercel — в коде и бандле его нет.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  // channel: 'instudio' → канал #in-studio-chat (свой вебхук), иначе — канал по умолчанию
  const channel = String(req.body?.channel || '').trim()
  const url = channel === 'instudio'
    ? process.env.SLACK_WEBHOOK_INSTUDIO
    : process.env.SLACK_WEBHOOK_URL
  if (!url) return res.status(500).json({ error: `webhook for channel "${channel || 'default'}" is not configured` })

  const text = String(req.body?.text || '').slice(0, 3000)
  if (!text.trim()) return res.status(400).json({ error: 'text required' })

  try {
    // charset указан явно — кириллица доходит целой при любом клиенте
    const r = await fetch(url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ text }),
    })
    if (!r.ok) throw new Error(`slack ${r.status}: ${(await r.text()).slice(0, 100)}`)
    return res.json({ ok: true })
  } catch (e) {
    console.error('slack-notify:', e.message)
    // Диагностика без раскрытия секрета: длина и валидность формата URL
    return res.status(502).json({
      error: 'slack delivery failed',
      detail: e.message.slice(0, 120),
      envLen: url.length,
      looksValid: /^https:\/\/hooks\.slack\.com\/services\/\S+$/.test(url.trim()),
    })
  }
}
