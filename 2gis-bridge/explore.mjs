// Разведка кабинета: находим раздел отзывов и снимаем его структуру
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const shot = (page, name) => page.screenshot({ path: path.join(ROOT, 'debug', name), fullPage: false });

const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'profile'), {
  headless: true, viewport: { width: 1440, height: 900 }, locale: 'ru-RU',
});
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('https://account.2gis.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);

// 1) Все ссылки на странице
const links = await page.$$eval('a', as => as.map(a => a.innerText.trim().replace(/\s+/g, ' ') + ' => ' + a.href).filter(s => s.length > 4));
console.log('--- LINKS ---');
console.log([...new Set(links)].join('\n'));

// 2) Клик «Моя компания»
const my = page.getByText('Моя компания', { exact: false }).first();
if (await my.count()) {
  await my.click().catch(() => {});
  await page.waitForTimeout(5000);
  console.log('--- МОЯ КОМПАНИЯ URL:', page.url());
  const links2 = await page.$$eval('a', as => as.map(a => a.innerText.trim().replace(/\s+/g, ' ') + ' => ' + a.href).filter(s => s.length > 4));
  console.log([...new Set(links2)].join('\n'));
  const body = (await page.innerText('body').catch(() => '')).slice(0, 2000);
  console.log('--- BODY:', body.replace(/\n{2,}/g, '\n'));
  await shot(page, 'explore-company.png');
}
await ctx.close();
process.exit(0);
