import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import type { Browser, Page, ElementHandle } from 'puppeteer-core';
import { BASE } from './helpers/env';
import { register, client, demoClasses, makeClass, type Session } from './helpers/api';
import { launch, signedInPage, clickButton, waitForText, sleep } from './helpers/browser';
import { testDb } from './helpers/db';
import { breakPresets } from '@/lib/breaks';
import { weekViewStart } from '@/lib/schedule';
import type { ScheduleDisruption } from '@/types';

dayjs.extend(isoWeek);

let browser: Browser;
beforeAll(async () => { browser = await launch(); });
afterAll(async () => { await browser?.close(); });

async function seededUser(extraClasses = true) {
  const session = await register();
  const api = client(session);
  const classes = demoClasses();
  if (extraClasses) classes.push(makeClass(8, 'Robotics Club', [1, 2, 3, 4, 5], '15:30', '17:00'));
  for (const c of classes) await api.post('/api/classes', c);
  return { session, api, classes };
}

async function openAddDisruption(page: Page) {
  await page.waitForSelector('#settings-disruptions');
  await clickButton(page, 'Add', '#settings-disruptions');
  await page.waitForSelector('[role="dialog"]');
}

async function chooseType(page: Page, label: string) {
  const combo = await page.$('[role="dialog"] [role="combobox"]');
  await combo!.click();
  await page.waitForSelector('[role="listbox"]');
  const opt = await page.evaluateHandle((l) => [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.trim() === l) ?? null, label);
  await (opt.asElement() as ElementHandle<Element>).click();
  await sleep(300);
}

describe('sign in through the real form', () => {
  it('signs in and lands on the dashboard; a wrong password shows an error', async () => {
    const s: Session = await register();
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
    await page.type('input[type="text"], input[name="username"]', s.username);
    await page.type('input[type="password"]', 'definitely-wrong-pw');
    await clickButton(page, 'Sign In');
    await waitForText(page, 'Invalid username or password');
    await page.click('input[type="password"]', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('input[type="password"]', s.password);
    await clickButton(page, 'Sign In');
    await page.waitForFunction(() => !document.body.innerText.includes('Sign in to access your planner'), { timeout: 15000 });
    await page.close();
  });
});

describe('Lathrop early-out disruption', () => {
  it('shows the official schedule in the week view and offers no early-out time choice', async () => {
    const { session, api } = await seededUser();
    // Wednesday of the week the Schedule page opens on.
    const wed = weekViewStart(dayjs()).add(2, 'day').format('YYYY-MM-DD');
    // Saved with deliberately wrong (legacy) times — the app must still show the official ones.
    await api.post('/api/disruptions', { id: 'ui-eo', date: wed, type: 'early_out', label: '', periodOverrides: [{ period: 2, startTime: '08:13', endTime: '09:26', cancelled: false }] });
    const page = await signedInPage(browser, session, '/schedule');
    await clickButton(page, 'Week');
    await page.waitForFunction(() => document.body.innerText.includes('AP Literature'), { timeout: 15000 });
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).toMatch(/8:15/);   // P2 official start
    expect(text).toMatch(/11:20/);  // P6 official start
    expect(text).not.toMatch(/8:13/);

    await openAddDisruption(page);
    const dialog = await page.$eval('[role="dialog"]', (d) => (d as HTMLElement).innerText);
    expect(dialog).toContain('official Early Out Bell Schedule');
    expect(dialog).not.toContain('Early End Time');
    await chooseType(page, 'Late Start');
    expect(await page.$eval('[role="dialog"]', (d) => (d as HTMLElement).innerText)).toContain('Late Start Time');
    await page.close();
  });
});

