// Общий клиент Vertex AI (Gemini) для серверных функций: токен по сервисному
// аккаунту проекта (env FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY, роль
// aiplatform.user), биллинг — проект hjtrack, без отдельного GEMINI_API_KEY.
import crypto from 'node:crypto'

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
let tokenCache = { token: null, exp: 0 }

export async function vertexToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60_000) return tokenCache.token
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) throw new Error('FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY not set')
  const now = Math.floor(Date.now() / 1000)
  const head = b64url({ alg: 'RS256', typ: 'JWT' })
  const body = b64url({ iss: clientEmail, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${body}.${sig}`,
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('vertex token: ' + JSON.stringify(j).slice(0, 200))
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }
  return j.access_token
}

// generate({ system, contents | prompt, model, json, temperature, maxOutputTokens, thinkingBudget })
// → текст ответа (или распарсенный JSON при json:true). Один повтор на 429/503.
export async function vertexGenerate({ system = '', contents = null, prompt = '', model = 'gemini-2.5-flash', json = false, temperature = 0.2, maxOutputTokens = 4096, thinkingBudget = null }) {
  const token = await vertexToken()
  const project = process.env.FIREBASE_PROJECT_ID || 'hjtrack-928f5'
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`
  const generationConfig = { temperature, maxOutputTokens }
  if (json) generationConfig.responseMimeType = 'application/json'
  if (thinkingBudget !== null) generationConfig.thinkingConfig = { thinkingBudget }
  const body = JSON.stringify({
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: contents || [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  })
  let r
  for (let attempt = 0; attempt < 2; attempt++) {
    r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body })
    if (r.ok || (r.status !== 503 && r.status !== 429)) break
    await new Promise(res => setTimeout(res, 1200))
  }
  const j = await r.json()
  if (!r.ok) throw new Error('vertex ' + r.status + ': ' + JSON.stringify(j.error || j).slice(0, 300))
  const text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
  if (!json) return text
  try { return JSON.parse(text) } catch { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) }
}
