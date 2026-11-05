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

import { test as base, expect } from '@playwright/test';

export * from '@playwright/test';

export interface NetworkGuard {
  /** Returns the attempts blocked so far and clears them, for a spec that provokes them on purpose. */
  takeBlocked(): string[];
}

/**
 * Every browser test runs behind this guard: a request or WebSocket to another origin is aborted
 * before it reaches the network and fails the test that made it. Routing sees only a redirect's
 * first URL, so a same-origin response that redirects elsewhere can't be aborted; the redirected
 * request still fails the test. The app opens no WebSockets, so all of them are blocked; ESLint
 * keeps them out of src/, since routing can't reach a worker's WebSocket.
 */
export const test = base.extend<{ networkGuard: NetworkGuard }>({
  networkGuard: [async ({ context, baseURL, serviceWorkers }, use) => {
    // A service worker can answer requests that context routing never sees.
    if (serviceWorkers !== 'block') throw new Error('Browser tests must run with serviceWorkers: "block".');
    if (!baseURL) throw new Error('Browser tests need a baseURL to tell the app origin from others.');
    const origin = new URL(baseURL).origin;
    // A blob: URL carries its creator's origin; a data: URL never reaches the network.
    const isLocal = (url: string) => url.startsWith('data:') || new URL(url).origin === origin;
    const blocked: string[] = [];
    // Records each redirected request to another origin once, whether or not routing also sees it.
    context.on('request', request => {
      if (request.redirectedFrom() && !isLocal(request.url())) blocked.push(`${request.method()} ${request.url()}`);
    });
    await context.route('**/*', async route => {
      const request = route.request();
      if (isLocal(request.url())) {
        await route.fallback();
        return;
      }
      if (!request.redirectedFrom()) blocked.push(`${request.method()} ${request.url()}`);
      await route.abort('blockedbyclient');
    });
    await context.routeWebSocket(() => true, async socket => {
      blocked.push(`WebSocket ${socket.url()}`);
      await socket.close();
    });
    await use({ takeBlocked: () => blocked.splice(0) });
    expect(blocked, 'requests or WebSockets to other origins').toEqual([]);
  }, { auto: true }],
});
