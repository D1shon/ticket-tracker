import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Plus, X, ChevronLeft, ChevronDown, Check, Trash2, CheckCircle2, UserRound, CalendarDays, GraduationCap } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { pushNotify } from '../lib/pushNotify';
import { isMobileDevice } from '../lib/isMobile';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, deleteField, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';
import { ONBOARDING_SECTIONS, ONBOARDING_TOTAL, ONBOARDING_POSITIONS } from '../data/onboardingChecklist';

const CLUBS = ['4YOU', 'COLIBRI', 'VILLA', 'NURLY ORDA', 'PROMENADE', 'EUROPE CITY', 'DUBAI'];
const GREEN = '#5F9C81';

const fmtDay = (iso) => { try { return format(new Date(iso), 'd MMM', { locale: ru }); } catch { return ''; } };
const fmtFull = (iso) => { try { return format(new Date(iso), 'd MMMM yyyy', { locale: ru }); } catch { return ''; } };
const todayInput = () => format(new Date(), 'yyyy-MM-dd');

// Журнал по дням: какие даты были отметки, сколько пунктов и кто обучал
const dayLog = (checks) => {
  const byDate = {};
  Object.values(checks || {}).forEach(c => {
    const d = (c?.atISO || '').slice(0, 10);
    if (!d) return;
    byDate[d] = byDate[d] || { date: d, count: 0, names: new Set() };
    byDate[d].count += 1;
    if (c.byName) byDate[d].names.add(c.byName);
  });
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map((d, i) => ({ ...d, day: i + 1, names: [...d.names] }));
};

