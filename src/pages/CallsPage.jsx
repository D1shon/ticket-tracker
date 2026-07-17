import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCall } from '../store/CallContext';
import { useTickets, USER_ROLES } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { pushNotify } from '../lib/pushNotify';
import { Play, Plus, SignalHigh, BarChart3, ShieldCheck, CalendarClock, Trash2, X, Video, Loader2, Lock, Globe, Check } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

const ROOMS = ['Зал переговоров', 'HR Отдел'];

const CallsPage = () => {
  const { isInCall, isJoining, joinCall, roomCounts } = useCall();
  const { user } = useTickets();
  const navigate = useNavigate();
  const isChef = user?.role === 'chef';

  const [joiningRoom, setJoiningRoom] = useState(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  useEffect(() => { if (!isJoining) setJoiningRoom(null); }, [isJoining]);

  const handleJoin = (name) => {
    if (isJoining || isInCall) return;
    setJoiningRoom(name);
    joinCall(name);
  };

  // ─── Запланированные созвоны ────────────────────────────────────────────────
  const [scheduled, setScheduled] = useState([]);
  const [showPlan, setShowPlan] = useState(false);
  const [planForm, setPlanForm] = useState({ room: ROOMS[0], date: '', time: '', note: '', visibility: 'public', participants: [] });
  const [savingPlan, setSavingPlan] = useState(false);

  // Менеджерский состав для приватных созвонов: шефы + менеджеры с клубами
  const team = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const [email, p] of Object.entries(USER_ROLES)) {
      if (!email.includes('@')) continue;
      if (p.role !== 'chef' && p.role !== 'manager') continue;
      const key = `${p.displayName}|${p.club || ''}`;
      if (seen.has(key)) continue; // у некоторых по две почты — показываем одного
      seen.add(key);
      out.push({ email, name: p.displayName, club: p.club, role: p.role, allEmails: [email] });
    }
    // вторые почты того же человека — добавляем в allEmails, чтобы пуш дошёл на обе
    for (const [email, p] of Object.entries(USER_ROLES)) {
      if (!email.includes('@') || (p.role !== 'chef' && p.role !== 'manager')) continue;
      const person = out.find(o => o.name === p.displayName && (o.club || '') === (p.club || ''));
      if (person && !person.allEmails.includes(email)) person.allEmails.push(email);
    }
    out.sort((a, b) => (a.club || '').localeCompare(b.club || '') || a.name.localeCompare(b.name, 'ru'));
    return out;
  }, []);

  const toggleParticipant = (person) => {
    setPlanForm(f => {
      const has = f.participants.includes(person.email);
      return { ...f, participants: has ? f.participants.filter(e => e !== person.email) : [...f.participants, person.email] };
    });
  };

  useEffect(() => {
    return onSnapshot(collection(db, 'scheduled_calls'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.startISO || '').localeCompare(b.startISO || ''));
      setScheduled(list);
    }, () => {});
  }, []);

  // Показываем будущие и идущие прямо сейчас (до часа после начала).
  // Приватные видят только участники, создатель и шефы.
  const myEmail = (user?.email || '').toLowerCase();
  const upcoming = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return scheduled
      .filter(c => new Date(c.startISO).getTime() > cutoff)
      .filter(c => {
        if (c.visibility !== 'private') return true;
        if (isChef) return true;
        if ((c.createdByEmail || '').toLowerCase() === myEmail) return true;
        return (c.participants || []).some(e => (e || '').toLowerCase() === myEmail);
      });
  }, [scheduled, isChef, myEmail]);

  const submitPlan = async () => {
    if (!planForm.date || !planForm.time) return;
    const isPrivate = planForm.visibility === 'private';
    if (isPrivate && planForm.participants.length === 0) return toast.error('Выберите хотя бы одного участника');
    const startISO = new Date(`${planForm.date}T${planForm.time}:00`).toISOString();
    if (isNaN(new Date(startISO).getTime())) return toast.error('Проверьте дату и время');
    setSavingPlan(true);
    try {
      // Все почты выбранных участников (у некоторых их две) + имена для карточки
      const chosen = team.filter(p => planForm.participants.includes(p.email));
      const participantsAll = isPrivate ? chosen.flatMap(p => p.allEmails) : [];
      const participantNames = isPrivate ? chosen.map(p => p.name) : [];

      await addDoc(collection(db, 'scheduled_calls'), {
        room: planForm.room,
        note: planForm.note.trim() || null,
        startISO,
        visibility: planForm.visibility,
        participants: participantsAll,
        participantNames,
        createdBy: user?.displayName || '',
        createdByEmail: user?.email || '',
        createdAtISO: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
      pushNotify({
        title: isPrivate ? '🔒 Приватный созвон' : '📅 Запланирован созвон',
        body: `${planForm.room} · ${format(new Date(startISO), 'd MMMM, HH:mm', { locale: ru })}${planForm.note ? ` — ${planForm.note.trim()}` : ''} (${user?.displayName || ''})`,
        excludeEmail: user?.email || '',
        url: '/calls',
        tag: 'call-planned',
        ...(isPrivate ? { emails: participantsAll } : { roles: ['chef', 'manager'] }),
      });
      setShowPlan(false);
      setPlanForm({ room: ROOMS[0], date: '', time: '', note: '', visibility: 'public', participants: [] });
      toast.success(isPrivate ? 'Приватный созвон запланирован — участники получат уведомление' : 'Созвон запланирован — команда получит уведомление');
    } catch {
      toast.error('Не удалось сохранить');
    } finally {
      setSavingPlan(false);
    }
  };

  const deletePlan = async (c) => {
    if (!window.confirm('Отменить запланированный созвон?')) return;
    try { await deleteDoc(doc(db, 'scheduled_calls', c.id)); } catch { toast.error('Не удалось удалить'); }
  };

  const fmtWhen = (iso) => {
    try {
      const d = new Date(iso);
      const today = new Date();
      const tomorrow = new Date(Date.now() + 86400000);
      const same = (a, b) => a.toDateString() === b.toDateString();
      const day = same(d, today) ? 'Сегодня' : same(d, tomorrow) ? 'Завтра' : format(d, 'd MMMM', { locale: ru });
      return `${day}, ${format(d, 'HH:mm')}`;
    } catch { return ''; }
  };

  if (isInCall) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px' }}>
          <div style={{ width: 80, height: 80, background: 'var(--accent-green-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', border: '1px solid var(--accent-green-border)' }}>
             <div style={{ width: 20, height: 20, background: 'var(--accent-green)', borderRadius: '50%', animation: 'pulse 2s infinite' }}></div>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 12 }}>ВЫ В СОЗВОНЕ</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 400, margin: '0 auto 32px' }}>
             Вы можете переходить по любым вкладкам (Заявки, График), созвон останется активным в плавающем окне справа.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <button
              onClick={() => navigate('/tickets')}
              style={{ background: 'var(--accent-blue)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px var(--accent-blue-shadow)' }}
            >
              ПЕРЕЙТИ К ЗАЯВКАМ
            </button>
          </div>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 0' }}>

      {/* ── Запланированные созвоны ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
            Запланированные созвоны
          </h3>
          <button onClick={() => setShowPlan(true)} style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12,
            border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
          }}>
            <CalendarClock size={14} /> Запланировать
          </button>
        </div>
        {upcoming.length === 0 ? (
          <div style={{ padding: '18px 20px', border: '1px dashed var(--border)', borderRadius: 16, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
            Ничего не запланировано — созвонитесь спонтанно или назначьте время 👆
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map(c => {
              const started = new Date(c.startISO).getTime() <= Date.now();
              const canDelete = isChef || (c.createdByEmail || '').toLowerCase() === (user?.email || '').toLowerCase();
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  background: 'var(--bg-card)', borderRadius: 14,
                  border: `1px solid ${started ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`, flexWrap: 'wrap',
                }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: started ? 'rgba(34,197,94,0.12)' : 'var(--accent-blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Video size={17} color={started ? '#22c55e' : 'var(--accent-blue)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', flexWrap: 'wrap' }}>
                      {c.room}{c.note ? ` · ${c.note}` : ''}
                      {c.visibility === 'private' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 900, padding: '2px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', textTransform: 'uppercase' }}>
                          <Lock size={9} /> Приватный
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: started ? '#22c55e' : 'var(--text-muted)' }}>
                      {started ? '● идёт сейчас' : fmtWhen(c.startISO)}{c.createdBy ? ` · ${c.createdBy}` : ''}
                      {c.visibility === 'private' && (c.participantNames || []).length > 0 && ` · ${c.participantNames.join(', ')}`}
                    </div>
                  </div>
                  <button onClick={() => handleJoin(c.room)} disabled={isJoining} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 11,
                    border: 'none', background: started ? '#22c55e' : 'var(--accent-blue)', color: '#fff',
                    fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: isJoining ? 0.6 : 1,
                  }}>
                    {isJoining && joiningRoom === c.room ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Play size={13} />}
                    Войти
                  </button>
                  {canDelete && (
                    <button onClick={() => deletePlan(c)} title="Отменить" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, lineHeight: 0, opacity: 0.5 }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: isMobile ? 24 : 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <h3 style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Выберите зал</h3>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 20 }}>
              {ROOMS.map((n, i) => {
                const channelId = n === 'Зал переговоров' ? 'main_room' : 'hr_room';
                const count = roomCounts?.[channelId] || 0;
                const joiningThis = isJoining && joiningRoom === n;
                return (
                  <button key={i} onClick={() => handleJoin(n)} disabled={isJoining} style={{ background: 'var(--bg-card)', border: '1px solid ' + (joiningThis ? 'var(--accent-blue)' : 'var(--border)'), borderRadius: 28, padding: isMobile ? 22 : 32, textAlign: 'left', cursor: isJoining ? 'wait' : 'pointer', transition: 'all 0.3s', boxShadow: 'var(--shadow-card)', position: 'relative', overflow: 'hidden', opacity: isJoining && !joiningThis ? 0.5 : 1 }}>
                     <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                       <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--accent-blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent-blue-border)' }}>
                         {joiningThis ? <Loader2 size={22} color="var(--accent-blue)" style={{ animation: 'spin 0.8s linear infinite' }} /> : <Play size={22} color="var(--accent-blue)" />}
                       </div>
                       <div style={{ marginLeft: 'auto' }}>
                         {count > 0 ? (
                           <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                             <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 1.5s infinite' }}></span>
                             В группе: {count}
                           </span>
                         ) : (
                           <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                             Свободно
                           </span>
                         )}
                       </div>
                     </div>
                     <div style={{ fontWeight: 900, color: 'var(--text-primary)', fontSize: 17 }}>{joiningThis ? 'Подключение…' : n}</div>
                  </button>
                );
              })}
              <button disabled={isJoining} onClick={() => { const name = prompt('Название (Latin):'); if (name) handleJoin(name); }} style={{ background: 'var(--bg-hover)', border: '1px dashed var(--accent-blue)', borderRadius: 28, padding: isMobile ? 22 : 32, textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: isMobile ? 100 : 146, opacity: isJoining ? 0.5 : 1 }}>
                 <Plus size={24} color="var(--accent-blue)" style={{ marginBottom: 8 }} />
                 <div style={{ fontWeight: 800, color: 'var(--accent-blue)', fontSize: 13 }}>Своя комната</div>
              </button>
            </div>
          </div>

          {!isMobile && (
          <div style={{ background: 'var(--bg-card)', borderRadius: 32, padding: 32, border: '1px solid var(--border)', alignSelf: 'start', boxShadow: 'var(--shadow-card)' }}>
             <h3 style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>Преимущества</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {[
                  { i: SignalHigh, t: 'Многозадачность', d: 'Обсуждайте заявки, не выходя из связи' },
                  { i: BarChart3, t: 'Шейринг экрана', d: 'Показывайте коллегам свой монитор' },
                  { i: ShieldCheck, t: 'HD Видео', d: 'Чистая картинка 1080p' }
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 14, borderBottom: idx < 2 ? '1px solid var(--border)' : 'none', paddingBottom: idx < 2 ? 16 : 0 }}>
                    <item.i size={18} color="var(--accent-blue)" />
                    <div>
                       <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{item.t}</div>
                       <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.d}</div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
          )}
      </div>

      {/* ── Модалка планирования ── */}
      {showPlan && (
        <div onClick={() => !savingPlan && setShowPlan(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--bg-card)', borderRadius: 20, border: '1px solid var(--border)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarClock size={16} style={{ color: 'var(--accent-purple)' }} /> Запланировать созвон
              </h3>
              <button onClick={() => setShowPlan(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {ROOMS.map(r => (
                <button key={r} onClick={() => setPlanForm(f => ({ ...f, room: r }))} style={{
                  flex: 1, padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  border: '1px solid ' + (planForm.room === r ? 'var(--accent-purple)' : 'var(--border)'),
                  background: planForm.room === r ? 'var(--accent-purple)' : 'transparent',
                  color: planForm.room === r ? '#fff' : 'var(--text-muted)',
                }}>{r}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={planForm.date} min={new Date().toISOString().slice(0, 10)}
                onChange={e => setPlanForm(f => ({ ...f, date: e.target.value }))}
                style={{ flex: 1.4, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontWeight: 600, colorScheme: 'dark' }} />
              <input type="time" value={planForm.time}
                onChange={e => setPlanForm(f => ({ ...f, time: e.target.value }))}
                style={{ flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontWeight: 600, colorScheme: 'dark' }} />
            </div>

            <input
              placeholder="Тема (необязательно): планёрка, итоги недели…"
              value={planForm.note}
              onChange={e => setPlanForm(f => ({ ...f, note: e.target.value }))}
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }}
            />

            {/* Видимость: общедоступный / приватный */}
            <div style={{ display: 'flex', gap: 6 }}>
              {[['public', <><Globe size={12} /> Общедоступный</>], ['private', <><Lock size={12} /> Приватный</>]].map(([id, label]) => (
                <button key={id} onClick={() => setPlanForm(f => ({ ...f, visibility: id }))} style={{
                  flex: 1, padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  border: '1px solid ' + (planForm.visibility === id ? (id === 'private' ? '#f59e0b' : 'var(--accent-purple)') : 'var(--border)'),
                  background: planForm.visibility === id ? (id === 'private' ? 'rgba(245,158,11,0.15)' : 'var(--accent-purple)') : 'transparent',
                  color: planForm.visibility === id ? (id === 'private' ? '#f59e0b' : '#fff') : 'var(--text-muted)',
                }}>{label}</button>
              ))}
            </div>

            {/* Приватный: выбор участников из менеджерского состава */}
            {planForm.visibility === 'private' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12, padding: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 6px' }}>
                  Кто должен участвовать · выбрано: {planForm.participants.length}
                </div>
                {team.filter(p => !p.allEmails.some(e => e.toLowerCase() === myEmail)).map(p => {
                  const selected = planForm.participants.includes(p.email);
                  return (
                    <button key={p.email} onClick={() => toggleParticipant(p)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      border: '1px solid ' + (selected ? 'rgba(34,197,94,0.45)' : 'var(--border)'),
                      background: selected ? 'rgba(34,197,94,0.08)' : 'transparent',
                    }}>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</span>
                      <span style={{ fontSize: 9, fontWeight: 900, padding: '3px 8px', borderRadius: 6, background: 'rgba(139,92,246,0.12)', color: 'var(--accent-purple)', textTransform: 'uppercase', flexShrink: 0 }}>
                        {p.role === 'chef' ? 'Шеф' : p.club}
                      </span>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, padding: '5px 10px', borderRadius: 8, flexShrink: 0,
                        background: selected ? '#22c55e' : 'var(--bg-hover)',
                        color: selected ? '#fff' : 'var(--text-muted)',
                        border: selected ? 'none' : '1px solid var(--border)',
                      }}>
                        {selected ? <><Check size={11} /> Участвует</> : 'Должен участвовать'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              onClick={submitPlan}
              disabled={savingPlan || !planForm.date || !planForm.time || (planForm.visibility === 'private' && planForm.participants.length === 0)}
              style={{ padding: '12px', borderRadius: 12, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: savingPlan || !planForm.date || !planForm.time || (planForm.visibility === 'private' && planForm.participants.length === 0) ? 0.5 : 1 }}
            >
              {planForm.visibility === 'private' ? 'Запланировать — уведомим только участников' : 'Запланировать — команда получит уведомление'}
            </button>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.5 }}>
              {planForm.visibility === 'private'
                ? '🔒 Приватный созвон видят и получают уведомления только выбранные участники (и вы). Напоминание — за 5 минут до начала.'
                : 'Уведомление уйдёт шефам и менеджерам сразу и повторно — за 5 минут до начала.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CallsPage;
