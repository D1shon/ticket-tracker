import React, { useState, useEffect, useMemo } from 'react';
import { Target, Phone, CheckCircle2, PhoneCall, MessageCircle, Clock, Plus, X, UserPlus } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { pushNotify } from '../lib/pushNotify';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE'];
const CLUB_COLORS = { '4YOU': '#4f8ef7', 'COLIBRI': '#9b5de5', 'VILLA': '#f59e0b', 'NURLY ORDA': '#22c55e', 'PROMENADE': '#14b8a6' };

const STATUS_META = {
  new:       { label: 'Новый',     color: '#4f8ef7' },
  accepted:  { label: 'Принято',   color: '#f59e0b' },
  contacted: { label: 'Связались', color: '#22c55e' },
};

// Лиды из WhatsApp: мост находит входящие про цены/абонементы/билеты
// и складывает их в sales_leads. Здесь Ком-Дир (и в будущем РОПы)
// отмечают «Принято» и «Связались».
const LeadsPage = () => {
  const { user } = useTickets();
  // Менеджеры, админы и РОПы видят лиды только своего клуба; Ком-Дир и шефы — все.
  // Обрабатывают лиды (Принято/Связались) — Ком-Дир, РОПы и шефы.
  const myClub = (user?.club || '').toUpperCase();
  const clubScoped = user?.role === 'manager' || user?.role === 'admin' || (user?.role === 'rop' && !!myClub);
  const canHandle = user?.role === 'chef' || user?.role === 'komdir' || user?.role === 'rop';

  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState('new'); // new | accepted | contacted | all
  const [clubFilter, setClubFilter] = useState('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ club: '', name: '', phone: '', text: '' });
  const [savingLead, setSavingLead] = useState(false);

  const submitLead = async () => {
    const name = addForm.name.trim();
    const text = addForm.text.trim();
    const club = clubScoped ? myClub : (addForm.club || CLUBS[0]);
    if (!name || !text) return;
    setSavingLead(true);
    try {
      await addDoc(collection(db, 'sales_leads'), {
        club,
        chatJid: null,
        chatName: name,
        phone: addForm.phone.replace(/[^\d]/g, '') || null,
        text: text.slice(0, 500),
        matched: null,
        source: 'manual',
        status: 'new',
        handledBy: null,
        handledAtISO: null,
        createdBy: user?.displayName || '',
        createdByEmail: user?.email || '',
        timestampISO: new Date().toISOString(),
        createdAtISO: new Date().toISOString(),
      });
      pushNotify({
        title: `💰 Новый лид · ${club}`,
        body: `👋 Живой визит: ${name} — ${text.slice(0, 80)}`,
        excludeEmail: user?.email || '',
        url: '/leads',
        club, // РОП чужого клуба пуш не получит (у Ком-Дира club=null — получит всё)
        roles: ['komdir', 'rop'],
      });
      setShowAdd(false);
      setAddForm({ club: '', name: '', phone: '', text: '' });
      toast.success('Лид передан отделу продаж');
    } catch {
      toast.error('Не удалось сохранить лид');
    } finally {
      setSavingLead(false);
    }
  };

  useEffect(() => {
    return onSnapshot(collection(db, 'sales_leads'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.timestampISO || '').localeCompare(a.timestampISO || ''));
      setLeads(list);
    }, err => console.error('[sales_leads]', err));
  }, []);

  const setStatus = async (lead, status) => {
    try {
      await updateDoc(doc(db, 'sales_leads', lead.id), {
        status,
        handledBy: user?.displayName || '',
        handledByEmail: user?.email || '',
        handledAtISO: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
      toast.success(status === 'accepted' ? 'Лид принят в работу' : 'Отмечено: связались');
    } catch {
      toast.error('Не удалось обновить статус');
    }
  };

  const scopedLeads = useMemo(
    () => leads.filter(l => !clubScoped || (l.club || '').toUpperCase() === myClub),
    [leads, clubScoped, myClub]
  );

  const counts = useMemo(() => ({
    new: scopedLeads.filter(l => l.status === 'new').length,
    accepted: scopedLeads.filter(l => l.status === 'accepted').length,
    contacted: scopedLeads.filter(l => l.status === 'contacted').length,
  }), [scopedLeads]);

  const visible = scopedLeads
    .filter(l => filter === 'all' || l.status === filter)
    .filter(l => clubScoped || clubFilter === 'ALL' || (l.club || '').toUpperCase() === clubFilter);

  const fmtDate = (iso) => {
    try { return format(new Date(iso), 'd MMMM, HH:mm', { locale: ru }); } catch { return ''; }
  };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, margin: '0 auto', paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(14,165,233,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Target size={20} style={{ color: '#0ea5e9' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Лиды</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Запросы о ценах и абонементах из WhatsApp</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {!clubScoped && ['ALL', ...CLUBS].map(c => (
            <button key={c} onClick={() => setClubFilter(c)} style={{
              padding: '6px 12px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              border: '1px solid ' + (clubFilter === c ? 'var(--accent-purple)' : 'var(--border)'),
              background: clubFilter === c ? 'var(--accent-purple)' : 'transparent',
              color: clubFilter === c ? '#fff' : 'var(--text-muted)',
            }}>{c === 'ALL' ? 'Все клубы' : c}</button>
          ))}
          <button onClick={() => { setAddForm({ club: clubScoped ? myClub : CLUBS[0], name: '', phone: '', text: '' }); setShowAdd(true); }} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12,
            border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
          }}>
            <Plus size={14} /> Добавить лид
          </button>
        </div>
      </div>

      {/* Status filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          ['new', `🔵 Новые (${counts.new})`],
          ['accepted', `🟠 Принято (${counts.accepted})`],
          ['contacted', `🟢 Связались (${counts.contacted})`],
          ['all', 'Все'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{
            padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: '1px solid ' + (filter === id ? 'var(--accent-purple)' : 'var(--border)'),
            background: filter === id ? 'var(--accent-purple)' : 'transparent',
            color: filter === id ? '#fff' : 'var(--text-muted)',
          }}>{label}</button>
        ))}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
          {leads.length === 0 ? 'Лидов пока нет — они появятся, когда клиенты напишут о ценах в WhatsApp клуба' : 'Нет лидов по выбранному фильтру'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(l => {
            const meta = STATUS_META[l.status] || STATUS_META.new;
            const clubColor = CLUB_COLORS[(l.club || '').toUpperCase()] || 'var(--accent-purple)';
            return (
              <div key={l.id} style={{
                background: 'var(--bg-card)', borderRadius: 16, padding: '14px 16px',
                border: '1px solid var(--border)', borderLeft: `3px solid ${meta.color}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: clubColor, background: `${clubColor}18`, padding: '3px 9px', borderRadius: 7 }}>{l.club}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{l.chatName || 'Без имени'}</span>
                  {l.source === 'manual' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 900, color: '#0ea5e9', background: 'rgba(14,165,233,0.1)', padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <UserPlus size={10} /> Живой визит{l.createdBy ? ` · ${l.createdBy}` : ''}
                    </span>
                  )}
                  {l.phone ? (
                    <a href={`https://wa.me/${l.phone}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#25D366', textDecoration: 'none' }}>
                      <Phone size={11} /> +{l.phone}
                    </a>
                  ) : l.source !== 'manual' && (
                    <span title="WhatsApp скрыл номер клиента (приватность). Ответьте в ленте WhatsApp клуба."
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#25D366' }}>
                      <MessageCircle size={11} /> WhatsApp · номер скрыт
                    </span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    <Clock size={10} /> {fmtDate(l.timestampISO)}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'var(--bg-hover)', marginBottom: 10 }}>
                  <MessageCircle size={13} style={{ color: '#25D366', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{l.text}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: meta.color, background: `${meta.color}15`, padding: '4px 10px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {meta.label}
                  </span>
                  {l.handledBy && l.status !== 'new' && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>
                      {l.handledBy} · {fmtDate(l.handledAtISO)}
                    </span>
                  )}
                  {canHandle && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {l.status === 'new' && (
                      <button onClick={() => setStatus(l, 'accepted')} style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 10,
                        border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.1)',
                        color: '#f59e0b', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                      }}>
                        <CheckCircle2 size={12} /> Принято
                      </button>
                    )}
                    {l.status !== 'contacted' && (
                      <button onClick={() => setStatus(l, 'contacted')} style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 10,
                        border: 'none', background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                      }}>
                        <PhoneCall size={12} /> Связались
                      </button>
                    )}
                  </div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модалка «живого» лида: админ/менеджер фиксирует визит потенциального клиента */}
      {showAdd && (
        <div onClick={() => !savingLead && setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: 'var(--bg-card)', borderRadius: 20, border: '1px solid var(--border)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserPlus size={16} style={{ color: '#0ea5e9' }} /> Новый лид
              </h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
              Потенциальный клиент подошёл вживую — запишите его, отдел продаж свяжется.
            </p>
            {!clubScoped && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CLUBS.map(c => (
                  <button key={c} onClick={() => setAddForm(f => ({ ...f, club: c }))} style={{
                    padding: '7px 12px', borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: 'pointer',
                    border: '1px solid ' + (addForm.club === c ? 'var(--accent-purple)' : 'var(--border)'),
                    background: addForm.club === c ? 'var(--accent-purple)' : 'transparent',
                    color: addForm.club === c ? '#fff' : 'var(--text-muted)',
                  }}>{c}</button>
                ))}
              </div>
            )}
            <input
              autoFocus
              placeholder="Имя клиента *"
              value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }}
            />
            <input
              placeholder="Телефон (например 77071234567)"
              value={addForm.phone}
              onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
              inputMode="tel"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }}
            />
            <textarea
              rows={3}
              placeholder="Что интересовало: абонемент, цены, пробное занятие… *"
              value={addForm.text}
              onChange={e => setAddForm(f => ({ ...f, text: e.target.value }))}
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontWeight: 500, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
            <button
              onClick={submitLead}
              disabled={savingLead || !addForm.name.trim() || !addForm.text.trim()}
              style={{ padding: '12px', borderRadius: 12, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: savingLead || !addForm.name.trim() || !addForm.text.trim() ? 0.5 : 1 }}
            >
              Передать отделу продаж
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadsPage;
