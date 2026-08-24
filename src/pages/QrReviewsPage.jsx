import React, { useState, useEffect, useMemo } from 'react';
import { Star, QrCode, User, MessageSquare, Download, Copy } from 'lucide-react';
import QRCodeLib from 'qrcode';
import { useTickets } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];
// Форма отзыва (публичная) на рабочем домене — QR ведёт сюда
const FEEDBACK_BASE = 'https://ticket-tracker-inky.vercel.app/feedback';

const fmtDate = (iso) => {
  try { return format(new Date(iso), 'd MMMM, HH:mm', { locale: ru }); } catch { return ''; }
};

// Оценка 1-5 звёздами
const Stars = ({ n = 0, size = 15 }) => (
  <span style={{ display: 'inline-flex', gap: 2 }}>
    {[1, 2, 3, 4, 5].map(i => (
      <Star key={i} size={size} strokeWidth={2}
        style={{ color: i <= n ? '#C08F4F' : 'var(--border)', fill: i <= n ? '#C08F4F' : 'transparent' }} />
    ))}
  </span>
);

// Простая страница только с клиентскими QR-отзывами (для МОП, РОП, Ком-Дира, Шефа).
// Без 2ГИС/WhatsApp и без ответов — только просмотр отзывов клиентов по своему клубу.
const QrReviewsPage = () => {
  const { user } = useTickets();
  const role = user?.role;
  const userClub = user?.club?.toUpperCase() || null;
  // Шеф и Ком-Дир видят все клубы; РОП/МОП/менеджер/админ — только свой
  const canSeeAll = role === 'chef' || role === 'komdir';
  const visibleClubs = canSeeAll ? CLUBS : [userClub].filter(Boolean);

  const [activeClub, setActiveClub] = useState(userClub || '4YOU');
  const [reviews, setReviews] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'bad'
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'qr_reviews'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
      setReviews(list);
    }, () => {});
  }, []);

  // QR ведёт на форму отзыва с параметром клуба (статичный, менять не нужно)
  const feedbackUrl = `${FEEDBACK_BASE}?club=${encodeURIComponent(activeClub)}`;
  useEffect(() => {
    QRCodeLib.toDataURL(feedbackUrl, { width: 520, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [feedbackUrl]);

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR-отзыв-${activeClub}.png`;
    a.click();
  };
  const copyLink = () => {
    try { navigator.clipboard.writeText(feedbackUrl); toast.success('Ссылка скопирована'); } catch { toast.error('Не удалось скопировать'); }
  };

  const clubReviews = useMemo(
    () => reviews.filter(r => (r.club || '').toUpperCase() === activeClub),
    [reviews, activeClub]
  );

  const shown = useMemo(
    () => filter === 'bad' ? clubReviews.filter(r => (r.rating || 0) <= 3) : clubReviews,
    [clubReviews, filter]
  );

  const total = clubReviews.length;
  const bad = clubReviews.filter(r => (r.rating || 0) <= 3).length;
  const avg = total ? (clubReviews.reduce((s, r) => s + (r.rating || 0), 0) / total).toFixed(1) : '—';

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(85,128,168,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <QrCode size={20} style={{ color: '#5580A8' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>QR-отзывы</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Отзывы клиентов из шкафчиков (оценка и текст)</p>
          </div>
        </div>
        {visibleClubs.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {visibleClubs.map(c => (
              <button key={c} onClick={() => setActiveClub(c)} style={{
                padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: '1px solid ' + (activeClub === c ? 'var(--accent-purple)' : 'var(--border)'),
                background: activeClub === c ? 'var(--accent-purple)' : 'transparent',
                color: activeClub === c ? '#fff' : 'var(--text-muted)',
              }}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {/* QR-код формы + ссылка (для печати и распространения) */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, flexWrap: 'wrap' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 8, flexShrink: 0 }}>
          {qrDataUrl ? <img src={qrDataUrl} alt="QR" style={{ width: 120, height: 120, display: 'block' }} /> : <div style={{ width: 120, height: 120 }} />}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4 }}>QR формы отзыва · {activeClub}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
            Распечатайте и повесьте в раздевалке или отправьте клиенту. Он сканирует → ставит оценку и пишет отзыв → он появляется ниже. QR статичный, менять не нужно.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={downloadQr} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 11, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              <Download size={13} /> Скачать QR
            </button>
            <a href={feedbackUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, fontWeight: 800, cursor: 'pointer', textDecoration: 'none' }}>
              Открыть форму ↗
            </a>
            <button onClick={copyLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              <Copy size={13} /> Копировать ссылку
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 8, wordBreak: 'break-all' }}>
            {feedbackUrl}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          ['Всего отзывов', total, 'var(--accent-purple)'],
          ['Средняя оценка', avg, '#C08F4F'],
          ['Негатив (≤3)', bad, bad ? '#B06A6A' : '#5F9C81'],
        ].map(([l, v, c]) => (
          <div key={l} style={{ flex: 1, minWidth: 100, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 950, color: c }}>{v}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['all', `Все (${total})`], ['bad', `⚠️ Плохие (${bad})`]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{
            padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: '1px solid ' + (filter === id ? (id === 'bad' ? '#B06A6A' : 'var(--accent-purple)') : 'var(--border)'),
            background: filter === id ? (id === 'bad' ? 'rgba(176,106,106,0.15)' : 'var(--accent-purple)') : 'transparent',
            color: filter === id ? (id === 'bad' ? '#B06A6A' : '#fff') : 'var(--text-muted)',
          }}>{label}</button>
        ))}
      </div>

      {/* List */}
      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, lineHeight: 1.7 }}>
          <MessageSquare size={30} style={{ opacity: 0.4, marginBottom: 8 }} /><br />
          {filter === 'bad' ? 'Плохих отзывов нет 🎉' : 'Отзывов по QR пока нет.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map(r => {
            const isBad = (r.rating || 0) <= 3;
            return (
              <div key={r.id} style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '14px 16px', border: '1px solid var(--border)', borderLeft: `3px solid ${isBad ? '#B06A6A' : '#5F9C81'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <Stars n={r.rating || 0} size={14} />
                  {r.zone && <span style={{ fontSize: 9, fontWeight: 900, color: '#5580A8', background: 'rgba(85,128,168,0.1)', padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>{r.zone}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>{fmtDate(r.createdAtISO)}</span>
                </div>
                {r.text && <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{r.text}</div>}
                {(r.clientName || r.clientPhone) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                    <User size={11} /> {r.clientName || 'Клиент'}
                    {r.clientPhone && <a href={`https://wa.me/${r.clientPhone.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#25D366', textDecoration: 'none' }}>· +{r.clientPhone.replace(/[^\d]/g, '')}</a>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QrReviewsPage;