describe('custom schedule drag-and-drop editor', () => {
  it('starts from a template, then moves, resizes, cancels and saves blocks', async () => {
    const { session, api } = await seededUser();
    const page = await signedInPage(browser, session, '/schedule');
    await openAddDisruption(page);
    await chooseType(page, 'Custom');
    await page.waitForSelector('[data-testid="custom-schedule-editor"]');

    await clickButton(page, '1-6', '[data-testid="custom-schedule-editor"]');
    await clickButton(page, 'Use this', '[data-testid="custom-schedule-editor"]');
    await page.waitForSelector('[data-testid="block-1"]');
    const label = (p: number) => page.$eval(`[data-testid="block-${p}"]`, (el) => el.getAttribute('aria-label'));
    const before = await label(1);
    expect(before).toMatch(/AP Pre-Calculus/);

    // Drag P1 down ~50 minutes (1.1px/min → 55px).
    const block = (await page.$('[data-testid="block-1"]'))!;
    await block.scrollIntoView();
    const box = (await block.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, { steps: 5 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 55, { steps: 5 });
    await page.mouse.up();
    await sleep(300);
    const afterMove = await label(1);
    expect(afterMove).not.toBe(before);

    // Resize the top edge up ~20 minutes (nothing overlaps it).
    const handle = (await page.$('[data-testid="resize-start-1"]'))!;
    await handle.scrollIntoView();
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 - 22, { steps: 5 });
    await page.mouse.up();
    await sleep(300);
    const afterResize = await label(1);
    expect(afterResize).not.toBe(afterMove);

    // Keyboard: ArrowDown nudges 5 minutes.
    await page.focus('[data-testid="block-2"]');
    const b2 = await label(2);
    await page.keyboard.press('ArrowDown');
    await sleep(300);
    expect(await label(2)).not.toBe(b2);

    // Cancel P3.
    await page.click('button[aria-label="Cancel AP US History"]');
    await sleep(300);
    expect(await page.$('[data-testid="block-3"]')).toBeNull();      // leaves the grid…
    expect(await page.$('[data-testid="cancelled-3"]')).not.toBeNull(); // …and can be restored from the row

    await clickButton(page, 'Add', '[role="dialog"]');
    await sleep(800);
    const list = await api.get<ScheduleDisruption[]>('/api/disruptions');
    const custom = list.find((d) => d.type === 'custom')!;
    expect(custom).toBeTruthy();
    const p1 = custom.periodOverrides.find((o) => o.period === 1)!;
    const p3 = custom.periodOverrides.find((o) => o.period === 3)!;
    expect(p1.startTime).not.toBe('07:30');
    expect(p3.cancelled).toBe(true);
    await page.close();
  });
});

describe('week-view scrolling never traps the page', () => {
  it('scrolls the grid first, then hands off to the page at both ends', async () => {
    const { session } = await seededUser();
    const page = await signedInPage(browser, session, '/schedule');
    await clickButton(page, 'Week');
    await page.waitForFunction(() => document.body.innerText.includes('AP Literature'), { timeout: 15000 });
    await page.setViewport({ width: 1280, height: 600 });
    await sleep(300);

    const info = () => page.evaluate(() => {
      const grid = [...document.querySelectorAll('div')].find((el) => {
        const cs = getComputedStyle(el);
        return cs.overflowY === 'auto' && el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 300 && el.clientHeight < 700 && el.querySelector('[class*="MuiBox"]');
      }) as HTMLElement | undefined;
      const scroller = document.scrollingElement as HTMLElement;
      // The page may scroll via <html> or the app shell's own scroll area.
      const shell = [...document.querySelectorAll('div')].find((el) => {
        const cs = getComputedStyle(el);
        return cs.overflowY === 'auto' && el !== grid && el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 400 && (!grid || el.contains(grid));
      }) as HTMLElement | undefined;
      const outer = shell ?? scroller;
      return {
        hasGrid: !!grid,
        gridTop: grid?.scrollTop ?? -1,
        gridMax: grid ? grid.scrollHeight - grid.clientHeight : -1,
        outerTop: outer.scrollTop,
        gridRect: grid ? (() => { const r = grid.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })() : null,
      };
    });

    let s = await info();
    expect(s.hasGrid, 'week grid must be internally scrollable for this test to mean anything').toBe(true);
    const hover = async () => {
      s = await info();
      const r = s.gridRect!;
      await page.mouse.move(r.x + r.w / 2, Math.max(r.y + 40, Math.min(r.y + r.h / 2, 560)));
    };

    // 1) Wheel down: the grid scrolls and the page does not move until the grid is at its bottom.
    await hover();
    const outerStart = s.outerTop;
    await page.mouse.wheel({ deltaY: 120 });
    await sleep(250);
    s = await info();
    expect(s.gridTop).toBeGreaterThan(0);
    expect(s.outerTop).toBe(outerStart);

    // 2) Keep wheeling down: once the grid hits bottom, the PAGE must keep scrolling.
    for (let i = 0; i < 25; i++) { await hover(); await page.mouse.wheel({ deltaY: 300 }); await sleep(120); }
    await sleep(300);
    s = await info();
    expect(s.gridTop).toBeGreaterThanOrEqual(s.gridMax - 1);
    expect(s.outerTop, 'page must scroll after the grid reaches its bottom').toBeGreaterThan(outerStart);

    // 3) Wheel up over the grid: grid scrolls back up, then the page scrolls up (never stuck).
    const pageAtBottom = s.outerTop;
    for (let i = 0; i < 40; i++) { await hover(); await page.mouse.wheel({ deltaY: -300 }); await sleep(120); }
    await sleep(300);
    s = await info();
    expect(s.gridTop).toBeLessThanOrEqual(1);
    expect(s.outerTop, 'page must scroll back up once the grid is at its top').toBeLessThan(pageAtBottom);
    await page.close();
  });
});

