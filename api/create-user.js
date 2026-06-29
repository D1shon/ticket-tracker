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
  if (req.headers['x-sync-secret'] !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, name, role, club } = req.body ?? {};
  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'email, password, name, role required' });
  }

  try {
    const auth = admin.auth();
    const db   = admin.firestore();

    let uid;
    try {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
      await auth.updateUser(uid, { displayName: name, password });
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        const created = await auth.createUser({ email, password, displayName: name });
        uid = created.uid;
      } else throw e;
    }

    await db.collection('users').doc(uid).set(
      { email, name, role, club: club ?? null, createdAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    return res.json({ ok: true, uid, email, role });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
