// Разовая проверка: что реально видно в кабинете под сохранённым профилем
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'profile'), {
  headless: true, viewport: { width: 1440, height: 900 }, locale: 'ru-RU',
});
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('https://account.2gis.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);
console.log('URL:', page.url());
await page.screenshot({ path: path.join(ROOT, 'debug', 'verify.png'), fullPage: false });
const text = (await page.innerText('body').catch(() => '')).slice(0, 1500);
console.log('BODY:', text.replace(/\n{2,}/g, '\n'));
await ctx.close();
process.exit(0);
