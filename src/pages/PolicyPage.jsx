import React, { useState, useEffect } from 'react';
import { FileText, Search, ShieldCheck, Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const CLUBS = [
  { name: '4YOU',       color: '#4f8ef7' },
  { name: 'COLIBRI',    color: '#9b5de5' },
  { name: 'VILLA',      color: '#f59e0b' },
  { name: 'NURLY ORDA', color: '#22c55e' },
];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text, query) {
  if (!query.trim() || !text) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: '#ffe066', color: '#111', borderRadius: 2, padding: '0 2px' }}>{part}</mark>
      : part
  );
}

const PolicyPage = () => {
  const { user } = useTickets();
  const isChef = user?.role === 'chef';
  const userClubUpper = user?.club?.toUpperCase();

  const [activeTab, setActiveTab]         = useState('');
  const [docData, setDocData]             = useState({});   // { [clubName]: { sections, updatedAt } | null }
  const [searchQuery, setSearchQuery]     = useState('');
  const [isEditing, setIsEditing]         = useState(false);
  const [editSections, setEditSections]   = useState([]);
  const [saving, setSaving]               = useState(false);
  const [collapsed, setCollapsed]         = useState({});   // { [idx]: true } = collapsed

  // Initial tab
  useEffect(() => {
    if (isChef) {
      setActiveTab('4YOU');
    } else if (userClubUpper && CLUBS.find(c => c.name === userClubUpper)) {
      setActiveTab(userClubUpper);
    } else {
      setActiveTab('COLIBRI');
    }
  }, [userClubUpper, isChef]);

  // Load Firestore document for active club
  useEffect(() => {
    if (!activeTab) return;
    const unsub = onSnapshot(doc(db, 'policy_documents', activeTab), snap => {
      setDocData(prev => ({ ...prev, [activeTab]: snap.exists() ? snap.data() : null }));
    });
    return unsub;
  }, [activeTab]);

  const current    = docData[activeTab];
  const sections   = current?.sections || [];
  const activeClub = CLUBS.find(c => c.name === activeTab);

  const filteredSections = searchQuery.trim()
    ? sections.filter(s =>
        (s.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.body  || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sections;

  const startEdit = () => {
    setEditSections(sections.length ? JSON.parse(JSON.stringify(sections)) : [{ title: '', body: '' }]);
    setIsEditing(true);
  };

  const cancelEdit = () => { setIsEditing(false); setEditSections([]); };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'policy_documents', activeTab), {
        sections:   editSections.filter(s => (s.title || '').trim() || (s.body || '').trim()),
        updatedAt:  new Date(),
      });
      setIsEditing(false);
    } catch (e) {
      console.error('policy save error', e);
    }
    setSaving(false);
  };

  const switchTab = (name) => {
    setActiveTab(name);
    setIsEditing(false);
    setSearchQuery('');
    setCollapsed({});
  };

  const toggleCollapse = (i) => setCollapsed(prev => ({ ...prev, [i]: !prev[i] }));

  const updateSection = (i, field, val) =>
    setEditSections(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  const addSection    = () => setEditSections(prev => [...prev, { title: '', body: '' }]);
  const removeSection = (i) => setEditSections(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div className="animate-fade" style={{ maxWidth: 900, margin: '0 auto', padding: '10px 0 40px 0' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <FileText size={24} color="var(--accent-purple)" />
            <h1 style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', letterSpacing: '-0.02em', textTransform: 'uppercase', margin: 0 }}>
              Соглашение
            </h1>
          </div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
            Пользовательские соглашения и оферты клубов
          </p>
        </div>

        {isChef && !isEditing && (
          <button
            onClick={startEdit}
            style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: '0.03em' }}
          >
            <Edit2 size={14} /> Редактировать
          </button>
        )}

        {isChef && isEditing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={cancelEdit}
              style={{ padding: '10px 18px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase' }}
            >
              <X size={14} /> Отмена
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', opacity: saving ? 0.7 : 1 }}
            >
              <Check size={14} /> {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        )}
      </div>

      {/* ── Club tabs (chefs only) ── */}
      {isChef && (
        <div style={{ display: 'flex', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 6, marginBottom: 20, overflowX: 'auto' }}>
          {CLUBS.map(club => {
            const active = activeTab === club.name;
            return (
              <button
                key={club.name}
                onClick={() => switchTab(club.name)}
                style={{ padding: '10px 20px', borderRadius: 12, border: 'none', background: active ? 'var(--bg-hover)' : 'transparent', color: active ? club.color : 'var(--text-muted)', fontSize: 12, fontWeight: active ? 900 : 700, cursor: 'pointer', transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}
              >
                {club.name}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Search bar (view mode only, when content exists) ── */}
      {!isEditing && sections.length > 0 && (
        <div style={{ marginBottom: 20, position: 'relative' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Поиск по соглашению..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '12px 16px 12px 42px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
          />
          {searchQuery && (
            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
              {filteredSections.length} раздел{filteredSections.length === 1 ? '' : filteredSections.length < 5 ? 'а' : 'ов'}
            </span>
          )}
        </div>
      )}

      {/* ══════════ VIEW MODE ══════════ */}
      {!isEditing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Club header card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <ShieldCheck size={20} color={activeClub?.color || 'var(--accent-purple)'} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Договор-Оферта · {activeTab}
              </div>
              {current?.updatedAt && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>
                  Обновлено: {new Date(
                    current.updatedAt?.seconds
                      ? current.updatedAt.seconds * 1000
                      : current.updatedAt
                  ).toLocaleDateString('ru-RU')}
                </div>
              )}
            </div>
          </div>

          {/* Empty state */}
          {sections.length === 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '48px 24px', textAlign: 'center' }}>
              <FileText size={40} color="var(--text-muted)" style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                Соглашение не добавлено
              </div>
              {isChef && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                  Нажмите «Редактировать» чтобы добавить текст соглашения
                </div>
              )}
            </div>
          )}

          {/* No search results */}
          {sections.length > 0 && filteredSections.length === 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '32px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
                Ничего не найдено по запросу «{searchQuery}»
              </div>
            </div>
          )}

          {/* Section accordion */}
          {filteredSections.map((section, i) => {
            const isOpen = !collapsed[i];
            return (
              <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden' }}>
                <button
                  onClick={() => toggleCollapse(i)}
                  style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 12, textAlign: 'left' }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.02em', flex: 1 }}>
                    {searchQuery
                      ? highlightText(section.title || `Раздел ${i + 1}`, searchQuery)
                      : (section.title || `Раздел ${i + 1}`)
                    }
                  </span>
                  {isOpen
                    ? <ChevronUp size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                    : <ChevronDown size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  }
                </button>
                {isOpen && section.body && (
                  <div style={{ padding: '0 20px 18px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75, whiteSpace: 'pre-wrap', paddingTop: 14 }}>
                      {searchQuery
                        ? highlightText(section.body, searchQuery)
                        : section.body
                      }
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════ EDIT MODE (chef only) ══════════ */}
      {isEditing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {editSections.map((section, i) => (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  Раздел {i + 1}
                </span>
                <input
                  type="text"
                  placeholder="Заголовок раздела"
                  value={section.title}
                  onChange={e => updateSection(i, 'title', e.target.value)}
                  style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, outline: 'none' }}
                />
                <button
                  onClick={() => removeSection(i)}
                  title="Удалить раздел"
                  style={{ padding: '9px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <textarea
                placeholder="Текст раздела..."
                value={section.body}
                onChange={e => updateSection(i, 'body', e.target.value)}
                rows={6}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.65, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>
          ))}

          <button
            onClick={addSection}
            style={{ padding: '14px', borderRadius: 16, border: '1px dashed var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}
          >
            <Plus size={14} /> Добавить раздел
          </button>
        </div>
      )}

    </div>
  );
};

export default PolicyPage;
