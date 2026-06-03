import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Star, Home, Edit2, Play, Pause, Clock, CheckCircle, 
  Smile, Paperclip, Send, MessageSquare, User, Calendar, BookOpen,
  Package, X, RefreshCw, Trash2
} from 'lucide-react';
import { useTickets } from '../../store/TicketContext';
import { formatAuthor } from '../../utils/formatters';

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

// Helper to safely parse Firestore timestamp, Date object, or string into a Date object
const parseSafeDate = (d) => {
  if (!d) return null;
  if (typeof d.toDate === 'function') {
    try { return d.toDate(); } catch {}
  }
  if (typeof d.seconds === 'number') {
    return new Date(d.seconds * 1000);
  }
  const p = new Date(d);
  return isNaN(p.getTime()) ? null : p;
};

// Helper to safely format Firestore timestamp, Date object, or ISO string for display
const formatCreatedDate = (createdAt) => {
  const d = parseSafeDate(createdAt);
  if (!d) return '—';
  return d.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
};

// ─── Live counter (counts seconds from a given ISO timestamp) ────────────────
function useLiveSeconds(sinceISO, active) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active || !sinceISO) { setSecs(0); return; }
    const date = parseSafeDate(sinceISO);
    if (!date) { setSecs(0); return; }
    const tick = () => setSecs(Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sinceISO, active]);
  return secs;
}

function fmtSecs(s) {
  if (isNaN(s)) return '0с';
  if (s < 60)   return `${s}с`;
  if (s < 3600) return `${Math.floor(s / 60)}мин ${s % 60}с`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  return `${h}ч ${m}мин ${rem}с`;
}

