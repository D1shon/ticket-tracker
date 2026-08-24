import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Loader2, AlertTriangle, MessageSquare, Users, TrendingUp, ChevronDown } from 'lucide-react';

// Аналитика вопросов к помощнику (логи assistant_queries) — видно, о чём чаще
// спрашивают и где пробелы в гайдбуке (вопросы без нормального ответа).
const RU_STOP = new Set(['как', 'что', 'где', 'это', 'для', 'при', 'или', 'кто', 'чем', 'так', 'вот', 'мне', 'нам', 'все', 'нужно', 'можно', 'если', 'быть', 'есть', 'меня', 'тебя', 'него', 'the', 'and', 'you', 'for', 'мой', 'моя']);
const tokenize = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length >= 4 && !RU_STOP.has(w));
const isGap = (a) => /давай работать|не удалось|переформулируйте|не подключён|лимит бесплатных|нет связи|не сформулировать/i.test(a || '');
const fmt = (iso) => { try { return new Date(new Date(iso).getTime() + 5 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' '); } catch { return ''; } };

const AssistantInsights = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'assistant_queries'));
        const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        arr.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
        setRows(arr);
      } catch (e) { console.error('[assistant_queries]', e); }
      finally { setLoading(false); }
    })();
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const last7 = rows.filter(r => (r.createdAtISO || '') >= weekAgo).length;
    const users = new Set(rows.map(r => (r.askedByEmail || '').toLowerCase()).filter(Boolean)).size;
    const gaps = rows.filter(r => isGap(r.answer));
    const freq = {};
    rows.forEach(r => tokenize(r.question).forEach(w => { freq[w] = (freq[w] || 0) + 1; }));
    const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 18).filter(([, n]) => n >= 2);
    return { total, last7, users, gaps, topWords };
  }, [rows]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', padding: '40px 0', justifyContent: 'center' }}>
      <Loader2 size={18} className="hj-spin" /> Загружаю аналитику…
    </div>
  );

  const card = { flex: 1, minWidth: 120, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingBottom: 12 }}>
      {rows.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0', fontSize: 14 }}>
          Пока никто не задавал вопросов помощнику. Как появятся — здесь будет видно, о чём чаще спрашивают.
        </div>
      ) : (
        <>
          {/* Сводка */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={card}><div style={{ fontSize: 22, fontWeight: 950, color: 'var(--accent-purple)' }}>{stats.total}</div><div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Всего вопросов</div></div>
            <div style={card}><div style={{ fontSize: 22, fontWeight: 950, color: '#5F9C81' }}>{stats.last7}</div><div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>За 7 дней</div></div>
            <div style={card}><div style={{ fontSize: 22, fontWeight: 950, color: '#0ea5e9' }}>{stats.users}</div><div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Сотрудников</div></div>
            <div style={card}><div style={{ fontSize: 22, fontWeight: 950, color: stats.gaps.length ? '#B06A6A' : '#5F9C81' }}>{stats.gaps.length}</div><div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Пробелов</div></div>
          </div>

          {/* Популярные темы */}
          {stats.topWords.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                <TrendingUp size={14} style={{ color: 'var(--accent-purple)' }} /> Популярные темы
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {stats.topWords.map(([w, n]) => (
                  <span key={w} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 20, padding: '5px 11px' }}>
                    {w} <span style={{ color: 'var(--accent-purple)', fontWeight: 900 }}>{n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Пробелы: вопросы без нормального ответа */}
          {stats.gaps.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: '#B06A6A', marginBottom: 8 }}>
                <AlertTriangle size={14} /> Возможные пробелы ({stats.gaps.length}) — помощник не смог ответить
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stats.gaps.slice(0, 12).map(r => (
                  <div key={r.id} style={{ background: 'rgba(176,106,106,0.06)', border: '1px solid rgba(176,106,106,0.2)', borderRadius: 10, padding: '9px 12px', fontSize: 13, color: 'var(--text-primary)' }}>
                    {r.question}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>· {r.askedByName || 'сотрудник'}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Это подсказка, что добавить в гайдбук — тогда помощник начнёт на них отвечать.</div>
            </div>
          )}

          {/* Последние вопросы */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
              <MessageSquare size={14} style={{ color: 'var(--accent-purple)' }} /> Последние вопросы
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.slice(0, 60).map(r => (
                <div key={r.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <button onClick={() => setOpenId(openId === r.id ? null : r.id)} style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.question}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>
                        {r.askedByName || 'сотрудник'}{r.club ? ` · ${r.club}` : ''}{r.createdAtISO ? ` · ${fmt(r.createdAtISO)}` : ''}
                      </div>
                    </div>
                    <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: openId === r.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', marginTop: 2 }} />
                  </button>
                  {openId === r.id && (
                    <div style={{ padding: '0 12px 12px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      {r.answer || '—'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <style>{`@keyframes hj-spin-kf { to { transform: rotate(360deg); } } .hj-spin { animation: hj-spin-kf 1s linear infinite; }`}</style>
    </div>
  );
};

export default AssistantInsights;
