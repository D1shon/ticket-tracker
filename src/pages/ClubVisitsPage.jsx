import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTickets } from '../store/TicketContext';
import { Users, TrendingUp, Calendar, Clock, BarChart2, Sun, Moon } from 'lucide-react';
import { format, subDays, parseISO, getDay, getMonth, getYear } from 'date-fns';
import { ru } from 'date-fns/locale';

const CLUB_COLORS = {
  'HJ 4YOU':        '#7B3DFF',
  'HJ Colibri':     '#3b82f6',
  'HJ Villa':       '#22c55e',
  'HJ Nurly Orda':  '#f59e0b',
  'HJ Europe City': '#ec4899',
  'HJ Promenade':   '#14b8a6',
};

const CLUB_MAP = {
  '4YOU':       'HJ 4YOU',
  'COLIBRI':    'HJ Colibri',
  'VILLA':      'HJ Villa',
  'NURLY ORDA': 'HJ Nurly Orda',
};

const DOW_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DOW_FULL   = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
// Mon=1..Fri=5 are weekdays; Sat=6, Sun=0 are weekend
const IS_WEEKEND = [true, false, false, false, false, false, true];

const MONTH_NAMES = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

const todayStr     = format(new Date(), 'yyyy-MM-dd');
const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');

function avg(arr) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
}

function aggregate(data, from, to) {
  const totals = {};
  for (const day of data) {
    if (day.date < from || day.date > to) continue;
    for (const c of day.clubs) {
      totals[c.name] = (totals[c.name] ?? 0) + c.visits;
    }
  }
  return Object.entries(totals).map(([name, visits]) => ({ name, visits }))
    .sort((a, b) => b.visits - a.visits);
}

// Build analytics from daily_history data, optionally filtered to one club
function buildAnalytics(data, clubFilter) {
  const dowTotals   = Array.from({ length: 7 }, () => []);   // index = getDay()
  const monthTotals = {};                                      // "YYYY-MM" -> []

  for (const day of data) {
    const clubs = clubFilter
      ? day.clubs.filter(c => c.name === clubFilter)
      : day.clubs;
    const total = clubs.reduce((s, c) => s + c.visits, 0);
    if (total === 0) continue;

    const d   = parseISO(day.date);
    const dow = getDay(d);  // 0=Sun..6=Sat
    dowTotals[dow].push(total);

    const mk = `${getYear(d)}-${String(getMonth(d) + 1).padStart(2, '0')}`;
    if (!monthTotals[mk]) monthTotals[mk] = [];
    monthTotals[mk].push(total);
  }

  const dowAvg     = dowTotals.map(arr => avg(arr));
  const weekdayAvg = avg(dowTotals.filter((_, i) => !IS_WEEKEND[i]).flat());
  const weekendAvg = avg(dowTotals.filter((_, i) => IS_WEEKEND[i]).flat());

  const months = Object.keys(monthTotals).sort().map(mk => ({
    label:   MONTH_NAMES[parseInt(mk.split('-')[1]) - 1] + ' ' + mk.split('-')[0].slice(2),
    avg:     avg(monthTotals[mk]),
    total:   monthTotals[mk].reduce((s, v) => s + v, 0),
    days:    monthTotals[mk].length,
  }));

  return { dowAvg, weekdayAvg, weekendAvg, months };
}

