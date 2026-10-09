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

import { describe, expect, it, vi } from 'vitest';
import { ALIGNMENT_ENGINES } from '@/src/core/alignment';
import type { EbiClient, EbiResponse } from '@/src/app/lib/ebiClient';
import { runRemoteAlignment, type RemoteAlignmentState } from '../remoteAlignment';

const ok = (data: string): EbiResponse => ({ kind: 'ok', data });
function setup() {
  let time = 0;
  const controller = new AbortController();
  const states: RemoteAlignmentState[] = [];
  const client = {
    submit: vi.fn<EbiClient['submit']>().mockResolvedValue(ok('job-1')),
    status: vi.fn<EbiClient['status']>().mockResolvedValue(ok('FINISHED')),
    resultTypes: vi.fn<EbiClient['resultTypes']>().mockResolvedValue(ok('<identifier>out</identifier><identifier>error</identifier>')),
    result: vi.fn<EbiClient['result']>().mockResolvedValue(ok('>s2\nAGC\n>s1\nA-C\n')),
  };
  const deps = {
    client, signal: controller.signal, now: () => time,
    sleep: vi.fn(async (ms: number) => { time += ms; }),
    onState: (state: RemoteAlignmentState) => states.push(state),
    isCurrent: vi.fn(() => true), apply: vi.fn(() => 3),
  };
  const input = { engine: ALIGNMENT_ENGINES[0], moleculeKind: 'dna' as const, email: 'a@b.org', records: [{ id: 'a', sequence: 'AC' }, { id: 'b', sequence: 'AGC' }] };
  return { client, deps, input, controller, states, run: () => runRemoteAlignment(input, deps) };
}

describe('remote alignment runner', () => {
  it('submits all records, polls, validates out-only output, and hands off the remapped FASTA', async () => {
    const h = setup();
    h.client.status.mockResolvedValueOnce(ok('QUEUED')).mockResolvedValueOnce(ok('RUNNING'));
    await h.run();
    expect([...new Set(h.states.map(s => s.phase))]).toEqual(['submitting', 'queued', 'running', 'fetching', 'applying', 'done']);
    expect(h.client.submit).toHaveBeenCalledWith('mafft', { email: 'a@b.org', title: 'dunceious', sequence: '>s1\nAC\n>s2\nAGC\n', stype: 'dna', format: 'fasta', order: 'input' }, h.controller.signal);
    expect(h.deps.apply).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'a', sequence: 'A-C' }), expect.objectContaining({ id: 'b', sequence: 'AGC' })]));
    expect(h.client.result).toHaveBeenCalledTimes(1);
    expect(h.client.result.mock.calls[0][2]).toBe('out');
  });

  it('waits through a long queue with adaptive cadence and no job timeout', async () => {
    const h = setup();
    for (let n = 0; n < 50; n++) h.client.status.mockResolvedValueOnce(ok('QUEUED'));
    await h.run();
    expect(h.deps.sleep.mock.calls.map(c => c[0]).slice(0, 10)).toEqual(Array(10).fill(3000));
    expect(h.deps.sleep.mock.calls.some(c => c[0] === 5000)).toBe(true);
    expect(h.deps.sleep.mock.calls.at(-1)?.[0]).toBe(10000);
    expect(h.states.at(-1)?.phase).toBe('done');
  });

  it('recovers from four failures and resets the consecutive failure budget', async () => {
    const h = setup();
    for (let cycle = 0; cycle < 2; cycle++) {
      for (let n = 0; n < 4; n++) h.client.status.mockResolvedValueOnce({ kind: 'network', detail: 'offline' });
      h.client.status.mockResolvedValueOnce(ok('QUEUED'));
    }
    await h.run();
    expect(h.states.at(-1)?.phase).toBe('done');
    expect(h.deps.sleep.mock.calls.slice(0, 4).map(c => c[0])).toEqual([3000, 6000, 12000, 24000]);
  });

  it.each(['network', 'http'] as const)('stops after five consecutive %s failures', async kind => {
    const h = setup();
    h.client.status.mockResolvedValue(kind === 'network' ? { kind, detail: 'offline' } : { kind, status: 503, detail: 'busy', transient: true, retryAfterMs: 60000 });
    await h.run();
    expect(h.client.status).toHaveBeenCalledTimes(5);
    expect(h.states.at(-1)).toMatchObject({ phase: 'failed', reason: kind, jobId: 'job-1' });
    if (kind === 'http') expect(h.deps.sleep.mock.calls[0][0]).toBe(60000);
    expect(h.deps.apply).not.toHaveBeenCalled();
  });

  it('never retries submission', async () => {
    const h = setup();
    h.client.submit.mockResolvedValue({ kind: 'network', detail: 'offline' });
    await h.run();
    expect(h.client.submit).toHaveBeenCalledTimes(1);
    expect(h.client.status).not.toHaveBeenCalled();
    expect(h.states.at(-1)).toMatchObject({ phase: 'failed', reason: 'network' });
  });

});

