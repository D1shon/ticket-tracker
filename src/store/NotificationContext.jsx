import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, onSnapshot, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { REVIEW_BRANCHES, fetchReviews } from '../lib/reviews2gis';
import { pushNotify } from '../lib/pushNotify';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'sonner';
import { formatAuthor } from '../utils/formatters';

const NotificationContext = createContext();
export const useNotifications = () => useContext(NotificationContext);

const STORAGE_KEY = 'app_notifications_v1';
const READ_KEY = 'app_notifications_read_v1';

import { USER_ROLES } from './TicketContext';

/** Returns the club of the currently logged-in session user, or null for chefs/unknown. */
function getSessionUserClub() {
  try {
    const raw = localStorage.getItem('app_session_user');
    if (!raw) return null;
    const { email } = JSON.parse(raw);
    const profile = USER_ROLES[(email || '').toLowerCase().trim()];
    return profile?.club ?? null; // null means chef → sees everything
  } catch {
    return null;
  }
}

/** Returns true if the current user is allowed to see a ticket with the given club. */
function canSeeTicket(ticketClub) {
  const userClub = getSessionUserClub();
  if (userClub === null) return true; // chef — unrestricted
  return (ticketClub || '').toUpperCase() === userClub.toUpperCase();
}

const STATUS_LABELS = {
  new:         { label: 'Новая заявка',      icon: '🆕', color: '#4C94FF' },
  in_progress: { label: 'Принята в работу',  icon: '⚡', color: '#70B11D' },
  paused:      { label: 'Поставлена на паузу', icon: '⏸️', color: '#FB8F41' },
  waiting:     { label: 'Перенесена в ожидание', icon: '⏳', color: '#FFCA43' },
  closed:      { label: 'Заявка закрыта',    icon: '✅', color: '#7B3DFF' },
};

