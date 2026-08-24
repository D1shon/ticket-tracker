import React, { useState } from 'react';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useTickets } from '../../store/TicketContext';
import { FileBarChart2, X, Loader2, Sparkles, RefreshCw } from 'lucide-react';

// Кнопка «Отчёт за сегодня» — только для шефа. Отчёт готовит облачная рутина
// Claude (trig «HJ Track — отчёт за сегодня») каждые пару часов и кладёт в
// daily_reports/{дата}. Кнопка мгновенно показывает последний готовый отчёт.
const almatyDay = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
const almatyTime = (iso) => { try { return new Date(new Date(iso).getTime() + 5 * 3600 * 1000).toISOString().slice(11, 16); } catch { return ''; } };

// Кто видит отчёт: шеф + отдельные аккаунты по email (Сания, Анастасия)
const REPORT_EMAILS = ['saniya@hj.fit', '19.anastasiya.tkachenko.88@gmail.com'];

// Отчёт от рутины размечен маркерами [[Название]] перед каждым разделом —
// парсим в секции и рисуем карточками. Если маркеров нет (старый формат) — null.
const parseSections = (text) => {
  if (!text) return null;
  const matches = [...text.matchAll(/\[\[([^\]]+)\]\]/g)];
  if (matches.length === 0) return null;
  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const title = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (title || body) out.push({ title, body });
  }
  return out;
};
const sectionMeta = (title) => {
  const t = (title || '').toLowerCase();
  if (t.includes('итог') || t.includes('резюме') || t.includes('résumé') || t.includes('сводк')) return { icon: '📌', color: '#7D6FB3' };
  if (t.includes('заявк')) return { icon: '📋', color: '#5580A8' };
  if (t.includes('лид')) return { icon: '📥', color: '#0ea5e9' };
  if (t.includes('qr') || t.includes('отзыв')) return { icon: '⭐', color: '#C08F4F' };
  if (t.includes('чек')) return { icon: '🚪', color: '#5F9C81' };
  if (t.includes('whatsapp') || t.includes('ватсап')) return { icon: '💬', color: '#25D366' };
  if (t.includes('вниман') || t.includes('важн')) return { icon: '⚠️', color: '#B06A6A', warn: true };
  return { icon: '•', color: 'var(--text-muted)' };
};

const DailyReport = ({ compact = false }) => {
  const { user } = useTickets();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState('');
  const [genAt, setGenAt] = useState('');
  const [missing, setMissing] = useState(false);

  const allowed = user?.role === 'chef' || REPORT_EMAILS.includes((user?.email || '').toLowerCase());
  if (!allowed) return null;

  // Шеф видит общий отчёт по всем клубам; остальные (Сания/Анастасия) — только свой клуб
  const isChef = user?.role === 'chef';
  const clubKey = (user?.club || '').split(' ').join('');
  const reportId = isChef || !clubKey ? almatyDay() : `${almatyDay()}_${clubKey}`;

  const load = async () => {
    setLoading(true);
    setMissing(false);
    try {
      const snap = await getDoc(doc(db, 'daily_reports', reportId));
      if (snap.exists()) {
        const d = snap.data();
        setReport(d.report || '');
        setGenAt(d.generatedAtISO || '');
      } else {
        setReport('');
        setMissing(true);
      }
    } catch {
      setReport('');
      setMissing(true);
    } finally {
      setLoading(false);
    }
  };

  const openAndLoad = () => { setOpen(true); load(); };

  return (
    <>
      <button
        onClick={openAndLoad}
        className={compact ? undefined : 'nav-item'}
        style={compact
          ? { display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'rgba(125,111,179,0.12)', color: 'var(--accent-purple)', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }
          : { width: '100%', border: 'none', background: 'rgba(125,111,179,0.10)', textAlign: 'left', color: 'var(--accent-purple)', cursor: 'pointer', fontWeight: 800 }}
      >
        <FileBarChart2 size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
        <span>Отчёт за сегодня</span>
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#7D6FB3,#9b5de5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileBarChart2 size={17} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>
                  Отчёт за сегодня{isChef ? '' : ` · ${user?.club || ''}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                  {isChef ? 'все клубы' : 'ваш клуб'}{genAt ? ` · обновлён в ${almatyTime(genAt)}` : ''}
                </div>
              </div>
              <button onClick={load} disabled={loading} title="Обновить" style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RefreshCw size={15} className={loading ? 'hj-spin' : ''} />
              </button>
              <button onClick={() => setOpen(false)} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '18px', overflowY: 'auto' }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 14, padding: '24px 0', justifyContent: 'center' }}>
                  <Loader2 size={18} className="hj-spin" /> Загружаю отчёт…
                </div>
              ) : missing ? (
                <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, textAlign: 'center', padding: '20px 4px' }}>
                  Отчёт за сегодня ещё формируется.<br />Он обновляется автоматически каждые пару часов — загляните чуть позже или нажмите «Обновить».
                </div>
              ) : (() => {
                const sections = parseSections(report);
                return (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 11, fontWeight: 800, color: 'var(--accent-purple)' }}>
                      <Sparkles size={12} /> Помощник · отчёт
                    </div>
                    {sections ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {sections.map((s, i) => {
                          const m = sectionMeta(s.title);
                          return (
                            <div key={i} style={{ borderRadius: 12, border: '1px solid ' + (m.warn ? 'rgba(176,106,106,0.3)' : 'var(--border)'), background: m.warn ? 'rgba(176,106,106,0.06)' : 'var(--bg-hover)', overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderLeft: '3px solid ' + m.color, fontSize: 12.5, fontWeight: 900, color: m.warn ? '#B06A6A' : 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                <span style={{ fontSize: 14 }}>{m.icon}</span> {s.title}
                              </div>
                              {s.body && (
                                <div style={{ padding: '2px 12px 11px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{s.body}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{report}</div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
          <style>{`@keyframes hj-spin-kf { to { transform: rotate(360deg); } } .hj-spin { animation: hj-spin-kf 1s linear infinite; }`}</style>
        </div>
      )}
    </>
  );
};

export default DailyReport;
