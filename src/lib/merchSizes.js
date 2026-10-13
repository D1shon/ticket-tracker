// Размерная сетка мерча — ЕДИНЫЙ источник для MerchPage и SalesPage.
// Жёсткий список в одной из страниц уже ловили: SalesPage фильтровал кнопки по
// одиночным размерам и сдвоенные (S-M…) не показывались — продажа не проходила.
// Основная сетка — одиночные размеры; сдвоенные — второстепенный блок у части мерча.
export const SIZES_SINGLE = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
export const SIZES_COMBO = ['S-M', 'L-XL', 'XL-XXL'];
export const SIZES = [...SIZES_SINGLE, ...SIZES_COMBO];

// Размеры товара для продажи/перемещения: в порядке SIZES + любые ключи из
// документа, которых в SIZES нет. Так товар с «неизвестным» размером (новый
// размер добавили, а у клиента открыт старый бандл) не теряет кнопки выбора.
export const productSizeKeys = (sizes) => {
  const known = SIZES.filter(sz => sizes?.[sz] !== undefined);
  const extra = Object.keys(sizes || {}).filter(k => !SIZES.includes(k)).sort();
  return [...known, ...extra];
};
