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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, installCanvasRecorder, stubResizeObserver } from '@/src/app/testing/renderHarness';
import { checkTranslation } from '@/src/domain/bio/translation';
import type { SeqRecord } from '@/src/domain/bio/types';
import { processTransposition } from '@/src/domain/bio/coordinate';
import GenomeViewer from '../GenomeViewer';

beforeEach(() => {
  installCanvasRecorder();
  stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
});
afterEach(() => { vi.restoreAllMocks(); });

const records: SeqRecord[] = [{
  id: 'r', name: 'r', sequence: 'A'.repeat(1000),
  features: [{ type: 'gene', name: 'Feature', start: 0, end: 300, strand: 1 }],
  tracks: [{ id: 'coverage', name: 'Coverage', kind: 'line', data: [{ start: 0, end: 1000, value: 7 }] }],
}];

function setup() {
  const view = render(<GenomeViewer onClearSelection={() => {}} comparisonMenu={null}
    records={records} consensus={records[0].sequence} showAnnotations showTracks
    showTranslation={false} showConservation={false} dragMode="select" activeSelection={null}
    onSelectionChange={() => {}} onExportFasta={() => {}} onAddAnnotation={() => {}}
    searchResults={[]} currentSearchIdx={-1} />);
  const annotation = view.container.querySelector('[data-annotation-part]')!;
  const track = view.getByText('Coverage').parentElement!.parentElement!;
  const row = view.container.querySelector('[data-viewer-record="r"]')!;
  return { ...view, annotation, track, row };
}

function pointer(target: Element, type: string, pointerType: string) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 200, clientY: 100 });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: pointerType } });
  act(() => { target.dispatchEvent(event); });
}

const touchSequence = [
  'mousemove', 'pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointerdown',
  'mousedown', 'pointerup', 'mouseup', 'pointerout', 'pointerleave', 'mouseout', 'mouseleave', 'click',
];

function touchTap(target: Element, afterEvent: () => void = () => {}) {
  for (const type of touchSequence) {
    pointer(target, type, 'touch');
    afterEvent();
  }
}

const surfaces = [
  { key: 'annotation', hover: 'pointerover', leave: 'pointerout', tooltip: /Double-click to select region/ },
  { key: 'track', hover: 'pointermove', leave: 'pointerout', tooltip: /Value: 7/ },
] as const;

it('touch tap on an annotation never shows the tooltip', () => {
  const h = setup();
  touchTap(h.annotation, () => expect(h.queryByText('Double-click to select region')).toBeNull());
});

it('touch tap on a track never shows the tooltip', () => {
  const h = setup();
  touchTap(h.track, () => expect(h.queryByText(/Value:/)).toBeNull());
  pointer(h.track, 'pointermove', 'touch');
  expect(h.queryByText(/Value:/)).toBeNull();
});

it('mouse hover shows the tooltip on both surfaces', () => {
  const h = setup();
  for (const surface of surfaces) {
    pointer(h[surface.key], surface.hover, 'mouse');
    expect(h.getByText(surface.tooltip)).toBeTruthy();
    pointer(h[surface.key], surface.leave, 'mouse');
    expect(h.queryByText(surface.tooltip)).toBeNull();
  }
});

it('mouse hover after a touch tap shows the tooltip', () => {
  const h = setup();
  for (const surface of surfaces) {
    touchTap(h[surface.key]);
    pointer(h[surface.key], surface.hover, 'mouse');
    expect(h.getByText(surface.tooltip)).toBeTruthy();
    pointer(h[surface.key], surface.leave, 'mouse');
  }
});

it('pen hover shows the tooltip', () => {
  const h = setup();
  for (const surface of surfaces) {
    pointer(h[surface.key], surface.hover, 'pen');
    expect(h.getByText(surface.tooltip)).toBeTruthy();
    pointer(h[surface.key], surface.leave, 'pen');
    expect(h.queryByText(surface.tooltip)).toBeNull();
  }
});

it('a touch tap hides a tooltip a mouse opened', () => {
  const h = setup();
  for (const surface of surfaces) {
    pointer(h[surface.key], surface.hover, 'mouse');
    expect(h.getByText(surface.tooltip)).toBeTruthy();
    pointer(h.row, 'pointerdown', 'touch');
    expect(h.queryByText(surface.tooltip)).toBeNull();
    pointer(h.row, 'pointerup', 'touch');
  }
});

