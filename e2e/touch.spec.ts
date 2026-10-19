/*
 * Dunceious
 *
 * This file is part of Dunceious.
 *
 * Dunceious is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Dunceious is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.
 */

import { expect, test, type CDPSession, type Page } from '@playwright/test';

const listSelector = 'div.custom-scrollbar-pro.overflow-x-hidden';
const horizontalSelector = 'div.overflow-x-auto.overflow-y-hidden';
type Finger = { id: number; x: number; y: number };
type Probe = { cancels: number; brushMouseDowns: number; captures: string[]; releases: number[]; presses: number[] };

test.use({ hasTouch: true, isMobile: false, viewport: { width: 1280, height: 800 } });

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', fingers: Finger[]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: fingers });
}

async function snapshot(page: Page) {
  return page.evaluate(({ listSelector, horizontalSelector }) => {
    const list = document.querySelector<HTMLElement>(listSelector)!;
    const horizontal = document.querySelector<HTMLElement>(horizontalSelector)!;
    const probe = (window as unknown as { touchProbe: Probe }).touchProbe;
    return { left: horizontal.scrollLeft, top: list.scrollTop,
      width: parseFloat((horizontal.firstElementChild as HTMLElement).style.width),
      pageY: window.scrollY, scale: visualViewport!.scale, ...probe };
  }, { listSelector, horizontalSelector });
}

async function unchangedPage(page: Page) {
  const state = await snapshot(page);
  expect(state.pageY).toBe(0);
  expect(state.scale).toBe(1);
  expect(state.cancels).toBe(0);
  expect(state.brushMouseDowns).toBe(0);
}

async function setup(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const probe: Probe = { cancels: 0, brushMouseDowns: 0, captures: [], releases: [], presses: [] };
    Object.assign(window, { touchProbe: probe });
    document.addEventListener('pointerdown', e => probe.presses.push(e.pointerId), true);
    document.addEventListener('pointerup', e => probe.releases.push(e.pointerId), true);
    document.addEventListener('pointercancel', () => probe.cancels++, true);
    document.addEventListener('mousedown', e => {
      if ((e.target as Element).closest('.brush')) probe.brushMouseDowns++;
    }, true);
    for (const type of ['gotpointercapture', 'lostpointercapture']) {
      document.addEventListener(type, e => {
        const target = e.target as HTMLElement;
        probe.captures.push(`${type}:${target.hasAttribute('data-annotation-part') ? 'feature' : target.style.touchAction === 'none' ? 'surface' : 'other'}`);
      }, true);
    }
  });
  await page.goto('/?shell=desktop');
  await page.locator('input[type=file][multiple]').first().setInputFiles([
    'examples/nucleotide/coronaviruses/sars-cov-2-NC_045512.gb', 'examples/nucleotide/influenza-a-pr8-8segments.gb',
  ]);
  await expect(page.locator('[data-annotation-part]').first()).toBeVisible();
  await expect(page.locator('aside').getByRole('button', { name: /^Hide .+ in viewport$/ })).toHaveCount(9);
  const list = page.locator(listSelector);
  await expect(list).toBeVisible();
  const bounds = (await list.boundingBox())!;
  const mini = (await page.locator('[data-minimap-ruler]').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  return { cdp, errors, bounds, mini };
}

async function featurePoint(page: Page): Promise<Finger> {
  return page.evaluate(listSelector => {
    const list = document.querySelector(listSelector)!.getBoundingClientRect();
    for (const path of document.querySelectorAll('[data-annotation-part]')) {
      const rect = path.getBoundingClientRect();
      const x = Math.max(rect.left + 5, list.left + 140);
      const y = (rect.top + rect.bottom) / 2;
      if (x < Math.min(rect.right - 5, list.right - 20) && y > list.top && y < list.bottom && document.elementFromPoint(x, y) === path) {
        return { id: 1, x, y };
      }
    }
    throw new Error('No annotation has an unobstructed touch point');
  }, listSelector);
}

test('one finger pans both axes, including capture handoff from an annotation', async ({ page }) => {
  const h = await setup(page);
  const before = await snapshot(page);
  const p = await featurePoint(page);
  await touch(h.cdp, 'touchStart', [p]);
  await touch(h.cdp, 'touchMove', [{ ...p, x: p.x - 20, y: p.y - 10 }]);
  await touch(h.cdp, 'touchMove', [{ ...p, x: p.x - 70, y: p.y - 70 }]);
  await touch(h.cdp, 'touchEnd', []);
  await expect.poll(async () => (await snapshot(page)).left).toBeGreaterThan(before.left + 40);
  await expect.poll(async () => (await snapshot(page)).top).toBeGreaterThan(before.top + 40);
  await expect(page.getByRole('heading', { name: 'Annotation Details' })).toHaveCount(0);
  const after = await snapshot(page);
  expect(after.captures).toContain('lostpointercapture:feature');
  expect(after.captures).toContain('gotpointercapture:surface');
  await unchangedPage(page);
  expect(h.errors).toEqual([]);
});

