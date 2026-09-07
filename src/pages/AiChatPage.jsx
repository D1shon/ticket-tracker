import React, { useState, useEffect, useRef } from 'react';
import { useTickets } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Bot, Send, Loader2, RotateCcw, MessageSquare, Trash2, History, X } from 'lucide-react';
import { isMobileDevice } from '../lib/isMobile';

// ИИ-чат без ограничений (Claude/Gemini) — в отличие от «Помощника» (строго по
// гайдбуку) можно спрашивать что угодно. Endpoint /api/assistant, ветка freeChat.
// Журнал переписок: ai_chats/{id} = { owner, title, messages, updatedAtISO } —
// у каждого пользователя СВОИ диалоги (фильтр по owner), можно вернуться и удалить.
const MAX_STORED_MSGS = 40;

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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  // Журнал: только свои диалоги
  useEffect(() => {
    if (!myEmail) return;
    const q = query(collection(db, 'ai_chats'), where('owner', '==', myEmail));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.updatedAtISO || '').localeCompare(a.updatedAtISO || ''));
      setChats(list.slice(0, 50));
    }, () => {});
  }, [myEmail]);

  const persist = async (finalMsgs) => {
    const clean = finalMsgs.filter(m => !m.pending && m.text).slice(-MAX_STORED_MSGS)
      .map(m => ({ role: m.role, text: m.text }));
    if (clean.length === 0) return;
    const title = (clean.find(m => m.role === 'user')?.text || 'Диалог').slice(0, 60);
    try {
      if (chatIdRef.current) {
        await updateDoc(doc(db, 'ai_chats', chatIdRef.current), {
          messages: clean, title, updatedAtISO: new Date().toISOString(),
        });
      } else {
        const ref = await addDoc(collection(db, 'ai_chats'), {
          owner: myEmail, title, messages: clean,
          createdAtISO: new Date().toISOString(), updatedAtISO: new Date().toISOString(),
        });
        setChatId(ref.id);
      }
    } catch { /* журнал не критичен для самого чата */ }
  };

  const openChat = (c) => {
    if (busy) return;
    setChatId(c.id);
    setMsgs((c.messages || []).map(m => ({ role: m.role, text: m.text })));
    setShowLog(false);
  };

  const newChat = () => {
    if (busy) return;
    setChatId(null);
    setMsgs([]);
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

  const ask = async (text) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    const history = msgs.filter(m => !m.pending && m.text).slice(-20).map(m => ({ role: m.role, text: m.text }));
    setBusy(true);
    setInput('');
    setMsgs(m => [...m, { role: 'user', text: question }, { role: 'bot', text: '', pending: true }]);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freeChat: true, question, role: user?.role || '', club: user?.club || null, history }),
      });
      const data = await res.json().catch(() => ({}));
      const answer = data.answer || 'Не удалось получить ответ. Попробуйте ещё раз.';
      setMsgs(m => {
        const next = m.map((x, i) => (i === m.length - 1 ? { role: 'bot', text: answer } : x));
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
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>{fmtWhen(c.updatedAtISO)} · {(c.messages || []).length} сообщ.</div>
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
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Спрашивайте о чём угодно — планы, тексты, расчёты, идеи</div>
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
                      <Bot size={12} /> ИИ-чат
                    </div>
                    {m.text}
                  </>
                )}
              </div>
            )
          ))}
          <div ref={endRef} />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder="Спросите что угодно…"
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
