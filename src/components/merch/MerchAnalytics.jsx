import { useMemo, useState, useRef, useEffect } from 'react';
import {
  format, startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, endOfMonth,
  subMonths, startOfYear, differenceInCalendarDays, eachDayOfInterval, eachWeekOfInterval,
  eachMonthOfInterval,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// Вкладка «Аналитика» на Складе — только шеф и маркетинг (гейт в MerchPage).
// Считает по merch_sales, которые MerchPage уже держит подпиской — своей подписки нет.
//
// Что считается продажей: qty > 0, не пересорт, не поставка, не возврат, не бесплатная выдача.
// Бесплатные выдачи и возвраты показаны отдельными плитками.

const NOT_SALES = new Set(['Пересорт', 'Складская поставка']);

const PRESETS = [
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
  { id: '90d', label: '90 дней' },
  { id: 'month', label: 'Этот месяц' },
  { id: 'prevMonth', label: 'Прошлый месяц' },
  { id: 'year', label: 'С начала года' },
  { id: 'all', label: 'Всё время' },
];

const METRICS = [
  { id: 'revenue', label: 'Выручка' },
  { id: 'qty', label: 'Штуки' },
  { id: 'profit', label: 'Прибыль', cost: true },
];

const SPLITS = [
  { id: 'total', label: 'Всего' },
  { id: 'category', label: 'По видам' },
  { id: 'club', label: 'По клубам' },
  { id: 'product', label: 'По товарам' }, // только когда выбраны конкретные товары
];

// Цвет закреплён за сущностью (индекс в справочнике), а не за местом в топе —
// при смене фильтров клуб/вид не перекрашивается.
const seriesColor = (i) => `var(--series-${(i % 8) + 1})`;

const saleDate = (s) => {
  if (!s.createdAt) return null;
  return s.createdAt.seconds ? new Date(s.createdAt.seconds * 1000) : new Date(s.createdAt);
};

const money = (n) => `${Math.round(n || 0).toLocaleString('ru-RU')} ₸`;
const compact = (n, metric) => {
  const a = Math.abs(n);
  const suffix = metric === 'qty' ? '' : ' ₸';
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн${suffix}`;
  if (a >= 1e3) return `${(n / 1e3).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} тыс${suffix}`;
  return `${Math.round(n).toLocaleString('ru-RU')}${suffix}`;
};
const fmtMetric = (n, metric) => (metric === 'qty' ? `${Math.round(n).toLocaleString('ru-RU')} шт` : money(n));

const metricOf = (s, metric) => {
  if (metric === 'qty') return s.qty || 0;
  if (metric === 'profit') return s.netProfit || 0;
  return s.totalSum || 0;
};

function rangeFor(preset, customFrom, customTo, earliest) {
  const today = new Date();
  switch (preset) {
    case '7d': return [startOfDay(subDays(today, 6)), endOfDay(today)];
    case '30d': return [startOfDay(subDays(today, 29)), endOfDay(today)];
    case '90d': return [startOfDay(subDays(today, 89)), endOfDay(today)];
    case 'month': return [startOfMonth(today), endOfDay(today)];
    case 'prevMonth': { const p = subMonths(today, 1); return [startOfMonth(p), endOfMonth(p)]; }
    case 'year': return [startOfYear(today), endOfDay(today)];
    case 'all': return [startOfDay(earliest || subDays(today, 29)), endOfDay(today)];
    default: {
      const f = customFrom ? startOfDay(new Date(customFrom + 'T00:00:00')) : startOfDay(subDays(today, 29));
      const t = customTo ? endOfDay(new Date(customTo + 'T00:00:00')) : endOfDay(today);
      return f <= t ? [f, t] : [startOfDay(t), endOfDay(f)];
    }
  }
}

// Шаг графика: до 45 дней — по дням, до ~полугода — по неделям, дальше — по месяцам
function bucketsFor(from, to) {
  const days = differenceInCalendarDays(to, from) + 1;
  if (days <= 45) {
    return { unit: 'day', keys: eachDayOfInterval({ start: from, end: to }), keyOf: (d) => startOfDay(d).getTime(), label: (d) => format(d, 'd MMM', { locale: ru }) };
  }
  if (days <= 190) {
    const wk = (d) => startOfWeek(d, { weekStartsOn: 1 });
    return { unit: 'week', keys: eachWeekOfInterval({ start: from, end: to }, { weekStartsOn: 1 }), keyOf: (d) => wk(d).getTime(), label: (d) => `нед. ${format(d, 'd MMM', { locale: ru })}` };
  }
  return { unit: 'month', keys: eachMonthOfInterval({ start: from, end: to }), keyOf: (d) => startOfMonth(d).getTime(), label: (d) => format(d, 'LLL yyyy', { locale: ru }) };
}

const pill = (active) =>
  `shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${active
    ? 'bg-[var(--accent-purple)] text-white border-transparent'
    : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)]'}`;

const Card = ({ title, children, right }) => (
  <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 shadow-md min-w-0">
    {(title || right) && (
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)]">{title}</div>
        {right}
      </div>
    )}
    {children}
  </div>
);

