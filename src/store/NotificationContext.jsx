import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'sonner';

const NotificationContext = createContext();
export const useNotifications = () => useContext(NotificationContext);

const STORAGE_KEY = 'app_notifications_v1';
const READ_KEY = 'app_notifications_read_v1';

// ─── Role map (mirrors TicketContext) ────────────────────────────────────────
const USER_ROLES = {
  'dilshat.r@hj.fit':     { role: 'chef',    club: null },
  'magzhan@hj.fit':       { role: 'chef',    club: null },
  'daewure@mail.ru':      { role: 'manager', club: 'COLIBRI' },
  'ainura030594@gmail.com':{ role: 'manager', club: 'NURLY ORDA' },
  'diassd9806@gmail.com': { role: 'manager', club: 'VILLA' },
  'kurbanovtimur585@gmail.com': { role: 'manager', club: '4YOU' },
  'kelessovaan@gmail.com': { role: 'manager', club: 'VILLA' },
  'azimuus@gmail.com':    { role: 'manager', club: 'NURLY ORDA' },
  '19.anastasiya.tkachenko.88@gmail.com': { role: 'manager', club: 'COLIBRI' },
  'saniya@hj.fit':        { role: 'manager', club: '4YOU' },
  'aziz@hj.fit':          { role: 'manager', club: 'COLIBRI' },
  'saltanat@hj.fit':      { role: 'manager', club: 'NURLY ORDA' },
};

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
  const prevTicketsRef = useRef(null); // null means "first load — don't fire"

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
    const notif = {
      id: makeId(),
      type,
      title,
      description,
      createdAt: new Date().toISOString(),
      ...meta,
    };

    setNotifications(prev => [notif, ...prev]);

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
  }, []);

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
                { ticketId: ticket.id, ticketTitle: ticket.title, club: ticket.club }
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
                  { ticketId: ticket.id, ticketTitle: ticket.title, status: ticket.status, club: ticket.club }
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

                  if (hasFile && hasText) {
                    pushNotification(
                      EVENT_TYPES.FILE_ATTACHED,
                      `📎 Сообщение с файлом`,
                      `В заявке "${ticket.title || 'Без названия'}": ${comment.text.slice(0, 60)}${comment.text.length > 60 ? '…' : ''}`,
                      { ticketId: ticket.id, ticketTitle: ticket.title, author: comment.author, club: ticket.club }
                    );
                  } else if (hasFile) {
                    pushNotification(
                      EVENT_TYPES.FILE_ATTACHED,
                      `📎 Прикреплён файл`,
                      `В заявке "${ticket.title || 'Без названия'}" — ${comment.attachment.name || 'файл'}`,
                      { ticketId: ticket.id, ticketTitle: ticket.title, author: comment.author, club: ticket.club }
                    );
                  } else if (hasText) {
                    pushNotification(
                      EVENT_TYPES.NEW_MESSAGE,
                      `💬 Новое сообщение`,
                      `В заявке "${ticket.title || 'Без названия'}": ${comment.text.slice(0, 60)}${comment.text.length > 60 ? '…' : ''}`,
                      { ticketId: ticket.id, ticketTitle: ticket.title, author: comment.author, club: ticket.club }
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
    };
  }, [pushNotification]);

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
    }}>
      {children}
    </NotificationContext.Provider>
  );
};
