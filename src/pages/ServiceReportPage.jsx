import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardCheck, Send, Sparkles, Dumbbell, Wrench, Clock, AlertTriangle, CheckCircle2, User } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { pushNotify } from '../lib/pushNotify';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY'];
const STOCK = [['ok', 'В норме', '#5F9C81'], ['low', 'Заканчивается', '#C08F4F'], ['out', 'Нет', '#B06A6A']];

// Оценка 1–5: красная→зелёная
const Rating = ({ value, onChange }) => {
  const color = (n) => n <= 2 ? '#B06A6A' : n === 3 ? '#C08F4F' : '#5F9C81';
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(value === n ? null : n)} style={{
          width: 40, height: 40, borderRadius: 11, cursor: 'pointer', fontSize: 15, fontWeight: 900,
          border: '1px solid ' + (value === n ? color(n) : 'var(--border)'),
          background: value === n ? color(n) : 'var(--bg-hover)',
          color: value === n ? '#fff' : 'var(--text-muted)',
        }}>{n}</button>
      ))}
    </div>
  );
};

const Block = ({ icon: Icon, color, title, addressee, children }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 14, borderLeft: `3px solid ${color}` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} style={{ color }} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>{title}</div>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, color, background: `${color}12`, padding: '3px 9px', borderRadius: 7, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        <User size={10} /> {addressee}
      </span>
    </div>
    {children}
  </div>
);

const Field = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</span>
    {children}
  </div>
);

