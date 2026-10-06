import React, { useState, useEffect, useRef } from 'react';
import { GraduationCap, ExternalLink, RotateCcw, ArrowLeft, BookOpen, Award, TrendingUp, Sparkles } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { isMobileDevice } from '../lib/isMobile';
import { toast } from 'sonner';

// Партнёрская обучающая платформа. Открывается прямо внутри HJ Track (iframe),
// заходы и старты обучения пишем в academy_activity — видно, кто учится.
const ACADEMY_URL = 'https://heros-journey-trainee.web.app';

// SSO: наш сервер выпускает пропуск (custom token) проекта академии с должностью
// и правами — академия входит по нему сама, без второго логина. Если сервер SSO
// ещё не настроен (нет ключей академии) — тихо открываем академию как раньше.
const fetchSsoToken = async (user) => {
  try {
    if (!auth.currentUser) return null;
    const idToken = await auth.currentUser.getIdToken();
    const resp = await fetch('/api/academy-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guestName: user?.displayName || '',
        // Отдел и телефон стажёра из формы гостевого входа — академия по ним
        // выдаёт программу и подтягивает прогресс без повторной регистрации
        guestDept: (() => { try { return localStorage.getItem('hj_guest_dept') || 'admin'; } catch { return 'admin'; } })(),
        guestPhone: (() => { try { return localStorage.getItem('hj_guest_phone') || ''; } catch { return ''; } })(),
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.token || null;
  } catch {
    return null;
  }
};

const academyUrlWithSso = (token) => token ? `${ACADEMY_URL}/#hjsso=${encodeURIComponent(token)}` : ACADEMY_URL;

const logActivity = (user, type) => {
  const now = new Date();
  addDoc(collection(db, 'academy_activity'), {
    type, // 'page_visit' | 'start_training' | 'open_external'
    email: user?.email || '',
    name:  user?.displayName || '',
    club:  user?.club || '',
    role:  user?.role || '',
    date:  now.toISOString().slice(0, 10),
    timestampISO: now.toISOString(),
  }).catch(() => {});
};

const FEATURES = [
  { icon: BookOpen,   color: '#5580A8', title: 'Курсы и материалы',  text: 'Программа обучения Hero’s Journey — от базы до продвинутого уровня' },
  { icon: Award,      color: '#C08F4F', title: 'Тесты и аттестация', text: 'Проверка знаний после модулей — сразу видно, что усвоено' },
  { icon: TrendingUp, color: '#5F9C81', title: 'Рост в компании',    text: 'Пройденное обучение — плюс к аттестации и карьерному росту' },
];

const AcademyPage = () => {
  const { user } = useTickets();
  const [mode, setMode] = useState('intro'); // 'intro' | 'embed'
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeKey, setIframeKey] = useState(0); // смена key = перезагрузка iframe
  const visitLogged = useRef(false);

  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    if (visitLogged.current || !user) return;
    visitLogged.current = true;
    logActivity(user, 'page_visit');
  }, [user]);

  const [ssoToken, setSsoToken] = useState(null);
  const [ssoReady, setSsoReady] = useState(false); // токен получен (или SSO недоступно) — можно грузить iframe

  // Телефон для академии: по нему она подтверждает аккаунт и подтягивает прогресс.
  // Сотрудник вводит его ОДИН раз прямо здесь при первом входе (self-service,
  // не через панель шефа) — сохраняем в app_users, пропуск уходит уже с номером.
  const isEmployee = !!user?.email && user?.role !== 'guest';
  const [phoneChecked, setPhoneChecked] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [askPhone, setAskPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [pendingAction, setPendingAction] = useState('embed'); // 'embed' | 'external'
  useEffect(() => {
    if (!isEmployee) { setPhoneChecked(true); return; }
    getDoc(doc(db, 'app_users', user.email.toLowerCase()))
      .then(s => setHasPhone(!!(s.exists() && s.data().phone)))
      .catch(() => setHasPhone(true)) // профиль не прочитался — не блокируем вход окном
      .finally(() => setPhoneChecked(true));
  }, [isEmployee, user?.email]);

  const doStartTraining = async () => {
    logActivity(user, 'start_training');
    setIframeLoaded(false);
    setSsoReady(false);
    setMode('embed');
    const token = await fetchSsoToken(user);
    setSsoToken(token);
    setSsoReady(true);
  };

  const doOpenExternal = async () => {
    logActivity(user, 'open_external');
    const token = await fetchSsoToken(user);
    window.open(academyUrlWithSso(token), '_blank', 'noopener');
  };

  const needPhone = isEmployee && phoneChecked && !hasPhone;
  const startTraining = () => { if (needPhone) { setPendingAction('embed'); setAskPhone(true); } else doStartTraining(); };
  const openExternal = () => { if (needPhone) { setPendingAction('external'); setAskPhone(true); } else doOpenExternal(); };

  const proceed = () => (pendingAction === 'external' ? doOpenExternal() : doStartTraining());
  const savePhoneAndGo = async () => {
    const digits = phoneInput.replace(/\D/g, '');
    if (digits.length < 10) { toast.error('Введите номер полностью, например 77771112233'); return; }
    setSavingPhone(true);
    try {
      await setDoc(doc(db, 'app_users', user.email.toLowerCase()), { phone: digits }, { merge: true });
      setHasPhone(true);
      setAskPhone(false);
      proceed();
    } catch {
      toast.error('Не удалось сохранить номер — попробуйте ещё раз');
    } finally {
      setSavingPhone(false);
    }
  };
  const skipPhoneAndGo = () => { setAskPhone(false); setHasPhone(true); proceed(); }; // не спрашиваем повторно в этой сессии

  // Окно одноразового ввода телефона перед первым входом в академию
  const phoneModal = askPhone ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 420, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <GraduationCap size={18} style={{ color: '#7D6FB3' }} />
          <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>Номер для Академии</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 600, lineHeight: 1.6, margin: '0 0 14px' }}>
          Укажите номер телефона, под которым вы зарегистрированы в Академии, — аккаунт
          подтвердится автоматически, и вводить его в самой Академии больше не придётся.
          Нужно один раз.
        </p>
        <input
          type="tel"
          inputMode="tel"
          autoFocus
          value={phoneInput}
          onChange={e => setPhoneInput(e.target.value.replace(/[^\d+\s]/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') savePhoneAndGo(); }}
          placeholder="77771112233"
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, outline: 'none', marginBottom: 14 }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={savePhoneAndGo} disabled={savingPhone} style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none', cursor: savingPhone ? 'default' : 'pointer', background: 'linear-gradient(135deg, #7D6FB3, #5580A8)', color: '#fff', fontSize: 13, fontWeight: 800, opacity: savingPhone ? 0.7 : 1 }}>
            {savingPhone ? 'Сохраняем…' : 'Сохранить и войти'}
          </button>
          <button onClick={skipPhoneAndGo} style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>
            Позже
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // ── Режим обучения: платформа во всю рабочую область ──
  if (mode === 'embed') {
    return (
      <>
      {phoneModal}
      <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 10, height: isMobile ? 'calc(100dvh - 130px)' : 'calc(100vh - 60px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setMode('intro')} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}><ArrowLeft size={14} /> Назад</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <GraduationCap size={16} style={{ color: '#7D6FB3', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Hero&rsquo;s Journey · Академия
            </span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={() => { setIframeLoaded(false); setIframeKey(k => k + 1); }} title="Перезагрузить" style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}><RotateCcw size={13} />{!isMobile && 'Обновить'}</button>
            <button onClick={openExternal} title="Открыть в новом окне" style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}><ExternalLink size={13} />{!isMobile && 'В новом окне'}</button>
          </div>
        </div>

        <div style={{ position: 'relative', flex: 1, minHeight: 0, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', background: '#fff' }}>
          {!iframeLoaded && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--bg-card)', zIndex: 1 }}>
              <GraduationCap size={32} style={{ color: '#7D6FB3', opacity: 0.6 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Загружаем академию…</span>
            </div>
          )}
          {ssoReady && (
            <iframe
              key={iframeKey}
              src={academyUrlWithSso(ssoToken)}
              title="Hero's Journey Академия"
              onLoad={(e) => {
                setIframeLoaded(true);
                // Дублируем пропуск через postMessage — академия может забрать
                // его любым из двух способов (fragment #hjsso= или сообщение)
                if (ssoToken) {
                  try { e.target.contentWindow.postMessage({ type: 'hj-sso', token: ssoToken }, ACADEMY_URL); } catch {}
                }
              }}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              allow="fullscreen; clipboard-write"
            />
          )}
        </div>
      </div>
      </>
    );
  }

  // ── Обложка ──
  return (
    <>
    {phoneModal}
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(125,111,179,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GraduationCap size={20} style={{ color: '#7D6FB3' }} />
        </div>
        <div>
          <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Академия</h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Обучение сотрудников Hero&rsquo;s Journey</p>
        </div>
      </div>

      {/* Hero-карточка */}
      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 24,
        background: 'linear-gradient(135deg, rgba(125,111,179,0.18) 0%, rgba(85,128,168,0.14) 55%, rgba(95,156,129,0.12) 100%)',
        border: '1px solid rgba(125,111,179,0.3)',
        padding: isMobile ? '28px 20px' : '44px 40px',
      }}>
        {/* декоративные круги */}
        <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(125,111,179,0.22), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, left: -40, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(95,156,129,0.16), transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', maxWidth: 640 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(125,111,179,0.16)', border: '1px solid rgba(125,111,179,0.35)', borderRadius: 999, padding: '5px 12px', marginBottom: 14 }}>
            <Sparkles size={12} style={{ color: '#7D6FB3' }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#9d8fd6', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Партнёрская платформа</span>
          </div>
          <h2 style={{ fontSize: isMobile ? 24 : 32, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 10px', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            Hero&rsquo;s Journey · Академия
          </h2>
          <p style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.65, maxWidth: 520 }}>
            Обучающая платформа для команды: курсы, материалы и тесты, чтобы прокачаться
            в работе клуба и стандартах Hero&rsquo;s Journey. Проходить можно прямо здесь — не выходя из HJ Track.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={startTraining} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '13px 22px' : '13px 28px',
              borderRadius: 14, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #7D6FB3, #5580A8)', color: '#fff',
              fontSize: 14, fontWeight: 800, boxShadow: '0 8px 24px rgba(125,111,179,0.35)',
            }}>
              <GraduationCap size={17} /> Начать обучение
            </button>
            <button onClick={openExternal} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '13px 18px' : '13px 22px',
              borderRadius: 14, border: '1px solid var(--border)', cursor: 'pointer',
              background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700,
            }}>
              <ExternalLink size={15} /> Открыть в новом окне
            </button>
          </div>
        </div>
      </div>

      {/* Что внутри */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
        {FEATURES.map(f => (
          <div key={f.title} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${f.color}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <f.icon size={17} style={{ color: f.color }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 5 }}>{f.title}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', lineHeight: 1.55 }}>{f.text}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.6, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px' }}>
        Вход в Академию проходит автоматически — регистрироваться и вводить пароль не нужно.
        При первом входе укажите свой номер телефона: по нему Академия подтвердит аккаунт и подтянет ваш прогресс.
      </div>
    </div>
    </>
  );
};

export default AcademyPage;
