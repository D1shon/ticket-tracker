import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'sonner';

const NotificationContext = createContext();
export const useNotifications = () => useContext(NotificationContext);

const STORAGE_KEY = 'app_notifications_v1';
const READ_KEY = 'app_notifications_read_v1';

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
  const [notifications, setNotifications] = useState(loadStored);
  const [readIds, setReadIds] = useState(loadReadSet);
  const [panelOpen, setPanelOpen] = useState(false);

  const prevTicketsRef = useRef(null); // null means "first load — don't fire"

  // Persist notifications
  useEffect(() => {
    try {
      // Keep only last 100 notifications
      const trimmed = notifications.slice(0, 100);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {}
  }, [notifications]);

  // Persist read ids
  useEffect(() => {
    try {
      localStorage.setItem(READ_KEY, JSON.stringify([...readIds]));
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
    // No orderBy — mixed Timestamp/string types in createdAt crash Firestore SDK.
    const q = query(collection(db, 'tickets'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
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
          pushNotification(
            EVENT_TYPES.NEW_TICKET,
            '🆕 Новая заявка',
            `"${ticket.title || 'Без названия'}"`,
            { ticketId: ticket.id, ticketTitle: ticket.title }
          );
          return;
        }

        if (change.type === 'modified' && oldTicket) {
          // ── Status changed ──
          if (oldTicket.status !== ticket.status && ticket.status) {
            const statusInfo = STATUS_LABELS[ticket.status] || { label: ticket.status, icon: '🔔', color: '#7B3DFF' };
            pushNotification(
              EVENT_TYPES.STATUS_CHANGE,
              `${statusInfo.icon} ${statusInfo.label}`,
              `Заявка: "${ticket.title || 'Без названия'}"`,
              { ticketId: ticket.id, ticketTitle: ticket.title, status: ticket.status }
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
                  { ticketId: ticket.id, ticketTitle: ticket.title, author: comment.author }
                );
              } else if (hasFile) {
                pushNotification(
                  EVENT_TYPES.FILE_ATTACHED,
                  `📎 Прикреплён файл`,
                  `В заявке "${ticket.title || 'Без названия'}" — ${comment.attachment.name || 'файл'}`,
                  { ticketId: ticket.id, ticketTitle: ticket.title, author: comment.author }
                );
              } else if (hasText) {
                pushNotification(
                  EVENT_TYPES.NEW_MESSAGE,
                  `💬 Новое сообщение`,
                  `В заявке "${ticket.title || 'Без названия'}": ${comment.text.slice(0, 60)}${comment.text.length > 60 ? '…' : ''}`,
                  { ticketId: ticket.id, ticketTitle: ticket.title, author: comment.author }
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

    return () => unsubscribe();
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
