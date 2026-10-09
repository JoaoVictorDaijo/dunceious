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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@/src/app/testing/renderHarness';
import { clearAlignConsent, writeAlignConsent } from '@/src/app/logic/alignConsentPref';
import { useRemoteAlignment } from '../useRemoteAlignment';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { EbiClient, EbiResponse } from '@/src/app/lib/ebiClient';

beforeEach(() => { clearAlignConsent(); writeAlignConsent(new Date('2026-10-09T12:00:00.000Z')); });

const records: SeqRecord[] = [
  { id: 'a', name: 'a', sequence: 'AC', features: [], visible: false },
  { id: 'b', name: 'b', sequence: 'AGC', features: [] },
];
const ok = (data: string): EbiResponse => ({ kind: 'ok', data });
function harness() {
  let finishStatus!: (response: EbiResponse) => void;
  const client: EbiClient = {
    submit: vi.fn(async () => ok('job-1')),
    status: vi.fn(() => new Promise<EbiResponse>(resolve => { finishStatus = resolve; })),
    resultTypes: vi.fn(async () => ok('<identifier>fa</identifier>')),
    result: vi.fn(async () => ok('>s1\nA-C\n>s2\nAGC')),
  };
  const apply = vi.fn(() => 3);
  const log = vi.fn();
  const hook = renderHook(({ loaded }) => useRemoteAlignment(loaded, apply, log, client), { initialProps: { loaded: records } });
  async function start() {
    act(() => { hook.result.current.open(); hook.result.current.setEmail('a@b.org'); });
    act(() => { void hook.result.current.submit(); void hook.result.current.submit(); });
    await waitFor(() => expect(client.status).toHaveBeenCalledOnce());
  }
  return { ...hook, client, apply, log, start, finish: () => act(async () => finishStatus(ok('FINISHED'))) };
}

describe('remote alignment React handoff', () => {
  it('posts one alignment request including hidden records and closes the dialog', async () => {
    const h = harness(); await h.start();
    expect(h.client.submit).toHaveBeenCalledOnce();
    const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await h.finish();
    await waitFor(() => expect(h.result.current.state.phase).toBe('done'));
    expect(h.apply).toHaveBeenCalledExactlyOnceWith(expect.arrayContaining([expect.objectContaining({ id: 'a', sequence: 'A-C' }), expect.objectContaining({ id: 'b', sequence: 'AGC' })]));
    expect(h.log).toHaveBeenCalledWith('Remote alignment: submitted to EBI MAFFT (job job-1).');
    const after = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
  it.each(['edit', 'add', 'remove'])('discards a result after records %s', async change => {
    const h = harness(); await h.start();
    const loaded = change === 'edit' ? records.map((r, i) => i === 0 ? { ...r, sequence: 'TC' } : r)
      : change === 'remove' ? records.slice(1) : [...records, { ...records[0], id: 'c' }];
    h.rerender({ loaded }); await h.finish();
    await waitFor(() => expect(h.result.current.state).toMatchObject({ phase: 'failed', reason: 'stale' }));
    expect(h.apply).not.toHaveBeenCalled();
  });
  it('cancels without applying a late response', async () => {
    const h = harness(); await h.start(); act(() => h.result.current.cancel()); await h.finish();
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.result.current.state.phase).toBe('cancelled');
    expect(h.log).toHaveBeenCalledWith('Remote alignment cancelled (job job-1 keeps running at EBI).');
  });
  it('does not invalidate the snapshot for visibility or annotation changes', async () => {
    const h = harness(); await h.start(); h.rerender({ loaded: records.map(r => ({ ...r, visible: true })) }); await h.finish();
    await waitFor(() => expect(h.apply).toHaveBeenCalledOnce());
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