describe('remote alignment failures and fallback', () => {
  it.each(['email-invalid', 'rejected'] as const)('classifies submit 400 as %s', async reason => {
    const h = setup();
    const detail = reason === 'email-invalid' ? 'Please enter a valid email address' : 'Invalid sequence';
    h.client.submit.mockResolvedValue({ kind: 'rejected', status: 400, detail });
    await h.run();
    expect(h.states.at(-1)).toMatchObject({ phase: 'failed', reason, detail });
  });

  it.each(['input-invalid', 'email-invalid'] as const)('checks local %s without submitting', async reason => {
    const h = setup();
    if (reason === 'input-invalid') h.input.records[0].sequence = '--';
    else h.input.email = 'wrong';
    await h.run();
    expect(h.client.submit).not.toHaveBeenCalled();
    expect(h.states.at(-1)).toMatchObject({ phase: 'failed', reason });
  });

  it.each(['ERROR', 'FAILURE'])('includes stderr for terminal status %s', async status => {
    const h = setup();
    h.client.status.mockResolvedValue(ok(status));
    h.client.result.mockResolvedValue(ok('diagnostic\nlast line'));
    await h.run();
    expect(h.states.at(-1)).toMatchObject({ phase: 'failed', reason: 'job-error', detail: expect.stringContaining('last line') });
  });

  it.each([
    ['NOT_FOUND', 'job-lost'], ['UNKNOWN', 'invalid-result'],
  ])('handles status %s', async (status, reason) => {
    const h = setup(); h.client.status.mockResolvedValue(ok(status)); await h.run();
    expect(h.states.at(-1)).toMatchObject({ phase: 'failed', reason });
  });

  it.each(['no-alignment', 'invalid-result', 'stale'] as const)('discards %s without applying', async reason => {
    const h = setup();
    if (reason === 'no-alignment') h.client.result.mockResolvedValue(ok('program log'));
    if (reason === 'invalid-result') h.client.result.mockResolvedValue(ok('>s1\nXXX\n>s2\nAGC'));
    if (reason === 'stale') h.deps.isCurrent.mockReturnValue(false);
    await h.run();
    expect(h.states.at(-1)).toMatchObject({ phase: 'failed', reason });
    expect(h.deps.apply).not.toHaveBeenCalled();
  });

  it('tries the next advertised renderer when a body is not FASTA', async () => {
    const h = setup();
    h.client.resultTypes.mockResolvedValue(ok('<identifier>fa</identifier><identifier>aln-fasta</identifier><identifier>out</identifier>'));
    h.client.result.mockResolvedValueOnce(ok('not fasta'));
    await h.run();
    expect(h.client.result.mock.calls.map(c => c[2])).toEqual(['aln-fasta', 'fa']);
    expect(h.states.at(-1)?.phase).toBe('done');
  });

  it('cancels mid-poll without fetching or applying', async () => {
    const h = setup();
    h.client.status.mockImplementation(async () => { h.controller.abort(); return ok('FINISHED'); });
    await h.run();
    expect(h.states.at(-1)).toMatchObject({ phase: 'cancelled', jobId: 'job-1' });
    expect(h.client.resultTypes).not.toHaveBeenCalled();
    expect(h.deps.apply).not.toHaveBeenCalled();
  });
});

describe('job monitor evidence', () => {
  it('records entered/left times, poll timing, renderer, and accepted length', async () => {
    const h = setup();
    h.client.status.mockResolvedValueOnce(ok('QUEUED')).mockResolvedValueOnce(ok('RUNNING'));
    await h.run();
    expect(h.states.at(-1)).toMatchObject({ phase: 'done', alignedLength: 3, resultType: 'out', steps: {
      validated: { status: 'done', enteredAt: 0, leftAt: 0 },
      submitted: { status: 'done', enteredAt: 0, leftAt: 0 },
      queued: { status: 'done', enteredAt: 0, leftAt: 3000 },
      running: { status: 'done', enteredAt: 3000, leftAt: 6000 },
      fetching: { status: 'done', enteredAt: 6000, leftAt: 6000 },
      applied: { status: 'done', enteredAt: 6000, leftAt: 6000 },
    } });
    expect(h.states).toContainEqual(expect.objectContaining({ phase: 'queued', lastCheckedAt: 0, nextCheckAt: 3000 }));
  });
  it('marks unobserved stages skipped and exposes retry attempts', async () => {
    const h = setup();
    h.client.status.mockResolvedValueOnce({ kind: 'network', detail: 'offline' }).mockResolvedValueOnce(ok('RUNNING'));
    await h.run();
    expect(h.states).toContainEqual(expect.objectContaining({ retryCount: 1, nextCheckAt: 3000 }));
    expect(h.states.at(-1)).toMatchObject({ steps: { queued: { status: 'skipped' }, running: { status: 'done' } } });
  });
  it.each(['A minimum of 2 sequences is required', 'Maximum 500 sequences allowed', 'Input is too big, limit is 1MB', 'Entry found which does not contain a sequence: s1'])('maps EBI input rejection: %s', async detail => {
    const h = setup(); h.client.submit.mockResolvedValue({ kind: 'rejected', status: 400, detail }); await h.run();
    expect(h.states.at(-1)).toMatchObject({ phase: 'failed', reason: 'input-invalid', detail });
  });
  it('never marks Applied done when the shared overlay rejects', async () => {
    const h = setup(); h.deps.apply.mockImplementation(() => { throw new Error('overlay rejected'); }); await h.run();
    expect(h.states.at(-1)).toMatchObject({ phase: 'failed', steps: { applied: { status: 'failed' } } });
  });
});
