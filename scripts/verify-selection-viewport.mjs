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

// Run against the local dev/preview server; fixtures are generated, never personal data.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation (no dependency changes).
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.VIEWPORT_EVIDENCE || '/tmp/dunceious-viewport-evidence';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox'],
});
const results = [];
const errors = [];
function syntheticSequence(length) {
  let seed = 0x51ec710;
  return Array.from({ length }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return 'ACGT'[seed >>> 30];
  }).join('');
}

async function scenario(dpr, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: dpr });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.VIEWPORT_URL || 'http://127.0.0.1:3000');
  const sequence = syntheticSequence(10000);
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'synthetic.fa', mimeType: 'text/plain', buffer: Buffer.from(`>synthetic\n${sequence}`),
  });
  await page.getByTitle('Select Mode').click();
  const scroller = page.locator('div.overflow-x-auto').last();
  const canvas = page.locator('.overflow-x-hidden.custom-scrollbar-pro canvas').first();
  const inspector = page.locator('section').filter({ hasText: 'Selection Inspector' });
  const inputs = inspector.locator('input[type=number]');
  const overlay = page.locator('.animate-selection-pulse');
  const metrics = () => scroller.evaluate(el => ({
    scroll: el.scrollLeft, width: el.clientWidth, maxScroll: el.scrollWidth - el.clientWidth,
    zoom: (parseFloat(el.firstElementChild.style.width) - 250) / 10000,
  }));
  const selected = () => inputs.evaluateAll(xs => xs.map(x => Number(x.value)));
  const settle = () => page.waitForTimeout(220);
  const scroll = async x => { await scroller.evaluate((el, v) => { el.scrollLeft = v; }, x); await settle(); };
  const record = async name => {
    const state = await metrics();
    const range = await inputs.count() ? await selected() : null;
    results.push({ name, dpr, windowWidth: width, ...state, selection: range });
    await page.screenshot({ path: path.join(output, `${width}-${dpr}-${name}.png`) });
  };
  const assertOverlay = async () => {
    const m = await metrics();
    const [start, end] = await selected();
    const box = await canvas.boundingBox();
    const area = await overlay.boundingBox();
    assert.ok(Math.abs(area.x - (box.x + start * m.zoom - m.scroll)) <= 1, 'overlay start matches drawn column');
    assert.ok(Math.abs(area.width - Math.max(2, (end - start) * m.zoom)) <= 1, 'overlay width matches interval');
  };
  const drag = async (from, to) => {
    const m = await metrics();
    const box = await canvas.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + from, y);
    await page.mouse.down();
    await page.mouse.move(box.x + to, y, { steps: 4 });
    await page.mouse.up();
    await settle();
    const expected = [from, to].map(x => Math.floor((Math.floor(box.x + x) - box.x + m.scroll) / m.zoom)).sort((a, b) => a - b);
    assert.deepEqual(await selected(), expected, 'drag maps screen to half-open columns');
    assert.equal((await metrics()).scroll, m.scroll, 'committing manual selection must not scroll');
    await assertOverlay();
  };
  const setRange = async (start, end) => {
    await inputs.nth(0).fill(String(start));
    await inputs.nth(1).fill(String(end));
    await page.locator('body').click({ position: { x: width - 10, y: 880 } });
    await settle();
  };
  const assertCentered = async () => {
    const m = await metrics();
    const [start, end] = await selected();
    const target = (start + end) / 2 * m.zoom - m.width / 2;
    assert.ok(Math.abs(m.scroll - Math.max(0, Math.min(m.maxScroll, target))) <= 1, 'selection midpoint is centered within native bounds');
  };

  await exerciseViewport({ page, canvas, scroller, inputs, metrics, selected, settle, scroll, drag, record, setRange, assertCentered, assertOverlay, sequence });
  await page.close();
}

