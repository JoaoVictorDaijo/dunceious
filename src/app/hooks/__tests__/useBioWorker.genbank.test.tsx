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

// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import { createDeferredWorker } from '@/src/app/testing/deferredWorker';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { useBioWorker } from '../useBioWorker';
const Worker = createDeferredWorker(handleBioMessage);
const gb = (id = 'A', unit = 'bp', residues = 'acgt', qualifiers = '') => `LOCUS ${id} 4 ${unit} DNA\nACCESSION   AB123\nVERSION     AB123.1\nFEATURES\n     CDS             1..4\n${qualifiers}ORIGIN\n 1 ${residues}\n//`;
const warning = '                     /codon_start=4\n';
beforeEach(() => { Worker.instances = []; vi.stubGlobal('Worker', Worker); });
afterEach(() => vi.unstubAllGlobals());
function setup() {
  let revision = 0, locked = false;
  const log = vi.fn(), mismatch = vi.fn();
  const hook = renderHook(() => useBioWorker(log, { getWorkspaceRevision: () => revision, isAlignmentLocked: () => locked, onMismatch: mismatch }));
  const worker = Worker.instances[0];
  const send = (content: string, filename = 'input.gb') => {
    const promise = hook.result.current.requestBio({ type: 'PARSE_GENBANK', content, filename, workspaceRevision: revision, incomingCategory: 'protein' });
    return { promise, index: worker.requests.length - 1 };
  };
  return { ...hook, worker, log, mismatch, send, replace: () => { revision++; hook.rerender(); }, lock: () => { locked = true; } };
}
it('commits the validated unit category, carries notes, and clears notes on removal or explicit clear', async () => {
  const h = setup();
  act(() => h.result.current.setRecords([{ id: 'existing', name: 'existing', sequence: 'ACGT', features: [] }]));
  const a = h.send(gb('AA', 'bp', 'acgt', warning));
  act(() => h.worker.release(a.index));
  await expect(a.promise).resolves.toMatchObject({ idMap: { AA: 'AA' }, incomingCategory: 'nucleotide' });
  expect(h.result.current.importNotes[0].findings[0].code).toBe('invalid-frame');
  expect(h.log).toHaveBeenCalledWith(expect.stringContaining('input.gb opened with 1 import notes'));
  act(() => h.result.current.setRecords(h.result.current.records.filter(r => r.id !== 'AA')));
  expect(h.result.current.importNotes).toEqual([]);
  const b = h.send(gb('B', 'bp', 'acgt', warning)); act(() => h.worker.release(b.index)); await b.promise;
  act(() => h.result.current.clearImportNotes());
  expect(h.result.current.importNotes).toEqual([]);
  expect(h.mismatch).not.toHaveBeenCalled();
});
it.each([false, true])('accumulates complete refused files in arrival order, reversed=%s', async reverse => {
  const h = setup();
  act(() => h.result.current.setRecords([{ id: 'dna', name: 'dna', sequence: 'ACGT', features: [] }]));
  const files = [h.send(gb('foo;bar', 'aa', 'MEF'), 'bad.gb'), h.send(gb('B', 'aa', 'MEF'), 'other.gb')];
  for (const entry of reverse ? [...files].reverse() : files) act(() => h.worker.release(entry.index));
  await expect(files[0].promise).resolves.toMatchObject({ type: 'PARSE_REFUSED', idMap: { 'foo;bar': null, foo_bar: null, AB123: null, 'AB123.1': null } });
  await files[1].promise;
  expect(h.result.current.genBankRefusals.map(f => f.filename)).toEqual(reverse ? ['other.gb', 'bad.gb'] : ['bad.gb', 'other.gb']);
  expect(h.result.current.genBankRefusals.every(f => f.findings.some(p => p.code === 'length-mismatch') && f.findings.some(p => p.code === 'category-mismatch'))).toBe(true);
  expect(h.result.current.records.map(r => r.id)).toEqual(['dna']);
  expect(h.mismatch).not.toHaveBeenCalled();
  act(() => h.result.current.dismissGenBankRefusals()); expect(h.result.current.genBankRefusals).toEqual([]);
});
it.each(['refusal', 'notes'] as const)('rejects stale %s without diagnostics or a per-file diagnostic log', async kind => {
  const h = setup(); const a = h.send(gb('A', 'bp', kind === 'refusal' ? 'acg' : 'acgt', kind === 'notes' ? warning : ''));
  const rejected = expect(a.promise).rejects.toThrow('the workspace was replaced');
  h.replace(); act(() => h.worker.release(a.index)); await rejected;
  expect(h.result.current.genBankRefusals).toEqual([]); expect(h.result.current.importNotes).toEqual([]);
  expect(h.log.mock.calls).toEqual([['input.gb was not loaded: the workspace was replaced']]);
});
it('keeps lock refusal handled and hides validation diagnostics behind the lock', async () => {
  const h = setup(); const a = h.send(gb('foo;bar', 'bp', 'acg')); h.lock(); act(() => h.worker.release(a.index));
  await expect(a.promise).resolves.toMatchObject({ idMap: { 'foo;bar': null, foo_bar: null, AB123: null } });
  expect(h.result.current.genBankRefusals).toEqual([]); expect(h.result.current.records).toEqual([]);
  expect(h.log.mock.calls).toEqual([['input.gb was not loaded: the workspace is locked']]);
});
it('makes no category claim for an unreadable unit and records actual duplicate renaming', async () => {
  const h = setup(); const bad = h.send(gb('P', '???', 'MEFW')); act(() => h.worker.release(bad.index)); await bad.promise;
  expect(h.result.current.genBankRefusals[0].findings.map(f => f.code)).not.toContain('category-mismatch');
  const good = h.send(gb('X') + '\n' + gb('X')); act(() => h.worker.release(good.index)); await good.promise;
  expect(h.result.current.importNotes[0].findings[0].message).toContain('X_1');
});
it.each([false, true])('refuses the second category against the current committed workspace, proteinFirst=%s', async proteinFirst => {
  const h = setup(); const dna = h.send(gb('D'), 'dna.gb'), protein = h.send(gb('P', 'aa', 'MEFW'), 'protein.gb');
  const [first, second] = proteinFirst ? [protein, dna] : [dna, protein];
  act(() => h.worker.release(first.index)); await first.promise;
  act(() => h.worker.release(second.index)); await expect(second.promise).resolves.toMatchObject({ type: 'PARSE_REFUSED' });
  expect(h.result.current.records.map(r => r.id)).toEqual([proteinFirst ? 'P' : 'D']);
  expect(h.result.current.genBankRefusals[0].findings.map(f => f.code)).toContain('category-mismatch');
});
