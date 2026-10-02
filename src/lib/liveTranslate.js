// Живой перевод интерфейса поверх готового DOM — без правки страниц.
// Русский — родной язык кода: при lang='ru' движок ПОЛНОСТЬЮ выключен
// (нулевой оверхед, поведение платформы не меняется ничем).
// При 'kk'/'en' лениво грузится словарь (src/locales/*.json, точное
// совпадение нормализованной строки) и TreeWalker переводит текстовые
// узлы и атрибуты; MutationObserver подхватывает всё, что рендерится позже.
// Строки без перевода в словаре просто остаются по-русски.
// Переключение языка = сохранить выбор + перезагрузка страницы (надёжнее
// и проще, чем откатывать переводы по всему DOM).

const LS_KEY = 'hj_lang';
const CYR = /[А-Яа-яЁё]/;
const ATTRS = ['placeholder', 'title', 'aria-label'];

let dict = null;          // ru(норм.) -> перевод
let lastSet = new WeakMap(); // node -> значение, которое записали мы (защита от цикла с observer)

// Языки платформы: русский и английский. Казахский из интерфейса убран
// (02.10.2026, решение шефа) — он остался только в публичной QR-форме
// отзывов (/feedback), у которой своя система перевода. Сохранённый ранее
// выбор 'kk' тихо откатывается на русский.
export const getLang = () => {
  try {
    const l = localStorage.getItem(LS_KEY);
    return l === 'en' ? 'en' : 'ru';
  } catch { return 'ru'; }
};

export const setLang = (lang) => {
  try { localStorage.setItem(LS_KEY, lang); } catch {}
  window.location.reload();
};

const norm = (s) => s.replace(/\s+/g, ' ').trim();

const lookup = (raw) => {
  if (!raw || !CYR.test(raw)) return null;
  const hit = dict[norm(raw)];
  if (!hit) return null;
  // крайние пробелы исходника сохраняем — JSX часто клеит куски через них
  const lead = raw.match(/^\s*/)[0];
  const tail = raw.match(/\s*$/)[0];
  return lead + hit + tail;
};

// Пропускаем места, где перевод сломал бы данные или ввод пользователя
const SKIP_SELECTOR = 'script,style,textarea,input,[contenteditable="true"],[data-notranslate]';
const skip = (el) => !!(el && el.closest && el.closest(SKIP_SELECTOR));

// Составные строки: «Сумма: 5 000 ₸ за смену» собирается из кусков с числами,
// и целиком её в словаре нет. Режем по числам/латинице/скобкам и переводим
// кириллические куски по отдельности — куски в словаре есть (экстракция
// собирает именно литералы-куски из кода).
const SEG_SPLIT = /(\d[\d\s.,:;%–\-\/]*|[A-Za-z][A-Za-z0-9@._\-'’]*|[«»"()\[\]{}|·•→←№#+=~`^<>]+)/;
// Пословный резерв для куска из нескольких слов («октября в»): переводим,
// ТОЛЬКО если найдено каждое слово — полупереводов не делаем.
const lookupWords = (seg) => {
  const words = seg.trim().split(/\s+/);
  if (words.length < 2) return null;
  const out = [];
  for (const w of words) {
    if (!CYR.test(w)) { out.push(w); continue; }
    const t = dict[norm(w)];
    if (t == null) return null;
    out.push(t);
  }
  const lead = seg.match(/^\s*/)[0];
  const tail = seg.match(/\s*$/)[0];
  return lead + out.filter(Boolean).join(' ') + tail;
};

const lookupPiecewise = (raw) => {
  if (!raw.includes(' ') && !SEG_SPLIT.test(raw)) return null;
  const parts = raw.split(SEG_SPLIT);
  let changed = false;
  const out = parts.map(p => {
    if (!p || !CYR.test(p)) return p;
    const t = lookup(p) ?? lookupWords(p);
    if (t != null) { changed = true; return t; }
    return p;
  });
  return changed ? out.join('') : null;
};

const translateTextNode = (n) => {
  const cur = n.nodeValue;
  if (!cur || !CYR.test(cur)) return;
  if (lastSet.get(n) === cur) return; // это наша же запись
  if (skip(n.parentElement)) return;
  const t = lookup(cur) ?? lookupPiecewise(cur);
  if (t && t !== cur) {
    lastSet.set(n, t);
    n.nodeValue = t;
  }
};

const translateAttrs = (el) => {
  for (const a of ATTRS) {
    const v = el.getAttribute && el.getAttribute(a);
    if (!v || !CYR.test(v)) continue;
    const t = lookup(v) ?? lookupPiecewise(v);
    if (t && t !== v) el.setAttribute(a, t);
  }
};

const walk = (root) => {
  if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (skip(root)) { if (root.matches && root.matches('input')) translateAttrs(root); return; }
  translateAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) translateTextNode(n);
    else if (!skip(n)) translateAttrs(n);
    // input[placeholder] внутри skip-селектора: сам input пропускается walker'ом
    else if (n.matches && n.matches('input')) translateAttrs(n);
  }
};

export async function initLiveTranslate() {
  const lang = getLang();
  if (lang === 'ru') return; // родной язык — движок не поднимаем вовсе

  try {
    const mod = await import('../locales/en.json');
    dict = mod.default || mod;
  } catch (e) {
    console.warn('[i18n] словарь не загрузился:', e?.message);
    return;
  }

  document.documentElement.lang = lang;
  walk(document.body);

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateTextNode(m.target);
      else if (m.type === 'attributes') { if (!skip(m.target) || m.target.matches('input')) translateAttrs(m.target); }
      else for (const node of m.addedNodes) walk(node);
    }
  });
  mo.observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRS,
  });
}
