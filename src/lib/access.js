// Персональные замки на отдельные разделы — по email, не по роли.

// «Сервис-отчёт» (/service-report): заходить может только этот список.
// Остальным пункт показывается, но некликабелен (с замком).
export const SERVICE_REPORT_EMAILS = [
  'dilshat.r@hj.fit',
];

export const canServiceReport = (user) =>
  SERVICE_REPORT_EMAILS.includes((user?.email || '').toLowerCase().trim());

// Создание аккаунтов сотрудников (МОП): шеф, реальные РОПы (не сами МОП)
// и менеджеры (любого клуба). МОП = роль 'rop' с флагом mop:true — те же права,
// но создавать аккаунты не может.
export const canCreateStaff = (user) => {
  const role = user?.role;
  if (role === 'chef') return true;
  if (role === 'rop' && !user?.mop) return true;
  if (role === 'manager') return true;
  return false;
};
// Пункт в левом меню — у реального РОПа и у менеджеров (у шефа — в Настройках).
export const showStaffNav = (user) =>
  (user?.role === 'rop' && !user?.mop) || user?.role === 'manager';
