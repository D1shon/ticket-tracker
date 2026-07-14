// Service worker: PWA installability + Firebase Cloud Messaging background push.
// Push display and clicks are handled by the FCM SDK (notification payload +
// fcm_options.link) — works on iOS, Android and desktop without custom handlers.
// No offline caching — the app is realtime (Firestore), stale caches would hurt.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk',
  authDomain: 'hjtrack-928f5.firebaseapp.com',
  projectId: 'hjtrack-928f5',
  storageBucket: 'hjtrack-928f5.firebasestorage.app',
  messagingSenderId: '236581443884',
  appId: '1:236581443884:web:a9ce84dcbf0efc59267489',
});

const messaging = firebase.messaging();

// App icon badge counter (iOS 16.4+ installed PWA, Android/Chrome).
// The SDK displays the notification itself; here we only bump the badge.
messaging.onBackgroundMessage(async () => {
  try {
    if ('setAppBadge' in navigator) {
      const shown = await self.registration.getNotifications();
      await navigator.setAppBadge(Math.max(1, shown.length + 1));
    }
  } catch {}
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
