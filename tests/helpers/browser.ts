import './env';
import puppeteer, { type Browser, type Page, type ElementHandle } from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { BASE } from './env';
import type { Session } from './api';

function chromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean) as string[];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome not found — set CHROME_PATH.');
  return found;
}

export async function launch(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 720 },
  });
}

/** New page already signed in as `session` (session cookie set directly). */
export async function signedInPage(browser: Browser, session: Session, path = '/'): Promise<Page> {
  const page = await browser.newPage();
  await page.setCookie({ name: 'sp-session', value: session.token, url: BASE });
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
  await dismissOverlays(page);
  return page;
}

/** Closes first-run wizards/dialogs that sit on top of a brand-new account. */
export async function dismissOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const closed = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return false;
      const btn = [...dlg.querySelectorAll('button')].find((b) => /^(skip|close|not now|dismiss|later|skip for now)/i.test(b.textContent?.trim() ?? ''));
      if (btn) { (btn as HTMLButtonElement).click(); return true; }
      return false;
    });
    if (!closed) break;
    await new Promise((r) => setTimeout(r, 400));
  }
}

export async function clickButton(page: Page, text: string, scope = 'body'): Promise<void> {
  const handle = await page.evaluateHandle((t, s) => {
    const root = document.querySelector(s) ?? document.body;
    return [...root.querySelectorAll('button, [role="button"], [role="tab"]')]
      .find((b) => (b.textContent ?? '').trim() === t) ?? null;
  }, text, scope);
  const el = handle.asElement() as ElementHandle<Element> | null;
  if (!el) throw new Error(`button "${text}" not found in ${scope}`);
  await el.click();
}

export async function waitForText(page: Page, text: string, timeout = 15000): Promise<void> {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
