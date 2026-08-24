import React from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, Receipt, Wrench, Handshake, MessageSquare, Building2,
  Link2, ArrowRight, Lock,
} from 'lucide-react';

/*
 * Богатая карточка-анонс раздела «Календарь» (напоминалка по хозяйству клуба).
 * Рендерится в ленте новостей, когда у поста template === 'calendar'.
 * Тема-независима: база через CSS-переменные, акценты — фиксированные hex.
 */

const C = { purple: '#7D6FB3', blue: '#7A94B8', amber: '#f6ad55', green: '#5F9C81' };

const EV_STYLE = {
  amber:  { background: 'rgba(192,143,79,0.12)', border: '1px solid rgba(192,143,79,0.35)' },
  blue:   { background: 'rgba(122,148,184,0.12)', border: '1px solid rgba(122,148,184,0.32)' },
  purple: { background: 'rgba(125,111,179,0.14)', border: '1px solid rgba(125,111,179,0.3)' },
};

// Мини-сетка: [число, день недели, событие?, цвет?]
const DAYS = [
  ['1', 'сб', '💡 Оплата: свет', 'amber'], ['2', 'вс'], ['3', 'пн', '🌐 Оплата: интернет', 'amber'],
  ['4', 'вт', '🔧 ТО кондиционеров', 'blue', true], ['5', 'ср', '💧 Оплата: вода', 'amber'], ['6', 'чт'],
  ['7', 'пт', '🤝 Подрядчик: сауна', 'purple'], ['8', 'сб'], ['9', 'вс'],
  ['10', 'пн', '🔧 ТО дорожек', 'blue'], ['11', 'вт'], ['12', 'ср', '🧯 Огнетушители', 'purple'],
  ['13', 'чт'], ['14', 'пт', '🧾 Аренда: счёт', 'amber'],
];

const FEATURES = [
  { icon: Receipt,   title: 'Ежемесячные оплаты', text: 'Интернет, свет, вода, аренда — на нужное число, с реквизитами в описании. Открыли месяц — видно, что и когда платить.' },
  { icon: Wrench,    title: 'Тех-обслуживание', text: 'ТО тренажёров, кондиционеров, сауны, огнетушители — с контактом мастера и договором по ссылке.' },
  { icon: Handshake, title: 'Подрядчики', text: 'Визиты, ремонты, поставки: кто приедет, во сколько, что подготовить — всё в описании события.' },
  { icon: MessageSquare, title: 'Отметки «сделано»', text: 'Оплатили, встретили, приняли работу — комментарий с именем и временем. Видно, что закрыто, а что нет.' },
];

