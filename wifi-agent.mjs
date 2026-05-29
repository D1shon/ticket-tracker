/**
 * HJTRACK WiFi Check-in Agent
 * ============================
 * Запустить: node wifi-agent.mjs
 *
 * Агент сам определяет, к какому клубу он относится:
 *   1. Читает из Firestore коллекцию wifi_clubs (там хранятся IP роутеров)
 *   2. Определяет IP шлюза (роутера) текущей сети
 *   3. Сравнивает — если совпало, значит это его клуб
 *
 * Установка:
 *   npm install firebase
 *
 * Затем:
 *   node wifi-agent.mjs
 */

import { initializeApp }        from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc, query, where } from 'firebase/firestore';
import { execSync }             from 'child_process';
import os                       from 'os';

// ── Firebase config ───────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk",
  authDomain:        "hjtrack-928f5.firebaseapp.com",
  projectId:         "hjtrack-928f5",
  storageBucket:     "hjtrack-928f5.firebasestorage.app",
  messagingSenderId: "236581443884",
  appId:             "1:236581443884:web:a9ce84dcbf0efc59267489",
};

const INTERVAL   = 20_000;   // сканировать каждые 20 сек
const MISS_LIMIT = 2;        // пропусков до offline (~40 сек)
// ──────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const missCount = {};  // { mac: число_пропусков }
let CLUB_ID = null;   // определится автоматически
let SUBNET_PREFIX = null; // например "192.168.88"

// ── Определить IP шлюза (роутера) текущей сети ───────────────────────
function getGatewayIp() {
  try {
    const platform = os.platform();

    if (platform === 'win32') {
      // Метод 1: route print — самый надёжный
      try {
        const out = execSync('route print 0.0.0.0', { timeout: 8000 }).toString();
        // Ищем строку: 0.0.0.0   0.0.0.0   192.168.x.x
        const lines = out.split('\n');
        for (const line of lines) {
          const m = line.match(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+([\d.]+)/);
          if (m && m[1] !== '0.0.0.0') return m[1].trim();
        }
      } catch {}

      // Метод 2: ipconfig — запасной
      const out = execSync('ipconfig', { timeout: 8000 }).toString();
      const matches = [...out.matchAll(/(?:Default Gateway|Основной шлюз|шлюз по умолчанию)[^:]*:\s*([\d.]+)/gi)];
      const gateways = matches.map(m => m[1]).filter(ip => ip && ip !== '0.0.0.0');
      return gateways[0] || null;
    }

    if (platform === 'linux') {
      const out = execSync('ip route show default', { timeout: 5000 }).toString();
      const m = out.match(/default via ([\d.]+)/);
      return m ? m[1].trim() : null;
    }

    if (platform === 'darwin') {
      const out = execSync('netstat -nr | grep default', { timeout: 5000 }).toString();
      const m = out.match(/default\s+([\d.]+)/);
      return m ? m[1].trim() : null;
    }

    return null;
  } catch (err) {
    console.error('[agent] Не удалось определить шлюз:', err.message);
    return null;
  }
}


// ── Найти клуб по IP шлюза ────────────────────────────────────────────
async function detectClub() {
  const gatewayIp = getGatewayIp();
  if (!gatewayIp) {
    console.error('[agent] ❌ Не удалось определить IP шлюза. Проверьте подключение к сети.');
    return null;
  }

  console.log(`[agent] Шлюз сети: ${gatewayIp}`);

  // Читаем все клубы из Firestore
  const snap = await getDocs(collection(db, 'wifi_clubs'));
  for (const d of snap.docs) {
    const data = d.data();
    if (data.routerIp && data.routerIp.trim() === gatewayIp) {
      console.log(`[agent] ✅ Клуб определён: ${data.clubId || d.id} (IP: ${data.routerIp})`);
      return data.clubId || d.id;
    }
  }

  console.error(`[agent] ❌ Клуб с роутером ${gatewayIp} не найден в базе.`);
  console.error(`[agent]    Добавьте IP роутера в разделе "Чекин" веб-приложения.`);
  return null;
}

// ── Получить собственные MAC-адреса этой машины ───────────────────────
function getOwnMacs() {
  const macs = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macs.push(iface.mac.toUpperCase());
      }
    }
  }
  return macs;
}

