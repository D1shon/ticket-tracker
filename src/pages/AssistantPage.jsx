import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useTickets } from '../store/TicketContext';
import { navAllowed } from '../lib/navAccess';
import { Sparkles, Send, Loader2, RotateCcw, MessageSquare, BarChart3, ArrowRight, Link2 } from 'lucide-react';
import AssistantInsights from '../components/AssistantInsights';

// ИИ-помощник для сотрудников. Вопрос уходит на /api/assistant (модель Gemini),
// который отвечает по гайдбуку платформы за пару секунд. Вопросы логируются в
// assistant_queries (история — что спрашивают сотрудники).
const AssistantPage = () => {
  const { user } = useTickets();
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([]); // [{ role:'user'|'bot', text, pending? }]
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('chat'); // 'chat' | 'stats' (аналитика — только шефу)
  const isChef = user?.role === 'chef';
  const endRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const ask = async (text) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    // Память диалога: берём последние завершённые сообщения ДО нового вопроса
    const history = msgs.filter(m => !m.pending && m.text).slice(-10).map(m => ({ role: m.role, text: m.text }));
    setBusy(true);
    setInput('');
    setMsgs(m => [...m, { role: 'user', text: question }, { role: 'bot', text: '', pending: true }]);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, role: user?.role || '', club: user?.club || null, history }),
      });
      const data = await res.json().catch(() => ({}));
      const answer = data.answer || 'Не удалось получить ответ. Попробуйте ещё раз.';
      setMsgs(m => m.map((x, i) => (i === m.length - 1
        ? { role: 'bot', text: answer, links: data.links || [], related: data.related || [], sources: data.sources || [] }
        : x)));
      // история вопросов (для анализа, что спрашивают)
      addDoc(collection(db, 'assistant_queries'), {
        question: question.slice(0, 1000),
        answer: answer.slice(0, 4000),
        askedByEmail: (user?.email || '').toLowerCase(),
        askedByName: user?.displayName || '',
        role: user?.role || '',
        club: user?.club || null,
        createdAtISO: new Date().toISOString(),
        createdAt: serverTimestamp(),
      }).catch(() => {});
    } catch {
      setMsgs(m => m.map((x, i) => (i === m.length - 1 ? { role: 'bot', text: 'Нет связи с помощником. Проверьте интернет и попробуйте ещё раз.' } : x)));
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } };

  const bubbleUser = { alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--accent-purple)', color: '#fff', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' };
  const bubbleBot = { alignSelf: 'flex-start', maxWidth: '90%', background: 'var(--bg-hover)', color: 'var(--text-primary)', padding: '12px 15px', borderRadius: '16px 16px 16px 4px', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', border: '1px solid var(--border)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 780, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#7D6FB3,#9b5de5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Sparkles size={20} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Помощник HJ Track</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Отвечаю по всей платформе: гайдбук, регламенты, оферта, новости — и показываю, где это сделать</div>
        </div>
        {view === 'chat' && msgs.length > 0 && (
          <button onClick={() => { if (!busy) setMsgs([]); }} disabled={busy} title="Начать новый диалог (сбросить контекст)"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', flexShrink: 0 }}>
            <RotateCcw size={13} /> Новый диалог
          </button>
        )}
      </div>

      {/* Переключатель Чат / Аналитика — только шефу */}
      {isChef && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, background: 'var(--bg-hover)', borderRadius: 12, padding: 4 }}>
          {[['chat', 'Чат', MessageSquare], ['stats', 'О чём спрашивают', BarChart3]].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setView(id)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: view === id ? 'var(--accent-purple)' : 'transparent', color: view === id ? '#fff' : 'var(--text-muted)', fontSize: 12, fontWeight: 800,
            }}><Icon size={14} /> {label}</button>
          ))}
        </div>
      )}

      {view === 'stats' ? <AssistantInsights /> : (<>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px 12px' }}>
        {msgs.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginTop: 8, textAlign: 'center', padding: '24px 8px' }}>
            Спросите что угодно по работе: «клиент потерял куртку», «как оформить возврат мерча», «стажёр вышел в первый день», «что изменилось в POS на этой неделе». Отвечу полностью и дам кнопки на нужные страницы.
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11, fontWeight: 800, color: 'var(--accent-purple)' }}>
                    <Sparkles size={12} /> Помощник
                  </div>
                  {m.text}
                  {/* Куда идти: кнопки-переходы на страницы платформы (только доступные этой роли) */}
                  {m.links?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                      {m.links.map((l, j) => navAllowed(user, l.path) ? (
                        <button key={j} onClick={() => navigate(l.path)} title={l.why || ''} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                          <ArrowRight size={13} /> {l.label}{l.why ? <span style={{ fontWeight: 500, opacity: 0.85 }}> · {l.why}</span> : null}
                        </button>
                      ) : (
                        <span key={j} style={{ padding: '8px 12px', borderRadius: 10, border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>{l.label} · недоступно вашей роли</span>
                      ))}
                    </div>
                  )}
                  {m.related?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Связано:</span>
                      {m.related.filter(l => navAllowed(user, l.path)).map((l, j) => (
                        <button key={j} onClick={() => navigate(l.path)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          <Link2 size={11} /> {l.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.sources?.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Источники: {m.sources.join(' · ')}</div>
                  )}
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
          placeholder="Задайте вопрос по платформе…"
          style={{ flex: 1, resize: 'none', maxHeight: 120, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
        />
        <button onClick={() => ask()} disabled={!input.trim() || busy} style={{
          width: 46, height: 46, borderRadius: 14, border: 'none', flexShrink: 0,
          background: input.trim() && !busy ? 'var(--accent-purple)' : 'var(--bg-hover)', color: '#fff',
          cursor: input.trim() && !busy ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {busy ? <Loader2 size={18} className="hj-spin" /> : <Send size={18} />}
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
        Отвечаю по гайдбуку, оферте, новостям и описанию платформы HJ Track
      </div>
      </>)}

      <style>{`@keyframes hj-spin-kf { to { transform: rotate(360deg); } } .hj-spin { animation: hj-spin-kf 1s linear infinite; }`}</style>
    </div>
  );
};

export default AssistantPage;
