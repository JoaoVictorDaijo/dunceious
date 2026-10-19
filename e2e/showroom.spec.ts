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

test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

const explanation = (page: Page, title: string) => page.getByRole('dialog', { name: title, exact: true });

/** Taps a control where it sits once the list settles, after checking nothing covers its centre. */
async function tapInPlace(page: Page, control: Locator) {
  const centre = async () => {
    const box = await control.boundingBox();
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  };
  await expect.poll(async () => {
    const point = await centre();
    return point !== null && control.evaluate((element, { x, y }) => element.contains(document.elementFromPoint(x, y)), point);
  }).toBe(true);
  const point = await centre();
  await page.touchscreen.tap(point!.x, point!.y);
}

async function expectExplained(page: Page, title: string) {
  await expect(explanation(page, title)).toBeVisible();
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(explanation(page, title)).toBeHidden();
}

test('the showroom test-drives the workbench sideways and never leaves the origin', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const errors: string[] = [];
  const requests: string[] = [];
  const popups: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  page.on('popup', popup => popups.push(popup.url()));
  context.on('page', opened => { if (opened !== page) popups.push(opened.url()); });

  await page.goto('/?shell=greeter');
  const testDrive = page.getByRole('button', { name: 'Test-drive the workbench', exact: true });
  await testDrive.click();
  await expect(page.getByText('Turn your phone sideways', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByText('Turn your phone sideways', { exact: true })).toBeHidden();
  await expect(page.getByText('Test drive', { exact: true })).toBeVisible();
  await expect(page.locator('[data-viewer-record="NC_045512"]')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).tap();

  await page.getByRole('button', { name: 'Show sidebar', exact: true }).tap();
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await expect(sidebar.locator('[data-navigator-record]')).toHaveCount(4);
  await sidebar.getByPlaceholder('Enter IUPAC sequence...').fill('ACGAAC');
  await sidebar.getByRole('button', { name: 'Search', exact: true }).tap();
  await expect(sidebar.getByRole('button', { name: /Annotate match .* in NC_045512/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Hide sidebar', exact: true }).tap();
  // The first hit becomes the viewer's selection, which brings up its selection controls.
  await expect(page.getByRole('button', { name: 'Zoom Sel', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Show sidebar', exact: true }).tap();
  await sidebar.getByRole('button', { name: 'Align sequences', exact: true }).tap();
  await expect(page.getByText('Test drive: nothing will be sent', { exact: true })).toBeVisible();
  const consent = page.getByRole('dialog', { name: 'Your sequences will leave this browser' });
  const pageUrl = page.url();
  for (const name of ['EMBL-EBI privacy notice', 'Terms of use']) {
    const link = consent.getByRole('link', { name, exact: true });
    await link.tap();
    await expectExplained(page, 'Link to another website');
    await link.click({ button: 'middle' });
    await expectExplained(page, 'Link to another website');
    await link.focus();
    await page.keyboard.press('Enter');
    await expectExplained(page, 'Link to another website');
  }
  expect(page.url()).toBe(pageUrl);

  await consent.getByRole('checkbox').check();
  await consent.getByRole('button', { name: 'Continue', exact: true }).tap();
  const configure = page.getByRole('dialog', { name: 'Align with EMBL-EBI' });
  await expect(configure.getByLabel('Email', { exact: true })).toHaveValue('you@example.org');
  await configure.getByRole('button', { name: 'Align', exact: true }).tap();
  await expectExplained(page, 'Align');
  await configure.getByRole('button', { name: 'Cancel', exact: true }).tap();

  await page.getByRole('button', { name: 'Exit', exact: true }).tap();
  await expect(testDrive).toBeFocused();

  expect(errors).toEqual([]);
  expect(popups).toEqual([]);
  expect(requests.filter(url => new URL(url).origin !== origin && !url.startsWith('data:'))).toEqual([]);
});

test.describe('the Hub, Export and the variant workspace on a phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('looks around the Hub, explains the export and compares the variants, all on this origin', async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const errors: string[] = [];
    const requests: string[] = [];
    const downloads: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    page.on('download', download => downloads.push(download.suggestedFilename()));

    await page.goto('/?shell=greeter');
    await page.getByRole('button', { name: 'Test-drive the workbench', exact: true }).click();
    await expect(page.locator('[data-viewer-record="NC_045512"]')).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss', exact: true }).tap();

    await page.getByRole('button', { name: 'Annotation Hub', exact: true }).tap();
    const hub = page.getByRole('region', { name: 'Annotation Hub' });
    await expect(hub.getByRole('tab', { name: /^By sequence/ })).toHaveAttribute('aria-selected', 'true');
    const cds = hub.getByRole('button', { name: /^CDS \d+$/ });
    await cds.tap();
    await expect(cds).toHaveAttribute('aria-pressed', 'true');
    const search = page.getByRole('searchbox', { name: 'Search annotations' });
    await search.fill('surface glycoprotein');
    await expect(hub.locator('[data-hub-summary]')).toHaveText('4 of 218 annotations in 4 of 4 sequences');
    // Enter lands the first match clear of the pinned section header, as a visitor sees it.
    await search.press('Enter');
    await expect(page.locator('[data-search-counter]')).toHaveText('1 / 4');
    await expect(hub.locator('[data-row-key][data-state="current"]')).toHaveAttribute('data-row-key', /^NC_045512:/);
    // Tap where the visitor sees the control. Playwright's own tap scrolls the row again
    // first, which can tuck it under the pinned section header.
    await tapInPlace(page, hub.getByRole('button', { name: 'Open surface glycoprotein on NC_045512 in viewport', exact: true }));
    await expect(page.getByRole('button', { name: 'Visual Viewport', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Back to Annotation Hub', { exact: true })).toBeVisible();

    await page.getByText('Back to Annotation Hub', { exact: true }).tap();
    await page.getByRole('button', { name: 'Export…', exact: true }).tap();
    const exportDialog = page.getByRole('dialog', { name: 'Export sequences' });
    await exportDialog.getByRole('radio', { name: 'GenBank', exact: true }).tap();
    await expect(exportDialog.getByLabel('File name', { exact: true })).toBeVisible();
    await exportDialog.getByRole('button', { name: 'Export 4 sequences', exact: true }).tap();
    await expect(explanation(page, 'Export file')).toContainText('sequences.gb, a GenBank file of these 4 sequences');
    await page.getByRole('button', { name: 'Got it', exact: true }).tap();
    await expect(exportDialog).toBeVisible();
    await expect(exportDialog.getByRole('radio', { name: 'GenBank', exact: true })).toHaveAttribute('aria-checked', 'true');
    await exportDialog.getByRole('button', { name: 'Cancel', exact: true }).tap();
    await expect(exportDialog).toBeHidden();

    await page.getByRole('button', { name: 'Visual Viewport', exact: true }).tap();
    await page.getByRole('button', { name: 'Layers 3/4', exact: true }).tap();
    await page.getByRole('group', { name: 'Layer options' }).getByRole('button', { name: 'Conservation', exact: true }).tap();
    await page.getByRole('button', { name: 'Layers 4/4', exact: true }).tap();
    await expect(page.locator('main').getByText('Conservation', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Compare to reference' }).tap();
    const comparison = page.getByRole('group', { name: 'Reference comparison' });
    await expect(comparison).toBeVisible();
    await comparison.getByRole('radio', { name: 'Differences', exact: true }).tap();
    await expect(comparison.getByRole('radio', { name: 'Differences', exact: true })).toHaveAttribute('aria-checked', 'true');

    expect(downloads).toEqual([]);
    expect(errors).toEqual([]);
    expect(requests.filter(url => new URL(url).origin !== origin && !url.startsWith('data:'))).toEqual([]);
  });
});

test.describe('the Hub search on a phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('two quick searches land on the second match and the list stays put', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/?shell=greeter');
    await page.getByRole('button', { name: 'Test-drive the workbench', exact: true }).click();
    await expect(page.locator('[data-viewer-record="NC_045512"]')).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss', exact: true }).tap();

    await page.getByRole('button', { name: 'Annotation Hub', exact: true }).tap();
    const hub = page.getByRole('region', { name: 'Annotation Hub' });
    await hub.getByRole('button', { name: /^CDS \d+$/ }).tap();
    const search = page.getByRole('searchbox', { name: 'Search annotations' });
    await search.fill('surface glycoprotein');
    await expect(hub.locator('[data-hub-summary]')).toHaveText('4 of 218 annotations in 4 of 4 sequences');
    // The second jump starts before the first one's scroll event arrives, as a quick visitor does it.
    await search.press('Enter');
    await search.press('Enter');
    await expect(page.locator('[data-search-counter]')).toHaveText('2 / 4');
    const current = hub.locator('[data-row-key][data-state="current"]');
    await expect(current).toHaveAttribute('data-row-key', /^OL461693:/);
    await expect(current).toBeInViewport();
    const region = hub.getByRole('region', { name: 'Annotations' });
    const landed = await region.evaluate(element => element.scrollTop);
    await page.waitForTimeout(500);
    expect(await region.evaluate(element => element.scrollTop)).toBe(landed);
    await expect(page.getByText(/Something went wrong/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
