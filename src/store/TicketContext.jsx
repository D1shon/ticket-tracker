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
  'admin-colibri':   { role: 'admin', club: 'COLIBRI',    displayName: 'Админ Colibri'    },
  'admin-villa':     { role: 'admin', club: 'VILLA',       displayName: 'Админ Villa'      },
  'admin-4you':      { role: 'admin', club: '4YOU',        displayName: 'Админ 4you'       },
  'admin-nurlyorda': { role: 'admin', club: 'NURLY ORDA',  displayName: 'Админ Nurly Orda' },

  // ── Marketing (restricted warehouse views, all clubs) ─────────────────────
  'guldana.k@hj.fit': { role: 'marketing', club: null, displayName: 'Гульдана' },
};

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
  doc, 
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { formatAuthor } from '../utils/formatters';
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
    
    const registered = USER_ROLES[email];
    if (registered) {
      return {
        ...u,
        displayName: registered.displayName || u.displayName || email.split('@')[0],
        role: registered.role,
        club: registered.club
      };
    }

    // Default fallback (no permissions)
    return {
      ...u,
      displayName: u.displayName || email.split('@')[0],
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

  const updateTicket = useCallback(async (ticketId, updates) => {
    if (!ticketId) return;
    setTickets(prev => prev.map(t => String(t.id) === String(ticketId) ? { ...t, ...updates } : t));
    if (!isFirebaseId(String(ticketId))) return;
    try {
      await updateDoc(doc(db, 'tickets', String(ticketId)), updates);
    } catch (error) {
      toast.error('Ошибка сохранения в облаке');
    }
  }, []);

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
    } catch (error) {
      toast.error('Ошибка создания задачи');
      throw error;
    }
  }, [user]);

  const addComment = useCallback(async (ticketId, commentText, attachment = null) => {
    const ticket = allTicketsRef.current.find(t => String(t.id) === String(ticketId));
    const newComment = {
      id: Math.random().toString(36).slice(2, 11),
      text: commentText,
      author: formatAuthor(user),
      createdAt: new Date().toISOString(),
      attachment,
    };
    const updatedComments = [...(ticket?.comments || []), newComment];
    setTickets(prev => prev.map(t => String(t.id) === String(ticketId) ? { ...t, comments: updatedComments } : t));
    if (!isFirebaseId(String(ticketId))) return;
    try {
      await updateDoc(doc(db, 'tickets', String(ticketId)), { comments: updatedComments });
      toast.success('Комментарий добавлен');
    } catch (error) {
      toast.error('Ошибка добавления комментария');
    }
  }, [user]);

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

  return (
    <TicketContext.Provider value={{ user, tickets, loading, login, logout, addTicket, updateTicket, deleteTicket, addComment, uploadFile }}>
      {children}
    </TicketContext.Provider>
  );
};
