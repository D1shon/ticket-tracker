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
 *
 * АВТООБНОВЛЕНИЕ: агент проверяет обновления в Firestore каждые 5 минут
 * и перезапускается сам если найдена новая версия.
 */

import { initializeApp }        from 'firebase/app';
import { getFirestore, collection, getDocs, getDoc, setDoc, doc, query, where } from 'firebase/firestore';
import { execSync, spawn }      from 'child_process';
import os                       from 'os';
import https                    from 'https';
import http                     from 'http';
import fs                       from 'fs';
import { fileURLToPath }        from 'url';
import path                     from 'path';

// ── Версия агента (менять при каждом обновлении) ──────────────────────
const AGENT_VERSION = '3.3';
const AGENT_FILE    = fileURLToPath(import.meta.url);
const UPDATE_URL    = 'https://ticket-tracker-inky.vercel.app/wifi-agent.mjs';

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

// ── АВТООБНОВЛЕНИЕ ────────────────────────────────────────────────────
async function checkForUpdate() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'agent'));
    if (!snap.exists()) return;

    const data = snap.data();
    const latestVersion = data.version;
    const updateUrl = data.updateUrl || UPDATE_URL;

    if (!latestVersion || latestVersion === AGENT_VERSION) return;

    console.log(`\n[agent] 🔄 Найдена новая версия: v${latestVersion} (текущая: v${AGENT_VERSION})`);
    console.log(`[agent] 📥 Скачиваю обновление с ${updateUrl}...`);

    // Скачать новый агент
    await downloadFile(updateUrl, AGENT_FILE + '.new');

    // Проверить что файл не пустой
    const stat = fs.statSync(AGENT_FILE + '.new');
    if (stat.size < 1000) {
      console.error('[agent] ❌ Скачанный файл слишком мал, отмена обновления');
      fs.unlinkSync(AGENT_FILE + '.new');
      return;
    }

    // Заменить старый файл
    fs.renameSync(AGENT_FILE + '.new', AGENT_FILE);
    console.log(`[agent] ✅ Обновление установлено. Перезапускаюсь...`);

    // Перезапуститься (PM2 подхватит или запустить напрямую)
    const child = spawn(process.execPath, [AGENT_FILE], {
      detached: true,
      stdio: 'inherit',
    });
    child.unref();
    process.exit(0);

  } catch (err) {
    console.error('[agent] Ошибка при проверке обновлений:', err.message);
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);

    const request = proto.get(url, { timeout: 15000 }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });

    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });

    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// ── Определить IP шлюза (роутера) текущей сети ───────────────────────
