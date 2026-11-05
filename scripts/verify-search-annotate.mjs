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
const output = process.env.ANNOTATE_EVIDENCE || '/tmp/dunceious-annotate-evidence';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
const errors = [];

async function check({ width, touch }) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.ANNOTATE_URL || 'http://127.0.0.1:3002');
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'synthetic.fa', mimeType: 'text/plain', buffer: Buffer.from('>synthetic\nAAAACCCCAAAA'),
  });
  const query = page.getByPlaceholder('Enter IUPAC sequence...');
  await query.fill('AAAA'); await query.press('Enter');
  const actions = page.getByRole('button', { name: /Annotate match/ });
  await actions.first().waitFor();
  assert.equal(await actions.count(), 2);
  const button = actions.nth(1);
  await button.scrollIntoViewIfNeeded();
  await page.mouse.move(width - 5, 5);
  await page.waitForTimeout(200);
  const normal = await button.evaluate(el => {
    const style = globalThis.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return { opacity: style.opacity, display: style.display, width: rect.width, x: rect.x, right: rect.right };
  });
  assert.equal(normal.opacity, '1', 'Annotate is visible without hover');
  assert.notEqual(normal.display, 'none');
  assert.ok(normal.width > 20 && normal.x >= 0 && normal.right <= width, 'action fits the narrow layout');
  await page.screenshot({ path: `${output}/${width}-no-hover.png` });
  if (touch) {
    assert.equal(await page.evaluate(() => globalThis.matchMedia('(hover: none)').matches), true);
    await button.tap();
  } else {
    // Reach the action using Tab from the previous focusable control.
    await actions.first().focus();
    let reached = false;
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      reached = await button.evaluate(el => el === el.ownerDocument.activeElement);
      if (reached) break;
    }
    assert.ok(reached, 'Annotate can be reached by Tab');
    const focus = await button.evaluate(el => globalThis.getComputedStyle(el).boxShadow);
    assert.notEqual(focus, 'none', 'keyboard focus has a visible ring');
    await page.screenshot({ path: `${output}/${width}-keyboard-focus.png` });
    await page.keyboard.press('Enter');
  }
  const editor = page.locator('.fixed.inset-0').filter({ hasText: 'Create Feature' });
  await editor.waitFor();
  assert.deepEqual(await editor.locator('input[type=number]').evaluateAll(xs => xs.map(x => Number(x.value))), [8, 12]);
  assert.equal(await editor.locator('select').first().inputValue(), 'synthetic');
  await page.screenshot({ path: `${output}/${width}-correct-match-editor.png` });
  await editor.getByRole('button', { name: /Discard/ }).click();
  assert.equal(await actions.count(), 2, 'returning from annotation preserves search results');
  await page.close();
}
try {
  await check({ width: 1440, touch: false });
  await check({ width: 768, touch: true });
  assert.deepEqual(errors, []);
  console.log(`PASS: no-hover visibility, keyboard focus/Enter, touch, narrow layout, correct second match; Chromium ${browser.version()}`);
} finally { await browser.close(); }
