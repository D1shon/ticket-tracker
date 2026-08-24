// WhatsApp мост HJ Track — мультиклубный, управляется из платформы.
// На каждый клуб — своя сессия (wa-bridge/auth/<club>). Подключение запускается
// кнопкой в платформе: она пишет { request: 'connect' } в wa_bridge/<club>,
// мост стримит QR прямо в этот документ, платформа его рисует.
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import QR from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, collection, onSnapshot, getDoc, getDocs } from 'firebase/firestore';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];
const authDir = (club) => path.join(ROOT, 'auth', club.replace(/\s+/g, '_'));

const fb = initializeApp({
  apiKey: 'AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk',
  authDomain: 'hjtrack-928f5.firebaseapp.com',
  projectId: 'hjtrack-928f5',
  storageBucket: 'hjtrack-928f5.firebasestorage.app',
  messagingSenderId: '236581443884',
  appId: '1:236581443884:web:a9ce84dcbf0efc59267489',
});

const log = (club, ...a) => console.log(new Date().toISOString().slice(11, 19), `[${club}]`, ...a);
const sessions = {}; // club -> { active, sock }

// ─── Лиды для Ком-Дира: входящие про цены/абонементы/билеты ────────────────
const LEAD_PATTERNS = [
  /стоимост/i, /сколько\s+стоит/i, /прайс/i, /тариф/i, /абонемент/i, /билет/i,
  /цен[аыуе]\b/i, /цен[аыуе][^а-яё]/i, /какие\s+.{0,12}цен/i, /ценник/i,
  /купить/i, /оплат/i, /пробн(ое|ая|ый|ую)/i, /разов(ое|ая|ую)/i, /рассрочк/i, /скидк/i,
  /бағас/i, /қанша\s+тұрады/i, /канша\s+турады/i,
];
const leadMatch = (text) => {
  const t = ` ${text} `;
  const hit = LEAD_PATTERNS.find(re => re.test(t));
  return hit ? String(hit).replace(/^\/|\/i$/g, '') : null;
};
const almatyDay = (iso) => new Date(new Date(iso).getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);

// Настоящий телефон только из JID вида <номер>@s.whatsapp.net.
// Формат @lid — это внутренний ID WhatsApp, НЕ телефон (по нему не позвонить).
function realPhone(...jids) {
  for (const j of jids) {
    if (typeof j === 'string' && j.endsWith('@s.whatsapp.net')) {
      const num = j.replace(/@.*$/, '').replace(/[^\d]/g, '');
      if (num.length >= 10 && num.length <= 15) return num;
    }
  }
  return null;
}

async function maybeCreateLead(db, club, { jid, phone, chatName, text, timestampISO, context }) {
  const matched = leadMatch(text);
  if (!matched) return;
  // одна заявка на чат в день — первое ценовое сообщение побеждает
  const leadId = `${club.replace(/\s+/g, '')}_${jid.replace(/[^\w]/g, '')}_${almatyDay(timestampISO)}`;
  const ref = doc(db, 'sales_leads', leadId);
  if ((await getDoc(ref)).exists()) return;

  // Умный фильтр по СМЫСЛУ: ключевые слова — лишь пред-фильтр. Спрашиваем ИИ, реально
  // ли это запрос на покупку (новый клиент), а не мусор (жалоба/бытовуха/действующий
  // участник/«парковка со скидкой»/«нужно 5 билетов»). Ошибка/недоступность → создаём
  // лид как раньше (fail-open: лучше лишний лид, чем потерянный настоящий).
  try {
    const cr = await fetch('https://ticket-tracker-inky.vercel.app/api/assistant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classifyLead: text, context: Array.isArray(context) ? context : [] }),
    });
    const cj = await cr.json().catch(() => ({ lead: true }));
    if (cj && cj.lead === false) {
      log(club, '🚫 не лид (по смыслу):', cj.reason ? `[${cj.reason}]` : '', text.slice(0, 60));
      return;
    }
  } catch (e) { log(club, 'классиф. лида недоступна, создаю как обычно:', e.message); }

  await setDoc(ref, {
    club,
    chatJid: jid,
    chatName: chatName || '',
    phone: phone || null,     // настоящий номер (в т.ч. восстановленный из LID) или null
    hasPhone: !!phone,
    text: text.slice(0, 500),
    matched,
    status: 'new',
    handledBy: null,
    handledAtISO: null,
    timestampISO,
    createdAtISO: new Date().toISOString(),
  });
  log(club, '💰 лид:', chatName || jid.slice(0, 14), phone ? `(+${phone})` : '(без номера, LID)', '—', text.slice(0, 60));

  // push Ком-Диру
  try {
    const snap = await getDocs(collection(db, 'push_tokens'));
    // Ком-Дир (club=null) получает лиды всех клубов, РОП — только своего
    const tokens = snap.docs.filter(d => {
      const t = d.data();
      if (t.role === 'komdir') return true;
      if (t.role === 'rop') return !t.club || (t.club || '').toUpperCase() === club.toUpperCase();
      return false;
    }).map(d => d.id);
    if (tokens.length) {
      await fetch('https://ticket-tracker-inky.vercel.app/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `💰 Новый лид · ${club}`,
          body: `${chatName || 'Клиент'}: ${text.slice(0, 90)}`,
          url: '/leads',
          tag: `lead-${leadId}`,
          tokens,
        }),
      });
    }
  } catch (e) { log(club, 'push лида не ушёл:', e.message); }
  // В Slack лиды НЕ шлём — там только открытие/закрытие смены (решение 2026-07-16)
}

