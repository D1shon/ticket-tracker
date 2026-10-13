import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initLiveTranslate } from './lib/liveTranslate'

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

// ─── Авто-обновление ──────────────────────────────────────────────────────────
// Долго открытые вкладки/PWA зависали на старых бандлах (новые размеры, фиксы
// не доезжали до устройств). Сверяем /version.json с вшитой меткой сборки при
// возврате в приложение и раз в 15 минут; новая версия = тихая перезагрузка.
// Защита от цикла: по одной и той же версии перезагружаемся не чаще раза.
const checkForUpdate = async () => {
  try {
    if (typeof __BUILD_TIME__ === 'undefined') return;
    const r = await fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { build } = await r.json();
    if (!build || build === __BUILD_TIME__) return;
    const key = 'hj_reloaded_for';
    if (sessionStorage.getItem(key) === build) return; // уже пробовали — не зацикливаемся
    try { sessionStorage.setItem(key, build); } catch {}
    window.location.reload();
  } catch {}
};
setInterval(checkForUpdate, 15 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
setTimeout(checkForUpdate, 20 * 1000); // и вскоре после запуска

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Живой перевод интерфейса (каз/англ). На русском не делает НИЧЕГО.
initLiveTranslate()
