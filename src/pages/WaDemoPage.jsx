import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MessageCircle, FileText, AlertTriangle, Clock, Smartphone, QrCode, Power, WifiOff, Search, ArrowLeft, Phone } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE'];

// Завершающие реплики клиента («спасибо», «ок», «рахмет»…) — диалог не ждёт ответа,
// если мы уже отвечали ранее и клиент закрыл разговор такой фразой.
const CLOSING_RE = /^(спасибо+|благодар(ю|им|очка)|спс|пасиб[оа]?|ok|ок(ей)?|хорошо|отлично|супер|класс|понятно|ясно|понял[аи]?|договорились|да|ага|угу|рахмет|ра[хқ]мет( сізге| вам)?|жарайды|болды|👍|🙏|❤️?|😊|☺️)[\s!.)»😊🙏👍❤️💪🔥]*$/i;

// Детерминированный цвет аватара по имени/номеру
const AV_COLORS = ['#4f8ef7', '#9b5de5', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6'];
const avColor = (s) => AV_COLORS[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];

const Avatar = ({ name, size = 38 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    background: `linear-gradient(135deg, ${avColor(name)}cc, ${avColor(name)})`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 900, fontSize: size * 0.4,
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  }}>
    {(String(name || '?').trim()[0] || '?').toUpperCase()}
  </div>
);

const Card = ({ children, style }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', ...style }}>{children}</div>
);
const Stat = ({ label, value, color = 'var(--accent-purple)' }) => (
  <Card style={{ flex: 1, minWidth: 125 }}>
    <div style={{ fontSize: 22, fontWeight: 950, color }}>{value}</div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
  </Card>
);

