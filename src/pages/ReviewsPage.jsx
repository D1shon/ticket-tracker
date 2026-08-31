import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Star, ExternalLink, MessageCircle, RefreshCw, CheckCircle2, Send, Clock, AlertTriangle, X, QrCode, Download, User } from 'lucide-react';
import QRCode from 'qrcode';
import { useTickets } from '../store/TicketContext';
import { REVIEW_BRANCHES, REVIEW_CLUB_URLS, fetchReviews } from '../lib/reviews2gis';
import WaPanel from './WaDemoPage';
import { db } from '../lib/firebase';
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { isMobileDevice } from '../lib/isMobile';

// track.hj.fit пока НЕ прописан в DNS (NXDOMAIN) → «сервер не найден».
// Ведём QR на рабочий домен Vercel, который резолвится на любом телефоне.
const FEEDBACK_BASE = 'https://ticket-tracker-inky.vercel.app/feedback';

const CLUBS = Object.keys(REVIEW_BRANCHES);

const Stars = ({ n, size = 13 }) => (
  <span style={{ display: 'inline-flex', gap: 1 }}>
    {[1, 2, 3, 4, 5].map(i => (
      <Star key={i} size={size} fill={i <= n ? '#C08F4F' : 'none'} style={{ color: i <= n ? '#C08F4F' : 'var(--border)' }} />
    ))}
  </span>
);

