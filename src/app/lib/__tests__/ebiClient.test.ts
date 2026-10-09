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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEbiClient } from '../ebiClient';

afterEach(() => vi.useRealTimers());
const signal = new AbortController().signal;

describe('EBI HTTP client', () => {
  it('submits URL-encoded fields once to the selected engine', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('job-1'));
    const result = await createEbiClient(fetcher).submit('mafft', { email: 'a+b@x.org', sequence: '>s1\nAC\n' }, signal);
    expect(result).toEqual({ kind: 'ok', data: 'job-1' });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://www.ebi.ac.uk/Tools/services/rest/mafft/run');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(new URLSearchParams(String(init?.body)).get('email')).toBe('a+b@x.org');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([400, 429, 503, 403])('classifies HTTP %i and parses XML', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('<error><description>Try later</description></error>', { status, headers: { 'Retry-After': '90' } }));
    const result = await createEbiClient(fetcher).status('kalign', 'job', signal);
    expect(result).toMatchObject({ kind: status === 400 ? 'rejected' : 'http', status, detail: 'Try later' });
    if (result.kind === 'http') {
      expect(result.transient).toBe(status === 429 || status === 503);
      expect(result.retryAfterMs).toBe(status === 429 || status === 503 ? 60000 : undefined);
    }
  });

  it('returns NOT_FOUND as a successful status body', async () => {
    const client = createEbiClient(vi.fn<typeof fetch>().mockResolvedValue(new Response('NOT_FOUND')));
    expect(await client.status('muscle', 'missing', signal)).toEqual({ kind: 'ok', data: 'NOT_FOUND' });
  });

  it('maps rejected fetches to network failures', async () => {
    const client = createEbiClient(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')));
    expect(await client.resultTypes('mafft', 'job', signal)).toMatchObject({ kind: 'network' });
  });

  it('aborts a single request after 30 seconds', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise((_resolve, reject) => requestSignal!.addEventListener('abort', () => reject(new Error('aborted'))));
    });
    const pending = createEbiClient(fetcher).result('mafft', 'job', 'out', signal);
    await vi.advanceTimersByTimeAsync(30000);
    expect(await pending).toMatchObject({ kind: 'network' });
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives a submit 120 seconds before aborting, so a slow upload is not retried into a duplicate job', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise((_resolve, reject) => requestSignal!.addEventListener('abort', () => reject(new Error('aborted'))));
    });
    const pending = createEbiClient(fetcher).submit('mafft', { email: 'a@x.org', sequence: '>s1\nAC\n' }, signal);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ kind: 'network' });
    expect(requestSignal?.aborted).toBe(true);
  });

  it('forwards cancellation and cleans up its timeout', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('cancelled')));
    }));
    const pending = createEbiClient(fetcher).status('mafft', 'job', controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({ kind: 'network' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