const WaDemoPage = ({ embedded = false }) => {
  const { user } = useTickets();
  const isChef = user?.role === 'chef';
  const userClub = (user?.club || '').toUpperCase();

  const [activeClub, setActiveClub] = useState(CLUBS.includes(userClub) ? userClub : CLUBS[0]);
  const [tab, setTab] = useState('day');
  const [messages, setMessages] = useState([]);
  const [bridge, setBridge] = useState({});     // club -> { status, qrDataUrl, phone }
  const [reports, setReports] = useState([]);   // все отчёты ИИ
  const [activeChat, setActiveChat] = useState(null);
  const [chatQuery, setChatQuery] = useState('');
  const [now, setNow] = useState(Date.now());
  const [isMobileW, setIsMobileW] = useState(() => window.innerWidth <= 768);
  const bottomRef = useRef(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const h = () => setIsMobileW(window.innerWidth <= 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'wa_messages'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.timestampISO || '').localeCompare(b.timestampISO || ''));
      setMessages(list);
    }, () => {});
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'wa_bridge'), snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setBridge(map);
    }, () => {});
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'wa_reports'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.day || '').localeCompare(a.day || ''));
      setReports(list);
    }, () => {});
  }, []);

  // Диалоги, отмеченные вручную как завершённые («Завершено» в списке ожидающих)
  const [waitingDone, setWaitingDone] = useState({});
  useEffect(() => {
    return onSnapshot(collection(db, 'wa_waiting_done'), snap => {
      const m = {};
      snap.docs.forEach(d => { m[d.id] = d.data(); });
      setWaitingDone(m);
    }, () => {});
  }, []);
  const doneKey = (jid) => `${activeClub.replace(/\s+/g, '')}_${(jid || '').replace(/[^\w]/g, '')}`;
  const dismissWaiting = async (w) => {
    try {
      await setDoc(doc(db, 'wa_waiting_done', doneKey(w.jid)), {
        club: activeClub, jid: w.jid, by: user?.displayName || '', atISO: new Date().toISOString(),
      });
      toast.success('Диалог отмечен как завершённый');
    } catch { toast.error('Не удалось отметить'); }
  };

  // Только личные переписки — группы, рассылки и каналы не читаем
  const clubMessages = useMemo(
    () => messages.filter(m => m.club === activeClub && !m.isGroup && !(m.chatJid || '').endsWith('@newsletter')),
    [messages, activeClub]
  );

  // ── Живая статистика сегодняшнего дня (без ИИ, чистая математика) ──
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayStats = useMemo(() => {
    const almatyDay = (iso) => { try { return new Date(new Date(iso).getTime() + 5 * 3600000).toISOString().slice(0, 10); } catch { return ''; } };
    const today = clubMessages.filter(m => almatyDay(m.timestampISO) === almatyDay(new Date().toISOString()));
    const byChat = {};
    today.forEach(m => {
      if (m.isGroup) return;
      if (!byChat[m.chatJid]) byChat[m.chatJid] = [];
      byChat[m.chatJid].push(m);
    });
    const dialogs = Object.values(byChat).filter(msgs => msgs.some(m => m.direction === 'in'));
    let waiting = [];
    let replies = [];
    let answered = 0;
    dialogs.forEach(msgs => {
      const firstIn = msgs.find(m => m.direction === 'in');
      const firstOutAfter = firstIn ? msgs.find(m => m.direction === 'out' && m.timestampISO > firstIn.timestampISO) : null;
      if (firstOutAfter) {
        answered++;
        replies.push(Math.round((new Date(firstOutAfter.timestampISO) - new Date(firstIn.timestampISO)) / 60000));
      }
      const last = msgs[msgs.length - 1];
      if (last.direction === 'in') {
        const t = (last.text || '').trim();
        // Завершающая фраза после нашего ответа — диалог закрыт, ответа не ждёт
        const isClosing = msgs.some(m => m.direction === 'out') && t.length <= 45 && CLOSING_RE.test(t);
        // Отмечен вручную как завершённый (пока клиент не написал что-то новое)
        const done = waitingDone[doneKey(last.chatJid)];
        const dismissed = done?.atISO && done.atISO >= last.timestampISO;
        if (!isClosing && !dismissed) {
          waiting.push({
            jid: last.chatJid,
            name: last.chatName || last.chatJid.split('@')[0],
            text: last.text || '📎 вложение',
            waitMin: Math.max(0, Math.round((now - new Date(last.timestampISO)) / 60000)),
          });
        }
      }
    });
    replies.sort((a, b) => a - b);
    const median = replies.length ? replies[Math.floor(replies.length / 2)] : null;
    waiting.sort((a, b) => b.waitMin - a.waitMin);
    return { total: dialogs.length, answered, waiting, medianReply: median, msgsCount: today.length };
  }, [clubMessages, now, waitingDone, activeClub]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Подключение ──
  const st = bridge[activeClub] || {};
  const bridgeAlive = bridge['_bridge']?.aliveAtISO && (now - new Date(bridge['_bridge'].aliveAtISO).getTime()) < 12 * 60 * 1000;
  const canManage = isChef || user?.role === 'manager';

  const requestConnect = async () => {
    try {
      await setDoc(doc(db, 'wa_bridge', activeClub), { request: 'connect', status: 'starting' }, { merge: true });
      toast.info('Запрашиваю QR-код… появится здесь через 5–10 секунд');
    } catch { toast.error('Не удалось отправить запрос'); }
  };
  const requestDisconnect = async () => {
    if (!window.confirm(`Отключить WhatsApp номера клуба ${activeClub} от платформы?`)) return;
    try { await updateDoc(doc(db, 'wa_bridge', activeClub), { request: 'disconnect' }); } catch {}
  };

  // отчёт ИИ по клубу
  const clubReport = reports.find(r => r.club === activeClub) || null;

  const chats = useMemo(() => {
    const byChat = {};
    clubMessages.forEach(m => {
      if (!byChat[m.chatJid]) byChat[m.chatJid] = { jid: m.chatJid, names: new Set(), msgs: [] };
      if (m.chatName && m.direction === 'in') byChat[m.chatJid].names.add(m.chatName);
      byChat[m.chatJid].msgs.push(m);
    });
    return Object.values(byChat).map(c => {
      const last = c.msgs[c.msgs.length - 1];
      return {
        ...c,
        title: [...c.names][0] || `+${c.jid.split('@')[0]}`,
        phone: c.jid.split('@')[0],
        last,
        waiting: last?.direction === 'in', // последнее слово за клиентом
      };
    }).sort((a, b) => (b.last?.timestampISO || '').localeCompare(a.last?.timestampISO || ''));
  }, [clubMessages]);

  const filteredChats = useMemo(() => {
    const q = chatQuery.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(c => c.title.toLowerCase().includes(q) || c.phone.includes(q));
  }, [chats, chatQuery]);

  // На телефоне по умолчанию показываем список; диалог открывается по тапу
  const currentChat = chats.find(c => c.jid === activeChat) || (isMobileW ? null : filteredChats[0]);

  // Автопрокрутка к последнему сообщению
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [currentChat?.jid, currentChat?.msgs?.length, tab]);

  const fmtT = (iso) => { try { return format(new Date(iso), 'HH:mm', { locale: ru }); } catch { return ''; } };
  const dayLabel = (iso) => {
    try {
      const d = new Date(iso);
      const sameDay = (a, b) => a.toDateString() === b.toDateString();
      if (sameDay(d, new Date())) return 'Сегодня';
      if (sameDay(d, new Date(Date.now() - 86400000))) return 'Вчера';
      return format(d, 'd MMMM', { locale: ru });
    } catch { return ''; }
  };

  const connected = st.status === 'connected';

  return (
    <div className={embedded ? undefined : 'animate-fade'} style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: embedded ? 0 : 40, maxWidth: embedded ? undefined : 900, margin: embedded ? undefined : '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(37,211,102,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={20} style={{ color: '#25D366' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>WhatsApp</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Переписки клубов · аналитика · время ответа</p>
          </div>
        </div>
        )}
        {(isChef || !CLUBS.includes(userClub)) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CLUBS.map(club => (
              <button key={club} onClick={() => { setActiveClub(club); setActiveChat(null); }} style={{
                padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: '1px solid ' + (activeClub === club ? 'var(--accent-purple)' : 'var(--border)'),
                background: activeClub === club ? 'var(--accent-purple)' : 'transparent',
                color: activeClub === club ? '#fff' : (bridge[club]?.status === 'connected' ? '#25D366' : 'var(--text-muted)'),
              }}>{club}{bridge[club]?.status === 'connected' ? ' ✓' : ''}</button>
            ))}
          </div>
        )}
      </div>

      {/* Мост офлайн */}
      {!bridgeAlive && (
        <Card style={{ border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <WifiOff size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>
            Служба моста не отвечает — компьютер Sales5 выключен или служба остановлена. Сообщения сейчас не собираются.
          </span>
        </Card>
      )}

      {/* ── Подключение номера ── */}
      {!connected && (
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
          {st.status === 'awaiting_qr' && st.qrDataUrl ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>Сканируйте с телефона клуба {activeClub}</div>
              <img src={st.qrDataUrl} alt="QR" style={{ width: 260, height: 260, borderRadius: 16, background: '#fff', padding: 8 }} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.6, maxWidth: 360 }}>
                WhatsApp → Настройки → <b>Связанные устройства</b> → <b>Привязка устройства</b> → наведите камеру.
                QR обновляется сам. Если истечёт — нажмите «Подключить» ещё раз.
              </div>
            </>
          ) : st.status === 'starting' ? (
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Готовлю QR-код… (5–10 секунд)</div>
          ) : st.status === 'reconnecting' ? (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>Переподключаюсь к номеру…</div>
          ) : (
            <>
              <Smartphone size={36} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>Номер клуба {activeClub} не подключён</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, maxWidth: 380, lineHeight: 1.6 }}>
                Нажмите кнопку — на этой странице появится QR-код. Отсканируйте его с корпоративного телефона клуба, и переписки начнут собираться автоматически.
              </div>
              {canManage && bridgeAlive && (
                <button onClick={requestConnect} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '13px 24px', borderRadius: 14,
                  border: 'none', background: '#25D366', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(37,211,102,0.3)',
                }}>
                  <QrCode size={17} /> Подключить номер
                </button>
              )}
            </>
          )}
        </Card>
      )}

      {connected && (
        <Card style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid rgba(37,211,102,0.35)', background: 'rgba(37,211,102,0.05)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#25D366', boxShadow: '0 0 8px #25D366', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
            {activeClub} подключён · +{st.phone}
          </span>
          {isChef && (
            <button onClick={requestDisconnect} title="Отключить номер" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              <Power size={12} /> Отключить
            </button>
          )}
        </Card>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['day', '🌤 День'], ['report', '📊 Отчёт ИИ'], ['live', `💬 Лента (${chats.length})`]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '8px 16px', borderRadius: 12, fontSize: 12, fontWeight: 800, cursor: 'pointer',
            border: '1px solid ' + (tab === id ? 'var(--accent-purple)' : 'var(--border)'),
            background: tab === id ? 'var(--accent-purple)' : 'transparent',
            color: tab === id ? '#fff' : 'var(--text-muted)',
          }}>{label}</button>
        ))}
      </div>

      {/* ═══ ДЕНЬ (реальные данные) ═══ */}
      {tab === 'day' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Stat label="Обращений сегодня" value={dayStats.total} />
            <Stat label="Ждут ответа" value={dayStats.waiting.length} color={dayStats.waiting.length ? '#ef4444' : '#22c55e'} />
            <Stat label="Отвечено" value={dayStats.answered} color="#22c55e" />
            <Stat label="Средний ответ" value={dayStats.medianReply != null ? `${dayStats.medianReply} мин` : '—'} color="#f59e0b" />
          </div>
          {dayStats.waiting.length > 0 && (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <AlertTriangle size={14} style={{ color: '#ef4444' }} />
                <span style={{ fontSize: 11, fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ждут ответа прямо сейчас</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dayStats.waiting.map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: w.waitMin > 30 ? 'rgba(239,68,68,0.06)' : 'var(--bg-hover)', border: `1px solid ${w.waitMin > 30 ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{w.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.text}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 900, color: w.waitMin > 30 ? '#ef4444' : '#f59e0b', whiteSpace: 'nowrap' }}>
                      <Clock size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> {w.waitMin} мин
                    </span>
                    <button
                      onClick={() => dismissWaiting(w)}
                      title="Диалог завершён — ответ не нужен"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 9, border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.08)', color: '#22c55e', fontSize: 10, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      ✓ Завершено
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {/* Темы дня от ИИ — обновляются каждые ~2 часа */}
          {clubReport && clubReport.day === todayStr && (clubReport.topics || []).length > 0 && (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>С чем обращаются сегодня</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#25D366', background: 'rgba(37,211,102,0.1)', padding: '2px 8px', borderRadius: 6 }}>
                  ИИ · обновлено {(clubReport.generatedAtISO || '').slice(11, 16)} UTC
                </span>
              </div>
              {clubReport.topics.map(t => {
                const maxN = Math.max(1, ...clubReport.topics.map(x => Number(x.count) || 0));
                return (
                  <div key={String(t.topic)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                    <span style={{ width: 170, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{String(t.topic || '')}</span>
                    <div style={{ flex: 1, height: 8, background: 'var(--bg-hover)', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${(t.count / maxN) * 100}%`, height: '100%', background: '#25D366', borderRadius: 6 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-primary)', width: 24, textAlign: 'right' }}>{t.count}</span>
                  </div>
                );
              })}
            </Card>
          )}
          {dayStats.total === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
              {connected ? 'Сегодня обращений пока не было' : 'Подключите номер клуба — статистика начнёт собираться автоматически'}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
            Темы и разбор обновляются ИИ в течение дня каждые ~2 часа (8:00–23:00) · вечером в 23:05 — финальный итог с push-уведомлением
          </div>
        </div>
      )}

      {/* ═══ ОТЧЁТ ИИ ═══ */}
      {tab === 'report' && (
        clubReport ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              ✅ Отчёт ИИ · {activeClub} · за {clubReport.day}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Stat label="Диалогов" value={clubReport.stats?.totalDialogs ?? 0} />
              <Stat label="Отвечено" value={clubReport.stats?.answered ?? 0} color="#22c55e" />
              <Stat label="Без ответа" value={clubReport.stats?.unanswered ?? 0} color="#ef4444" />
              <Stat label="Средний ответ" value={`${clubReport.stats?.avgReplyMin ?? '—'} мин`} color="#f59e0b" />
            </div>
            {(clubReport.topics || []).length > 0 && (
              <Card>
                <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Темы обращений</div>
                {(clubReport.topics || []).map(t => {
                  const maxN = Math.max(1, ...clubReport.topics.map(x => Number(x.count) || 0));
                  return (
                    <div key={String(t.topic)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                      <span style={{ width: 180, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{String(t.topic || '')}</span>
                      <div style={{ flex: 1, height: 8, background: 'var(--bg-hover)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${(t.count / maxN) * 100}%`, height: '100%', background: 'var(--accent-purple)', borderRadius: 6 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-primary)', width: 24, textAlign: 'right' }}>{t.count}</span>
                    </div>
                  );
                })}
              </Card>
            )}
            {(clubReport.alerts || []).length > 0 && (
              <Card style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <AlertTriangle size={14} style={{ color: '#ef4444' }} />
                  <span style={{ fontSize: 11, fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ИИ обратил внимание</span>
                </div>
                {clubReport.alerts.map((a, i) => {
                  // ИИ может прислать строку или объект — показываем безопасно
                  const text = typeof a === 'string' ? a : (a?.note || a?.text || [a?.chatName, a?.type].filter(Boolean).join(' · ') || '');
                  return (
                    <div key={i} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', padding: '6px 0', lineHeight: 1.5 }}>• {text}</div>
                  );
                })}
              </Card>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '50px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, lineHeight: 1.7 }}>
            <FileText size={32} style={{ opacity: 0.4, marginBottom: 8 }} /><br />
            Отчётов по {activeClub} пока нет.<br />
            ИИ разбирает переписки каждый вечер в 23:05 — первый отчёт появится после первого дня работы с подключённым номером.
          </div>
        )
      )}

      {/* ═══ ЛЕНТА ═══ */}
      {tab === 'live' && (
        clubMessages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
            Личных сообщений пока нет
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobileW ? '1fr' : 'minmax(230px, 300px) 1fr',
            gap: 0,
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden',
            height: isMobileW ? 560 : 580,
          }}>
            {/* ── Список чатов ── */}
            {(!isMobileW || !currentChat) && (
              <div style={{ display: 'flex', flexDirection: 'column', borderRight: isMobileW ? 'none' : '1px solid var(--border)', minHeight: 0 }}>
                <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      value={chatQuery}
                      onChange={e => setChatQuery(e.target.value)}
                      placeholder="Поиск по имени или номеру…"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 32px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, outline: 'none' }}
                    />
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  {filteredChats.length === 0 && (
                    <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Ничего не найдено</div>
                  )}
                  {filteredChats.map(c => {
                    const active = !isMobileW && currentChat?.jid === c.jid;
                    return (
                      <button key={c.jid} onClick={() => setActiveChat(c.jid)} style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                        padding: '11px 14px', border: 'none', cursor: 'pointer',
                        background: active ? 'rgba(37,211,102,0.09)' : 'transparent',
                        borderLeft: `3px solid ${active ? '#25D366' : 'transparent'}`,
                        borderBottom: '1px solid var(--border)',
                      }}>
                        <Avatar name={c.title} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: c.waiting ? '#f59e0b' : 'var(--text-muted)', flexShrink: 0 }}>{fmtT(c.last?.timestampISO)}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                            <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.last?.direction === 'out' ? 'Вы: ' : ''}{c.last?.text || '📎 вложение'}
                            </span>
                            {c.waiting && (
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.7)', flexShrink: 0 }} title="Ждёт ответа" />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Диалог ── */}
            {currentChat && (
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* Шапка диалога */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                  {isMobileW && (
                    <button onClick={() => setActiveChat(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
                      <ArrowLeft size={18} />
                    </button>
                  )}
                  <Avatar name={currentChat.title} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentChat.title}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>{currentChat.msgs.length} сообщений</div>
                  </div>
                  <a
                    href={`https://wa.me/${currentChat.phone}`}
                    target="_blank" rel="noopener noreferrer"
                    title="Открыть в WhatsApp"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 10, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366', fontSize: 11, fontWeight: 800, textDecoration: 'none', flexShrink: 0 }}
                  >
                    <Phone size={11} /> +{currentChat.phone}
                  </a>
                </div>

                {/* Сообщения */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
                  {currentChat.msgs.map((m, i, arr) => {
                    const prev = arr[i - 1];
                    const newDay = !prev || dayLabel(prev.timestampISO) !== dayLabel(m.timestampISO);
                    const out = m.direction === 'out';
                    return (
                      <React.Fragment key={m.id}>
                        {newDay && (
                          <div style={{ alignSelf: 'center', margin: '8px 0 4px', padding: '4px 14px', borderRadius: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {dayLabel(m.timestampISO)}
                          </div>
                        )}
                        <div style={{
                          alignSelf: out ? 'flex-end' : 'flex-start',
                          maxWidth: '72%',
                          background: out ? 'linear-gradient(135deg, #1fa855, #25D366)' : 'var(--bg-hover)',
                          border: out ? 'none' : '1px solid var(--border)',
                          borderRadius: out ? '16px 16px 5px 16px' : '16px 16px 16px 5px',
                          padding: '8px 13px',
                          boxShadow: out ? '0 2px 8px rgba(37,211,102,0.25)' : '0 1px 4px rgba(0,0,0,0.06)',
                        }}>
                          <div style={{ fontSize: 13, color: out ? '#fff' : 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {m.text || '📎 вложение'}
                          </div>
                          <div style={{ fontSize: 9, color: out ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)', fontWeight: 700, textAlign: 'right', marginTop: 3 }}>
                            {fmtT(m.timestampISO)}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </div>
            )}

            {/* Пусто справа на десктопе, если чатов нет после фильтра */}
            {!currentChat && !isMobileW && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
                Выберите переписку слева
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};

export default WaDemoPage;
