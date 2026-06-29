import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Simple secret check
  if (req.headers['x-sync-secret'] !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { clubs } = req.body ?? {};
  if (!clubs || !Array.isArray(clubs)) {
    return res.status(400).json({ error: 'clubs array required' });
  }

  try {
    const db = admin.firestore();

    // Update today's summary
    await db.collection('dwh_stats').doc('club_visits').set({
      clubs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Append yesterday's data to daily_history if provided
    const { yesterday_date, yesterday_clubs } = req.body ?? {};
    if (yesterday_date && Array.isArray(yesterday_clubs) && yesterday_clubs.length > 0) {
      const histRef = db.collection('dwh_stats').doc('daily_history');
      const histSnap = await histRef.get();
      const existing = histSnap.exists ? (histSnap.data().data ?? []) : [];

      // Replace or append the day entry
      const filtered = existing.filter(d => d.date !== yesterday_date);
      const updated  = [...filtered, { date: yesterday_date, clubs: yesterday_clubs }]
        .sort((a, b) => a.date.localeCompare(b.date));

      // Keep last 90 days
      const trimmed = updated.slice(-90);

      await histRef.set({ data: trimmed, updatedAt: new Date().toISOString() });
    }

    return res.json({ ok: true, count: clubs.length });
  } catch (err) {
    console.error('sync-visits error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
