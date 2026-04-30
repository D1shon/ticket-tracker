import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Star, Home, Edit2, Play, Pause, Clock, CheckCircle, 
  Smile, Paperclip, Send, MessageSquare, User, Calendar, BookOpen,
  Package, X
} from 'lucide-react';

const DEMO_TICKETS = {
  1: {
    id: 1, club: '4YOU', title: 'Переход на летний режим вентиляции',
    description: 'Переход на летний режим вентиляции – Валерий. Сания.',
    status: 'Новая', priority: 'Средний',
    assignee: 'Сания (4YOU)', createdAt: '30 мар. 2026, 13:00',
    journal: [{ date: '22 мар.', text: 'Ежегодное ТО выполнено.' }],
    messages: [],
  },
};

// Preset reasons per action
const PRESETS = {
  pause: [
    { emoji: '🔴', label: 'РЕШЕНИЕ РУК-ВА' },
    { emoji: '🟠', label: 'ПЕРЕРЫВ' },
    { emoji: '⬛', label: 'НЕТ ДОСТУПА' },
  ],
  wait: [
    { emoji: '🔵', label: 'ЖДЁМ ДЕТАЛИ' },
    { emoji: '🟡', label: 'ЖДЁМ КЛИЕНТА' },
    { emoji: '⬛', label: 'ЖДЁМ РЕШЕНИЯ' },
  ],
  finish: [
    { emoji: '✅', label: 'ВЫПОЛНЕНО' },
    { emoji: '🔄', label: 'ЧАСТИЧНО' },
    { emoji: '❌', label: 'ОТМЕНЕНО' },
  ],
};

const REASON_CONFIG = {
  pause:  { title: 'ПОЧЕМУ РАБОТА ОСТАНОВЛЕНА?',  color: '#f59e0b', btnLabel: 'ПОДТВЕРДИТЬ ПАУЗУ',     bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.2)' },
  wait:   { title: 'ПОЧЕМУ ОЖИДАНИЕ?',            color: '#9b5de5', btnLabel: 'ПОДТВЕРДИТЬ ОЖИДАНИЕ', bg: 'rgba(155,93,229,0.06)',  border: 'rgba(155,93,229,0.2)' },
  finish: { title: 'ИТОГ ВЫПОЛНЕНИЯ ЗАДАЧИ',      color: '#22c55e', btnLabel: 'ПОДТВЕРДИТЬ ЗАВЕРШЕНИЕ', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.2)'  },
};

