import { useEffect, useRef } from 'react';

// Свайп вниз — закрыть мобильную шторку/модалку (как системные шторки iOS).
// Жест начинается с любого места шторки, когда её скролл находится в самом
// верху; иначе палец прокручивает содержимое как обычно. Внутренний скролл
// помечается атрибутом data-sheet-scroll (без него скроллером считается сам
// элемент шторки). Нативные слушатели с passive:false — React вешает touchmove
// пассивно, и preventDefault там не срабатывает: браузер продолжал бы скроллить
// список вместо перетаскивания шторки.
export default function useSheetDrag(sheetRef, open, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !open) return;
    const scroller = () => el.querySelector('[data-sheet-scroll]') || el;
    let startY = 0, delta = 0, tracking = false, dragging = false;
    const onStart = (e) => {
      tracking = true; dragging = false; delta = 0;
      startY = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      if (!dragging) {
        if (scroller().scrollTop > 0 || dy < -6) { tracking = false; return; }
        if (dy <= 6) return;
        dragging = true;
        el.style.transition = 'none';
      }
      delta = Math.max(0, dy);
      e.preventDefault();
      el.style.transform = `translateY(${delta}px)`;
    };
    const onEnd = () => {
      tracking = false;
      if (!dragging) return;
      dragging = false;
      el.style.transition = 'transform 0.2s cubic-bezier(0.4,0,0.2,1)';
      if (delta > 70) {
        el.style.transform = 'translateY(120%)';
        setTimeout(() => closeRef.current?.(), 180);
      } else {
        el.style.transform = 'translateY(0)';
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [sheetRef, open]);
}
