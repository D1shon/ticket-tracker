import React, { useState, useEffect, useRef } from 'react';
import { useTickets } from '../store/TicketContext';
import { Bot, Send, Loader2, RotateCcw } from 'lucide-react';

// ИИ-чат без ограничений (Claude) — в отличие от «Помощника» (Gemini, строго
// по гайдбуку), здесь можно спрашивать что угодно: планы, тексты, расчёты,
// разбор рабочих ситуаций. Тот же endpoint /api/assistant, ветка freeChat:true.
const AiChatPage = () => {
  const { user } = useTickets();
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([]); // [{ role:'user'|'bot', text, pending? }]
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

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
      setMsgs(m => m.map((x, i) => (i === m.length - 1 ? { role: 'bot', text: answer } : x)));
    } catch {
      setMsgs(m => m.map((x, i) => (i === m.length - 1 ? { role: 'bot', text: 'Нет связи с ИИ-чатом. Проверьте интернет и попробуйте ещё раз.' } : x)));
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
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#B36F5F,#e5825d)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bot size={20} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>ИИ-чат</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Спрашивайте о чём угодно — планы, тексты, расчёты, идеи</div>
        </div>
        {msgs.length > 0 && (
          <button onClick={() => { if (!busy) setMsgs([]); }} disabled={busy} title="Начать новый диалог (сбросить контекст)"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', flexShrink: 0 }}>
            <RotateCcw size={13} /> Новый диалог
          </button>
        )}
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

      <style>{`@keyframes hj-spin-kf { to { transform: rotate(360deg); } } .hj-spin { animation: hj-spin-kf 1s linear infinite; }`}</style>
    </div>
  );
};

export default AiChatPage;
