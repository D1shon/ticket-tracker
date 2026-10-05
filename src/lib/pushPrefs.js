// Личный фильтр push-уведомлений: каждый пользователь сам выбирает, с каких
// вкладок получать пуши. Канонично хранится в push_prefs/{email} ({muted: [...]}),
// при каждом изменении и при регистрации токена зеркалится в поле `muted`
// push_tokens-доков пользователя — по нему фильтруют api/send-push и
// api/scheduled-reminders (серверные рассыльщики видят только токены).
// Категория пуша = первый сегмент его url (вкладка, куда он ведёт).

export const PUSH_CATEGORIES = [
  { id: '/tickets',        label: 'Заявки' },
  { id: '/shift-board',    label: 'Доска задач' },
  { id: '/checklists',     label: 'Чек-листы' },
  { id: '/merch',          label: 'Склад' },
  { id: '/invoices',       label: 'Тренажеры (счета)' },
  { id: '/hr-monitors',    label: 'Пульсометры' },
  { id: '/towels',         label: 'Учет полотенец' },
  { id: '/first-aid',      label: 'Аптечка' },
  { id: '/lost-items',     label: 'Утерянные вещи' },
  { id: '/reviews',        label: 'Отзывы' },
  { id: '/leads',          label: 'Лиды' },
  { id: '/calls',          label: 'Созвоны' },
  { id: '/instudio',       label: 'InStudio' },
  { id: '/attendance',     label: 'Чекин' },
  { id: '/service-report', label: 'Отчет смены' },
  { id: '/calendar',       label: 'Календарь' },
  { id: '/news',           label: 'Новости' },
];

// Пуши, ведущие на эти адреса, относятся к категории-алиасу
const CATEGORY_ALIASES = {
  '/scan': '/attendance',
  '/qr-reviews': '/reviews',
  '/feedback': '/reviews',
};

const KNOWN = new Set(PUSH_CATEGORIES.map(c => c.id));

// Категория пуша по его url; null = вне категорий (сервисные/тестовые пуши,
// их фильтр не трогает — они доставляются всегда)
export function pushCategoryOf(url) {
  const first = String(url || '').split(/[?#]/)[0].split('/').filter(Boolean)[0];
  if (!first) return null;
  const seg = '/' + first;
  const cat = CATEGORY_ALIASES[seg] || seg;
  return KNOWN.has(cat) ? cat : null;
}

// true = этому токену данный пуш отправлять нельзя (раздел выключен пользователем)
export function isMutedFor(tokenDoc, url) {
  const cat = pushCategoryOf(url);
  if (!cat) return false;
  const m = tokenDoc?.muted;
  return Array.isArray(m) && m.includes(cat);
}
