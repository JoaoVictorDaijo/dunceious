/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.SEARCH_EVIDENCE || '/tmp/dunceious-search-evidence';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const settle = () => page.waitForTimeout(250);
try {
  await page.goto(process.env.SEARCH_URL || 'http://127.0.0.1:3001');
  const sequence = 'ACGT'.repeat(40);
  await page.locator('input[accept=".json"]').setInputFiles({
    name: 'synthetic-search.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ records: [{ id: 'synthetic', name: 'synthetic', sequence,
      features: [{ name: 'preserved-marker', type: 'misc_feature', start: 80, end: 90, strand: 1 }] }] })),
  });
  await page.getByTitle('Select Mode').waitFor();
  await settle();
  const query = page.getByPlaceholder('Enter IUPAC sequence...');
  const canvas = page.locator('.overflow-x-hidden.custom-scrollbar-pro canvas').first();
  const cleanPixels = await canvas.evaluate(el => el.toDataURL());
  const search = async q => { await query.fill(q); await query.press('Enter'); await settle(); };
  const clear = async () => { await page.getByTitle('Clear Search').click(); await settle(); };
  const matches = page.getByRole('button', { name: /Annotate/ });
  const selected = page.locator('section').filter({ hasText: 'Selection Inspector' }).locator('input[type=number]');
  await search('ACGTACGT');
  assert.equal(await matches.count(), 78);
  assert.notEqual(await canvas.evaluate(el => el.toDataURL()), cleanPixels, 'search paints highlights');
  await page.screenshot({ path: `${output}/results-before-clear.png` });
  await clear();
  assert.equal(await matches.count(), 0);
  assert.equal(await selected.count(), 0, 'selection created by search is cleared');
  assert.equal(await query.inputValue(), '', 'Clear Search retains its input-clearing contract');
  assert.equal(await canvas.evaluate(el => el.toDataURL()), cleanPixels, 'sequence highlights return to the clean rendering');
  assert.equal(await page.locator('svg rect[rx="4"]').count(), 1, 'imported annotation remains');
  await page.screenshot({ path: `${output}/results-after-clear.png` });

  await search('ACGTACGT');
  const first = matches.first();
  await first.scrollIntoViewIfNeeded();
  // Selecting a result card remains an explicit navigation action.
  await first.locator('..').locator('..').click({ position: { x: 15, y: 15 } });
  await settle();
  assert.equal(await matches.count(), 78);
  await page.mouse.click(1400, 880);
  await page.keyboard.press('+');
  await settle();
  assert.equal(await matches.count(), 78, 'focus/zoom do not dismiss results');
  // Enter a manual selection after the search. The search clear must preserve it.
  await selected.nth(0).fill('20');
  await selected.nth(1).fill('30');
  await query.fill('');
  assert.equal(await matches.count(), 78, 'typing an empty query does not implicitly clear highlights');
  await clear();
  assert.equal(await matches.count(), 0);
  assert.deepEqual(await selected.evaluateAll(xs => xs.map(x => Number(x.value))), [20, 30]);
  assert.equal(await page.locator('.overflow-x-hidden.custom-scrollbar-pro canvas').count(), 1);
  await page.screenshot({ path: `${output}/manual-selection-preserved.png` });
  await search('ACGT');
  assert.ok(await matches.count() > 0, 'search can restart after clear');
  await search('AAAAAAAAAAAAAAAA');
  assert.equal(await matches.count(), 0, 'no-result search replaces old highlights');
  await clear();
  assert.deepEqual(errors, []);
  console.log(`PASS: explicit cleanup, canvas highlights, manual selection, imported annotation, navigation and repeat search; Chromium ${browser.version()}`);
} finally {
  await browser.close();
}