test('a vertical pan can become a pinch without native cancellation or page zoom', async ({ page }) => {
  const h = await setup(page);
  const p = { id: 1, x: h.bounds.x + 300, y: h.bounds.y + 220 };
  const moved = { ...p, y: p.y - 80 };
  await touch(h.cdp, 'touchStart', [p]);
  await touch(h.cdp, 'touchMove', [moved]);
  await expect.poll(async () => (await snapshot(page)).top).toBeGreaterThan(40);
  const before = await snapshot(page);
  const second = { id: 2, x: moved.x + 100, y: moved.y };
  await touch(h.cdp, 'touchStart', [moved, second]);
  const spreadFirst = { ...moved, x: moved.x - 40, y: moved.y - 20 };
  const spreadSecond = { ...second, x: second.x + 40, y: second.y - 20 };
  await touch(h.cdp, 'touchMove', [spreadFirst, spreadSecond]);
  await expect.poll(async () => (await snapshot(page)).width).toBeGreaterThan(before.width * 1.5);
  // CDP lists the lifted points for a partial touchEnd; an empty list releases all.
  await touch(h.cdp, 'touchEnd', [spreadSecond]);
  expect((await snapshot(page)).releases).toEqual([(await snapshot(page)).presses[1]]);
  const ended = await snapshot(page);
  await touch(h.cdp, 'touchMove', [{ ...spreadFirst, x: spreadFirst.x - 40, y: spreadFirst.y - 40 }]);
  const after = await snapshot(page);
  expect(after.left).toBe(ended.left);
  expect(after.top).toBe(ended.top);
  expect(after.width).toBe(ended.width);
  await touch(h.cdp, 'touchEnd', []);
  await unchangedPage(page);
  expect(h.errors).toEqual([]);
});

test('tapping an annotation opens its details without rows capture', async ({ page }) => {
  const h = await setup(page);
  await touch(h.cdp, 'touchStart', [await featurePoint(page)]);
  await touch(h.cdp, 'touchEnd', []);
  await expect(page.getByRole('heading', { name: 'Annotation Details' })).toBeVisible();
  expect((await snapshot(page)).captures).not.toContain('gotpointercapture:surface');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await unchangedPage(page);
  expect(h.errors).toEqual([]);
});

for (const first of ['rows', 'minimap'] as const) {
  for (const ownerUpFirst of [true, false]) {
    test(`${first} owns cross-surface touch, ${ownerUpFirst ? 'owner' : 'rejected finger'} lifts first`, async ({ page }) => {
      const h = await setup(page);
      const row = { id: first === 'rows' ? 1 : 2, x: h.bounds.x + 350, y: h.bounds.y + 220 };
      const mini = { id: first === 'minimap' ? 1 : 2, x: h.mini.x + h.mini.width / 2, y: h.mini.y + 10 };
      const owner = first === 'rows' ? row : mini;
      const other = first === 'rows' ? mini : row;
      const before = await snapshot(page);
      await touch(h.cdp, 'touchStart', [owner]);
      await touch(h.cdp, 'touchStart', [owner, other]);
      const ignored = { ...other, x: other.x + 30, y: other.y + (first === 'rows' ? 0 : 20) };
      await touch(h.cdp, 'touchMove', [owner, ignored]);
      const rejected = await snapshot(page);
      expect(rejected.left).toBe(before.left);
      expect(rejected.top).toBe(before.top);
      expect(rejected.width).toBe(before.width);
      const moved = { ...owner, x: owner.x + (first === 'rows' ? -60 : 30) };
      await touch(h.cdp, 'touchMove', [moved, ignored]);
      await expect.poll(async () => (await snapshot(page)).left).toBeGreaterThan(before.left + 30);
      const owned = await snapshot(page);
      expect(owned.width).toBe(before.width);
      await touch(h.cdp, 'touchEnd', [ownerUpFirst ? moved : ignored]);
      const released = await snapshot(page);
      expect(released.releases).toEqual([released.presses[ownerUpFirst ? 0 : 1]]);
      if (ownerUpFirst) {
        await touch(h.cdp, 'touchMove', [{ ...ignored, x: ignored.x + 30 }]);
        const after = await snapshot(page);
        expect(after.left).toBe(owned.left);
        expect(after.width).toBe(owned.width);
      }
      await touch(h.cdp, 'touchEnd', []);
      await unchangedPage(page);
      // A real mouse brush after either release order proves d3's lifecycle is intact.
      await page.mouse.move(h.mini.x + h.mini.width * 0.65, h.mini.y + 30);
      await page.mouse.down();
      await page.mouse.move(h.mini.x + h.mini.width * 0.9, h.mini.y + 30, { steps: 5 });
      await page.mouse.up();
      await expect.poll(async () => (await snapshot(page)).width).not.toBe(before.width);
      expect(h.errors).toEqual([]);
    });
  }
}

test('minimap tap and drag keep the zoom and never start a compatibility mouse brush', async ({ page }) => {
  const h = await setup(page);
  const before = await snapshot(page);
  const drawingWidth = Number(await page.locator('[data-minimap-ruler]').getAttribute('width'));
  const p = { id: 1, x: h.mini.x + drawingWidth / 2, y: h.mini.y + 10 };
  await touch(h.cdp, 'touchStart', [p]);
  await touch(h.cdp, 'touchEnd', []);
  await expect.poll(async () => (await snapshot(page)).left).toBeGreaterThan(before.left + 100);
  const centred = await snapshot(page);
  expect(centred.width).toBe(before.width);
  const viewportWidth = await page.locator(horizontalSelector).evaluate(el => el.clientWidth);
  expect(centred.left).toBeCloseTo((before.width - 250) / 2 - viewportWidth / 2, -1);
  await touch(h.cdp, 'touchStart', [p]);
  await touch(h.cdp, 'touchMove', [{ ...p, x: p.x + 40 }]);
  await touch(h.cdp, 'touchEnd', []);
  await expect.poll(async () => (await snapshot(page)).left).toBeGreaterThan(centred.left + 100);
  expect((await snapshot(page)).width).toBe(before.width);
  await unchangedPage(page);
  expect(h.errors).toEqual([]);
});