const CalendarAnnounce = () => {
  return (
    <div style={{ marginTop: 4 }}>
      {/* Eyebrow */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.purple, background: 'rgba(125,111,179,0.12)', border: '1px solid rgba(125,111,179,0.28)', padding: '5px 11px', borderRadius: 999, marginBottom: 12 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.purple, display: 'inline-block' }} /> Новый раздел
      </div>

      {/* Title + lede */}
      <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(24px,4.5vw,34px)', lineHeight: 1.05, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
        Календарь — <span style={{ color: C.purple }}>напоминалка</span> по хозяйству клуба
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-secondary)', fontWeight: 500, maxWidth: 640 }}>
        В меню появился раздел <b style={{ color: 'var(--text-primary)' }}>«Календарь»</b> — память клуба обо всех регулярных делах: <b style={{ color: 'var(--text-primary)' }}>ежемесячные оплаты</b> (интернет, свет, вода), <b style={{ color: 'var(--text-primary)' }}>тех-обслуживание</b> оборудования и <b style={{ color: 'var(--text-primary)' }}>работа с подрядчиками</b>. Занесли один раз — и ничего не забыто. У каждого клуба календарь свой.
      </p>

      {/* Мини-календарь */}
      <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)' }}>Август 2026</span>
          <span style={{ display: 'flex', gap: 4 }}>
            {['4YOU', 'COLIBRI', 'VILLA', 'NURLY'].map((c, i) => (
              <span key={c} style={{ fontSize: 8.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 8px', borderRadius: 7, background: i === 0 ? C.purple : 'var(--bg-card)', color: i === 0 ? '#fff' : 'var(--text-muted)', border: i === 0 ? 'none' : '1px solid var(--border)' }}>{c}</span>
            ))}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {DAYS.map(([num, wd, ev, color, today], i) => (
            <div key={i} style={{ minHeight: 64, padding: '5px 6px', borderRight: (i + 1) % 7 ? '1px solid var(--border)' : 'none', borderBottom: i < 7 ? '1px solid var(--border)' : 'none', background: today ? 'rgba(125,111,179,0.1)' : 'transparent' }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: today ? '#fff' : 'var(--text-primary)', background: today ? C.purple : 'transparent', borderRadius: 6, padding: today ? '2px 6px' : 0 }}>{num}</span>
              <span style={{ fontSize: 7.5, color: 'var(--text-muted)', fontWeight: 900, textTransform: 'uppercase', marginLeft: 4 }}>{wd}</span>
              {ev && (
                <span style={{ display: 'block', fontSize: 8, fontWeight: 700, marginTop: 3, borderRadius: 5, padding: '2px 5px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...EV_STYLE[color] }}>{ev}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <p style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700, margin: '0 0 20px' }}>Весь месяц как на ладони: оплаты, ТО и подрядчики видны прямо в сетке</p>

      {/* Страница дня */}
      <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 18, padding: 14, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>4 августа</span>
          <span style={{ fontSize: 8, fontWeight: 900, background: C.purple, color: '#fff', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.05em' }}>СЕГОДНЯ</span>
          <span style={{ fontSize: 9, fontWeight: 900, color: C.purple, letterSpacing: '0.06em' }}>· 4YOU</span>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)' }}>🔧 ТО кондиционеров (2 раза в год)</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, marginTop: 2 }}>Дильшат · 28 июл 10:12</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 8, lineHeight: 1.5 }}>Подрядчик «КлиматСервис», мастер Ерлан +7 777 123 45 67. Чистка фильтров во всех залах + заправка фреона в кардиозоне. Приедут к 10:00, встретить и открыть техпомещение.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, padding: '7px 10px', background: 'rgba(122,148,184,0.08)', border: '1px solid rgba(122,148,184,0.25)', borderRadius: 8, color: C.blue, fontSize: 10.5, fontWeight: 700, overflow: 'hidden' }}>
            <Link2 size={12} style={{ flexShrink: 0 }} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>https://docs.google.com/…/договор-климатсервис</span>
          </div>
          <div style={{ background: 'var(--bg-hover)', borderRadius: 8, padding: '7px 10px', marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>Ерлану позвонила, подтвердил на 10:00 ✅</div>
            <div style={{ fontSize: 8.5, color: 'var(--text-muted)', fontWeight: 800, marginTop: 2 }}>Дана · вчера 17:02</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)' }}>🌐 Оплата интернета — до 5 числа</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, marginTop: 2 }}>Дильшат · 1 авг 09:00</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 8, lineHeight: 1.5 }}>Билайн Бизнес, договор №4821. Счёт приходит на почту клуба, оплатить и скинуть чек бухгалтеру.</div>
          <div style={{ background: 'var(--bg-hover)', borderRadius: 8, padding: '7px 10px', marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>Оплачено, чек отправила ✅</div>
            <div style={{ fontSize: 8.5, color: 'var(--text-muted)', fontWeight: 800, marginTop: 2 }}>Салтанат · 11:20</div>
          </div>
        </div>
      </div>
      <p style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700, margin: '0 0 20px' }}>Клик по дню — страница дня: кто подрядчик, что делать, договор по ссылке и отметки «сделано»</p>

      {/* Возможности */}
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

      {/* Доступ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(120deg,rgba(125,111,179,0.12),rgba(122,148,184,0.06))', border: '1px solid rgba(125,111,179,0.24)', borderRadius: 14, padding: '13px 16px', marginBottom: 18 }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(125,111,179,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Building2 size={16} color="#9C8FC4" /></span>
        <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)', fontWeight: 500 }}><b style={{ color: 'var(--text-primary)' }}>У каждого клуба — свой календарь.</b> Менеджер ведёт хозяйство своего клуба, руководство переключается между клубами и видит всю сеть. Менеджеры, занесите оплаты и ТО на август — пусть календарь помнит за вас.</span>
      </div>

      {/* CTA */}
      <Link to="/calendar" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.purple, color: '#fff', fontSize: 13, fontWeight: 800, padding: '11px 18px', borderRadius: 12, textDecoration: 'none' }}>
        <CalendarDays size={15} /> Открыть календарь <ArrowRight size={15} />
      </Link>
    </div>
  );
};

export default CalendarAnnounce;
