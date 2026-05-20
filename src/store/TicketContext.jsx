import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth';

// ─── Strict Whitelist and Role Mapping ─────────────────────────────────────────
// Only these exact email addresses are allowed to access the application.
// You can easily manage who gets what role and club in this single place!
const USER_ROLES = {
  // Chefs (Full Administration rights)
  'dilshat.r@hj.fit': { role: 'chef', club: null, displayName: 'Дильшат' },
  'magzhan@hj.fit': { role: 'chef', club: null, displayName: 'Магжан' },
  
  // Managers (Club-specific management rights)
  'daewure@mail.ru': { role: 'manager', club: 'COLIBRI', displayName: 'Менеджер Колибри' },
  'ainura030594@gmail.com': { role: 'manager', club: 'NURLY ORDA', displayName: 'Айнура' },
  'diassd9806@gmail.com': { role: 'manager', club: 'VILLA', displayName: 'Диас' },
  
  // Placeholders for other known managers (change to their real emails if needed)
  'anastasia@hj.fit': { role: 'manager', club: 'COLIBRI', displayName: 'Анастасия' },
  'saniya@hj.fit': { role: 'manager', club: '4YOU', displayName: 'Сания' },
  'aziz@hj.fit': { role: 'manager', club: 'COLIBRI', displayName: 'Азиз' },
  'saltanat@hj.fit': { role: 'manager', club: 'NURLY ORDA', displayName: 'Салтанат' },
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
  doc, 
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { formatAuthor } from '../utils/formatters';
import { toast } from 'sonner';

const TicketContext = createContext();
export const useTickets = () => useContext(TicketContext);

const TICKETS_STORAGE_KEY = 'tickets_cache_v4';

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

          snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified') {
              const newData = change.doc.data();
              const oldData = allTicketsRef.current.find(t => t.id === change.doc.id);
              // Only show toast if this ticket belongs to the user's club (or user is chef)
              const ticketClub = (newData.club || '').toUpperCase();
              const clubMatch = sessionClub === null || ticketClub === (sessionClub || '').toUpperCase();
              if (clubMatch && oldData && oldData.status !== newData.status) {
                const LABELS = { new: 'Новая', in_progress: 'В работе', paused: 'На паузе', waiting: 'Ожидание', closed: 'Закрыто' };
                toast(`Статус: ${LABELS[newData.status] || newData.status}`, {
                  description: `"${newData.title}"`, duration: 4000,
                });
              }
            }
          });
          const fresh = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          setTickets(prev => {
            if (fresh.length === 0 && prev.length > 0) return prev;
            const map = {};
            fresh.forEach(t => { map[t.id] = t; });
            prev.forEach(t => {
              if (!map[t.id]) {
                if (String(t.id).startsWith('temp_')) return;
                if (!isFirebaseId(String(t.id))) map[t.id] = t;
                else {
                  const age = Date.now() - new Date(t.createdAt || 0).getTime();
                  if (age < 30_000) map[t.id] = t;
                }
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

  const addTicket = useCallback(async (ticketData) => {
    try {
      await addDoc(collection(db, 'tickets'), {
        ...ticketData,
        status: 'new',
        createdAt: serverTimestamp(),
        createdBy: user?.uid || 'anonymous',
        createdByEmail: user?.email || '',
        createdByClub: user?.club || ticketData.club || '',
        comments: [],
      });
      toast.success('Задача создана');
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

  const uploadFile = useCallback(async (file, onProgress) => {
    if (!file) return null;
    if (!auth.currentUser) {
      return { name: file.name, url: URL.createObjectURL(file), type: file.type, isLocal: true };
    }
    const fileId = Math.random().toString(36).slice(2, 11);
    const storageRef = ref(storage, `attachments/${fileId}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);
    return new Promise((resolve, reject) => {
      task.on('state_changed',
        (snap) => { if (onProgress) onProgress((snap.bytesTransferred / snap.totalBytes) * 100); },
        (err)  => { toast.error('Ошибка загрузки файла'); reject(err); },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ name: file.name, url, type: file.type });
        }
      );
    });
  }, []);

  return (
    <TicketContext.Provider value={{ user, tickets, loading, login, logout, addTicket, updateTicket, addComment, uploadFile }}>
      {children}
    </TicketContext.Provider>
  );
};