it.each([
  ['CDS', '7', true],
  ['CDS', '', true],
  ['CDS', '11x', true],
  ['CDS', '6', false],
  ['CDS', undefined, false],
  ['gene', '7', false],
] as const)('shows the genetic-code warning only for invalid coding qualifiers: %s/%s', (type, table, warned) => {
  const cdsRecords: SeqRecord[] = [{
    id: 'c', name: 'c', sequence: 'ATG'.repeat(100),
    features: [{ type, name: 'Odd', start: 0, end: 300, strand: 1, metadata: table === undefined ? undefined : { transl_table: table } }],
  }];
  const view = render(<GenomeViewer onClearSelection={() => {}} comparisonMenu={null}
    records={cdsRecords} consensus={cdsRecords[0].sequence} showAnnotations showTracks
    showTranslation={false} showConservation={false} dragMode="select" activeSelection={null}
    onSelectionChange={() => {}} onExportFasta={() => {}} onAddAnnotation={() => {}}
    searchResults={[]} currentSearchIdx={-1} />);
  pointer(view.container.querySelector('[data-annotation-part]')!, 'pointerover', 'mouse');
  const warning = view.queryByText(/is not an NCBI genetic code/);
  if (warned) expect(warning?.textContent).toContain(`/transl_table=${table} is not an NCBI genetic code`);
  else expect(warning).toBeNull();
});

it.each([
  [false, [{ start: 0, end: 3 }, { start: 6, end: 9 }], undefined, 'join(1..3,7..9)'],
  [true, [{ start: 0, end: 3 }, { start: 6, end: 9 }], undefined, 'join(1..3,7..9)'],
  [true, [{ start: 0, end: 3 }, { start: 5, end: 5 }], undefined, 'join(1..3,5^6)'],
  [true, [{ start: 8, end: 2 }], undefined, 'join(9..10,1..2)'],
  [true, [{ start: 0, end: 3 }, { start: 6, end: 9 }], 'order(1..3,7..9)', 'order(1..3,7..9)'],
  [true, [{ start: 0, end: 3 }, { start: 6, end: 9 }], '<5..>25', '<5..>25'],
] as const)('shows source location in tooltip (aligned=%s, parts=%j, retained=%s)', (aligned, segments, locationString, text) => {
  const source: SeqRecord = { id: 'r', name: 'r', sequence: 'ACGTACGTAC', isCircular: true,
    alignedSequence: aligned ? 'AC--GTAC-GTAC' : undefined,
    features: [{ type: 'gene', name: 'joined', start: segments[0].start, end: segments[segments.length - 1].end, strand: 1,
      segments: segments.map(part => ({ ...part })), locationString }] };
  const records = processTransposition([source]);
  const view = render(<GenomeViewer onClearSelection={() => {}} comparisonMenu={null}
    records={records} consensus={records[0].alignedSequence ?? records[0].sequence} showAnnotations showTracks={false}
    showTranslation={false} showConservation={false} dragMode="select" activeSelection={null}
    onSelectionChange={() => {}} onExportFasta={() => {}} onAddAnnotation={() => {}}
    searchResults={[]} currentSearchIdx={-1} />);
  pointer(view.container.querySelector('[data-annotation-part]')!, 'pointerover', 'mouse');
  expect(view.getByText(content => content.includes(`Locus: ${text}`))).toBeTruthy();
});

it.each([undefined, 'MVA', 'M'])('explains displayed sources for invalid code with stored %s', translation => {
  const sequence = 'ATGTGGGCT';
  const record: SeqRecord = { id: 'c', name: 'c', sequence,
    features: [{ type: 'CDS', name: 'Odd', start: 0, end: 9, strand: 1, metadata: { ...(translation ? { translation } : {}), transl_table: '99' } }] };
  const view = render(<GenomeViewer onClearSelection={() => {}} comparisonMenu={null}
    records={[record]} consensus={sequence} showAnnotations showTracks showTranslation
    showConservation={false} dragMode="select" activeSelection={null}
    onSelectionChange={() => {}} onExportFasta={() => {}} onAddAnnotation={() => {}}
    searchResults={[]} currentSearchIdx={-1} />);
  pointer(view.container.querySelector('[data-annotation-part]')!, 'pointerover', 'mouse');
  const warning = view.getByText(/is not an NCBI genetic code/).textContent;
  expect(warning).toContain(translation ? "annotation's /translation" : 'Residues assume table 1');
  if (translation === 'M') expect(warning).toContain('first 1 residues');
  expect(view.queryByText(/Early stop codon/)).toBeNull();
});

