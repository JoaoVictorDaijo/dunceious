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

import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const GENOME_FILE = 'examples/nucleotide/coronaviruses/sars-cov-2-NC_045512.gb';
const genbank = readFileSync(GENOME_FILE, 'utf8');
const genome = genbank.slice(genbank.indexOf('\nORIGIN') + '\nORIGIN'.length).replace(/[^acgt]/gi, '').toUpperCase();
const SWAP: Record<string, string> = { A: 'C', C: 'G', G: 'T', T: 'A' };

/** `genome[start, start + length)` with a substitution at each offset. */
function mutated(start: number, length: number, offsets: number[]): string {
  const bases = genome.substring(start, start + length).split('');
  for (const offset of offsets) bases[offset] = SWAP[bases[offset]];
  return bases.join('');
}

async function fuzzySearch(page: Page, query: string) {
  await page.getByPlaceholder('Enter query sequence...').fill(query);
  const started = Date.now();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText(/^\d+ matches$/)).toBeVisible();
  return Date.now() - started;
}

test('fuzzy search finds whole-query hits by identity in the search worker', async ({ page }) => {
  const errors: string[] = [];
  const workerUrls: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('worker', worker => workerUrls.push(worker.url()));
  await page.goto('/');
  await page.getByRole('button', { name: /Annotation Hub$/ }).click();
  await page.getByLabel('Import sequences files', { exact: true })
    .setInputFiles({ name: 'sars-cov-2.gb', mimeType: 'text/plain', buffer: Buffer.from(genbank) });
  await expect(page.getByRole('button', { name: /^Jump to sequence NC_045512/ })).toBeVisible();
  await page.getByRole('button', { name: /Visual Viewport$/ }).click();

  await page.getByRole('button', { name: 'Fuzzy', exact: true }).click();
  const query = mutated(10_000, 300, [50, 150, 250]);
  await page.getByPlaceholder('Enter query sequence...').fill(query);
  await expect(page.getByText('80% · ≤ 60 edits')).toBeVisible();

  // A representative long query must finish far inside the worker timeout.
  expect(await fuzzySearch(page, query)).toBeLessThan(5_000);
  const hit = page.getByRole('button', { name: /^Annotate match 10000–10300 in NC_045512/ });
  await expect(hit).toBeVisible();
  const row = page.locator('div', { has: hit }).filter({ hasText: '3 edits' }).last();
  await expect(row).toContainText('99%');

  expect(await fuzzySearch(page, mutated(20_000, 1_000, [100, 500, 900]))).toBeLessThan(5_000);
  await expect(page.getByRole('button', { name: /^Annotate match 20000–21000 in NC_045512/ })).toBeVisible();

  await page.getByText('Log Terminal', { exact: true }).click();
  await expect(page.getByText(/Search complete: \d+ matches found\./).first()).toBeVisible();
  await expect(page.getByText(/timeout|fallback|stopped after/i)).toHaveCount(0);
  expect(workerUrls.some(url => url.includes('search.worker'))).toBe(true);
  expect(errors).toEqual([]);
});
