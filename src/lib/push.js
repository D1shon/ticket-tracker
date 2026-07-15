// Web Push subscription via Firebase Cloud Messaging.
// Works in Chrome/Android and iOS 16.4+ (app must be added to Home Screen).
// The messaging SDK is imported lazily — it's not needed for first paint.
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, app } from './firebase';

const fcm = () => import('firebase/messaging');

const VAPID_KEY = 'BGrDPo3-dAUmEEm6KwqcdFTIk_5mkXZ2v6QNUm0L6P8ZoWEsF4M_X6Gw2lvb5BO7UUbbpOEOFV0C7FoOzvf2080';
const TOKEN_STORAGE_KEY = 'hj_push_token';

export async function pushSupported() {
  try {
    const { isSupported } = await fcm();
    return (await isSupported()) && 'Notification' in window && 'serviceWorker' in navigator;
  } catch {
    return false;
  }
}

/** iOS shows background push only for installed (home-screen) apps — a Safari-tab
 *  subscription registers fine but never delivers. */
export function iosNeedsInstall() {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true
    || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  return isIOS && !isStandalone;
}

/** Subscribe this device to push and store the token in Firestore. Must be called from a user gesture. */
export async function enablePush(user) {
  if (iosNeedsInstall()) {
    throw new Error('Вы открыли сайт в Safari — так уведомления на iPhone не работают. Откройте приложение HJ Track с экрана «Домой» и включите уведомления там. Если иконки нет: Поделиться → «На экран Домой».');
  }
  if (!(await pushSupported())) {
    throw new Error('Браузер не поддерживает push. На iPhone: добавьте приложение на экран «Домой» и включайте уведомления из него.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Разрешение на уведомления не выдано');
  }
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { getMessaging, getToken } = await fcm();
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error('Не удалось получить push-токен');

  await setDoc(doc(db, 'push_tokens', token), {
    email: (user?.email || '').toLowerCase(),
    displayName: user?.displayName || '',
    role: user?.role || '',
    club: user?.club || null,
    ua: navigator.userAgent.slice(0, 160),
    standalone: window.navigator.standalone === true
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || false,
    updatedAtISO: new Date().toISOString(),
  });
  try { localStorage.setItem(TOKEN_STORAGE_KEY, token); } catch {}
  return token;
}

/** Silently refresh the token if permission is already granted (e.g. on app start). */
export async function refreshPushToken(user) {
  try {
    if (iosNeedsInstall()) return null; // never (re)register a dead Safari-tab subscription
    if (!(await pushSupported())) return null;
    if (Notification.permission !== 'granted') return null;
    if (!localStorage.getItem(TOKEN_STORAGE_KEY)) return null; // user never opted in
    return await enablePushSilent(user);
  } catch {
    return null;
  }
}

async function enablePushSilent(user) {
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { getMessaging, getToken } = await fcm();
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) return null;
  await setDoc(doc(db, 'push_tokens', token), {
    email: (user?.email || '').toLowerCase(),
    displayName: user?.displayName || '',
    role: user?.role || '',
    club: user?.club || null,
    ua: navigator.userAgent.slice(0, 160),
    standalone: window.navigator.standalone === true
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || false,
    updatedAtISO: new Date().toISOString(),
  });
  try { localStorage.setItem(TOKEN_STORAGE_KEY, token); } catch {}
  return token;
}

/** Unsubscribe this device. */
export async function disablePush() {
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) await deleteDoc(doc(db, 'push_tokens', stored));
    const { getMessaging, deleteToken } = await fcm();
    const messaging = getMessaging(app);
    await deleteToken(messaging).catch(() => {});
  } finally {
    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch {}
  }
}

export function isPushEnabled() {
  try {
    if (iosNeedsInstall()) return false; // Safari-tab subscription doesn't deliver — show as off
    return Notification.permission === 'granted' && !!localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return false;
  }
}

export function getPushToken() {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY); } catch { return null; }
}
