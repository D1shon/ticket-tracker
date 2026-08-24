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

  const { email, password, name, role, club, action } = req.body ?? {};

  // Сброс пароля: удаляем Auth-аккаунт — при следующем входе человек
  // просто придумает новый пароль (стандартный сценарий первого входа)
  // Диагностика: есть ли Auth-аккаунт и флаг пароля
  if (action === 'check') {
    if (!email) return res.status(400).json({ error: 'email required' });
    const out = { email: email.toLowerCase() };
    try {
      const u = await admin.auth().getUserByEmail(email);
      out.authAccount = { uid: u.uid, created: u.metadata.creationTime, lastSignIn: u.metadata.lastSignInTime || null, disabled: u.disabled };
    } catch (e) {
      out.authAccount = e.code === 'auth/user-not-found' ? null : `error: ${e.code}`;
    }
    try {
      const meta = await admin.firestore().collection('auth_meta').doc(email.toLowerCase()).get();
      out.authMeta = meta.exists ? meta.data() : null;
    } catch (e) { out.authMeta = `error: ${e.message}`; }
    return res.json(out);
  }

  if (action === 'reset-password') {
    if (!email) return res.status(400).json({ error: 'email required' });
    try {
      // Флаг «пароль установлен» тоже сбрасываем — иначе форма входа
      // продолжит требовать старый пароль вместо создания нового
      await admin.firestore().collection('auth_meta').doc(email.toLowerCase()).delete().catch(() => {});
      const u = await admin.auth().getUserByEmail(email);
      await admin.auth().deleteUser(u.uid);
      return res.json({ ok: true, reset: true, uid: u.uid });
    } catch (e) {
      if (e.code === 'auth/user-not-found') return res.json({ ok: true, reset: true, note: 'аккаунта не было' });
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  }

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
