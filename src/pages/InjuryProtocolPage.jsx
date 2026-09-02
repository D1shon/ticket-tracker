import React, { useState, useEffect } from 'react';
import { ShieldAlert, ChevronDown, Loader2, Phone, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

// Регламент действий при травматичных случаях — отдельная страница (пункт меню).
// Статьи лежат в guidebook с section='Injury Protocol' (ids injury_1..6) —
// контент правится в базе, страница только отображает.
const InjuryProtocolPage = () => {
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState('injury_1');

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'guidebook'), where('section', '==', 'Injury Protocol')));
        const list = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
        list.sort((a, b) => {
          const na = parseInt((a.title.match(/^\d+/) || [999])[0], 10);
          const nb = parseInt((b.title.match(/^\d+/) || [999])[0], 10);
          return na - nb;
        });
        setArticles(list);
      } catch (e) { console.error('[injury-protocol]', e); }
      finally { setLoading(false); }
    })();
  }, []);

  const renderBlock = (b, i) => {
    if (b.type === 'header') return <h3 key={i} style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', margin: '18px 0 8px' }}>{b.text}</h3>;
    if (b.type === 'sub_header') return <h4 key={i} style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)', margin: '14px 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{b.text}</h4>;
    if (b.type === 'sub_sub_header') return <h5 key={i} style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-secondary)', margin: '12px 0 4px' }}>{b.text}</h5>;
    if (b.type === 'bulleted_list' || b.type === 'numbered_list') return (
      <div key={i} style={{ display: 'flex', gap: 9, margin: '6px 0 0 2px', alignItems: 'flex-start' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#B06A6A', flexShrink: 0, marginTop: 8 }} />
        <span style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6, minWidth: 0 }}>{b.text}</span>
      </div>
    );
    return <p key={i} style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6, margin: '8px 0 0' }}>{b.text}</p>;
  };

  return (
    <div className="animate-fade" style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 30 }}>
      {/* Шторки-переключатели: Гайдбук ↔ Регламент при травмах (как в шапке Гайдбука) */}
      <div style={{ background: 'linear-gradient(135deg, rgba(176,106,106,0.06) 0%, rgba(176,106,106,0.01) 100%)', border: '1px solid var(--border)', borderRadius: 24, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/guidebook')}
            className="text-xl font-black italic flex items-center gap-2"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', margin: 0, padding: 0, opacity: 0.65, transition: '0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = 0.65; e.currentTarget.style.color = 'var(--text-muted)'; }}
            title="Открыть гайдбук"
          >
            <span style={{ color: 'var(--accent-purple)' }}>
              <BookOpen size={22} strokeWidth={2.5} />
            </span>
            ГАЙДБУК АДМИНИСТРАТОРА
          </button>
          <h1 className="text-xl font-black italic flex items-center gap-2" style={{ color: 'var(--text-primary)', margin: 0 }}>
            <span style={{ color: '#B06A6A' }}>
              <ShieldAlert size={22} strokeWidth={2.5} />
            </span>
            РЕГЛАМЕНТ ПРИ ТРАВМАХ
          </h1>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>
          🚑 действия команды студии при получении травмы атлетом во время тренировки
        </p>
      </div>

      {/* Экстренная шпаргалка — всегда на виду */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(176,106,106,0.08)', border: '1px solid rgba(176,106,106,0.3)', borderRadius: 14, padding: '12px 16px' }}>
        <Phone size={18} style={{ color: '#B06A6A', flexShrink: 0 }} />
        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
          <b>Тяжёлое состояние?</b> Первый шаг — немедленно <b>103</b>. Не перемещать атлета при подозрении на перелом или травму головы. Не признавать вину, не ставить диагнозы, не обсуждать деньги.
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', padding: 30, justifyContent: 'center' }}>
          <Loader2 size={16} className="animate-spin" /> Загрузка регламента…
        </div>
      ) : articles.map(a => {
        const open = openId === a.id;
        return (
          <div key={a._docId} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <button
              onClick={() => setOpenId(open ? null : a.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)', flex: 1, minWidth: 0 }}>{a.title}</span>
              <ChevronDown size={16} style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s', flexShrink: 0 }} />
            </button>
            {open && (
              <div style={{ padding: '0 18px 18px' }}>
                {(a.blocks || []).map(renderBlock)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default InjuryProtocolPage;