it.each([undefined, 'M'])('does not claim displayed translation on a protein record with stored %s', translation => {
  const sequence = 'ATGTGGGCT';
  const record: SeqRecord = { id: 'protein', name: 'protein', sequence, moleculeType: 'protein',
    features: [{ type: 'CDS', name: 'Odd', start: 0, end: 9, strand: 1, metadata: { ...(translation ? { translation } : {}), transl_table: '99' } }] };
  const view = render(<GenomeViewer onClearSelection={() => {}} comparisonMenu={null}
    records={[record]} consensus={sequence} showAnnotations showTracks showTranslation
    showConservation={false} dragMode="select" activeSelection={null}
    onSelectionChange={() => {}} onExportFasta={() => {}} onAddAnnotation={() => {}}
    searchResults={[]} currentSearchIdx={-1} />);
  pointer(view.container.querySelector('[data-annotation-part]')!, 'pointerover', 'mouse');
  const tooltip = view.getByText(/is not an NCBI genetic code/).textContent!;
  const warning = tooltip.split('\n').find(line => line.includes('is not an NCBI genetic code'));
  expect(warning).toBe('⚠ /transl_table=99 is not an NCBI genetic code.');
  expect(view.container.querySelector('[data-translation-band]')).toBeNull();
});

it.each(['?', '.'] as const)('does not claim displayed residues for nucleotide orientation %s', strand => {
  const sequence = 'ATGTGGGCT';
  const record: SeqRecord = { id: 'unknown', name: 'unknown', sequence, moleculeType: 'dna',
    features: [{ type: 'CDS', name: 'Odd', start: 0, end: 9, strand: 1,
      metadata: { transl_table: '99', _gffStrand: strand } }] };
  const view = render(<GenomeViewer onClearSelection={() => {}} comparisonMenu={null}
    records={[record]} consensus={sequence} showAnnotations showTracks showTranslation
    showConservation={false} dragMode="select" activeSelection={null}
    onSelectionChange={() => {}} onExportFasta={() => {}} onAddAnnotation={() => {}}
    searchResults={[]} currentSearchIdx={-1} />);
  pointer(view.container.querySelector('[data-annotation-part]')!, 'pointerover', 'mouse');
  const warning = view.getByText(/is not an NCBI genetic code/).textContent!.split('\n')
    .find(line => line.includes('is not an NCBI genetic code'));
  expect(warning).toBe('⚠ /transl_table=99 is not an NCBI genetic code.');
  expect(view.container.querySelector('[data-assumed-codon]')).toBeNull();
});

it('retains a normalized foreign-identity drop in the feature tooltip summary', () => {
 const source: SeqRecord = { id: 'r', name: 'r', accession: 'R', version: 'R.1', sequence: 'ATGAAATAA', moleculeType: 'dna', features: [] };
 const feature = checkTranslation({ type: 'CDS', name: 'c', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }],
   metadata: { translation: 'MK', transl_table: '11' }, translationExceptions: ['(pos:X.1:4..6,aa:Sec)'] }, source);
 expect(feature.translationExceptions).toEqual([]);
 const record = { ...source, features: [feature] };
 const view = render(<GenomeViewer onClearSelection={() => {}} comparisonMenu={null}
   records={[record]} consensus={record.sequence} showAnnotations showTracks={false}
   showTranslation={false} showConservation={false} dragMode="select" activeSelection={null}
   onSelectionChange={() => {}} onExportFasta={() => {}} onAddAnnotation={() => {}}
   searchResults={[]} currentSearchIdx={-1} />);
 pointer(view.container.querySelector('[data-annotation-part]')!, 'pointerover', 'mouse');
 expect(view.getByText(/1 dropped translation exception/).textContent).toContain('Complete diagnostics in feature details');
});