// ── Определить подсеть из шлюза (192.168.88.1 → 192.168.88) ──────────
function getSubnetPrefix(gatewayIp) {
  if (!gatewayIp) return null;
  const parts = gatewayIp.split('.');
  return parts.slice(0, 3).join('.');
}

// ── Ping sweep: пингуем всю подсеть чтобы телефоны появились в ARP ───
async function pingSubnet(subnetPrefix) {
  if (!subnetPrefix) return;
  const platform = os.platform();
  const pingCmd  = platform === 'win32'
    ? (ip) => `ping -n 1 -w 300 ${ip}`
    : (ip) => `ping -c 1 -W 1 ${ip}`;

  console.log(`[agent] 📡 Ping sweep ${subnetPrefix}.1–254 ...`);
  const promises = [];
  for (let i = 1; i <= 254; i++) {
    const ip = `${subnetPrefix}.${i}`;
    promises.push(
      new Promise(resolve => {
        try { execSync(pingCmd(ip), { timeout: 400, stdio: 'ignore' }); } catch {}
        resolve();
      })
    );
  }
  // Запускаем параллельно пачками по 30
  for (let i = 0; i < promises.length; i += 30) {
    await Promise.all(promises.slice(i, i + 30));
  }
  console.log(`[agent] 📡 Ping sweep завершён`);
}

