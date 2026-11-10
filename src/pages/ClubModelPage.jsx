import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Camera, ExternalLink, RotateCcw, Hammer, Share2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useTickets } from '../store/TicketContext';
import { isMobileDevice } from '../lib/isMobile';
import { CLUB_MODELS, hasModelAccess, modelsFor, userClubs } from '../data/clubModels';

// Вкладка «Модель клуба»: сверху чипы-вкладки по клубам (список и готовность — src/data/clubModels.js),
// ниже iframe с моделью выбранного клуба (public/models/<slug>/index.html, Three.js). Краны, щиты и
// пульты в модели кликабельны — у каждого карточка «что это / что будет, если перекрыть / инструкция»
// плюс аварийные сценарии. У клубов без модели — заглушка «в работе».
// Шеф видит вкладки всех клубов, сотрудник — только своих (правило доступа в navAccess.js).
// «Поделиться» — публичная ссылка на модель конкретного клуба: /model/<slug> (редирект в vercel.json на
// статичный public/models/<slug>/index.html), открывается без аккаунта HJ Track. Домен — только рабочий
// ticket-tracker-inky.vercel.app (track.hj.fit в DNS не живёт).

// У клуба может быть ещё «фототур» (поле tour в реестре): точки обзора по фото инженерного помещения
// с кликабельными объектами. Переключатель «3D-модель / Фототур» над iframe, публичная ссылка /model/<slug>/tour.

const PUBLIC_ORIGIN = 'https://ticket-tracker-inky.vercel.app';
const shareUrl = (m, view) => `${PUBLIC_ORIGIN}/model/${m.slug}${view === 'tour' ? '/tour' : ''}`;

const ClubModelPage = () => {
  const { user } = useTickets();
  const tabs = useMemo(() => modelsFor(user), [user]);

  // по умолчанию — клуб пользователя с готовой моделью, иначе первая готовая, иначе первая вкладка
  const [club, setClub] = useState(() => {
    const mine = userClubs(user);
    const own = tabs.find(m => m.ready && mine.includes(m.club));
    return (own || tabs.find(m => m.ready) || tabs[0] || CLUB_MODELS[0]).club;
  });
  const active = tabs.find(m => m.club === club) || tabs[0];

  const [view, setView] = useState('model'); // 'model' | 'tour'
  const hasTour = !!active?.tour;
  const showTour = hasTour && view === 'tour';
  const frameUrl = showTour ? active.tour : active?.url;

  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeKey, setIframeKey] = useState(0); // смена key = перезагрузка iframe
  useEffect(() => { setIframeLoaded(false); }, [club, view]);

  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = shareUrl(active, showTour ? 'tour' : 'model');
    const text = showTour
      ? `${active.tourTitle || 'Фототур'} · ${active.club}`
      : `3D-модель клуба ${active.club}${active.title ? ` · ${active.title}` : ''}`;
    if (isMobileDevice() && navigator.share) {
      try { await navigator.share({ title: text, text, url }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
      toast.success('Ссылка на модель скопирована — откроется у любого без входа в HJ Track');
    } catch {
      window.prompt('Ссылка для тех, у кого нет аккаунта', url);
    }
  };

  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  if (!hasModelAccess(user) || !active) {
    return (
      <div className="animate-fade" style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 24 }}>
        <Building2 size={36} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Модель клуба</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.6 }}>
          3D-модели вашего клуба пока нет. Она появится, как только будут загружены чертежи.
        </div>
      </div>
    );
  }

  const btnStyle = {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
  };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 10, height: isMobile ? 'calc(100dvh - 130px)' : 'calc(100vh - 60px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(155,93,229,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={16} style={{ color: '#9b5de5' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Модель клуба · {active.club}{active.title ? ` · ${active.title}` : ''}
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)' }}>
              {!active.ready ? 'Модель этого клуба ещё не загружена'
                : showTour ? 'Переходите по точкам обзора и нажимайте на метки — появится описание'
                : 'Нажмите на кран или пульт — появится инструкция'}
            </div>
          </div>
        </div>
        {active.ready && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={() => { setIframeLoaded(false); setIframeKey(k => k + 1); }} title="Перезагрузить" style={btnStyle}>
              <RotateCcw size={13} />{!isMobile && 'Обновить'}
            </button>
            <button onClick={() => window.open(frameUrl, '_blank', 'noopener')} title="Открыть в новом окне" style={btnStyle}>
              <ExternalLink size={13} />{!isMobile && 'В новом окне'}
            </button>
            <button onClick={share} title="Ссылка для тех, у кого нет аккаунта" style={{ ...btnStyle, borderColor: copied ? '#22c55e' : '#9b5de5', color: copied ? '#22c55e' : '#9b5de5' }}>
              {copied ? <Check size={13} /> : <Share2 size={13} />}{!isMobile && 'Поделиться'}
            </button>
          </div>
        )}
      </div>

      {/* вкладки по клубам */}
      {tabs.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map(m => {
            const on = m.club === active.club;
            return (
              <button key={m.club} onClick={() => setClub(m.club)} title={m.ready ? 'Модель готова' : 'Модель в работе'} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999,
                border: `1px solid ${on ? '#9b5de5' : 'var(--border)'}`,
                background: on ? 'rgba(155,93,229,0.14)' : 'var(--bg-card)',
                color: on ? 'var(--text-primary)' : (m.ready ? 'var(--text-secondary)' : 'var(--text-muted)'),
                fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: m.ready ? 1 : 0.75,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: m.ready ? '#22c55e' : '#64748b', flexShrink: 0 }} />
                {m.club}
              </button>
            );
          })}
        </div>
      )}

      {/* переключатель «3D-модель / Фототур» — только у клубов, где есть фототур */}
      {active.ready && hasTour && (
        <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg-card)', alignSelf: 'flex-start' }}>
          {[{ id: 'model', label: '3D-модель', Icon: Building2 }, { id: 'tour', label: active.tourTitle || 'Фототур', Icon: Camera }].map(({ id, label, Icon }) => {
            const on = (view === id);
            return (
              <button key={id} onClick={() => setView(id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: 'none',
                background: on ? '#9b5de5' : 'transparent', color: on ? '#fff' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 800, cursor: 'pointer',
              }}>
                <Icon size={13} />{label}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ position: 'relative', flex: 1, minHeight: 0, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', background: '#0b0f17' }}>
        {active.ready ? (
          <>
            {!iframeLoaded && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--bg-card)', zIndex: 1 }}>
                <Building2 size={32} style={{ color: '#9b5de5', opacity: 0.6 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Загружаем модель…</span>
              </div>
            )}
            <iframe
              key={`${active.club}-${view}-${iframeKey}`}
              src={frameUrl}
              title={showTour ? `Фототур · ${active.club}` : `3D-модель клуба ${active.club}`}
              onLoad={() => setIframeLoaded(true)}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              allow="fullscreen"
            />
          </>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--bg-card)', textAlign: 'center', padding: 24 }}>
            <Hammer size={34} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{active.club}: модель в работе</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', maxWidth: 380, lineHeight: 1.6 }}>
              Пришлите чертежи (планы ОВ и ВК) и фото инженерных помещений — соберём модель, как у COLIBRI.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClubModelPage;