function getGatewayIp() {
  try {
    const platform = os.platform();

    if (platform === 'win32') {
      // Метод 1: route print — самый надёжный
      try {
        const out = execSync('route print 0.0.0.0', { timeout: 8000 }).toString();
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

// ── ARP sweep: находим iPhone которые блокируют ping ──────────
async function pingSubnet(subnetPrefix) {
  if (!subnetPrefix) return;
  const platform = os.platform();

  console.log(`[agent] 📡 ARP sweep ${subnetPrefix}.1–254 ...`);

  const promises = [];
  for (let i = 1; i <= 254; i++) {
    const ip = `${subnetPrefix}.${i}`;
    promises.push(new Promise(resolve => {
      try {
        // 2 попытки, 1500мс таймаут — iPhone отвечает на ARP даже в сне
        const cmd = platform === 'win32'
          ? `ping -n 2 -w 1500 ${ip}`
          : `ping -c 2 -W 2 ${ip}`;
        execSync(cmd, { timeout: 5000, stdio: 'ignore' });
      } catch {}
      resolve();
    }));
  }

  // Пачками по 50
  for (let i = 0; i < promises.length; i += 50) {
    await Promise.all(promises.slice(i, i + 50));
  }

  // Windows: принудительно обновить таблицу соседей (ARP кэш)
  if (platform === 'win32') {
    try {
      execSync('powershell -Command "Get-NetNeighbor -AddressFamily IPv4 | Out-Null"', { timeout: 5000, stdio: 'ignore' });
    } catch {}
  }

  console.log(`[agent] 📡 ARP sweep завершён`);
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

  // Диагностика — что нашли vs что ожидали
  const diagEmployees = [];

  for (const emp of employees) {
    const mac       = (emp.macAddress || '').toUpperCase();
    const sessionId = `${today}_${mac.replace(/:/g, '')}`;
    const sessionRef = doc(db, 'wifi_sessions', sessionId);
    const isPresent  = connectedMacs.includes(mac);

    // Для диагностики
    diagEmployees.push({ name: emp.name, mac, found: isPresent });

    if (isPresent) {
      missCount[mac] = 0;
      console.log(`  ✅ ${emp.name} — в сети`);

      try {
        const existing = await getDocs(
          query(collection(db, 'wifi_sessions'),
            where('macAddress', '==', mac),
            where('date', '==', today))
        );

        if (existing.empty) {
          await setDoc(sessionRef, {
            clubId: CLUB_ID, employeeId: emp.id, name: emp.name,
            macAddress: mac, date: today,
            arrivedAt: nowIso, lastSeen: nowIso, isOnline: true,
          });
          console.log(`  📍 Зафиксирован приход: ${emp.name} в ${now.toLocaleTimeString('ru-RU')}`);
        } else {
          await setDoc(sessionRef, { isOnline: true, lastSeen: nowIso }, { merge: true });
        }
      } catch (err) {
        console.error(`  [agent] Ошибка записи для ${emp.name}:`, err.message);
      }

    } else {
      missCount[mac] = (missCount[mac] || 0) + 1;

      if (missCount[mac] >= MISS_LIMIT) {
        console.log(`  ❌ ${emp.name} — ушёл (${missCount[mac]} пропуска)`);
        try {
          const existing = await getDocs(
            query(collection(db, 'wifi_sessions'),
              where('macAddress', '==', mac),
              where('date', '==', today))
          );
          const wasOnline = !existing.empty && existing.docs[0]?.data()?.isOnline === true;
          const update = { isOnline: false, lastSeen: nowIso };
          if (wasOnline) {
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

  // 📊 Отправить диагностику в Firestore (видна в веб-интерфейсе)
  try {
    await setDoc(doc(db, 'wifi_agents', CLUB_ID), {
      lastScanAt: nowIso,
      lastScanMacs: connectedMacs.slice(0, 100), // все найденные MAC в сети
      lastScanDevicesTotal: connectedMacs.length,
      lastScanEmployees: diagEmployees,           // { name, mac, found } для каждого сотрудника
    }, { merge: true });
  } catch (err) {
    console.error('[agent] Диагностика error:', err.message);
  }
}

// ── Heartbeat ─────────────────────────────────────────────────────────
async function sendHeartbeat() {
  if (!CLUB_ID) return;
  try {
    await setDoc(doc(db, 'wifi_agents', CLUB_ID), {
      clubId: CLUB_ID,
      lastSeen: new Date().toISOString(),
      host: os.hostname(),
      version: AGENT_VERSION,
      subnet: SUBNET_PREFIX ? `${SUBNET_PREFIX}.0/24` : null,
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
    await setDoc(doc(db, 'wifi_agents', CLUB_ID), {
      clubId: CLUB_ID, lastSeen: new Date(0).toISOString(), host: os.hostname(), version: AGENT_VERSION,
    }, { merge: true });
    console.log(`[agent] ✅ ${snap.docs.length} сотрудников помечено оффлайн`);
  } catch (err) {
    console.error('[agent] Ошибка при завершении:', err.message);
  }
}

// ── Старт ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log(`║   HJTRACK WiFi Agent v${AGENT_VERSION}            ║`);
  console.log('║   Авто-обновление включено           ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Проверить обновления перед стартом
  await checkForUpdate();

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

  // Graceful shutdown
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

  setInterval(scan,            INTERVAL);
  setInterval(sendHeartbeat,   60_000);
  setInterval(checkForUpdate,  5 * 60_000); // Проверять обновления каждые 5 минут
}

main().catch(console.error);