const Delta = ({ cur, prev }) => {
  if (!prev) return <span className="text-[10px] font-bold text-[var(--text-muted)]">нет базы для сравнения</span>;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const Icon = Math.abs(pct) < 0.5 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const color = Math.abs(pct) < 0.5 ? 'var(--text-muted)' : pct > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color }}>
      <Icon size={12} />{pct > 0 ? '+' : ''}{pct.toFixed(0)}% к прошлому периоду
    </span>
  );
};

const Kpi = ({ label, value, cur, prev, hint }) => (
  <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 shadow-md min-w-0">
    <div className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1">{label}</div>
    <div className="text-xl font-black text-[var(--text-primary)] truncate">{value}</div>
    <div className="mt-1 min-h-[16px]">
      {hint ? <span className="text-[10px] font-bold text-[var(--text-muted)]">{hint}</span> : <Delta cur={cur} prev={prev} />}
    </div>
  </div>
);

// ─── Линейный график с перекрестием и тултипом ──────────────────────────────
function LineChart({ labels, series, metric }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 260, padL = 64, padR = 12, padT = 12, padB = 28;
  const n = labels.length;
  const max = Math.max(0, ...series.flatMap(s => s.values));
  const min = Math.min(0, ...series.flatMap(s => s.values));
  const step = niceStep((max - min) / 4 || 1);
  const yMax = Math.ceil(max / step) * step || step;
  const yMin = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(v);
  const innerW = width - padL - padR, innerH = H - padT - padB;
  const x = (i) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 80))));

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round(((px - padL) / innerW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const tipRows = hover == null ? [] : series
    .map(s => ({ name: s.name, color: s.color, v: s.values[hover] }))
    .sort((a, b) => b.v - a.v);
  const tipLeft = hover == null ? 0 : x(hover);
  const flip = tipLeft > width * 0.6;

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg width={width} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={(e) => onMove(e.touches[0] ? { currentTarget: e.currentTarget, clientX: e.touches[0].clientX } : e)} role="img" aria-label="Динамика продаж">
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--text-muted)">{compact(t, metric)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % labelEvery === 0 || i === n - 1) && (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize={10} fill="var(--text-muted)">{l}</text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3 3" />}
        {series.map(s => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        ))}
        {n <= 31 && series.length === 1 && series[0].values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={series[0].color} />
        ))}
        {hover != null && series.map(s => (
          <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={s.color} stroke="var(--bg-card)" strokeWidth={2} />
        ))}
      </svg>
      {hover != null && (
        <div className="absolute pointer-events-none z-10 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg px-3 py-2 text-[11px] min-w-[160px]"
          style={{ top: 8, left: flip ? undefined : tipLeft + 12, right: flip ? width - tipLeft + 12 : undefined }}>
          <div className="font-black text-[var(--text-primary)] mb-1">{labels[hover]}</div>
          {tipRows.map(r => (
            <div key={r.name} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: r.color }} />{r.name}</span>
              <span className="font-bold text-[var(--text-primary)]">{fmtMetric(r.v, metric)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

// ─── Горизонтальные бары (значения подписаны прямо у бара) ────────────────────
function BarList({ rows, metric, total }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value)));
  if (!rows.length) return <Empty />;
  return (
    <div className="flex flex-col gap-2">
      {rows.map(r => (
        <div key={r.name} onMouseEnter={() => setHover(r.name)} onMouseLeave={() => setHover(null)}
          className="grid grid-cols-[minmax(80px,30%)_1fr_auto] items-center gap-3 py-0.5"
          style={{ opacity: hover && hover !== r.name ? 0.55 : 1 }}>
          <span className="text-xs font-bold text-[var(--text-primary)] truncate flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />{r.name}
          </span>
          <div className="h-3.5 rounded bg-[var(--bg-hover)] overflow-hidden">
            <div className="h-full" style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: r.color, borderRadius: '0 4px 4px 0' }} />
          </div>
          <span className="text-[11px] font-bold text-[var(--text-secondary)] whitespace-nowrap tabular-nums">
            {fmtMetric(r.value, metric)}{total ? <span className="text-[var(--text-muted)]"> · {((r.value / total) * 100).toFixed(0)}%</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

const Empty = () => <div className="text-xs font-bold text-[var(--text-muted)] py-8 text-center">Нет продаж за выбранный период и фильтры</div>;

// ─── Страница ────────────────────────────────────────────────────────────────
export default function MerchAnalytics({ sales, clubs, categories, canSeeCost }) {
  const [preset, setPreset] = useState('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selClubs, setSelClubs] = useState([]); // пусто = все
  const [selCats, setSelCats] = useState([]);
  const [selProducts, setSelProducts] = useState([]); // названия товаров; пусто = все
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [metric, setMetric] = useState('revenue');
  const [split, setSplit] = useState('category');
  const [hiddenSeries, setHiddenSeries] = useState([]);
  const [topLimit, setTopLimit] = useState(15);

  const catOf = (s) => (categories.includes(s.category) ? s.category : 'Другое');

  // Только реальные продажи, с датой
  const realSales = useMemo(() => sales
    .filter(s => (s.qty || 0) > 0 && !NOT_SALES.has(s.paymentMethod) && !s.returned && !s.isFree)
    .map(s => ({ ...s, _d: saleDate(s) }))
    .filter(s => s._d), [sales]);

  const earliest = useMemo(() => realSales.reduce((m, s) => (!m || s._d < m ? s._d : m), null), [realSales]);
  const [from, to] = useMemo(() => rangeFor(preset, customFrom, customTo, earliest), [preset, customFrom, customTo, earliest]);
  const prevRange = useMemo(() => {
    const days = differenceInCalendarDays(to, from) + 1;
    return [startOfDay(subDays(from, days)), endOfDay(subDays(from, 1))];
  }, [from, to]);

  const passFilters = (s) =>
    (!selClubs.length || selClubs.includes(s.club))
    && (!selCats.length || selCats.includes(catOf(s)))
    && (!selProducts.length || selProducts.includes(s.productName));

  const cur = useMemo(() => realSales.filter(s => s._d >= from && s._d <= to && passFilters(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [realSales, from, to, selClubs, selCats, selProducts]);
  const prev = useMemo(() => realSales.filter(s => s._d >= prevRange[0] && s._d <= prevRange[1] && passFilters(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [realSales, prevRange, selClubs, selCats, selProducts]);

  // Бесплатные выдачи и возвраты — в том же периоде и фильтрах
  const extras = useMemo(() => {
    let freeQty = 0, freeCost = 0, retCount = 0, retSum = 0;
    for (const s of sales) {
      if ((s.qty || 0) <= 0 || NOT_SALES.has(s.paymentMethod) || !passFilters(s)) continue;
      if (s.isFree && !s.returned) {
        const d = saleDate(s);
        if (d && d >= from && d <= to) { freeQty += s.qty || 0; freeCost += (s.qty || 0) * (s.costPrice || 0); }
      }
      if (s.returned) {
        const d = s.returnedAtISO ? new Date(s.returnedAtISO) : saleDate(s);
        if (d && d >= from && d <= to) { retCount += 1; retSum += s.totalSum || 0; }
      }
    }
    return { freeQty, freeCost, retCount, retSum };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, from, to, selClubs, selCats, selProducts]);

  const totals = (list) => {
    const revenue = list.reduce((a, s) => a + (s.totalSum || 0), 0);
    const qty = list.reduce((a, s) => a + (s.qty || 0), 0);
    const profit = list.reduce((a, s) => a + (s.netProfit || 0), 0);
    return { revenue, qty, profit, checks: list.length, avg: list.length ? revenue / list.length : 0 };
  };
  const tCur = useMemo(() => totals(cur), [cur]);
  const tPrev = useMemo(() => totals(prev), [prev]);

  // Серии для графика динамики
  const buckets = useMemo(() => bucketsFor(from, to), [from, to]);
  const chart = useMemo(() => {
    const idx = new Map(buckets.keys.map((d, i) => [buckets.keyOf(d), i]));
    const n = buckets.keys.length;
    let groups;
    if (split === 'category') groups = categories.map((c, i) => ({ key: c, name: c, color: seriesColor(i) }));
    else if (split === 'club') groups = clubs.map((c, i) => ({ key: c, name: c, color: seriesColor(i) }));
    // Цвет товара — по порядку выбора, поэтому не меняется при добавлении следующих
    // 9-й и дальше не получают новых цветов — сворачиваются в «Остальные выбранные»
    else if (split === 'product') {
      groups = selProducts.slice(0, 8).map((n, i) => ({ key: n, name: n, color: seriesColor(i) }));
      if (selProducts.length > 8) groups.push({ key: '__rest', name: 'Остальные выбранные', color: 'var(--text-muted)' });
    }
    else groups = [{ key: '__all', name: METRICS.find(m => m.id === metric).label, color: 'var(--accent-purple)' }];
    const vals = new Map(groups.map(g => [g.key, new Array(n).fill(0)]));
    for (const s of cur) {
      const i = idx.get(buckets.keyOf(s._d));
      if (i == null) continue;
      const g = split === 'category' ? catOf(s) : split === 'club' ? s.club : split === 'product' ? (selProducts.indexOf(s.productName) < 8 ? s.productName : '__rest') : '__all';
      const arr = vals.get(g);
      if (arr) arr[i] += metricOf(s, metric);
    }
    const all = groups.map(g => ({ ...g, values: vals.get(g.key) }));
    // Пустые серии не рисуем (клуб без продаж за период), но цвет у остальных прежний
    const present = split === 'total' ? all : all.filter(s => s.values.some(v => v !== 0));
    return { labels: buckets.keys.map(buckets.label), series: present };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, buckets, split, metric, clubs, categories, selProducts]);

  const visibleSeries = chart.series.filter(s => !hiddenSeries.includes(s.name));

  const groupBy = (keyFn, order, colorFn) => {
    const m = new Map();
    for (const s of cur) { const k = keyFn(s); m.set(k, (m.get(k) || 0) + metricOf(s, metric)); }
    return [...m.entries()]
      .map(([name, value]) => ({ name, value, color: colorFn(name, order) }))
      .sort((a, b) => b.value - a.value);
  };
  const byCategory = useMemo(() => groupBy(catOf, categories, (n, o) => seriesColor(o.indexOf(n))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cur, metric, categories]);
  const byClub = useMemo(() => groupBy(s => s.club || '—', clubs, (n, o) => seriesColor(Math.max(0, o.indexOf(n)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cur, metric, clubs]);
  const byPayment = useMemo(() => {
    const m = new Map();
    for (const s of cur) { const k = s.paymentMethod || '—'; m.set(k, (m.get(k) || 0) + metricOf(s, metric)); }
    return [...m.entries()].map(([name, value]) => ({ name, value, color: 'var(--accent-purple)' })).sort((a, b) => b.value - a.value);
  }, [cur, metric]);

  const metricTotal = metric === 'qty' ? tCur.qty : metric === 'profit' ? tCur.profit : tCur.revenue;

  // Топ товаров
  const topProducts = useMemo(() => {
    const m = new Map();
    for (const s of cur) {
      const k = `${s.productName}|${catOf(s)}`;
      const r = m.get(k) || { name: s.productName || '—', category: catOf(s), qty: 0, revenue: 0, profit: 0, clubs: new Set() };
      r.qty += s.qty || 0; r.revenue += s.totalSum || 0; r.profit += s.netProfit || 0; r.clubs.add(s.club);
      m.set(k, r);
    }
    const key = metric === 'qty' ? 'qty' : metric === 'profit' ? 'profit' : 'revenue';
    return [...m.values()].sort((a, b) => b[key] - a[key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, metric]);

  // Матрица клуб × вид
  const matrix = useMemo(() => {
    const cells = new Map();
    for (const s of cur) {
      const k = `${s.club}|${catOf(s)}`;
      cells.set(k, (cells.get(k) || 0) + metricOf(s, metric));
    }
    const rowClubs = clubs.filter(c => categories.some(cat => cells.get(`${c}|${cat}`)));
    const colCats = categories.filter(cat => clubs.some(c => cells.get(`${c}|${cat}`)));
    const max = Math.max(1, ...cells.values());
    return { cells, rowClubs, colCats, max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, metric, clubs, categories]);

  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  // Справочник товаров для выбора: все, что когда-либо продавались, по видам
  // (в рамках выбранных видов). Одно название в разных клубах = одна модель.
  const productCatalog = useMemo(() => {
    const m = new Map();
    for (const s of realSales) {
      if (!s.productName) continue;
      const r = m.get(s.productName) || { name: s.productName, category: catOf(s), qty: 0 };
      r.qty += s.qty || 0;
      m.set(s.productName, r);
    }
    return [...m.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realSales, categories]);
  const pickerGroups = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return categories
      .filter(c => !selCats.length || selCats.includes(c))
      .map(c => ({
        category: c,
        items: productCatalog
          .filter(p => p.category === c && (!q || p.name.toLowerCase().includes(q)))
          .sort((a, b) => b.qty - a.qty),
      }))
      .filter(g => g.items.length);
  }, [productCatalog, categories, selCats, productQuery]);

  // Сменили виды — выкидываем выбранные товары других видов, иначе фильтр молча обнулит всё
  const changeCats = (next) => {
    setSelCats(next);
    if (next.length) {
      const allowed = new Set(productCatalog.filter(p => next.includes(p.category)).map(p => p.name));
      setSelProducts(prev => prev.filter(n => allowed.has(n)));
    }
  };
  const changeProducts = (next) => {
    setSelProducts(next);
    setHiddenSeries([]);
    if (!next.length && split === 'product') setSplit('category');
    if (next.length && selProducts.length === 0) setSplit('product');
  };
  const splits = SPLITS.filter(sp => sp.id !== 'product' || selProducts.length);
  const metrics = METRICS.filter(m => !m.cost || canSeeCost);
  const periodLabel = `${format(from, 'd MMM yyyy', { locale: ru })} — ${format(to, 'd MMM yyyy', { locale: ru })}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Фильтры */}
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] w-16 shrink-0">Период</span>
            {PRESETS.map(p => <button key={p.id} className={pill(preset === p.id)} onClick={() => setPreset(p.id)}>{p.label}</button>)}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border ${preset === 'custom' ? 'border-[var(--accent-purple)]' : 'border-[var(--border)]'} bg-[var(--bg-card)]`}>
              <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setPreset('custom'); }}
                onClick={e => { try { e.target.showPicker(); } catch { /* старые браузеры */ } }}
                className="bg-transparent outline-none text-[11px] font-bold text-[var(--text-primary)] w-[110px]" title="С" />
              <span className="text-[var(--text-muted)] text-xs">—</span>
              <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setPreset('custom'); }}
                onClick={e => { try { e.target.showPicker(); } catch { /* старые браузеры */ } }}
                className="bg-transparent outline-none text-[11px] font-bold text-[var(--text-primary)] w-[110px]" title="По" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] w-16 shrink-0">Клубы</span>
            <button className={pill(!selClubs.length)} onClick={() => setSelClubs([])}>Все</button>
            {clubs.map(c => <button key={c} className={pill(selClubs.includes(c))} onClick={() => toggle(selClubs, setSelClubs, c)}>{c}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] w-16 shrink-0">Виды</span>
            <button className={pill(!selCats.length)} onClick={() => changeCats([])}>Все</button>
            {categories.map(c => <button key={c} className={pill(selCats.includes(c))} onClick={() => changeCats(selCats.includes(c) ? selCats.filter(x => x !== c) : [...selCats, c])}>{c}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] w-16 shrink-0">Товары</span>
            <button className={pill(!selProducts.length)} onClick={() => changeProducts([])}>Все</button>
            {selProducts.map((n, i) => (
              <button key={n} className={`${pill(true)} flex items-center gap-1.5`} onClick={() => changeProducts(selProducts.filter(x => x !== n))} title="Убрать">
                <span className="w-2 h-2 rounded-sm ring-1 ring-white/80" style={{ background: i < 8 ? seriesColor(i) : 'var(--text-muted)' }} />{n} <span className="opacity-70">✕</span>
              </button>
            ))}
            <button className={pill(productPickerOpen)} onClick={() => setProductPickerOpen(o => !o)}>
              {productPickerOpen ? 'Готово' : '+ Выбрать товары'}
            </button>
          </div>
          {productPickerOpen && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-hover)] p-3 flex flex-col gap-3">
              <input
                value={productQuery}
                onChange={e => setProductQuery(e.target.value)}
                placeholder="Поиск товара..."
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-xs font-semibold text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent-purple)]"
              />
              <div className="max-h-72 overflow-y-auto flex flex-col gap-3 pr-1">
                {pickerGroups.length ? pickerGroups.map(g => {
                  const allOn = g.items.every(p => selProducts.includes(p.name));
                  return (
                    <div key={g.category}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">{g.category}</span>
                        <button className="text-[10px] font-bold text-[var(--accent-purple)] hover:underline"
                          onClick={() => changeProducts(allOn
                            ? selProducts.filter(n => !g.items.some(p => p.name === n))
                            : [...selProducts, ...g.items.map(p => p.name).filter(n => !selProducts.includes(n))])}>
                          {allOn ? 'Снять все' : 'Выбрать все'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.items.map(p => (
                          <button key={p.name} className={pill(selProducts.includes(p.name))}
                            onClick={() => changeProducts(selProducts.includes(p.name) ? selProducts.filter(x => x !== p.name) : [...selProducts, p.name])}>
                            {p.name} <span className="opacity-60">· {p.qty} шт</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }) : <div className="text-xs font-bold text-[var(--text-muted)] text-center py-4">Ничего не найдено</div>}
              </div>
              {selProducts.length > 8 && (
                <div className="text-[10px] font-bold text-[var(--text-muted)]">На графике «По товарам» отдельной линией идут первые 8 выбранных, остальные — общей серой линией «Остальные выбранные».</div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] w-16 shrink-0">Метрика</span>
            {metrics.map(m => <button key={m.id} className={pill(metric === m.id)} onClick={() => setMetric(m.id)}>{m.label}</button>)}
            <span className="ml-auto text-[11px] font-bold text-[var(--text-muted)]">{periodLabel}</span>
          </div>
        </div>
      </Card>

      {/* KPI */}
      <div className={`grid gap-3 ${canSeeCost ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5'}`}>
        <Kpi label="Выручка" value={money(tCur.revenue)} cur={tCur.revenue} prev={tPrev.revenue} />
        <Kpi label="Продано" value={`${tCur.qty.toLocaleString('ru-RU')} шт`} cur={tCur.qty} prev={tPrev.qty} />
        <Kpi label="Чеков" value={tCur.checks.toLocaleString('ru-RU')} cur={tCur.checks} prev={tPrev.checks} />
        <Kpi label="Средний чек" value={money(tCur.avg)} cur={tCur.avg} prev={tPrev.avg} />
        {canSeeCost && <Kpi label="Прибыль" value={money(tCur.profit)} cur={tCur.profit} prev={tPrev.profit} />}
        <Kpi label="Бесплатно / возвраты" value={`${extras.freeQty} шт / ${extras.retCount}`}
          hint={`${canSeeCost ? `выдачи по себест. ${money(extras.freeCost)} · ` : ''}возвратов на ${money(extras.retSum)}`} />
      </div>

      {/* Динамика */}
      <Card
        title={`Динамика · ${METRICS.find(m => m.id === metric).label.toLowerCase()} · по ${buckets.unit === 'day' ? 'дням' : buckets.unit === 'week' ? 'неделям' : 'месяцам'}`}
        right={<div className="flex gap-1">{splits.map(s => <button key={s.id} className={pill(split === s.id)} onClick={() => { setSplit(s.id); setHiddenSeries([]); }}>{s.label}</button>)}</div>}
      >
        {cur.length ? (
          <>
            <LineChart labels={chart.labels} series={visibleSeries} metric={metric} />
            {chart.series.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {chart.series.map(s => {
                  const off = hiddenSeries.includes(s.name);
                  return (
                    <button key={s.name} onClick={() => toggle(hiddenSeries, setHiddenSeries, s.name)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                      style={{ opacity: off ? 0.4 : 1 }} title={off ? 'Показать' : 'Скрыть'}>
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.name}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : <Empty />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="По видам товара"><BarList rows={byCategory} metric={metric} total={metricTotal} /></Card>
        <Card title="По клубам"><BarList rows={byClub} metric={metric} total={metricTotal} /></Card>
      </div>

      {/* Матрица клуб × вид */}
      <Card title={`Клубы × виды · ${METRICS.find(m => m.id === metric).label.toLowerCase()}`}>
        {matrix.rowClubs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="text-[var(--text-muted)] font-black uppercase tracking-wider">
                  <th className="text-left py-2 pr-3">Клуб</th>
                  {matrix.colCats.map(c => <th key={c} className="text-right py-2 px-2 whitespace-nowrap">{c}</th>)}
                  <th className="text-right py-2 pl-3">Итого</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rowClubs.map(club => {
                  const rowTotal = matrix.colCats.reduce((a, c) => a + (matrix.cells.get(`${club}|${c}`) || 0), 0);
                  return (
                    <tr key={club} className="border-t border-[var(--border)]">
                      <td className="py-2 pr-3 font-bold text-[var(--text-primary)] whitespace-nowrap">{club}</td>
                      {matrix.colCats.map(c => {
                        const v = matrix.cells.get(`${club}|${c}`) || 0;
                        return (
                          <td key={c} className="py-2 px-2 text-right font-semibold text-[var(--text-primary)] whitespace-nowrap"
                            style={{ background: v ? `color-mix(in srgb, var(--accent-purple) ${Math.round(8 + (v / matrix.max) * 40)}%, transparent)` : undefined }}>
                            {v ? fmtMetric(v, metric) : <span className="text-[var(--text-muted)]">—</span>}
                          </td>
                        );
                      })}
                      <td className="py-2 pl-3 text-right font-black text-[var(--text-primary)] whitespace-nowrap">{fmtMetric(rowTotal, metric)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Топ товаров */}
        <Card title="Топ товаров"
          right={topProducts.length > 15 && (
            <button className={pill(false)} onClick={() => setTopLimit(topLimit === 15 ? 1000 : 15)}>
              {topLimit === 15 ? `Все ${topProducts.length}` : 'Свернуть'}
            </button>
          )}>
          {topProducts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] tabular-nums">
                <thead>
                  <tr className="text-[var(--text-muted)] font-black uppercase tracking-wider">
                    <th className="text-left py-2 pr-2">#</th>
                    <th className="text-left py-2 pr-2">Товар</th>
                    <th className="text-left py-2 pr-2">Вид</th>
                    <th className="text-right py-2 px-2">Шт</th>
                    <th className="text-right py-2 px-2">Выручка</th>
                    {canSeeCost && <th className="text-right py-2 px-2">Прибыль</th>}
                    <th className="text-right py-2 pl-2">Клубов</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.slice(0, topLimit).map((p, i) => (
                    <tr key={`${p.name}|${p.category}`} className="border-t border-[var(--border)]">
                      <td className="py-2 pr-2 text-[var(--text-muted)] font-bold">{i + 1}</td>
                      <td className="py-2 pr-2 font-bold text-[var(--text-primary)]">{p.name}</td>
                      <td className="py-2 pr-2 text-[var(--text-secondary)] whitespace-nowrap">{p.category}</td>
                      <td className="py-2 px-2 text-right font-semibold text-[var(--text-primary)]">{p.qty}</td>
                      <td className="py-2 px-2 text-right font-semibold text-[var(--text-primary)] whitespace-nowrap">{money(p.revenue)}</td>
                      {canSeeCost && <td className="py-2 px-2 text-right font-semibold text-[var(--text-primary)] whitespace-nowrap">{money(p.profit)}</td>}
                      <td className="py-2 pl-2 text-right text-[var(--text-secondary)]">{p.clubs.size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty />}
        </Card>
        <Card title="Способы оплаты"><BarList rows={byPayment} metric={metric} total={metricTotal} /></Card>
      </div>
    </div>
  );
}

