// Быстрый канал: посещения и записи атлетов ЗА СЕГОДНЯ (+вчера) → dwh_stats/club_visits.
// Лёгкий запрос (2 дня чекинов), запускается каждые 5 минут через start-visits-fast.bat.
// История/пульсометры остаются в часовом hrm-sync.mjs.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const DWH_URL = loadDwhUrl();
if (!DWH_URL) { console.error('[visits-fast] нет строки подключения'); process.exit(1); }

const firebaseConfig = {
  apiKey: 'AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk',
  authDomain: 'hjtrack-928f5.firebaseapp.com',
  projectId: 'hjtrack-928f5',
  storageBucket: 'hjtrack-928f5.firebasestorage.app',
  messagingSenderId: '236581443884',
  appId: '1:236581443884:web:a9ce84dcbf0efc59267489',
};

// Посещения за сегодня и вчера (уникальные атлеты, дата по Алматы UTC+5)
const VISITS_2D_SQL = `
SELECT c.name AS club,
       ((uc.created_at + INTERVAL '5 hours')::date)::text AS d,
       COUNT(DISTINCT uc."user")::int AS athletes
FROM raw.usercheckin uc
JOIN raw.event e ON e.id = uc.event
JOIN raw.club c ON c.id = e.club
WHERE uc.created_at >= (CURRENT_DATE - INTERVAL '2 days')
  AND uc.is_dropped IS NOT TRUE AND uc.deleted_at IS NULL
GROUP BY 1, 2`;

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
  const client = new pg.Client({ connectionString: DWH_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
  await client.connect();
  const { rows: visitRows } = await client.query(VISITS_2D_SQL);
  const { rows: bookedRows } = await client.query(BOOKED_SQL);
  await client.end();

  const alm = new Date(Date.now() + 5 * 3600 * 1000);
  const todayStr = alm.toISOString().slice(0, 10);
  const yestStr = new Date(alm.getTime() - 86400000).toISOString().slice(0, 10);

  const byDate = {};
  for (const r of visitRows) {
    if (!byDate[r.d]) byDate[r.d] = {};
    byDate[r.d][r.club] = Number(r.athletes) || 0;
  }
  const bookedByClub = {};
  for (const r of bookedRows) bookedByClub[r.club] = Number(r.booked) || 0;

  const clubNames = [...new Set([...visitRows.map(r => r.club), ...Object.keys(bookedByClub)])].sort();
  const clubs = clubNames.map(name => ({
    name,
    visits: byDate[todayStr]?.[name] || 0,
    yesterday: byDate[yestStr]?.[name] || 0,
    booked: bookedByClub[name] || 0,
  }));

  const app = initializeApp(firebaseConfig);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  await setDoc(doc(db, 'dwh_stats', 'club_visits'), { clubs, updatedAt: new Date().toISOString() }, { merge: true });

  const total = clubs.reduce((s, c) => s + c.visits, 0);
  const booked = clubs.reduce((s, c) => s + c.booked, 0);
  console.log(`[visits-fast] пришли ${total}, записались ${booked} · ${new Date().toISOString()}`);
  process.exit(0);
}

run().catch(e => { console.error('[visits-fast] FAIL:', e?.message || e); process.exit(1); });
setTimeout(() => { console.error('[visits-fast] TIMEOUT'); process.exit(1); }, 90000);