async function main() {
  // анонимный вход с ретраями (сеть бывает моргает)
  for (let i = 0; ; i++) {
    try { await signInAnonymously(getAuth(fb)); break; }
    catch (e) { if (i >= 5) throw e; console.log('auth retry…'); await new Promise(r => setTimeout(r, 5000)); }
  }
  const db = getFirestore(fb);
  console.log('[bridge] Firestore подключён');


  const setStatus = (club, data) =>
    setDoc(doc(db, 'wa_bridge', club), { ...data, updatedAtISO: new Date().toISOString() }, { merge: true }).catch(() => {});

  const extractText = (m) =>
    m.message?.conversation
    || m.message?.extendedTextMessage?.text
    || m.message?.imageMessage?.caption
    || m.message?.videoMessage?.caption
    || '';

  async function startClub(club, { allowQr }) {
    if (sessions[club]?.active) { log(club, 'уже активен'); return; }
    const hasCreds = fs.existsSync(path.join(authDir(club), 'creds.json'));
    if (!hasCreds && !allowQr) return; // без запроса из платформы QR не светим
    sessions[club] = { active: true };

    const { state, saveCreds } = await useMultiFileAuthState(authDir(club));
    const sock = makeWASocket({ auth: state, syncFullHistory: false });
    sessions[club].sock = sock;
    let qrCount = 0;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr && allowQr) {
        qrCount++;
        if (qrCount > 5) { // ~3 минуты на скан, потом гасим
          log(club, 'QR не отсканирован, останавливаюсь');
          await setStatus(club, { status: 'idle', qrDataUrl: null });
          try { sock.end(); } catch {}
          sessions[club].active = false;
          return;
        }
        const qrDataUrl = await QR.toDataURL(qr, { width: 360, margin: 1 });
        await setStatus(club, { status: 'awaiting_qr', qrDataUrl });
        log(club, `QR №${qrCount} отправлен в платформу`);
      }
      if (connection === 'open') {
        const phone = (sock.user?.id || '').split(':')[0].split('@')[0];
        await setStatus(club, { status: 'connected', phone, qrDataUrl: null });
        log(club, '✅ подключено:', phone);
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        sessions[club].active = false;
        log(club, 'соединение закрыто, код', code);
        if (code === DisconnectReason.loggedOut) {
          try { fs.rmSync(authDir(club), { recursive: true, force: true }); } catch {}
          await setStatus(club, { status: 'idle', phone: null, qrDataUrl: null });
          log(club, 'сессия разлогинена, ключи удалены');
        } else if (fs.existsSync(path.join(authDir(club), 'creds.json'))) {
          await setStatus(club, { status: 'reconnecting', qrDataUrl: null });
          setTimeout(() => startClub(club, { allowQr: false }), 7000);
        } else {
          await setStatus(club, { status: 'idle', qrDataUrl: null });
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;
      for (const m of messages) {
        try {
          const jid = m.key.remoteJid || '';
          if (jid === 'status@broadcast') continue;
          // Группы, рассылки и каналы не читаем — только личные переписки с клиентами
          if (jid.endsWith('@g.us') || jid.endsWith('@newsletter') || jid.endsWith('@broadcast')) continue;
          const text = extractText(m);
          const hasMedia = !!(m.message?.imageMessage || m.message?.videoMessage || m.message?.audioMessage || m.message?.documentMessage || m.message?.stickerMessage);
          if (!text && !hasMedia) continue;

          // ── Реальный номер: сначала прямой @s.whatsapp.net, иначе LID → номер ──
          // Baileys 7 хранит соответствие LID↔номер и отдаёт его через lidMapping.
          const altJid = m.key.remoteJidAlt || m.key.senderPnJid || m.key.participantAlt || null;
          let phone = realPhone(jid, altJid);
          if (!phone) {
            const lid = [jid, altJid].find(j => typeof j === 'string' && j.endsWith('@lid'));
            if (lid) {
              sessions[club].pn = sessions[club].pn || {};
              if (sessions[club].pn[lid]) {
                phone = sessions[club].pn[lid];
              } else {
                try {
                  const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(lid);
                  const num = realPhone(pn);
                  if (num) { phone = num; sessions[club].pn[lid] = num; }
                } catch {}
              }
            }
          }
          // Канонический JID чата: номерной, если номер известен — тогда одна и та же
          // переписка не дробится на «LID-чат» и «номерной чат».
          const contactJid = phone ? `${phone}@s.whatsapp.net` : jid;
          // Имя приходит только во входящих (pushName). Запоминаем его на сессию и
          // подставляем в исходящие — иначе переписка выглядит безымянной.
          sessions[club].names = sessions[club].names || {};
          if (m.pushName) sessions[club].names[contactJid] = m.pushName;
          const chatName = m.pushName || sessions[club].names[contactJid] || '';

          await setDoc(doc(db, 'wa_messages', `${club.replace(/\s+/g, '')}_${m.key.id}`), {
            club,
            direction: m.key.fromMe ? 'out' : 'in',
            chatJid: contactJid,   // канонический — для корректной группировки диалога
            rawJid: jid,           // исходный JID (для отладки/истории)
            phone: phone || null,
            isGroup: false,
            chatName,
            text,
            hasMedia,
            timestampISO: new Date((Number(m.messageTimestamp) || 0) * 1000).toISOString(),
            source: 'bridge',
          }, { merge: true });
          log(club, m.key.fromMe ? '➡' : '⬅', (chatName || (phone ? '+' + phone : jid.slice(0, 14))) + ':', text.slice(0, 50));

          // Буфер последних сообщений по чату (в памяти сессии) — контекст для ИИ-классификатора.
          // Контекст берём ДО добавления текущего сообщения, затем дописываем текущее для будущих.
          sessions[club].hist = sessions[club].hist || {};
          const chatHist = sessions[club].hist;
          const priorCtx = (chatHist[contactJid] || []).slice(-10);
          if (text) chatHist[contactJid] = (chatHist[contactJid] || []).concat([{ dir: m.key.fromMe ? 'out' : 'in', text }]).slice(-12);

          // входящее личное сообщение про цены/абонементы → лид для Ком-Дира/РОП
          if (!m.key.fromMe && text) {
            await maybeCreateLead(db, club, {
              jid: contactJid,
              phone: phone || null,
              chatName,
              text,
              timestampISO: new Date((Number(m.messageTimestamp) || 0) * 1000).toISOString(),
              context: priorCtx,
            }).catch(e => log(club, 'лид не создан:', e.message));
          }
        } catch (e) {
          console.error(`[${club}] ошибка записи:`, e.message);
        }
      }
    });
  }

  // Контрольный канал: платформа пишет request → мост исполняет
  onSnapshot(collection(db, 'wa_bridge'), snap => {
    snap.docChanges().forEach(ch => {
      const club = ch.doc.id;
      const d = ch.doc.data();
      if (!CLUBS.includes(club) || !d.request) return;
      updateDoc(ch.doc.ref, { request: null }).catch(() => {});
      if (d.request === 'connect') {
        log(club, 'платформа запросила подключение');
        startClub(club, { allowQr: true });
      }
      if (d.request === 'disconnect') {
        log(club, 'платформа запросила отключение');
        try { sessions[club]?.sock?.logout(); } catch {}
      }
    });
  }, err => console.error('[bridge] control channel error:', err.message));

  // Автоподключение клубов с сохранённой сессией
  for (const club of CLUBS) {
    if (fs.existsSync(path.join(authDir(club), 'creds.json'))) {
      log(club, 'найдена сессия — автоподключение');
      startClub(club, { allowQr: false });
    } else {
      setStatus(club, { status: sessionsStatusInit(club) });
    }
  }
  function sessionsStatusInit() { return 'idle'; }

  // Пульс моста — платформа показывает «мост офлайн», если пульса нет >10 мин.
  // + Сторожок от «зомби» (как в 2gis-bridge): при обрыве связи с Firestore записи
  // не падают, а ВИСНУТ в очереди — процесс выглядит живым, но wa_messages тихо не
  // пишутся. Если пульс реально не доставлен >15 минут — выходим, start-bridge.bat
  // поднимает свежий процесс (переподключение без QR).
  let lastBeatOkAt = Date.now();
  const beat = async () => {
    const ok = await Promise.race([
      setDoc(doc(db, 'wa_bridge', '_bridge'), { aliveAtISO: new Date().toISOString() }, { merge: true })
        .then(() => true).catch(() => false),
      new Promise(r => setTimeout(() => r(false), 60 * 1000)), // висит >минуты = не доставлен
    ]);
    if (ok) lastBeatOkAt = Date.now();
    if (Date.now() - lastBeatOkAt > 15 * 60 * 1000) {
      console.log('🩺 сторожок: пульс не доставляется >15 мин (зомби-соединение) — перезапускаюсь');
      process.exit(1);
    }
  };
  beat();
  setInterval(beat, 5 * 60 * 1000);
}

main().catch(e => { console.error('[bridge] fatal:', e); process.exit(1); });
