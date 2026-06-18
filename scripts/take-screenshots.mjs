/**
 * Captures README screenshots of the live app.
 * Usage: node scripts/take-screenshots.mjs [base-url]
 * Default base URL: http://localhost:3000
 *
 * Creates a throwaway demo account, visits each key page,
 * saves PNGs to docs/screenshots/, then signs out.
 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT  = join(__dir, '..', 'docs', 'screenshots');
const BASE = process.argv[2] ?? 'http://localhost:3000';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEMO_USER = `demo_${Date.now()}`;
const DEMO_PASS = 'canopy-demo-pw';

const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 2 };

async function shot(page, name) {
  await page.waitForNetworkIdle({ idleTime: 600, timeout: 8000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 400));
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  saved ${name}.png`);
}

(async () => {
  mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // ── Login screen ──────────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await shot(page, 'login');

  // ── Register demo account ─────────────────────────────────────────
  // Click "Create Account" link
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.textContent?.includes('Create Account'))?.click();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.type('input[autocomplete="username"]', DEMO_USER);
  await page.type('input[autocomplete="new-password"]', DEMO_PASS);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.textContent?.trim() === 'Create Account')?.click();
  });
  await page.waitForNetworkIdle({ idleTime: 600, timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));

  // Dismiss setup wizard if it appears
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const dismiss = btns.find(b => b.textContent?.includes('Skip') || b.textContent?.includes('Dismiss') || b.textContent?.includes('Not now'));
    dismiss?.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // ── Dashboard ─────────────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await shot(page, 'dashboard');

  // ── Schedule ──────────────────────────────────────────────────────
  await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle2' });
  await shot(page, 'schedule');

  // ── Grades ────────────────────────────────────────────────────────
  await page.goto(`${BASE}/grades`, { waitUntil: 'networkidle2' });
  await shot(page, 'grades');

  // ── Exams ─────────────────────────────────────────────────────────
  await page.goto(`${BASE}/exams`, { waitUntil: 'networkidle2' });
  await shot(page, 'exams');

  // ── Tasks ─────────────────────────────────────────────────────────
  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle2' });
  await shot(page, 'tasks');

  // ── Settings ──────────────────────────────────────────────────────
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2' });
  await shot(page, 'settings');

  await browser.close();
  console.log('\nDone! Screenshots saved to docs/screenshots/');
  console.log(`Demo account created: ${DEMO_USER} — you can delete it from the DB if needed.`);
})().catch(err => { console.error(err); process.exit(1); });
