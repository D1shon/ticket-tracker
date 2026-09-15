import { showStaffNav } from './access';

// ЕДИНЫЙ источник правды о доступе к вкладкам.
// baseNavAllowed — базовые правила по роли (раньше дублировались в двух местах Sidebar).
// navAllowed — база + персональные перекрытия из Настроек (tabsExtra / tabsHidden в app_users):
//   tabsHidden побеждает всегда; tabsExtra открывает вкладку сверх роли.
// Используется в Sidebar (меню), ProtectedLayout (роуты) и Настройках (редактор доступа).

export const NAV_ITEMS = [
  { path: '/news',            label: 'Новости' },
  { path: '/shift-board',     label: 'Доска задач' },
  { path: '/tickets',         label: 'Заявки' },
  { path: '/schedule',        label: 'График' },
  { path: '/checklists',      label: 'Чек-листы' },
  { path: '/merch',           label: 'Склад' },
  { path: '/sales',           label: 'Продажи' },
  { path: '/dashboard',       label: 'Дашборд' },
  { path: '/archive',         label: 'Архив' },
  { path: '/hr-monitors',     label: 'Пульсометры' },
  { path: '/first-aid',       label: 'Аптечка' },
  { path: '/towels',          label: 'Учет полотенец' },
  { path: '/lost-items',      label: 'Утерянные вещи' },
  { path: '/reviews',         label: 'Отзывы' },
  { path: '/qr-reviews',      label: 'QR-отзывы' },
  { path: '/leads',           label: 'Лиды' },
  { path: '/assistant',       label: 'Помощник' },
  { path: '/ai-chat',         label: 'ИИ-чат' },
  { path: '/staff',           label: 'Сотрудники (МОП)' },
  { path: '/calendar',        label: 'Календарь' },
  { path: '/instudio',        label: 'InStudio' },
  { path: '/club-visits',     label: 'Посещения' },
  { path: '/attendance',      label: 'Чекин' },
  { path: '/calls',           label: 'Созвоны' },
  { path: '/guidebook',       label: 'Гайдбук' },
  { path: '/injury-protocol', label: 'Регламент травм' },
  { path: '/policy',          label: 'Соглашение' },
  { path: '/settings',        label: 'Настройки' },
];

const ADMIN_TABS = ['/shift-board', '/calendar', '/instudio', '/schedule', '/sales', '/settings', '/guidebook', '/injury-protocol', '/policy', '/hr-monitors', '/first-aid', '/towels', '/attendance', '/club-visits', '/lost-items', '/news', '/leads', '/assistant'];
const MARKETING_TABS = ['/merch', '/policy', '/shift-board', '/calendar', '/instudio', '/settings'];
const SALES_TABS = ['/news', '/merch', '/policy', '/settings', '/reviews', '/qr-reviews', '/leads', '/lost-items', '/assistant', '/attendance', '/club-visits', '/calendar', '/instudio'];
const VIEWER_HIDDEN_TABS = ['/tickets', '/schedule', '/calls', '/dashboard', '/archive', '/lost-items', '/reviews', '/leads', '/ai-chat'];

export function baseNavAllowed(user, path) {
  if (path === '/staff') return showStaffNav(user);
  // Техник: только Чек-листы и InStudio, по всем клубам
  if (user?.role === 'tech') return path === '/checklists' || path === '/instudio' || path === '/settings';
  // Наблюдатель «Утерянные вещи»
  if (user?.role === 'lostviewer') return path === '/lost-items' || path === '/merch' || path === '/settings';
  if (user?.role === 'admin') {
    // Чек-листы — только админам Europe City
    if (path === '/checklists') return (user.club || '').toUpperCase() === 'EUROPE CITY';
    return ADMIN_TABS.includes(path);
  }
  if (user?.role === 'marketing') return MARKETING_TABS.includes(path);
  if (user?.role === 'komdir' || user?.role === 'rop') {
    // Передача смены — видна всем в отделе, включая Ком-Дира, РОП и МОП
    if (path === '/shift-board') return true;
    return SALES_TABS.includes(path);
  }
  if (user?.role === 'viewer') return !VIEWER_HIDDEN_TABS.includes(path);
  // У менеджеров «Соглашение» и «QR-отзывы» живут в Настройках
  if (user?.role === 'manager' && (path === '/policy' || path === '/qr-reviews')) return false;
  // ИИ-чат — только менеджеры и шеф
  if (path === '/ai-chat') return user?.role === 'manager' || user?.role === 'chef';
  return true;
}

export function navAllowed(user, path) {
  if (Array.isArray(user?.tabsHidden) && user.tabsHidden.includes(path)) return false;
  if (Array.isArray(user?.tabsExtra) && user.tabsExtra.includes(path)) return true;
  return baseNavAllowed(user, path);
}
