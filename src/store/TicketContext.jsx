import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
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

  // ─── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // ─── Restore session from Firebase or LocalStorage (for mock users) ────
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        localStorage.removeItem('app_mock_user'); // Firebase wins
      } else {
        const savedMock = localStorage.getItem('app_mock_user');
        if (savedMock) {
          try { setUser(JSON.parse(savedMock)); } catch { setUser(null); }
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // ─── Firestore live listener ──────────────────────────────────────────────
  useEffect(() => {
    // No orderBy — avoids crash when createdAt types are mixed (Timestamp vs string)
    const q = query(collection(db, 'tickets'));

    const unsub = onSnapshot(q, (snapshot) => {
      // Notify on status changes
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const newData = change.doc.data();
          const oldData = allTicketsRef.current.find(t => t.id === change.doc.id);
          if (oldData && oldData.status !== newData.status) {
            const LABELS = { new: 'Новая', in_progress: 'В работе', paused: 'На паузе', waiting: 'Ожидание', closed: 'Закрыто' };
            toast(`Статус: ${LABELS[newData.status] || newData.status}`, {
              description: `"${newData.title}"`, duration: 4000,
            });
          }
        }
      });

      // Fresh list from Firestore
      const fresh = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      setTickets(prev => {
        // If Firestore is empty but we have cache — keep cache (auth/network glitch)
        if (fresh.length === 0 && prev.length > 0) {
          console.warn('[TicketContext] Firebase empty, keeping', prev.length, 'cached tickets');
          return prev;
        }

        // Build map from fresh Firestore data (source of truth)
        const map = {};
        fresh.forEach(t => { map[t.id] = t; });

        // Also keep any local-only tickets (optimistic adds and demo tickets)
        prev.forEach(t => {
          if (!map[t.id]) {
            // NEVER keep temp tickets once Firestore has responded —
            // the real document is already in `fresh` under its real ID
            if (String(t.id).startsWith('temp_')) return;

            if (!isFirebaseId(String(t.id))) {
              // It's a demo ticket — keep it permanently in local context
              map[t.id] = t;
            } else {
              // It's a real Firebase ticket — keep only if it was added very recently (optimistic)
              const age = Date.now() - new Date(t.createdAt || 0).getTime();
              if (age < 30_000) map[t.id] = t;
            }
          }
        });

        return sortByRecentActivity(Object.values(map));
      });
    }, (error) => {
      console.error('[TicketContext] listener error:', error.code, error.message);
      // Keep existing cache — don't clear
    });

    return unsub;
  }, []);

  // ─── updateTicket ─────────────────────────────────────────────────────────
  // Optimistic update first, then Firestore (only for real Firebase IDs)
  const updateTicket = useCallback(async (ticketId, updates) => {
    if (!ticketId) return;

    // Always update local state immediately (optimistic)
    setTickets(prev =>
      prev.map(t => String(t.id) === String(ticketId) ? { ...t, ...updates } : t)
    );

    // Only write to Firestore for real Firebase document IDs
    if (!isFirebaseId(String(ticketId))) {
      // Demo or local-only ticket — skip Firestore
      return;
    }

    try {
      await updateDoc(doc(db, 'tickets', String(ticketId)), updates);
    } catch (error) {
      console.error('[updateTicket] Firestore error:', error.code, error.message);
      toast.error('Не удалось сохранить в облаке: ' + (error.message || error.code));
    }
  }, []);

  // ─── addTicket ────────────────────────────────────────────────────────────
  // No optimistic update — we let onSnapshot add the ticket to avoid duplicates.
  // The modal shows a spinner while waiting; onSnapshot fires within ~1s on good connection.
  const addTicket = useCallback(async (ticketData) => {
    try {
      await addDoc(collection(db, 'tickets'), {
        ...ticketData,
        status: 'new',
        createdAt: serverTimestamp(),
        createdBy: user?.uid || 'anonymous',
        comments: [],
      });
      toast.success('Задача создана');
    } catch (error) {
      console.error('[addTicket]', error);
      toast.error('Ошибка создания задачи');
      throw error;
    }
  }, [user]);

  // ─── addComment ───────────────────────────────────────────────────────────
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

    // Optimistic
    setTickets(prev =>
      prev.map(t => String(t.id) === String(ticketId) ? { ...t, comments: updatedComments } : t)
    );

    if (!isFirebaseId(String(ticketId))) return; // demo ticket — local only

    try {
      await updateDoc(doc(db, 'tickets', String(ticketId)), { comments: updatedComments });
      toast.success('Комментарий добавлен');
    } catch (error) {
      console.error('[addComment]', error);
      toast.error('Ошибка добавления комментария');
    }
  }, [user]);

  // ─── uploadFile ───────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file, onProgress) => {
    if (!file) return null;
    if (!auth.currentUser) {
      console.warn('[uploadFile] No Firebase auth, using local blob fallback');
      // For demo/unconfigured mode, we return a local URL so the UI works
      return { 
        name: file.name, 
        url: URL.createObjectURL(file), 
        type: file.type,
        isLocal: true 
      };
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

  const login = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      localStorage.removeItem('app_mock_user');
      toast.success('Вход выполнен');
    } catch (e) {
      console.warn('[Login] Firebase auth error, falling back to local state:', e.code);
      
      // Setup specific profile for Anastasiya
      const isAnastasiya = email.toLowerCase() === '19.anastasiya.tkachenko.88@gmail.com';
      
      const mockUser = {
        email: email,
        displayName: isAnastasiya ? 'Анастасия' : email.split('@')[0],
        uid: 'local_' + Date.now(),
        role: isAnastasiya ? 'manager' : 'admin',
        club: isAnastasiya ? 'COLIBRI' : null, // null means see all clubs
      };
      
      setUser(mockUser);
      localStorage.setItem('app_mock_user', JSON.stringify(mockUser));
      toast.info(`Вход выполнен: ${isAnastasiya ? 'Менеджер (Колибри)' : 'Администратор'}`);
    }
  };

  const logout = () => {
    localStorage.removeItem('app_mock_user');
    signOut(auth);
  };

  return (
    <TicketContext.Provider value={{ user, tickets, loading, login, logout, addTicket, updateTicket, addComment, uploadFile }}>
      {children}
    </TicketContext.Provider>
  );
};
