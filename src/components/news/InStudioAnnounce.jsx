import React from 'react';
import { Link } from 'react-router-dom';
import {
  MonitorSmartphone, MessageSquare, Timer, User, Paperclip,
  ClipboardList, RefreshCw, ArrowRight, Bell,
} from 'lucide-react';

/*
 * Богатая карточка-анонс раздела «InStudio» (заявки по технике для разработчиков).
 * Рендерится в ленте новостей, когда у поста template === 'instudio'.
 * Стиль строгий, приглушённый — как сам раздел.
 */

const C = { amber: '#b39a5e', green: '#7d9c87', grey: '#8a94a6', purple: '#7D6FB3' };

const FEATURES = [
  { icon: ClipboardList, title: 'Заявка за минуту', text: 'Студия, зона, тип проблемы, заголовок и максимально подробное описание. Приоритет и отметка «повторяющаяся» — чтобы разработчики видели, что горит.' },
  { icon: RefreshCw, title: 'Неисправности — сами', text: 'Запись «Неисправность» с Доски задач автоматически падает заявкой в InStudio. Ничего дублировать не нужно.' },
  { icon: MessageSquare, title: 'Обсуждение внутри задачи', text: 'Клик по задаче открывает окно: чат с разработчиком, фото вложения, редактирование сообщений. Никаких переписок на стороне.' },
  { icon: Bell, title: 'Вы в курсе', text: 'Push, когда вашу заявку взяли в работу, выполнили или написали в обсуждение. Виден ответственный и сколько времени задача в работе.' },
];

const InStudioAnnounce = () => {
  return (
    <div style={{ marginTop: 4 }}>
      {/* Eyebrow */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.purple, background: 'rgba(125,111,179,0.12)', border: '1px solid rgba(125,111,179,0.28)', padding: '5px 11px', borderRadius: 999, marginBottom: 12 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.purple, display: 'inline-block' }} /> Новый раздел
      </div>

      {/* Title + lede */}
      <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(24px,4.5vw,34px)', lineHeight: 1.05, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
        InStudio — <span style={{ color: C.purple }}>техника и софт</span> чинятся по заявке
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-secondary)', fontWeight: 500, maxWidth: 640 }}>
        В меню появился раздел <b style={{ color: 'var(--text-primary)' }}>«InStudio»</b>. Планшеты, турникеты, POS-панель, пульсометры, звук, свет, WASP — всё, что сломалось или глючит, теперь оформляется заявкой и попадает <b style={{ color: 'var(--text-primary)' }}>напрямую команде разработки</b>. Видно, кто взял задачу, что с ней происходит и сколько она в работе.
      </p>

      {/* Макет карточки задачи */}
      <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, marginBottom: 8, maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.amber }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.amber }} /> В работе
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>4YOU</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800, color: '#b07a6a', textTransform: 'uppercase' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#b07a6a' }} /> Высокий
          </span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>Планшеты зависают во время тренировки</div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 3 }}>Проблема с планшетами · Тренажёрный зал</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          <span>Тимур · 5 авг 10:20</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: C.amber, fontWeight: 700 }}>· <Timer size={10} /> в работе 2ч 15м</span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 7, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
          <User size={11} /> Нурали
        </div>
        {/* мини-чат */}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ alignSelf: 'flex-start', maxWidth: '85%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '7px 10px' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-primary)' }}>Нурали</span>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 2 }}>Какая модель планшета? Скиньте фото экрана в момент зависания</div>
          </div>
          <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '7px 10px' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-primary)' }}>Тимур</span>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}><Paperclip size={11} /> Фото приложил, зал Меткон, станция 4</div>
          </div>
        </div>
      </div>
      <p style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700, margin: '0 0 20px', maxWidth: 560 }}>Клик по задаче — окно с обсуждением: чат, фото, статусы и таймер работы</p>

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

      {/* Как пользоваться */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(120deg,rgba(125,111,179,0.12),rgba(138,148,166,0.06))', border: '1px solid rgba(125,111,179,0.24)', borderRadius: 14, padding: '13px 16px', marginBottom: 18 }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(125,111,179,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><MonitorSmartphone size={16} color="#9C8FC4" /></span>
        <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)', fontWeight: 500 }}>
          <b style={{ color: 'var(--text-primary)' }}>Правило простое:</b> сломалась техника или глючит софт — сразу заявка в InStudio с подробным описанием (или «Неисправность» на Доске задач — она попадёт туда сама). Чем подробнее описание и фото, тем быстрее починят.
        </span>
      </div>

      {/* CTA */}
      <Link to="/instudio" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.purple, color: '#fff', fontSize: 13, fontWeight: 800, padding: '11px 18px', borderRadius: 12, textDecoration: 'none' }}>
        <MonitorSmartphone size={15} /> Открыть InStudio <ArrowRight size={15} />
      </Link>
    </div>
  );
};

export default InStudioAnnounce;
