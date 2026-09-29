import React, { useState, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { pushNotify } from '../lib/pushNotify';

// Публичная страница обратной связи для клиентов (без входа).
// Открывается по статичному QR из шкафчиков: /feedback?club=PROMENADE
// Отзывы падают в qr_reviews → менеджеры читают, ИИ разбирает и ставит задачи.
// Три языка (по умолчанию казахский, переключатель сверху); в БАЗУ зона пишется
// каноническим русским значением — фильтры /reviews и ИИ-разбор не ломаются.
const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];
const ZONES = ['Сервис на ресепшне', 'Раздевалка', 'Локеры', 'Зал', 'Душевые', 'Вентиляция и кондиционирование', 'Чистота и порядок', 'Приложение', 'Другое'];

const LANGS = [
  { id: 'kk', label: 'ҚАЗ' },
  { id: 'ru', label: 'РУС' },
  { id: 'en', label: 'ENG' },
];

const T = {
  kk: {
    title: 'Сіздің пікіріңіз',
    subtitle: (club) => `Hero's Journey${club ? ` · ${club}` : ''} — бәрі қалай өткенін айтып беріңіз`,
    yourClub: 'Сіздің клубыңыз',
    yourRating: 'Сіздің бағаңыз',
    ratingAria: (n) => `Баға: 5-тен ${n}`,
    ratings: { 1: 'Нашар', 2: 'Онша емес', 3: 'Орташа', 4: 'Жақсы', 5: 'Өте жақсы' },
    zoneLabel: 'Пікір не туралы? (міндетті емес)',
    zones: ['Ресепшндегі қызмет', 'Киім ауыстыратын бөлме', 'Локерлер', 'Зал', 'Душ', 'Желдету және кондиционер', 'Тазалық және тәртіп', 'Қосымша', 'Басқа'],
    textLabel: 'Не ұнады немесе нені жақсартуға болады?',
    textPh: 'Осында жазыңыз…',
    contactsLabel: 'Сізбен байланысқанын қаласаңыз, төмендегі деректерді толтырыңыз',
    namePh: 'Атыңыз',
    phonePh: 'Телефон',
    send: 'Пікірді жіберу',
    sending: 'Жіберілуде…',
    footer: 'Байланыс деректерін қалдырмасаңыз, пікір анонимді болады. Біз әр хабарламаны оқимыз.',
    doneTitle: 'Пікіріңізге рахмет',
    doneBody: 'Пікіріңізді алдық және жұмысқа қабылдадық. Сіз Hero’s Journey-ді жақсартып жатырсыз :)',
    sendError: 'Жіберу мүмкін болмады. Интернетті тексеріп, қайталап көріңіз.',
  },
  ru: {
    title: 'Ваш отзыв',
    subtitle: (club) => `Hero's Journey${club ? ` · ${club}` : ''} — расскажите, как всё прошло`,
    yourClub: 'Ваш клуб',
    yourRating: 'Ваша оценка',
    ratingAria: (n) => `Оценка ${n} из 5`,
    ratings: { 1: 'Плохо', 2: 'Так себе', 3: 'Нормально', 4: 'Хорошо', 5: 'Отлично' },
    zoneLabel: 'О чём отзыв? (необязательно)',
    zones: ZONES,
    textLabel: 'Что понравилось или что улучшить?',
    textPh: 'Напишите здесь…',
    contactsLabel: 'Если Вы хотите, чтобы с Вами связались, заполните пожалуйста данные ниже',
    namePh: 'Имя',
    phonePh: 'Телефон',
    send: 'Отправить отзыв',
    sending: 'Отправляю…',
    footer: 'Отзыв анонимный, если не оставите контакты. Мы читаем каждое сообщение.',
    doneTitle: 'Благодарим за отзыв',
    doneBody: 'Мы уже получили ваш комментарий и взяли его в работу. Вы делаете Hero’s Journey лучше :)',
    sendError: 'Не удалось отправить. Проверьте интернет и попробуйте ещё раз.',
  },
  en: {
    title: 'Your feedback',
    subtitle: (club) => `Hero's Journey${club ? ` · ${club}` : ''} — tell us how it went`,
    yourClub: 'Your club',
    yourRating: 'Your rating',
    ratingAria: (n) => `Rating ${n} of 5`,
    ratings: { 1: 'Bad', 2: 'So-so', 3: 'Okay', 4: 'Good', 5: 'Excellent' },
    zoneLabel: 'What is it about? (optional)',
    zones: ['Reception service', 'Locker room', 'Lockers', 'Gym', 'Showers', 'Ventilation & AC', 'Cleanliness', 'App', 'Other'],
    textLabel: 'What did you like, or what should we improve?',
    textPh: 'Write here…',
    contactsLabel: 'If you would like us to contact you, please fill in your details below',
    namePh: 'Name',
    phonePh: 'Phone',
    send: 'Send feedback',
    sending: 'Sending…',
    footer: 'Your feedback is anonymous unless you leave your contacts. We read every message.',
    doneTitle: 'Thank you for your feedback',
    doneBody: 'We received your comment and are already on it. You make Hero’s Journey better :)',
    sendError: 'Failed to send. Check your connection and try again.',
  },
};