// ─── Timer box ───────────────────────────────────────────────────────────────
const TimerBox = ({ label, sinceISO, accumulatedSeconds = 0, color, active }) => {
  const liveSecs = useLiveSeconds(sinceISO, active);
  const totalSecs = accumulatedSeconds + liveSecs;
  const parsedSince = parseSafeDate(sinceISO);
  
  return (
    <div style={{
      flex: 1, padding: '18px 16px', borderRadius: 12, textAlign: 'center',
      background: active ? `${color}12` : 'var(--bg-primary)',
      border: `1px solid ${active ? color + '60' : color + '25'}`,
      transition: 'all 0.3s',
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 6, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
        {(totalSecs > 0 || active) ? fmtSecs(totalSecs) : '—'}
      </div>
      {active && parsedSince && (
        <div style={{ fontSize: 10, color: `${color}99`, marginBottom: 4 }}>
          с {parsedSince.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>{label}</div>
    </div>
  );
};

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
  const { tickets, user, loading, updateTicket, addComment, uploadFile, deleteTicket } = useTickets();

  // Find real ticket from context (id from URL is always a string)
  const ticket = tickets?.find(t => String(t.id) === String(id));

  // ─── Local status override ───────────────────────────────────────────────
  // ticket comes from DEMO_TICKETS (static) when not found in Firebase.
  // updateTicket updates the context tickets array, but if this ticket isn't
  // there yet, the derived `ticket` object never updates → timer never starts.
  // Solution: keep a local copy of status + statusChangedAt that ALWAYS updates
  // immediately on button click, regardless of Firebase.
  const [localStatus,          setLocalStatus]          = useState(ticket?.status || 'new');
  const [localStatusChangedAt, setLocalStatusChangedAt] = useState(ticket?.statusChangedAt || null);
  const [accumulatedTime,      setAccumulatedTime]      = useState({
    work: ticket?.accWork || 0,
    pause: ticket?.accPause || 0,
    wait: ticket?.accWait || 0,
  });

  // Sync from Firebase when the real ticket loads into context
  useEffect(() => {
    const firebaseTicket = tickets?.find(t => String(t.id) === String(id));
    if (firebaseTicket) {
      setLocalStatus(firebaseTicket.status || 'new');
      setLocalStatusChangedAt(firebaseTicket.statusChangedAt || null);
      setAccumulatedTime({
        work: firebaseTicket.accWork || 0,
        pause: firebaseTicket.accPause || 0,
        wait: firebaseTicket.accWait || 0,
      });
    }
  }, [tickets, id]);

  // Derived timer state from LOCAL status (not from static ticket object)
  const statusToTimer = { in_progress: 'work', paused: 'pause', waiting: 'wait' };
  const timerState = statusToTimer[localStatus] || 'idle';

  const workSince  = localStatus === 'in_progress' ? localStatusChangedAt : null;
  const pauseSince = localStatus === 'paused'      ? localStatusChangedAt : null;
  const waitSince  = localStatus === 'waiting'     ? localStatusChangedAt : null;

  // ── change status ─────────────────────────────────────────────────────────
  const changeStatus = useCallback(async (newStatus, reason = null) => {
    const now = new Date().toISOString();

    // Calculate elapsed time in previous status
    let elapsed = 0;

    if (localStatusChangedAt) {
      const startDate = parseSafeDate(localStatusChangedAt);
      if (startDate) {
        elapsed = Math.floor((new Date(now).getTime() - startDate.getTime()) / 1000);
        if (elapsed < 0) elapsed = 0;
      }
    }

    // Accumulate time locally
    const newAcc = { ...accumulatedTime };
    if (localStatus === 'in_progress') newAcc.work += elapsed;
    if (localStatus === 'paused')      newAcc.pause += elapsed;
    if (localStatus === 'waiting')     newAcc.wait += elapsed;

    // Update LOCAL state FIRST — UI responds instantly
    setLocalStatus(newStatus);
    setLocalStatusChangedAt(now);
    setAccumulatedTime(newAcc);

    // Then push to Firebase/context
    const update = { 
      status: newStatus, 
      statusChangedAt: now,
      accWork: newAcc.work,
      accPause: newAcc.pause,
      accWait: newAcc.wait,
    };
    if (reason) update.statusReason = reason;
    if (newStatus === 'closed') update.closedAt = now;
    if (updateTicket && ticket?.id) await updateTicket(ticket.id, update);
  }, [ticket?.id, updateTicket, localStatus, localStatusChangedAt, accumulatedTime]);


  const [pendingAction,   setPendingAction]   = useState(null);
  const [statusReport,    setStatusReport]    = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [messages,     setMessages]       = useState(ticket?.comments || []);
  const [msgInput,     setMsgInput]       = useState('');
  const [starred,      setStarred]        = useState(false);
  const chatRef    = useRef(null);
  const fileInputRef = useRef(null);
  const [attachment,   setAttachment]     = useState(null);
  const [previewImage, setPreviewImage]   = useState(null);
  const [uploading,    setUploading]      = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef(null);
  const emojiButtonRef = useRef(null);

  // Sync messages when Firebase ticket updates
  useEffect(() => {
    if (ticket?.comments) setMessages(ticket.comments);
  }, [ticket?.comments]);

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages]);

  const handleWorkClick = useCallback(() => {
    setStatusReport(null);
    setPendingAction(null);
    const next = localStatus === 'in_progress' ? 'new' : 'in_progress';
    changeStatus(next);
  }, [localStatus, changeStatus]);

  const handleReasonConfirm = useCallback((reason) => {
    const statusMap  = { pause: 'paused',  wait: 'waiting', finish: 'closed' };
    const labelMap   = { pause: '⏸ Пауза', wait: '⏳ Ожидание', finish: '✅ Завершено' };
    const colorMap   = { pause: '#f59e0b', wait: '#9b5de5', finish: '#22c55e' };

    const newStatus = statusMap[pendingAction];
    changeStatus(newStatus, reason);
    setStatusReport({
      action: pendingAction,
      label:  labelMap[pendingAction],
      color:  colorMap[pendingAction],
      reason,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    });
    setPendingAction(null);
  }, [pendingAction, changeStatus]);

  // ── send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = msgInput.trim();
    if (!text && !attachment) return;

    if (addComment && ticket?.id) {
      await addComment(ticket.id, text, attachment || null);
    } else {
      // local fallback
      setMessages(prev => [...prev, {
        id: Date.now(), text, author: 'Вы',
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        attachment,
      }]);
    }
    setMsgInput('');
    setAttachment(null);
  }, [msgInput, attachment, ticket?.id, addComment]);

  // ── file upload ────────────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e) => {
    const target = e.target;
    const file = target.files[0];
    if (!file) return;

    if (uploadFile) {
      setUploading(true);
      try {
        const result = await uploadFile(file);
        setAttachment(result);
      } finally {
        setUploading(false);
        target.value = ''; // Use captured target
      }
    } else {
      setAttachment({ name: file.name, url: URL.createObjectURL(file), type: file.type });
      target.value = '';
    }
  }, [uploadFile]);

  // ── emoji picker logic ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target) &&
          emojiButtonRef.current && !emojiButtonRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addEmoji = (emoji) => {
    setMsgInput(prev => prev + emoji);
    // Keep focus on input if possible, but for simple implementation just append
  };

  const COMMON_EMOJIS = ['😀', '😊', '😂', '👍', '🙏', '🔥', '✅', '❌', '⚠️', '🆘', '⏳', '⏸️', '💬', '📎', '🚀', '🏢'];

  const sColor = { new: '#22c55e', in_progress: '#9b5de5', paused: '#f59e0b', waiting: '#f97316', closed: '#55556a' }[localStatus] || '#22c55e';
  const sLabel = { new: 'Новая', in_progress: 'В работе', paused: 'На паузе', waiting: 'Ожидание', closed: 'Закрыто' }[localStatus] || localStatus;

  // ── Access Control and Loading Check ──
  const userClub = user?.club?.toUpperCase();
  const isManager = user?.role === 'manager';
  const hasAccess = !isManager || !userClub || !ticket?.club || ticket.club.toUpperCase() === userClub;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(79,142,247,0.2)', borderTop: '3px solid #4f8ef7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
      </div>
    );
  }

  if (!ticket || !ticket.id) {
    return (
      <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '60vh', color: 'var(--text-muted)', gap: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Заявка не найдена</h2>
        <p style={{ fontSize: 13 }}>Заявка не существует или у вас нет прав на её просмотр.</p>
        <button onClick={() => navigate('/tickets')} style={{ padding: '8px 16px', borderRadius: 10, background: 'var(--accent-purple)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Назад к списку</button>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '60vh', color: 'var(--text-muted)', gap: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Доступ ограничен</h2>
        <p style={{ fontSize: 13 }}>Эта заявка принадлежит другому клубу ({ticket.club?.toUpperCase()}).</p>
        <button onClick={() => navigate('/tickets')} style={{ padding: '8px 16px', borderRadius: 10, background: 'var(--accent-purple)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Назад к списку</button>
      </div>
    );
  }

  const getInspectorName = () => {
    if (ticket.inspectorName) return ticket.inspectorName;
    const match = ticket.subtitle?.match(/\(Проверил:\s*([^)]+)\)/);
    return match ? match[1].trim() : null;
  };
  const inspector = getInspectorName();

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
          <span style={{ fontSize: 11, fontWeight: 700, color: sColor, background: `${sColor}18`, border: `1px solid ${sColor}40`, padding: '3px 10px', borderRadius: 6 }}>● {sLabel}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', padding: '3px 10px', borderRadius: 6 }}>{ticket.priority}</span>
          <button
            id="btn-delete-ticket"
            onClick={() => setShowDeleteModal(true)}
            title="Удалить заявку"
            style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              color: '#ef4444', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; e.currentTarget.style.borderColor = '#ef4444'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
          >
            <Trash2 size={13} />
            УДАЛИТЬ
          </button>
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
              <TimerBox label="Активная работа" sinceISO={workSince}  accumulatedSeconds={accumulatedTime.work}  color="#22c55e" active={timerState === 'work'} />
              <TimerBox label="Пауза"            sinceISO={pauseSince} accumulatedSeconds={accumulatedTime.pause} color="#f59e0b" active={timerState === 'pause'} />
              <TimerBox label="Ожидание"         sinceISO={waitSince}  accumulatedSeconds={accumulatedTime.wait}  color="#9b5de5" active={timerState === 'wait'} />
            </div>

            {/* ── STATUS REPORT (shown after confirming reason) ── */}
            {statusReport && !pendingAction && (
              <div style={{
                margin: '4px 0', padding: '14px 18px', borderRadius: 14,
                background: `${statusReport.color}08`, border: `1px solid ${statusReport.color}30`,
                display: 'flex', alignItems: 'flex-start', gap: 12,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusReport.color, marginTop: 5, flexShrink: 0 }}></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: statusReport.color, letterSpacing: '0.06em', marginBottom: 4 }}>
                    {statusReport.label.toUpperCase()} · {statusReport.time}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{statusReport.reason}</div>
                </div>
                <button onClick={() => setStatusReport(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>
            )}

            {/* ── INLINE REASON PANEL ── */}
            {pendingAction && (
              <ReasonPanel
                action={pendingAction}
                onConfirm={handleReasonConfirm}
                onCancel={() => setPendingAction(null)}
              />
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <ActionBtn icon={Play}        label="В РАБОТУ"  color="#22c55e" bg="rgba(34,197,94,0.18)"   active={timerState === 'work'}  onClick={handleWorkClick} />
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
                    {m.text && <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{m.text}</div>}
                    {m.attachment && (
                      <div style={{ marginTop: m.text ? 8 : 0 }}>
                        {m.attachment.type && m.attachment.type.startsWith('image/') ? (
                          <button 
                            onClick={() => setPreviewImage(m.attachment.url)} 
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', display: 'block' }}
                          >
                            <img src={m.attachment.url} alt={m.attachment.name} style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, objectFit: 'cover' }} />
                          </button>
                        ) : (
                          <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Paperclip size={14} color="#4f8ef7" />
                            <a href={m.attachment.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#4f8ef7', textDecoration: 'none', wordBreak: 'break-all' }}>
                              {m.attachment.name}
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatAuthor(m.author)} · {m.time}</div>
                </div>
              ))}
            </div>
            
            {/* Attachment Preview Area */}
            {attachment && (
              <div style={{ padding: '8px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Paperclip size={14} color="#4f8ef7" />
                  <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{attachment.name}</span>
                </div>
                <button onClick={() => setAttachment(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              </div>
            )}
            
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
              
              {/* Emoji Picker Panel */}
              {showEmojiPicker && (
                <div 
                  ref={emojiPickerRef}
                  style={{
                    position: 'absolute', bottom: '100%', left: 16, marginBottom: 8,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 16, padding: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
                    zIndex: 1000, animation: 'slideUp 0.2s ease'
                  }}
                >
                  {COMMON_EMOJIS.map(emoji => (
                    <button 
                      key={emoji}
                      onClick={() => addEmoji(emoji)}
                      style={{ 
                        fontSize: 18, padding: 8, background: 'none', border: 'none', 
                        cursor: 'pointer', borderRadius: 8, transition: 'background 0.2s' 
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <button 
                ref={emojiButtonRef}
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                style={{ background: 'none', border: 'none', color: showEmojiPicker ? 'var(--accent-purple)' : 'var(--text-muted)', cursor: 'pointer', padding: 6, transition: 'color 0.2s' }}
              >
                <Smile size={18} />
              </button>
              <button onClick={() => !uploading && fileInputRef.current?.click()} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: uploading ? 'default' : 'pointer', padding: 6 }}>
                {uploading ? (
                  <RefreshCw size={18} color="#4f8ef7" className="animate-spin" />
                ) : (
                  <Paperclip size={18} color={attachment ? '#4f8ef7' : 'currentColor'} />
                )}
              </button>
              <input value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Ваше сообщение..."
                style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
              <button onClick={sendMessage} style={{ background: 'linear-gradient(135deg, #7c3aed, #9b5de5)', border: 'none', borderRadius: 10, padding: '10px 14px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '0 2px 8px rgba(124,58,237,0.4)' }}>
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
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{formatCreatedDate(ticket.createdAt)}</span>
              </div>

              {inspector && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <User size={14} color="var(--text-muted)" />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 90 }}>Проверяющий</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-purple)' }}>{inspector}</span>
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <BookOpen size={13} color="var(--text-muted)" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Журнал объекта</span>
                </div>
                {ticket.journal && ticket.journal.length > 0 ? (
                  ticket.journal.map((j, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      <span style={{ color: '#4f8ef7', fontWeight: 600 }}>{j.date}</span> — {j.text}
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Записей в журнале нет
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          onClick={() => setShowDeleteModal(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.75)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 20, padding: 32, maxWidth: 400, width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              animation: 'slideUp 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={20} color="#ef4444" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Удалить заявку?</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Это действие необратимо</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24, padding: '12px 16px', background: 'var(--bg-hover)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{ticket.title}</strong>
              <br />
              <span style={{ color: '#4f8ef7', fontSize: 11, fontWeight: 700 }}>{ticket.club}</span>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12, background: 'var(--bg-hover)',
                  border: '1px solid var(--border)', color: 'var(--text-primary)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em',
                }}
              >
                ОТМЕНА
              </button>
              <button
                id="btn-confirm-delete-ticket"
                onClick={async () => {
                  setShowDeleteModal(false);
                  await deleteTicket(ticket.id);
                  navigate('/tickets');
                }}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                  border: 'none', color: '#fff',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em',
                  boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
                }}
              >
                ДА, УДАЛИТЬ
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Image Preview Modal */}
      {previewImage && (
        <div 
          onClick={() => setPreviewImage(null)} 
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            background: 'rgba(0,0,0,0.85)', zIndex: 99998, 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            padding: 40, cursor: 'zoom-out'
          }}
        >
          <button 
            onClick={() => setPreviewImage(null)} 
            style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', padding: 8, color: 'white', cursor: 'pointer', display: 'flex' }}
          >
            <X size={24} />
          </button>
          <img 
            src={previewImage} 
            alt="Preview" 
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} 
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default TicketDetail;
