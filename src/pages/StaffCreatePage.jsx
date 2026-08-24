import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useTickets, USER_ROLES } from '../store/TicketContext';
import { canCreateStaff } from '../lib/access';
import { UserPlus, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

// Создание аккаунтов МОП. МОП = роль 'rop' с флагом mop:true — те же права, что
// у РОПа, но создавать аккаунты нельзя. Запись в app_users → сотрудник входит по
// email и сам придумывает пароль при первом входе.
const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const StaffCreatePage = () => {
  const { user } = useTickets();
  const isChef = user?.role === 'chef';
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [club, setClub] = useState(user?.club || '');
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    return onSnapshot(collection(db, 'app_users'), snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.mop);
      arr.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
      setRows(arr);
    }, err => console.error('[app_users]', err));
  }, []);

  const myClub = (user?.club || '').toUpperCase();
  const visibleRows = useMemo(
    () => isChef ? rows : rows.filter(r => (r.club || '').toUpperCase() === myClub),
    [rows, isChef, myClub]
  );

  if (!canCreateStaff(user)) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Нет доступа.</div>;
  }

  const create = async () => {
    const key = email.toLowerCase().trim();
    const nm = name.trim();
    const cl = isChef ? club : (user?.club || '');
    if (!emailRe.test(key)) { toast.error('Неверный email'); return; }
    if (!nm) { toast.error('Укажите имя'); return; }
    if (!cl) { toast.error('Выберите клуб'); return; }
    if (USER_ROLES[key]) { toast.error('Такой аккаунт уже существует'); return; }
    setSaving(true);
    try {
      await setDoc(doc(db, 'app_users', key), {
        email: key,
        role: 'rop',        // МОП получает права РОПа
        mop: true,          // но не может создавать аккаунты
        club: cl,
        displayName: nm,
        createdBy: user?.displayName || '',
        createdByEmail: (user?.email || '').toLowerCase(),
        createdAtISO: new Date().toISOString(),
        createdAt: serverTimestamp(),
      });
      toast.success('МОП создан. При первом входе он придумает пароль.');
      setEmail(''); setName('');
    } catch {
      toast.error('Не удалось создать аккаунт');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Удалить МОП ${r.displayName || r.email}? Доступ будет закрыт.`)) return;
    try { await deleteDoc(doc(db, 'app_users', r.id)); toast.success('Удалён'); }
    catch { toast.error('Не удалось удалить'); }
  };

  const input = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none' };
  const label = { fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 6, display: 'block' };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(14,165,233,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <UserPlus size={20} style={{ color: '#0ea5e9' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Сотрудники (МОП)</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Создание аккаунтов МОП{isChef ? '' : ` · ${user?.club || ''}`}</div>
        </div>
      </div>

      {/* Форма */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>Email сотрудника</label>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="example@mail.com" inputMode="email" style={input} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>Имя (ФИО)</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Имя Фамилия" style={input} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={label}>Клуб</label>
          {isChef ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CLUBS.map(c => (
                <button key={c} onClick={() => setClub(c)} style={{
                  padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  border: '1px solid ' + (club === c ? 'var(--accent-purple)' : 'var(--border)'),
                  background: club === c ? 'var(--accent-purple)' : 'transparent', color: club === c ? '#fff' : 'var(--text-muted)',
                }}>{c}</button>
              ))}
            </div>
          ) : (
            <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--accent-purple)', display: 'inline-block' }}>
              {user?.club || '—'}
            </div>
          )}
        </div>
        <button onClick={create} disabled={saving} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 12, border: 'none',
          background: '#0ea5e9', color: '#fff', fontSize: 14, fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>
          <UserPlus size={16} /> Создать МОП
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 12, fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1, color: '#5F9C81' }} />
          <span>МОП получит те же права, что и РОП{isChef ? '' : ' (как у вас)'}, но <b>не сможет создавать аккаунты</b>. Пароль сотрудник придумает сам при первом входе — сообщите ему email.</span>
        </div>
      </div>

      {/* Список созданных МОП */}
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
        Созданные МОП{isChef ? '' : ` · ${user?.club || ''}`} ({visibleRows.length})
      </div>
      {visibleRows.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>Пока нет созданных МОП.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleRows.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{r.displayName || r.email}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.email} · {r.club}{r.createdBy ? ` · создал ${r.createdBy}` : ''}
                </div>
              </div>
              <button onClick={() => remove(r)} title="Удалить" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', padding: 6, lineHeight: 0, flexShrink: 0 }}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StaffCreatePage;
