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

import { describe, it, expect } from 'vitest';
import { clipAndRebaseInterval, sliceRecordsBySelection } from '../intervals';
import type { SeqRecord, BioFeature } from '../types';
import { parseLocation } from '@/src/core/genbank/locationParser';
import { serializeProject, parseProject } from '@/src/app/logic/projectFile';
import { conceptualTranslation } from '../translation';
import { extractCodingSequence, translateFeature } from '../sequence';

// ---------------------------------------------------------------------------
// clipAndRebaseInterval – half-open [start, end) boundary semantics
// ---------------------------------------------------------------------------

describe('clipAndRebaseInterval – interval clipping and rebasing (half-open [start, end))', () => {
  const SEL_START = 10;
  const SEL_END = 20; // selection window is [10, 20)

  it('returns rebased coords for a fully contained interval', () => {
    expect(clipAndRebaseInterval(12, 18, SEL_START, SEL_END)).toEqual({ start: 2, end: 8 });
  });

  it('clips a left-overlapping interval to the selection boundary', () => {
    // [5, 12) ∩ [10, 20) → rebased [0, 2)
    expect(clipAndRebaseInterval(5, 12, SEL_START, SEL_END)).toEqual({ start: 0, end: 2 });
  });

  it('clips a right-overlapping interval to the selection boundary', () => {
    // [18, 25) ∩ [10, 20) → rebased [8, 10)
    expect(clipAndRebaseInterval(18, 25, SEL_START, SEL_END)).toEqual({ start: 8, end: 10 });
  });

  it('drops an interval that touches the left boundary but does not overlap', () => {
    // [0, 10) ends exactly at selStart → no overlap
    expect(clipAndRebaseInterval(0, 10, SEL_START, SEL_END)).toBeNull();
  });

  it('drops an interval that touches the right boundary but does not overlap', () => {
    // [20, 30) starts exactly at selEnd → no overlap
    expect(clipAndRebaseInterval(20, 30, SEL_START, SEL_END)).toBeNull();
  });

  it('drops a zero-length interval inside the selection', () => {
    expect(clipAndRebaseInterval(10, 10, SEL_START, SEL_END)).toBeNull();
  });

  it('returns null for an interval wholly outside the selection (left)', () => {
    expect(clipAndRebaseInterval(0, 5, SEL_START, SEL_END)).toBeNull();
  });

  it('returns null for an interval wholly outside the selection (right)', () => {
    expect(clipAndRebaseInterval(25, 30, SEL_START, SEL_END)).toBeNull();
  });

  it('handles an interval that spans the entire selection', () => {
    // [5, 30) covers [10, 20) → rebased [0, 10)
    expect(clipAndRebaseInterval(5, 30, SEL_START, SEL_END)).toEqual({ start: 0, end: 10 });
  });

  it('returns null for a degenerate selection (selEnd <= selStart)', () => {
    expect(clipAndRebaseInterval(10, 15, 20, 10)).toBeNull();
  });

  it('handles an interval exactly matching the selection window', () => {
    expect(clipAndRebaseInterval(10, 20, SEL_START, SEL_END)).toEqual({ start: 0, end: 10 });
  });

  it('handles single-base interval at the start of the selection', () => {
    expect(clipAndRebaseInterval(10, 11, SEL_START, SEL_END)).toEqual({ start: 0, end: 1 });
  });

  it('handles single-base interval at the last position of the selection', () => {
    expect(clipAndRebaseInterval(19, 20, SEL_START, SEL_END)).toEqual({ start: 9, end: 10 });
  });
});

// ---------------------------------------------------------------------------
// sliceRecordsBySelection – sequence slicing
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<SeqRecord> = {}): SeqRecord {
  return {
    id: 'r1',
    name: 'Record 1',
    sequence: 'AAAAAAAAAA' + 'CCCCCCCCCC' + 'GGGGGGGGGG', // 30 bases
    features: [],
    ...overrides,
  };
}

