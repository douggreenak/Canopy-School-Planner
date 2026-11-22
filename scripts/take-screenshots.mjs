/**
 * Captures README screenshots of the live app.
 * Usage: node scripts/take-screenshots.mjs [base-url]
 * Default base URL: http://localhost:3000
 *
 * Visits each key page and saves PNGs to docs/screenshots/.
 *
 * Privacy: run this against a LOCAL server + LOCAL database seeded with
 * fictional demo data — never against production or a real student's account.
 * Set DEMO_USER and DEMO_PASS to sign in to an existing demo account;
 * otherwise a throwaway account is registered (which writes to whatever
 * database the server is using).
 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT  = join(__dir, '..', 'docs', 'screenshots');
const BASE = process.argv[2] ?? 'http://localhost:3000';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const EXISTING = !!process.env.DEMO_USER;
const DEMO_USER = process.env.DEMO_USER ?? `demo_${Date.now()}`;
const DEMO_PASS = process.env.DEMO_PASS ?? 'canopy-demo-pw';

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
  // Pin the page clock to a school day (Mon 2026-11-23, 10:30) so demo
  // screenshots always show a populated day, and hide the Next.js dev badge.
  await page.evaluateOnNewDocument(() => {
    const FIXED = new Date('2026-11-23T10:30:00').getTime();
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...a) { if (a.length) super(...a); else super(FIXED); }
      static now() { return FIXED; }
    }
    window.Date = FixedDate;
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = 'nextjs-portal{display:none !important}';
      document.head.appendChild(st);
    });
  });

  // ── Login screen ──────────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await shot(page, 'login');

  // ── Sign in (existing demo account) or register a throwaway one ───
  const clickButton = (text, exact = false) => page.evaluate((t, ex) => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => ex ? b.textContent?.trim() === t : b.textContent?.includes(t))?.click();
  }, text, exact);
  if (EXISTING) {
    await page.type('input[autocomplete="username"]', DEMO_USER);
    await page.type('input[autocomplete="current-password"]', DEMO_PASS);
    await page.keyboard.press('Enter');
  } else {
    await clickButton('Create Account');
    await new Promise(r => setTimeout(r, 300));
    await page.type('input[autocomplete="username"]', DEMO_USER);
    await page.type('input[autocomplete="new-password"]', DEMO_PASS);
    await clickButton('Create Account', true);
  }
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

  // ── Transcript / Sync log ─────────────────────────────────────────
  await page.goto(`${BASE}/transcript`, { waitUntil: 'networkidle2' });
  await shot(page, 'transcript');
  await page.goto(`${BASE}/sync-log`, { waitUntil: 'networkidle2' });
  await shot(page, 'sync-log');

  // ── Grade detail + Final Exam Calculator (first class) ─────────────
  const classId = await page.evaluate(async () => (await (await fetch('/api/classes')).json())[0]?.id);
  if (classId) {
    await page.goto(`${BASE}/grades/${classId}`, { waitUntil: 'networkidle2' });
    await shot(page, 'grades-detail');
    await clickButton('Final Calc');
    await new Promise(r => setTimeout(r, 600));
    await shot(page, 'final-calc');
  }

  // ── Settings ──────────────────────────────────────────────────────
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2' });
  await shot(page, 'settings');

  await browser.close();
  console.log('\nDone! Screenshots saved to docs/screenshots/');
  if (!EXISTING) console.log(`Demo account created: ${DEMO_USER} — you can delete it from the DB if needed.`);
})().catch(err => { console.error(err); process.exit(1); });
