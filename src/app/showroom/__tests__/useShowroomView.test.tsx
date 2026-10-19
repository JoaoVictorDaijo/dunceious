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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import { featureFocusTarget } from '@/src/app/logic/focusTarget';
import type { SelectionArea } from '@/src/domain/bio/types';
import { loadSampleRecords } from '../sampleWorkspace';
import { useShowroomComparison } from '../useShowroomComparison';
import { useShowroomView } from '../useShowroomView';

const ALIGNED = resolve(__dirname, '../../../../examples/nucleotide/sars-cov-2-variants/aligned.fasta');

/** Reads the bundled FASTA without the app's parser, so the expected columns come from the file. */
function alignedRows(): Map<string, string> {
  const rows = new Map<string, string>();
  let id = '';
  for (const line of readFileSync(ALIGNED, 'utf-8').split('\n')) {
    if (line.startsWith('>')) { id = line.slice(1).trim().split(/\s+/)[0]; rows.set(id, ''); }
    else if (line.trim() !== '') rows.set(id, rows.get(id)! + line.trim());
  }
  return rows;
}

/** The column holding the `residue`-th (0-based) non-gap character of `row`. */
function columnOfResidue(row: string, residue: number): number {
  let seen = 0;
  for (let column = 0; column < row.length; column++) {
    if (row[column] === '-') continue;
    if (seen === residue) return column;
    seen++;
  }
  throw new Error(`row has fewer than ${residue + 1} residues`);
}

function viewHook() {
  const records = loadSampleRecords();
  const setActiveSelection = vi.fn();
  const { result } = renderHook(() => useShowroomView(records, setActiveSelection));
  return { records, setActiveSelection, result };
}

describe('useShowroomView', () => {
  it('focus past a gap lands on the independently computed column', () => {
    const { records, setActiveSelection, result } = viewHook();
    // Alpha carries a nine-column deletion at column 11287 and a 62-column leading
    // gap, so its S gene sits well past a gap in its own row.
    const alpha = records.find(record => record.id === 'OL461693')!;
    const spike = alpha.features.find(feature => feature.type === 'gene' && feature.name === 'S')!;
    const row = alignedRows().get('OL461693')!;

    const expectedStart = columnOfResidue(row, spike.start);
    const expectedEnd = columnOfResidue(row, spike.end - 1) + 1;
    expect(expectedStart).toBeGreaterThan(spike.start);

    const target = featureFocusTarget(alpha, spike);
    expect(target).toMatchObject({ recordId: 'OL461693', start: expectedStart, end: expectedEnd });

    act(() => result.current.focusOn(target));
    expect(result.current.focusRequest).toMatchObject({ start: expectedStart, end: expectedEnd });
    expect(result.current.focusedRegion).toMatchObject({ start: expectedStart, end: expectedEnd });
    expect(result.current.tab).toBe('alignment');
    expect(setActiveSelection).toHaveBeenCalledWith<[SelectionArea]>({
      start: expectedStart, end: expectedEnd, recordIds: ['OL461693'],
    });

    act(() => result.current.completeFocus());
    expect(result.current.focusRequest).toBeNull();
    expect(result.current.focusedRegion).toMatchObject({ start: expectedStart });
  });

  it('focusFromHub switches to the viewport and shows the return pill; returnToHub switches back', () => {
    const { records, result } = viewHook();
    const alpha = records.find(record => record.id === 'OL461693')!;
    const target = featureFocusTarget(alpha, alpha.features[0]);
    const origin = { key: 'OL461693:0', label: 'source' };

    act(() => result.current.setTab('features'));
    expect(result.current.tab).toBe('features');

    act(() => result.current.focusFromHub(target, origin));
    expect(result.current.tab).toBe('alignment');
    expect(result.current.hubFocus).toEqual(origin);
    expect(result.current.showHubReturn).toBe(true);
    expect(result.current.focusRequest).toEqual(target);

    act(() => result.current.returnToHub());
    expect(result.current.tab).toBe('features');
    expect(result.current.showHubReturn).toBe(false);
    expect(result.current.hubFocus).toEqual(origin);
    expect(result.current.hubState.jumpTarget).toMatchObject({ key: origin.key });
  });

  it('dismissing the return pill leaves the viewport and the hub mark alone', () => {
    const { records, result } = viewHook();
    const alpha = records.find(record => record.id === 'OL461693')!;
    const target = featureFocusTarget(alpha, alpha.features[0]);
    act(() => result.current.focusFromHub(target, { key: 'OL461693:0', label: 'source' }));
    act(() => result.current.dismissHubReturn());
    expect(result.current.showHubReturn).toBe(false);
    expect(result.current.tab).toBe('alignment');
    expect(result.current.hubFocus).toMatchObject({ key: 'OL461693:0' });
  });

  it('opens and closes the details target for a record and one of its annotations', () => {
    const { records, result } = viewHook();
    const alpha = records.find(record => record.id === 'OL461693')!;

    act(() => result.current.openDetails('OL461693'));
    expect(result.current.details).toEqual({ record: alpha, feature: null });

    act(() => result.current.openDetails('OL461693', alpha.features[3]));
    expect(result.current.details).toEqual({ record: alpha, feature: alpha.features[3] });

    act(() => result.current.closeDetails());
    expect(result.current.details).toBeNull();
  });
});

describe('useShowroomView details for an annotation the record does not own', () => {
  it('opens nothing rather than the record panel', () => {
    const { records, result } = viewHook();
    const alpha = records.find(record => record.id === 'OL461693')!;
    const foreign = { ...alpha.features[3], name: 'not in this record', start: 0, end: 7 };

    act(() => result.current.openDetails('OL461693', foreign));
    expect(result.current.details).toBeNull();

    // A panel already open is left as it was, not swapped for the record's own.
    act(() => result.current.openDetails('OL461693', alpha.features[3]));
    act(() => result.current.openDetails('OL461693', foreign));
    expect(result.current.details).toEqual({ record: alpha, feature: alpha.features[3] });
  });
});

describe('useShowroomComparison', () => {
  it('comparison menu appears with NC_045512 as the default reference', () => {
    const records = loadSampleRecords();
    const { result } = renderHook(() => useShowroomComparison(records, false));

    expect(result.current.menu).not.toBeNull();
    expect(result.current.menu!.reference?.id).toBe('NC_045512');
    expect(result.current.menu!.candidates.map(record => record.id))
      .toEqual(['NC_045512', 'OL461693', 'OR279985', 'OR323867']);
    // Nothing is compared until the visitor asks for it.
    expect(result.current.menu!.settings).toMatchObject({ referenceId: null, highlight: 'none' });
    expect(result.current.comparison).toBeNull();

    act(() => result.current.setReference!('OR323867'));
    expect(result.current.menu!.reference?.id).toBe('OR323867');
    expect(result.current.comparison).toMatchObject({
      referenceId: 'OR323867',
      referenceSeq: records.find(record => record.id === 'OR323867')!.alignedSequence,
      highlight: 'disagreements',
      alphabet: 'nucleotide',
    });
  });

  it('offers no menu when fewer than two rows are aligned', () => {
    const [reference] = loadSampleRecords();
    const { result } = renderHook(() => useShowroomComparison([reference], false));
    expect(result.current.menu).toBeNull();
    expect(result.current.comparison).toBeNull();
    expect(result.current.setReference).toBeUndefined();
  });
});
