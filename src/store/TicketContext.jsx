import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { signInAnonymously, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';

// ─── Strict Whitelist and Role Mapping ─────────────────────────────────────────
// Only these exact email addresses are allowed to access the application.
// You can easily manage who gets what role and club in this single place!
export const USER_ROLES = {
  // ── Chefs (full admin) ────────────────────────────────────────────────────
  'dilshat.r@hj.fit': { role: 'chef', club: null, displayName: 'Дильшат' },
  'magzhan@hj.fit':   { role: 'chef', club: null, displayName: 'Магжан' },
  'iliyas.s@hj.fit':  { role: 'chef', club: null, displayName: 'Илияс' },
  'anuar@hj.fit':     { role: 'chef', club: null, displayName: 'Ануар' },
  'adil@hj.fit':      { role: 'chef', club: null, displayName: 'Адиль Утепбергенов' }, // разработчик, права chef

  // ── 4YOU ─────────────────────────────────────────────────────────────────
  'saniya@hj.fit':              { role: 'manager', club: '4YOU', displayName: 'Сания' },
  'kurbanovtimur585@gmail.com': { role: 'manager', club: '4YOU', displayName: 'Тимур' },
  'nurly@hj.fit':               { role: 'manager', club: '4YOU', displayName: 'Нурлы' },

  // ── COLIBRI ───────────────────────────────────────────────────────────────
  '19.anastasiya.tkachenko.88@gmail.com': { role: 'manager', club: 'COLIBRI', displayName: 'Анастасия' },
  'daewure@mail.ru':              { role: 'manager', club: 'COLIBRI', displayName: 'Аружан' },
  'dias.colibri@hj.fit':          { role: 'manager', club: 'COLIBRI', displayName: 'Диас' },
  'diasbakyt3773@gmail.com':      { role: 'manager', club: 'COLIBRI', displayName: 'Диас' },
  'loshkadishka3006@gmail.com':   { role: 'manager', club: 'COLIBRI', displayName: 'Алишер' },

  // ── VILLA ─────────────────────────────────────────────────────────────────
  'diassd9806@gmail.com':   { role: 'manager', club: 'VILLA', displayName: 'Диас' },
  'kelessovaan@gmail.com':  { role: 'manager', club: 'VILLA', displayName: 'Алина' },

  // ── NURLY ORDA ────────────────────────────────────────────────────────────
  'ainura030594@gmail.com': { role: 'manager', club: 'NURLY ORDA', displayName: 'Айнур' },
  'azimuus@gmail.com':      { role: 'manager', club: 'NURLY ORDA', clubs: ['NURLY ORDA', 'EUROPE CITY'], displayName: 'Азиз' },

  // ── PROMENADE ─────────────────────────────────────────────────────────────
  'k.useingazin@gmail.com': { role: 'manager', club: 'PROMENADE', displayName: 'Куат' },
  'adaienough@gmail.com':   { role: 'manager', club: 'PROMENADE', displayName: 'Адай' },
  'sabirameb@gmail.com':    { role: 'manager', club: 'PROMENADE', displayName: 'Сабира' },

  // ── EUROPE CITY ───────────────────────────────────────────────────────────
  'edokjp@gmail.com':  { role: 'manager', club: 'EUROPE CITY', displayName: 'Эдель' },
  'k.dana_01@list.ru': { role: 'manager', club: 'EUROPE CITY', displayName: 'Дана' },

  // ── RESTRICTED ADMINS (schedule + sales only, no financials, no warehouse) ──
  'admin-colibri@hj.fit':   { role: 'admin', club: 'COLIBRI',     displayName: 'Админ Colibri'     },
  'admin-villa@hj.fit':     { role: 'admin', club: 'VILLA',       displayName: 'Админ Villa'       },
  'admin-4you@hj.fit':      { role: 'admin', club: '4YOU',        displayName: 'Админ 4you'        },
  'admin-nurlyorda@hj.fit': { role: 'admin', club: 'NURLY ORDA',  displayName: 'Админ Nurly Orda'  },
  'admin-promenade@hj.fit': { role: 'admin', club: 'PROMENADE',   displayName: 'Админ Promenade'   },
  'admin-europecity@hj.fit':{ role: 'admin', club: 'EUROPE CITY', displayName: 'Админ Europe City' },
  'ikoperper@gmail.com':              { role: 'admin', club: '4YOU', displayName: 'Искандер'  },
  'alibekakniet38@gmail.com':         { role: 'admin', club: '4YOU', displayName: 'Акниет'    },
  'bhtg.l.bhtg.l@gmail.com':         { role: 'admin', club: '4YOU', displayName: 'Бахыткуль' },
  'abisheva.alua07@gmail.com':        { role: 'admin', club: '4YOU', displayName: 'Алуа'      },
  'abuzalma8@gmail.com':              { role: 'admin', club: '4YOU', displayName: 'Абулхаир'  },
  'ibrayevana@mail.ru':               { role: 'admin', club: '4YOU', displayName: 'Назым'     },
  'hedabatyrova.14@gmail.com':        { role: 'admin', club: '4YOU', displayName: 'Хеда'      },
  'yussentyan@gmail.com':             { role: 'admin', club: 'COLIBRI', displayName: 'Юссен'     },
  'shapagat.mukhametkaliyeva@mail.ru':{ role: 'admin', club: 'COLIBRI', displayName: 'Шапагат'   },
  'kasel00405@gmail.com':             { role: 'admin', club: 'COLIBRI', displayName: 'Асель'     },
  'zhaniya.m12@gmail.com':            { role: 'admin', club: 'COLIBRI', displayName: 'Жания'     },
  'utemisovazarina1912@gmail.com':    { role: 'admin', club: 'COLIBRI', displayName: 'Зарина'    },

  // ── VILLA ─────────────────────────────────────────────────────────────────
  'asemnurkabek@gmail.com':  { role: 'admin', club: 'VILLA', displayName: 'Ермекқызы Әсем'  },
  'rrrkh.257@mail.ru':       { role: 'admin', club: 'VILLA', displayName: 'Рахимбаева Асем' },
  'mkayrlynova@mail.ru':     { role: 'admin', club: 'VILLA', displayName: 'Меруерт' },
  'kushanlos123@gmail.com':  { role: 'admin', club: 'VILLA', displayName: 'Салим'   },

  // ── PROMENADE ─────────────────────────────────────────────────────────────
  'maryamkb100707@gmail.com':      { role: 'admin', club: 'PROMENADE', displayName: 'Марьям' },
  'sarakayevaf@gmail.com':         { role: 'admin', club: 'PROMENADE', displayName: 'Фатима' },
  'infosun2818@gmail.com':         { role: 'admin', club: 'PROMENADE', displayName: 'Санжар' },
  'zhamilyakuskulakova@gmail.com': { role: 'admin', club: 'PROMENADE', displayName: 'Жамиля' },
  'armetidq@icloud.com':           { role: 'admin', club: 'PROMENADE', displayName: 'Аружан' },

  // ── Marketing (restricted warehouse views, all clubs) ─────────────────────
  'guldana.k@hj.fit': { role: 'marketing', club: null, displayName: 'Гульдана' },

  // ── Коммерческий директор (новости, склад, соглашения, настройки) ─────────
  'madina@hj.fit': { role: 'komdir', club: null, displayName: 'Мадина' },

  // ── РОПы (руководители отделов продаж) — права Ком-Дира, но только свой клуб ──
  'saltanat@hj.fit':        { role: 'rop', club: 'VILLA',      displayName: 'Салтанат' },
  'blinsalta19@gmail.com':  { role: 'rop', club: 'VILLA',      displayName: 'Салтанат' },
  'umitony99@gmail.com':    { role: 'rop', club: 'COLIBRI',    displayName: 'Умида' },
  'aiman.k@hj.fit':         { role: 'rop', club: '4YOU',       displayName: 'Айман' },
  'iamkamilya23@gmail.com': { role: 'rop', club: 'NURLY ORDA', displayName: 'Камиля' },
  'sladosstt@gmail.com':    { role: 'rop', club: 'PROMENADE',  displayName: 'РОП Promenade' },
  'kamzinova3@gmail.com':   { role: 'rop', club: 'EUROPE CITY', displayName: 'Камзинова' },

  // ── Наблюдатель «Утерянные вещи» — только эта вкладка, только просмотр ────
  'luiza_1101@mail.ru': { role: 'lostviewer', club: null, displayName: 'Луиза' },

  // ── Viewer (no tickets, schedule, calls, dashboard, archive) ──────────────
  // tech — техник: только Чек-листы и InStudio, по всем клубам
  'nurali.m@hj.fit': { role: 'tech', club: null, displayName: 'Нурали' },
  'roman.v@hj.fit': { role: 'chef', club: null, displayName: 'Роман' },
  'madiyar.a@hj.fit': { role: 'tech', club: null, displayName: 'Мадияр' },
  'iliyas.s@hj.fit': { role: 'chef', club: null, displayName: 'Илияс' },
};

// ─── Dynamic users (added by managers via Settings → Админы) ──────────────────
// Stored in Firestore collection `app_users` (doc id = email), merged into
// USER_ROLES at runtime and cached in localStorage so login works instantly.
// A doc with { revoked: true } removes access for a hardcoded admin account.
const DYNAMIC_USERS_CACHE_KEY = 'dynamic_users_v1';
const dynamicUserKeys = new Set();
const revokedStaticKeys = new Set();
// Snapshot of the hardcoded whitelist, taken before any dynamic data is merged —
// used to restore a static account if its revocation is later removed.
const STATIC_USER_ROLES = { ...USER_ROLES };

export function applyDynamicUsers(usersMap) {
  // Reset previous dynamic state: drop dynamic entries, restore revoked statics
  for (const key of [...dynamicUserKeys]) {
    delete USER_ROLES[key];
    dynamicUserKeys.delete(key);
  }
  for (const key of [...revokedStaticKeys]) {
    if (STATIC_USER_ROLES[key]) USER_ROLES[key] = STATIC_USER_ROLES[key];
    revokedStaticKeys.delete(key);
  }

  for (const [email, profile] of Object.entries(usersMap)) {
    const key = (email || '').toLowerCase().trim();
    if (!key || !profile) continue;

    if (profile.revoked) {
      // Revocation only applies to admin accounts — managers can't lock out
      // chefs/managers this way
      if (STATIC_USER_ROLES[key]?.role === 'admin') {
        delete USER_ROLES[key];
        revokedStaticKeys.add(key);
      }
      continue;
    }

    // A dynamic entry never overrides a hardcoded account
    if (key in STATIC_USER_ROLES) continue;
    // Разрешённые роли для динамических аккаунтов: admin (по умолчанию) и rop.
    // МОП создаётся как rop с флагом mop — те же права, но без создания аккаунтов.
    const ALLOWED_DYN_ROLES = ['admin', 'rop'];
    USER_ROLES[key] = {
      role: ALLOWED_DYN_ROLES.includes(profile.role) ? profile.role : 'admin',
      club: profile.club || null,
      displayName: profile.displayName || key.split('@')[0],
      mop: !!profile.mop,
    };
    dynamicUserKeys.add(key);
  }
  try { localStorage.setItem(DYNAMIC_USERS_CACHE_KEY, JSON.stringify(usersMap)); } catch {}
}

// Hydrate from cache synchronously so isEmailAllowed works before Firestore loads
try {
  const cached = JSON.parse(localStorage.getItem(DYNAMIC_USERS_CACHE_KEY) || '{}');
  applyDynamicUsers(cached);
} catch {}

function isEmailAllowed(email) {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return normalized in USER_ROLES;
}
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  runTransaction
} from 'firebase/firestore';
import { auth, db, getStorageLazy } from '../lib/firebase';
import { formatAuthor } from '../utils/formatters';
import { refreshPushToken } from '../lib/push';
import { pushNotify } from '../lib/pushNotify';
import { toast } from 'sonner';

