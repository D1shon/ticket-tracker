import React, { useState, useEffect, useRef } from 'react';
import { Newspaper, Send, Plus, Trash2, X, Eye, Check } from 'lucide-react';
import { useTickets, USER_ROLES } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

const NewsPage = () => {
  const { user } = useTickets();
  // Публиковать и удалять новости может только Дильшат (и Claude через базу)
  const canPost = (user?.email || '').toLowerCase() === 'dilshat.r@hj.fit';
  // Окошко «Менеджерам» видят только менеджеры и шефы
  const canSeeManagers = user?.role === 'manager' || user?.role === 'chef';
  // Окошко «Отдел продаж» — Ком-Дир, РОПы и шефы
  const canSeeSales = user?.role === 'komdir' || user?.role === 'rop' || user?.role === 'chef';
  // Панель «кто посмотрел» — шефы (вся сеть) и менеджеры (только свой клуб)
  const canSeeViews = user?.role === 'chef' || user?.role === 'manager';

  const [posts, setPosts] = useState([]);
  const [audienceTab, setAudienceTab] = useState('all'); // 'all' | 'managers'
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState('');
  const [newAudience, setNewAudience] = useState('all');
  const [saving, setSaving] = useState(false);
  // Просмотры (только для Дильшата): news_seen/{email} → { lastSeenISO, name, role, club }
  const [seenMap, setSeenMap] = useState({});
  const [viewPostId, setViewPostId] = useState(null);
  const [isWide, setIsWide] = useState(() => window.innerWidth > 1080);
  const lastSeenWrittenRef = useRef('');

  useEffect(() => {
    const handler = () => setIsWide(window.innerWidth > 1080);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    if (!canSeeViews) return;
    return onSnapshot(collection(db, 'news_seen'), snap => {
      const m = {};
      snap.docs.forEach(d => { m[(d.id || '').toLowerCase()] = d.data(); });
      setSeenMap(m);
    }, err => console.error('[news_seen]', err));
  }, [canSeeViews]);

  useEffect(() => {
    return onSnapshot(collection(db, 'news_posts'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.postedAtISO || '').localeCompare(a.postedAtISO || ''));
      setPosts(list);
    }, err => console.error('[news_posts]', err));
  }, []);

  // Посты, доступные этой роли
  const visiblePosts = posts.filter(p =>
    (p.audience !== 'managers' || canSeeManagers) &&
    (p.audience !== 'sales' || canSeeSales)
  );
  const generalPosts = visiblePosts.filter(p => p.audience !== 'managers' && p.audience !== 'sales');
  const managerPosts = visiblePosts.filter(p => p.audience === 'managers');
  const salesPosts   = visiblePosts.filter(p => p.audience === 'sales');
  const shownPosts = canSeeManagers && audienceTab === 'managers' ? managerPosts
    : canSeeSales && audienceTab === 'sales' ? salesPosts
    : generalPosts;

  // Отметить новости прочитанными — гасит зелёную точку в меню
  // и фиксирует просмотр в облаке (для панели «кто посмотрел» у Дильшата)
  useEffect(() => {
    if (visiblePosts.length === 0) return;
    const newest = visiblePosts[0].postedAtISO || new Date().toISOString();
    try {
      localStorage.setItem('hj_news_seen', newest);
      window.dispatchEvent(new Event('hj-news-seen'));
    } catch {}
    const email = (user?.email || '').toLowerCase().trim();
    if (!email || lastSeenWrittenRef.current === newest) return;
    lastSeenWrittenRef.current = newest;
    setDoc(doc(db, 'news_seen', email), {
      email,
      name: user?.displayName || '',
      role: user?.role || '',
      club: user?.club || null,
      lastSeenISO: newest,
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
  }, [posts]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'news_posts'), {
        text,
        source: 'manual',
        author: user?.displayName || '',
        audience: newAudience,
        postedAtISO: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
      setNewText('');
      setShowAdd(false);
      toast.success('Новость опубликована');
    } catch (e) {
      toast.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post) => {
    if (!window.confirm('Удалить новость?')) return;
    try { await deleteDoc(doc(db, 'news_posts', post.id)); } catch { toast.error('Не удалось удалить'); }
  };

  const fmtDate = (iso) => {
    try { return format(new Date(iso), 'd MMMM yyyy, HH:mm', { locale: ru }); } catch { return ''; }
  };

  // ── Панель «кто посмотрел» (видит только Дильшат) ─────────────────────────
  const NEWS_ROLES = ['chef', 'manager', 'admin', 'viewer', 'komdir', 'rop']; // роли с доступом к /news
  const myClub = (user?.club || '').toUpperCase();
  const readersFor = (post) => {
    const out = [];
    for (const [email, p] of Object.entries(USER_ROLES)) {
      if (!email.includes('@')) continue;                 // легаси-логины без почты
      if (email === 'dilshat.r@hj.fit') continue;         // автор не считается
      if (email === (user?.email || '').toLowerCase()) continue; // себя не показываем
      if (!NEWS_ROLES.includes(p.role)) continue;
      if (post.audience === 'managers' && p.role !== 'manager' && p.role !== 'chef') continue;
      if (post.audience === 'sales' && p.role !== 'komdir' && p.role !== 'rop' && p.role !== 'chef') continue;
      // Менеджер видит просмотры только своего клуба
      if (user?.role === 'manager' && (p.club || '').toUpperCase() !== myClub) continue;
      const seenISO = seenMap[email]?.lastSeenISO || '';
      out.push({
        email,
        name: seenMap[email]?.name || p.displayName || email.split('@')[0],
        role: p.role,
        club: p.club,
        seen: !!seenISO && seenISO >= (post.postedAtISO || ''),
      });
    }
    out.sort((a, b) => (b.seen - a.seen) || a.name.localeCompare(b.name, 'ru'));
    return out;
  };
  const viewPost = canSeeViews ? (shownPosts.find(p => p.id === viewPostId) || shownPosts[0] || null) : null;
  const viewReaders = viewPost ? readersFor(viewPost) : [];
  const viewSeenCount = viewReaders.filter(r => r.seen).length;

  const renderReaders = (rs) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rs.map(r => (
        <div key={r.email} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 10,
          background: r.seen ? 'rgba(34,197,94,0.07)' : 'transparent',
          border: '1px solid ' + (r.seen ? 'rgba(34,197,94,0.18)' : 'var(--border)'),
        }}>
          {r.seen
            ? <Check size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
            : <Eye size={12} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }} />}
          <span style={{ fontSize: 12, fontWeight: 700, color: r.seen ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
            {r.club || (r.role === 'chef' ? 'шеф' : r.role === 'viewer' ? 'наблюд.' : r.role)}
          </span>
        </div>
      ))}
    </div>
  );

  const readersPanelBody = viewPost && (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Eye size={14} style={{ color: 'var(--accent-purple)' }} />
        <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)' }}>Просмотры</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: viewSeenCount === viewReaders.length ? '#22c55e' : 'var(--text-muted)' }}>
          {viewSeenCount}/{viewReaders.length}
        </span>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.45 }}>
        {fmtDate(viewPost.postedAtISO)}<br />«{(viewPost.text || '').slice(0, 70)}{(viewPost.text || '').length > 70 ? '…' : ''}»
      </div>
      {renderReaders(viewReaders)}
    </>
  );

  return (
    <div className="animate-fade" style={{ display: 'flex', gap: 20, alignItems: 'flex-start', justifyContent: 'center', paddingBottom: 40 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680, flex: '1 1 680px', minWidth: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(79,142,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Newspaper size={20} style={{ color: '#4f8ef7' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Новости</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Обновления платформы и объявления</p>
          </div>
        </div>
        {canPost && (
          <button onClick={() => setShowAdd(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12,
            border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
          }}>
            <Plus size={14} /> Добавить
          </button>
        )}
      </div>

      {/* Окошки аудиторий: Общие / Менеджерам / Отдел продаж — по ролям */}
      {(canSeeManagers || canSeeSales) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            ['all', `Общие (${generalPosts.length})`],
            ...(canSeeManagers ? [['managers', `👔 Менеджерам (${managerPosts.length})`]] : []),
            ...(canSeeSales ? [['sales', `💼 Отдел продаж (${salesPosts.length})`]] : []),
          ].map(([id, label]) => (
            <button key={id} onClick={() => setAudienceTab(id)} style={{
              padding: '8px 16px', borderRadius: 12, fontSize: 12, fontWeight: 800, cursor: 'pointer',
              border: '1px solid ' + (audienceTab === id ? 'var(--accent-purple)' : 'var(--border)'),
              background: audienceTab === id ? 'var(--accent-purple)' : 'transparent',
              color: audienceTab === id ? '#fff' : 'var(--text-muted)',
            }}>{label}</button>
          ))}
        </div>
      )}

      {/* Feed */}
      {shownPosts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
          Новостей пока нет
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shownPosts.map(p => (
            <div key={p.id} style={{
              background: 'var(--bg-card)', borderRadius: 16, padding: '16px 18px',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${p.source === 'telegram' ? '#2AABEE' : p.source === 'release' ? '#22c55e' : 'var(--accent-purple)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 900, padding: '3px 9px', borderRadius: 7,
                  background: p.source === 'telegram' ? 'rgba(42,171,238,0.12)' : p.source === 'release' ? 'rgba(34,197,94,0.12)' : 'rgba(139,92,246,0.12)',
                  color: p.source === 'telegram' ? '#2AABEE' : p.source === 'release' ? '#22c55e' : 'var(--accent-purple)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {p.source === 'telegram' ? <><Send size={9} /> Telegram</>
                    : p.source === 'release' ? `🚀 Релиз${p.author && p.author !== 'Релиз' ? ` · ${p.author}` : ''}`
                    : `HJ Track${p.author ? ` · ${p.author}` : ''}`}
                </span>
                {p.audience === 'managers' && (
                  <span style={{ fontSize: 9, fontWeight: 900, padding: '3px 9px', borderRadius: 7, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    👔 Менеджерам
                  </span>
                )}
                {p.audience === 'sales' && (
                  <span style={{ fontSize: 9, fontWeight: 900, padding: '3px 9px', borderRadius: 7, background: 'rgba(14,165,233,0.12)', color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    💼 Отдел продаж
                  </span>
                )}
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>{fmtDate(p.postedAtISO)}</span>
                {canSeeViews && (() => {
                  const rs = readersFor(p);
                  const n = rs.filter(r => r.seen).length;
                  const active = isWide && viewPost?.id === p.id;
                  return (
                    <button
                      onClick={() => { if (isWide) setViewPostId(p.id); }}
                      title="Кто посмотрел"
                      style={{
                        marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 9px', borderRadius: 8, cursor: isWide ? 'pointer' : 'default',
                        border: '1px solid ' + (active ? 'var(--accent-purple)' : 'var(--border)'),
                        background: active ? 'rgba(139,92,246,0.10)' : 'transparent',
                        color: n === rs.length ? '#22c55e' : 'var(--text-muted)',
                        fontSize: 10, fontWeight: 800,
                      }}
                    >
                      <Eye size={11} /> {n}/{rs.length}
                    </button>
                  );
                })()}
                {canPost && (
                  <button onClick={() => handleDelete(p)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0, opacity: 0.4 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
                  ><Trash2 size={13} /></button>
                )}
              </div>
              {p.text && (
                <div style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{p.text}</div>
              )}
              {p.mediaNote && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 6 }}>{p.mediaNote}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add modal (chef) */}
      {showAdd && (
        <div onClick={() => !saving && setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--bg-card)', borderRadius: 20, border: '1px solid var(--border)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Новая новость</h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['all', '📢 Всем'], ['managers', '👔 Менеджерам'], ['sales', '💼 Отделу продаж']].map(([id, label]) => (
                <button key={id} onClick={() => setNewAudience(id)} style={{
                  flex: 1, padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: '1px solid ' + (newAudience === id ? 'var(--accent-purple)' : 'var(--border)'),
                  background: newAudience === id ? 'var(--accent-purple)' : 'transparent',
                  color: newAudience === id ? '#fff' : 'var(--text-muted)',
                }}>{label}</button>
              ))}
            </div>
            <textarea
              autoFocus
              rows={7}
              placeholder="Текст новости…"
              value={newText}
              onChange={e => setNewText(e.target.value)}
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontWeight: 500, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
            />
            <button
              onClick={handleAdd}
              disabled={saving || !newText.trim()}
              style={{ padding: '13px', borderRadius: 14, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: saving || !newText.trim() ? 0.5 : 1 }}
            >
              Опубликовать
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Правая панель просмотров — все шефы, только широкий экран */}
    {canSeeViews && isWide && viewPost && (
      <aside style={{
        width: 272, flex: '0 0 272px', position: 'sticky', top: 8,
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
        maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
      }}>
        {readersPanelBody}
      </aside>
    )}
    </div>
  );
};

export default NewsPage;
