/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import { test, expect } from './fixtures';

// The probe hosts are under the reserved .invalid domain, which never resolves, so a broken guard
// reaches no server. The recorded attempts, not the failed fetches, prove interception.
test('the network guard blocks and records requests and WebSockets to other origins', async ({ page, networkGuard }) => {
  await page.goto('/');
  const outcomes = await page.evaluate(async () => {
    const workerSource = "fetch('https://worker.blocked.invalid/probe').then(() => postMessage('reached'), () => postMessage('blocked'));";
    const worker = new Worker(URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' })));
    const fromWorker = new Promise<string>(resolve => { worker.onmessage = event => resolve(event.data); });
    const socket = new Promise<string>(resolve => {
      new WebSocket('wss://socket.blocked.invalid/probe').onclose = () => resolve('closed');
    });
    const fromPage = await fetch('https://page.blocked.invalid/probe').then(() => 'reached', () => 'blocked');
    return { page: fromPage, worker: await fromWorker, socket: await socket };
  });
  expect(outcomes).toEqual({ page: 'blocked', worker: 'blocked', socket: 'closed' });
  expect(networkGuard.takeBlocked().sort()).toEqual([
    'GET https://page.blocked.invalid/probe',
    'GET https://worker.blocked.invalid/probe',
    'WebSocket wss://socket.blocked.invalid/probe',
  ]);
});

test('the network guard records a same-origin redirect to another origin', async ({ page, networkGuard, browserName }) => {
  test.skip(browserName === 'webkit', "Playwright's WebKit can't fulfill a redirect status, so the probe can't produce a redirect there.");
  await page.route('**/redirect-probe', route => route.fulfill({
    status: 302,
    headers: { location: 'https://redirect.blocked.invalid/probe' },
  }));
  await page.goto('/');
  const outcome = await page.evaluate(() => fetch('/redirect-probe').then(() => 'reached', () => 'blocked'));
  expect(outcome).toBe('blocked');
  expect(networkGuard.takeBlocked()).toEqual(['GET https://redirect.blocked.invalid/probe']);
});

// Load-bearing for the guard's teardown assertion: without it this test passes, and test.fail()
// reports that as a failure.
test('an attempt the spec leaves unconsumed fails the test', async ({ page }) => {
  test.fail();
  await page.goto('/');
  await page.evaluate(() => fetch('https://teardown.blocked.invalid/probe').catch(() => undefined));
});
