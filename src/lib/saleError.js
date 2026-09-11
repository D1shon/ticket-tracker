import { toast } from 'sonner';
import { resetLocalCache } from './firebase';

// «Quota exceeded» приходит из двух совершенно разных мест:
//  1) сервер — исчерпана дневная квота Firestore (тариф Spark);
//  2) браузер — переполнен IndexedDB локального кэша на этом устройстве.
// Различить их по тексту нельзя, а лечатся они по-разному, поэтому предлагаем
// сброс кэша (единственное, что пользователь может сделать сам) и подсказываем,
// что делать, если не помогло.
const isQuota = (err, msg) =>
  err?.code === 'resource-exhausted' ||
  err?.name === 'QuotaExceededError' ||
  /quota/i.test(msg);

/** Показывает разобранную ошибку проведения продажи. Общий код для Merch и Sales. */
export const reportSaleError = (err) => {
  console.error(err);
  const msg = String(err?.message || '');

  if (msg === 'PRODUCT_MISSING') return toast.error('Карточка товара удалена со склада — продажа НЕ проведена. Обновите страницу.');
  if (msg === 'SIZE_REQUIRED')   return toast.error('Выберите размер — у этого товара размерная сетка');
  if (msg.startsWith('NOT_ENOUGH_SIZE')) return toast.error(`Недостаточно размера ${msg.split(':')[1]} (остаток: ${msg.split(':')[2]} шт) — продажа НЕ проведена`);
  if (msg.startsWith('NOT_ENOUGH'))      return toast.error(`Недостаточно товара (фактический остаток: ${msg.split(':')[1]} шт) — продажа НЕ проведена`);
  if (/permission/i.test(msg))           return toast.error('Нет прав — войдите заново (перезагрузите страницу)');

  if (isQuota(err, msg)) {
    return toast.error('Переполнено хранилище — продажа НЕ проведена', {
      description: 'Нажмите «Сбросить кэш»: данные не потеряются, страница перезагрузится. Если не помогло — проблема на сервере, нужна проверка тарифа Firestore.',
      duration: Infinity,
      action: { label: 'Сбросить кэш', onClick: () => resetLocalCache() },
    });
  }

  return toast.error(`Ошибка: ${msg || 'неизвестная'} — продажа НЕ проведена`);
};
