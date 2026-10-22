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

import { test, expect, type Locator, type Page } from '@playwright/test';

async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** Real Tailwind 3.4.19 baseline geometry, verified in all three browser engines. */
async function expectFields(scope: Locator, fields: ReadonlyArray<readonly [string, number, number]>) {
  const measured: { label: string; gap: number; containerOverhead: number }[] = [];
  for (const [label, gap, containerOverhead] of fields) {
    const field = scope.locator('label').filter({ hasText: new RegExp('^' + label + '$') });
    await expect(field).toHaveCount(1);
    const actual = await field.evaluate(element => {
      const next = element.nextElementSibling!.getBoundingClientRect();
      return {
        gap: next.top - element.getBoundingClientRect().bottom,
        // Keep spacing independent of how many lines of metadata are displayed.
        containerOverhead: element.parentElement!.getBoundingClientRect().height - next.height,
      };
    });
    measured.push({ label, ...actual });
    expect(actual, label).toEqual({ gap, containerOverhead });
  }
  await test.info().attach('field-geometry-' + fields[0][0], {
    body: JSON.stringify(measured), contentType: 'application/json',
  });
}

async function expectOuterGroups(page: Page) {
  for (const [name, gap, height] of [['Manual selection', 12, 96], ['Original coordinates', 8, 62]] as const) {
    const actual = await page.locator('aside').getByText(name, { exact: true }).evaluate((element, name) => {
      const first = name === 'Manual selection' ? element.parentElement! : element;
      return {
        gap: first.nextElementSibling!.getBoundingClientRect().top - first.getBoundingClientRect().bottom,
        height: first.parentElement!.getBoundingClientRect().height,
      };
    }, name);
    expect(actual, name).toEqual({ gap, height });
  }
}