describe('sliceRecordsBySelection – sequence slicing', () => {
  it('slices the sequence to the selection window', () => {
    const [result] = sliceRecordsBySelection([makeRecord()], 10, 20).records;
    expect(result.sequence).toBe('CCCCCCCCCC');
  });

  it('clears alignedSequence in the output', () => {
    const record = makeRecord({ alignedSequence: 'AAAA----CCCCGGGG' });
    const [result] = sliceRecordsBySelection([record], 10, 20).records;
    expect(result.alignedSequence).toBeUndefined();
  });

  it('uses alignedSequence as source when present', () => {
    // aligned seq has gaps; slicing [4, 8) → '----'
    const record = makeRecord({ alignedSequence: 'AAAA----CCCCGGGG' });
    const [result] = sliceRecordsBySelection([record], 4, 8).records;
    expect(result.sequence).toBe('----');
  });

  it('clamps slice to sequence boundaries', () => {
    const [result] = sliceRecordsBySelection([makeRecord()], 25, 50).records;
    expect(result.sequence).toBe('GGGGG');
  });
});

// ---------------------------------------------------------------------------
// sliceRecordsBySelection – feature rebasing
// ---------------------------------------------------------------------------

describe('sliceRecordsBySelection – feature rebasing', () => {
  it('rebases a fully contained feature', () => {
    const feature: BioFeature = { type: 'CDS', name: 'f1', start: 12, end: 18, strand: 1 };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20).records;
    expect(result.features).toEqual([{ ...feature, start: 2, end: 8 }]);
  });

  it('clips a feature that extends beyond the selection', () => {
    const feature: BioFeature = { type: 'CDS', name: 'f1', start: 5, end: 15, strand: 1 };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20).records;
    expect(result.features[0]).toMatchObject({ start: 0, end: 5 });
  });

  it('removes a feature entirely outside the selection', () => {
    const feature: BioFeature = { type: 'CDS', name: 'f1', start: 0, end: 8, strand: 1 };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20).records;
    expect(result.features).toHaveLength(0);
  });

  it('removes a feature that becomes zero-length after clipping', () => {
    // Feature ends exactly at selStart → no overlap
    const feature: BioFeature = { type: 'CDS', name: 'f1', start: 0, end: 10, strand: 1 };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20).records;
    expect(result.features).toHaveLength(0);
  });

  it('preserves per-segment strand of a trans-spliced feature through clipping', () => {
    const feature: BioFeature = {
      type: 'CDS', name: 'f1', start: 12, end: 18, strand: 1,
      segments: [{ start: 12, end: 14, strand: -1 }, { start: 16, end: 18, strand: 1 }],
    };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20).records;
    expect(result.features[0].segments!.map(s => s.strand)).toEqual([-1, 1]);
  });
});

// ---------------------------------------------------------------------------
// sliceRecordsBySelection – segment rebasing (the key bug fix)
// ---------------------------------------------------------------------------