const TicketContext = createContext();
export const useTickets = () => useContext(TicketContext);

const TICKETS_STORAGE_KEY = 'tickets_cache_v5'; // bumped to invalidate old per-club caches

// Firebase document IDs are always 20-char alphanumeric strings (not pure digits)
// Demo ticket IDs are short strings like '1', '9', '19'
function isFirebaseId(id) {
  if (!id || typeof id !== 'string') return false;
  // Firebase auto-IDs: 20 chars. Demo IDs: short. Temp IDs: start with 'temp_'
  return id.length >= 15 && !id.startsWith('temp_');
}

// Демо-заявки удалены: на новом устройстве они выглядели как реальные заявки
// 4YOU «в работе», а смена их статусов тихо не сохранялась.
function loadCachedTickets() {
  try {
    const raw = localStorage.getItem(TICKETS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function sortByRecentActivity(arr) {
  return [...arr].sort((a, b) => {
    const getMs = (v) => {
      if (!v) return 0;
      if (typeof v?.toMillis === 'function') return v.toMillis();
      if (typeof v?.seconds === 'number') return v.seconds * 1000;
      const d = new Date(v);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };
    
    // Sort by statusChangedAt first, fallback to createdAt
    const timeA = getMs(a.statusChangedAt) || getMs(a.createdAt);
    const timeB = getMs(b.statusChangedAt) || getMs(b.createdAt);
    
    return timeB - timeA;
  });
}

// Helper to compress images on the client side using Canvas
const compressImage = (file) => new Promise((resolve) => {
  if (!file.type.startsWith('image/')) {
    resolve(file);
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Max dimensions 800px
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(file);
          return;
        }
        const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
          type: 'image/jpeg',
          lastModified: Date.now()
        });
        resolve(compressedFile);
      }, 'image/jpeg', 0.5); // 50% JPEG quality for ultra-small size (~30-60KB)
    };
    img.onerror = () => resolve(file);
    img.src = e.target.result;
  };
  reader.onerror = () => resolve(file);
  reader.readAsDataURL(file);
});