// ─── Timer box ───
const TimerBox = ({ label, seconds, color, active }) => (
  <div style={{
    flex: 1, padding: '18px 16px', borderRadius: 12, textAlign: 'center',
    background: active ? `${color}12` : 'var(--bg-primary)',
    border: `1px solid ${active ? color + '60' : color + '25'}`,
    transition: 'all 0.2s',
  }}>
    <div style={{ fontSize: 28, fontWeight: 800, color, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>{seconds}с</div>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>{label}</div>
  </div>
);

// ─── Action button ───
const ActionBtn = ({ icon: Icon, label, color, bg, onClick, active }) => (
  <button onClick={onClick} style={{
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: '18px 12px', borderRadius: 14, cursor: 'pointer',
    background: active ? bg : `${bg}60`,
    border: 'none', color, transition: 'all 0.15s',
    boxShadow: active ? `0 4px 20px ${color}30` : 'none',
  }}>
    <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em' }}>{label}</span>
  </button>
);

// ─── Inline reason panel ───
const ReasonPanel = ({ action, onConfirm, onCancel }) => {
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState('');
  const c = REASON_CONFIG[action];
  const presets = PRESETS[action] || [];

  const pickPreset = (label) => {
    setSelected(label);
    setReason(label);
  };

  const canConfirm = reason.trim().length > 0;

  return (
    <div style={{
      margin: '4px 0', padding: '18px 20px', borderRadius: 14,
      background: c.bg, border: `1px solid ${c.border}`,
      animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: c.color, letterSpacing: '0.08em', marginBottom: 14 }}>
        {c.title}
      </div>

      {/* Quick presets */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {presets.map(p => (
          <button key={p.label} onClick={() => pickPreset(p.label)} style={{
            padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em', transition: 'all 0.15s',
            background: selected === p.label ? `${c.color}25` : 'var(--bg-card)',
            border: `1px solid ${selected === p.label ? c.color : 'var(--border)'}`,
            color: selected === p.label ? c.color : 'var(--text-secondary)',
          }}>
            {p.emoji} {p.label}
          </button>
        ))}
      </div>

      {/* Textarea */}
      <textarea
        autoFocus
        value={reason}
        onChange={e => { setReason(e.target.value); setSelected(''); }}
        placeholder="Введите причину..."
        rows={3}
        style={{
          width: '100%', background: 'var(--bg-primary)', border: `1px solid ${reason.trim() ? c.color + '60' : 'var(--border)'}`,
          borderRadius: 10, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 13,
          outline: 'none', resize: 'none', lineHeight: 1.6, fontFamily: 'Inter, sans-serif',
          marginBottom: 12, transition: 'border-color 0.15s', boxSizing: 'border-box',
        }}
      />

      {/* Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={onCancel} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', padding: '8px 12px',
        }}>
          ОТМЕНА
        </button>
        <button
          onClick={() => canConfirm && onConfirm(reason)}
          disabled={!canConfirm}
          style={{
            padding: '10px 20px', borderRadius: 10, cursor: canConfirm ? 'pointer' : 'not-allowed',
            background: canConfirm ? c.color : 'var(--bg-hover)',
            border: 'none', color: canConfirm ? '#000' : 'var(--text-muted)',
            fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
            opacity: canConfirm ? 1 : 0.5, transition: 'all 0.15s',
          }}
        >
          {c.btnLabel}
        </button>
      </div>
    </div>
  );
};

// ─── Main ───
const TicketDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const ticket = DEMO_TICKETS[id] || DEMO_TICKETS[1];

  const [timerState, setTimerState] = useState('idle');
  const [pendingAction, setPendingAction] = useState(null); // 'pause'|'wait'|'finish'|null
  const [times, setTimes] = useState({ work: 0, pause: 0, wait: 0 });
  const [messages, setMessages] = useState(ticket.messages || []);
  const [msgInput, setMsgInput] = useState('');
  const [starred, setStarred] = useState(false);
  const intervalRef = useRef(null);
  const chatRef = useRef(null);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (timerState === 'work')  intervalRef.current = setInterval(() => setTimes(t => ({ ...t, work:  t.work + 1 })),  1000);
    if (timerState === 'pause') intervalRef.current = setInterval(() => setTimes(t => ({ ...t, pause: t.pause + 1 })), 1000);
    if (timerState === 'wait')  intervalRef.current = setInterval(() => setTimes(t => ({ ...t, wait:  t.wait + 1 })),  1000);
    return () => clearInterval(intervalRef.current);
  }, [timerState]);

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages]);

  const sendMessage = (text) => {
    const t = (text || msgInput).trim();
    if (!t) return;
    setMessages(prev => [...prev, { id: Date.now(), text: t, author: 'Вы', time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }]);
    if (!text) setMsgInput('');
  };

  const handleReasonConfirm = (reason) => {
    const stateMap   = { pause: 'pause', wait: 'wait', finish: 'idle' };
    setTimerState(stateMap[pendingAction]);
    setPendingAction(null);
    // Post to chat as system note
    sendMessage(`[${pendingAction === 'pause' ? '⏸ Пауза' : pendingAction === 'wait' ? '⏳ Ожидание' : '✅ Завершено'}] ${reason}`);
  };

  const sColor = { 'Новая': '#22c55e', 'В РАБОТЕ': '#9b5de5', 'ПАУЗА': '#f59e0b', 'ОЖИДАНИЕ': '#f97316', 'ЗАКРЫТО': '#55556a' }[ticket.status] || '#22c55e';

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 6 }}><ArrowLeft size={18} /></button>
        <button onClick={() => setStarred(s => !s)} style={{ background: 'none', border: 'none', color: starred ? '#f59e0b' : 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><Star size={16} fill={starred ? '#f59e0b' : 'none'} /></button>
        <button onClick={() => navigate('/tickets')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><Home size={15} /></button>
        <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(79,142,247,0.15)', color: '#4f8ef7', border: '1px solid rgba(79,142,247,0.3)', padding: '2px 7px', borderRadius: 4 }}>{ticket.club}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>{ticket.title}</span>
        <Edit2 size={13} color="var(--text-muted)" style={{ cursor: 'pointer' }} />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: sColor, background: `${sColor}18`, border: `1px solid ${sColor}40`, padding: '3px 10px', borderRadius: 6 }}>● {ticket.status}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', padding: '3px 10px', borderRadius: 6 }}>{ticket.priority}</span>
        </div>
      </div>

      {/* 2-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Description */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <BookOpen size={13} color="#4f8ef7" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Описание задачи</span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{ticket.description}</p>
          </div>

          {/* ──── TIMER CARD ──── */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <Clock size={13} color="#4f8ef7" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Операционный таймер</span>
            </div>

            {/* Timer boxes */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <TimerBox label="Активная работа" seconds={times.work}  color="#f59e0b" active={timerState === 'work'} />
              <TimerBox label="Пауза"            seconds={times.pause} color="#f59e0b" active={timerState === 'pause'} />
              <TimerBox label="Ожидание"         seconds={times.wait}  color="#9b5de5" active={timerState === 'wait'} />
            </div>

            {/* ── INLINE REASON PANEL (between timer and buttons) ── */}
            {pendingAction && (
              <ReasonPanel
                action={pendingAction}
                onConfirm={handleReasonConfirm}
                onCancel={() => setPendingAction(null)}
              />
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <ActionBtn icon={Play}        label="В РАБОТУ"  color="#22c55e" bg="rgba(34,197,94,0.18)"   active={timerState === 'work'}  onClick={() => { setPendingAction(null); setTimerState(s => s === 'work' ? 'idle' : 'work'); }} />
              <ActionBtn icon={Pause}       label="ПАУЗА"     color="#f59e0b" bg="rgba(245,158,11,0.18)"  active={timerState === 'pause' || pendingAction === 'pause'} onClick={() => setPendingAction(p => p === 'pause' ? null : 'pause')} />
              <ActionBtn icon={Package}     label="ОЖИДАНИЕ"  color="#9b5de5" bg="rgba(155,93,229,0.18)"  active={timerState === 'wait'  || pendingAction === 'wait'}  onClick={() => setPendingAction(p => p === 'wait'  ? null : 'wait')} />
              <ActionBtn icon={CheckCircle} label="ЗАВЕРШИТЬ" color="#8888a0" bg="rgba(136,136,160,0.12)" active={pendingAction === 'finish'} onClick={() => setPendingAction(p => p === 'finish' ? null : 'finish')} />
            </div>
          </div>

          {/* Chat */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <MessageSquare size={13} color="#4f8ef7" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Чат / Обсуждение задачи</span>
            </div>
            <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 8 }}>
                  <MessageSquare size={32} strokeWidth={1.2} />
                  <span style={{ fontSize: 13 }}>Здесь пока пусто. Оставьте первый комментарий.</span>
                </div>
              ) : messages.map(m => (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ background: 'rgba(79,142,247,0.12)', border: '1px solid rgba(79,142,247,0.2)', borderRadius: '10px 10px 2px 10px', padding: '8px 14px', maxWidth: '80%' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{m.text}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.author} · {m.time}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6 }}><Smile size={18} /></button>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6 }}><Paperclip size={18} /></button>
              <input value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Ваше сообщение..."
                style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
              <button onClick={() => sendMessage()} style={{ background: 'linear-gradient(135deg, #7c3aed, #9b5de5)', border: 'none', borderRadius: 10, padding: '10px 14px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '0 2px 8px rgba(124,58,237,0.4)' }}>
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT INFO */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 16 }}>История и ресурсы</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <User size={14} color="var(--text-muted)" />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 90 }}>Исполнитель</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#4f8ef7' }}>{ticket.assignee}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Calendar size={14} color="var(--text-muted)" />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 90 }}>Создана</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{ticket.createdAt}</span>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <BookOpen size={13} color="var(--text-muted)" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Журнал объекта</span>
                </div>
                {ticket.journal.map((j, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    <span style={{ color: '#4f8ef7', fontWeight: 600 }}>{j.date}</span> — {j.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetail;
