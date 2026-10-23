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

const sequence = 'ATGAAACCCGGG';
const file = (name: string, text: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });

async function exported(page: Page, format: string, aligned = false) {
  await page.getByRole('button', { name: 'Export…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export sequences' });
  await expect(dialog.getByRole('radiogroup', { name: 'File format' })).toHaveCSS('display', 'grid');
  await dialog.getByRole('button', { name: 'All', exact: true }).click();
  await dialog.getByRole('radio', { name: format, exact: true }).click();
  if (aligned) await dialog.getByRole('checkbox', { name: 'Keep alignment gaps' }).check();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export 1 sequence', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test('built workers, annotations and exports preserve biological coordinates and format 2', async ({ page }) => {
  const errors: string[] = [];
  const workerUrls: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('worker', worker => workerUrls.push(worker.url()));
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/');
  await page.getByRole('button', { name: /Annotation Hub$/ }).click();
  await page.getByLabel('Import sequences files', { exact: true }).setInputFiles(file('sample.fa', `>sample\n${sequence}\n`));
  await expect(page.getByRole('button', { name: 'Jump to sequence sample', exact: true })).toBeVisible();
  await page.getByLabel('Import annotations files', { exact: true }).setInputFiles(file('sample.gff3',
    '##gff-version 3\nsample\ttest\tgene\t4\t9\t.\t-\t.\tID=gene1;Name=marker\n'));
  await expect(page.getByRole('button', { name: 'Edit marker on sample', exact: true })).toBeVisible();
  await page.getByLabel('Import pre-aligned FASTA file', { exact: true }).setInputFiles(file('aligned.fa', '>sample\nATG--AAACCCGGG\n'));
  // Waiting on the enabled option proves the asynchronous alignment worker was applied.
  await page.getByRole('button', { name: 'Export…', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Keep alignment gaps' })).toBeEnabled();
  await page.getByRole('button', { name: 'Close export dialog' }).click();

  await page.getByRole('button', { name: 'Edit marker on sample', exact: true }).click();
  await page.getByLabel('Display Name', { exact: true }).fill('edited marker');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search annotations' }).fill('edited marker');
  await page.getByRole('button', { name: 'Next match', exact: true }).click();
  await page.getByRole('button', { name: 'Open edited marker on sample in viewport', exact: true }).click();
  await expect(page.locator('path[data-annotation-part]')).not.toHaveCount(0);
  await page.getByPlaceholder('Enter IUPAC sequence...').fill('AAACCC');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('button', { name: /Annotate match .* in sample/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /Annotation Hub$/ }).click();

  expect(await exported(page, 'FASTA')).toContain(`>sample\n${sequence}`);
  expect(await exported(page, 'FASTA', true)).toContain('ATG--AAACCCGGG');
  const genbank = await exported(page, 'GenBank');
  expect(genbank).toContain('complement(4..9)');
  expect(genbank).not.toContain('hubEdit');
  const gff = await exported(page, 'GFF3');
  expect(gff).toMatch(/sample\ttest\tgene\t4\t9\t\.\t-\t\./);
  expect(gff).not.toContain('hubEdit');
  const projectText = await exported(page, 'Dunceious project');
  const project = JSON.parse(projectText);
  expect(project.format).toBe(2);
  expect(project.records[0]).toMatchObject({ id: 'sample', sequence, alignedSequence: 'ATG--AAACCCGGG',
    features: [expect.objectContaining({ name: 'edited marker', start: 3, end: 9, strand: -1, hubEdit: 'edited' })] });

  await page.getByLabel('Load project file', { exact: true }).setInputFiles(file('obsolete.json', JSON.stringify({ ...project, format: 1 })));
  await page.getByText('Log Terminal', { exact: true }).click();
  await expect(page.getByText("This project was saved by an earlier version of Dunceious and can't be opened.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit edited marker on sample', exact: true })).toBeVisible();
  await page.getByLabel('Load project file', { exact: true }).setInputFiles(file('restored.json', projectText));
  await expect(page.getByText('Project loaded successfully.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit edited marker on sample', exact: true })).toBeVisible();
  const restored = JSON.parse(await exported(page, 'Dunceious project'));
  expect(restored.records).toEqual(project.records);
  expect(workerUrls.some(url => /bio\.worker/.test(url))).toBe(true);
  expect(workerUrls.some(url => /search\.worker/.test(url))).toBe(true);
  expect(errors).toEqual([]);
});

test('sidebar titles add sequences and the top-bar Project menu saves and clears in both modes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Annotation Hub$/ }).click();
  await page.getByLabel('Import sequences files', { exact: true }).setInputFiles(file('sample.fa', `>sample\n${sequence}\n`));
  await expect(page.getByRole('button', { name: 'Jump to sequence sample', exact: true })).toBeVisible();
  const width = page.viewportSize()!.width;
  for (const title of ['Sequence index', 'Record Navigator']) {
    if (title === 'Record Navigator') await page.getByRole('button', { name: /Visual Viewport$/ }).click();
    const row = page.getByRole('heading', { name: title, exact: true }).locator('..');
    const rowBounds = (await row.boundingBox())!;
    const headingBounds = (await row.getByRole('heading').boundingBox())!;
    const addBounds = (await row.getByRole('button', { name: 'Add sequences…', exact: true }).boundingBox())!;
    expect(headingBounds.x + headingBounds.width).toBeLessThanOrEqual(addBounds.x);
    expect(headingBounds.height).toBeLessThan(20);
    if (title === 'Sequence index') expect(rowBounds.height).toBe(24);
    await expect(row.getByRole('button', { name: 'Workspace actions', exact: true })).toHaveCount(0);
    const nav = page.locator('nav.app-nav');
    await nav.getByRole('button', { name: 'Project and options', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Project and options', exact: true }).getByRole('group', { name: 'Project', exact: true });
    const menuBounds = (await menu.boundingBox())!;
    expect(menuBounds.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(width);
    await menu.press('Escape');
  }
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add sequences…', exact: true }).click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles(file('added.fa', '>added\nACGT\n'));
  await expect(page.locator('aside').getByText('added', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Project and options', exact: true }).click();
  page.once('dialog', dialog => dialog.accept('workspace'));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString('utf8')).records.map((record: { id: string }) => record.id)).toEqual(['sample', 'added']);
  await expect(page.getByRole('status').filter({ hasText: 'Saved as workspace.json' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept('shortcut'));
  const shortcutDownload = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  expect((await shortcutDownload).suggestedFilename()).toBe('shortcut.json');
  page.once('dialog', dialog => dialog.accept('CLEAR'));
  await page.getByRole('button', { name: 'Project and options', exact: true }).click();
  await page.getByRole('button', { name: 'Clear workspace…', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Record Navigator', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Annotation Hub$/ }).click();
  await page.getByRole('button', { name: 'Project and options', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clear workspace…', exact: true })).toBeDisabled();
});

async function expectOfficeLayerLabels(page: Page) {
  const nav = page.locator('nav.app-nav');
  const labels = ['Annotations', 'Tracks', 'Translation', 'Conservation'];
  for (const width of [1920, 1600, 1440, 1366, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const label of labels) {
      const button = nav.getByRole('button', { name: label, exact: true });
      await expect(button).toBeVisible();
      await expect(button).toHaveText(label);
    }
    const tray = (await nav.getByRole('group', { name: 'Viewport layers' }).boundingBox())!;
    const cog = (await nav.getByRole('button', { name: 'Project and options' }).boundingBox())!;
    expect(tray.x + tray.width).toBeLessThanOrEqual(cog.x);
    if (width === 1920) {
      const switcher = (await nav.locator('[data-workspace-switcher]').boundingBox())!;
      const bar = (await nav.boundingBox())!;
      expect(Math.abs(switcher.x + switcher.width / 2 - bar.x - bar.width / 2)).toBeLessThanOrEqual(1);
      await expect(nav.getByText('Because geniality is overpriced.')).toBeVisible();
    }
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  for (const [index, short] of ['Annot', 'Tracks', 'Transl', 'Conserv'].entries()) {
    await expect(nav.getByRole('button', { name: labels[index], exact: true })).toHaveText(short);
  }
  await page.setViewportSize({ width: 900, height: 900 });
  await nav.getByRole('button', { name: /^Layers/ }).click();
  await expect(nav.getByRole('group', { name: 'Layer options' })).toBeVisible();
  await nav.getByRole('group', { name: 'Layer options' }).press('Escape');
}

async function expectNoTopBarOverlap(page: Page) {
  const nav = page.locator('nav.app-nav');
  await expect.poll(() => nav.evaluate(element => {
    const bar = element.getBoundingClientRect();
    const boxes = ['[data-topbar-brand]', '[data-workspace-switcher]', '[aria-label="Workspace tools and options"]'].map(selector => element.querySelector(selector)!.getBoundingClientRect());
    return boxes.every(box => box.left >= bar.left && box.right <= bar.right && box.top >= bar.top && box.bottom <= bar.bottom)
      && boxes.every((box, index) => boxes.slice(index + 1).every(other => box.right <= other.left || other.right <= box.left));
  })).toBe(true);
}

async function expectCogResetReachable(page: Page) {
  const nav = page.locator('nav.app-nav');
  for (const [width, height] of [[1366, 768], [1024, 600]]) {
    await page.setViewportSize({ width, height });
    await nav.getByRole('button', { name: 'Project and options' }).click();
    const dialog = page.getByRole('dialog', { name: 'Project and options' });
    const reset = dialog.getByRole('button', { name: 'Reset to Defaults' });
    await reset.scrollIntoViewIfNeeded();
    await reset.focus();
    await expect(reset).toBeFocused();
    await reset.click({ trial: true });
    const box = (await reset.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(64);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    await dialog.press('Escape');
  }
}

test('top bar keeps layers inline on office screens', async ({ page }) => {
  const reference = 'reference-with-a-name-long-enough-to-hit-the-fourteen-rem-cap';
  const bases = 'ATG'.repeat(33333) + 'ACCGGTTGCA' + 'ATG'.repeat(6667);
  const fasta = `>${reference}\n${bases}\n>sample\n${bases.slice(0, 60000)}-${bases.slice(60001)}\n`;
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/?shell=desktop');
  const nav = page.locator('nav.app-nav');
  await nav.getByRole('button', { name: 'Annotation Hub', exact: true }).click();
  await page.getByLabel('Import sequences files', { exact: true }).setInputFiles(file('records.fa', fasta));
  await expect(page.getByRole('button', { name: 'Jump to sequence sample', exact: true })).toBeVisible();
  await page.getByLabel('Import pre-aligned FASTA file', { exact: true }).setInputFiles(file('aligned.fa', fasta));
  await nav.getByRole('button', { name: 'Visual Viewport', exact: true }).click();
  const compare = page.getByRole('button', { name: 'Compare to reference', exact: true });
  await expect(compare).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expectOfficeLayerLabels(page);

  await page.setViewportSize({ width: 680, height: 900 });
  await expectNoTopBarOverlap(page);
  await nav.getByRole('button', { name: 'Annotation Hub', exact: true }).click();
  await expectNoTopBarOverlap(page);
  const search = nav.getByRole('searchbox', { name: 'Search annotations' });
  await search.fill('sample');
  await nav.locator('[data-search-counter]').evaluate(element => { element.textContent = '1000 / 1000'; });
  await expect(nav).toHaveAttribute('data-fit-step', 'no-wordmark');
  await expectNoTopBarOverlap(page);
  expect((await search.boundingBox())!.width).toBeGreaterThanOrEqual(80);
  await expect(nav.getByRole('button', { name: 'Hide sidebar' })).toBeVisible();
  await expect(nav.getByText('Dunceious')).toHaveCount(0);
  await nav.getByRole('button', { name: 'Visual Viewport', exact: true }).click();

  await compare.click();
  const panel = page.getByRole('group', { name: 'Reference comparison' });
  const highlight = panel.getByRole('radio', { name: 'Differences' });
  await expect(panel.getByRole('radio', { name: 'Off' })).toBeFocused();
  await highlight.click();
  await expect.poll(() => highlight.evaluate(element => getComputedStyle(element).backgroundColor === getComputedStyle(document.querySelector('nav button[aria-label="Visual Viewport"]')!).backgroundColor)).toBe(true);
  expect(await highlight.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + 2));
  })).toBe(true);
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(680);
  for (const width of [1366, 680, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => {
      const anchor = (await compare.boundingBox())!;
      const box = (await panel.boundingBox())!;
      return Math.abs(box.y - anchor.y - anchor.height - 8);
    }).toBeLessThanOrEqual(1);
  }
  await panel.press('Escape');
  await expect(compare).toBeFocused();

  await page.setViewportSize({ width: 680, height: 900 });
  await page.getByPlaceholder('Enter IUPAC sequence...').fill('ACCGGTTGCA');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clear selection', exact: true })).toBeVisible();
  const toolbar = page.locator('[data-viewer-toolbar]');
  const stepBefore = await nav.getAttribute('data-fit-step');
  for (const width of [1366, 1024, 900, 680]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Center', 'Zoom Sel', 'Export selection as FASTA', 'Clear selection', 'Compare to reference', 'Fit', 'Zoom in', 'Zoom out']) {
      const control = toolbar.getByRole('button', { name, exact: true });
      await expect(control).toBeVisible();
      await expect.poll(async () => {
        const box = (await control.boundingBox())!;
        const bounds = (await toolbar.boundingBox())!;
        return box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width + 0.5 && box.y >= bounds.y && box.y + box.height <= bounds.y + bounds.height + 0.5;
      }).toBe(true);
    }
  }
  await toolbar.getByRole('button', { name: 'Clear selection' }).click();
  await expect(nav).toHaveAttribute('data-fit-step', stepBefore!);
  await expectCogResetReachable(page);
});
