// SSO для партнёрской академии (heros-journey-trainee.web.app).
// Сотрудник открывает вкладку «Академия» → фронт шлёт сюда свой ID-токен HJ Track →
// мы проверяем его, определяем должность/права и выпускаем custom token Firebase
// ПРОЕКТА АКАДЕМИИ с этими данными в claims. Академия входит по нему через
// signInWithCustomToken — сотруднику не нужен второй логин, а права нельзя
// подделать: их подписывает наш сервер.
//
// Нужны env-переменные Vercel (сервисный аккаунт проекта академии — его выдаёт
// создатель академии): ACADEMY_PROJECT_ID, ACADEMY_CLIENT_EMAIL, ACADEMY_PRIVATE_KEY.
// Пока их нет — отвечаем 503, фронт молча открывает академию без SSO (как раньше).
import admin from 'firebase-admin';
import { USER_ROLES } from '../src/lib/userRoles.js';

// Приложение №1: HJ Track — проверка ID-токена сотрудника
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// Приложение №2: проект академии — подпись custom token
const academyConfigured = !!(process.env.ACADEMY_PROJECT_ID && process.env.ACADEMY_CLIENT_EMAIL && process.env.ACADEMY_PRIVATE_KEY);
const academyApp = academyConfigured
  ? (admin.apps.find(a => a?.name === 'academy') || admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.ACADEMY_PROJECT_ID,
        clientEmail: process.env.ACADEMY_CLIENT_EMAIL,
        privateKey:  process.env.ACADEMY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    }, 'academy'))
  : null;

// Должность по роли HJ Track — согласована с академией, менять синхронно с ними
const POSITION_BY_ROLE = {
  chef:       'Руководитель',
  manager:    'Менеджер клуба',
  admin:      'Администратор',
  rop:        'РОП',
  komdir:     'Коммерческий директор',
  marketing:  'Маркетинг',
  viewer:     'Наблюдатель',
  tech:       'Техник',
  lostviewer: 'Наблюдатель',
  guest:      'Стажёр',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!academyConfigured) return res.status(503).json({ error: 'ACADEMY_NOT_CONFIGURED' });

  // 1) Проверяем, что запрос от залогиненного пользователя HJ Track
  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!idToken) return res.status(401).json({ error: 'No token' });
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // 2) Профиль: стажёр (анонимный вход) или сотрудник из справочника/app_users
  let profile; // { uid, email, name, role, club, mop }
  if (decoded.firebase?.sign_in_provider === 'anonymous') {
    const guestName = String(req.body?.guestName || 'Стажёр').replace(/\s+/g, ' ').trim().slice(0, 60);
    profile = {
      uid: `hj-guest-${decoded.uid}`,
      email: null,
      name: guestName || 'Стажёр',
      role: 'guest',
      club: null,
      mop: false,
    };
  } else {
    const email = (decoded.email || '').toLowerCase().trim();
    if (!email) return res.status(403).json({ error: 'No email in token' });
    // Статический справочник, затем динамические аккаунты (app_users)
    let entry = USER_ROLES[email] || null;
    if (!entry) {
      try {
        const snap = await admin.firestore().collection('app_users').doc(email).get();
        if (snap.exists && !snap.data().revoked) entry = snap.data();
      } catch {}
    }
    if (!entry) return res.status(403).json({ error: 'Not an HJ Track employee' });
    profile = {
      uid: 'hj-' + email.replace(/[^a-z0-9]/g, '-'),
      email,
      name: entry.displayName || email.split('@')[0],
      role: entry.role || 'admin',
      club: entry.club || null,
      mop: !!entry.mop,
    };
  }

  // 3) Custom token проекта академии. Claims читаются академией из
  // getIdTokenResult() и определяют права — вручную их выставлять не нужно.
  const claims = {
    hjTrack: true,
    hjEmail: profile.email,
    name: profile.name,
    role: profile.role,                                   // роль HJ Track как есть
    position: POSITION_BY_ROLE[profile.role] || 'Сотрудник',
    status: profile.role === 'guest' ? 'trainee' : 'staff',
    club: profile.club,
    mop: profile.mop,
  };
  try {
    const token = await academyApp.auth().createCustomToken(profile.uid, claims);
    return res.json({ token, uid: profile.uid, claims, expiresInSec: 3600 });
  } catch (e) {
    console.error('[academy-token]', e);
    return res.status(500).json({ error: e.message });
  }
}
