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

import { mkdirSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
const root = resolve('dist');
const staticPaths = new Set(['/', ...readdirSync(root, { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => '/' + relative(root, resolve(f.parentPath, f.name)).split(sep).join('/'))]);
function dna(length: number, seed: number) {
  let state = seed;
  return Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 'ACGT'[state >>> 30];
  }).join('');
}
const genome = dna(30000, 16);
const fasta = `>synthetic-16\n${genome}\n`;
const shots = '/tmp/ls-phase4-shots';
mkdirSync(shots, { recursive: true });
async function restrict(context: BrowserContext, corrupt = false) {
  const forbidden: string[] = [];
  const requests: string[] = [];
  await context.route('**/*', async route => {
    const req = route.request(); const url = new URL(req.url());
    requests.push(`${req.method()} ${req.url()}`);
    if (url.origin !== 'http://127.0.0.1:4173' || req.method() !== 'GET' || !staticPaths.has(url.pathname) || url.search) {
      forbidden.push(`${req.method()} ${req.url()}`); await route.abort(); return;
    }
    if (corrupt && url.pathname === '/wasm/local-align.wasm') await route.fulfill({ body: Buffer.from('corrupt wasm'), contentType: 'application/octet-stream' });
    else await route.continue();
  });
  return { forbidden, requests };
}
async function load(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Annotation Hub$/ }).click();
  await page.getByLabel('Import sequences files', { exact: true }).setInputFiles({ name: 'synthetic.fasta', mimeType: 'text/plain', buffer: Buffer.from(fasta) });
  await expect(page.getByRole('button', { name: /^Jump to sequence synthetic-16/ })).toBeVisible();
  await page.getByRole('button', { name: /Visual Viewport$/ }).click();
  await page.getByRole('button', { name: 'Fuzzy', exact: true }).click();
}
async function start(page: Page, query: string) {
  await page.getByPlaceholder('Enter query sequence...').fill(query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
}
async function done(page: Page) {
  await expect(page.locator('[data-sequence-search-section]').getByText('Search done', { exact: true }).last()).toBeVisible({ timeout: 90000 });
  await expect(page.locator('[data-search-hit]').first()).toBeVisible();
  const close = page.getByRole('dialog', { name: 'Local search job monitor' }).getByRole('button', { name: 'Close', exact: true });
  if (await close.isVisible()) await close.click();
}
test('Local search sends only enumerated static requests through search, Cancel and replacement', async ({ page, context }) => {
  const { forbidden, requests } = await restrict(context);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await load(page);
  await expect(page.getByText('Local search ready', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${shots}/switch.png` });
  await page.getByRole('button', { name: 'Local', exact: true }).click();
  await page.getByText('Local options', { exact: true }).click();
  await page.screenshot({ path: `${shots}/local-options.png` });
  await page.getByText('Local options', { exact: true }).click();
  await start(page, genome.slice(10000, 10040));
  await done(page);
  await expect(page.locator('[data-search-hit]').first()).toContainText('Score 200');
  await page.locator('[data-search-hit]').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/local-results.png` });
  await page.getByText('Search details', { exact: true }).click();
  await page.locator('[data-search-details]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/search-details.png` });
  await start(page, genome.slice(0, 10000));
  await expect(page.getByRole('dialog', { name: 'Local search job monitor' })).toBeVisible();
  await page.screenshot({ path: `${shots}/monitor.png` });
  await page.getByRole('button', { name: 'Minimize', exact: true }).click();
  await expect(page.locator('[data-local-search-pill]')).toBeVisible();
  await page.locator('[data-local-search-pill]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/pill.png` });
  await page.locator('[data-local-search-pill] button').click();
  const requestsBeforeCancel = [...requests];
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('[data-sequence-search-section]').getByText('Search cancelled', { exact: true }).last()).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Local search ready', { exact: true })).toBeVisible();
  expect(requests).toEqual(requestsBeforeCancel);
  await start(page, genome.slice(20000, 20030)); await done(page);
  expect(requests).toEqual(requestsBeforeCancel);
  expect(forbidden).toEqual([]); expect(errors).toEqual([]);
});
test('corrupt module fails visibly without any non-static request', async ({ page, context }) => {
  const { forbidden } = await restrict(context, true);
  await load(page);
  await expect(page.getByRole('button', { name: 'Local', exact: true })).toBeDisabled();
  await expect(page.getByText(/Local module load failed:/)).toBeVisible();
  await expect(page.locator('[data-search-hit]')).toHaveCount(0);
  expect(forbidden).toEqual([]);
});
test('searches, cancels and searches again offline after readiness', async ({ page, context }) => {
  const { forbidden, requests } = await restrict(context);
  await load(page);
  await expect(page.getByText('Local search ready', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Local', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  const requestsBeforeOffline = [...requests];
  await context.setOffline(true);
  await start(page, genome.slice(10000, 10030)); await done(page);
  await start(page, genome.slice(0, 10000));
  await expect(page.getByRole('dialog', { name: 'Local search job monitor' })).toBeVisible();
  const requestsBeforeCancel = [...requests];
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('[data-sequence-search-section]').getByText('Search cancelled', { exact: true }).last()).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Local search ready', { exact: true })).toBeVisible();
  expect(requests).toEqual(requestsBeforeCancel);
  await start(page, genome.slice(20000, 20030)); await done(page);
  expect(requests).toEqual(requestsBeforeCancel);
  expect(forbidden).toEqual([]);
  expect(requests).toEqual(requestsBeforeOffline);
});
