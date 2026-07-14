import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ─── One-time cache migration ─────────────────────────────────────────────────
// Clear old cache keys so stale demo/corrupted data doesn't block fresh Firebase data
;['tickets_cache_v2', 'tickets_cache_v1'].forEach(k => {
  try { localStorage.removeItem(k); } catch {}
});
// ─────────────────────────────────────────────────────────────────────────────

// PWA: service worker makes the app installable on Android/Chrome
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Clear the app-icon badge whenever the app is opened or focused
const clearAppBadge = () => { try { navigator.clearAppBadge?.(); } catch {} };
clearAppBadge();
window.addEventListener('focus', clearAppBadge);
document.addEventListener('visibilitychange', () => { if (!document.hidden) clearAppBadge(); });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