// ── Получить ARP-таблицу + собственные MAC ────────────────────────────
function getArpMacs() {
  try {
    const out = execSync('arp -a', { timeout: 10000 }).toString();
    const macs = [];
    for (const line of out.split('\n')) {
      // Windows: aa-bb-cc-dd-ee-ff  |  Linux/Mac: aa:bb:cc:dd:ee:ff
      const m = line.match(/([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}/);
      if (m) {
        const mac = m[0].replace(/-/g, ':').toUpperCase();
        if (!mac.startsWith('FF:FF') && !mac.startsWith('00:00')) {
          macs.push(mac);
        }
      }
    }
    // Добавляем собственные MAC-адреса (arp -a не показывает сам себя)
    const ownMacs = getOwnMacs();
    for (const mac of ownMacs) {
      macs.push(mac);
    }
    return [...new Set(macs)]; // убираем дубли
  } catch (err) {
    console.error('[agent] arp error:', err.message);
    return [];
  }
}

// ── Основной цикл сканирования ────────────────────────────────────────
async function scan() {
  if (!CLUB_ID) return;

  const now     = new Date();
  const today   = now.toISOString().split('T')[0];
  const nowIso  = now.toISOString();
  const timeStr = now.toLocaleTimeString('ru-RU');

  console.log(`\n[${timeStr}] Сканирование (${CLUB_ID})...`);

  // Читаем сотрудников клуба
  let employees = [];
  try {
    const q = query(collection(db, 'wifi_employees'), where('clubId', '==', CLUB_ID));
    const snap = await getDocs(q);
    employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[agent] Firestore read error:', err.message);
    return;
  }

  if (employees.length === 0) {
    console.log('[agent] Нет зарегистрированных сотрудников.');
    return;
  }

  // 📡 Ping sweep — принуждаем телефоны ответить и появиться в ARP
  await pingSubnet(SUBNET_PREFIX);

  // Получаем текущие MAC-адреса в сети
  const connectedMacs = getArpMacs();
  console.log(`[agent] Устройств в сети: ${connectedMacs.length}`);

  for (const emp of employees) {
    const mac       = (emp.macAddress || '').toUpperCase();
    const sessionId = `${today}_${mac.replace(/:/g, '')}`;
    const sessionRef = doc(db, 'wifi_sessions', sessionId);
    const isPresent  = connectedMacs.includes(mac);

    if (isPresent) {
      missCount[mac] = 0;
      console.log(`  ✅ ${emp.name} — в сети`);

      try {
        // Сначала пробуем создать сессию без перезаписи arrivedAt
        const existing = await getDocs(
          query(collection(db, 'wifi_sessions'),
            where('macAddress', '==', mac),
            where('date', '==', today))
        );

        if (existing.empty) {
          // Первый раз сегодня — пишем arrivedAt
          await setDoc(sessionRef, {
            clubId: CLUB_ID, employeeId: emp.id, name: emp.name,
            macAddress: mac, date: today,
            arrivedAt: nowIso, lastSeen: nowIso, isOnline: true,
          });
          console.log(`  📍 Зафиксирован приход: ${emp.name} в ${now.toLocaleTimeString('ru-RU')}`);
        } else {
          // Уже был сегодня — обновляем lastSeen и isOnline, НЕ трогаем arrivedAt
          await setDoc(sessionRef, { isOnline: true, lastSeen: nowIso }, { merge: true });
        }
      } catch (err) {
        console.error(`  [agent] Ошибка записи для ${emp.name}:`, err.message);
      }

    } else {
      missCount[mac] = (missCount[mac] || 0) + 1;

      if (missCount[mac] >= MISS_LIMIT) {
        // Проверяем: только что ушёл (первый раз переходим в offline) или уже был offline
        const wasOnline = existing && !existing.empty && existing.docs[0]?.data()?.isOnline === true;
        console.log(`  ❌ ${emp.name} — ушёл (${missCount[mac]} пропуска)`);
        try {
          const update = { isOnline: false, lastSeen: nowIso };
          if (wasOnline) {
            // Фиксируем точное время ухода
            update.leftAt = nowIso;
            console.log(`  🚪 Зафиксирован уход: ${emp.name} в ${now.toLocaleTimeString('ru-RU')}`);
          }
          await setDoc(sessionRef, update, { merge: true });
        } catch (err) {
          console.error(`  [agent] Ошибка записи для ${emp.name}:`, err.message);
        }
      } else {
        console.log(`  ⏳ ${emp.name} — не виден (${missCount[mac]}/${MISS_LIMIT})`);
      }
    }
  }
}

// ── Heartbeat ─────────────────────────────────────────────────────────
async function sendHeartbeat() {
  if (!CLUB_ID) return;
  try {
    await setDoc(doc(db, 'wifi_agents', CLUB_ID), {
      clubId: CLUB_ID, lastSeen: new Date().toISOString(), host: os.hostname(),
    }, { merge: true });
  } catch (err) {
    console.error('[agent] Heartbeat error:', err.message);
  }
}

// ── Пометить всех оффлайн при завершении ─────────────────────────────
async function markAllOffline() {
  if (!CLUB_ID) return;
  console.log('\n[agent] 🔴 Завершение — помечаю всех сотрудников оффлайн...');
  try {
    const nowIso = new Date().toISOString();
    const today  = nowIso.split('T')[0];
    const q = query(collection(db, 'wifi_sessions'),
      where('clubId', '==', CLUB_ID),
      where('date',   '==', today),
      where('isOnline', '==', true));
    const snap = await getDocs(q);
    const updates = snap.docs.map(d =>
      setDoc(d.ref, { isOnline: false, lastSeen: nowIso, leftAt: nowIso }, { merge: true })
    );
    await Promise.all(updates);
    // Сбросить heartbeat агента
    await setDoc(doc(db, 'wifi_agents', CLUB_ID), {
      clubId: CLUB_ID, lastSeen: new Date(0).toISOString(), host: os.hostname(),
    }, { merge: true });
    console.log(`[agent] ✅ ${snap.docs.length} сотрудников помечено оффлайн`);
  } catch (err) {
    console.error('[agent] Ошибка при завершении:', err.message);
  }
}

// ── Старт ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   HJTRACK WiFi Agent v3.0            ║');
  console.log('║   Телефоны: Ping Sweep Mode          ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Определяем клуб
  CLUB_ID = await detectClub();
  if (!CLUB_ID) {
    console.error('\n[agent] Остановлен. Зарегистрируйте IP роутера в веб-приложении.');
    process.exit(1);
  }

  // Определяем подсеть для ping sweep
  const gateway = getGatewayIp();
  SUBNET_PREFIX = getSubnetPrefix(gateway);
  console.log(`[agent] Подсеть: ${SUBNET_PREFIX}.0/24`);

  console.log(`\n[agent] Запущен для клуба: ${CLUB_ID}`);
  console.log(`[agent] Интервал сканирования: ${INTERVAL / 1000} сек\n`);

  // Graceful shutdown — при Ctrl+C или закрытии окна
  const shutdown = async (signal) => {
    console.log(`\n[agent] Получен сигнал ${signal}`);
    await markAllOffline();
    process.exit(0);
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Первый скан сразу
  await scan();
  await sendHeartbeat();

  setInterval(scan,          INTERVAL);
  setInterval(sendHeartbeat, 60_000);
}

main().catch(console.error);
