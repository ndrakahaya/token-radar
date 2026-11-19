import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../out', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = resolve(root, `.${pathname}`);
  if (existsSync(file) && statSync(file).isDirectory()) file = resolve(file, 'index.html');
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end('Forbidden'); return; }
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const browser = await chromium.launch({ headless: true });
try {
  await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('console', msg => { if (msg.type() === 'error') console.error('browser console:', msg.text()); });
  page.on('pageerror', error => console.error('browser page error:', error.message));
  page.on('response', response => { if (response.status() >= 400) console.error('http error:', response.status(), response.url()); });
  await page.goto('http://127.0.0.1:4173/dashboard/', { waitUntil: 'networkidle' });

  await page.locator('#board').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/1-board.png' });
  await page.locator('#rows tr').first().click();
  await page.locator('#detail[hidden]').waitFor({ state: 'detached', timeout: 500 }).catch(() => {});
  await page.waitForSelector('#detail:not([hidden])');
  await page.screenshot({ path: 'screenshots/2-detail.png' });
  await page.locator('#detail-close').click();
  const category = page.locator('#category');
  await category.selectOption({ index: 1 });
  await page.screenshot({ path: 'screenshots/3-filtered.png' });
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
