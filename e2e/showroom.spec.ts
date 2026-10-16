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

test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

const explanation = (page: Page, title: string) => page.getByRole('dialog', { name: title, exact: true });

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
  await expect(sidebar.locator('[data-navigator-record]')).toHaveCount(10);
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
