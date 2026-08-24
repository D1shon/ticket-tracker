// Определение мобильного устройства ПО УСТРОЙСТВУ, а не по ширине окна.
// Раньше везде было `innerWidth <= 768`: телефон в альбомной ориентации
// становился «десктопом» и получал старый вид. Теперь телефон/планшет
// с тач-экраном остаётся в мобильном интерфейсе в любой ориентации.
export const isMobileDevice = () => {
  try {
    if (window.innerWidth <= 768) return true;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const smallSide = Math.min(window.screen.width || 0, window.screen.height || 0);
    return coarse && smallSide > 0 && smallSide <= 900;
  } catch {
    return window.innerWidth <= 768;
  }
};
