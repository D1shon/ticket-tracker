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

  // ─── Profile Helper ──────────────────────────────────────────────────────
  const enrichUserWithRole = useCallback((u) => {
    if (!u) return null;
    const email = u.email?.toLowerCase() || '';
    const nameStr = (u.displayName || '').toLowerCase();
    
    let role = 'user';
    let club = null;
    let finalDisplayName = u.displayName || email.split('@')[0];

    const isChef = email.includes('chef') || 
                   email === 'dilshat.r@hj.fit' || 
                   email.includes('sales5') || 
                   email.includes('admin') ||
                   nameStr.includes('chef') ||
                   nameStr.includes('шеф');

    if (isChef) {
      role = 'chef';
    } else {
      if (email.includes('anastasia') || email.includes('anastassiya') || email.includes('anastasiya') || email.includes('tkachenko') || nameStr.includes('anastasia') || nameStr.includes('анастасия')) {
        role = 'manager';
        club = 'COLIBRI';
        finalDisplayName = 'Анастасия';
      } else if (email.includes('aziz') || nameStr.includes('азиз')) {
        role = 'manager';
        club = 'COLIBRI';
      } else if (email.includes('sania') || email.includes('saniya') || nameStr.includes('сания')) {
        role = 'manager';
        club = '4YOU';
      } else if (email.includes('ainur') || nameStr.includes('айнур')) {
        role = 'manager';
        club = '4YOU';
      } else if (email.includes('dias') || nameStr.includes('диас')) {
        role = 'manager';
        club = 'VILLA';
      } else if (email.includes('saltanat') || nameStr.includes('салтанат')) {
        role = 'manager';
        club = 'NURLY ORDA';
      }
    }

    return {
      ...u,
      displayName: finalDisplayName,
      role,
      club
    };
  }, []);

  // ─── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      const savedMock = localStorage.getItem('app_mock_user');
      if (savedMock) {
        try { 
          const mock = JSON.parse(savedMock);
          setUser(enrichUserWithRole(mock));
          setLoading(false);
          return;
        } catch {}
      }

      if (u) {
        setUser(enrichUserWithRole(u));
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, [enrichUserWithRole]);

  const login = async (email, password) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      setUser(enrichUserWithRole(cred.user));
      localStorage.removeItem('app_mock_user');
      toast.success('Вход выполнен');
    } catch (e) {
      console.warn('[Login] Firebase auth error, falling back to local state:', e.code);
      const mockUser = enrichUserWithRole({
        email: email,
        uid: 'local_' + Date.now(),
      });
      setUser(mockUser);
      localStorage.setItem('app_mock_user', JSON.stringify(mockUser));
      toast.info(`Вход в демо-режиме: ${mockUser.role === 'manager' ? 'Менеджер (Колибри)' : 'Администратор'}`);
    }
  };

  const logout = () => {
    localStorage.removeItem('app_mock_user');
    signOut(auth).then(() => {
      setUser(null);
      toast.success('Вы вышли из системы');
    });
    setUser(null);
  };

  // ─── Firestore live listener ──────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'tickets'));
    const unsub = onSnapshot(q, (snapshot) => {
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
    return unsub;
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