describe('break presets', () => {
  it('opens a pre-filled No School dialog and saves the summer break', async () => {
    const { session, api } = await seededUser(false);
    const page = await signedInPage(browser, session, '/schedule');
    await page.waitForSelector('[data-testid="break-summer"]');
    await page.click('[data-testid="break-summer"]');
    await page.waitForSelector('[role="dialog"]');
    const preset = breakPresets().find((b) => b.key === 'summer')!;
    const dates = await page.$$eval('[role="dialog"] input[type="date"]', (els) => els.map((e) => (e as HTMLInputElement).value));
    expect(dates).toEqual([preset.date, preset.endDate]);
    expect(await page.$eval('[role="dialog"] input[type="text"]', (e) => (e as HTMLInputElement).value)).toBe('Summer break');
    await clickButton(page, 'Add', '[role="dialog"]');
    await sleep(800);
    const list = await api.get<ScheduleDisruption[]>('/api/disruptions');
    expect(list.find((d) => d.label === 'Summer break')).toMatchObject({ type: 'no_school', date: preset.date, endDate: preset.endDate });
    await page.close();
  });
});

describe('"due next class" respects disruptions', () => {
  it('skips a no-school meeting when quick-adding homework', async () => {
    const session = await register();
    const api = client(session);
    const spanish = makeClass(1, 'Spanish III', [1, 3], '08:00', '09:00');
    await api.post('/api/classes', spanish);
    const nextDays = (from: dayjs.Dayjs) => { let d = from.add(1, 'day'); while (![1, 3].includes(d.day())) d = d.add(1, 'day'); return d; };
    const first = nextDays(dayjs());
    const second = nextDays(first);
    await api.post('/api/disruptions', { id: 'ns-1', date: first.format('YYYY-MM-DD'), type: 'no_school', label: 'PD day', periodOverrides: [] });

    const page = await signedInPage(browser, session, '/tasks');
    await page.waitForFunction(() => document.body.innerText.includes('Spanish III'), { timeout: 15000 });
    const chip = await page.evaluateHandle(() => [...document.querySelectorAll('.MuiChip-root')].find((c) => c.textContent?.trim() === 'Spanish III') ?? null);
    await (chip.asElement() as ElementHandle<Element>).click();
    await sleep(1200);
    const tasks = await api.get<{ dueDate: string; classId: string }[]>('/api/tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].dueDate).toBe(second.format('YYYY-MM-DD'));
    expect(tasks[0].dueDate).not.toBe(first.format('YYYY-MM-DD'));
    await page.close();
  });
});

describe('transcript shows past school years', () => {
  it('groups by school year and names archived classes', async () => {
    const { session } = await seededUser(false);
    const db = await testDb();
    try {
      const [[u]] = (await db.query('SELECT id FROM users WHERE username = ?', [session.username.toLowerCase()])) as unknown as [{ id: string }[]];
      await db.query('INSERT INTO archived_classes (id, user_id, name, teacher, period, grade, grade_percent, is_ap, school_year) VALUES (?,?,?,?,?,?,?,?,?)',
        ['old-1', u.id, 'AP Chemistry', 'Ms. Demo', 1, 'A', 96, 1, '2024-25']);
      await db.query('INSERT INTO grade_history (id, user_id, class_id, grade_percent, letter, semester, captured_at) VALUES (?,?,?,?,?,?,?)',
        ['gh-old', u.id, 'old-1', 96, 'A', 'Current', '2025-05-20 12:00:00']);
      const [cls] = (await db.query('SELECT id FROM classes WHERE user_id = ? LIMIT 1', [u.id])) as unknown as [{ id: string }[]];
      await db.query('INSERT INTO grade_history (id, user_id, class_id, grade_percent, letter, semester, captured_at) VALUES (?,?,?,?,?,?,?)',
        ['gh-new', u.id, cls[0].id, 91, 'A-', 'Current', '2026-11-10 12:00:00']);
    } finally { await db.end(); }
    const page = await signedInPage(browser, session, '/transcript');
    await waitForText(page, 'AP Chemistry');
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).toContain('2024-25');
    expect(text).toContain('2026-27');
    expect(text).not.toContain('Unknown Class');
    await page.close();
  });
});