const EVENT_TYPES = {
  STATUS_CHANGE: 'status_change',
  NEW_MESSAGE:   'new_message',
  FILE_ATTACHED: 'file_attached',
  NEW_TICKET:    'new_ticket',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Soft two-tone chime, synthesized — no audio file needed
let audioCtx = null;
function playDing() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const tone = (freq, at, dur, vol) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g);
      g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + at;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    tone(880, 0, 0.35, 0.12);      // ля
    tone(1318.5, 0.12, 0.45, 0.1); // ми (выше)
  } catch {}
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function loadReadSet() {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export const NotificationProvider = ({ children }) => {
  const [currentUserEmail, setCurrentUserEmail] = useState(() => {
    try {
      const raw = localStorage.getItem('app_session_user');
      return raw ? JSON.parse(raw).email : null;
    } catch {
      return null;
    }
  });

  const [notifications, setNotifications] = useState(() => {
    try {
      const raw = localStorage.getItem('app_session_user');
      if (!raw) return [];
      const { email } = JSON.parse(raw);
      const emailKey = email.toLowerCase().trim();
      const stored = localStorage.getItem(`app_notifications_v1_${emailKey}`);
      const loaded = stored ? JSON.parse(stored) : [];
      const userClub = getSessionUserClub();
      if (userClub === null) return loaded;
      return loaded.filter(n => {
        if (!n.ticketId) return true;
        if (n.club) return (n.club || '').toUpperCase() === userClub.toUpperCase();
        return true;
      });
    } catch {
      return [];
    }
  });

  const [readIds, setReadIds] = useState(() => {
    try {
      const raw = localStorage.getItem('app_session_user');
      if (!raw) return new Set();
      const { email } = JSON.parse(raw);
      const emailKey = email.toLowerCase().trim();
      const stored = localStorage.getItem(`app_notifications_read_v1_${emailKey}`);
      return new Set(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set();
    }
  });

  const [panelOpen, setPanelOpen] = useState(false);
  const [popupNotif, setPopupNotif] = useState(null);
  const prevTicketsRef = useRef(null); // null means "first load — don't fire"
  const pendingPopupRef = useRef([]);
  const popupTimerRef = useRef(null);

  // Persist notifications
  useEffect(() => {
    let email = null;
    try {
      const raw = localStorage.getItem('app_session_user');
      if (raw) email = JSON.parse(raw).email;
    } catch {}
    
    if (!email) return;
    try {
      const emailKey = email.toLowerCase().trim();
      const trimmed = notifications.slice(0, 100);
      localStorage.setItem(`app_notifications_v1_${emailKey}`, JSON.stringify(trimmed));
    } catch {}
  }, [notifications]);

  // Persist read ids
  useEffect(() => {
    let email = null;
    try {
      const raw = localStorage.getItem('app_session_user');
      if (raw) email = JSON.parse(raw).email;
    } catch {}
    
    if (!email) return;
    try {
      const emailKey = email.toLowerCase().trim();
      localStorage.setItem(`app_notifications_read_v1_${emailKey}`, JSON.stringify([...readIds]));
    } catch {}
  }, [readIds]);

  // ─── Push a notification ─────────────────────────────────────────────────
  const pushNotification = useCallback((type, title, description, meta = {}) => {
    if (currentUserEmail) {
      const emailKey = currentUserEmail.toLowerCase().trim();

      // Self-filter: don't show popup to the person who triggered the action.
      // Primary check: exact email match (reliable for new comments with authorEmail).
      // Fallback: compare formatted names (for old comments without authorEmail).
      if (meta.authorEmail) {
        if (meta.authorEmail.toLowerCase() === emailKey) return;
      } else if (meta.author) {
        const myFormatted = formatAuthor(emailKey).toLowerCase();
        if (myFormatted && meta.author.toLowerCase() === myFormatted) return;
      }

      // Club filter: only show notifications for the user's own club (chefs see all)
      if (meta.club) {
        const myClub = USER_ROLES[emailKey]?.club;
        if (myClub && (meta.club || '').toUpperCase() !== myClub.toUpperCase()) return;
      }
    }

    const notif = {
      id: makeId(),
      type,
      title,
      description,
      createdAt: new Date().toISOString(),
      ...meta,
    };

    setNotifications(prev => [notif, ...prev]);

    // Debounced batch popup: collect all notifications in a 2-second window,
    // then show one popup ("У вас X новых сообщений" if multiple arrive at once).
    pendingPopupRef.current.push(notif);
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    popupTimerRef.current = setTimeout(() => {
      const queue = pendingPopupRef.current;
      pendingPopupRef.current = [];
      if (queue.length === 0) return;
      playDing();
      if (queue.length === 1) {
        setPopupNotif(queue[0]);
      } else {
        setPopupNotif({
          id: makeId(),
          type: 'batch',
          title: `У вас ${queue.length} новых сообщений`,
          description: '',
          createdAt: new Date().toISOString(),
        });
      }
    }, 2000);

    // Show toast popup in top-right corner
    const statusMeta = STATUS_LABELS[meta.status];
    const toastColor = statusMeta?.color || '#7B3DFF';

    toast(title, {
      description,
      duration: 6000,
      style: {
        background: 'var(--bg-card)',
        border: `1px solid ${toastColor}55`,
        borderLeft: `3px solid ${toastColor}`,
        borderRadius: '12px',
        color: 'var(--text-primary)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      },
      icon: statusMeta?.icon || (type === EVENT_TYPES.NEW_MESSAGE ? '💬' : type === EVENT_TYPES.FILE_ATTACHED ? '📎' : '🔔'),
    });
  }, [currentUserEmail]);

  // ─── Watch Firestore tickets ──────────────────────────────────────────────
  useEffect(() => {
    let unsubscribeTickets = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Read current email from localStorage
        let email = null;
        try {
          const raw = localStorage.getItem('app_session_user');
          if (raw) email = JSON.parse(raw).email;
        } catch {}

        if (email) {
          const emailKey = email.toLowerCase().trim();
          const profile = USER_ROLES[emailKey];
          const isAdmin = profile?.role === 'admin';

          if (isAdmin) {
            setCurrentUserEmail(email);
            setNotifications([]);
            setReadIds(new Set());
            if (unsubscribeTickets) {
              unsubscribeTickets();
              unsubscribeTickets = null;
            }
            return;
          }

          setCurrentUserEmail(email);

          // Load notifications for this user
          let loadedNotifs = [];
          try {
            const rawNotifs = localStorage.getItem(`app_notifications_v1_${emailKey}`);
            loadedNotifs = rawNotifs ? JSON.parse(rawNotifs) : [];
          } catch {}

          // Filter loaded notifications to ensure they belong to user's club (extra safety)
          const userClub = getSessionUserClub();
          if (userClub !== null) {
            loadedNotifs = loadedNotifs.filter(n => {
              if (!n.ticketId) return true;
              if (n.club) return (n.club || '').toUpperCase() === userClub.toUpperCase();
              return true;
            });
          }
          setNotifications(loadedNotifs);

          let loadedRead = new Set();
          try {
            const rawRead = localStorage.getItem(`app_notifications_read_v1_${emailKey}`);
            loadedRead = new Set(rawRead ? JSON.parse(rawRead) : []);
          } catch {}
          setReadIds(loadedRead);
        }

        if (unsubscribeTickets) return; // Already listening

        // No orderBy — mixed Timestamp/string types in createdAt crash Firestore SDK.
        const q = query(collection(db, 'tickets'));
        unsubscribeTickets = onSnapshot(q, (snapshot) => {
          const currentTickets = {};
          snapshot.docs.forEach(d => { currentTickets[d.id] = { id: d.id, ...d.data() }; });

          // Skip first load — just memorize current state
          if (prevTicketsRef.current === null) {
            prevTicketsRef.current = currentTickets;
            return;
          }

          const prev = prevTicketsRef.current;

          snapshot.docChanges().forEach(change => {
            const ticket = { id: change.doc.id, ...change.doc.data() };
            const oldTicket = prev[ticket.id];

            // ── New ticket created ──
            if (change.type === 'added' && !oldTicket) {
              // Only notify if this ticket belongs to the user's club
              if (!canSeeTicket(ticket.club)) return;
              pushNotification(
                EVENT_TYPES.NEW_TICKET,
                '🆕 Новая заявка',
                `"${ticket.title || 'Без названия'}"`,
                { ticketId: ticket.id, ticketTitle: ticket.title, club: ticket.club, authorEmail: ticket.createdByEmail || '' }
              );
              return;
            }

            if (change.type === 'modified' && oldTicket) {
              // Skip notifications for tickets outside the user's club
              if (!canSeeTicket(ticket.club)) return;

              // ── Status changed ──
              if (oldTicket.status !== ticket.status && ticket.status) {
                const statusInfo = STATUS_LABELS[ticket.status] || { label: ticket.status, icon: '🔔', color: '#7B3DFF' };
                pushNotification(
                  EVENT_TYPES.STATUS_CHANGE,
                  `${statusInfo.icon} ${statusInfo.label}`,
                  `Заявка: "${ticket.title || 'Без названия'}"`,
                  { ticketId: ticket.id, ticketTitle: ticket.title, status: ticket.status, club: ticket.club, authorEmail: ticket.lastActionBy || '' }
                );
              }

              // ── New comment / message ──
              const oldComments = oldTicket.comments || [];
              const newComments = ticket.comments || [];
              if (newComments.length > oldComments.length) {
                const added = newComments.slice(oldComments.length);
                added.forEach(comment => {
                  const hasFile = !!comment.attachment;
                  const hasText = comment.text && comment.text.trim().length > 0;

                  const commentMeta = { ticketId: ticket.id, ticketTitle: ticket.title, author: comment.author, authorEmail: comment.authorEmail || '', club: ticket.club };
                  if (hasFile && hasText) {
                    pushNotification(
                      EVENT_TYPES.FILE_ATTACHED,
                      `📎 Сообщение с файлом`,
                      `В заявке "${ticket.title || 'Без названия'}": ${comment.text.slice(0, 60)}${comment.text.length > 60 ? '…' : ''}`,
                      commentMeta
                    );
                  } else if (hasFile) {
                    pushNotification(
                      EVENT_TYPES.FILE_ATTACHED,
                      `📎 Прикреплён файл`,
                      `В заявке "${ticket.title || 'Без названия'}" — ${comment.attachment.name || 'файл'}`,
                      commentMeta
                    );
                  } else if (hasText) {
                    pushNotification(
                      EVENT_TYPES.NEW_MESSAGE,
                      `💬 Новое сообщение`,
                      `В заявке "${ticket.title || 'Без названия'}": ${comment.text.slice(0, 60)}${comment.text.length > 60 ? '…' : ''}`,
                      commentMeta
                    );
                  }
                });
              }
            }
          });

          prevTicketsRef.current = currentTickets;
        }, (error) => {
          console.error('Notification watcher error:', error);
        });
      } else {
        setCurrentUserEmail(null);
        setNotifications([]);
        setReadIds(new Set());
        prevTicketsRef.current = null;
        if (unsubscribeTickets) {
          unsubscribeTickets();
          unsubscribeTickets = null;
        }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeTickets) unsubscribeTickets();
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    };
  }, [pushNotification]);

  // ─── Scheduled reminders: ping the server inside notification windows ────
  // Covers: checklists 5 min before shifts, daily check-in 6:30, monitors &
  // towels checks (weekdays 22:00, weekends per-club). The endpoint dedups
  // atomically, so many clients pinging at once is safe.
  useEffect(() => {
    if (!currentUserEmail) return;
    const check = async () => {
      try {
        const now = new Date();
        const day = now.getDay();
        const isWeekend = day === 0 || day === 6;
        const nowMin = now.getHours() * 60 + now.getMinutes();

        const windows = [];
        const shiftMins = isWeekend ? [540, 840, 1140] : [390, 690, 990, 1290];
        shiftMins.forEach(t => windows.push([t - 6, t]));          // чек-листы: за 5 мин до смены
        windows.push([390, 396]);                                  // чекин 6:30
        if (!isWeekend) {
          windows.push([1320, 1326]);                              // будни 22:00 — пульсометры/полотенца
        } else {
          windows.push([1140, 1146], [1260, 1266], [1290, 1296]);  // выходные по клубам
        }

        const inWindow = windows.some(([a, b]) => nowMin >= a && nowMin < b);
        if (!inWindow) return;

        const snap = await getDocs(collection(db, 'push_tokens'));
        const tokens = snap.docs.map(d => ({ t: d.id, club: d.data().club || null }));
        await fetch('/api/scheduled-reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens }),
        });
      } catch {}
    };
    check();
    const iv = setInterval(check, 60_000);
    return () => clearInterval(iv);
  }, [currentUserEmail]);

  // ─── New 2GIS reviews watcher: push when a fresh review appears ──────────
  // Checks on app start and every 30 min; Firestore marker per review id
  // dedups across clients, and the push `tag` collapses rare races on phones.
  useEffect(() => {
    if (!currentUserEmail) return;
    let cancelled = false;
    const check = async () => {
      for (const [club, branchId] of Object.entries(REVIEW_BRANCHES)) {
        if (cancelled) return;
        try {
          const { reviews } = await fetchReviews(branchId, { limit: 5 });
          const cutoff = Date.now() - 3 * 86400000; // смотрим только свежие (3 дня)
          for (const r of reviews) {
            const created = new Date(r.date_created).getTime();
            if (!(created > cutoff)) continue;
            const markerRef = doc(db, 'reviews_notified', String(r.id));
            const snap = await getDoc(markerRef);
            if (snap.exists()) continue;
            await setDoc(markerRef, { club, rating: r.rating || 0, notifiedAtISO: new Date().toISOString() });
            const stars = '⭐'.repeat(Math.max(1, Math.min(5, r.rating || 0)));
            pushNotify({
              title: `${(r.rating || 0) <= 3 ? '⚠️' : '⭐'} Новый отзыв 2ГИС · ${club}`,
              body: `${stars} ${r.user?.name || 'Аноним'}: ${(r.text || '').slice(0, 100)}`,
              club,
              url: '/reviews',
              tag: `review-${r.id}`,
            });
          }
        } catch {}
      }
    };
    const t = setTimeout(check, 8000); // после старта, когда приложение прогрузилось
    const iv = setInterval(check, 30 * 60 * 1000);
    return () => { cancelled = true; clearTimeout(t); clearInterval(iv); };
  }, [currentUserEmail]);

  // ─── Helpers for UI ───────────────────────────────────────────────────────
  // Safe guard: readIds could be a plain object after JSON parse/hydration edge cases
  const unreadCount = notifications.filter(n => {
    try { return !readIds.has(n.id); } catch { return true; }
  }).length;

  const markAllRead = useCallback(() => {
    setReadIds(new Set(notifications.map(n => n.id)));
  }, [notifications]);

  const markRead = useCallback((id) => {
    setReadIds(prev => new Set([...prev, id]));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setReadIds(new Set());
  }, []);

  return (
    <NotificationContext.Provider value={{
      notifications,
      readIds,
      unreadCount,
      panelOpen,
      setPanelOpen,
      markAllRead,
      markRead,
      clearAll,
      popupNotif,
      dismissPopup: () => setPopupNotif(null),
    }}>
      {children}
    </NotificationContext.Provider>
  );
};
