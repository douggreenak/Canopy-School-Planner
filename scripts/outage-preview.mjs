/**
 * Renders the outage screen (no database needed — /api/auth is stubbed to 503)
 * and saves docs/screenshots/outage.png plus an animated docs/screenshots/outage.gif.
 * Usage: node scripts/outage-preview.mjs [base-url]   (needs `npm run dev` running; ffmpeg for the gif)
 */
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');
const BASE = process.argv[2] ?? 'http://localhost:3000';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (new URL(req.url()).pathname === '/api/auth') {
    req.respond({ status: 503, contentType: 'application/json', body: '{"error":"Database unavailable"}' });
  } else req.continue();
});
await page.evaluateOnNewDocument(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = 'nextjs-portal{display:none !important}';
    document.head.appendChild(st);
  });
});
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[role="status"] h1', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: join(OUT, 'outage.png') });

const mp4 = join(OUT, 'outage.mp4');
const rec = await page.screencast({ path: mp4 });
await new Promise((r) => setTimeout(r, 7000));
await rec.stop();
await browser.close();

execFileSync('ffmpeg', ['-y', '-i', mp4, '-vf', 'fps=15,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', join(OUT, 'outage.gif')], { stdio: 'ignore' });
rmSync(mp4);
console.log('saved outage.png and outage.gif');
