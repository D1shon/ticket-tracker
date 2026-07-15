import React, { useState, useEffect, useMemo } from 'react';
import { MessageCircle, Users, User, Activity, FileText, AlertTriangle, Clock, Smartphone, QrCode, Power, WifiOff } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA'];

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
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

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

  const clubMessages = useMemo(() => messages.filter(m => m.club === activeClub), [messages, activeClub]);

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
        waiting.push({
          name: last.chatName || last.chatJid.split('@')[0],
          text: last.text || '📎 вложение',
          waitMin: Math.max(0, Math.round((now - new Date(last.timestampISO)) / 60000)),
        });
      }
    });
    replies.sort((a, b) => a - b);
    const median = replies.length ? replies[Math.floor(replies.length / 2)] : null;
    waiting.sort((a, b) => b.waitMin - a.waitMin);
    return { total: dialogs.length, answered, waiting, medianReply: median, msgsCount: today.length };
  }, [clubMessages, now]);

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
      if (!byChat[m.chatJid]) byChat[m.chatJid] = { jid: m.chatJid, isGroup: m.isGroup, names: new Set(), msgs: [] };
      if (m.chatName && m.direction === 'in') byChat[m.chatJid].names.add(m.chatName);
      byChat[m.chatJid].msgs.push(m);
    });
    return Object.values(byChat).sort((a, b) =>
      (b.msgs[b.msgs.length - 1]?.timestampISO || '').localeCompare(a.msgs[a.msgs.length - 1]?.timestampISO || '')
    );
  }, [clubMessages]);
  const currentChat = chats.find(c => c.jid === activeChat) || chats[0];
  const fmtT = (iso) => { try { return format(new Date(iso), 'HH:mm', { locale: ru }); } catch { return ''; } };

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
        {[['day', '🌤 День'], ['report', '📊 Отчёт ИИ'], ['live', `Лента (${clubMessages.length})`]].map(([id, label]) => (
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
            Сообщений пока нет
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 260px) 1fr', gap: 12, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' }}>
              {chats.map(c => {
                const last = c.msgs[c.msgs.length - 1];
                const title = c.isGroup ? '👥 Группа' : ([...c.names][0] || c.jid.split('@')[0]);
                const active = currentChat?.jid === c.jid;
                return (
                  <button key={c.jid} onClick={() => setActiveChat(c.jid)} style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                    border: '1px solid ' + (active ? '#25D366' : 'var(--border)'),
                    background: active ? 'rgba(37,211,102,0.08)' : 'var(--bg-card)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {c.isGroup ? <Users size={11} /> : <User size={11} />} {title}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {last?.text || '📎 вложение'}
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 300, maxHeight: 520, overflowY: 'auto' }}>
              {(currentChat?.msgs || []).map(m => (
                <div key={m.id} style={{
                  alignSelf: m.direction === 'out' ? 'flex-end' : 'flex-start',
                  maxWidth: '75%',
                  background: m.direction === 'out' ? 'rgba(37,211,102,0.15)' : 'var(--bg-hover)',
                  border: `1px solid ${m.direction === 'out' ? 'rgba(37,211,102,0.3)' : 'var(--border)'}`,
                  borderRadius: m.direction === 'out' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  padding: '8px 12px',
                }}>
                  {m.direction === 'in' && m.chatName && (
                    <div style={{ fontSize: 9, fontWeight: 800, color: '#25D366', marginBottom: 2 }}>{m.chatName}</div>
                  )}
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                    {m.text || '📎 вложение'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right', marginTop: 3 }}>{fmtT(m.timestampISO)}</div>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default WaDemoPage;
