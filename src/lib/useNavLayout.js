import { useEffect, useState } from 'react';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Персональная раскладка левого меню: свой порядок пунктов и пользовательские
// группы (drag&drop в DesktopSidebar). Формат:
//   rows: [{type:'item', path} | {type:'group', id, label, items:[path,...]}]
// Хранение: user_prefs/{email}.navLayout — раскладка своя у каждого пользователя
// и синхронизируется между его устройствами; зеркало в localStorage даёт
// мгновенный старт без ожидания сети.

// Приводим сохранённую раскладку к текущему списку доступных путей: чужие/устаревшие
// пути выпадают, новые (появившиеся после сохранения раскладки) добавляются в конец,
// опустевшие группы исчезают. Дубликаты путей схлопываются (первый выигрывает).
const normalize = (rows, allowedPaths) => {
  const allowed = new Set(allowedPaths);
  const seen = new Set();
  const out = [];
  (rows || []).forEach(r => {
    if (r?.type === 'group') {
      const items = (r.items || []).filter(p => allowed.has(p) && !seen.has(p));
      items.forEach(p => seen.add(p));
      if (items.length) out.push({ type: 'group', id: r.id, label: r.label || 'Группа', items });
    } else if (r?.type === 'item' && allowed.has(r.path) && !seen.has(r.path)) {
      seen.add(r.path);
      out.push({ type: 'item', path: r.path });
    }
  });
  allowedPaths.forEach(p => { if (!seen.has(p)) out.push({ type: 'item', path: p }); });
  return out;
};

// Применяем результат перетаскивания. drag/target: {kind:'item', path} | {kind:'group', id}.
// mode: 'before' | 'after' | 'into' ('into' = объединить/положить внутрь группы).
// makeLabel вызывается ТОЛЬКО при создании новой группы (пункт брошен на пункт
// верхнего уровня после удержания); вернёт null — отмена, раскладка не меняется.
export const applyDrop = (rows, drag, target, mode, makeLabel) => {
  if (drag.kind === target.kind && (drag.path === target.path) && (drag.id === target.id)) return rows;
  let next = rows.map(r => r.type === 'group' ? { ...r, items: [...r.items] } : { ...r });

  // 1) изъять перетаскиваемое из текущего места
  let dragRow = null;
  if (drag.kind === 'group') {
    const i = next.findIndex(r => r.type === 'group' && r.id === drag.id);
    if (i === -1) return rows;
    dragRow = next.splice(i, 1)[0];
  } else {
    const i = next.findIndex(r => r.type === 'item' && r.path === drag.path);
    if (i !== -1) {
      dragRow = next.splice(i, 1)[0];
    } else {
      for (const g of next) {
        if (g.type !== 'group') continue;
        const j = g.items.indexOf(drag.path);
        if (j !== -1) { g.items.splice(j, 1); dragRow = { type: 'item', path: drag.path }; break; }
      }
    }
    if (!dragRow) return rows;
  }
  next = next.filter(r => r.type !== 'group' || r.items.length > 0);

  const topIndexOf = (t) => next.findIndex(r =>
    t.kind === 'group' ? (r.type === 'group' && r.id === t.id) : (r.type === 'item' && r.path === t.path));

  // 2) вставить у цели
  if (drag.kind === 'group') {
    // группы живут только на верхнем уровне и не вкладываются друг в друга
    let i = topIndexOf(target);
    if (i === -1 && target.kind === 'item') {
      i = next.findIndex(r => r.type === 'group' && r.items.includes(target.path));
    }
    if (i === -1) { next.push(dragRow); return next; }
    next.splice(mode === 'before' ? i : i + 1, 0, dragRow);
    return next;
  }

  const path = dragRow.path;
  if (target.kind === 'group') {
    const gi = topIndexOf(target);
    if (gi === -1) { next.push(dragRow); return next; }
    if (mode === 'into') { next[gi].items.push(path); return next; }
    next.splice(mode === 'before' ? gi : gi + 1, 0, dragRow);
    return next;
  }

  const ti = topIndexOf(target);
  if (ti !== -1) {
    if (mode === 'into') {
      const label = makeLabel ? makeLabel() : 'Группа';
      if (label === null) return rows; // пользователь отменил создание группы
      const group = {
        type: 'group',
        id: 'g' + Date.now().toString(36),
        label: (label || '').trim() || 'Группа',
        items: [next[ti].path, path],
      };
      next.splice(ti, 1, group);
      return next;
    }
    next.splice(mode === 'before' ? ti : ti + 1, 0, dragRow);
    return next;
  }

  // цель — пункт внутри группы: вставляем в ту же группу
  for (const g of next) {
    if (g.type !== 'group') continue;
    const j = g.items.indexOf(target.path);
    if (j === -1) continue;
    g.items.splice(mode === 'before' ? j : j + 1, 0, path);
    return next;
  }
  next.push(dragRow);
  return next;
};

export default function useNavLayout(user, allowedPaths, defaultRows) {
  const email = (user?.email || '').toLowerCase().trim();
  const lsKey = email ? `hj_nav_layout_${email}` : null;
  const [savedRows, setSavedRows] = useState(null); // null = стандартная раскладка

  useEffect(() => {
    if (!email) { setSavedRows(null); return; }
    try {
      const cached = JSON.parse(localStorage.getItem(lsKey) || 'null');
      setSavedRows(cached?.rows || null);
    } catch { setSavedRows(null); }
    let dead = false;
    getDoc(doc(db, 'user_prefs', email)).then(snap => {
      if (dead) return;
      const nl = snap.exists() ? snap.data().navLayout : null;
      if (nl?.rows) {
        setSavedRows(nl.rows);
        try { localStorage.setItem(lsKey, JSON.stringify(nl)); } catch {}
      }
    }).catch(() => {});
    return () => { dead = true; };
  }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (nextRows) => {
    setSavedRows(nextRows);
    const payload = { v: 1, rows: nextRows };
    try { localStorage.setItem(lsKey, JSON.stringify(payload)); } catch {}
    if (email) {
      setDoc(doc(db, 'user_prefs', email), { navLayout: payload, navLayoutUpdatedISO: new Date().toISOString() }, { merge: true }).catch(() => {});
    }
  };

  const reset = () => {
    setSavedRows(null);
    try { localStorage.removeItem(lsKey); } catch {}
    if (email) {
      setDoc(doc(db, 'user_prefs', email), { navLayout: null }, { merge: true }).catch(() => {});
    }
  };

  return {
    rows: normalize(savedRows ?? defaultRows, allowedPaths),
    save,
    reset,
    isCustom: !!savedRows,
  };
}