async function openWorkbench(page: Page) {
  await page.goto('/?shell=desktop');
  await page.getByRole('button', { name: /Annotation Hub$/ }).click();
  await page.getByLabel('Import sequences files', { exact: true }).setInputFiles({
    name: 'sample.fa', mimeType: 'text/plain', buffer: Buffer.from('>sample spacing fixture\n' + 'ACGT'.repeat(30) + '\n'),
  });
  await expect(page.getByRole('button', { name: 'Jump to sequence sample', exact: true })).toBeVisible();
  await page.getByLabel('Import annotations files', { exact: true }).setInputFiles({
    name: 'sample.gff3', mimeType: 'text/plain',
    buffer: Buffer.from('##gff-version 3\nsample\ttest\tgene\t4\t9\t.\t-\t.\tID=gene1;Name=marker;Note=spacing-fixture\n'),
  });
  await expect(page.getByRole('button', { name: 'Edit marker on sample', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Visual Viewport$/ }).click();
  await settled(page);
}

test('navigation, search, selection and metadata keep their inline-label spacing', async ({ page }) => {
  await openWorkbench(page);
  const sidebar = page.locator('aside');
  await expectFields(sidebar, [['Go to position', 11, 32], ['Strand', 11, 32], ['Result limit', 11, 32]]);
  await page.getByRole('button', { name: 'Fuzzy', exact: true }).click();
  await settled(page);
  const sliderGeometry = await page.locator('#fuzzy-min-identity').evaluate(input => ({
    gap: input.getBoundingClientRect().top - input.previousElementSibling!.getBoundingClientRect().bottom,
    containerHeight: input.parentElement!.getBoundingClientRect().height,
  }));
  expect(sliderGeometry).toEqual({ gap: 16, containerHeight: 120.5 });
  await page.getByRole('button', { name: 'IUPAC', exact: true }).click();
  await settled(page);

  await page.locator('[data-navigator-record="sample"] [data-tip="Select this record"]').click();
  await settled(page);
  await expectFields(sidebar, [['Start', 7, 28], ['End', 7, 28]]);
  await expectOuterGroups(page);
  await page.locator('[data-viewer-record="sample"]').click({ button: 'right', position: { x: 5, y: 5 } });
  await page.getByRole('button', { name: /View Details$/ }).click();
  const details = page.locator('[data-record-details]');
  await expect(details).toBeVisible();
  await settled(page);
  await expectFields(details, [['Definition', 8, 28], ['Accession', 8, 28], ['Length', 8, 28], ['Features', 8, 28]]);
  await details.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('path[data-annotation-feature="marker"]').first().click();
  await expect(page.getByRole('heading', { name: 'Annotation Details', exact: true })).toBeVisible();
  await settled(page);
  await expectFields(details, [['Type', 8, 28], ['Locus', 8, 28], ['Strand', 8, 28], ['Length', 8, 28], ['Additional Metadata', 16, 53]]);
});

test('showroom navigation and shared search controls keep their inline-label spacing', async ({ page }) => {
  await page.goto('/?shell=greeter');
  await page.getByRole('button', { name: 'Test-drive the workbench', exact: true }).click();
  await expect(page.locator('[data-viewer-record="NC_001604"]')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await page.getByRole('button', { name: 'Show sidebar', exact: true }).click();
  await settled(page);
  await expectFields(page.getByRole('complementary', { name: 'Sidebar' }), [
    ['Go to position', 11, 32], ['Strand', 11, 32], ['Result limit', 11, 32],
  ]);
});

test('stack spacing preserves hidden siblings, explicit margins and component-root priority', async ({ page }) => {
  await page.goto('/?shell=desktop');
  await settled(page);
  const measured = await page.locator('.app-root').evaluate(root => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0';
    root.append(host);
    const rows: { mode: string; scale: number; firstGap: number; secondGap: number; firstTop: string; secondBottom: string }[] = [];
    for (const mode of ['block', 'flex']) {
      for (const scale of [1, 1.5, 2, 3, 4, 5, 6, 7, 8]) {
        const parent = document.createElement('div');
        parent.className = 'stack-y-' + scale;
        parent.style.cssText = 'width:20px;display:' + mode + (mode === 'flex' ? ';flex-direction:column' : '');
        parent.innerHTML = '<input hidden><div class="mb-1" style="height:10px"></div><input hidden>'
          + '<div class="mt-4 mb-2" style="height:10px"></div><div style="height:10px"></div>';
        host.append(parent);
        const first = parent.children[1], second = parent.children[3], third = parent.children[4];
        rows.push({
          mode, scale,
          firstGap: second.getBoundingClientRect().top - first.getBoundingClientRect().bottom,
          secondGap: third.getBoundingClientRect().top - second.getBoundingClientRect().bottom,
          firstTop: getComputedStyle(first).marginTop,
          secondBottom: getComputedStyle(second).marginBottom,
        });
      }
    }
    host.remove();
    return rows;
  });
  for (const row of measured) {
    expect(row).toEqual({
      mode: row.mode, scale: row.scale,
      firstGap: row.mode === 'flex' ? 4 + row.scale * 4 : Math.max(4, row.scale * 4),
      secondGap: row.scale * 4, firstTop: '0px', secondBottom: '0px',
    });
  }
});

test('the no-results SearchDetails component root keeps the stack gap', async ({ page }) => {
  await openWorkbench(page);
  await page.getByRole('button', { name: 'Fuzzy', exact: true }).click();
  const ready = page.getByText('Local search ready', { exact: true });
  await expect(ready).toBeVisible();
  await page.getByRole('button', { name: 'Local', exact: true }).click();
  await page.getByText('Local options', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Min identity', exact: true }).fill('100');
  await page.getByRole('spinbutton', { name: 'Min query coverage', exact: true }).fill('100');
  await page.getByPlaceholder('Enter query sequence...').fill('T'.repeat(20));
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Search done · No hits', { exact: true })).toBeVisible();
  await expect(page.locator('[data-search-hit]')).toHaveCount(0);
  const close = page.getByRole('dialog', { name: 'Local search job monitor' }).getByRole('button', { name: 'Close', exact: true });
  if (await close.isVisible()) await close.click();
  await settled(page);
  const gap = await page.locator('[data-search-details]').evaluate(element =>
    element.getBoundingClientRect().top - element.previousElementSibling!.getBoundingClientRect().bottom);
  expect(gap).toBe(24);
});
