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

import { test, expect } from './fixtures';

// The probe hosts use the reserved .invalid domain, so a broken guard still sends nothing out:
// the recorded attempts prove interception, while the failed fetches alone would not.
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
