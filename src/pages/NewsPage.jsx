import React, { useState, useEffect } from 'react';
import { Newspaper, Send, Plus, Trash2, X } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

const NewsPage = () => {
  const { user } = useTickets();
  // Публиковать и удалять новости может только Дильшат (и Claude через базу)
  const canPost = (user?.email || '').toLowerCase() === 'dilshat.r@hj.fit';

  const [posts, setPosts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, 'news_posts'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.postedAtISO || '').localeCompare(a.postedAtISO || ''));
      setPosts(list);
    }, err => console.error('[news_posts]', err));
  }, []);

  // Отметить новости прочитанными — гасит зелёную точку в меню
  useEffect(() => {
    if (posts.length === 0) return;
    try {
      localStorage.setItem('hj_news_seen', posts[0].postedAtISO || new Date().toISOString());
      window.dispatchEvent(new Event('hj-news-seen'));
    } catch {}
  }, [posts]);

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'news_posts'), {
        text,
        source: 'manual',
        author: user?.displayName || '',
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

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680, margin: '0 auto', paddingBottom: 40 }}>

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

      {/* Feed */}
      {posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
          Новостей пока нет
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {posts.map(p => (
            <div key={p.id} style={{
              background: 'var(--bg-card)', borderRadius: 16, padding: '16px 18px',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${p.source === 'telegram' ? '#2AABEE' : 'var(--accent-purple)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 900, padding: '3px 9px', borderRadius: 7,
                  background: p.source === 'telegram' ? 'rgba(42,171,238,0.12)' : 'rgba(139,92,246,0.12)',
                  color: p.source === 'telegram' ? '#2AABEE' : 'var(--accent-purple)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {p.source === 'telegram' ? <><Send size={9} /> Telegram</> : `HJ Track${p.author ? ` · ${p.author}` : ''}`}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>{fmtDate(p.postedAtISO)}</span>
                {canPost && (
                  <button onClick={() => handleDelete(p)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0, opacity: 0.4 }}
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
  );
};

export default NewsPage;
