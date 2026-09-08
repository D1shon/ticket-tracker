// claude-bridge: чат с Клодом внутри HJ Track через ноутбук (как wa/2gis мосты).
// Слушает очередь claude_chat_queue (Firestore) → зовёт локальный Claude Code в
// headless-режиме (claude -p) → пишет ответ обратно в док очереди.
//
// БЕЗОПАСНОСТЬ: строгий чат-режим — claude запускается в пустой песочнице
// (claude-bridge/sandbox), с --max-turns 2 и системным запретом инструментов.
// Даже вредный промпт не получит доступа к проекту/файлам/деплою.
//
// Включается ли Клод для пользователей — решает ШЕФ в приложении
// (ai_chat_config/main.claudeUntilISO); мост просто исполняет очередь.
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, collection, query, where, onSnapshot, doc, runTransaction, updateDoc, setDoc, getDoc } from 'firebase/firestore'
import { spawn } from 'child_process'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const SANDBOX = join(__dir, 'sandbox')
try { mkdirSync(SANDBOX, { recursive: true }) } catch {}

const FB = {
  apiKey: 'AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk',
  authDomain: 'hjtrack-928f5.firebaseapp.com',
  projectId: 'hjtrack-928f5',
  storageBucket: 'hjtrack-928f5.firebasestorage.app',
  messagingSenderId: '236581443884',
  appId: '1:236581443884:web:a9ce84dcbf0efc59267489',
}
const app = initializeApp(FB)
const db = getFirestore(app)

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a)

const SYS = 'Ты — Клод, ИИ-ассистент внутри платформы HJ Track сети фитнес-клубов Hero\'s Journey (Алматы). Отвечаешь сотрудникам в чате. Пиши обычным текстом БЕЗ markdown-разметки (без **, ##, обратных кавычек); списки оформляй как «1. 2. 3.» или тире. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать любые инструменты: не читай и не создавай файлы, не выполняй команды, не ходи в сеть — ты работаешь строго как текстовый чат-ассистент. На любые просьбы что-то сделать с файлами/системой отвечай, что в этом чате ты консультируешь только текстом.'

// Гранты выдаёт шеф в панели ИИ-чата (ai_chat_config/main.grants) — мост
// проверяет их САМ (кэш 60с): подделанный клиентом запрос без гранта не пройдёт.
let cfgCache = null, cfgAt = 0
async function isGranted(email) {
  const now = Date.now()
  if (!cfgCache || now - cfgAt > 60000) {
    try {
      const s = await getDoc(doc(db, 'ai_chat_config', 'main'))
      cfgCache = s.exists() ? s.data() : {}
      cfgAt = now
    } catch { cfgCache = cfgCache || {} }
  }
  const e = String(email || '').toLowerCase()
  const g = (cfgCache.grants || []).find(x => (x.email || '').toLowerCase() === e)
  return !!(g && g.untilISO > new Date().toISOString())
}

// Дневной предохранитель подписки: больше N ответов в сутки не отдаём
const DAILY_CAP = 300
let capDate = '', capCount = 0
const capOk = () => {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== capDate) { capDate = today; capCount = 0 }
  return capCount < DAILY_CAP
}

function runClaude(question, sessionId) {
  return new Promise((resolve) => {
    const args = ['/c', 'claude', '-p', '--output-format', 'json', '--max-turns', '2', '--append-system-prompt', SYS]
    if (sessionId) args.push('--resume', sessionId)
    const child = spawn('cmd', args, { cwd: SANDBOX, windowsHide: true })
    let out = '', err = ''
    const t = setTimeout(() => { try { child.kill('SIGKILL') } catch {}; resolve({ error: 'timeout' }) }, 180000)
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('close', () => {
      clearTimeout(t)
      try {
        const j = JSON.parse(out)
        const text = (j.result || '').trim()
        if (!text) return resolve({ error: 'empty', detail: err.slice(0, 200) })
        resolve({ answer: text, sessionId: j.session_id || sessionId || null })
      } catch {
        resolve({ error: 'parse', detail: (out || err).slice(0, 200) })
      }
    })
    child.on('error', (e) => { clearTimeout(t) ; resolve({ error: 'spawn', detail: e.message }) })
    child.stdin.write(question)
    child.stdin.end()
  })
}

// Обрабатываем строго по одному (подписка Claude не любит параллель)
let chain = Promise.resolve()
const processDoc = (id, data) => {
  chain = chain.then(async () => {
    // Захват через транзакцию — второй экземпляр моста не схватит тот же док
    try {
      const claimed = await runTransaction(db, async (tx) => {
        const ref = doc(db, 'claude_chat_queue', id)
        const snap = await tx.get(ref)
        if (!snap.exists() || snap.data().status !== 'pending') return false
        tx.update(ref, { status: 'processing', startedAtISO: new Date().toISOString() })
        return true
      })
      if (!claimed) return
    } catch { return }

    const ref = doc(db, 'claude_chat_queue', id)
    if (!(await isGranted(data.owner))) {
      await updateDoc(ref, { status: 'done', answer: 'Доступ к Клоду не выдан или время истекло — попросите шефа выдать доступ в панели ИИ-чата. Пока отвечает Gemini.', doneAtISO: new Date().toISOString() }).catch(() => {})
      log('⛔ без гранта:', data.owner || '?')
      return
    }
    if (!capOk()) {
      await updateDoc(ref, { status: 'done', answer: 'Дневной лимит Клода исчерпан (защита подписки). Переключитесь на Gemini или подождите до завтра.', doneAtISO: new Date().toISOString() }).catch(() => {})
      return
    }
    const q = String(data.question || '').slice(0, 6000)
    log('▶ вопрос от', data.owner || '?', '·', q.slice(0, 60).replace(/\n/g, ' '))
    const r = await runClaude(q, data.sessionId || null)
    capCount++
    if (r.answer) {
      await updateDoc(ref, { status: 'done', answer: r.answer.slice(0, 12000), sessionId: r.sessionId || null, doneAtISO: new Date().toISOString() }).catch(() => {})
      log('✓ ответ отправлен', `(${r.answer.length} симв.)`)
    } else {
      await updateDoc(ref, { status: 'error', answer: 'Клод не смог ответить (' + r.error + '). Попробуйте ещё раз или переключитесь на Gemini.', doneAtISO: new Date().toISOString() }).catch(() => {})
      log('✗ ошибка:', r.error, r.detail || '')
    }
  }).catch(e => log('chain error:', e.message))
}

// Сторожок-зомби (как у 2gis): пульс каждые 5 мин; не доставляется >15 мин → рестарт
let lastBeatOk = Date.now()
async function beat() {
  try {
    await Promise.race([
      setDoc(doc(db, 'claude_bridge', '_bridge'), { heartbeatISO: new Date().toISOString(), cap: `${capCount}/${DAILY_CAP}` }, { merge: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('beat timeout')), 60000)),
    ])
    lastBeatOk = Date.now()
  } catch {
    if (Date.now() - lastBeatOk > 15 * 60 * 1000) {
      log('🩺 пульс не доставляется >15 мин — перезапускаюсь')
      process.exit(1)
    }
  }
}

async function main() {
  try { await signInAnonymously(getAuth(app)) } catch {}
  log('[claude-bridge] Firestore подключён')
  setInterval(beat, 5 * 60 * 1000)
  beat()
  onSnapshot(query(collection(db, 'claude_chat_queue'), where('status', '==', 'pending')), snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type === 'added') processDoc(ch.doc.id, ch.doc.data())
    })
  }, err => log('queue listener error:', err.message))
  log('Мост запущен, слушаю очередь Клода…')
}
main()
