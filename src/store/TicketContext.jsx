import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth';

// ─── Strict Whitelist and Role Mapping ─────────────────────────────────────────
// Only these exact email addresses are allowed to access the application.
// You can easily manage who gets what role and club in this single place!
export const USER_ROLES = {
  // ── Chefs (full admin) ────────────────────────────────────────────────────
  'dilshat.r@hj.fit': { role: 'chef', club: null, displayName: 'Дильшат' },
  'magzhan@hj.fit':   { role: 'chef', club: null, displayName: 'Магжан' },
  'iliyas.s@hj.fit':  { role: 'chef', club: null, displayName: 'Илияс' },
  'anuar@hj.fit':     { role: 'chef', club: null, displayName: 'Ануар' },

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
  'saltanat@hj.fit':        { role: 'manager', club: 'VILLA', displayName: 'Салтанат' },
  'blinsalta19@gmail.com':  { role: 'manager', club: 'VILLA', displayName: 'Салтанат' },

  // ── NURLY ORDA ────────────────────────────────────────────────────────────
  'ainura030594@gmail.com': { role: 'manager', club: 'NURLY ORDA', displayName: 'Айнур' },
  'azimuus@gmail.com':      { role: 'manager', club: 'NURLY ORDA', displayName: 'Азиз' },

  // ── RESTRICTED ADMINS (schedule + sales only, no financials, no warehouse) ──
  'admin-colibri':        { role: 'admin', club: 'COLIBRI',    displayName: 'Админ Colibri'    },
  'admin-villa':          { role: 'admin', club: 'VILLA',       displayName: 'Админ Villa'      },
  'admin-4you':           { role: 'admin', club: '4YOU',        displayName: 'Админ 4you'       },
  'admin-nurlyorda':      { role: 'admin', club: 'NURLY ORDA',  displayName: 'Админ Nurly Orda' },
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

  // ── Marketing (restricted warehouse views, all clubs) ─────────────────────
  'guldana.k@hj.fit': { role: 'marketing', club: null, displayName: 'Гульдана' },

  // ── Viewer (no tickets, schedule, calls, dashboard, archive) ──────────────
  'nurali.m@hj.fit': { role: 'viewer', club: null, displayName: 'Нурали' },
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
    USER_ROLES[key] = {
      role: 'admin', // dynamic accounts are always restricted admins
      club: profile.club || null,
      displayName: profile.displayName || key.split('@')[0],
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
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
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

const INITIAL_DEMO_TICKETS = [
  {
    id: '1', club: '4YOU', title: 'Переход на летний режим вентиляции',
    description: 'Переход на летний режим вентиляции.',
    status: 'new', priority: 'medium',
    assignee: 'Сания (4YOU)', createdAt: '2026-03-30T10:00:00.000Z',
    comments: [],
  },
  {
    id: '9', club: '4YOU', title: 'Переустановка счетчиков гор воды',
    description: 'Переустановка счетчиков горячей воды и пломбировка.',
    status: 'new', priority: 'medium',
    assignee: 'Сания (4YOU)', createdAt: '2026-04-01T10:00:00.000Z',
    comments: [],
  },
  {
    id: '19', club: '4YOU', title: 'Фен Борк сломан (на ремонте)',
    description: 'Ждём детали для сервис центра.',
    status: 'new', priority: 'critical',
    assignee: 'Сания (4YOU)', createdAt: '2026-03-15T09:00:00.000Z',
    comments: [],
  }
];

function loadCachedTickets() {
  try {
    const raw = localStorage.getItem(TICKETS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : INITIAL_DEMO_TICKETS;
  } catch { return INITIAL_DEMO_TICKETS; }
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
  useEffect(() => {
    if (tickets.length > 0) {
      try {
        localStorage.setItem(TICKETS_STORAGE_KEY, JSON.stringify(tickets));
      } catch {}
    }
  }, [tickets]);

  // ─── Profile Helper ──────────────────────────────────────────────────────
  const enrichUserWithRole = useCallback((u) => {
    if (!u) return null;
    const email = (u.email || '').toLowerCase().trim();
    const customName = localStorage.getItem('hj_custom_name_' + email) || null;

    const registered = USER_ROLES[email];
    if (registered) {
      // Self-edited name (synced via user_profiles) wins over the hardcoded one
      return {
        ...u,
        displayName: customName || registered.displayName || u.displayName || email.split('@')[0],
        role: registered.role,
        club: registered.club
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
  useEffect(() => {
    // Clear legacy mock sessions
    localStorage.removeItem('app_mock_user');

    // Restore session from localStorage if available and verified
    const saved = localStorage.getItem('app_session_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (isEmailAllowed(parsed.email)) {
          setUser(enrichUserWithRole(parsed));
          
          // Authenticate Firebase anonymously if needed to authorize Firestore connection
          if (!auth.currentUser) {
            signInAnonymously(auth).catch(err => {
              console.error("[TicketContext] Anonymous auth restoration failed:", err);
            });
          }
          
          setLoading(false);
          return;
        } else {
          // Stale or invalid session, purge it
          localStorage.removeItem('app_session_user');
        }
      } catch {}
    }

    setUser(null);
    setLoading(false);
  }, [enrichUserWithRole]);

  const login = async (email) => {
    const normalizedEmail = (email || '').toLowerCase().trim();

    // Not in the static whitelist or local cache — check Firestore for a
    // dynamically added account (manager-created admin) before rejecting.
    if (!isEmailAllowed(normalizedEmail) && normalizedEmail) {
      try {
        await signInAnonymously(auth);
        const snap = await getDoc(doc(db, 'app_users', normalizedEmail));
        if (snap.exists()) {
          const cached = JSON.parse(localStorage.getItem(DYNAMIC_USERS_CACHE_KEY) || '{}');
          applyDynamicUsers({ ...cached, [normalizedEmail]: snap.data() });
        }
      } catch (e) {
        console.error('[TicketContext] app_users lookup failed:', e);
      }
    }

    if (!isEmailAllowed(normalizedEmail)) {
      throw new Error('Этот email не зарегистрирован в системе. Обратитесь к администратору.');
    }
    
    // Authenticate with Firebase anonymously to satisfy security rules (request.auth != null)
    let offlineMode = false;
    try {
      await signInAnonymously(auth);
    } catch (authErr) {
      console.error("[TicketContext] Anonymous auth failed:", authErr);
      offlineMode = true;
    }
    
    const sessionUser = { email: normalizedEmail, uid: 'session_' + normalizedEmail };
    const enriched = enrichUserWithRole(sessionUser);
    setUser(enriched);
    localStorage.setItem('app_session_user', JSON.stringify(sessionUser));

    // Log admin logins for activity tracking (visible to chef/manager in HR Monitors)
    if (enriched.role === 'admin' && !offlineMode) {
      const now = new Date();
      addDoc(collection(db, 'hr_monitor_activity'), {
        type: 'login',
        adminEmail:   enriched.email,
        adminName:    enriched.displayName,
        club:         enriched.club,
        date:         now.toISOString().slice(0, 10),
        timestampISO: now.toISOString(),
      }).catch(() => {});
    }

    if (offlineMode) {
      toast.warning('Вход выполнен в автономном режиме. Облачная база данных недоступна (требуется включить Anonymous Auth в Firebase Console).', {
        duration: 8000
      });
    } else {
      toast.success('Вход выполнен');
    }
  };

  const logout = () => {
    localStorage.removeItem('app_session_user');
    signOut(auth).catch(() => {});
    setUser(null);
    toast.success('Вы вышли из системы');
  };

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
          setTickets(prev => {
            // If Firestore returned real data — use it as the single source of truth.
            // Only fall back to cached/demo data when Firestore is completely empty.
            if (fresh.length === 0) {
              // Keep previous state (may include demo tickets in offline mode)
              return prev.length > 0 ? prev : prev;
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

  // Fire-and-forget push to the club's staff + chefs, excluding the actor
  const sendPush = useCallback((title, body, club, url, tag) => {
    pushNotify({ title, body, club, excludeEmail: user?.email || '', url: url || '/', tag: tag || '' });
  }, [user]);

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
        sendPush(`Статус: ${label}`, `Заявка «${ticket.title || 'Без названия'}»`, ticket.club, `/tickets/${ticketId}`, `status-${ticketId}`);
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
      await addDoc(collection(db, 'tickets'), {
        ...ticketData,
        status: ticketData.status ?? 'new',
        createdAt: serverTimestamp(),
        createdBy: user?.uid || 'anonymous',
        createdByEmail: user?.email || '',
        createdByClub: user?.club || ticketData.club || '',
        comments: [],
      });
      toast.success(ticketData.status === 'scheduled' ? 'Задача запланирована' : 'Задача создана');
      sendPush('🆕 Новая заявка', `«${ticketData.title || 'Без названия'}»`, ticketData.club, '/tickets');
    } catch (error) {
      toast.error('Ошибка создания задачи');
      throw error;
    }
  }, [user, sendPush]);

  const deleteComment = useCallback(async (ticketId, commentId) => {
    const ticket = allTicketsRef.current.find(t => String(t.id) === String(ticketId));
    const updatedComments = (ticket?.comments || []).filter(c => c.id !== commentId);
    setTickets(prev => prev.map(t => String(t.id) === String(ticketId) ? { ...t, comments: updatedComments } : t));
    if (!isFirebaseId(String(ticketId))) return;
    try {
      await updateDoc(doc(db, 'tickets', String(ticketId)), { comments: updatedComments });
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
    const updatedComments = [...(ticket?.comments || []), newComment];
    setTickets(prev => prev.map(t => String(t.id) === String(ticketId) ? { ...t, comments: updatedComments } : t));
    if (!isFirebaseId(String(ticketId))) return;
    try {
      await updateDoc(doc(db, 'tickets', String(ticketId)), { comments: updatedComments });
      toast.success('Комментарий добавлен');
      const preview = (commentText || '').slice(0, 80) || (attachment ? '📎 Файл' : '');
      sendPush('💬 Новое сообщение', `«${ticket?.title || 'Заявка'}»: ${preview}`, ticket?.club, `/tickets/${ticketId}`, `msg-${ticketId}`);
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
    <TicketContext.Provider value={{ user, tickets, loading, login, logout, addTicket, updateTicket, deleteTicket, addComment, deleteComment, uploadFile, updateDisplayName }}>
      {children}
    </TicketContext.Provider>
  );
};