describe('sliceRecordsBySelection – multi-segment feature rebasing', () => {
  it('rebases segment coordinates alongside parent feature coordinates', () => {
    const feature: BioFeature = {
      type: 'gene',
      name: 'join_gene',
      start: 5,
      end: 25,
      strand: 1,
      segments: [
        { start: 5, end: 12 },
        { start: 18, end: 25 },
      ],
    };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20).records;
    expect(result.features).toHaveLength(1);
    const f = result.features[0];
    // Parent bounds clipped to [10,20) → rebased [0, 10)
    expect(f.start).toBe(0);
    expect(f.end).toBe(10);
    // segments must be rebased (not absolute), and each cut end gains a marker (LOC-4)
    expect(f.segments).toEqual([
      { start: 0, end: 2, partialStart: true }, // [5,12) ∩ [10,20) → [10,12) → rebased [0,2)
      { start: 8, end: 10, partialEnd: true }, // [18,25) ∩ [10,20) → [18,20) → rebased [8,10)
    ]);
  });

  it('drops segment sub-intervals that fall outside the selection', () => {
    const feature: BioFeature = {
      type: 'gene',
      name: 'partial_join',
      start: 0,
      end: 30,
      strand: 1,
      segments: [
        { start: 0, end: 8 },   // entirely before selection [10,20) → dropped
        { start: 12, end: 18 }, // inside → kept
        { start: 22, end: 30 }, // entirely after → dropped
      ],
    };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20).records;
    expect(result.features).toHaveLength(1);
    // The kept interval faced a dropped interval on each side, so both its ends are marked.
    expect(result.features[0].segments).toEqual([{ start: 2, end: 8, partialStart: true, partialEnd: true }]);
  });

  it('discards a feature when the selection intersects only its intron', () => {
    const feature: BioFeature = {
      type: 'gene',
      name: 'no_overlap',
      start: 5,
      end: 25,
      strand: 1,
      segments: [
        { start: 5, end: 8 },   // before [10,20)
        { start: 22, end: 25 }, // after  [10,20)
      ],
    };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20).records;
    expect(result.features).toEqual([]);
  });

  it('derives the selected envelope from surviving authoritative parts', () => {
    const feature: BioFeature = {
      type: 'gene', name: 'joined', start: 0, end: 30, strand: 1,
      segments: [{ start: 0, end: 8 }, { start: 12, end: 18 }, { start: 22, end: 30 }],
    };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20).records;
    expect(result.features[0]).toMatchObject({ start: 2, end: 8 });
  });

  it.each([{ segments: undefined }, { segments: [{ start: 25, end: 30 }, { start: 0, end: 5 }] }])(
    'retains origin-crossing parts when selecting the full circular sequence: %j', ({ segments }) => {
      const feature: BioFeature = { type: 'gene', name: 'origin', start: 25, end: 5, strand: 1, segments };
      const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 0, 30).records;
      expect(result.features).toHaveLength(1);
      expect(result.features[0]).toMatchObject({
        start: 0, end: 30, segments: [{ start: 25, end: 30 }, { start: 0, end: 5 }],
      });
    },
  );

  it('preserves undefined segments on a simple feature', () => {
    const feature: BioFeature = { type: 'CDS', name: 'simple', start: 12, end: 18, strand: 1 };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20).records;
    expect(result.features[0].segments).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sliceRecordsBySelection – track interval filtering
// ---------------------------------------------------------------------------

describe('sliceRecordsBySelection – track data clipping', () => {
  it('rebases track intervals that overlap the selection', () => {
    const record = makeRecord({
      tracks: [{
        id: 't1', name: 'Track 1',
        data: [{ start: 12, end: 18, value: 5 }],
      }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20).records;
    expect(result.tracks![0].data).toEqual([{ start: 2, end: 8, value: 5 }]);
  });

  it('filters out track intervals with no overlap', () => {
    const record = makeRecord({
      tracks: [{
        id: 't1', name: 'Track 1',
        data: [
          { start: 0, end: 8, value: 1 },   // before selection
          { start: 12, end: 18, value: 2 },  // inside
          { start: 25, end: 30, value: 3 },  // after selection
        ],
      }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20).records;
    expect(result.tracks![0].data).toHaveLength(1);
    expect(result.tracks![0].data[0].value).toBe(2);
  });

  it('filters out zero-length track intervals produced by clipping', () => {
    // Interval ending exactly at selStart becomes zero-length after clipping
    const record = makeRecord({
      tracks: [{
        id: 't1', name: 'Track 1',
        data: [{ start: 5, end: 10, value: 9 }], // ends at selStart → zero-length
      }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20).records;
    expect(result.tracks![0].data).toHaveLength(0);
  });

  it('preserves extra properties on track data items', () => {
    const record = makeRecord({
      tracks: [{
        id: 't1', name: 'Track 1',
        data: [{ start: 11, end: 14, value: 42 }],
      }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20).records;
    expect(result.tracks![0].data[0].value).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// sliceRecordsBySelection – output structure
// ---------------------------------------------------------------------------

describe('sliceRecordsBySelection – output structure', () => {
  it('preserves non-positional record fields', () => {
    const record = makeRecord({ definition: 'Test record', accession: 'ACC001' });
    const [result] = sliceRecordsBySelection([record], 5, 15).records;
    expect(result.id).toBe('r1');
    expect(result.name).toBe('Record 1');
    expect(result.definition).toBe('Test record');
    expect(result.accession).toBe('ACC001');
  });

  it('returns the same number of records as input', () => {
    const records = [makeRecord({ id: 'r1' }), makeRecord({ id: 'r2' })];
    const results = sliceRecordsBySelection(records, 10, 20).records;
    expect(results).toHaveLength(2);
  });

  it('handles records with no tracks gracefully', () => {
    const [result] = sliceRecordsBySelection([makeRecord()], 10, 20).records;
    expect(result.tracks).toBeUndefined();
  });
});

describe('sliceRecordsBySelection – clipped CDS translation', () => {
  it('recomputes the selected protein instead of retaining the full annotation', () => {
    const feature: BioFeature = {
      type: 'CDS', name: 'coding', start: 0, end: 9, strand: 1,
       metadata: { ...{ translation: 'MKP', codon_start: '1', _gffPhases: '["0"]', phase: '0' }, translation: 'MKP' },
    };
    const [result] = sliceRecordsBySelection([makeRecord({ sequence: 'ATGAAACCC', features: [feature] })], 3, 9).records;
    const selected = result.features[0];
    expect(selected?.metadata?.translation).toBe('KP');
    expect(selected.metadata?.translation).toBe('KP');
    expect(selected.metadata?._gffPhases).toBeUndefined();
    expect(selected.metadata?.phase).toBeUndefined();
    expect(translateFeature(selected, extractCodingSequence(selected, result.sequence).codingSeq)).toBe('KP');
    expect(feature?.metadata?.translation).toBe('MKP');
    expect(feature.metadata?.translation).toBe('MKP');
  });

  it.each([
    { strand: 1 as const, start: 1, end: 9, codonStart: '1', want: '3' },
    { strand: -1 as const, start: 0, end: 8, codonStart: '1', want: '3' },
    { strand: 1 as const, start: 1, end: 9, codonStart: '2', want: '1' },
  ])('preserves the codon boundary after clipping strand $strand with codon_start $codonStart to [$start,$end)', ({ strand, start, end, codonStart, want }) => {
    const feature: BioFeature = {
      type: 'CDS', name: 'coding', start: 0, end: 9, strand,
      metadata: { codon_start: codonStart },
    };
    const [result] = sliceRecordsBySelection([makeRecord({ sequence: 'ATGAAACCC', features: [feature] })], start, end).records;
    expect(result.features[0].metadata?.codon_start).toBe(want);
  });

  it('recalculates SO CDS phase after clipping and invalidates its phase snapshot', () => {
    const feature: BioFeature = {
      type: 'SO:0000316', name: 'coding', start: 0, end: 9, strand: 1,
      metadata: { codon_start: '1', _gffPhaseState: 'imported' },
    };
    const [result] = sliceRecordsBySelection([makeRecord({ sequence: 'ATGAAACCC', features: [feature] })], 1, 9).records;
    expect(result.features[0].metadata?.codon_start).toBe('3');
    expect(result.features[0].metadata?._gffPhaseState).toBeUndefined();
  });

  it('counts removed spliced biological bases instead of genomic distance or gap columns', () => {
    const feature: BioFeature = {
      type: 'CDS', name: 'joined', start: 0, end: 15, strand: 1,
      segments: [{ start: 0, end: 4 }, { start: 10, end: 15 }], metadata: { codon_start: '1' },
    };
    const [result] = sliceRecordsBySelection([makeRecord({ sequence: 'A--TNNNNNNGAAAC', features: [feature] })], 10, 15).records;
    expect(result.features[0].metadata?.codon_start).toBe('2');
  });
});

// A selection export rebuilds locations without their text, so the operator must travel on the
// feature (LOC-2), and a site (LOC-5) is kept only when both bases it lies between are selected.
describe('sliceRecordsBySelection – operators and sites', () => {
  const slice = (feature: Partial<BioFeature>, start: number, end: number) => sliceRecordsBySelection([{
    id: 'r', name: 'r', sequence: 'A'.repeat(40),
    features: [{ type: 'misc_feature', name: 'f', start: 0, end: 0, strand: 1, ...feature }],
  }], start, end).records[0].features;

  it('keeps the order() operator on the clipped feature', () => {
    const [clipped] = slice({ operator: 'order', start: 2, end: 30, segments: [{ start: 2, end: 5 }, { start: 10, end: 13 }, { start: 25, end: 30 }] }, 0, 20);
    expect(clipped).toMatchObject({ operator: 'order', segments: [{ start: 2, end: 5 }, { start: 10, end: 13 }] });
  });

  it.each([
    [5, 20, [{ start: 5, end: 5 }]],
    [10, 20, []],
    [0, 10, []],
  ])('selecting [%i, %i) around the site 10^11 keeps %o', (start, end, segments) => {
    const kept = slice({ betweenBases: true, start: 10, end: 10, segments: [{ start: 10, end: 10 }] }, start, end);
    expect(kept.map(feature => feature.segments?.[0] ?? null).filter(Boolean)).toEqual(segments);
    kept.forEach(feature => expect(feature.betweenBases).toBe(true));
  });
});

// LOC-4: a feature cut by a selection gains a marker on the cut end, and keeps its own markers.
// A selection that drops a whole interval marks the kept end that faced it (owner decision 13).
describe('sliceRecordsBySelection – partial ends', () => {
  const clip = (feature: Partial<BioFeature>, sequence: string, start: number, end: number) => sliceRecordsBySelection([{
    id: 'r', name: 'r', sequence,
    features: [{ type: 'CDS', name: 'c', start: 0, end: 0, strand: 1, ...feature }],
  }], start, end).records[0].features[0];

  it('keeps the > of 4..>12 and its residue reading when the selection starts inside it (#226 repro)', () => {
    const cds = clip({ start: 3, end: 12, segments: [{ start: 3, end: 12, partialEnd: true }], locationString: '4..>12', metadata: { transl_table: '27' } }, 'AAAATGCCCTGA', 3, 12);
    expect(cds.segments).toEqual([{ start: 0, end: 9, partialEnd: true }]);
    expect(translateFeature(cds, extractCodingSequence(cds, 'ATGCCCTGA').codingSeq, 27)).toBe('MPW');
  });

  it('marks both cut ends of 1..20 selected at [5, 15)', () => {
    expect(clip({ start: 0, end: 20, segments: [{ start: 0, end: 20 }] }, 'A'.repeat(30), 5, 15).segments)
      .toEqual([{ start: 0, end: 10, partialStart: true, partialEnd: true }]);
  });

  it('marks the end that faced a dropped interval', () => {
    expect(clip({ operator: 'join', start: 0, end: 30, segments: [{ start: 0, end: 10 }, { start: 20, end: 30 }] }, 'A'.repeat(30), 15, 30).segments)
      .toEqual([{ start: 5, end: 15, partialStart: true }]);
  });
});

// #241: a selection that drops an interval keeps the written order of the rest.
describe('sliceRecordsBySelection – written order', () => {
  it('re-ranks the written order of the kept intervals', () => {
    const [clipped] = sliceRecordsBySelection([{ id: 'r', name: 'r', sequence: 'A'.repeat(40), features: [{
      type: 'misc_feature', name: 'n', start: 0, end: 40, strand: 1, operator: 'join',
      segments: [{ start: 0, end: 5, strand: 1 }, { start: 29, end: 40, strand: -1 }, { start: 9, end: 20, strand: -1 }],
      writtenOrder: [0, 2, 1],
    }] }], 8, 40).records[0].features;
    expect(clipped.segments!.map(({ start, end }) => [start, end])).toEqual([[21, 32], [1, 12]]);
    expect(clipped.writtenOrder).toEqual([1, 0]);
  });
});

// #245: remote parts keep their own coordinates; their place among the kept intervals is re-ranked.
describe('sliceRecordsBySelection – remote parts', () => {
  it('keeps the remote part after the kept local interval', () => {
    const [clipped] = sliceRecordsBySelection([{ id: 'r', name: 'r', sequence: 'A'.repeat(40), features: [{
      type: 'misc_feature', name: 'n', start: 0, end: 30, strand: 1, operator: 'join',
      segments: [{ start: 0, end: 5 }, { start: 20, end: 30 }],
      remoteParts: [{ accession: 'J00194.1', start: 99, end: 202, strand: 1, index: 2 }],
    }] }], 10, 40).records[0].features;
    expect(clipped.remoteParts).toEqual([{ accession: 'J00194.1', start: 99, end: 202, strand: 1, index: 1 }]);
  });
});

// LOC-4 for a feature stored without segments (Codex review of #306): the cut ends' markers must
// not be dropped with the segment array.
it('keeps the cut-end markers of a feature without segments', () => {
  const [clipped] = sliceRecordsBySelection([{ id: 'r', name: 'r', sequence: 'A'.repeat(30),
    features: [{ type: 'misc_feature', name: 'f', start: 0, end: 20, strand: 1 }] }], 5, 15).records[0].features;
  expect(clipped.segments).toEqual([{ start: 0, end: 10, partialStart: true, partialEnd: true }]);
});


it.each([1, -1] as const)('marks removed biological ends of an out-of-order CDS, strand %s', strand => {
  const feature: BioFeature = { type: 'CDS', name: 'wrap', ...parseLocation('join(101..109,1..9)'), strand };
  const record: SeqRecord = { id: 'r', name: 'r', sequence: 'CTGAAATAA' + 'C'.repeat(91) + 'ATGAAAAAA', features: [feature] };
  const selected = sliceRecordsBySelection([record], 0, 9).records[0];
  expect(selected.features[0].segments).toEqual([{ start: 0, end: 9, partialStart: true }]);
  if (strand === 1) {
    // CTG AAA TAA is an internal Leu, Lys, terminal stop: no initiator substitution.
    expect(selected.features[0].metadata?.translation).toBe('LK');
    expect(conceptualTranslation(selected.features[0], selected)).toMatchObject({ status: 'ok', residues: 'LK' });
  }
});

it('retains explicit circular segments through selection project round trip', () => {
  const record: SeqRecord = { id: 'r', name: 'r', sequence: 'ACGTACGTGA', isCircular: true,
    features: [{ type: 'gene', name: 'wrap', start: 8, end: 2, strand: 1, segments: [{ start: 8, end: 2 }], writtenOrder: [0] }] };
  const selected = sliceRecordsBySelection([record], 0, 10);
  expect(selected.losses).toEqual([]);
  const text = serializeProject({ records: selected.records, featureColors: {}, showAnnotations: true, showTranslation: false, showConservation: false });
  const parsed = parseProject(text);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.message);
  expect(parsed.project.records[0].features[0].segments).toEqual([{ start: 8, end: 10 }, { start: 0, end: 2 }]);
});

it('retains compound sites and reports any site whose neighbours are not both selected', () => {
  const record: SeqRecord = { id: 'r', name: 'r', sequence: 'ACGTACGTA', features: [
    { type: 'misc_feature', name: 'compound', ...parseLocation('join(1..3,5^6,7..9)') },
    { type: 'misc_feature', name: 'sites', ...parseLocation('join(2^3,5^6)') },
  ] };
  const full = sliceRecordsBySelection([record], 0, 9);
  expect(full.records[0].features.map(f => f.segments)).toEqual([
    [{ start: 0, end: 3 }, { start: 5, end: 5 }, { start: 6, end: 9 }],
    [{ start: 2, end: 2 }, { start: 5, end: 5 }],
  ]);
  expect(full.losses).toEqual([]);
  const clipped = sliceRecordsBySelection([record], 5, 9);
  expect(clipped.records[0].features[0].segments).toEqual([{ start: 1, end: 4, partialStart: true }]);
  expect(clipped.records[0].features).toHaveLength(1);
  expect(clipped.losses).toEqual([
    { record: 'r', feature: 'compound', reason: 'Between-base site omitted; both neighbouring bases must be selected' },
    { record: 'r', feature: 'sites', reason: 'Between-base site omitted; both neighbouring bases must be selected' },
    { record: 'r', feature: 'sites', reason: 'Between-base site omitted; both neighbouring bases must be selected' },
  ]);
});


it('preserves remote-part positions when splitting a wrapped selection segment', () => {
  const feature: BioFeature = { type: 'misc_feature', name: 'remote', start: 8, end: 2, strand: 1,
    segments: [{ start: 8, end: 2 }], writtenOrder: [0],
    remoteParts: [{ start: 0, end: 3, strand: 1, accession: 'AB123.1', index: 1 }] };
  const record: SeqRecord = { id: 'r', name: 'r', sequence: 'ACGTACGTGA', isCircular: true, features: [feature] };
  const selected = sliceRecordsBySelection([record], 0, 10).records[0].features[0];
  expect(selected.writtenOrder).toBeUndefined();
  expect(selected.remoteParts).toEqual([{ start: 0, end: 3, strand: 1, accession: 'AB123.1', index: 2 }]);
});


it.each([1, -1] as const)('selects origin-site neighbours circularly without inventing partial ends, strand %s', strand => {
  const record: SeqRecord = { id: 'r', name: 'r', sequence: 'ATGAAATAA', isCircular: true,
    features: [{ type: 'misc_feature', name: 'origin', ...parseLocation('join(1..3,9^1)'), locationString: 'join(1..3,9^1)', strand }] };
  const full = sliceRecordsBySelection([record], 0, 9);
  expect(full.records[0].features[0].segments).toEqual([{ start: 0, end: 3 }, { start: 9, end: 9 }]);
  expect(full.losses).toEqual([]);
  const withoutNine = sliceRecordsBySelection([record], 0, 8);
  expect(withoutNine.records[0].features[0].segments).toEqual([{ start: 0, end: 3 }]);
  expect(withoutNine.records[0].features[0].locationString).toBeUndefined();
  expect(withoutNine.losses).toEqual([{ record: 'r', feature: 'origin', reason: 'Between-base site omitted; both neighbouring bases must be selected' }]);
  const withoutOne = sliceRecordsBySelection([record], 1, 9);
  expect(withoutOne.records[0].features[0].segments).toEqual([{ start: 0, end: 2, partialStart: true }]);
  expect(withoutOne.losses).toEqual([{ record: 'r', feature: 'origin', reason: 'Between-base site omitted; both neighbouring bases must be selected' }]);
});

it('uses circular neighbour membership for a standalone origin site too', () => {
  const record: SeqRecord = { id: 'r', name: 'r', sequence: 'ATGAAATAA', isCircular: true,
    features: [{ type: 'misc_feature', name: 'origin', ...parseLocation('9^1') }] };
  const full = sliceRecordsBySelection([record], 0, 9);
  expect(full.records[0].features[0].segments).toEqual([{ start: 9, end: 9 }]);
  expect(full.losses).toEqual([]);
  for (const [start, end] of [[0, 8], [1, 9]]) {
    const selected = sliceRecordsBySelection([record], start, end);
    expect(selected.records[0].features).toEqual([]);
    expect(selected.losses).toEqual([{ record: 'r', feature: 'origin', reason: 'Between-base site omitted; both neighbouring bases must be selected' }]);
  }
});
