import React, { useState, useEffect, useRef } from 'react';
import { useTickets, USER_ROLES } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, doc } from 'firebase/firestore';
import { Bot, Send, Loader2, RotateCcw, MessageSquare, Trash2, History, X, Sparkles } from 'lucide-react';
import { isMobileDevice } from '../lib/isMobile';

// ИИ-чат без ограничений (Claude/Gemini) — в отличие от «Помощника» (строго по
// гайдбуку) можно спрашивать что угодно. Endpoint /api/assistant, ветка freeChat.
// Журнал переписок: ai_chats/{id} = { owner, title, messages, updatedAtISO } —
// у каждого пользователя СВОИ диалоги (фильтр по owner), можно вернуться и удалить.
const MAX_STORED_MSGS = 40;

// URL в ответах бота — кликабельные ссылки (ИИ-чат умеет искать в интернете
// и присылать варианты со ссылками)
const linkify = (text) => String(text || '').split(/(https?:\/\/[^\s)«»"'<>]+)/g).map((p, i) =>
  /^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: '#5580A8', textDecoration: 'underline', wordBreak: 'break-all' }}>{p}</a>
    : p
);

const AiChatPage = () => {
  const { user } = useTickets();
  const myEmail = (user?.email || '').toLowerCase();
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([]); // [{ role:'user'|'bot', text, pending? }]
  const [busy, setBusy] = useState(false);
  const [chats, setChats] = useState([]);          // журнал диалогов пользователя
  const [chatId, setChatId] = useState(null);      // открытый диалог (null = новый)
  const [showLog, setShowLog] = useState(false);   // журнал шторкой на мобильном
  const endRef = useRef(null);
  const chatIdRef = useRef(null);
  chatIdRef.current = chatId;

  // ── Режим Клода: шеф выдаёт АДРЕСНЫЙ доступ конкретному сотруднику на N часов
  // (ai_chat_config/main.grants = [{email, name, untilISO}]). Пока грант активен —
  // вопросы этого сотрудника идут через мост на ноутбуке (claude_chat_queue), иначе Gemini.
  // Мост проверяет грант ещё раз на своей стороне — обойти с клиента нельзя. ──
  // Выдавать доступы к Клоду может ТОЛЬКО Дильшат — остальные (включая других
  // шефов) панель не видят вообще
  const canGrant = (user?.email || '').toLowerCase() === 'dilshat.r@hj.fit';
  const [cfg, setCfg] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const claudeSessRef = useRef(null); // claude session id текущего диалога (--resume)
  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    return onSnapshot(doc(db, 'ai_chat_config', 'main'), snap => setCfg(snap.exists() ? snap.data() : null), () => {});
  }, []);
  const nowISO = new Date(nowTick).toISOString();
  const grants = (cfg?.grants || []).filter(g => g && g.email && g.untilISO);
  const activeGrants = grants.filter(g => g.untilISO > nowISO);
  const myGrant = activeGrants.find(g => (g.email || '').toLowerCase() === myEmail);
  const claudeActive = !!myGrant;
  const claudeLeftMin = claudeActive ? Math.max(1, Math.round((new Date(myGrant.untilISO) - nowTick) / 60000)) : 0;

  // Кому можно выдать: менеджеры и шефы (включая самого себя)
  const STAFF_OPTIONS = Object.entries(USER_ROLES)
    .filter(([, p]) => p.role === 'manager' || p.role === 'chef')
    .map(([email, p]) => ({ email, label: `${p.displayName || email}${p.club ? ' · ' + p.club : ''}` }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  const [grantEmail, setGrantEmail] = useState('');
  const [grantHours, setGrantHours] = useState('');

  const saveGrants = async (next) => {
    try {
      await setDoc(doc(db, 'ai_chat_config', 'main'), {
        grants: next.filter(g => g.untilISO > new Date().toISOString()), // чистим истёкшие
        setBy: myEmail, setAtISO: new Date().toISOString(),
      }, { merge: true });
    } catch {}
  };
  const grantAccess = async () => {
    const hours = parseFloat(String(grantHours).replace(',', '.'));
    if (!grantEmail || !Number.isFinite(hours) || hours <= 0 || hours > 720) return;
    const opt = STAFF_OPTIONS.find(o => o.email === grantEmail);
    const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    await saveGrants([
      ...grants.filter(g => (g.email || '').toLowerCase() !== grantEmail.toLowerCase()),
      { email: grantEmail.toLowerCase(), name: opt?.label || grantEmail, untilISO: until, grantedAtISO: new Date().toISOString() },
    ]);
    setGrantEmail(''); setGrantHours('');
  };
  const revokeAccess = async (email) => {
    await saveGrants(grants.filter(g => (g.email || '').toLowerCase() !== (email || '').toLowerCase()));
  };

  // Вопрос Клоду через мост: док в очередь → ждём ответ в этом же доке
  const askClaude = (question) => new Promise(async (resolve) => {
    let unsub = null, finished = false;
    const finish = (answer) => { if (finished) return; finished = true; if (unsub) unsub(); resolve(answer); };
    const timeout = setTimeout(() => finish('Клод не ответил за 3 минуты — возможно, мост на ноутбуке выключен. Отключите режим Клода или попробуйте позже.'), 200000);
    try {
      const qref = await addDoc(collection(db, 'claude_chat_queue'), {
        question, owner: myEmail, sessionId: claudeSessRef.current || null,
        status: 'pending', createdAtISO: new Date().toISOString(),
      });
      unsub = onSnapshot(qref, snap => {
        const d = snap.data();
        if (!d) return;
        if (d.status === 'done' || d.status === 'error') {
          clearTimeout(timeout);
          if (d.sessionId) claudeSessRef.current = d.sessionId;
          finish(d.answer || 'Пустой ответ от Клода.');
        }
      }, () => { clearTimeout(timeout); finish('Не удалось отправить вопрос Клоду.'); });
    } catch {
      clearTimeout(timeout);
      finish('Не удалось отправить вопрос Клоду.');
    }
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  // Журнал: у всех — только свои диалоги; Дильшат видит сессии ВСЕХ менеджеров
  // (с именем владельца, в режиме просмотра)
  const canViewAll = (user?.email || '').toLowerCase() === 'dilshat.r@hj.fit';
  useEffect(() => {
    if (!myEmail) return;
    const q = canViewAll
      ? collection(db, 'ai_chats')
      : query(collection(db, 'ai_chats'), where('owner', '==', myEmail));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.updatedAtISO || '').localeCompare(a.updatedAtISO || ''));
      setChats(list.slice(0, canViewAll ? 100 : 50));
    }, () => {});
  }, [myEmail, canViewAll]);

  const ownerName = (email) => {
    const e = (email || '').toLowerCase();
    if (e === myEmail) return null; // свои не подписываем
    const p = USER_ROLES[e];
    return p?.displayName || e.split('@')[0] || 'неизвестный';
  };

  const persist = async (finalMsgs) => {
    const clean = finalMsgs.filter(m => !m.pending && m.text).slice(-MAX_STORED_MSGS)
      .map(m => ({ role: m.role, text: m.text, ...(m.via ? { via: m.via } : {}) }));
    if (clean.length === 0) return;
    const title = (clean.find(m => m.role === 'user')?.text || 'Диалог').slice(0, 60);
    try {
      if (chatIdRef.current) {
        await updateDoc(doc(db, 'ai_chats', chatIdRef.current), {
          messages: clean, title, claudeSessionId: claudeSessRef.current || null, updatedAtISO: new Date().toISOString(),
        });
      } else {
        const ref = await addDoc(collection(db, 'ai_chats'), {
          owner: myEmail, title, messages: clean, claudeSessionId: claudeSessRef.current || null,
          createdAtISO: new Date().toISOString(), updatedAtISO: new Date().toISOString(),
        });
        setChatId(ref.id);
      }
    } catch { /* журнал не критичен для самого чата */ }
  };

  // Чужой диалог открывается ТОЛЬКО на просмотр: писать в него нельзя,
  // persist в чужой док не выполняется
  const [viewingOwner, setViewingOwner] = useState(null);
  const openChat = (c) => {
    if (busy) return;
    const foreign = (c.owner || '').toLowerCase() !== myEmail;
    setViewingOwner(foreign ? (ownerName(c.owner) || c.owner) : null);
    setChatId(foreign ? null : c.id);
    setMsgs((c.messages || []).map(m => ({ role: m.role, text: m.text, via: m.via })));
    claudeSessRef.current = foreign ? null : (c.claudeSessionId || null);
    setShowLog(false);
  };

  const newChat = () => {
    if (busy) return;
    setChatId(null);
    setMsgs([]);
    setViewingOwner(null);
    claudeSessRef.current = null;
    setShowLog(false);
  };

  const removeChat = async (e, c) => {
    e.stopPropagation();
    if (!window.confirm(`Удалить диалог «${c.title}»?`)) return;
    try {
      await deleteDoc(doc(db, 'ai_chats', c.id));
      if (chatIdRef.current === c.id) newChat();
    } catch {}
  };

  // «Коллективная память»: ищем в журнале похожие вопросы КОЛЛЕГ (лексически, по
  // основам слов) и передаём ИИ служебным контекстом — он сможет ответить
  // «да, у Нурлы был похожий вопрос». Только для Дильшата (у него весь журнал).
  const findSimilarColleagueChats = (q) => {
    const stem = (w) => w.slice(0, 5);
    const qt = [...new Set(String(q).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length >= 3).map(stem))];
    if (qt.length < 2) return [];
    return chats
      .filter(c => (c.owner || '').toLowerCase() !== myEmail)
      .map(c => {
        const userTexts = (c.messages || []).filter(m => m.role === 'user').map(m => m.text || '').join(' ').toLowerCase();
        let score = 0;
        qt.forEach(t => { if (userTexts.includes(t)) score++; });
        return { c, score };
      })
      .filter(x => x.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ c }) => {
        const name = ownerName(c.owner) || c.owner;
        const firstQ = ((c.messages || []).find(m => m.role === 'user')?.text || c.title || '').slice(0, 200);
        const when = (c.updatedAtISO || '').slice(0, 10);
        return `${name} (${when}): «${firstQ}»`;
      });
  };

  const ask = async (text) => {
    const question = (text ?? input).trim();
    if (!question || busy || viewingOwner) return;
    // Служебный контекст с похожими вопросами коллег — модель видит, пользователь нет
    let sendQuestion = question;
    if (canViewAll) {
      const similar = findSimilarColleagueChats(question);
      if (similar.length) {
        sendQuestion = `[Служебный контекст (пользователь его не видит): в журнале ИИ-чата есть похожие вопросы коллег — ${similar.join(' ||| ')}. Если пользователь спрашивает, сталкивался ли кто-то из коллег с такой ситуацией или задавал ли похожий вопрос — ответь по этому контексту в живом тоне («да, у Нурлы был похожий вопрос про …»), назвав имя и суть. Если про коллег не спрашивают — можешь кратко упомянуть в конце «кстати, похожий вопрос был у …», только когда это реально полезно. Если контекст не относится к вопросу — игнорируй его.]\n\n${question}`;
      }
    }
    const history = msgs.filter(m => !m.pending && m.text).slice(-20).map(m => ({ role: m.role, text: m.text }));
    setBusy(true);
    setInput('');
    const viaClaude = claudeActive;
    setMsgs(m => [...m, { role: 'user', text: question }, { role: 'bot', text: '', pending: true, via: viaClaude ? 'claude' : 'gemini' }]);
    try {
      let answer;
      if (viaClaude) {
        answer = await askClaude(sendQuestion);
      } else {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ freeChat: true, question: sendQuestion, role: user?.role || '', club: user?.club || null, history }),
        });
        const data = await res.json().catch(() => ({}));
        answer = data.answer || 'Не удалось получить ответ. Попробуйте ещё раз.';
      }
      setMsgs(m => {
        const next = m.map((x, i) => (i === m.length - 1 ? { role: 'bot', text: answer, via: viaClaude ? 'claude' : 'gemini' } : x));
        persist(next);
        return next;
      });
    } catch {
      setMsgs(m => m.map((x, i) => (i === m.length - 1 ? { role: 'bot', text: 'Нет связи с ИИ-чатом. Проверьте интернет и попробуйте ещё раз.' } : x)));
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } };

  const bubbleUser = { alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--accent-purple)', color: '#fff', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' };
  const bubbleBot = { alignSelf: 'flex-start', maxWidth: '90%', background: 'var(--bg-hover)', color: 'var(--text-primary)', padding: '12px 15px', borderRadius: '16px 16px 16px 4px', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', border: '1px solid var(--border)' };

  const fmtWhen = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return today
      ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  // ── Журнал переписок (панель) ──
  const journal = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', height: '100%' }}>
      <button onClick={newChat} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 800, cursor: busy ? 'default' : 'pointer', marginBottom: 6 }}>
        <RotateCcw size={13} /> Новый диалог
      </button>
      {chats.length === 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600, padding: '10px 6px', textAlign: 'center' }}>
          Диалогов пока нет — они появятся здесь и к ним можно будет вернуться
        </div>
      )}
      {chats.map(c => (
        <div
          key={c.id}
          onClick={() => openChat(c)}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 10px', borderRadius: 12, cursor: 'pointer',
            background: chatId === c.id ? 'rgba(179,111,95,0.12)' : 'transparent',
            border: '1px solid ' + (chatId === c.id ? 'rgba(179,111,95,0.4)' : 'transparent'),
          }}
        >
          <MessageSquare size={13} style={{ color: chatId === c.id ? '#B36F5F' : 'var(--text-muted)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Диалог'}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>
              {ownerName(c.owner) && <span style={{ color: '#5580A8', fontWeight: 800 }}>👤 {ownerName(c.owner)} · </span>}
              {fmtWhen(c.updatedAtISO)} · {(c.messages || []).length} сообщ.
            </div>
          </div>
          <button onClick={(e) => removeChat(e, c)} title="Удалить диалог" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 3, lineHeight: 0, opacity: 0.45, flexShrink: 0 }}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', maxWidth: 1060, margin: '0 auto', width: '100%' }}>
      {/* Журнал переписок — колонка слева от чата (на мобильном — шторка) */}
      {!isMobile && (
        <div style={{ width: 240, flexShrink: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: 10, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 6px 10px', fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            <History size={13} /> Журнал переписок
          </div>
          {journal}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#B36F5F,#e5825d)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bot size={20} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>ИИ-чат</h1>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              {claudeActive
                ? <span style={{ color: '#B36F5F', fontWeight: 800 }}>🧠 Отвечает Клод · ещё {claudeLeftMin >= 60 ? `${Math.floor(claudeLeftMin / 60)}ч ${claudeLeftMin % 60}м` : `${claudeLeftMin} мин`}</span>
                : 'Спрашивайте о чём угодно — планы, тексты, расчёты, идеи'}
            </div>
          </div>
          {isMobile ? (
            <button onClick={() => setShowLog(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
              <History size={13} /> Журнал
            </button>
          ) : (msgs.length > 0 && (
            <button onClick={newChat} disabled={busy} title="Начать новый диалог (сбросить контекст)"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', flexShrink: 0 }}>
              <RotateCcw size={13} /> Новый диалог
            </button>
          ))}
        </div>

        {/* Панель выдачи доступа к Клоду — видит и пользуется только Дильшат */}
        {canGrant && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', marginBottom: 12, borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Sparkles size={13} /> Доступ к Клоду:
              </span>
              <select value={grantEmail} onChange={e => setGrantEmail(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, outline: 'none', maxWidth: 220 }}>
                <option value="">— выбрать сотрудника —</option>
                {STAFF_OPTIONS.map(o => <option key={o.email} value={o.email}>{o.label}</option>)}
              </select>
              <input
                type="number" min="0.5" step="0.5" value={grantHours}
                onChange={e => setGrantHours(e.target.value)}
                placeholder="часов"
                style={{ width: 80, padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, outline: 'none' }}
              />
              <button onClick={grantAccess} disabled={!grantEmail || !parseFloat(String(grantHours).replace(',', '.'))}
                style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: grantEmail && parseFloat(String(grantHours).replace(',', '.')) > 0 ? '#B36F5F' : 'var(--bg-hover)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                Дать доступ
              </button>
            </div>
            {activeGrants.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {activeGrants.map(g => {
                  const left = Math.max(1, Math.round((new Date(g.untilISO) - nowTick) / 60000));
                  return (
                    <span key={g.email} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 9, background: 'rgba(179,111,95,0.1)', border: '1px solid rgba(179,111,95,0.35)', fontSize: 11.5, fontWeight: 800, color: '#B36F5F' }}>
                      🧠 {g.name || g.email} · ещё {left >= 60 ? `${Math.floor(left / 60)}ч ${left % 60}м` : `${left} мин`}
                      <button onClick={() => revokeAccess(g.email)} title="Отозвать доступ" style={{ background: 'none', border: 'none', color: '#B36F5F', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px 12px' }}>
          {msgs.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginTop: 8, textAlign: 'center', padding: '24px 8px' }}>
              Задайте любой рабочий вопрос — без привязки к гайдбуку.
            </div>
          )}

          {msgs.map((m, i) => (
            m.role === 'user' ? (
              <div key={i} style={bubbleUser}>{m.text}</div>
            ) : (
              <div key={i} style={m.pending ? { ...bubbleBot, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 } : bubbleBot}>
                {m.pending ? (
                  <><Loader2 size={15} className="hj-spin" /> Думаю…</>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11, fontWeight: 800, color: '#B36F5F' }}>
                      <Bot size={12} /> {m.via === 'claude' ? '🧠 Клод' : 'ИИ-чат'}
                    </div>
                    {linkify(m.text)}
                  </>
                )}
              </div>
            )
          ))}
          <div ref={endRef} />
        </div>

        {viewingOwner && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 8, borderRadius: 12, background: 'rgba(85,128,168,0.1)', border: '1px solid rgba(85,128,168,0.3)', fontSize: 12, fontWeight: 700, color: '#5580A8' }}>
            👤 Просмотр диалога: {viewingOwner} — только чтение
            <button onClick={newChat} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(85,128,168,0.4)', background: 'transparent', color: '#5580A8', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Закрыть</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            disabled={!!viewingOwner}
            placeholder={viewingOwner ? 'Чужой диалог — только просмотр' : 'Спросите что угодно…'}
            style={{ flex: 1, resize: 'none', maxHeight: 120, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
          <button onClick={() => ask()} disabled={!input.trim() || busy} style={{
            width: 46, height: 46, borderRadius: 14, border: 'none', flexShrink: 0,
            background: input.trim() && !busy ? '#B36F5F' : 'var(--bg-hover)', color: '#fff',
            cursor: input.trim() && !busy ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {busy ? <Loader2 size={18} className="hj-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>

      {/* Мобильный журнал — шторка снизу */}
      {isMobile && showLog && (
        <div onClick={() => setShowLog(false)} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '75vh', background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', border: '1px solid var(--border)', borderBottom: 'none', padding: '14px 14px 24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', flex: 1 }}>
                <History size={15} /> Журнал переписок
              </span>
              <button onClick={() => setShowLog(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
            </div>
            <div style={{ overflowY: 'auto' }}>{journal}</div>
          </div>
        </div>
      )}

      <style>{`@keyframes hj-spin-kf { to { transform: rotate(360deg); } } .hj-spin { animation: hj-spin-kf 1s linear infinite; }`}</style>
    </div>
  );
};

export default AiChatPage;
