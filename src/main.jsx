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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
