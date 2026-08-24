import React from 'react';
import { Link } from 'react-router-dom';
import {
  Repeat, ClipboardList, AlertTriangle, Bell, Star, CalendarClock,
  MessageSquare, Check, Eye, Clock, CornerDownRight, Send, Users, Image as ImageIcon, ArrowRight, Lock,
} from 'lucide-react';

/*
 * Богатая карточка-анонс функции «Передача смены».
 * Рендерится в ленте новостей, когда у поста template === 'shift-board'.
 * Тема-независима: базовые цвета через CSS-переменные (--bg-*, --border, --text-*),
 * акценты типов записей — фиксированные hex (одинаково смотрятся в тёмной/светлой).
 */

const C = { blue: '#5580A8', amber: '#C08F4F', red: '#B06A6A', violet: '#7D6FB3', gold: '#C4A75A', green: '#5F9C81', purple: '#7D6FB3' };

const TYPES = [
  { icon: Repeat,        label: 'Передача смены',   color: C.blue },
  { icon: ClipboardList, label: 'Поручение',        color: C.amber },
  { icon: AlertTriangle, label: 'Неисправность',    color: C.red },
  { icon: Bell,          label: 'Напоминание',      color: C.violet },
  { icon: Star,          label: 'Важное',           color: C.gold },
  { icon: CalendarClock, label: 'Для след. смены',  color: C.green },
];

const FEATURES = [
  { icon: MessageSquare, title: 'Обсуждение в ветке', text: 'Под каждой записью — переписка, как в Slack. Уточнили, договорились — и всё в одном месте.' },
  { icon: Check,         title: 'Чек-листы и «Ознакомлен»', text: 'Поручения с пунктами и галочками. Видно, кто прочитал; важное закрепляется сверху.' },
  { icon: ImageIcon,     title: 'Фото в записи', text: 'Прикрепляйте фото поломки или зала — без пересылок в мессенджеры.' },
  { icon: Users,         title: 'Кто на смене', text: 'Справа — кто сегодня работает по графику, и живая статистика доски.' },
];

const ShiftBoardAnnounce = () => {
  return (
    <div style={{ marginTop: 4 }}>
      {/* Eyebrow */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.purple, background: 'rgba(125,111,179,0.12)', border: '1px solid rgba(125,111,179,0.28)', padding: '5px 11px', borderRadius: 999, marginBottom: 12 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.purple, display: 'inline-block' }} /> Что нового
      </div>

      {/* Title + lede */}
      <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(24px,4.5vw,34px)', lineHeight: 1.05, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
        Доска задач — <span style={{ color: C.purple }}>общий центр</span> смены
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-secondary)', fontWeight: 500, maxWidth: 620 }}>
        Больше не нужно держать всё в голове и в переписках. У каждой смены — <b style={{ color: 'var(--text-primary)' }}>единая доска</b>: передачи, поручения, неисправности и напоминания на виду у всей команды клуба. А под каждой записью можно <b style={{ color: 'var(--text-primary)' }}>обсуждать прямо в ветке</b>, как в Slack.
      </p>

      {/* Board preview */}
      <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 18, padding: 14, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.red }} />
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.amber }} />
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.green }} />
          <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-muted)' }}>Доска задач · 4YOU</span>
          <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: C.purple, background: 'rgba(125,111,179,0.12)', padding: '3px 9px', borderRadius: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Сегодня</span>
        </div>

        {/* Issue card + thread */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${C.red}`, borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 27, height: 27, borderRadius: 9, background: 'rgba(176,106,106,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlertTriangle size={14} color={C.red} /></span>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 900, color: C.red }}>Неисправность</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>Дильшат · управляющий</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> 19:02</span>
          </div>
          <p style={{ margin: '9px 0 0', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>Беговая дорожка №3 глючит — то останавливается, то сбрасывает скорость. Передайте в инженерную.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Eye size={11} /> Прочитали 5</span>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: C.purple, background: 'rgba(125,111,179,0.12)', border: '1px solid rgba(125,111,179,0.35)', padding: '4px 9px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 5 }}><MessageSquare size={11} /> 2 ответа</span>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, color: C.green, background: 'rgba(95,156,129,0.1)', border: '1px solid rgba(95,156,129,0.35)', padding: '4px 9px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check size={11} /> Ознакомлен</span>
          </div>

          {/* thread */}
          <div style={{ marginTop: 11, paddingLeft: 12, borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[{ a: 'И', who: 'Инженер', rl: 'сервис', t: '19:14', m: 'Принял, буду к 20:30. Пока повесьте табличку «не работает».' },
              { a: 'А', who: 'Алексей', rl: 'админ', t: '19:15', m: 'Повесил ✅' }].map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <span style={{ width: 23, height: 23, borderRadius: 8, background: 'rgba(125,111,179,0.14)', color: '#9C8FC4', fontSize: 10.5, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{m.a}</span>
                <div>
                  <div><span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-primary)' }}>{m.who}</span><span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginLeft: 6 }}>{m.rl}</span><span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginLeft: 6 }}>{m.t}</span></div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{m.m}</div>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '7px 10px' }}>
              <CornerDownRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Написать в ветку…</span>
              <span style={{ marginLeft: 'auto', width: 25, height: 25, borderRadius: 8, background: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={12} color="#fff" /></span>
            </div>
          </div>
        </div>
      </div>

      {/* Types */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 9, marginBottom: 20 }}>
        {TYPES.map((t, i) => {
          const Icon = t.icon;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 11px' }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: `${t.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={14} color={t.color} /></span>
              <span style={{ fontSize: 12, fontWeight: 800, color: t.color }}>{t.label}</span>
            </div>
          );
        })}
      </div>

      {/* Features */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginBottom: 20 }}>
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
              <h3 style={{ margin: '0 0 5px', fontSize: 13.5, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 7 }}><Icon size={15} color={C.purple} /> {f.title}</h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, fontWeight: 500 }}>{f.text}</p>
            </div>
          );
        })}
      </div>

      {/* Access */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(120deg,rgba(125,111,179,0.12),rgba(85,128,168,0.06))', border: '1px solid rgba(125,111,179,0.24)', borderRadius: 14, padding: '13px 16px', marginBottom: 18 }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(125,111,179,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Lock size={16} color="#9C8FC4" /></span>
        <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)', fontWeight: 500 }}>Доска доступна <b style={{ color: 'var(--text-primary)' }}>всей команде клуба</b> — управляющим, администраторам и руководству. Каждый видит свой клуб, руководство — все.</span>
      </div>

      {/* CTA */}
      <Link to="/shift-board" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.purple, color: '#fff', fontSize: 13, fontWeight: 800, padding: '11px 18px', borderRadius: 12, textDecoration: 'none' }}>
        Открыть доску <ArrowRight size={15} />
      </Link>
    </div>
  );
};

export default ShiftBoardAnnounce;
