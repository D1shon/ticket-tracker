// Ночной синк «покрытие пульсометрами» из DWH → Firestore (hrm_coverage/{КЛУБ}).
// Метод как у коллег: активный Hero Pass, и «без пульсометра» = не носил монитор
// последние WINDOW дней (нет записи пульса в summaryheartrates).
// Запуск: node hrm-sync.mjs   (конфиг — в ./config.json, см. config.example.json)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Строка подключения к DWH: сначала env POSTGRES_DWH, затем ../.env.local, затем config.json
function loadDwhUrl() {
  if (process.env.POSTGRES_DWH) return process.env.POSTGRES_DWH.replace(/^"|"$/g, '');
  try {
    const txt = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
    const m = txt.match(/^\s*POSTGRES_DWH\s*=\s*"?([^"\n]+)"?/m);
    if (m) return m[1].trim();
  } catch {}
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    if (cfg.dwhUrl) return cfg.dwhUrl;
  } catch {}
  return null;
}
let CFG = {};
try { CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch {}
const DWH_URL = loadDwhUrl();
const WINDOW_DAYS = Number(CFG.windowDays) || 21;
if (!DWH_URL) { console.error('[hrm-sync] нет строки подключения (POSTGRES_DWH / .env.local / config.json)'); process.exit(1); }

// Тот же проект Firebase, что и HJ Track (правила требуют вход — анонимного хватает)
const firebaseConfig = {
  apiKey: 'AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk',
  authDomain: 'hjtrack-928f5.firebaseapp.com',
  projectId: 'hjtrack-928f5',
  storageBucket: 'hjtrack-928f5.firebasestorage.app',
  messagingSenderId: '236581443884',
  appId: '1:236581443884:web:a9ce84dcbf0efc59267489',
};

// DWH пишет клубы как «HJ 4YOU» → приложение ждёт «4YOU»
const CLUB_MAP = {
  'HJ 4YOU': '4YOU',
  'HJ Colibri': 'COLIBRI',
  'HJ Villa': 'VILLA',
  'HJ Nurly Orda': 'NURLY ORDA',
  'HJ Promenade': 'PROMENADE',
  'HJ Europe City': 'EUROPE CITY',
};

// «Постоянный пульсометр» = активная запись в raw.hrmdevicetrackings со статусами
// hrmstatus='PERMANENT' и accessstatus='ASSIGNED' (датчик закреплён и на руках).
// TEMPORARY (прокат) и PERMANENT+RETURNED (сдал) — считаются «без постоянного».
// Клуб = клуб абонемента, fallback — клуб пользователя.
const SQL = `
WITH active_hp AS (
  SELECT DISTINCT ON (uhp."user") uhp."user" AS uid, uhp.club AS hp_club_id
  FROM raw.userheropass uhp
  WHERE uhp.endtime >= CURRENT_DATE AND uhp.starttime <= CURRENT_DATE
    AND (uhp.status IS NULL OR uhp.status <> 'refunded')
    AND uhp.is_dropped IS NOT TRUE AND uhp.deleted_at IS NULL
  ORDER BY uhp."user", uhp.endtime DESC
),
permanent AS (
  SELECT DISTINCT "user" AS uid
  FROM raw.hrmdevicetrackings
  WHERE hrmstatus = 'PERMANENT' AND accessstatus = 'ASSIGNED'
)
SELECT
  COALESCE(NULLIF(hc.name,''), NULLIF(uc.name,''), '') AS club_name,
  COUNT(*)::int AS active_hp,
  COUNT(*) FILTER (WHERE p.uid IS NOT NULL)::int AS with_monitor,
  COUNT(*) FILTER (WHERE p.uid IS NULL)::int AS without_monitor
FROM active_hp a
LEFT JOIN permanent p ON p.uid = a.uid
LEFT JOIN raw."user" u ON u.id = a.uid
LEFT JOIN raw.club hc ON hc.id = a.hp_club_id
LEFT JOIN raw.club uc ON uc.id = u.club
GROUP BY 1`;

// Посещения атлетов по дням (уникальные люди за день, дата по Алматы UTC+5).
// 91 день истории → сегодня/вчера + история для страницы «Посещения клубов».
const VISITS_SQL = `
SELECT c.name AS club,
       ((uc.created_at + INTERVAL '5 hours')::date)::text AS d,
       COUNT(DISTINCT uc."user")::int AS athletes
FROM raw.usercheckin uc
JOIN raw.event e ON e.id = uc.event
JOIN raw.club c ON c.id = e.club
WHERE uc.created_at >= (CURRENT_DATE - INTERVAL '91 days')
  AND uc.is_dropped IS NOT TRUE AND uc.deleted_at IS NULL
GROUP BY 1, 2`;

// Записались на тренировки СЕГОДНЯ (уникальные люди, без отменённых записей)
const BOOKED_SQL = `
SELECT c.name AS club, COUNT(DISTINCT b."user")::int AS booked
FROM raw.booking b
JOIN raw.event e ON e.id = b.event
JOIN raw.club c ON c.id = e.club
WHERE ((e.starttime + INTERVAL '5 hours')::date) = ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '5 hours')::date)
  AND b.status <> 'canceled'
  AND b.is_dropped IS NOT TRUE AND b.deleted_at IS NULL
GROUP BY c.name`;

async function run() {
  // 1) DWH
  const client = new pg.Client({
    connectionString: DWH_URL,
    ssl: CFG.ssl === false ? false : { rejectUnauthorized: false },
    statement_timeout: 120000,
  });
  await client.connect();
  const { rows } = await client.query(SQL);
  const { rows: visitRows } = await client.query(VISITS_SQL);
  const { rows: bookedRows } = await client.query(BOOKED_SQL);
  await client.end();

  // 2) Firestore
  const app = initializeApp(firebaseConfig);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);

  const nowISO = new Date().toISOString();
  let written = 0;
  let totActive = 0, totWithout = 0;
  for (const row of rows) {
    const appClub = CLUB_MAP[row.club_name];
    if (!appClub) continue; // клубы вне карты (в т.ч. пустой club_name) пропускаем
    const activeHp = Number(row.active_hp) || 0;
    const without = Number(row.without_monitor) || 0;
    const withMonitor = Number(row.with_monitor) || 0;
    const pctWithout = activeHp ? Math.round((without / activeHp) * 1000) / 10 : 0;
    totActive += activeHp; totWithout += without;
    await setDoc(doc(db, 'hrm_coverage', appClub), {
      club: appClub, activeHp, withMonitor, without, pctWithout,
      metric: 'permanent_sensor', windowDays: null, updatedAtISO: nowISO,
    }, { merge: true });
    written++;
    console.log(`[hrm-sync] ${appClub}: активн ${activeHp}, с ${withMonitor}, без ${without} (${pctWithout}%)`);
  }
  // ── Посещения атлетов → dwh_stats/club_visits + dwh_stats/daily_history ──
  // Формат совместим со страницей «Посещения клубов» (ClubVisitsPage).
  const alm = new Date(Date.now() + 5 * 3600 * 1000);
  const todayStr = alm.toISOString().slice(0, 10);
  const yestStr = new Date(alm.getTime() - 86400000).toISOString().slice(0, 10);
  const byDate = {}; // date -> { clubName: athletes }
  for (const r of visitRows) {
    if (!byDate[r.d]) byDate[r.d] = {};
    byDate[r.d][r.club] = Number(r.athletes) || 0;
  }
  const bookedByClub = {};
  for (const r of bookedRows) bookedByClub[r.club] = Number(r.booked) || 0;
  const clubNames = [...new Set([...visitRows.map(r => r.club), ...Object.keys(bookedByClub)])].sort();
  const clubsSummary = clubNames.map(name => ({
    name,
    visits: byDate[todayStr]?.[name] || 0,      // пришли сегодня (live)
    yesterday: byDate[yestStr]?.[name] || 0,    // вчера
    booked: bookedByClub[name] || 0,            // записались на сегодня
  }));
  const historyData = Object.keys(byDate)
    .filter(d => d < todayStr) // сегодня не пишем в историю — день ещё не закончился
    .sort()
    .slice(-90)
    .map(d => ({ date: d, clubs: Object.entries(byDate[d]).map(([name, visits]) => ({ name, visits })) }));
  await setDoc(doc(db, 'dwh_stats', 'club_visits'), { clubs: clubsSummary, updatedAt: nowISO }, { merge: true });
  await setDoc(doc(db, 'dwh_stats', 'daily_history'), { data: historyData, updatedAt: nowISO }, { merge: true });
  const todayTotal = clubsSummary.reduce((s, c) => s + c.visits, 0);
  console.log(`[hrm-sync] посещения: сегодня ${todayTotal} атлетов (${clubsSummary.map(c => `${c.name.replace('HJ ', '')} ${c.visits}`).join(', ')}), история ${historyData.length} дн.`);

  // сводный документ (для шефа/дашборда)
  await setDoc(doc(db, 'hrm_coverage', '_meta'), {
    updatedAtISO: nowISO, windowDays: WINDOW_DAYS,
    totalActiveHp: totActive, totalWithout: totWithout,
    pctWithout: totActive ? Math.round((totWithout / totActive) * 1000) / 10 : 0,
    clubsWritten: written,
  }, { merge: true });

  console.log(`[hrm-sync] готово: клубов ${written}, всего активн ${totActive}, без ${totWithout} · ${nowISO}`);
  process.exit(0);
}

run().catch(e => { console.error('[hrm-sync] FAIL:', e?.message || e); process.exit(1); });