async function exerciseViewport(h) {
  const { page, canvas, metrics, selected, settle, scroll, drag, record, sequence } = h;
  await settle();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 200, box.y + 70);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 300);
  await page.keyboard.up('Shift');
  await settle();
  assert.ok((await metrics()).scroll > 0, 'Shift+wheel updates native scrollbar');
  await drag(200.25, 300.25);
  await record('shift-wheel-drag');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const copyBox = await canvas.boundingBox();
  await page.mouse.click(copyBox.x + 250, copyBox.y + 70, { button: 'right' });
  await page.getByRole('button', { name: /Copy Sequence/ }).click();
  const copied = await page.evaluate(() => globalThis.navigator.clipboard.readText());
  const [copyStart, copyEnd] = await selected();
  assert.equal(copied, sequence.slice(copyStart, copyEnd), 'clipboard agrees with half-open selected columns');
  await page.getByTitle('Create Annotation from Selection').click();
  const editor = page.locator('.fixed.inset-0').filter({ hasText: 'Create Feature' });
  assert.deepEqual(await editor.locator('input[type=number]').evaluateAll(xs => xs.map(x => Number(x.value))), [copyStart, copyEnd]);
  await editor.getByRole('button', { name: /Discard/ }).click();

  for (const [name, setup] of [
    ['fractional', async () => page.keyboard.press('+')],
    ['dense', async () => page.getByRole('button', { name: 'Fit', exact: true }).click()],
    ['letters', async () => { for (let n = 0; n < 28; n++) await page.keyboard.press('+'); }],
  ]) {
    await page.keyboard.press('Escape');
    await setup();
    await settle();
    await scroll(name === 'dense' ? 0 : 1733);
    await drag(210.25, 410.25);
    await record(`${name}-forward`);
    await page.keyboard.press('Escape');
    await drag(410.25, 210.25);
    await record(`${name}-reverse`);
  }

  await exerciseSelectionControls(h);
}

async function exerciseSelectionControls(h) {
  const { page, canvas, metrics, selected, settle, scroll, record, setRange, assertCentered, assertOverlay } = h;
  const prior = await selected();
  const clickBox = await canvas.boundingBox();
  await page.mouse.click(clickBox.x + 550, clickBox.y + 70);
  assert.deepEqual(await selected(), prior, 'plain click retains existing range contract');
  const beforeShift = await metrics();
  await page.keyboard.down('Shift');
  await page.mouse.click(clickBox.x + 500, clickBox.y + 70);
  await page.keyboard.up('Shift');
  await settle();
  assert.deepEqual(await selected(), [prior[0], Math.floor((500 + beforeShift.scroll) / beforeShift.zoom)]);
  assert.equal((await metrics()).scroll, beforeShift.scroll, 'Shift-click does not jump');
  await record('shift-click');
  const handle = page.locator('.cursor-ew-resize').last();
  const handleBox = await handle.boundingBox();
  const handleBefore = await selected();
  const handleMetrics = await metrics();
  const handleX = Math.floor(handleBox.x + handleBox.width / 2);
  await page.mouse.move(handleX, clickBox.y + 70);
  await page.mouse.down();
  await page.mouse.move(handleX + 42, clickBox.y + 70, { steps: 4 });
  await page.mouse.up();
  await settle();
  assert.deepEqual(await selected(), [handleBefore[0], handleBefore[1] + Math.round(42 / handleMetrics.zoom)]);
  assert.equal((await metrics()).scroll, handleMetrics.scroll, 'resizing does not move the viewport');
  await assertOverlay();
  await record('resize-handle');

  for (const [start, end] of [[4000, 4200], [9000, 9001], [0, 1], [9999, 10000]]) {
    await setRange(start, end);
    await page.getByRole('button', { name: 'Zoom Sel', exact: true }).click();
    await settle();
    await assertCentered();
    await record(`zoom-${start}-${end}`);
    await scroll(0);
    await page.getByRole('button', { name: 'Center', exact: true }).click();
    await settle();
    await assertCentered();
  }
  await setRange(9900, 100);
  await page.getByRole('button', { name: 'Zoom Sel', exact: true }).click();
  await settle();
  assert.deepEqual(await selected(), [9900, 100], 'wrapped endpoints preserved');
  assert.ok((await metrics()).zoom < 0.15, 'both circular arms visible in linear viewport');
  await record('circular');

}


