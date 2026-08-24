import React from 'react';
import { Link } from 'react-router-dom';
import {
  Package, ClipboardEdit, ShoppingCart, Truck, Undo2, ArrowRight,
} from 'lucide-react';

/*
 * Богатая карточка-анонс «Размерная сетка на складе».
 * Рендерится в ленте новостей, когда у поста template === 'merch-sizes'.
 * Тема-независима: база через CSS-переменные, акценты — фиксированные hex.
 */

const C = { purple: '#7D6FB3', purpleSoft: '#9C8FC4', green: '#5F9C81', red: '#B06A6A' };

const SIZE_CHIP = {
  fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6,
  background: 'rgba(125,111,179,0.13)', color: C.purpleSoft, border: '1px solid var(--border)',
};
const SIZE_CHIP_ZERO = {
  ...SIZE_CHIP, background: 'rgba(176,106,106,0.12)', color: C.red,
};

const MINI = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' };

const FEATURES = [
  { icon: ClipboardEdit, title: 'Включается в товаре', text: 'В карточке товара — переключатель «Размерная сетка»: вписываете остатки по размерам XS–3XL, общий остаток считается автоматически.' },
  { icon: ShoppingCart, title: 'Продажа по размеру', text: 'Кнопки размеров с остатками прямо в форме продажи — и в Складе, и в Продажах. Бесплатные выдачи — тоже с размером.' },
  { icon: Truck, title: 'Поставки и перемещения', text: 'Приход — на конкретный размер. Перемещение между студиями увозит выбранный размер и приходит в него же при приёмке.' },
  { icon: Undo2, title: 'Возвраты и отчёты', text: 'Возврат восстанавливает именно проданный размер. В истории продаж и Excel-отчёте виден размер каждого чека.' },
];

const SzBtn = ({ label, count, on }) => (
  <span style={{
    fontSize: 11, fontWeight: 900, padding: '8px 13px', borderRadius: 10,
    background: on ? C.purple : 'var(--bg-card)', color: on ? '#fff' : 'var(--text-secondary)',
    border: '1px solid ' + (on ? C.purple : 'var(--border)'),
  }}>
    {label}{count != null && <span style={{ opacity: 0.7, fontWeight: 700 }}> ·{count}</span>}
  </span>
);

const SizesAnnounce = () => {
  return (
    <div style={{ marginTop: 4 }}>
      {/* Eyebrow */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.purple, background: 'rgba(125,111,179,0.12)', border: '1px solid rgba(125,111,179,0.28)', padding: '5px 11px', borderRadius: 999, marginBottom: 12 }}>
        <Package size={11} /> Обновление склада
      </div>

      {/* Title + lede */}
      <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(24px,4.5vw,34px)', lineHeight: 1.05, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
        Размерная сетка — <span style={{ color: C.purple }}>одна карточка</span> на модель
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-secondary)', fontWeight: 500, maxWidth: 640 }}>
        Больше никаких «Hoodie M», «Hoodie L», «Hoodie XL» тремя отдельными товарами. Теперь у товара есть <b style={{ color: 'var(--text-primary)' }}>размерная сетка</b>: одна карточка модели, внутри — остатки по каждому размеру. Продажи, поставки и перемещения идут с выбором размера, общий остаток считается сам.
      </p>

      {/* Было / Стало */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginBottom: 8 }}>
        <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.red, marginBottom: 8 }}>✕ Было — 3 карточки</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['M', 'L', 'XL'].map((s, i) => (
              <div key={s} style={MINI}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)' }}>Hoodie Black Edition {s}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>Худи · 4YOU · {[5, 8, 2][i]} шт</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.green, marginBottom: 8 }}>✓ Стало — одна карточка</div>
          <div style={MINI}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)' }}>Hoodie Black Edition</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>Худи · 4YOU · 15 шт всего</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              <span style={SIZE_CHIP}>S·0</span>
              <span style={SIZE_CHIP}>M·5</span>
              <span style={SIZE_CHIP}>L·8</span>
              <span style={SIZE_CHIP}>XL·2</span>
              <span style={SIZE_CHIP_ZERO}>XXL·0</span>
            </div>
          </div>
        </div>
      </div>
      <p style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700, margin: '0 0 20px' }}>Остатки по размерам видны прямо на карточке товара</p>

      {/* Макет продажи */}
      <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 8, maxWidth: 440 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-primary)' }}>Продажа: Hoodie Black Edition</div>
        <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '10px 0 6px' }}>Размер</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <SzBtn label="M" count={5} />
          <SzBtn label="L" count={8} on />
          <SzBtn label="XL" count={2} />
        </div>
        <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '10px 0 6px' }}>Кол-во · Цена · Оплата</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <SzBtn label="1 шт" />
          <SzBtn label="18 000 ₸" />
          <SzBtn label="Kaspi" />
        </div>
      </div>
      <p style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700, margin: '0 0 20px' }}>При продаже выбираете размер — списание идёт именно с него, продать больше остатка размера нельзя</p>

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

      {/* Как перейти */}
      <div style={{ background: 'linear-gradient(120deg,rgba(125,111,179,0.12),rgba(95,156,129,0.05))', border: '1px solid rgba(125,111,179,0.24)', borderRadius: 14, padding: '13px 16px', marginBottom: 18, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)', fontWeight: 500 }}>
        <b style={{ color: 'var(--text-primary)' }}>Как перейти:</b> старые товары работают как раньше. Постепенно объединяйте: создайте одну карточку модели с сеткой, впишите остатки по размерам из старых карточек — и удалите старые. Инвентаризация сеточных товаров — правкой размеров в карточке («Изменить»), в Пересорте они помечены отдельно.
      </div>

      {/* CTA */}
      <Link to="/merch" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.purple, color: '#fff', fontSize: 13, fontWeight: 800, padding: '11px 18px', borderRadius: 12, textDecoration: 'none' }}>
        <Package size={15} /> Открыть склад <ArrowRight size={15} />
      </Link>
    </div>
  );
};

export default SizesAnnounce;
