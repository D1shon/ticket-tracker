import React, { useState, useEffect } from 'react';
import { Building2, ExternalLink, RotateCcw } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { isMobileDevice } from '../lib/isMobile';

// 3D-модель клуба Colibri («Инвиктус», Валиханова 170): статичная страница
// public/building-3d.html (Three.js). Краны, щиты и пульты кликабельны —
// у каждого карточка «что это / что будет, если перекрыть / инструкция»
// плюс аварийные сценарии (потоп, пожар, нет ГВС и т.д.).
// Пока модель есть только у Colibri — вкладка закрыта для других клубов
// (правило в navAccess.js + проверка клуба здесь на случай прямой ссылки).
const MODEL_URL = '/building-3d.html';
const MODEL_CLUB = 'COLIBRI';

const hasModelAccess = (user) => {
  if (user?.role === 'chef') return true;
  const clubs = [user?.club, ...(Array.isArray(user?.clubs) ? user.clubs : [])];
  return clubs.some(c => (c || '').toUpperCase() === MODEL_CLUB);
};

const ClubModelPage = () => {
  const { user } = useTickets();
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeKey, setIframeKey] = useState(0); // смена key = перезагрузка iframe

  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  if (!hasModelAccess(user)) {
    return (
      <div className="animate-fade" style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 24 }}>
        <Building2 size={36} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Модель клуба</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.6 }}>
          3D-модель пока есть только у клуба COLIBRI. Для вашего клуба появится позже.
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 10, height: isMobile ? 'calc(100dvh - 130px)' : 'calc(100vh - 60px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(155,93,229,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={16} style={{ color: '#9b5de5' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Модель клуба · COLIBRI</div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)' }}>Нажмите на кран или пульт — появится инструкция</div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => { setIframeLoaded(false); setIframeKey(k => k + 1); }} title="Перезагрузить" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}><RotateCcw size={13} />{!isMobile && 'Обновить'}</button>
          <button onClick={() => window.open(MODEL_URL, '_blank', 'noopener')} title="Открыть в новом окне" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}><ExternalLink size={13} />{!isMobile && 'В новом окне'}</button>
        </div>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', background: '#0b0f17' }}>
        {!iframeLoaded && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--bg-card)', zIndex: 1 }}>
            <Building2 size={32} style={{ color: '#9b5de5', opacity: 0.6 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Загружаем модель…</span>
          </div>
        )}
        <iframe
          key={iframeKey}
          src={MODEL_URL}
          title="3D-модель клуба COLIBRI"
          onLoad={() => setIframeLoaded(true)}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allow="fullscreen"
        />
      </div>
    </div>
  );
};

export default ClubModelPage;
