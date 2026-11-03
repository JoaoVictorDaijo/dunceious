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

import { expect, test, type Page, type TestInfo } from '@playwright/test';
const sequence = 'ATGAAACCCGGG';
const upload = (name: string, text: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });

async function tapChecked(page: Page, control: ReturnType<Page['getByRole']>, info: TestInfo, label: string) {
  await control.scrollIntoViewIfNeeded();
  const target = await control.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const top = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return { bounds: bounds.toJSON(), top: top?.outerHTML.slice(0, 400), hit: Boolean(top && element.contains(top)),
      nav: document.querySelector('nav')?.getBoundingClientRect().toJSON(),
      viewport: { width: innerWidth, height: innerHeight, x: scrollX, y: scrollY } };
  });
  await info.attach(label, { body: JSON.stringify(target), contentType: 'application/json' });
  expect(target.hit, label).toBe(true);
  await control.tap();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test.describe(`real workbench exports at ${viewport.width}x${viewport.height}`, () => {
    test.use({
      viewport, hasTouch: true,
      // Firefox supports the responsive touch viewport, but not isMobile emulation.
      isMobile: async ({ browserName }, use) => { await use(browserName !== 'firefox'); },
    });
    test('taps all formats and reloads the exported project without navigation interception', async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto('/?shell=desktop');
      await tapChecked(page, page.getByRole('button', { name: /Annotation Hub$/ }), info, 'open-hub');
      await page.getByLabel('Import sequences files', { exact: true }).setInputFiles(upload('sample.fa', `>sample\n${sequence}\n`));
      await expect(page.getByRole('button', { name: 'Jump to sequence sample', exact: true })).toBeVisible();
      await page.getByLabel('Import annotations files', { exact: true }).setInputFiles(upload('sample.gff3',
        '##gff-version 3\nsample\ttest\tgene\t4\t9\t.\t-\t.\tID=gene1;Name=marker\n'));
      await expect(page.getByRole('button', { name: 'Edit marker on sample', exact: true })).toBeVisible();
      let saved = '';
      for (const format of ['FASTA', 'GenBank', 'GFF3', 'Dunceious project']) {
        await tapChecked(page, page.getByRole('button', { name: 'Export…', exact: true }), info, format + '-open');
        const dialog = page.getByRole('dialog', { name: 'Export sequences' });
        await tapChecked(page, dialog.getByRole('button', { name: 'All', exact: true }), info, format + '-all');
        await tapChecked(page, dialog.getByRole('radio', { name: format, exact: true }), info, format + '-format');
        const pending = page.waitForEvent('download');
        await tapChecked(page, dialog.getByRole('button', { name: 'Export 1 sequence', exact: true }), info, format + '-save');
        const download = await pending;
        expect(await download.failure()).toBeNull();
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
        const text = Buffer.concat(chunks).toString('utf8');
        if (format === 'FASTA') expect(text).toContain(`>sample\n${sequence}`);
        if (format === 'GenBank') expect(text).toContain('complement(4..9)');
        // Preserve the imported GFF3 source column, as current develop requires.
        if (format === 'GFF3') expect(text).toMatch(/sample\ttest\tgene\t4\t9\t\.\t-\t\./);
        if (format === 'Dunceious project') {
          saved = text;
          expect(JSON.parse(text)).toMatchObject({ format: 2, records: [{ id: 'sample', sequence,
            features: [expect.objectContaining({ start: 3, end: 9, strand: -1 })] }] });
        }
        await expect(dialog).toBeHidden();
      }
      await page.getByLabel('Load project file', { exact: true }).setInputFiles(upload('restored.json', saved));
      await expect(page.getByText('Project loaded successfully.')).toBeAttached();
      await expect(page.getByRole('button', { name: 'Edit marker on sample', exact: true })).toBeVisible();
      await tapChecked(page, page.getByRole('button', { name: 'Export…', exact: true }), info, 'restored-open');
      const dialog = page.getByRole('dialog', { name: 'Export sequences' });
      await tapChecked(page, dialog.getByRole('radio', { name: 'Dunceious project', exact: true }), info, 'restored-format');
      const pending = page.waitForEvent('download');
      await tapChecked(page, dialog.getByRole('button', { name: 'Export 1 sequence', exact: true }), info, 'restored-save');
      const stream = await (await pending).createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      expect(JSON.parse(Buffer.concat(chunks).toString()).records).toEqual(JSON.parse(saved).records);
      expect(errors).toEqual([]);
    });
  });
}