const ClubVisitsPage = () => {
  const { user } = useTickets();
  const isChef   = user?.role === 'chef';
  const userClub = user?.club?.toUpperCase();
  const dwhClub  = CLUB_MAP[userClub] ?? null;

  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState(null);

  const [mode, setMode]         = useState('yesterday');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo]     = useState(yesterdayStr);
  const [analyticsClub, setAnalyticsClub] = useState(null); // null = все клубы

  useEffect(() => {
    const u1 = onSnapshot(doc(db, 'dwh_stats', 'club_visits'),   s => { if (s.exists()) setSummary(s.data()); });
    const u2 = onSnapshot(doc(db, 'dwh_stats', 'daily_history'), s => { if (s.exists()) setHistory(s.data()); });
    return () => { u1(); u2(); };
  }, []);

  // ── Visits data ──────────────────────────────────────────────────────────────
  const getRawClubs = () => {
    if (mode === 'today')     return summary?.clubs?.map(c => ({ name: c.name, visits: c.today })) ?? [];
    if (mode === 'yesterday') return history ? aggregate(history.data, yesterdayStr, yesterdayStr) : [];
    if (mode === 'range')     return history ? aggregate(history.data, dateFrom, dateTo)           : [];
    return [];
  };

  const allClubs     = getRawClubs().filter(c => c.visits > 0);
  const visibleClubs = isChef ? allClubs : allClubs.filter(c => c.name === dwhClub);
  const sorted       = [...visibleClubs].sort((a, b) => b.visits - a.visits);
  const maxVal       = sorted[0]?.visits ?? 1;

  // ── Analytics data ───────────────────────────────────────────────────────────
  // Clubs available for filter (derived from history)
  const availableClubs = history
    ? [...new Set(history.data.flatMap(d => d.clubs.map(c => c.name)))].sort()
    : [];

  const analyticsFilter = isChef ? analyticsClub : dwhClub;
  const analytics = history
    ? buildAnalytics(history.data, analyticsFilter)
    : null;

  // ── Header helpers ───────────────────────────────────────────────────────────
  const updatedAt = summary?.updatedAt
    ? (typeof summary.updatedAt === 'string' ? new Date(summary.updatedAt) : summary.updatedAt.toDate?.())
    : null;

  const modeLabel = mode === 'yesterday' ? 'Вчера'
    : mode === 'analytics' ? 'Аналитика'
    : `${format(parseISO(dateFrom), 'd MMM', { locale: ru })} – ${format(parseISO(dateTo), 'd MMM', { locale: ru })}`;

  const TABS = [
    { id: 'yesterday', label: 'Вчера'        },
    { id: 'range',     label: 'Фильтр дат'  },
    { id: 'analytics', label: '📊 Аналитика' },
  ];

  return (
    <div className="animate-fade" style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: 4 }}>
            {isChef ? 'Посещения клубов' : `Посещения — ${dwhClub?.replace('HJ ', '') ?? userClub ?? ''}`}
          </h1>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Данные из HJ Internal
          </p>
        </div>
        {updatedAt && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
            <Clock size={12} />
            Обновлено: {format(updatedAt, 'd MMM, HH:mm', { locale: ru })}
          </div>
        )}
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: mode === 'range' ? 12 : 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            style={{
              padding: '8px 20px', borderRadius: 12, cursor: 'pointer',
              fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
              background: mode === t.id ? 'var(--accent-purple)' : 'var(--bg-card)',
              color:      mode === t.id ? '#fff' : 'var(--text-secondary)',
              border:     `1px solid ${mode === t.id ? 'var(--accent-purple)' : 'var(--border)'}`,
              transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Date range picker */}
      {mode === 'range' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'С', val: dateFrom, max: dateTo,    onChange: e => setDateFrom(e.target.value) },
            { label: 'По', val: dateTo,  min: dateFrom, max: todayStr, onChange: e => setDateTo(e.target.value) },
          ].map(({ label, val, min, max, onChange }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
              <input type="date" value={val} min={min} max={max} onChange={onChange}
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, outline: 'none', cursor: 'pointer' }}
              />
            </div>
          ))}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>История до 90 дней</span>
        </div>
      )}

      {/* ── ANALYTICS TAB ──────────────────────────────────────────────────────── */}
      {mode === 'analytics' && (
        <AnalyticsPanel
          analytics={analytics}
          isChef={isChef}
          dwhClub={dwhClub}
          history={history}
          availableClubs={availableClubs}
          selectedClub={analyticsClub}
          onSelectClub={setAnalyticsClub}
        />
      )}

      {/* ── VISITS TAB ─────────────────────────────────────────────────────────── */}
      {mode !== 'analytics' && (
        <>
          {/* Summary tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Всего посещений', value: sorted.reduce((s, c) => s + c.visits, 0).toLocaleString('ru'), icon: Users,      color: '#7B3DFF' },
              { label: 'Лидер',           value: sorted[0]?.name?.replace('HJ ', '') ?? '—',                    icon: TrendingUp, color: '#22c55e' },
              { label: 'Период',          value: modeLabel,                                                       icon: Calendar,  color: '#f59e0b' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <s.icon size={18} color={s.color} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)' }}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Club bars */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 24, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Рейтинг — {modeLabel}
              </span>
            </div>
            {!summary || (mode !== 'today' && !history) ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Загрузка...</div>
            ) : sorted.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Нет данных за выбранный период</div>
            ) : sorted.map((club, i) => {
              const color     = CLUB_COLORS[club.name] || '#7B3DFF';
              const shortName = club.name.replace('HJ ', '');
              const pct       = Math.round((club.visits / maxVal) * 100);
              return (
                <div key={club.name} style={{ padding: '18px 20px', borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{shortName}</span>
                      {i === 0 && (
                        <span style={{ fontSize: 10, fontWeight: 800, background: `${color}20`, color, padding: '2px 8px', borderRadius: 20, border: `1px solid ${color}40` }}>#1</span>
                      )}
                    </div>
                    <div>
                      <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {club.visits.toLocaleString('ru')}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>посещ.</span>
                    </div>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4,
                      background: `linear-gradient(90deg, ${color}cc, ${color})`,
                      transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// ── Analytics Panel ────────────────────────────────────────────────────────────

const AnalyticsPanel = ({ analytics, isChef, dwhClub, history, availableClubs, selectedClub, onSelectClub }) => {
  if (!history) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Загрузка...</div>;
  }
  if (!analytics) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Нет данных для аналитики</div>;
  }

  const { dowAvg, weekdayAvg, weekendAvg, months } = analytics;
  const maxDow   = Math.max(...dowAvg, 1);
  const maxMonth = Math.max(...months.map(m => m.avg), 1);
  const days     = history.data.length;
  const activeClub = isChef ? selectedClub : dwhClub;

  // Reorder: Mon(1) Tue(2) ... Sun(0)
  const dowOrder = [1, 2, 3, 4, 5, 6, 0];

  const sectionTitle = (text) => (
    <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
      {text}
    </div>
  );

  const card = (content, style = {}) => (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '20px 24px', ...style }}>
      {content}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Club filter — chef only */}
      {isChef && availableClubs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Клуб:</span>
          {[{ key: null, label: 'Все' }, ...availableClubs.map(c => ({ key: c, label: c.replace('HJ ', '') }))].map(({ key, label }) => {
            const active = selectedClub === key;
            const color  = key ? (CLUB_COLORS[key] || '#7B3DFF') : '#7B3DFF';
            return (
              <button
                key={label}
                onClick={() => onSelectClub(key)}
                style={{
                  padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
                  fontWeight: 800, fontSize: 11,
                  background: active ? color : 'var(--bg-card)',
                  color:      active ? '#fff' : 'var(--text-secondary)',
                  border:     `1px solid ${active ? color : 'var(--border)'}`,
                  transition: 'all 0.18s',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Data coverage notice */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>
        Данные за последние {days} дн. · {activeClub ? activeClub : 'все клубы'}
      </div>

      {/* Будни vs Выходные */}
      {card(<>
        {sectionTitle('Будни vs Выходные — среднее в день')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { label: 'Будни', sub: 'Пн – Пт', value: weekdayAvg, icon: '🏢', color: '#7B3DFF' },
            { label: 'Выходные', sub: 'Сб – Вс', value: weekendAvg, icon: '🌴', color: '#f59e0b' },
          ].map(({ label, sub, value, icon, color }) => (
            <div key={label} style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 16, padding: '18px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', marginBottom: 2 }}>
                {value.toLocaleString('ru')}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{sub}</div>
              {weekdayAvg > 0 && weekendAvg > 0 && (
                <div style={{ fontSize: 11, color, fontWeight: 700, marginTop: 8 }}>
                  {label === 'Будни'
                    ? weekdayAvg > weekendAvg ? `+${Math.round((weekdayAvg / weekendAvg - 1) * 100)}% vs выходные` : `−${Math.round((1 - weekdayAvg / weekendAvg) * 100)}% vs выходные`
                    : weekendAvg > weekdayAvg ? `+${Math.round((weekendAvg / weekdayAvg - 1) * 100)}% vs будни`   : `−${Math.round((1 - weekendAvg / weekdayAvg) * 100)}% vs будни`
                  }
                </div>
              )}
            </div>
          ))}
        </div>
      </>)}

      {/* По дням недели */}
      {card(<>
        {sectionTitle('Среднее по дням недели')}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
          {dowOrder.map(dow => {
            const val  = dowAvg[dow];
            const pct  = Math.round((val / maxDow) * 100);
            const isWE = IS_WEEKEND[dow];
            const color = isWE ? '#f59e0b' : '#7B3DFF';
            return (
              <div key={dow} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {val > 0 ? val.toLocaleString('ru') : '—'}
                </div>
                <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{
                    width: '100%', borderRadius: '4px 4px 0 0',
                    height: val > 0 ? `${pct}%` : '4px',
                    background: val > 0 ? `linear-gradient(180deg, ${color}cc, ${color})` : 'var(--bg-hover)',
                    minHeight: 4,
                    transition: 'height 0.5s cubic-bezier(0.4,0,0.2,1)',
                  }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: isWE ? '#f59e0b' : 'var(--text-secondary)' }}>
                  {DOW_LABELS[dow]}
                </div>
              </div>
            );
          })}
        </div>
      </>)}

      {/* По месяцам */}
      {months.length > 0 && card(<>
        {sectionTitle(`Динамика по месяцам — среднее в день`)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {months.map((m, i) => {
            const pct   = Math.round((m.avg / maxMonth) * 100);
            const isMax = m.avg === maxMonth;
            const color = isMax ? '#22c55e' : '#7B3DFF';
            return (
              <div key={m.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', minWidth: 64 }}>{m.label}</span>
                    {isMax && <span style={{ fontSize: 10, fontWeight: 800, color: '#22c55e', background: '#22c55e15', border: '1px solid #22c55e40', padding: '1px 8px', borderRadius: 20 }}>Пик</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{m.days} дн.</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'right' }}>
                      {m.avg.toLocaleString('ru')} <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>/ день</span>
                    </span>
                  </div>
                </div>
                <div style={{ height: 8, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4,
                    background: `linear-gradient(90deg, ${color}cc, ${color})`,
                    transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Лучший месяц',   value: months.reduce((a, b) => b.avg > a.avg ? b : a, months[0])?.label },
            { label: 'Всего записей',  value: `${months.reduce((s, m) => s + m.total, 0).toLocaleString('ru')} посещ.` },
            { label: 'Период данных',  value: `${months.length} мес.` },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      </>)}

    </div>
  );
};

export default ClubVisitsPage;