const ReviewsPage = () => {
  const { user } = useTickets();
  const isChef = user?.role === 'chef';
  const userClub = (user?.club || '').toUpperCase();

  const clubAvailable = CLUBS.includes(userClub);
  const [source, setSource] = useState('2gis'); // '2gis' | 'whatsapp'
  const [activeClub, setActiveClub] = useState(clubAvailable ? userClub : CLUBS[0]);
  const [state, setState] = useState({ loading: true, rating: null, count: null, reviews: [], nextLink: null, error: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState('all'); // all | bad | unanswered

  // Мобильный режим — только визуальные изменения
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Ответы через мост 2ГИС: review_replies/{reviewId} + статус моста gis_bridge/_bridge
  const [replies, setReplies] = useState({});
  const [gisBridge, setGisBridge] = useState(null);
  const [replyFor, setReplyFor] = useState(null); // id отзыва с открытой формой
  const [replyText, setReplyText] = useState('');

  // QR-отзывы клиентов + сгенерированный QR для печати
  const [qrReviews, setQrReviews] = useState([]);
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'qr_reviews'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
      setQrReviews(list);
    }, () => {});
  }, []);

  // Статичный QR ведёт на публичную форму с параметром клуба
  const feedbackUrl = `${FEEDBACK_BASE}?club=${encodeURIComponent(activeClub)}`;
  useEffect(() => {
    QRCode.toDataURL(feedbackUrl, { width: 520, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [feedbackUrl]);

  const clubQrReviews = useMemo(
    () => qrReviews.filter(r => (r.club || '').toUpperCase() === activeClub),
    [qrReviews, activeClub]
  );

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `HJ-otzyv-${activeClub}.png`;
    a.click();
  };

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'review_replies'), snap => {
      const m = {};
      snap.docs.forEach(d => { m[d.id] = d.data(); });
      setReplies(m);
    }, () => {});
    const u2 = onSnapshot(doc(db, 'gis_bridge', '_bridge'), d => setGisBridge(d.data() || null), () => {});
    return () => { u1(); u2(); };
  }, []);

  const bridgeOnline = gisBridge?.heartbeatISO && (Date.now() - new Date(gisBridge.heartbeatISO).getTime()) < 12 * 60 * 1000;

  const submitReply = async (r) => {
    const text = replyText.trim();
    if (!text) return;
    try {
      await setDoc(doc(db, 'review_replies', String(r.id)), {
        reviewId: String(r.id),
        club: activeClub,
        branchId: REVIEW_BRANCHES[activeClub],
        reviewAuthor: r.user?.name || '',
        reviewDateISO: r.date_created || '',
        reviewSnippet: (r.text || '').slice(0, 300),
        reviewRating: r.rating || 0,
        text,
        author: user?.displayName || '',
        authorEmail: user?.email || '',
        status: 'pending',
        errorNote: null,
        createdAtISO: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
      setReplyFor(null);
      setReplyText('');
      toast.success('Ответ поставлен в очередь на публикацию в 2ГИС');
    } catch {
      toast.error('Не удалось сохранить ответ');
    }
  };

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
  const fmtDateTime = (iso) => {
    try { return format(new Date(iso), 'd MMMM yyyy, HH:mm', { locale: ru }); } catch { return ''; }
  };

  const visibleClubs = isChef || !clubAvailable ? CLUBS : [userClub];

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, margin: '0 auto', paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(192,143,79,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Star size={20} style={{ color: '#C08F4F' }} fill="#C08F4F" />
          </div>
          <div>
            <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Отзывы</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Отзывы клиентов из всех источников</p>
          </div>
        </div>
        {(source === '2gis' || source === 'qr') && visibleClubs.length > 1 && (
          /* мобайл: клубные табы — горизонтальная лента без переноса */
          <div style={isMobile
            ? { display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap', width: '100%', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }
            : { display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {visibleClubs.map(club => (
              <button key={club} onClick={() => setActiveClub(club)} style={{
                padding: isMobile ? '8px 14px' : '6px 14px', borderRadius: isMobile ? 999 : 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
                border: '1px solid ' + (activeClub === club ? 'var(--accent-purple)' : 'var(--border)'),
                background: activeClub === club ? 'var(--accent-purple)' : 'transparent',
                color: activeClub === club ? '#fff' : 'var(--text-muted)',
              }}>{club}</button>
            ))}
          </div>
        )}
      </div>

      {/* Sources — переключение прямо здесь, без переходов; мобайл: лента без переноса */}
      <div style={isMobile
        ? { display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }
        : { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>Источники:</span>
        <button onClick={() => setSource('2gis')} style={{
          padding: isMobile ? '8px 14px' : '6px 14px', borderRadius: isMobile ? 999 : 10, fontSize: 11, fontWeight: 800, cursor: 'pointer',
          whiteSpace: 'nowrap', flexShrink: 0,
          border: '1px solid ' + (source === '2gis' ? 'rgba(46,204,64,0.6)' : 'var(--border)'),
          background: source === '2gis' ? 'rgba(46,204,64,0.15)' : 'transparent',
          color: source === '2gis' ? '#2ecc40' : 'var(--text-muted)',
        }}>2ГИС</button>
        <button onClick={() => setSource('whatsapp')} style={{
          padding: isMobile ? '8px 14px' : '6px 14px', borderRadius: isMobile ? 999 : 10, fontSize: 11, fontWeight: 800, cursor: 'pointer',
          whiteSpace: 'nowrap', flexShrink: 0,
          border: '1px solid ' + (source === 'whatsapp' ? 'rgba(37,211,102,0.6)' : 'var(--border)'),
          background: source === 'whatsapp' ? 'rgba(37,211,102,0.15)' : 'transparent',
          color: source === 'whatsapp' ? '#25D366' : 'var(--text-muted)',
        }}>WhatsApp</button>
        <button onClick={() => setSource('qr')} style={{
          padding: isMobile ? '8px 14px' : '6px 14px', borderRadius: isMobile ? 999 : 10, fontSize: 11, fontWeight: 800, cursor: 'pointer',
          whiteSpace: 'nowrap', flexShrink: 0,
          border: '1px solid ' + (source === 'qr' ? 'rgba(85,128,168,0.6)' : 'var(--border)'),
          background: source === 'qr' ? 'rgba(85,128,168,0.15)' : 'transparent',
          color: source === 'qr' ? '#5580A8' : 'var(--text-muted)',
        }}>📱 Отзывы QR</button>
        <span style={{ padding: '6px 14px', borderRadius: isMobile ? 999 : 10, fontSize: 11, fontWeight: 700, border: '1px dashed var(--border)', color: 'var(--text-muted)', opacity: 0.7, whiteSpace: 'nowrap', flexShrink: 0 }}>Техподдержка · скоро</span>
      </div>

      {/* ═══ WhatsApp — рабочее окно прямо здесь ═══ */}
      {source === 'whatsapp' && <WaPanel embedded />}

      {/* ═══ Отзывы QR ═══ */}
      {source === 'qr' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* QR для печати */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, flexWrap: 'wrap' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 8, flexShrink: 0 }}>
              {qrDataUrl ? <img src={qrDataUrl} alt="QR" style={{ width: 120, height: 120, display: 'block' }} /> : <div style={{ width: 120, height: 120 }} />}
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4 }}>QR для шкафчиков · {activeClub}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
                Распечатайте и повесьте в раздевалке. Клиент сканирует → пишет отзыв → он падает сюда. QR статичный, менять не нужно.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={downloadQr} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 11, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                  <Download size={13} /> Скачать QR (PNG)
                </button>
                <a href={feedbackUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, fontWeight: 800, cursor: 'pointer', textDecoration: 'none' }}>
                  Открыть форму ↗
                </a>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 8, wordBreak: 'break-all' }}>
                Ссылка QR: {feedbackUrl}
              </div>
            </div>
          </div>

          {/* Сводка */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(() => {
              const total = clubQrReviews.length;
              const bad = clubQrReviews.filter(r => (r.rating || 0) <= 3).length;
              const avg = total ? (clubQrReviews.reduce((s, r) => s + (r.rating || 0), 0) / total).toFixed(1) : '—';
              return [
                ['Всего отзывов', total, 'var(--accent-purple)'],
                ['Средняя оценка', avg, '#C08F4F'],
                ['Негатив (≤3)', bad, bad ? '#B06A6A' : '#5F9C81'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ flex: 1, minWidth: 100, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px' }}>
                  <div style={{ fontSize: 22, fontWeight: 950, color: c }}>{v}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{l}</div>
                </div>
              ));
            })()}
          </div>

          {/* Список отзывов */}
          {clubQrReviews.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, lineHeight: 1.7 }}>
              <QrCode size={30} style={{ opacity: 0.4, marginBottom: 8 }} /><br />
              Отзывов по QR пока нет.<br />Повесьте распечатанный QR в шкафчиках — отзывы клиентов появятся здесь.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {clubQrReviews.map(r => {
                const bad = (r.rating || 0) <= 3;
                return (
                  <div key={r.id} style={{ background: 'var(--bg-card)', borderRadius: isMobile ? 14 : 16, padding: isMobile ? '11px 12px' : '14px 16px', border: '1px solid var(--border)', borderLeft: `3px solid ${bad ? '#B06A6A' : '#5F9C81'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      <Stars n={r.rating || 0} size={13} />
                      {r.zone && <span style={{ fontSize: 9, fontWeight: 900, color: '#5580A8', background: 'rgba(85,128,168,0.1)', padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>{r.zone}</span>}
                      <span style={{ fontSize: 8, fontWeight: 900, color: '#5580A8', background: 'rgba(85,128,168,0.1)', padding: '2px 6px', borderRadius: 5 }}>QR</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>{fmtDateTime(r.createdAtISO)}</span>
                    </div>
                    {r.text && <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{r.text}</div>}
                    {(r.clientName || r.clientPhone) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                        <User size={11} /> {r.clientName || 'Клиент'}
                        {r.clientPhone && <a href={`https://wa.me/${r.clientPhone.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#25D366', textDecoration: 'none' }}>· +{r.clientPhone.replace(/[^\d]/g, '')}</a>}
                      </div>
                    )}
                    {r.aiTask && (
                      <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(125,111,179,0.06)', border: '1px solid rgba(125,111,179,0.2)', fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span style={{ fontWeight: 800, color: 'var(--accent-purple)' }}>🤖 Задача:</span> {r.aiTask}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {source === '2gis' && (<>
      {/* Статус моста публикации ответов */}
      {gisBridge && !bridgeOnline && (
        <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(192,143,79,0.08)', border: '1px solid rgba(192,143,79,0.3)', fontSize: 12, fontWeight: 700, color: '#C08F4F' }}>
          ⚠️ Мост 2ГИС офлайн — новые ответы сохранятся и опубликуются, когда включится компьютер в офисе
        </div>
      )}
      {isChef && bridgeOnline && gisBridge?.auth === 'need_login' && (
        <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(176,106,106,0.08)', border: '1px solid rgba(176,106,106,0.3)', fontSize: 12, fontWeight: 700, color: '#B06A6A' }}>
          🔑 Нужен вход в личный кабинет 2ГИС на офисном компьютере — ответы не публикуются
        </div>
      )}
      {/* Rating summary + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 18px' }}>
          <span style={{ fontSize: 28, fontWeight: 950, color: '#C08F4F' }}>{state.rating ?? '—'}</span>
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

      {/* Filters — мобайл: лента без переноса */}
      <div style={isMobile
        ? { display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }
        : { display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          ['all', 'Все'],
          ['bad', `⚠️ Плохие (${state.reviews.filter(r => (r.rating || 0) <= 3).length})`],
          ['unanswered', `Без ответа (${state.reviews.filter(r => !r.official_answer).length})`],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{
            padding: isMobile ? '8px 14px' : '7px 14px', borderRadius: isMobile ? 999 : 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
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
        <div style={{ textAlign: 'center', padding: 60, color: '#B06A6A', fontSize: 13, fontWeight: 600 }}>Не удалось загрузить: {state.error}</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
          Нет отзывов по выбранному фильтру
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : 10 }}>
          {visible.map(r => (
            /* мобайл: карточки отзывов плотнее */
            <div key={r.id} style={{
              background: 'var(--bg-card)', borderRadius: isMobile ? 14 : 16, padding: isMobile ? '11px 12px' : '14px 16px',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${(r.rating || 0) <= 2 ? '#B06A6A' : (r.rating || 0) === 3 ? '#C08F4F' : '#5F9C81'}`,
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
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, color: '#5F9C81', background: 'rgba(95,156,129,0.1)', padding: '4px 8px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                    <CheckCircle2 size={10} /> Отвечено
                  </span>
                ) : replies[String(r.id)]?.status === 'pending' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, color: '#C08F4F', background: 'rgba(192,143,79,0.1)', padding: '4px 8px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                    <Clock size={10} /> Публикуется…
                  </span>
                ) : replies[String(r.id)]?.status === 'sent' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, color: '#5F9C81', background: 'rgba(95,156,129,0.1)', padding: '4px 8px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                    <CheckCircle2 size={10} /> Ответ отправлен
                  </span>
                ) : replies[String(r.id)]?.status === 'error' ? (
                  <button
                    onClick={() => { setReplyFor(r.id); setReplyText(replies[String(r.id)]?.text || ''); }}
                    title={replies[String(r.id)]?.errorNote || 'Ошибка публикации'}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, color: '#B06A6A', background: 'rgba(176,106,106,0.1)', border: '1px solid rgba(176,106,106,0.3)', padding: '4px 8px', borderRadius: 8, whiteSpace: 'nowrap', cursor: 'pointer' }}
                  >
                    <AlertTriangle size={10} /> Ошибка · повторить
                  </button>
                ) : (
                  <button
                    onClick={() => { setReplyFor(replyFor === r.id ? null : r.id); setReplyText(''); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: 'var(--accent-purple)', background: 'rgba(125,111,179,0.1)', border: '1px solid rgba(125,111,179,0.3)', padding: '5px 10px', borderRadius: 8, whiteSpace: 'nowrap', cursor: 'pointer' }}
                  >
                    <MessageCircle size={11} /> Ответить
                  </button>
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
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(95,156,129,0.06)', border: '1px solid rgba(95,156,129,0.2)' }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: '#5F9C81', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Официальный ответ</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.official_answer.text}</div>
                </div>
              )}

              {/* Наш ответ, отправленный через платформу (пока 2ГИС его не показал в official_answer) */}
              {!r.official_answer && ['pending', 'sent'].includes(replies[String(r.id)]?.status) && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(192,143,79,0.05)', border: '1px dashed rgba(192,143,79,0.3)' }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: '#C08F4F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    Ответ {replies[String(r.id)].author ? `· ${replies[String(r.id)].author}` : ''} {replies[String(r.id)].status === 'pending' ? '· ждёт публикации' : '· отправлен в 2ГИС'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{replies[String(r.id)].text}</div>
                </div>
              )}

              {/* Форма ответа */}
              {replyFor === r.id && !r.official_answer && (
                /* мобайл: удобная форма ответа — крупный шрифт (без зума iOS), кнопки ≥44px */
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    autoFocus
                    rows={4}
                    placeholder={`Ответ от имени Hero's Journey ${activeClub}…`}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? '12px 14px' : '10px 12px', fontSize: isMobile ? 16 : 13, color: 'var(--text-primary)', outline: 'none', fontWeight: 500, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55, boxSizing: 'border-box', width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => submitReply(r)}
                      disabled={!replyText.trim()}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: isMobile ? '12px 16px' : '9px 16px', minHeight: isMobile ? 44 : undefined, flex: isMobile ? 1 : undefined, borderRadius: isMobile ? 12 : 10, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: isMobile ? 13 : 12, fontWeight: 800, cursor: 'pointer', opacity: replyText.trim() ? 1 : 0.5 }}
                    >
                      <Send size={12} /> Опубликовать в 2ГИС
                    </button>
                    <button
                      onClick={() => { setReplyFor(null); setReplyText(''); }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: isMobile ? '12px 14px' : '9px 12px', minHeight: isMobile ? 44 : undefined, borderRadius: isMobile ? 12 : 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      <X size={12} /> Отмена
                    </button>
                    {!bridgeOnline && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#C08F4F' }}>Мост офлайн — опубликуется, когда включится компьютер в офисе</span>
                    )}
                  </div>
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
      </>)}
    </div>
  );
};

export default ReviewsPage;