async function virtualized() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.VIEWPORT_URL || 'http://127.0.0.1:3000');
  const sequence = syntheticSequence(9996);
  const records = Array.from({ length: 40 }, (_, i) => ({
    id: `synthetic-${i}`, name: `synthetic-${i}`, sequence,
    alignedSequence: sequence.slice(0, 500) + '----' + sequence.slice(500),
    features: i % 2 ? [] : [{ type: 'misc_feature', name: `marker-${i}`, start: 4000, end: 4100, strand: 1 }],
  }));
  await page.locator('input[accept=".json"]').setInputFiles({
    name: 'synthetic-alignment.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ records, showTranslation: false })),
  });
  await page.getByTitle('Select Mode').click();
  const list = page.locator('.overflow-x-hidden.custom-scrollbar-pro');
  const scroller = page.locator('div.overflow-x-auto').last();
  await list.waitFor();
  await list.evaluate(el => { el.scrollTop = 1700; });
  await scroller.evaluate(el => { el.scrollLeft = 1600; });
  await page.waitForTimeout(250);
  assert.ok(await list.locator('canvas').count() < 40, 'rows are virtualized');
  const listBox = await list.boundingBox();
  const bounds = await list.locator('canvas').evaluateAll(xs => xs.map(x => {
    const b = x.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height };
  }));
  const box = bounds.find(b => b.y >= listBox.y && b.y + b.height < listBox.y + listBox.height);
  assert.ok(box, 'a fully visible virtualized row exists');
  const vertical = await list.evaluate(el => el.scrollTop);
  await page.mouse.move(box.x + 200, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, box.y + box.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const inputs = page.locator('section').filter({ hasText: 'Selection Inspector' }).locator('input[type=number]');
  assert.deepEqual(await inputs.evaluateAll(xs => xs.map(x => Number(x.value))), [1800, 2000]);
  assert.equal(await list.evaluate(el => el.scrollTop), vertical, 'manual selection does not jump to the first record');
  await page.screenshot({ path: path.join(output, 'virtualized-alignment-drag.png') });
  results.push({ name: 'virtualized-alignment-drag', vertical, selection: [1800, 2000] });

  await page.keyboard.press('Escape');
  await list.evaluate(el => { el.scrollTop = 0; });
  await scroller.evaluate(el => { el.scrollLeft = 3600; });
  await page.waitForTimeout(250);
  const feature = list.locator('svg rect[rx="4"]').first();
  await feature.click({ button: 'right' });
  await page.screenshot({ path: path.join(output, 'context-before-zoom.png') });
  await page.getByRole('button', { name: /Zoom to Annotation/ }).click();
  await page.waitForTimeout(250);
  assert.deepEqual(await inputs.evaluateAll(xs => xs.map(x => Number(x.value))), [4004, 4104]);
  const m = await scroller.evaluate(el => ({
    zoom: (parseFloat(el.firstElementChild.style.width) - 250) / 10000,
    left: el.scrollLeft, width: el.clientWidth,
  }));
  assert.ok(Math.abs(m.left - (4054 * m.zoom - m.width / 2)) <= 1, 'context menu centers its annotation, without a previous selection');
  await page.screenshot({ path: path.join(output, 'context-annotation-zoom.png') });
  results.push({ name: 'context-annotation-zoom', ...m, selection: [4004, 4104] });
  await page.close();
}

try {
  if (process.env.VIEWPORT_CASE !== 'virtualized') {
    for (const [dpr, width] of [[1, 1440], [2, 1600]]) await scenario(dpr, width);
  }
  await virtualized();
  assert.deepEqual(errors, [], 'no browser errors');
  console.log(`PASS: ${results.length} visual viewport cases; Chromium ${browser.version()}`);
} finally {
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ browser: browser.version(), results, errors }, null, 2));
  await browser.close();
}