const OnboardingPage = () => {
  const { user } = useTickets();
  const role = user?.role;
  const isChef = role === 'chef';
  const myEmail = (user?.email || '').toLowerCase();
  const myName = user?.displayName || user?.email || '';
  const userClub = user?.club?.toUpperCase() || null;

  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  useEffect(() => {
    const h = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const [activeClub, setActiveClub] = useState(isChef ? '4YOU' : (userClub || '4YOU'));
  const [trainees, setTrainees] = useState([]);
  const [showDone, setShowDone] = useState(false);
  const [params, setParams] = useSearchParams();
  const openId = params.get('id');
  const [openSec, setOpenSec] = useState({}); // ручное раскрытие/сворачивание групп чек-листа
  useEffect(() => { setOpenSec({}); }, [openId]);

  // Форма нового стажёра
  const [showAdd, setShowAdd] = useState(false);
  const [fName, setFName] = useState('');
  const [fPosition, setFPosition] = useState(ONBOARDING_POSITIONS[0]);
  const [fStart, setFStart] = useState(todayInput);
  const [fMentor, setFMentor] = useState(myName);
  const [saving, setSaving] = useState(false);

  // Живая подписка по клубу — второй менеджер видит отметки сразу, как на доске задач
  useEffect(() => {
    const q = query(collection(db, 'onboarding_trainees'), where('club', '==', activeClub));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtISO || '').localeCompare(a.createdAtISO || ''));
      setTrainees(list);
    }, err => console.error('[onboarding_trainees]', err));
  }, [activeClub]);

  const progressOf = (t) => Object.keys(t.checks || {}).length;
  const pctOf = (t) => Math.round(progressOf(t) / ONBOARDING_TOTAL * 100);
  const current = useMemo(() => trainees.find(t => t.id === openId) || null, [trainees, openId]);
  const activeList = trainees.filter(t => t.status !== 'done');
  const doneList = trainees.filter(t => t.status === 'done');

  const openTrainee = (id) => setParams(id ? { id } : {});

  const createTrainee = async () => {
    const name = fName.trim();
    if (!name) return toast.error('Введите имя стажёра');
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'onboarding_trainees'), {
        name,
        position: fPosition,
        club: activeClub,
        startDateISO: fStart || todayInput(),
        mentorName: fMentor.trim() || myName,
        createdBy: myEmail,
        createdByName: myName,
        createdAtISO: new Date().toISOString(),
        status: 'active',
        checks: {},
        updatedAt: serverTimestamp(),
      });
      toast.success('Стажёр добавлен — чек-лист открыт');
      pushNotify({
        title: '🎓 Новый стажёр на адаптации',
        body: `${activeClub}: ${name} (${fPosition}) — наставник ${fMentor.trim() || myName}`,
        club: activeClub,
        excludeEmail: myEmail,
        url: `/onboarding?id=${ref.id}`,
        roles: ['manager', 'chef'],
      });
      setShowAdd(false); setFName(''); setFPosition(ONBOARDING_POSITIONS[0]); setFStart(todayInput()); setFMentor(myName);
      openTrainee(ref.id);
    } catch (e) {
      toast.error('Не удалось создать: ' + (e?.message || e));
    } finally { setSaving(false); }
  };

  const toggleItem = async (t, itemId) => {
    if (t.status === 'done') return;
    const checked = !!t.checks?.[itemId];
    try {
      await updateDoc(doc(db, 'onboarding_trainees', t.id), {
        [`checks.${itemId}`]: checked ? deleteField() : { by: myEmail, byName: myName, atISO: new Date().toISOString() },
        lastActivityISO: new Date().toISOString(),
        lastActivityBy: myName,
        updatedAt: serverTimestamp(),
      });
    } catch { toast.error('Не удалось сохранить отметку'); }
  };

  const finishTrainee = async (t) => {
    if (progressOf(t) < ONBOARDING_TOTAL) return toast.error('Ещё не все пункты отмечены');
    if (!window.confirm(`Завершить адаптацию: ${t.name}?`)) return;
    try {
      await updateDoc(doc(db, 'onboarding_trainees', t.id), { status: 'done', doneAtISO: new Date().toISOString(), doneBy: myName, updatedAt: serverTimestamp() });
      toast.success('Адаптация завершена');
      pushNotify({
        title: '🎓 Адаптация завершена',
        body: `${t.club}: ${t.name} прошёл(ла) все ${ONBOARDING_TOTAL} пунктов обучения`,
        club: t.club, excludeEmail: myEmail, url: `/onboarding?id=${t.id}`, roles: ['manager', 'chef'],
      });
    } catch { toast.error('Не удалось завершить'); }
  };

  const reopenTrainee = async (t) => {
    try { await updateDoc(doc(db, 'onboarding_trainees', t.id), { status: 'active', updatedAt: serverTimestamp() }); }
    catch { toast.error('Не удалось вернуть'); }
  };

  const removeTrainee = async (t) => {
    if (!window.confirm(`Удалить стажёра ${t.name} вместе с отметками? Это нельзя отменить.`)) return;
    try { await deleteDoc(doc(db, 'onboarding_trainees', t.id)); openTrainee(null); toast.success('Удалено'); }
    catch { toast.error('Не удалось удалить'); }
  };

  const canDelete = (t) => isChef || (t.createdBy || '').toLowerCase() === myEmail;

  // ───────────────────────── Детальная карточка ─────────────────────────
  const renderDetail = (t) => {
    const done = progressOf(t);
    const pct = pctOf(t);
    const log = dayLog(t.checks);
    const isDone = t.status === 'done';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button onClick={() => openTrainee(null)} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 800, padding: '4px 0' }}>
          <ChevronLeft size={16} /> Все стажёры
        </button>

        {/* Шапка стажёра */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: isMobile ? 14 : 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: `${GREEN}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: GREEN, flexShrink: 0 }}>{(t.name || '?')[0]}</div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {t.name}
                {isDone && <span style={{ fontSize: 9, fontWeight: 900, padding: '3px 9px', borderRadius: 7, background: `${GREEN}20`, color: GREEN, textTransform: 'uppercase' }}>Адаптация пройдена</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>
                {t.position} · {t.club} · старт {fmtFull(t.startDateISO)} · наставник {t.mentorName || '—'}
              </div>
            </div>
            {canDelete(t) && (
              <button onClick={() => removeTrainee(t)} title="Удалить" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, opacity: 0.5 }}><Trash2 size={15} /></button>
            )}
          </div>

          {/* Прогресс */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 6 }}>
              <span>Пройдено {done} из {ONBOARDING_TOTAL}</span>
              <span style={{ color: pct === 100 ? GREEN : 'var(--text-primary)' }}>{pct}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: 'var(--bg-hover)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? GREEN : 'var(--accent-purple)', transition: 'width 0.3s' }} />
            </div>
          </div>

          {/* Журнал по дням обучения */}
          {log.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Журнал обучения</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {log.map(d => (
                  <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10, background: 'var(--bg-hover)', border: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    <CalendarDays size={12} color={GREEN} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 900 }}>День {d.day}</span>
                    <span>· {fmtDay(d.date)} · {d.count} п.</span>
                    {d.names.length > 0 && <span style={{ color: 'var(--text-muted)' }}>· {d.names.join(', ')}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {!isDone ? (
              <button onClick={() => finishTrainee(t)} disabled={done < ONBOARDING_TOTAL} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, border: 'none', background: done < ONBOARDING_TOTAL ? 'var(--bg-hover)' : GREEN, color: done < ONBOARDING_TOTAL ? 'var(--text-muted)' : '#fff', fontSize: 12, fontWeight: 800, cursor: done < ONBOARDING_TOTAL ? 'default' : 'pointer' }}>
                <CheckCircle2 size={15} /> Завершить адаптацию
              </button>
            ) : (
              <button onClick={() => reopenTrainee(t)} style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                Вернуть в работу
              </button>
            )}
          </div>
        </div>

        {/* Секции чек-листа */}
        {ONBOARDING_SECTIONS.map(sec => {
          const secDone = sec.items.filter(i => t.checks?.[i.id]).length;
          const all = secDone === sec.items.length;
          // Полностью пройденная группа сворачивается сама; вручную можно раскрыть/свернуть любую
          const isOpen = openSec[sec.id] ?? !all;
          return (
            <div key={sec.id} style={{ background: 'var(--bg-card)', border: '1px solid ' + (all ? `${GREEN}55` : 'var(--border)'), borderRadius: 16, padding: isMobile ? '12px 12px' : '16px 18px' }}>
              <button onClick={() => setOpenSec(o => ({ ...o, [sec.id]: !isOpen }))} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', marginBottom: isOpen ? (sec.intro ? 2 : 8) : 0 }}>
                {all
                  ? <span style={{ width: 20, height: 20, borderRadius: 6, background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={13} color="#fff" strokeWidth={3} /></span>
                  : <ChevronDown size={16} color="var(--text-muted)" style={{ flexShrink: 0, transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />}
                <span style={{ fontSize: 13.5, fontWeight: 900, color: all ? 'var(--text-muted)' : 'var(--text-primary)', flex: 1, textDecoration: all ? 'line-through' : 'none' }}>{sec.title}</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: all ? GREEN : 'var(--text-muted)' }}>{secDone}/{sec.items.length}</span>
              </button>
              {isOpen && sec.intro && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>{sec.intro}</div>}
              {isOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sec.items.map(item => {
                  const c = t.checks?.[item.id];
                  return (
                    <button key={item.id} onClick={() => toggleItem(t, item.id)} disabled={isDone} style={{
                      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%',
                      padding: isMobile ? '10px 10px' : '8px 10px', minHeight: 44, borderRadius: 10, cursor: isDone ? 'default' : 'pointer',
                      // Пройденный пункт: вся строка серая и зачёркнутая целиком
                      border: '1px solid ' + (c ? 'var(--border)' : 'transparent'),
                      background: c ? 'var(--bg-hover)' : 'transparent',
                      color: c ? 'var(--text-muted)' : 'var(--text-primary)',
                      textDecoration: c ? 'line-through' : 'none', textDecorationColor: c ? 'var(--text-muted)' : undefined,
                      opacity: c ? 0.7 : 1,
                    }}>
                      <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid ' + (c ? '#9CA3AF' : 'var(--border)'), background: c ? '#9CA3AF' : 'transparent' }}>
                        {c && <Check size={14} color="#fff" strokeWidth={3} />}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>{item.text}</span>
                      {c && <span style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{c.byName ? c.byName.split(' ')[0] : ''} · {fmtDay(c.atISO)}</span>}
                    </button>
                  );
                })}
              </div>}
            </div>
          );
        })}
      </div>
    );
  };

  // ───────────────────────── Список стажёров ─────────────────────────
  const renderCard = (t) => {
    const pct = pctOf(t);
    const isDone = t.status === 'done';
    return (
      <button key={t.id} onClick={() => openTrainee(t.id)} style={{ textAlign: 'left', width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${isDone ? GREEN : 'var(--accent-purple)'}`, borderRadius: 14, padding: isMobile ? '12px 13px' : '14px 16px', cursor: 'pointer', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: `${GREEN}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, color: GREEN, flexShrink: 0 }}>{(t.name || '?')[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {t.name}
              <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>{t.position}</span>
              {isChef && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: 'rgba(125,111,179,0.12)', color: 'var(--accent-purple)' }}>{t.club}</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>
              старт {fmtDay(t.startDateISO)} · наставник {t.mentorName || '—'}{t.lastActivityISO ? ` · последняя отметка ${fmtDay(t.lastActivityISO)}${t.lastActivityBy ? ` (${t.lastActivityBy.split(' ')[0]})` : ''}` : ''}
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 900, color: pct === 100 ? GREEN : 'var(--text-primary)', flexShrink: 0 }}>{pct}%</div>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-hover)', overflow: 'hidden', marginTop: 10 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? GREEN : 'var(--accent-purple)' }} />
        </div>
      </button>
    );
  };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `${GREEN}1F`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GraduationCap size={20} style={{ color: GREEN }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Адаптация</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>Обучение стажёров по чек-листу · {ONBOARDING_TOTAL} пунктов</p>
          </div>
        </div>
        {!current && (
          <button onClick={() => { setFMentor(myName); setShowAdd(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, border: 'none', background: GREEN, color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            <Plus size={14} /> Стажёр
          </button>
        )}
      </div>

      {/* Клубы — только шеф */}
      {isChef && !current && (
        <div style={{ display: 'flex', gap: 6, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
          {CLUBS.map(c => (
            <button key={c} onClick={() => setActiveClub(c)} style={{
              flexShrink: 0, padding: '7px 13px', borderRadius: 999, fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
              border: '1px solid ' + (activeClub === c ? 'var(--accent-purple)' : 'var(--border)'),
              background: activeClub === c ? 'var(--accent-purple)' : 'transparent',
              color: activeClub === c ? '#fff' : 'var(--text-muted)',
            }}>{c}</button>
          ))}
        </div>
      )}

      {current ? renderDetail(current) : (
        <>
          {activeList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', border: '1px dashed var(--border)', borderRadius: 20, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
              <UserRound size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div>Стажёров на адаптации нет. Нажмите «Стажёр», чтобы начать обучение.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{activeList.map(renderCard)}</div>
          )}

          {doneList.length > 0 && (
            <div>
              <button onClick={() => setShowDone(s => !s)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 0' }}>
                {showDone ? '▾' : '▸'} Прошли адаптацию ({doneList.length})
              </button>
              {showDone && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>{doneList.map(renderCard)}</div>}
            </div>
          )}
        </>
      )}

      {/* Модалка нового стажёра */}
      {showAdd && (
        <div onClick={() => !saving && setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: isMobile ? '100%' : 440, background: 'var(--bg-card)', borderRadius: isMobile ? '20px 20px 0 0' : 20, border: '1px solid var(--border)', padding: isMobile ? '16px 16px 28px' : 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Новый стажёр · {activeClub}</h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, lineHeight: 0 }}><X size={18} /></button>
            </div>
            <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Имя и фамилия</label>
            <input autoFocus value={fName} onChange={e => setFName(e.target.value)} placeholder="Например, Айгерим Сейткали" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }} />
            <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Позиция</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ONBOARDING_POSITIONS.map(p => (
                <button key={p} onClick={() => setFPosition(p)} style={{ padding: '8px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: '1px solid ' + (fPosition === p ? GREEN : 'var(--border)'), background: fPosition === p ? `${GREEN}1F` : 'transparent', color: fPosition === p ? GREEN : 'var(--text-muted)' }}>{p}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Дата выхода</label>
                <input type="date" value={fStart} onChange={e => setFStart(e.target.value)} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }} />
              </div>
              <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Наставник</label>
                <input value={fMentor} onChange={e => setFMentor(e.target.value)} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }} />
              </div>
            </div>
            <button onClick={createTrainee} disabled={saving || !fName.trim()} style={{ padding: '13px', borderRadius: 14, border: 'none', background: GREEN, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: saving || !fName.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ClipboardCheck size={16} /> Создать и открыть чек-лист
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingPage;
