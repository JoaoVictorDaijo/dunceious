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

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@/src/app/testing/renderHarness';
import { clearAlignConsent, writeAlignConsent } from '@/src/app/shared/logic/alignConsentPref';
import { useBioWorker } from '../useBioWorker';
import { useRemoteAlignment } from '../useRemoteAlignment';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { EbiClient, EbiResponse } from '@/src/app/shared/lib/ebiClient';

beforeEach(() => { clearAlignConsent(); writeAlignConsent(new Date('2026-10-09T12:00:00.000Z')); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const records: SeqRecord[] = [
  { id: 'a', name: 'a', sequence: 'AC', features: [], visible: false },
  { id: 'b', name: 'b', sequence: 'AGC', features: [] },
];
const ok = (data: string): EbiResponse => ({ kind: 'ok', data });
function fakeEbi() {
  const statusReplies: Array<(response: EbiResponse) => void> = [];
  let submitted = 0;
  const client: EbiClient = {
    submit: vi.fn(async () => ok(`job-${++submitted}`)),
    status: vi.fn(() => new Promise<EbiResponse>(resolve => { statusReplies.push(resolve); })),
    resultTypes: vi.fn(async () => ok('<identifier>fa</identifier>')),
    result: vi.fn(async () => ok('>s1\nA-C\n>s2\nAGC')),
  };
  const respond = (response: EbiResponse, call = statusReplies.length - 1) => statusReplies[call](response);
  const reply = (response: EbiResponse, call?: number) => act(async () => respond(response, call));
  return { client, respond, reply };
}
function harness() {
  const { client, reply } = fakeEbi();
  const apply = vi.fn(() => 3);
  const log = vi.fn();
  const hook = renderHook(({ loaded }) => useRemoteAlignment(loaded, apply, log, client), { initialProps: { loaded: records } });
  async function start() {
    act(() => { hook.result.current.open(); hook.result.current.setEmail('a@b.org'); });
    act(() => { void hook.result.current.submit(); void hook.result.current.submit(); });
    await waitFor(() => expect(client.status).toHaveBeenCalledOnce());
  }
  return { ...hook, client, apply, log, start, reply, finish: () => reply(ok('FINISHED')) };
}
type Harness = ReturnType<typeof harness>;
function unloadPrevented(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('remote alignment React handoff', () => {
  it('posts one alignment request including hidden records and closes the dialog', async () => {
    const h = harness(); await h.start();
    expect(h.client.submit).toHaveBeenCalledOnce();
    expect(unloadPrevented()).toBe(true);
    await h.finish();
    await waitFor(() => expect(h.result.current.state.phase).toBe('done'));
    expect(h.apply).toHaveBeenCalledExactlyOnceWith(expect.arrayContaining([expect.objectContaining({ id: 'a', sequence: 'A-C' }), expect.objectContaining({ id: 'b', sequence: 'AGC' })]));
    expect(h.log).toHaveBeenCalledWith('Remote alignment: submitted to EBI MAFFT (job job-1).');
    expect(unloadPrevented()).toBe(false);
  });
  const staleEdits: Record<string, SeqRecord[]> = {
    edit: records.map((r, i) => i === 0 ? { ...r, sequence: 'TC' } : r),
    add: [...records, { ...records[0], id: 'c' }],
    remove: records.slice(1),
    reorder: [records[1], records[0]],
    rename: records.map((r, i) => i === 0 ? { ...r, id: 'a2' } : r),
  };
  it.each(Object.keys(staleEdits))('discards a result after records %s', async change => {
    const h = harness(); await h.start();
    h.rerender({ loaded: staleEdits[change] }); await h.finish();
    await waitFor(() => expect(h.result.current.state).toMatchObject({ phase: 'failed', reason: 'stale' }));
    expect(h.apply).not.toHaveBeenCalled();
  });
  it('cancels without applying a late response', async () => {
    const h = harness(); await h.start(); act(() => h.result.current.cancel()); await h.finish();
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.result.current.state.phase).toBe('cancelled');
    expect(h.log).toHaveBeenCalledWith('Remote alignment cancelled (job job-1 keeps running at EBI).');
  });
  it('names the job in the log when EBI accepts it just as the user cancels', async () => {
    const h = harness(); let accept!: (response: EbiResponse) => void;
    h.client.submit = vi.fn<EbiClient['submit']>(() => new Promise(resolve => { accept = resolve; }));
    act(() => { h.result.current.open(); h.result.current.setEmail('a@b.org'); });
    act(() => { void h.result.current.submit(); });
    await act(async () => { accept(ok('job-7')); h.result.current.cancel(); });
    expect(h.log).toHaveBeenCalledWith('Remote alignment cancelled (a submitted job may keep running at EBI).');
    expect(h.log).toHaveBeenCalledWith('Remote alignment: cancelled job job-7 keeps running at EBI.');
    expect(h.client.status).not.toHaveBeenCalled();
  });
  const harmlessEdits: Record<string, SeqRecord[]> = {
    visibility: records.map(r => ({ ...r, visible: true })),
    feature: records.map((r, i) => i === 0 ? { ...r, features: [{ type: 'gene', name: 'g1', start: 0, end: 2, strand: 1 }] } : r),
  };
  it.each(Object.keys(harmlessEdits))('still applies the result after a %s edit', async change => {
    const h = harness(); await h.start(); h.rerender({ loaded: harmlessEdits[change] }); await h.finish();
    await waitFor(() => expect(h.result.current.state.phase).toBe('done'));
    expect(h.apply).toHaveBeenCalledOnce();
  });
  it('aborts on unmount and never applies the late response', async () => {
    const h = harness(); await h.start(); h.unmount(); await h.finish();
    expect(h.apply).not.toHaveBeenCalled();
  });
});

describe('monitor controls and verified email', () => {
  it('minimizes and reopens without submitting another job', async () => {
    const h = harness(); await h.start();
    expect(h.result.current.isAlignmentLocked).toBe(true);
    act(() => h.result.current.minimize()); expect(h.result.current.presentation).toBe('pill');
    act(() => h.result.current.open()); expect(h.result.current.presentation).toBe('dialog');
    expect(h.client.submit).toHaveBeenCalledOnce();
    expect(h.result.current.verifiedEmail).toBe('a@b.org');
    await h.finish();
    expect(h.result.current.isAlignmentLocked).toBe(false);
  });
  it('keeps engine choice and puts the DNS error in configuration', async () => {
    const h = harness();
    h.client.submit = vi.fn<EbiClient['submit']>(async () => ({ kind: 'rejected', status: 400, detail: 'Please enter a valid email address' }));
    act(() => { h.result.current.open(); h.result.current.setEmail('user@missing.example'); h.result.current.setEngineId('kalign'); });
    await act(async () => { await h.result.current.submit(); });
    expect(h.result.current.state).toMatchObject({ phase: 'configuring', emailError: "EBI could not verify this address's domain" });
    expect(h.result.current.engineId).toBe('kalign');
    expect(h.result.current.isAlignmentLocked).toBe(false);
  });
});

it('reopens configuration when EBI rejects an email while minimized', async () => {
  const h = harness(); let rejectEmail!: (response: EbiResponse) => void;
  h.client.submit = vi.fn<EbiClient['submit']>(() => new Promise(resolve => { rejectEmail = resolve; }));
  act(() => { h.result.current.open(); h.result.current.setEmail('a@missing.example'); });
  act(() => { void h.result.current.submit(); });
  act(() => h.result.current.minimize());
  await act(async () => rejectEmail({ kind: 'rejected', status: 400, detail: 'Please enter a valid email address' }));
  expect(h.result.current.presentation).toBe('dialog');
  expect(h.result.current.state).toMatchObject({ phase: 'configuring', emailError: expect.stringContaining('domain') });
});

it('refuses submission without consent, accepts after agreement, and checks revocation again', async () => {
  clearAlignConsent();
  const h = harness();
  act(() => { h.result.current.open(); h.result.current.setEmail('a@b.org'); });
  await act(async () => h.result.current.submit());
  expect(h.client.submit).not.toHaveBeenCalled();
  expect(h.client.status).not.toHaveBeenCalled();
  expect(h.result.current.isAlignmentLocked).toBe(false);
  writeAlignConsent(new Date('2026-10-09T12:00:00.000Z'));
  await h.start();
  expect(h.client.submit).toHaveBeenCalledOnce();
  await h.finish();
  clearAlignConsent();
  await act(async () => h.result.current.submit());
  expect(h.client.submit).toHaveBeenCalledOnce();
});

it('does not honour an agreement persisted by an earlier version', async () => {
  clearAlignConsent();
  window.localStorage.setItem('dunceious.alignConsent', JSON.stringify({ version: 1, acceptedAt: '2026-10-09T12:00:00.000Z' }));
  const h = harness();
  act(() => { h.result.current.open(); h.result.current.setEmail('a@b.org'); });
  await act(async () => h.result.current.submit());
  expect(h.client.submit).not.toHaveBeenCalled();
  expect(h.result.current.isAlignmentLocked).toBe(false);
});

describe('one job after another', () => {
  it('ignores the late response of a cancelled job once a new job runs', async () => {
    const h = harness(); await h.start();
    act(() => h.result.current.cancel());
    act(() => h.result.current.open());
    act(() => { void h.result.current.submit(); });
    await waitFor(() => expect(h.client.status).toHaveBeenCalledTimes(2));
    await h.reply(ok('FINISHED'), 0);
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.result.current.state).toMatchObject({ phase: 'submitting', jobId: 'job-2' });
    expect(h.result.current.isLocked()).toBe(true);
    await h.reply(ok('FINISHED'), 1);
    await waitFor(() => expect(h.result.current.state).toMatchObject({ phase: 'done', jobId: 'job-2' }));
    expect(h.apply).toHaveBeenCalledOnce();
    expect(h.client.result).toHaveBeenCalledExactlyOnceWith('mafft', 'job-2', 'fa', expect.any(AbortSignal));
  });
  it('starts a clean job when the user tries again after a failure', async () => {
    vi.setSystemTime(1_000);
    const h = harness(); await h.start();
    await h.reply(ok('ERROR'));
    await waitFor(() => expect(h.result.current.state).toMatchObject({ phase: 'failed', reason: 'job-error', jobId: 'job-1', lastCheckedAt: 1_000, steps: { queued: { status: 'failed' } } }));
    expect(h.result.current.isLocked()).toBe(false);
    expect(unloadPrevented()).toBe(false);
    vi.setSystemTime(9_000);
    act(() => h.result.current.retry());
    act(() => { void h.result.current.submit(); });
    await waitFor(() => expect(h.client.status).toHaveBeenCalledTimes(2));
    expect(h.client.submit).toHaveBeenCalledTimes(2);
    expect(h.log).toHaveBeenCalledWith('Remote alignment: submitted to EBI MAFFT (job job-2).');
    expect(h.result.current.state).toMatchObject({
      phase: 'submitting', jobId: 'job-2', startedAt: 9_000, retryCount: 0,
      steps: { validated: { status: 'done' }, submitted: { status: 'done' }, queued: { status: 'pending' }, running: { status: 'pending' }, fetching: { status: 'pending' }, applied: { status: 'pending' } },
    });
    expect(h.result.current.state).not.toHaveProperty('lastCheckedAt');
    expect(unloadPrevented()).toBe(true);
    await h.finish();
    await waitFor(() => expect(h.result.current.state).toMatchObject({ phase: 'done', jobId: 'job-2' }));
    expect(h.apply).toHaveBeenCalledOnce();
    expect(h.result.current.isLocked()).toBe(false);
    expect(unloadPrevented()).toBe(false);
  });
  const endings: Record<string, (h: Harness) => unknown> = {
    failure: h => h.reply(ok('NOT_FOUND')),
    cancel: h => act(() => h.result.current.cancel()),
    unmount: h => h.unmount(),
  };
  it.each(Object.keys(endings))('stops guarding page unload after %s', async ending => {
    const h = harness(); await h.start();
    expect(unloadPrevented()).toBe(true);
    await endings[ending](h);
    expect(unloadPrevented()).toBe(false);
  });
});

describe('unexpected errors during a job', () => {
  it('releases the job and shows the failure when logging it throws', async () => {
    const h = harness();
    h.log.mockImplementation((message: string) => { if (message.startsWith('Remote alignment failed')) throw new Error('activity log unavailable'); });
    act(() => { h.result.current.open(); h.result.current.setEmail('a@b.org'); });
    let outcome!: Promise<unknown>;
    act(() => { outcome = h.result.current.submit().then(() => 'resolved', (error: unknown) => error); });
    await waitFor(() => expect(h.client.status).toHaveBeenCalledOnce());
    await h.reply(ok('NOT_FOUND'));
    expect(await outcome).toBe('resolved');
    expect(h.result.current.isLocked()).toBe(false);
    expect(h.result.current.isAlignmentLocked).toBe(false);
    expect(h.result.current.state).toMatchObject({ phase: 'failed', jobId: 'job-1', detail: expect.stringContaining('activity log unavailable'), steps: { queued: { status: 'failed' } } });
    expect(unloadPrevented()).toBe(false);
  });
});

describe('hand-off to the shared overlay reducer', () => {
  class IdleWorker { onmessage = null; postMessage() {} terminate() {} }
  function workspace() {
    const ebi = fakeEbi();
    const log = vi.fn();
    vi.stubGlobal('Worker', IdleWorker);
    const hook = renderHook(() => {
      const bio = useBioWorker(log);
      return { bio, alignment: useRemoteAlignment(bio.records, bio.applyAlignmentOverlay, log, ebi.client) };
    });
    act(() => hook.result.current.bio.setRecords(records));
    return { ...hook, ...ebi, log };
  }
  it('fails, keeps the records and releases the lock when the reducer rejects the alignment', async () => {
    const w = workspace();
    act(() => { w.result.current.alignment.open(); w.result.current.alignment.setEmail('a@b.org'); });
    act(() => { void w.result.current.alignment.submit(); });
    await waitFor(() => expect(w.client.status).toHaveBeenCalledOnce());
    const ingested: SeqRecord = { id: 'c', name: 'c', sequence: 'GG', features: [] };
    // One batch: the stale guard still sees the submitted records, while the reducer already sees the edit.
    await act(async () => {
      w.result.current.bio.setRecords(current => [...current, ingested]);
      w.respond(ok('FINISHED'));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(w.log).toHaveBeenCalledWith('ERROR: Sequence mismatch. Missing: [c], Extra: []');
    expect(w.result.current.alignment.state).toMatchObject({ phase: 'failed', reason: 'invalid-result', detail: 'Alignment overlay rejected: reject-mismatch', steps: { applied: { status: 'failed' } } });
    expect(w.result.current.bio.records).toEqual([...records, ingested]);
    expect(w.result.current.alignment.isLocked()).toBe(false);
    expect(w.result.current.alignment.isAlignmentLocked).toBe(false);
  });
});
