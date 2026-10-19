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

import { readFileSync, mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const genbank = readFileSync('examples/nucleotide/coronaviruses/sars-cov-2-NC_045512.gb', 'utf8');
const genome = genbank.slice(genbank.indexOf('\nORIGIN') + 7).replace(/[^acgt]/gi, '').toUpperCase();
const original = genome.slice(10_000, 10_080);
const query = original.slice(0, 10) + 'G' + original.slice(11, 20) + 'G' + original.slice(20, 50) + original.slice(51);
const expectedMarks = '||||||||||.|||||||||||||||||||||||||||||||||||||||-|||||||||||||||||||||||||||||';
const shots = '/tmp/ls-phase2-shots';

test('whole-query hit marks, alignment text and an annotation query layer', async ({ page }) => {
  mkdirSync(shots, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: /Annotation Hub$/ }).click();
  await page.getByLabel('Import sequences files', { exact: true }).setInputFiles({ name: 'sars.gb', mimeType: 'text/plain', buffer: Buffer.from(genbank) });
  await expect(page.getByRole('button', { name: /^Jump to sequence NC_045512/ })).toBeVisible();
  await page.getByRole('button', { name: /Visual Viewport$/ }).click();
  await page.getByRole('button', { name: 'Fuzzy', exact: true }).click();
  await page.getByPlaceholder('Enter query sequence...').fill(query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const card = page.locator('[data-search-hit]').first();
  await expect(card).toContainText('78 identical, 1 mismatch, 1 insertion, 1 deletion');
  const canvas = page.locator('[data-sequence-band][data-hit-marks]:not([data-hit-marks=""])').first();
  await expect(canvas).toHaveAttribute('data-hit-marks', expectedMarks);
  await expect(canvas).toHaveAttribute('data-hit-insertions', '10019');
  const alignment = card.locator('[data-hit-alignment]');
  await expect(alignment).not.toHaveAttribute('open');
  await alignment.locator('summary').click();
  await expect(alignment.locator('pre')).toContainText('Query');
  await expect(alignment.locator('pre')).toContainText('10001');
  await expect(alignment.locator('pre')).toContainText('TCTGATGTTCTTTACCAACC-ACCACAAACCTCTATCACCTCAGCTGTTTTGCAGAGTGG');
  await page.screenshot({ path: `${shots}/result-cards.png` });
  await page.getByRole('button', { name: 'Zoom Sel', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.screenshot({ path: `${shots}/forward-in.png` });
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-hit-marks', expectedMarks);
  await page.screenshot({ path: `${shots}/forward-out.png` });
  await page.getByRole('button', { name: 'Zoom Sel', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: /^Annotate match 10000–10080/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Add search details to the note' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const annotation = page.locator('[data-annotation-feature^="Match:"]').first();
  await expect(annotation).toBeVisible();
  await annotation.click();
  await page.getByLabel('Bases inside', { exact: true }).selectOption('query');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('[data-annotation-query]')).toBeVisible();
  await expect(page.locator('[data-annotation-base="10010"]')).toHaveText('G');
  await expect(page.locator('[data-annotation-base="10050"]')).toHaveText('−');
  await expect(page.locator('[data-annotation-insertion="G"]')).toBeVisible();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${shots}/annotation-query.png` });
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  const complements: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' };
  const reverseQuery = [...query].reverse().map(base => complements[base]).join('');
  await page.getByPlaceholder('Enter query sequence...').fill(reverseQuery);
  await page.locator('[data-sequence-search-section] select').selectOption('rev');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(card).toContainText('78 identical, 1 mismatch, 1 insertion, 1 deletion');
  await expect(canvas).toHaveAttribute('data-hit-marks', expectedMarks);
  await page.getByRole('button', { name: 'Zoom Sel', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.screenshot({ path: `${shots}/reverse-in.png` });
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.screenshot({ path: `${shots}/reverse-out.png` });
  expect(errors).toEqual([]);
});
