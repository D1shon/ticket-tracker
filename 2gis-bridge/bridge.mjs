// 2ГИС мост HJ Track — публикует ответы менеджеров на отзывы через личный
// кабинет account.2gis.com. Работает на офисном ПК с постоянным профилем
// браузера (./profile): вход в кабинет выполняется один раз командой
//   node bridge.mjs login
// после чего мост слушает Firestore review_replies (status='pending') и
// публикует ответы. Статусы: pending → sent | error.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(ROOT, 'profile');
const DEBUG_DIR = path.join(ROOT, 'debug');
const CABINET_URL = 'https://account.2gis.com/';
const ORG_ID = '70000001085349943'; // Hero's Journey, Алматы
const REVIEWS_URL = `https://account.2gis.com/orgs/${ORG_ID}/reviews`;
const LOGIN_MODE = process.argv[2] === 'login';

const fb = initializeApp({
  apiKey: 'AIzaSyCPAitt8EX3ialTb2-_1FQimmlpw5blFYk',
  authDomain: 'hjtrack-928f5.firebaseapp.com',
  projectId: 'hjtrack-928f5',
  storageBucket: 'hjtrack-928f5.firebasestorage.app',
  messagingSenderId: '236581443884',
  appId: '1:236581443884:web:a9ce84dcbf0efc59267489',
});

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

let db;
const setBridge = (data) =>
  setDoc(doc(db, 'gis_bridge', '_bridge'), { ...data, updatedAtISO: new Date().toISOString() }, { merge: true }).catch(() => {});

async function saveDebug(page, tag) {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({ path: path.join(DEBUG_DIR, `${stamp}_${tag}.png`), fullPage: true });
    fs.writeFileSync(path.join(DEBUG_DIR, `${stamp}_${tag}.html`), await page.content());
    log(`debug сохранён: ${stamp}_${tag}`);
  } catch (e) { log('debug save fail', e.message); }
}

// Признак входа, независимый от языка интерфейса (ru/kk): после логина
// кабинет всегда редиректит на /orgs/<id>/... — форма входа живёт на корне.
function urlLoggedIn(page) {
  return /\/orgs\//.test(page.url());
}

