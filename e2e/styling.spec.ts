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

import { test, expect, type Page } from '@playwright/test';

async function openHub(page: Page) {
  await page.goto('/?shell=desktop');
  await page.getByRole('button', { name: /Annotation Hub$/ }).click();
  await page.getByLabel('Import sequences files', { exact: true }).setInputFiles({
    name: 'style.fa', mimeType: 'text/plain', buffer: Buffer.from('>style\nATGAAACCCGGG\n'),
  });
  await expect(page.getByRole('button', { name: 'Jump to sequence style', exact: true })).toBeVisible();
  await page.getByLabel('Import annotations files', { exact: true }).setInputFiles({
    name: 'style.gff3', mimeType: 'text/plain',
    buffer: Buffer.from('##gff-version 3\nstyle\ttest\tgene\t4\t9\t.\t-\t.\tID=gene1;Name=marker\n'),
  });
  await expect(page.getByRole('button', { name: 'Edit marker on style', exact: true })).toBeVisible();
}

async function addProbe(page: Page) {
  await page.locator('.app-root').evaluate(root => {
    const host = document.createElement('div');
    host.dataset.styleProbe = '';
    host.style.cssText = 'position:fixed;left:0;bottom:0;z-index:9999;background:white;padding:4px';
    host.innerHTML = '<button aria-label="Styling focus probe" class="outline-hidden focus-visible:ring-2 focus-visible:ring-env/60">Focus</button>'
      + '<span data-radius-xs class="rounded-xs"></span><span data-radius-sm class="rounded-sm"></span>'
      + '<span data-shadow class="shadow-xs"></span><span data-border class="border"></span>'
      + '<span data-env class="bg-env text-env"></span><span data-mono class="font-mono"></span>'
      + '<div class="space-y-2"><div>A</div><div data-space>B</div></div>'
      + '<div class="text-xs"><button data-inherited-leading class="text-[11px]">Small control</button></div>';
    root.append(host);
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`existing style contracts with ${colorScheme} preference`, () => {
    test.use({ colorScheme });
    test('keeps chrome, fonts, controls, utility scales and responsive export layout', async ({ page }) => {
      await openHub(page);
      await page.keyboard.press('Tab');
      const strip = page.getByRole('button', { name: 'Genome strip for style: 1 annotation', exact: true });
      await strip.focus();
      await expect(strip).toHaveCSS('outline-style', 'solid');
      await expect(strip).toHaveCSS('outline-width', '2px');
      await expect(strip).toHaveCSS('outline-color', 'rgb(245, 158, 11)');
      await addProbe(page);
      const probe = page.locator('[data-style-probe]');
      await expect(page.locator('nav.app-nav')).toHaveCSS('background-color', 'rgb(21, 30, 52)');
      await expect(page.locator('.app-root')).toHaveCSS('font-family', /Inter Variable.*ui-sans-serif.*system-ui.*Ubuntu.*Cantarell/);
      await expect(probe.locator('[data-mono]')).toHaveCSS('font-family', /JetBrains Mono Variable/);
      await expect(probe.locator('[data-inherited-leading]')).toHaveCSS('line-height', '16px');
      await expect(probe.locator('[data-radius-xs]')).toHaveCSS('border-radius', '2px');
      await expect(probe.locator('[data-radius-sm]')).toHaveCSS('border-radius', '4px');
      await expect(probe.locator('[data-shadow]')).toHaveCSS('box-shadow', /rgba\(0, 0, 0, 0.05\) 0px 1px 2px 0px/);
      await expect(probe.locator('[data-border]')).toHaveCSS('border-top-color', 'rgb(229, 231, 235)');
      await expect(probe.locator('[data-border]')).toHaveCSS('border-top-width', '1px');
      const environment = await probe.locator('[data-env]').evaluate(element => {
        const expected = document.createElement('span');
        expected.style.backgroundColor = 'var(--env)';
        element.append(expected);
        const actual = getComputedStyle(element).backgroundColor;
        const value = getComputedStyle(expected).backgroundColor;
        expected.remove();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const rgba = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data);
        };
        return { actual: rgba(actual), expected: rgba(value) };
      });
      expect(environment.actual).toEqual(environment.expected);
      expect(environment.actual[3]).toBe(255);
      await page.keyboard.press('Tab');
      await probe.getByRole('button', { name: 'Styling focus probe' }).focus();
      await expect(probe.getByRole('button', { name: 'Styling focus probe' })).toHaveCSS('outline-style', 'none');
      await expect(probe.getByRole('button', { name: 'Styling focus probe' })).toHaveCSS('box-shadow', /2px/);
      const spacing = await probe.locator('[data-space]').evaluate(element => element.getBoundingClientRect().top - element.previousElementSibling!.getBoundingClientRect().bottom);
      expect(spacing).toBe(8);
      await probe.evaluate(element => element.remove());

      for (const viewport of [{ width: 1440, height: 1000 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        await page.getByRole('button', { name: 'Export…', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Export sequences' });
        await expect(dialog).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await page.keyboard.press('Tab');
        const fileName = dialog.getByRole('textbox', { name: 'File name', exact: true });
        await fileName.focus();
        await expect(fileName).toBeFocused();
        await expect(fileName).toHaveCSS('outline-style', 'solid');
        await expect(fileName).toHaveCSS('outline-width', '2px');
        await expect(fileName).toHaveCSS('outline-color', 'rgb(245, 158, 11)');
        await expect(dialog.getByRole('radio', { name: 'FASTA', exact: true })).toHaveAttribute('aria-checked', 'true');
        const save = dialog.getByRole('button', { name: /^Export \d+ sequences?$/ });
        await expect(save).toBeEnabled();
        await expect(save).toHaveCSS('cursor', 'pointer');
        const bounds = await save.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
        await dialog.getByRole('button', { name: 'None', exact: true }).click();
        await expect(save).toBeDisabled();
        await expect(save).toHaveCSS('cursor', 'default');
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      }
    });
  });
}

test('keeps a visible outline when forced colors replace focus rings', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Forced-colors emulation is checked in Chromium; normal keyboard focus is checked in every engine.');
  await page.emulateMedia({ forcedColors: 'active' });
  await openHub(page);
  await addProbe(page);
  const control = page.getByRole('button', { name: 'Styling focus probe' });
  await page.keyboard.press('Tab');
  await control.focus();
  await expect(control).toHaveCSS('outline-style', 'solid');
  await expect(control).toHaveCSS('outline-width', '2px');
  await expect(control).toHaveCSS('outline-offset', '2px');
});