// Cache storage availability status to bypass waiting/timeouts once a failure occurs
let isStorageHealthy = true;

export const TicketProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [tickets, setTickets] = useState(loadCachedTickets);
  const [loading, setLoading] = useState(true);

  const allTicketsRef = useRef(tickets);
  const serverConfirmedRef = useRef(false); // получен ли хоть один снапшот С СЕРВЕРА
  useEffect(() => { allTicketsRef.current = tickets; }, [tickets]);

  // Keep the push token fresh for devices that already opted in
  useEffect(() => {
    if (user?.email) refreshPushToken(user);
  }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync the self-edited display name from Firestore (survives re-login,
  // works across devices)
  useEffect(() => {
    if (!user?.email) return;
    const emailKey = user.email.toLowerCase().trim();
    return onSnapshot(doc(db, 'user_profiles', emailKey), snap => {
      const saved = snap.exists() ? (snap.data().displayName || null) : null;
      try {
        if (saved) localStorage.setItem('hj_custom_name_' + emailKey, saved);
        else localStorage.removeItem('hj_custom_name_' + emailKey);
      } catch {}
      const fallback = USER_ROLES[emailKey]?.displayName || emailKey.split('@')[0];
      setUser(prev => {
        if (!prev) return prev;
        const next = saved || fallback;
        return prev.displayName === next ? prev : { ...prev, displayName: next };
      });
    }, () => {});
  }, [user?.email]);

  // ─── Persist cache ────────────────────────────────────────────────────────
  // Пустой список тоже сохраняем, но только после серверного снапшота:
  // иначе удалённые заявки «воскресали» из старого кеша при следующем запуске.
  useEffect(() => {
    if (tickets.length === 0 && !serverConfirmedRef.current) return;
    try {
      localStorage.setItem(TICKETS_STORAGE_KEY, JSON.stringify(tickets));
    } catch {}
  }, [tickets]);

  // ─── Profile Helper ──────────────────────────────────────────────────────
  const enrichUserWithRole = useCallback((u) => {
    if (!u) return null;
    const email = (u.email || '').toLowerCase().trim();
    const customName = localStorage.getItem('hj_custom_name_' + email) || null;

    const registered = USER_ROLES[email];
    if (registered) {
      // Мультиклубный менеджер (registered.clubs) — активный клуб выбирается переключателем
      // и хранится в localStorage; подставляется в user.club, чтобы все страницы работали как есть.
      const clubs = Array.isArray(registered.clubs) && registered.clubs.length > 1 ? registered.clubs : null;
      let club = registered.club;
      if (clubs) {
        const saved = localStorage.getItem('hj_active_club_' + email);
        club = (saved && clubs.includes(saved)) ? saved
             : (registered.club && clubs.includes(registered.club)) ? registered.club
             : clubs[0];
      }
      // Self-edited name (synced via user_profiles) wins over the hardcoded one
      return {
        ...u,
        displayName: customName || registered.displayName || u.displayName || email.split('@')[0],
        role: registered.role,
        club,
        clubs,
        mop: registered.mop || false,
      };
    }

    // Default fallback (no permissions)
    return {
      ...u,
      displayName: customName || u.displayName || email.split('@')[0],
      role: 'user',
      club: null
    };
  }, []);

  // ─── Auth ─────────────────────────────────────────────────────────────────
  // Реальная авторизация Firebase (email + пароль). Сессия хранится самим
  // Firebase и переживает перезагрузку; после «Выйти» нужен повторный вход
  // с паролем. Пароли Firebase хранит зашифрованными — их не видит никто.
  useEffect(() => {
    localStorage.removeItem('app_mock_user');
    localStorage.removeItem('app_session_user'); // легаси беспарольная сессия

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && !fbUser.isAnonymous && fbUser.email) {
        const email = fbUser.email.toLowerCase().trim();
        // Динамический пользователь (МОП / созданный админ) может ещё не быть в
        // локальном whitelist (кэш app_users не успел подтянуться при рестарте сессии).
        // НЕ выкидываем сразу — сначала дотягиваем его из app_users, иначе аккаунт «вылетает».
        if (!isEmailAllowed(email)) {
          try {
            const snap = await getDoc(doc(db, 'app_users', email));
            if (snap.exists()) {
              let cached = {};
              try { cached = JSON.parse(localStorage.getItem(DYNAMIC_USERS_CACHE_KEY) || '{}'); } catch {}
              applyDynamicUsers({ ...cached, [email]: snap.data() });
            }
          } catch {}
        }
        if (isEmailAllowed(email)) {
          setUser(enrichUserWithRole({ email, uid: fbUser.uid }));
        } else {
          // Реально нигде не зарегистрирован — выходим
          signOut(auth).catch(() => {});
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, [enrichUserWithRole]);

  // Проверка email: разрешён ли и есть ли уже установленный пароль.
  // Возвращает { allowed, hasPassword }.
  const checkEmail = async (email) => {
    const normalizedEmail = (email || '').toLowerCase().trim();
    if (!normalizedEmail) return { allowed: false, hasPassword: false };

    // На странице входа пользователь ещё не авторизован — даём анонимный доступ,
    // чтобы прочитать флаг пароля и app_users (иначе на новом устройстве проверка
    // падала и система каждый раз предлагала «создать пароль»).
    if (!auth.currentUser) { try { await signInAnonymously(auth); } catch {} }

    // Динамический админ (создан менеджером) — подтягиваем из app_users
    if (!isEmailAllowed(normalizedEmail)) {
      try {
        const snap = await getDoc(doc(db, 'app_users', normalizedEmail));
        if (snap.exists() && !snap.data().revoked) {
          const cached = JSON.parse(localStorage.getItem(DYNAMIC_USERS_CACHE_KEY) || '{}');
          applyDynamicUsers({ ...cached, [normalizedEmail]: snap.data() });
        }
      } catch {}
    }
    if (!isEmailAllowed(normalizedEmail)) {
      return { allowed: false, hasPassword: false };
    }

    // Флаг «пароль установлен» в auth_meta (сам пароль тут не хранится)
    let hasPassword = false;
    try {
      const meta = await getDoc(doc(db, 'auth_meta', normalizedEmail));
      hasPassword = !!meta.exists() && meta.data().hasPassword === true;
    } catch {}
    return { allowed: true, hasPassword };
  };

  const logAdminLogin = (enriched) => {
    if (enriched?.role !== 'admin') return;
    const now = new Date();
    addDoc(collection(db, 'hr_monitor_activity'), {
      type: 'login', adminEmail: enriched.email, adminName: enriched.displayName,
      club: enriched.club, date: now.toISOString().slice(0, 10), timestampISO: now.toISOString(),
    }).catch(() => {});
  };

  // Первый вход: сотрудник придумывает пароль
  const createPassword = async (email, password) => {
    const normalizedEmail = (email || '').toLowerCase().trim();
    if (!isEmailAllowed(normalizedEmail)) throw new Error('Этот email не зарегистрирован в системе. Обратитесь к администратору.');
    if ((password || '').length < 6) throw new Error('Пароль должен быть не короче 6 символов.');
    try {
      await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        // Аккаунт уже есть — чиним «отвалившийся» флаг и просим ввести пароль
        try { await setDoc(doc(db, 'auth_meta', normalizedEmail), { hasPassword: true }, { merge: true }); } catch {}
        const err = new Error('У вас уже есть пароль — введите его.');
        err.code = 'ACCOUNT_EXISTS';
        throw err;
      }
      if (e.code === 'auth/operation-not-allowed') throw new Error('Вход по паролю не включён в Firebase. Обратитесь к Дильшату.');
      throw new Error('Не удалось создать пароль: ' + (e.code || e.message));
    }
    try { await setDoc(doc(db, 'auth_meta', normalizedEmail), { hasPassword: true, setAtISO: new Date().toISOString() }, { merge: true }); } catch {}
    logAdminLogin(enrichUserWithRole({ email: normalizedEmail }));
    toast.success('Пароль создан, вы вошли');
  };

  // Обычный вход по паролю
  const loginWithPassword = async (email, password) => {
    const normalizedEmail = (email || '').toLowerCase().trim();
    if (!isEmailAllowed(normalizedEmail)) throw new Error('Этот email не зарегистрирован в системе. Обратитесь к администратору.');
    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        const err = new Error('Пароль ещё не создан — придумайте его.');
        err.code = 'NO_ACCOUNT';
        throw err;
      }
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') throw new Error('Неверный пароль.');
      if (e.code === 'auth/too-many-requests') throw new Error('Слишком много попыток. Подождите пару минут.');
      throw new Error('Не удалось войти: ' + (e.code || e.message));
    }
    logAdminLogin(enrichUserWithRole({ email: normalizedEmail }));
    toast.success('Вход выполнен');
  };

  const resetPassword = async (email) => {
    const normalizedEmail = (email || '').toLowerCase().trim();
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      toast.success('Письмо для сброса пароля отправлено на ' + normalizedEmail);
    } catch (e) {
      throw new Error('Не удалось отправить письмо: ' + (e.code || e.message));
    }
  };

  const logout = () => {
    localStorage.removeItem('app_session_user');
    signOut(auth).catch(() => {});
    setUser(null);
    toast.success('Вы вышли из системы');
  };

  // Переключение активного клуба для мультиклубного менеджера (user.clubs)
  const switchClub = useCallback((club) => {
    setUser(prev => {
      if (!prev || !Array.isArray(prev.clubs) || !prev.clubs.includes(club) || prev.club === club) return prev;
      try { localStorage.setItem('hj_active_club_' + (prev.email || '').toLowerCase().trim(), club); } catch {}
      return { ...prev, club };
    });
  }, []);

  // ─── Dynamic users live sync (app_users → USER_ROLES) ────────────────────
  useEffect(() => {
    let unsubUsers = null;
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser && !unsubUsers) {
        unsubUsers = onSnapshot(collection(db, 'app_users'), (snap) => {
          const usersMap = {};
          snap.docs.forEach(d => { usersMap[d.id.toLowerCase().trim()] = d.data(); });
          applyDynamicUsers(usersMap);
          // Refresh the logged-in user's profile in case their own entry changed
          setUser(prev => prev ? enrichUserWithRole({ email: prev.email, uid: prev.uid }) : prev);
        }, (err) => console.error('[app_users] listener error:', err));
      } else if (!firebaseUser && unsubUsers) {
        unsubUsers();
        unsubUsers = null;
      }
    });
    return () => { unsubAuth(); if (unsubUsers) unsubUsers(); };
  }, [enrichUserWithRole]);

  // ─── Firestore live listener ──────────────────────────────────────────────
  useEffect(() => {
    let unsubTickets = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        if (unsubTickets) return; // Already listening

        const q = query(collection(db, 'tickets'));
        unsubTickets = onSnapshot(q, (snapshot) => {
          // Determine session user's club for toast filtering
          let sessionClub = null;
          try {
            const raw = localStorage.getItem('app_session_user');
            if (raw) {
              const { email } = JSON.parse(raw);
              const profile = USER_ROLES[(email || '').toLowerCase().trim()];
              sessionClub = profile?.club ?? null;
            }
          } catch {}

          // Toasts on status/ticket changes are now handled cleanly by NotificationContext.jsx
          const fresh = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          if (!snapshot.metadata.fromCache) serverConfirmedRef.current = true;
          setTickets(prev => {
            // If Firestore returned real data — use it as the single source of truth.
            // Only fall back to cached/demo data when Firestore is completely empty.
            if (fresh.length === 0) {
              // Пусто из локального кеша (оффлайн/старт) — держим прежнее состояние.
              // Пусто С СЕРВЕРА — реально нет заявок: очищаем (иначе удалённая
              // последняя заявка вечно висела бы у всех остальных клиентов).
              return snapshot.metadata.fromCache ? prev : [];
            }

            // Merge: Firestore data wins; also keep any temp_ (optimistic) tickets
            // that haven't been confirmed yet (< 30s old).
            const map = {};
            fresh.forEach(t => { map[t.id] = t; });
            prev.forEach(t => {
              if (!map[t.id] && String(t.id).startsWith('temp_')) {
                const age = Date.now() - new Date(t.createdAt || 0).getTime();
                if (age < 30_000) map[t.id] = t;
              }
            });
            return sortByRecentActivity(Object.values(map));
          });
        }, (error) => {
          console.error('[TicketContext] listener error:', error.code, error.message);
        });
      } else {
        if (unsubTickets) {
          unsubTickets();
          unsubTickets = null;
        }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubTickets) unsubTickets();
    };
  }, []);

  // Fire-and-forget push. roles=null → всем сотрудникам клуба; иначе только указанным ролям.
  const sendPush = useCallback((title, body, club, url, tag, roles = null) => {
    pushNotify({ title, body, club, excludeEmail: user?.email || '', url: url || '/', tag: tag || '', roles });
  }, [user]);

  // Пуши по заявкам приходят ТОЛЬКО менеджерскому составу (менеджер своего клуба + шеф),
  // НЕ администраторам. Клуб фильтруется в pushNotify (свой клуб + глобальные шеф).
  const TICKET_PUSH_ROLES = ['manager', 'chef'];

  const PUSH_STATUS_LABELS = {
    new: 'Новая заявка', in_progress: 'Принята в работу', paused: 'Пауза',
    waiting: 'Ожидание', closed: 'Закрыта',
  };

  const updateTicket = useCallback(async (ticketId, updates) => {
    if (!ticketId) return;
    const ticket = allTicketsRef.current.find(t => String(t.id) === String(ticketId));
    setTickets(prev => prev.map(t => String(t.id) === String(ticketId) ? { ...t, ...updates } : t));
    if (!isFirebaseId(String(ticketId))) return;
    try {
      // Record who acted — NotificationContext uses it to skip the actor's own popup
      const withActor = updates.status ? { ...updates, lastActionBy: user?.email || '' } : updates;
      await updateDoc(doc(db, 'tickets', String(ticketId)), withActor);
      if (updates.status && ticket && updates.status !== ticket.status) {
        const label = PUSH_STATUS_LABELS[updates.status] || updates.status;
        sendPush(`Статус: ${label}`, `Заявка «${ticket.title || 'Без названия'}»`, ticket.club, `/tickets/${ticketId}`, `status-${ticketId}`, TICKET_PUSH_ROLES);
      }
    } catch (error) {
      toast.error('Ошибка сохранения в облаке');
    }
  }, [sendPush, user]);

  const deleteTicket = useCallback(async (ticketId) => {
    if (!ticketId) return;
    // Optimistic removal
    setTickets(prev => prev.filter(t => String(t.id) !== String(ticketId)));
    if (!isFirebaseId(String(ticketId))) return;
    try {
      await deleteDoc(doc(db, 'tickets', String(ticketId)));
      toast.success('Заявка удалена');
    } catch (error) {
      toast.error('Ошибка удаления заявки');
    }
  }, []);

  const addTicket = useCallback(async (ticketData) => {
    try {
      // Колонки «Новые» больше нет — созданная заявка сразу «берётся в работу»
      const finalStatus = (ticketData.status && ticketData.status !== 'new') ? ticketData.status : 'in_progress';
      await addDoc(collection(db, 'tickets'), {
        ...ticketData,
        status: finalStatus,
        // Заявка «взята в работу» с момента создания — таймер стартует сразу
        ...(finalStatus === 'in_progress' ? { statusChangedAt: new Date().toISOString() } : {}),
        createdAt: serverTimestamp(),
        createdBy: user?.uid || 'anonymous',
        createdByEmail: user?.email || '',
        createdByClub: user?.club || ticketData.club || '',
        comments: [],
      });
      toast.success(ticketData.status === 'scheduled' ? 'Задача запланирована' : 'Задача создана');
      // Запланированная заявка НЕ пушится при создании — push уйдёт в день (и время) наступления
      if (ticketData.status !== 'scheduled') {
        sendPush('🆕 Новая заявка', `«${ticketData.title || 'Без названия'}»`, ticketData.club, '/tickets', '', TICKET_PUSH_ROLES);
      }
    } catch (error) {
      toast.error('Ошибка создания задачи');
      throw error;
    }
  }, [user, sendPush]);

  // ── Запланированные заявки: при наступлении даты (и времени, если задано)
  // автоматически переводим в «Новые» и шлём push менеджерам клуба.
  // Проверка раз в минуту у каждого открытого клиента; двойной push гасится tag'ом.
  const activationAttemptedRef = useRef(new Set()); // не ставим один тикет в очередь записи дважды за сессию
  useEffect(() => {
    if (!user) return;
    const pad = (n) => String(n).padStart(2, '0');
    const check = () => {
      const now = new Date();
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      allTicketsRef.current.forEach(t => {
        if (!isFirebaseId(String(t.id))) return;
        if (activationAttemptedRef.current.has(t.id)) return; // уже пытались в этой сессии
        // Легаси-статус «new» тихо переводим «в работу» (колонки «Новые» больше нет).
        // statusChangedAt обязателен — иначе заявка висит «в работе» без таймера.
        // Транзакция (чтение с СЕРВЕРА): локальный кеш может быть стейл —
        // слепой updateDoc от такого клиента сбрасывал таймер уже активной заявки.
        if (t.status === 'new') {
          activationAttemptedRef.current.add(t.id);
          runTransaction(db, async (tx) => {
            const ref = doc(db, 'tickets', String(t.id));
            const snap = await tx.get(ref);
            if (!snap.exists() || snap.data().status !== 'new') return;
            tx.update(ref, { status: 'in_progress', statusChangedAt: new Date().toISOString() });
          }).catch(() => { activationAttemptedRef.current.delete(t.id); });
          return;
        }
        if (t.status !== 'scheduled' || !t.scheduledFor) return;
        const due = t.scheduledFor < today
          || (t.scheduledFor === today && (!t.scheduledTime || t.scheduledTime <= nowHM));
        if (!due) return;
        activationAttemptedRef.current.add(t.id);
        // Транзакция гарантирует ОДИН push на заявку: активирует (и пушит) только
        // клиент, реально переведший scheduled→in_progress на сервере. Раньше слепой
        // updateDoc + push выполнял КАЖДЫЙ открытый клиент (гонка устройств) и каждый
        // клиент со стейл-кешем при открытии приложения → шквал одинаковых пушей.
        runTransaction(db, async (tx) => {
          const ref = doc(db, 'tickets', String(t.id));
          const snap = await tx.get(ref);
          if (!snap.exists() || snap.data().status !== 'scheduled') return false;
          tx.update(ref, { status: 'in_progress', activatedAtISO: new Date().toISOString(), statusChangedAt: new Date().toISOString() });
          return true;
        })
          .then((won) => {
            if (won) sendPush('📅 Запланированная заявка — в работе', `«${t.title || 'Без названия'}»${t.scheduledTime ? ` · на ${t.scheduledTime}` : ''}`, t.club, `/tickets/${t.id}`, `sched-${t.id}`, TICKET_PUSH_ROLES);
          })
          // Ошибка записи (сеть/квота) → снимаем метку, чтобы цикл повторил попытку
          .catch(() => { activationAttemptedRef.current.delete(t.id); });
      });
    };
    check();
    const iv = setInterval(check, 60_000);
    return () => clearInterval(iv);
  }, [user, sendPush]); // eslint-disable-line react-hooks/exhaustive-deps

  // Комментарии пишутся через arrayUnion/arrayRemove: раньше перезаписывался
  // ВЕСЬ массив из локального состояния — два человека, написавшие почти
  // одновременно, затирали сообщения друг друга.
  const deleteComment = useCallback(async (ticketId, commentId) => {
    const ticket = allTicketsRef.current.find(t => String(t.id) === String(ticketId));
    const target = (ticket?.comments || []).find(c => c.id === commentId);
    const updatedComments = (ticket?.comments || []).filter(c => c.id !== commentId);
    setTickets(prev => prev.map(t => String(t.id) === String(ticketId) ? { ...t, comments: updatedComments } : t));
    if (!isFirebaseId(String(ticketId))) return;
    try {
      if (target) {
        await updateDoc(doc(db, 'tickets', String(ticketId)), { comments: arrayRemove(target) });
      } else {
        await updateDoc(doc(db, 'tickets', String(ticketId)), { comments: updatedComments });
      }
    } catch {
      toast.error('Ошибка удаления сообщения');
    }
  }, []);

  const addComment = useCallback(async (ticketId, commentText, attachment = null) => {
    const ticket = allTicketsRef.current.find(t => String(t.id) === String(ticketId));
    const newComment = {
      id: Math.random().toString(36).slice(2, 11),
      text: commentText,
      author: formatAuthor(user),
      authorEmail: user?.email || '',
      createdAt: new Date().toISOString(),
      attachment,
    };
    setTickets(prev => prev.map(t => String(t.id) === String(ticketId) ? { ...t, comments: [...(t.comments || []), newComment] } : t));
    if (!isFirebaseId(String(ticketId))) return;
    try {
      await updateDoc(doc(db, 'tickets', String(ticketId)), { comments: arrayUnion(newComment) });
      toast.success('Комментарий добавлен');
      const preview = (commentText || '').slice(0, 80) || (attachment ? '📎 Файл' : '');
      sendPush('💬 Новое сообщение', `«${ticket?.title || 'Заявка'}»: ${preview}`, ticket?.club, `/tickets/${ticketId}`, `msg-${ticketId}`, TICKET_PUSH_ROLES);
    } catch (error) {
      toast.error('Ошибка добавления комментария');
    }
  }, [user, sendPush]);

  const uploadFile = useCallback(async (rawFile, onProgress) => {
    if (!rawFile) return null;

    // Compress first if image
    let file = rawFile;
    if (rawFile.type.startsWith('image/')) {
      try {
        file = await compressImage(rawFile);
      } catch (e) {
        console.error('Compression failed, using raw file', e);
      }
    }
    
    const maxBase64Size = 900 * 1024; // 900 KB
    const isSmallFile = file.size <= maxBase64Size;

    const convertToBase64 = (f) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(f);
    });

    // If we already know storage is broken, immediately use Base64/local URL
    if (!isStorageHealthy || !auth.currentUser) {
      if (isSmallFile) {
        try {
          const base64Url = await convertToBase64(file);
          toast.success('Загружено (Base64 фоллбек)');
          return { name: file.name, url: base64Url, type: file.type };
        } catch {}
      }
      return { name: file.name, url: URL.createObjectURL(file), type: file.type, isLocal: true };
    }

    const fileId = Math.random().toString(36).slice(2, 11);
    const { ref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');
    const storage = await getStorageLazy();
    const storageRef = ref(storage, `attachments/${fileId}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        try { task.cancel(); } catch {}
        isStorageHealthy = false; // Mark storage as broken
        if (isSmallFile) {
          console.warn('[Storage Timeout] Falling back to Base64');
          try {
            const base64Url = await convertToBase64(file);
            toast.success('Загружено (локальный Base64)');
            resolve({ name: file.name, url: base64Url, type: file.type });
            return;
          } catch (err) {
            reject(err);
            return;
          }
        }
        toast.error('Превышено время ожидания загрузки (15 сек)');
        reject(new Error('Upload timeout'));
      }, 15000);

      task.on('state_changed',
        (snap) => { 
          if (onProgress) onProgress((snap.bytesTransferred / snap.totalBytes) * 100); 
        },
        async (err)  => { 
          clearTimeout(timeoutId);
          console.error('[Storage Upload Error]', err);
          isStorageHealthy = false; // Mark storage as broken
          if (isSmallFile) {
            console.warn('[Storage Error] Falling back to Base64');
            try {
              const base64Url = await convertToBase64(file);
              toast.success('Загружено (локальный Base64)');
              resolve({ name: file.name, url: base64Url, type: file.type });
              return;
            } catch (fallbackErr) {
              console.error('[Base64 Fallback Error]', fallbackErr);
            }
          }
          toast.error(`Ошибка загрузки: ${err.message || 'нет доступа к хранилищу'}`); 
          reject(err); 
        },
        async () => {
          clearTimeout(timeoutId);
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            resolve({ name: file.name, url, type: file.type });
          } catch (err) {
            console.error('[Storage Get URL Error]', err);
            isStorageHealthy = false; // Mark storage as broken
            if (isSmallFile) {
              try {
                const base64Url = await convertToBase64(file);
                toast.success('Загружено (локальный Base64)');
                resolve({ name: file.name, url: base64Url, type: file.type });
                return;
              } catch (fallbackErr) {}
            }
            toast.error('Ошибка получения ссылки на файл');
            reject(err);
          }
        }
      );
    });
  }, []);

  const updateDisplayName = useCallback((name) => {
    if (!user?.email) return;
    const trimmed = name.trim();
    const emailKey = user.email.toLowerCase().trim();
    if (trimmed) {
      localStorage.setItem('hj_custom_name_' + emailKey, trimmed);
    } else {
      localStorage.removeItem('hj_custom_name_' + emailKey);
    }
    // Persist in Firestore so the name survives re-login and syncs across devices
    setDoc(doc(db, 'user_profiles', emailKey), {
      displayName: trimmed || null,
      updatedAtISO: new Date().toISOString(),
    }, { merge: true }).catch(() => {});
    setUser(prev => prev ? { ...prev, displayName: trimmed || USER_ROLES[emailKey]?.displayName || user.email } : prev);
  }, [user?.email]);

  return (
    <TicketContext.Provider value={{ user, tickets, loading, checkEmail, createPassword, loginWithPassword, resetPassword, logout, switchClub, addTicket, updateTicket, deleteTicket, addComment, deleteComment, uploadFile, updateDisplayName }}>
      {children}
    </TicketContext.Provider>
  );
};