async function isLoggedIn(page) {
  try {
    await page.goto(CABINET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    return urlLoggedIn(page);
  } catch { return false; }
}

// ── Публикация одного ответа ────────────────────────────────────────────────
// Кабинет 2ГИС — SPA; селекторы подбираем по текстам кнопок, чтобы пережить
// смену классов. При любой неудаче — скриншот+HTML в ./debug и статус error.
async function publishReply(page, reply) {
  const { reviewAuthor, reviewSnippet, text } = reply;

  // Логируем POST-запросы кабинета — пригодится, чтобы перейти на прямой API
  const posted = [];
  const sniff = (r) => {
    if (r.method() === 'POST' && /api\.account\.2gis\.com/.test(r.url())) {
      posted.push(r.url());
      log('  api POST:', r.url());
    }
  };
  page.on('request', sniff);

  try {
    await page.goto(REVIEWS_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);

    // Ищем карточку: по началу текста отзыва, затем по автору.
    // Список подгружается кнопкой «Загрузить ещё».
    const needle = (reviewSnippet || '').slice(0, 60).trim();
    let anchor = null;
    for (let round = 0; round < 12 && !anchor; round++) {
      if (needle) {
        const byText = page.getByText(needle, { exact: false }).first();
        if (await byText.count()) anchor = byText;
      }
      if (!anchor && reviewAuthor) {
        const byAuthor = page.getByText(reviewAuthor, { exact: true }).first();
        if (await byAuthor.count()) anchor = byAuthor;
      }
      if (!anchor) {
        const more = page.getByRole('button', { name: /Загрузить ещё/i }).first();
        if (await more.count()) { await more.click().catch(() => {}); await page.waitForTimeout(2500); }
        else { await page.mouse.wheel(0, 1600); await page.waitForTimeout(1000); }
      }
    }
    if (!anchor) {
      await saveDebug(page, 'review-not-found');
      throw new Error('Отзыв не найден в кабинете (ещё не появился в списке?)');
    }
    await anchor.scrollIntoViewIfNeeded().catch(() => {});

    // Кнопка «Ответить» в той же карточке: ближайший ancestor, содержащий её
    const container = anchor.locator('xpath=ancestor::*[.//button[contains(., "Ответить")]][1]');
    if (!(await container.count())) {
      await saveDebug(page, 'no-reply-button');
      throw new Error('Кнопка «Ответить» не найдена (возможно, уже отвечено)');
    }
    const replyBtn = container.getByRole('button', { name: /^Ответить$/ }).first();
    await replyBtn.click();
    await page.waitForTimeout(2000);

    // Поле ответа: textarea или contenteditable, появившееся после клика
    let box = page.locator('textarea:visible').last();
    if (!(await box.count())) box = page.locator('[contenteditable="true"]:visible').last();
    if (!(await box.count())) {
      await saveDebug(page, 'no-textarea');
      throw new Error('Поле для текста ответа не найдено');
    }
    await box.click();
    await box.fill(text);
    await page.waitForTimeout(800);
    await saveDebug(page, 'before-send');

    const sendBtn = page.getByRole('button', { name: /Опубликовать|Отправить/i }).last();
    if (!(await sendBtn.count())) {
      await saveDebug(page, 'no-send-button');
      throw new Error('Кнопка публикации не найдена');
    }
    await sendBtn.click();
    await page.waitForTimeout(5000);
    await saveDebug(page, 'after-send'); // для контроля первых публикаций

    // Проверка: наш текст появился на странице (ответ опубликован)
    const check = page.getByText(text.slice(0, 50).trim(), { exact: false });
    if (!(await check.count())) {
      log('  ⚠️ текст ответа не найден после отправки — проверьте скриншот after-send');
    }
  } finally {
    page.off('request', sniff);
  }
}

async function main() {
  for (let i = 0; ; i++) {
    try { await signInAnonymously(getAuth(fb)); break; }
    catch (e) { if (i >= 5) throw e; log('auth retry…'); await new Promise(r => setTimeout(r, 5000)); }
  }
  db = getFirestore(fb);
  log('[2gis-bridge] Firestore подключён');

  // 2ГИС убивает сессию при детекте headless-браузера, поэтому мост ВСЕГДА
  // работает в видимом окне (и при логине, и в рабочем режиме). На офисном ПК
  // это отдельное окно Chrome — его можно свернуть, оно не мешает.
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: 'ru-RU',
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  if (LOGIN_MODE) {
    log('Открываю личный кабинет 2ГИС — войдите в аккаунт в этом окне.');
    await page.goto(CABINET_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // Ждём входа до 15 минут: вход засчитан, только когда URL стал /orgs/…
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(10000);
      if (urlLoggedIn(page)) {
        await page.waitForTimeout(5000); // дать кабинету догрузиться
        log('Вход выполнен (кабинет открыт: ' + page.url().slice(0, 60) + '…). Профиль сохранён.');
        await setBridge({ auth: 'ok', heartbeatISO: new Date().toISOString() });
        await ctx.close();
        process.exit(0);
      }
    }
    log('Вход не выполнен за 10 минут, выходим.');
    await ctx.close();
    process.exit(1);
  }

  const authed = await isLoggedIn(page);
  await setBridge({ auth: authed ? 'ok' : 'need_login', heartbeatISO: new Date().toISOString() });
  if (!authed) log('⚠️ Нет входа в кабинет. Выполните: node bridge.mjs login');

  // Пульс + сторожок от «зомби»: при обрыве связи с Firestore запись не падает,
  // а ВИСНЕТ в очереди (так мост 31.07 три дня «работал», не слыша очередь ответов).
  // Если пульс реально не доставлен >15 минут — выходим; start-bridge.bat поднимет
  // свежий процесс через 15 секунд с новым соединением.
  let lastBeatOkAt = Date.now();
  const beat = async () => {
    const ok = await Promise.race([
      setDoc(doc(db, 'gis_bridge', '_bridge'), { heartbeatISO: new Date().toISOString(), updatedAtISO: new Date().toISOString() }, { merge: true })
        .then(() => true).catch(() => false),
      new Promise(r => setTimeout(() => r(false), 60 * 1000)), // запись висит >минуты = не доставлена
    ]);
    if (ok) lastBeatOkAt = Date.now();
    if (Date.now() - lastBeatOkAt > 15 * 60 * 1000) {
      log('🩺 сторожок: пульс не доставляется >15 мин (зомби-соединение) — перезапускаюсь');
      process.exit(1);
    }
  };
  setInterval(beat, 5 * 60 * 1000);

  // Очередь: обрабатываем pending-ответы по одному
  let busy = false;
  const queue = [];
  const process1 = async () => {
    if (busy || queue.length === 0) return;
    busy = true;
    const { id, data } = queue.shift();
    log(`Публикую ответ на отзыв ${id} (${data.club}, автор отзыва: ${data.reviewAuthor})`);
    try {
      if (!(await isLoggedIn(page))) {
        await setBridge({ auth: 'need_login' });
        throw new Error('Сессия кабинета истекла — нужен повторный вход');
      }
      await publishReply(page, data);
      await updateDoc(doc(db, 'review_replies', id), { status: 'sent', sentAtISO: new Date().toISOString(), errorNote: null });
      log(`✓ отправлен ${id}`);
    } catch (e) {
      log(`✗ ошибка ${id}:`, e.message);
      // «Отзыв не найден» — штатное запаздывание кабинета за публичной картой
      // (часы, иногда сутки). Не хороним ответ: ставим error, но retry-свип
      // ниже вернёт его в pending. До 96 попыток (~2 суток по 30 мин).
      const retries = (data.retryCount || 0) + 1;
      await updateDoc(doc(db, 'review_replies', id), { status: 'error', errorNote: e.message, retryCount: retries }).catch(() => {});
    } finally {
      busy = false;
      setTimeout(process1, 2000);
    }
  };

  // Retry-свип: каждые 30 минут возвращаем в очередь ответы, упавшие из-за
  // отставания кабинета («не найден») или разово истёкшей сессии — пока вход
  // снова в порядке. Прочие ошибки (нет кнопки/поля) не трогаем: они требуют
  // взгляда человека.
  const RETRYABLE = /не найден в кабинете|Сессия кабинета истекла/i;
  setInterval(async () => {
    try {
      if (!(await isLoggedIn(page))) return;
      const snap = await getDocs(query(collection(db, 'review_replies'), where('status', '==', 'error')));
      for (const d of snap.docs) {
        const r = d.data();
        if ((r.retryCount || 0) >= 96) continue;
        if (!RETRYABLE.test(r.errorNote || '')) continue;
        await updateDoc(doc(db, 'review_replies', d.id), { status: 'pending', errorNote: null });
        log(`↻ повтор ${d.id} (попытка ${(r.retryCount || 0) + 1})`);
      }
    } catch {}
  }, 30 * 60 * 1000);

  onSnapshot(query(collection(db, 'review_replies'), where('status', '==', 'pending')), snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type === 'added' || ch.type === 'modified') {
        if (!queue.some(q => q.id === ch.doc.id)) queue.push({ id: ch.doc.id, data: ch.doc.data() });
      }
    });
    process1();
  });

  log('Мост запущен, слушаю очередь ответов…');
}

main().catch(e => { console.error(e); process.exit(1); });
