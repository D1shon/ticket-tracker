import React, { useState } from 'react';
import { User, Mail, Globe, Bell, Shield, LogOut, CheckCircle2, Sliders } from 'lucide-react';
import { useTickets } from '../store/TicketContext';

const SettingsPage = () => {
  const { user, logout } = useTickets();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [emailReports, setEmailReports] = useState(false);

  // User details from context
  const userName = user?.displayName || "Пользователь";
  const userEmail = user?.email || "—";
  const userRole = user?.role?.toUpperCase() || "ADMIN";
  const userClub = user?.club || "Все Клубы";

  const CLUBS = [
    { name: '4YOU', color: '#4f8ef7' },
    { name: 'COLIBRI', color: '#9b5de5' },
    { name: 'VILLA', color: '#f59e0b' },
    { name: 'NURLY ORDA', color: '#22c55e' },
  ];

  const Toggle = ({ enabled, setEnabled }) => (
    <button 
      onClick={() => setEnabled(!enabled)}
      style={{
        width: 44, height: 24, borderRadius: 12, background: enabled ? 'var(--accent-purple)' : 'var(--bg-hover)',
        position: 'relative', border: enabled ? 'none' : '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: enabled ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }} />
    </button>
  );

  return (
    <div className="animate-fade" style={{ maxWidth: 1000, margin: '0 auto', padding: '10px 0 40px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Sliders size={24} color="var(--accent-purple)" />
          <h1 style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
            Настройки
          </h1>
        </div>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Управление профилем и конфигурация сети
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24, marginBottom: 40 }}>
        {/* Profile Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 28, padding: 32, display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--accent-purple-bg)', border: '1px solid var(--accent-purple-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={32} color="var(--accent-purple)" />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>{userName}</h2>
              <span style={{ fontSize: 10, fontWeight: 800, background: 'var(--accent-purple)', color: '#fff', padding: '4px 10px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {userRole}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'var(--bg-hover)', borderRadius: 16, border: '1px solid var(--border)' }}>
              <Mail size={14} color="var(--text-muted)" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: 60 }}>Email</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginLeft: 'auto' }}>{userEmail}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'var(--bg-hover)', borderRadius: 16, border: '1px solid var(--border)' }}>
              <Globe size={14} color="var(--text-muted)" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: 120 }}>Привязанный клуб</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginLeft: 'auto' }}>{userClub}</span>
            </div>
          </div>

          <button 
            onClick={logout}
            style={{
              marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '16px', borderRadius: 18, background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.05em'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--accent-purple)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <LogOut size={16} />
            Выйти из системы
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Notifications Card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 28, padding: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
              <Bell size={16} color="var(--accent-purple)" />
              <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Уведомления</h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', itemsCenter: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Push-уведомления</h4>
                  <p style={{ fontSize: 11, color: pushEnabled ? '#22c55e' : 'var(--text-muted)', fontWeight: 600 }}>{pushEnabled ? '✓ Включены' : '× Отключены'}</p>
                </div>
                <Toggle enabled={pushEnabled} setEnabled={setPushEnabled} />
              </div>
              <div style={{ display: 'flex', itemsCenter: 'center', justifyContent: 'space-between' }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Звуковые алерты (SLA)</h4>
                <Toggle enabled={soundEnabled} setEnabled={setSoundEnabled} />
              </div>
              <div style={{ display: 'flex', itemsCenter: 'center', justifyContent: 'space-between' }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>E-mail отчеты</h4>
                <Toggle enabled={emailReports} setEnabled={setEmailReports} />
              </div>
            </div>
          </div>

          {/* Security Card */}
          <div style={{ background: 'linear-gradient(135deg, rgba(123,61,255,0.1), rgba(0,0,0,0))', border: '1px solid var(--border)', borderRadius: 28, padding: 32, position: 'relative', overflow: 'hidden' }}>
            <Shield size={80} style={{ position: 'absolute', right: -10, bottom: -10, opacity: 0.05, color: 'var(--accent-purple)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-purple)' }} />
              <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Статус безопасности</h3>
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6, maxWidth: '85%' }}>
              Ваш аккаунт имеет права «Главного менеджера». Вам доступен мониторинг всех линий.
            </p>
          </div>
        </div>
      </div>

      {/* Network Management */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 32, padding: 40 }}>
        <h2 style={{ fontSize: 24, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', marginBottom: 8, textTransform: 'uppercase' }}>
          Управление сетью
        </h2>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 32 }}>
          Конфигурация объектов мониторинга
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
          {CLUBS.map(club => (
            <div key={club.name} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 20, padding: 24, transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4 style={{ fontSize: 15, fontWeight: 900, fontStyle: 'italic', color: club.color }}>{club.name}</h4>
                <div style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                  <CheckCircle2 size={12} color="var(--text-muted)" />
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Status: OK</div>
              <div style={{ width: '100%', height: 4, background: 'var(--bg-card)', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ width: '100%', height: '100%', background: club.color, opacity: 0.8 }} />
              </div>
            </div>
          ))}
        </div>
      {/* ── Команда ── */}
      {userRole !== 'ADMIN' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 32, padding: 40, marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Shield size={22} color="var(--accent-purple)" />
            <h2 style={{ fontSize: 24, fontWeight: 900, fontStyle: 'italic', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
              Команда
            </h2>
          </div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 32 }}>
            Зарегистрированные пользователи и их права доступа
          </p>

          {/* Chefs */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ fontSize: 10, fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Шеф · Полный доступ
              </span>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 16, padding: '12px 16px', marginBottom: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1.6 }}>
              Видит все клубы · Все заявки · График и финансы всех · Управление командой · Архив
            </div>
            {[
              { name: 'Дильшат', email: 'dilshat.r@hj.fit' },
              { name: 'Магжан',  email: 'magzhan@hj.fit' },
            ].map(u => (
              <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14, background: 'var(--bg-hover)', border: '1px solid var(--border)', marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: '#f59e0b', flexShrink: 0 }}>{u.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{u.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{u.email}</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 900, background: '#f59e0b', color: '#000', padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>ШЕФ</span>
              </div>
            ))}
          </div>

          {/* Clubs with managers */}
          {[
            {
              club: '4YOU', color: '#4f8ef7',
              desc: 'Видит заявки своего клуба · График · Чекин · Чек-листы',
              members: [
                { name: 'Сания',  email: 'saniya@hj.fit' },
                { name: 'Тимур',  email: 'kurbanovtimur585@gmail.com' },
                { name: 'Нурлы',  email: 'nurly@hj.fit' },
              ]
            },
            {
              club: 'COLIBRI', color: '#9b5de5',
              desc: 'Видит заявки своего клуба · График · Чекин · Чек-листы',
              members: [
                { name: 'Анастасия', email: '19.anastasiya.tkachenko.88@gmail.com' },
                { name: 'Аружан',    email: 'daewure@mail.ru' },
                { name: 'Диас',      email: 'diasbakyt3773@gmail.com' },
              ]
            },
            {
              club: 'VILLA', color: '#f59e0b',
              desc: 'Видит заявки своего клуба · График · Чекин · Чек-листы',
              members: [
                { name: 'Алина',    email: 'kelessovaan@gmail.com' },
                { name: 'Салтанат', email: 'blinsalta19@gmail.com' },
                { name: 'Диас',     email: 'diassd9806@gmail.com' },
              ]
            },
            {
              club: 'NURLY ORDA', color: '#22c55e',
              desc: 'Видит заявки своего клуба · График · Чекин · Чек-листы',
              members: [
                { name: 'Айнур', email: 'ainura030594@gmail.com' },
                { name: 'Азиз',  email: 'azimuus@gmail.com' },
              ]
            },
          ].map(section => (
            <div key={section.club} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: section.color }} />
                <span style={{ fontSize: 10, fontWeight: 900, color: section.color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {section.club} · Менеджер
                </span>
              </div>
              <div style={{ background: `${section.color}08`, border: `1px solid ${section.color}20`, borderRadius: 16, padding: '12px 16px', marginBottom: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1.6 }}>
                {section.desc}
              </div>
              {section.members.map(u => (
                <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14, background: 'var(--bg-hover)', border: '1px solid var(--border)', marginBottom: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: `${section.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: section.color, flexShrink: 0 }}>{u.name[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{u.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{u.email}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 900, background: `${section.color}20`, color: section.color, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>МЕН.</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
};

export default SettingsPage;