const ServiceReportPage = () => {
  const { user } = useTickets();
  const isChef = user?.role === 'chef';
  const isDirector = user?.role === 'chef' || user?.role === 'komdir';
  const userClub = (user?.club || '').toUpperCase();
  const canFill = ['chef', 'manager', 'admin'].includes(user?.role);

  const [club, setClub] = useState(isChef ? '4YOU' : (userClub || '4YOU'));
  const [f, setF] = useState({
    cleaning: null, laundry: null, air: null, stock: 'ok', contractors: '',
    gymOrder: null, trainerMess: '', infra: '', note: '',
  });
  const [saving, setSaving] = useState(false);
  const [reports, setReports] = useState([]);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    return onSnapshot(collection(db, 'service_reports'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
      setReports(list);
    }, () => {});
  }, []);

  const visibleReports = useMemo(() => {
    const base = reports.filter(r => isDirector || (r.club || '').toUpperCase() === userClub);
    return base.slice(0, 15);
  }, [reports, isDirector, userClub]);

  const canSubmit = f.cleaning != null || f.laundry != null || f.air != null || f.gymOrder != null
    || f.contractors.trim() || f.trainerMess.trim() || f.infra.trim() || f.note.trim();

  const submit = async () => {
    if (!canSubmit) { toast.error('Заполните хотя бы один пункт'); return; }
    setSaving(true);
    const dateStr = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
    try {
      await addDoc(collection(db, 'service_reports'), {
        club, date: dateStr,
        cleaning: f.cleaning, laundry: f.laundry, air: f.air, stock: f.stock,
        contractors: f.contractors.trim() || null,
        gymOrder: f.gymOrder, trainerMess: f.trainerMess.trim() || null,
        infra: f.infra.trim() || null, note: f.note.trim() || null,
        createdBy: user?.displayName || '', createdByEmail: user?.email || '',
        createdAtISO: new Date().toISOString(), updatedAt: serverTimestamp(),
      });

      // Адресная маршрутизация (v1 — по блокам; ИИ-разбор добавим позже)
      const low = (n) => n != null && n <= 3;
      // Блок 1 → Управляющий директор (Ком-Дир) + шефы
      pushNotify({
        title: `🧼 Сервис-отчёт · ${club}`,
        body: `Клининг ${f.cleaning ?? '—'}/5 · стирка ${f.laundry ?? '—'}/5 · воздух ${f.air ?? '—'}/5 · химия: ${(STOCK.find(s => s[0] === f.stock) || [])[1]}`
          + (f.contractors.trim() ? ` · подрядчики: ${f.contractors.trim().slice(0, 60)}` : ''),
        excludeEmail: user?.email || '', url: '/service-report', tag: `svc-opex-${club}-${dateStr}`,
        roles: ['komdir', 'chef'],
      });
      // Блок 2 → Шеф-тренер
      if (f.gymOrder != null || f.trainerMess.trim()) {
        pushNotify({
          title: `🏋️ Готовность залов · ${club}`,
          body: `Порядок ${f.gymOrder ?? '—'}/5${f.trainerMess.trim() ? ` · ${f.trainerMess.trim().slice(0, 80)}` : ''}`,
          excludeEmail: user?.email || '', url: '/service-report', tag: `svc-gym-${club}-${dateStr}`,
          roles: ['chef'],
        });
      }
      // Блок 3 → IT / Техники (пока шефам, отдельные IT-аккаунты добавим позже)
      if (f.infra.trim()) {
        pushNotify({
          title: `🔧 Техника · ${club}`,
          body: f.infra.trim().slice(0, 140),
          excludeEmail: user?.email || '', url: '/service-report', tag: `svc-infra-${club}-${dateStr}`,
          roles: ['chef'],
        });
      }

      setF({ cleaning: null, laundry: null, air: null, stock: 'ok', contractors: '', gymOrder: null, trainerMess: '', infra: '', note: '' });
      toast.success('Отчёт отправлен — адресаты получили уведомления');
    } catch {
      toast.error('Не удалось отправить отчёт');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (iso) => { try { return format(new Date(iso), 'd MMM, HH:mm', { locale: ru }); } catch { return ''; } };
  const stockMeta = (v) => STOCK.find(s => s[0] === v) || STOCK[0];

  const inputSt = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 11, padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontWeight: 500, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640, margin: '0 auto', paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(125,111,179,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardCheck size={20} style={{ color: 'var(--accent-purple)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Сервис-отчёт</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Вечерний обход · закрытие смены · адресная маршрутизация</p>
          </div>
        </div>
        {isChef && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CLUBS.map(c => (
              <button key={c} onClick={() => setClub(c)} style={{
                padding: '6px 12px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: '1px solid ' + (club === c ? 'var(--accent-purple)' : 'var(--border)'),
                background: club === c ? 'var(--accent-purple)' : 'transparent',
                color: club === c ? '#fff' : 'var(--text-muted)',
              }}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {canFill && (<>
        {/* Блок 1 — Сервис и OpEx */}
        <Block icon={Sparkles} color="#0ea5e9" title="Сервис и OpEx" addressee="Управляющий директор">
          <Field label="Качество клининга">
            <Rating value={f.cleaning} onChange={v => set('cleaning', v)} />
          </Field>
          <Field label="Качество стирки текстиля">
            <Rating value={f.laundry} onChange={v => set('laundry', v)} />
          </Field>
          <Field label="Качество воздуха в клубе">
            <Rating value={f.air} onChange={v => set('air', v)} />
          </Field>
          <Field label="Остатки химии / косметики на складе">
            <div style={{ display: 'flex', gap: 6 }}>
              {STOCK.map(([id, label, color]) => (
                <button key={id} type="button" onClick={() => set('stock', id)} style={{
                  flex: 1, padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  border: '1px solid ' + (f.stock === id ? color : 'var(--border)'),
                  background: f.stock === id ? `${color}18` : 'transparent',
                  color: f.stock === id ? color : 'var(--text-muted)',
                }}>{label}</button>
              ))}
            </div>
          </Field>
          <Field label="Проблемы с подрядчиками (необязательно)">
            <textarea rows={2} value={f.contractors} onChange={e => set('contractors', e.target.value)} placeholder="Опишите, если есть…" style={inputSt} />
          </Field>
        </Block>

        {/* Блок 2 — Готовность залов */}
        <Block icon={Dumbbell} color="#5F9C81" title="Готовность залов" addressee="Шеф-тренер">
          <Field label="Порядок в залах после классов">
            <Rating value={f.gymOrder} onChange={v => set('gymOrder', v)} />
          </Field>
          <Field label="Тренеры оставили беспорядок / разбросан инвентарь? (необязательно)">
            <textarea rows={2} value={f.trainerMess} onChange={e => set('trainerMess', e.target.value)} placeholder="Кто и что, если было…" style={inputSt} />
          </Field>
        </Block>

        {/* Блок 3 — Инфраструктура */}
        <Block icon={Wrench} color="#C08F4F" title="Инфраструктура" addressee="IT / Техники">
          <Field label="Технические проблемы за смену">
            <textarea rows={3} value={f.infra} onChange={e => set('infra', e.target.value)} placeholder="Пульсометры, турникеты, экраны, вода, вентиляция, электрика…" style={inputSt} />
          </Field>
        </Block>

        <textarea rows={2} value={f.note} onChange={e => set('note', e.target.value)} placeholder="Общий комментарий по смене (необязательно)…" style={inputSt} />

        <button onClick={submit} disabled={saving || !canSubmit} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', borderRadius: 14,
          border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
          opacity: saving || !canSubmit ? 0.5 : 1,
        }}>
          <Send size={16} /> Отправить отчёт · {club}
        </button>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.5 }}>
          Каждый блок уходит своему адресату отдельным уведомлением. Автоматический ИИ-разбор и создание задач по вердикту — следующий этап.
        </div>
      </>)}

      {/* История отчётов */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, marginTop: 8 }}>
          Последние отчёты {isDirector ? '(все клубы)' : ''}
        </div>
        {visibleReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 20px', border: '1px dashed var(--border)', borderRadius: 16, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
            Отчётов пока нет
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleReports.map(r => {
              const sm = stockMeta(r.stock);
              const badRate = (n) => n != null && n <= 3;
              return (
                <div key={r.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--accent-purple)', background: 'rgba(125,111,179,0.1)', padding: '2px 8px', borderRadius: 6 }}>{r.club}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{r.createdBy}</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>
                      <Clock size={10} /> {fmt(r.createdAtISO)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, fontWeight: 700 }}>
                    {[['Клининг', r.cleaning], ['Стирка', r.laundry], ['Воздух', r.air], ['Залы', r.gymOrder]].map(([lbl, val]) => val != null && (
                      <span key={lbl} style={{ padding: '3px 9px', borderRadius: 7, background: badRate(val) ? 'rgba(176,106,106,0.1)' : 'rgba(95,156,129,0.1)', color: badRate(val) ? '#B06A6A' : '#5F9C81' }}>
                        {lbl}: {val}/5
                      </span>
                    ))}
                    <span style={{ padding: '3px 9px', borderRadius: 7, background: `${sm[2]}14`, color: sm[2] }}>Химия: {sm[1]}</span>
                  </div>
                  {(r.contractors || r.trainerMess || r.infra || r.note) && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {r.contractors && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}><span style={{ color: '#0ea5e9', fontWeight: 700 }}>Подрядчики:</span> {r.contractors}</div>}
                      {r.trainerMess && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}><span style={{ color: '#5F9C81', fontWeight: 700 }}>Залы:</span> {r.trainerMess}</div>}
                      {r.infra && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}><span style={{ color: '#C08F4F', fontWeight: 700 }}>Техника:</span> {r.infra}</div>}
                      {r.note && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.note}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceReportPage;