const FeedbackPage = () => {
  const clubParam = useMemo(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('club') || '';
      const up = p.toUpperCase().trim();
      return CLUBS.includes(up) ? up : '';
    } catch { return ''; }
  }, []);

  // Язык: по умолчанию казахский; выбор запоминается на устройстве
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem('hj_fb_lang');
      return T[saved] ? saved : 'kk';
    } catch { return 'kk'; }
  });
  const t = T[lang];
  const pickLang = (id) => { setLang(id); try { localStorage.setItem('hj_fb_lang', id); } catch {} };

  const [club, setClub] = useState(clubParam);
  const [rating, setRating] = useState(null);
  const [zone, setZone] = useState(''); // всегда каноническое русское значение
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const canSend = club && rating != null && (text.trim().length > 0 || zone);

  const submit = async () => {
    if (!canSend || sending) return;
    setSending(true);
    try {
      try { await signInAnonymously(auth); } catch {}
      await addDoc(collection(db, 'qr_reviews'), {
        club,
        rating,
        zone: zone || null,
        text: text.trim().slice(0, 1000) || null,
        clientName: name.trim() || null,
        clientPhone: phone.replace(/[^\d+]/g, '') || null,
        lang,                   // на каком языке заполняли форму
        status: 'new',          // new → ИИ разберёт и поставит задачу
        source: 'qr',
        createdAtISO: new Date().toISOString(),
        createdAt: serverTimestamp(),
      });
      // Мгновенный пуш команде клуба о новом QR-отзыве
      pushNotify({
        title: `📱 Новый QR-отзыв · ${club}`,
        body: `Оценка ${rating}/5${zone ? ' · ' + zone : ''}${text.trim() ? ' — ' + text.trim().slice(0, 70) : ''}`,
        club,
        roles: ['manager', 'komdir', 'chef'],
        url: '/reviews',
        tag: 'qr-review',
      }).catch(() => {});
      setDone(true);
    } catch {
      alert(t.sendError);
    } finally {
      setSending(false);
    }
  };

  const page = { minHeight: '100vh', background: 'linear-gradient(160deg,#0f1117,#1a1d29)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, fontFamily: 'system-ui, -apple-system, sans-serif' };
  const card = { width: '100%', maxWidth: 460, background: '#16181f', border: '1px solid #262a36', borderRadius: 24, padding: 26, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' };
  const label = { fontSize: 13, fontWeight: 800, color: '#9aa0ad', marginBottom: 10 };
  const input = { width: '100%', boxSizing: 'border-box', background: '#0f1117', border: '1px solid #2a2e3a', borderRadius: 14, padding: '13px 15px', fontSize: 15, color: '#fff', outline: 'none', fontFamily: 'inherit' };

  const langSwitcher = (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 18 }}>
      {LANGS.map(l => (
        <button key={l.id} onClick={() => pickLang(l.id)} style={{
          padding: '7px 16px', borderRadius: 999, fontSize: 12, fontWeight: 900, letterSpacing: '0.05em', cursor: 'pointer',
          border: '1px solid ' + (lang === l.id ? '#5580A8' : '#2a2e3a'),
          background: lang === l.id ? '#5580A8' : 'transparent',
          color: lang === l.id ? '#fff' : '#9aa0ad',
        }}>{l.label}</button>
      ))}
    </div>
  );

  if (done) {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>🙏</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: '0 0 10px' }}>{t.doneTitle}</h1>
          <p style={{ fontSize: 15, color: '#9aa0ad', lineHeight: 1.6, margin: 0 }}>{t.doneBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={card}>
        {langSwitcher}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#5580A8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 24, color: '#fff', marginBottom: 12 }}>HJ</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0, textAlign: 'center' }}>{t.title}</h1>
          <p style={{ fontSize: 14, color: '#9aa0ad', margin: '6px 0 0', textAlign: 'center' }}>{t.subtitle(club)}</p>
        </div>

        {/* Клуб — если не пришёл в QR */}
        {!clubParam && (
          <div style={{ marginBottom: 20 }}>
            <div style={label}>{t.yourClub}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CLUBS.map(c => (
                <button key={c} onClick={() => setClub(c)} style={{
                  padding: '9px 14px', borderRadius: 11, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  border: '1px solid ' + (club === c ? '#5580A8' : '#2a2e3a'),
                  background: club === c ? '#5580A8' : 'transparent', color: club === c ? '#fff' : '#9aa0ad',
                }}>{c}</button>
              ))}
            </div>
          </div>
        )}

        {/* Оценка — звёзды 1–5 */}
        <div style={{ marginBottom: 20 }}>
          <div style={label}>{t.yourRating}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(n => {
              const active = rating != null && n <= rating;
              return (
                <button key={n} onClick={() => setRating(n)} aria-label={t.ratingAria(n)} style={{
                  flex: 1, padding: '12px 0', borderRadius: 14, cursor: 'pointer',
                  border: '1px solid ' + (active ? '#f5b301' : '#2a2e3a'),
                  background: active ? 'rgba(245,179,1,0.12)' : 'transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  transition: 'all 0.12s',
                }}>
                  <span style={{ fontSize: 26, lineHeight: 1, color: active ? '#f5b301' : '#3a3f4d' }}>★</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: active ? '#f5b301' : '#6b7280' }}>{n}</span>
                </button>
              );
            })}
          </div>
          {rating != null && (
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, fontWeight: 800, color: '#f5b301' }}>
              {t.ratings[rating]}
            </div>
          )}
        </div>

        {/* Зона: показываем на выбранном языке, в базу пишем каноническое русское */}
        <div style={{ marginBottom: 20 }}>
          <div style={label}>{t.zoneLabel}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ZONES.map((z, i) => (
              <button key={z} onClick={() => setZone(zone === z ? '' : z)} style={{
                padding: '8px 13px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: '1px solid ' + (zone === z ? '#5580A8' : '#2a2e3a'),
                background: zone === z ? 'rgba(85,128,168,0.15)' : 'transparent', color: zone === z ? '#5580A8' : '#9aa0ad',
              }}>{t.zones[i]}</button>
            ))}
          </div>
        </div>

        {/* Текст */}
        <div style={{ marginBottom: 20 }}>
          <div style={label}>{t.textLabel}</div>
          <textarea rows={4} value={text} onChange={e => setText(e.target.value)} maxLength={1000}
            placeholder={t.textPh} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
        </div>

        {/* Контакты (необязательно) */}
        <div style={{ marginBottom: 22 }}>
          <div style={label}>{t.contactsLabel}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t.namePh} style={{ ...input, flex: 1 }} />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t.phonePh} inputMode="tel" style={{ ...input, flex: 1.2 }} />
          </div>
        </div>

        <button onClick={submit} disabled={!canSend || sending} style={{
          width: '100%', padding: '15px', borderRadius: 16, border: 'none',
          background: canSend ? '#5580A8' : '#2a2e3a', color: '#fff', fontSize: 16, fontWeight: 800,
          cursor: canSend ? 'pointer' : 'not-allowed', opacity: sending ? 0.6 : 1,
        }}>
          {sending ? t.sending : t.send}
        </button>
        <p style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', margin: '14px 0 0', lineHeight: 1.5 }}>
          {t.footer}
        </p>
      </div>
    </div>
  );
};

export default FeedbackPage;
