import { useEffect, useState } from 'react';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Непрочитанные сообщения в заявках: точка на карточке, если в заявке есть
// ЧУЖОЙ комментарий новее момента, когда пользователь последний раз открывал
// эту заявку. Отметки хранятся в user_prefs/{email}.ticketReads (синхронно
// между устройствами) с зеркалом в localStorage для мгновенного старта.
// Первый запуск без отметок: базовая линия «сейчас» (_baseline), чтобы старые
// переписки не зажгли точки на всех заявках разом.

const store = {
  email: null,
  reads: {},        // ticketId -> ISO последнего открытия ('_baseline' — общая точка отсчёта)
  loaded: false,
  listeners: new Set(),
};
const emit = () => store.listeners.forEach(fn => fn());
const lsKey = (email) => `hj_ticket_reads_${email}`;

async function load(email) {
  try {
    const cached = JSON.parse(localStorage.getItem(lsKey(email)) || 'null');
    if (cached && typeof cached === 'object') { store.reads = cached; store.loaded = true; emit(); }
  } catch {}
  try {
    const snap = await getDoc(doc(db, 'user_prefs', email));
    const remote = snap.exists() ? snap.data().ticketReads : null;
    if (remote && typeof remote === 'object') {
      // Сервер и локалка сливаются по максимуму — отметка с любого устройства не теряется
      const merged = { ...store.reads };
      Object.entries(remote).forEach(([k, v]) => { if (!merged[k] || v > merged[k]) merged[k] = v; });
      store.reads = merged;
    }
  } catch {}
  if (!store.reads._baseline) {
    store.reads._baseline = new Date().toISOString();
    persist(email, { _baseline: store.reads._baseline });
  }
  store.loaded = true;
  try { localStorage.setItem(lsKey(email), JSON.stringify(store.reads)); } catch {}
  emit();
}

function persist(email, patch) {
  try { localStorage.setItem(lsKey(email), JSON.stringify(store.reads)); } catch {}
  setDoc(doc(db, 'user_prefs', email), { ticketReads: patch }, { merge: true }).catch(() => {});
}

// Последний ЧУЖОЙ комментарий заявки (свои сообщения точку не зажигают)
const lastForeignISO = (ticket, email) => {
  let last = '';
  (ticket?.comments || []).forEach(c => {
    if ((c?.authorEmail || '').toLowerCase() === email) return;
    if (c?.createdAt && c.createdAt > last) last = c.createdAt;
  });
  return last;
};

export function useTicketReads(user) {
  const email = (user?.email || '').toLowerCase().trim();
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(x => x + 1);
    store.listeners.add(fn);
    if (email && store.email !== email) {
      store.email = email;
      store.reads = {};
      store.loaded = false;
      load(email);
    }
    return () => store.listeners.delete(fn);
  }, [email]);

  const isUnread = (ticket) => {
    if (!store.loaded || !email) return false;
    const last = lastForeignISO(ticket, email);
    if (!last) return false;
    const read = store.reads[ticket.id] || store.reads._baseline || '';
    return last > read;
  };

  const markRead = (ticket) => {
    if (!email || !ticket?.id) return;
    const last = lastForeignISO(ticket, email);
    const cur = store.reads[ticket.id] || '';
    const now = new Date().toISOString();
    if (cur >= now && cur >= last) return; // уже отмечено — не пишем лишний раз
    store.reads[ticket.id] = now;
    persist(email, { [ticket.id]: now });
    emit();
  };

  return { isUnread, markRead };
}
