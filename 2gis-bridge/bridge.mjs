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
import { getFirestore, doc, setDoc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';

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

// Форма входа у 2ГИС живёт на том же URL (account.2gis.com), поэтому
// проверяем содержимое страницы: поле пароля видно — значит не залогинены.
async function hasLoginForm(page) {
  const pwd = page.locator('input[type="password"]:visible');
  if (await pwd.count()) return true;
  const body = await page.innerText('body').catch(() => '');
  return /Забыли пароль|СберБизнес ID/i.test(body) && /Войти/i.test(body);
}

async function isLoggedIn(page) {
  try {
    await page.goto(CABINET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    return !(await hasLoginForm(page));
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

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !LOGIN_MODE,
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  if (LOGIN_MODE) {
    log('Открываю личный кабинет 2ГИС — войдите в аккаунт в этом окне.');
    await page.goto(CABINET_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // Ждём входа до 15 минут, проверяя каждые 10 секунд
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(10000);
      const stillLogin = await hasLoginForm(page).catch(() => true);
      if (!stillLogin) {
        await page.waitForTimeout(5000); // дать кабинету догрузиться
        log('Вход выполнен, профиль сохранён. Запустите мост: npm start');
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

  setInterval(() => setBridge({ heartbeatISO: new Date().toISOString() }), 5 * 60 * 1000);

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
      await updateDoc(doc(db, 'review_replies', id), { status: 'error', errorNote: e.message }).catch(() => {});
    } finally {
      busy = false;
      setTimeout(process1, 2000);
    }
  };

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
