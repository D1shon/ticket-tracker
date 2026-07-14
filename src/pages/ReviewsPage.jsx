import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Star, ExternalLink, MessageCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { REVIEW_BRANCHES, REVIEW_CLUB_URLS, fetchReviews } from '../lib/reviews2gis';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const CLUBS = Object.keys(REVIEW_BRANCHES);

const Stars = ({ n, size = 13 }) => (
  <span style={{ display: 'inline-flex', gap: 1 }}>
    {[1, 2, 3, 4, 5].map(i => (
      <Star key={i} size={size} fill={i <= n ? '#f59e0b' : 'none'} style={{ color: i <= n ? '#f59e0b' : 'var(--border)' }} />
    ))}
  </span>
);

const ReviewsPage = () => {
  const { user } = useTickets();
  const isChef = user?.role === 'chef';
  const userClub = (user?.club || '').toUpperCase();

  const clubAvailable = CLUBS.includes(userClub);
  const [activeClub, setActiveClub] = useState(clubAvailable ? userClub : CLUBS[0]);
  const [state, setState] = useState({ loading: true, rating: null, count: null, reviews: [], nextLink: null, error: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState('all'); // all | bad | unanswered

  const load = useCallback(async (club) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchReviews(REVIEW_BRANCHES[club], { limit: 20 });
      setState({ loading: false, error: null, ...data });
    } catch (e) {
      setState({ loading: false, rating: null, count: null, reviews: [], nextLink: null, error: e.message });
    }
  }, []);

  useEffect(() => { load(activeClub); }, [activeClub, load]);

  const loadMore = async () => {
    if (!state.nextLink || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchReviews(REVIEW_BRANCHES[activeClub], { nextLink: state.nextLink });
      setState(s => ({ ...s, reviews: [...s.reviews, ...data.reviews], nextLink: data.nextLink }));
    } catch {} finally {
      setLoadingMore(false);
    }
  };

  const visible = useMemo(() => {
    if (filter === 'bad') return state.reviews.filter(r => (r.rating || 0) <= 3);
    if (filter === 'unanswered') return state.reviews.filter(r => !r.official_answer);
    return state.reviews;
  }, [state.reviews, filter]);

  // Managers of a club without a 2GIS branch (Nurly Orda for now)
  if (!isChef && user?.role === 'manager' && !clubAvailable) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
        Для клуба {userClub || '—'} пока нет карточки в 2ГИС
      </div>
    );
  }

  const fmtDate = (iso) => {
    try { return format(new Date(iso), 'd MMMM yyyy', { locale: ru }); } catch { return ''; }
  };

  const visibleClubs = isChef || !clubAvailable ? CLUBS : [userClub];

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, margin: '0 auto', paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Star size={20} style={{ color: '#f59e0b' }} fill="#f59e0b" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Отзывы</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Отзывы клиентов из всех источников</p>
          </div>
        </div>
        {visibleClubs.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {visibleClubs.map(club => (
              <button key={club} onClick={() => setActiveClub(club)} style={{
                padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: '1px solid ' + (activeClub === club ? 'var(--accent-purple)' : 'var(--border)'),
                background: activeClub === club ? 'var(--accent-purple)' : 'transparent',
                color: activeClub === club ? '#fff' : 'var(--text-muted)',
              }}>{club}</button>
            ))}
          </div>
        )}
      </div>

      {/* Rating summary + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 18px' }}>
          <span style={{ fontSize: 28, fontWeight: 950, color: '#f59e0b' }}>{state.rating ?? '—'}</span>
          <div>
            <Stars n={Math.round(state.rating || 0)} />
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>{state.count ?? '—'} отзывов</div>
          </div>
        </div>
        <button onClick={() => load(activeClub)} title="Обновить" style={{ padding: '12px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 0 }}>
          <RefreshCw size={15} style={state.loading ? { animation: 'spin 0.8s linear infinite' } : undefined} />
        </button>
        <a
          href={REVIEW_CLUB_URLS[activeClub]}
          target="_blank" rel="noopener noreferrer"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, padding: '11px 16px', borderRadius: 14, border: 'none', background: '#2ecc40', color: '#fff', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}
        >
          <ExternalLink size={14} /> Открыть в 2ГИС
        </a>
      </div>

      {/* Sources — 2GIS live, остальные подключаются следующими */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Источники:</span>
        <span style={{ padding: '5px 12px', borderRadius: 10, fontSize: 11, fontWeight: 800, background: 'rgba(46,204,64,0.12)', border: '1px solid rgba(46,204,64,0.4)', color: '#2ecc40' }}>2ГИС ✓</span>
        {['Техподдержка', 'Slack'].map(s => (
          <span key={s} style={{ padding: '5px 12px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-muted)', opacity: 0.7 }}>{s} · скоро</span>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          ['all', 'Все'],
          ['bad', `⚠️ Плохие (${state.reviews.filter(r => (r.rating || 0) <= 3).length})`],
          ['unanswered', `Без ответа (${state.reviews.filter(r => !r.official_answer).length})`],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{
            padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: '1px solid ' + (filter === id ? 'var(--accent-purple)' : 'var(--border)'),
            background: filter === id ? 'var(--accent-purple)' : 'transparent',
            color: filter === id ? '#fff' : 'var(--text-muted)',
          }}>{label}</button>
        ))}
      </div>

      {/* List */}
      {state.loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>Загружаю отзывы из 2ГИС…</div>
      ) : state.error ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#ef4444', fontSize: 13, fontWeight: 600 }}>Не удалось загрузить: {state.error}</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
          Нет отзывов по выбранному фильтру
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(r => (
            <div key={r.id} style={{
              background: 'var(--bg-card)', borderRadius: 16, padding: '14px 16px',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${(r.rating || 0) <= 2 ? '#ef4444' : (r.rating || 0) === 3 ? '#f59e0b' : '#22c55e'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                {r.user?.photo_preview_urls?.['64x64'] || r.user?.photo_preview_urls?.url ? (
                  <img src={r.user.photo_preview_urls['64x64'] || r.user.photo_preview_urls.url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: 'var(--text-muted)' }}>
                    {(r.user?.name || '?')[0]}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{r.user?.name || 'Аноним'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Stars n={r.rating || 0} size={11} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>{fmtDate(r.date_created)}</span>
                    <span style={{ fontSize: 8, fontWeight: 900, color: '#2ecc40', background: 'rgba(46,204,64,0.1)', padding: '2px 6px', borderRadius: 5, letterSpacing: '0.04em' }}>2ГИС</span>
                  </div>
                </div>
                {r.official_answer ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '4px 8px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                    <CheckCircle2 size={10} /> Отвечено
                  </span>
                ) : (
                  <a
                    href={REVIEW_CLUB_URLS[activeClub]}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: 'var(--accent-purple)', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', padding: '5px 10px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    <MessageCircle size={11} /> Ответить в 2ГИС
                  </a>
                )}
              </div>

              {r.text && <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{r.text}</div>}

              {r.photos?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {r.photos.slice(0, 4).map((p, i) => (
                    <img key={i} src={p.preview_urls?.['320x'] || p.preview_urls?.url} alt="" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover' }} />
                  ))}
                </div>
              )}

              {r.official_answer?.text && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Официальный ответ</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.official_answer.text}</div>
                </div>
              )}
            </div>
          ))}

          {state.nextLink && filter === 'all' && (
            <button onClick={loadMore} disabled={loadingMore} style={{
              padding: '13px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: loadingMore ? 0.5 : 1,
            }}>
              {loadingMore ? 'Загрузка…' : 'Показать ещё'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ReviewsPage;
