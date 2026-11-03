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


import { test, expect } from '@playwright/test';

test('current-develop gap notice retains its backdrop, visible-sibling spacing and focus', async ({ page }) => {
  await page.goto('/?shell=desktop');
  await page.getByRole('button', { name: /Annotation Hub$/ }).click();
  await page.getByLabel('Import sequences files', { exact: true }).setInputFiles({
    name: 'gaps.fa', mimeType: 'text/plain',
    buffer: Buffer.from('>gapped-one\nATG-AAACCC\n>gapped-two\nATGC--CCGGG\n'),
  });
  const notice = page.getByRole('alertdialog', { name: 'Alignment gaps removed' });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Dismiss', exact: true })).toBeFocused();
  await expect(notice.locator('..')).toHaveCSS('backdrop-filter', 'blur(4px)');
  const rows = notice.locator('li');
  await expect(rows).toHaveCount(2);
  const geometry = await notice.evaluate(dialog => {
    const section = dialog.querySelector('section')!;
    const paragraph = dialog.querySelector('#gap-notice-rule')!;
    const items = [...dialog.querySelectorAll('li')];
    const icon = dialog.querySelector('h2')!.previousElementSibling!;
    return {
      sectionGap: section.getBoundingClientRect().top - paragraph.getBoundingClientRect().bottom,
      itemGap: items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().bottom,
      itemMargin: getComputedStyle(items[1]).marginTop,
      iconShrink: getComputedStyle(icon).flexShrink,
      gradient: getComputedStyle(dialog.firstElementChild!).backgroundImage !== 'none',
    };
  });
  expect(geometry).toEqual({ sectionGap: 16, itemGap: 2, itemMargin: '2px', iconShrink: '0', gradient: true });
  await page.keyboard.press('Escape');
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Jump to sequence gapped-one', exact: true })).toBeVisible();
});

test('current-develop feature length and sequence controls preserve styling and keyboard focus', async ({ page }) => {
  await page.goto('/?shell=desktop');
  await page.getByRole('button', { name: /Annotation Hub$/ }).click();
  await page.getByLabel('Import sequences files', { exact: true }).setInputFiles({
    name: 'sample.fa', mimeType: 'text/plain', buffer: Buffer.from('>sample\nATGAAACCCGGG\n'),
  });
  await expect(page.getByRole('button', { name: 'Jump to sequence sample', exact: true })).toBeVisible();
  await page.getByLabel('Import annotations files', { exact: true }).setInputFiles({
    name: 'sample.gff3', mimeType: 'text/plain',
    buffer: Buffer.from('##gff-version 3\nsample\ttest\tgene\t4\t9\t.\t-\t.\tID=gene1;Name=marker\n'),
  });
  await expect(page.getByRole('button', { name: 'Edit marker on sample', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Visual Viewport$/ }).click();
  await page.locator('path[data-annotation-feature="marker"]').first().click();
  const details = page.locator('[data-record-details]');
  await expect(page.getByRole('heading', { name: 'Annotation Details', exact: true })).toBeVisible();
  const lengths = details.locator('[data-feature-lengths]');
  await expect(lengths).toContainText('feature sequence');
  await expect(lengths).toContainText('region spanned');
  const margins = await lengths.locator('p').evaluateAll(elements => elements.map(element => getComputedStyle(element).marginTop));
  expect(margins).toEqual(['4px', '4px']);
  const feature = details.getByRole('radio', { name: 'Feature sequence', exact: true });
  const region = details.getByRole('radio', { name: 'Region spanned', exact: true });
  await expect(feature).toBeChecked();
  await expect(feature.locator('..')).toHaveCSS('box-shadow', /0px 1px 3px/);
  const count = details.locator('[data-sequence-caption]').locator('..').locator('span').filter({ hasText: /6 bp feature sequence/ });
  await expect(count).toHaveCSS('border-radius', '4px');
  await page.keyboard.press('Tab');
  await region.focus();
  await expect(region).toBeFocused();
  await expect(region.locator('..')).toHaveCSS('box-shadow', /2px/);
  await page.keyboard.press('Space');
  await expect(region).toBeChecked();
  await expect(feature).not.toBeChecked();
  await expect(region.locator('..')).toHaveCSS('box-shadow', /0px 1px 3px/);
});
