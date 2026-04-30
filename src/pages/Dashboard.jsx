import React from 'react';
import { Activity, AlertCircle, Clock, CheckCircle2, Zap } from 'lucide-react';

const LIVE_TICKETS = [
  { id: 1, club: '4YOU', title: 'Работа с кровлей, протечки', status: 'ПАУЗА', assignee: 'САНИЯР (4YOU) + ПРОФЕС...' },
  { id: 2, club: '4YOU', title: 'Фен Борк сломан (на ремонте)', status: 'ПАУЗА', assignee: 'САНИЯР (4YOU) + ИНФРАСТРУКТУРА', alert: 'ЖДИ ДЕТАЛИ ДЛЯ СЕРВИС ЦЕНТРА' },
  { id: 3, club: '4YOU', title: 'Трещина в Legs на потолке огромная', status: 'В РАБОТЕ', assignee: 'САНИЯР (4YOU) + ИНФРАСТРУКТУРА' },
  { id: 4, club: '4YOU', title: 'Экраны в залах выровнять под один уровень', status: 'ПАУЗА', assignee: 'САНИЯР (4YOU) + ИНФРАСТРУКТУРА' },
  { id: 5, club: '4YOU', title: 'Закрепить стальные кассеты (стены) по всему объекту', status: 'В РАБОТЕ', assignee: 'САНИЯР (4YOU) + ИНФРАСТРУКТУРА' },
];

const MANAGERS = [
  { name: 'Сания',    status: 'В РАБОТЕ', work: 0, pause: 1, wait: 7 },
  { name: 'Анастасия',status: 'В РАБОТЕ', work: 0, pause: 0, wait: 1 },
  { name: 'Диас',     status: 'В РАБОТЕ', work: 2, pause: 0, wait: 9 },
  { name: 'Салтанат', status: 'В РАБОТЕ', work: 2, pause: 0, wait: 0 },
  { name: 'Дилшат',   status: 'В РАБОТЕ', work: 0, pause: 1, wait: 7 },
  { name: 'Айнур',    status: 'СВОБОДЕН', work: 0, pause: 0, wait: 0 },
  { name: 'Азиз',     status: 'СВОБОДЕН', work: 0, pause: 0, wait: 0 },
];

const CLUBS_SUMMARY = [
  { name: '4YOU',      color: '#4f8ef7', total: 23, closed: 12, active: 0 },
  { name: 'COLIBRI',   color: '#9b5de5', total: 9,  closed: 0,  active: 5 },
  { name: 'VILLA',     color: '#f59e0b', total: 3,  closed: 0,  active: 3 },
  { name: 'NURLY ORCA',color: '#f97316', total: 0,  closed: 0,  active: 0 },
  { name: 'MY TASK',   color: '#22c55e', total: 0,  closed: 0,  active: 0 },
];

const StatusBadge = ({ status }) => {
  const isWork = status === 'В РАБОТЕ';
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 4,
      letterSpacing: '0.04em',
      background: isWork ? 'rgba(155,93,229,0.2)' : 'transparent',
      color: isWork ? '#b07ef7' : 'var(--text-muted)',
      border: isWork ? '1px solid rgba(155,93,229,0.3)' : '1px solid var(--border)',
    }}>
      {status}
    </span>
  );
};

const Dashboard = () => {
  const inWork = LIVE_TICKETS.filter(t => t.status === 'В РАБОТЕ').length;
  const paused = LIVE_TICKETS.filter(t => t.status === 'ПАУЗА').length;

  return (
    <div className="animate-fade" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Page title */}
      <div className="flex items-center gap-3 mb-6">
        <Activity size={22} color="#4f8ef7" />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
            Операционный центр
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Глобальный мониторинг сети клубов</p>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'В РАБОТЕ', value: 12, icon: <Activity size={18} color="#4f8ef7" />, color: '#4f8ef7' },
          { label: 'ЗАВИСЛИ (SLA)', value: 0, icon: <AlertCircle size={18} color="#f59e0b" />, color: '#f59e0b' },
          { label: 'ОЖИДАНИЕ', value: 2, icon: <Clock size={18} color="#f97316" />, color: '#f97316' },
          { label: 'ЗАКРЫТО СЕГОДНЯ', value: 0, icon: <CheckCircle2 size={18} color="#22c55e" />, color: '#22c55e' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {s.icon}
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 24 }}>
        {/* Live feed */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={14} color="#4f8ef7" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Текущая активность линии</span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.05em' }}>LIVEBOARD</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LIVE_TICKETS.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(79,142,247,0.15)', color: '#4f8ef7', border: '1px solid rgba(79,142,247,0.3)', padding: '1px 6px', borderRadius: 3 }}>4YOU</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: t.alert ? 4 : 0 }}>{t.title}</div>
                  {t.alert && (
                    <div style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: 3, display: 'inline-block', marginBottom: 4 }}>{t.alert}</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>↪ {t.assignee}</div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {t.status === 'В РАБОТЕ' ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', letterSpacing: '0.04em' }}>В РАБОТЕ</span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>ПАУЗА</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Managers */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Нагрузка менеджеров</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {MANAGERS.map(m => {
              const total = m.work + m.pause + m.wait;
              const isFree = m.status === 'СВОБОДЕН';
              return (
                <div key={m.name}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</span>
                    <StatusBadge status={m.status} />
                  </div>
                  {!isFree && (
                    <div style={{ width: '100%', height: 3, background: 'var(--bg-secondary)', borderRadius: 2, marginBottom: 4 }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (total / 10) * 100)}%`, background: 'linear-gradient(90deg, #4f8ef7, #9b5de5)', borderRadius: 2 }}></div>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    РАБ: {m.work} / ПАУЗА: {m.pause} / ОЖИД: {m.wait}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Club summary */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>⚡ Сводка по клубам</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {CLUBS_SUMMARY.map(c => (
            <div key={c.name} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }}></div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{c.total}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>ЗАЯВОК ВСЕГО</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ЗАКРЫТО: <span style={{ color: '#22c55e', fontWeight: 600 }}>{c.closed}</span></div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>В ПРОЦЕССЕ: <span style={{ color: c.color, fontWeight: 600 }}>{c.active}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
