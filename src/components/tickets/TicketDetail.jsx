import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Star, Home, Edit2, Play, Pause, Clock, CheckCircle, 
  Smile, Paperclip, Send, MessageSquare, User, Calendar, BookOpen
} from 'lucide-react';

// Demo ticket data — in production this comes from Firestore
const DEMO_TICKETS = {
  1: {
    id: 1, clubId: '1', club: '4YOU', title: 'Переход на летний режим вентиляции',
    description: 'Переход на летний режим вентиляции – Валерий. Сания.',
    status: 'Новая', priority: 'Средний',
    assignee: 'Сания (4YOU)', createdAt: '30 мар. 2026, 13:00',
    journal: [{ date: '22 мар.', text: 'Ежегодное ТО выполнено.' }],
    messages: [],
  },
};

const TimerBox = ({ label, seconds, color }) => (
  <div style={{
    flex: 1, padding: '14px 16px', borderRadius: 10,
    background: 'var(--bg-secondary)',
    border: `1px solid ${color}33`,
    textAlign: 'center',
  }}>
    <div style={{ fontSize: 24, fontWeight: 800, color, marginBottom: 4 }}>{seconds}с</div>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>{label}</div>
  </div>
);

const ActionBtn = ({ icon: Icon, label, color, bg, borderColor, onClick, active }) => (
  <button onClick={onClick} style={{
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: '14px 12px', borderRadius: 10, cursor: 'pointer',
    background: active ? `${bg}33` : 'var(--bg-secondary)',
    border: `1px solid ${active ? borderColor : 'var(--border)'}`,
    color: active ? color : 'var(--text-muted)',
    transition: 'all 0.15s',
  }}>
    <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>{label}</span>
  </button>
);

const TicketDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const ticket = DEMO_TICKETS[id] || DEMO_TICKETS[1];

  const [timerState, setTimerState] = useState('idle'); // idle | work | pause | wait
  const [times, setTimes] = useState({ work: 0, pause: 0, wait: 0 });
  const [messages, setMessages] = useState(ticket.messages || []);
  const [msgInput, setMsgInput] = useState('');
  const [starred, setStarred] = useState(false);
  const intervalRef = useRef(null);
  const chatRef = useRef(null);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (timerState === 'work') {
      intervalRef.current = setInterval(() => setTimes(t => ({ ...t, work: t.work + 1 })), 1000);
    } else if (timerState === 'pause') {
      intervalRef.current = setInterval(() => setTimes(t => ({ ...t, pause: t.pause + 1 })), 1000);
    } else if (timerState === 'wait') {
      intervalRef.current = setInterval(() => setTimes(t => ({ ...t, wait: t.wait + 1 })), 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerState]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = () => {
    if (!msgInput.trim()) return;
    setMessages(prev => [...prev, {
      id: Date.now(), text: msgInput,
      author: 'Вы', time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    }]);
    setMsgInput('');
  };

  const statusColor = { 'Новая': '#22c55e', 'В РАБОТЕ': '#9b5de5', 'ПАУЗА': '#f59e0b', 'ОЖИДАНИЕ': '#f97316', 'ЗАКРЫТО': '#55556a' };
  const sColor = statusColor[ticket.status] || '#22c55e';

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 6 }}>
          <ArrowLeft size={18} />
        </button>
        <button onClick={() => setStarred(s => !s)} style={{ background: 'none', border: 'none', color: starred ? '#f59e0b' : 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
          <Star size={16} fill={starred ? '#f59e0b' : 'none'} />
        </button>
        <button onClick={() => navigate('/tickets')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
          <Home size={15} />
        </button>
        <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(79,142,247,0.15)', color: '#4f8ef7', border: '1px solid rgba(79,142,247,0.3)', padding: '2px 7px', borderRadius: 4 }}>
          {ticket.club}
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
          {ticket.title}
        </span>
        <Edit2 size={13} color="var(--text-muted)" style={{ cursor: 'pointer' }} />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: sColor, background: `${sColor}18`, border: `1px solid ${sColor}40`, padding: '3px 10px', borderRadius: 6 }}>
            ● {ticket.status}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', padding: '3px 10px', borderRadius: 6 }}>
            {ticket.priority}
          </span>
        </div>
      </div>

      {/* Main 2-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, flex: 1 }}>
        
        {/* LEFT: Description + Timer + Chat */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          
          {/* Description */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <BookOpen size={13} color="#4f8ef7" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Описание задачи</span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>
              {ticket.description}
            </p>
          </div>

          {/* Timer */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Clock size={13} color="#4f8ef7" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Операционный таймер</span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <TimerBox label="Активная работа" seconds={times.work} color="#22c55e" />
              <TimerBox label="Пауза" seconds={times.pause} color="#f59e0b" />
              <TimerBox label="Ожидание" seconds={times.wait} color="#9b5de5" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <ActionBtn icon={Play}        label="В РАБОТУ"  color="#22c55e" bg="#22c55e" borderColor="#22c55e" active={timerState === 'work'} onClick={() => setTimerState(t => t === 'work' ? 'idle' : 'work')} />
              <ActionBtn icon={Pause}       label="ПАУЗА"     color="#f59e0b" bg="#f59e0b" borderColor="#f59e0b" active={timerState === 'pause'} onClick={() => setTimerState(t => t === 'pause' ? 'idle' : 'pause')} />
              <ActionBtn icon={Clock}       label="ОЖИДАНИЕ"  color="#9b5de5" bg="#9b5de5" borderColor="#9b5de5" active={timerState === 'wait'} onClick={() => setTimerState(t => t === 'wait' ? 'idle' : 'wait')} />
              <ActionBtn icon={CheckCircle} label="ЗАВЕРШИТЬ" color="var(--text-muted)" bg="#55556a" borderColor="#55556a" active={false} onClick={() => { setTimerState('idle'); }} />
            </div>
          </div>

          {/* Chat */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 280 }}>
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
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{m.text}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.author} · {m.time}</div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6 }}>
                <Smile size={18} />
              </button>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6 }}>
                <Paperclip size={18} />
              </button>
              <input
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Ваше сообщение..."
                style={{
                  flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)',
                  fontSize: 13, outline: 'none',
                }}
              />
              <button
                onClick={sendMessage}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #9b5de5)',
                  border: 'none', borderRadius: 10, padding: '10px 14px',
                  color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center',
                  boxShadow: '0 2px 8px rgba(124,58,237,0.4)',
                }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Info panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 16 }}>
              История и ресурсы
            </div>

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
