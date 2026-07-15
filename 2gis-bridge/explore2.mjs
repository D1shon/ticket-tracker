// Разведка страницы отзывов: структура, кнопки, сетевые запросы
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'profile'), {
  headless: true, viewport: { width: 1440, height: 900 }, locale: 'ru-RU',
});
const page = ctx.pages()[0] || await ctx.newPage();

const reqs = [];
page.on('request', r => {
  const u = r.url();
  if (/review|feedback|presence/i.test(u) && !/\.(js|css|png|svg|woff)/.test(u)) {
    reqs.push(r.method() + ' ' + u);
  }
});

await page.goto('https://account.2gis.com/orgs/70000001085349943/reviews', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(10000);

console.log('--- URL:', page.url());
console.log('--- REQUESTS ---');
console.log([...new Set(reqs)].join('\n'));

const body = (await page.innerText('body').catch(() => '')).slice(0, 4000);
console.log('--- BODY ---');
console.log(body.replace(/\n{3,}/g, '\n\n'));

const buttons = await page.$$eval('button', bs => bs.map(b => b.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean));
console.log('--- BUTTONS ---');
console.log([...new Set(buttons)].join(' | '));

await page.screenshot({ path: path.join(ROOT, 'debug', 'explore-reviews.png'), fullPage: true });
await ctx.close();
process.exit(0);
