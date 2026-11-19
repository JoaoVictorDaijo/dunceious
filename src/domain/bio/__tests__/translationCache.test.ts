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

import { expect, it } from 'vitest';
import { checkedTranslation, checkTranslation, compareTranslation, conceptualTranslation, storedTranslation } from '../translation';
import type { BioFeature, SeqRecord } from '../types';

const cds = (segments: BioFeature['segments'], strand: 1 | -1 = 1, extra: Partial<BioFeature> = {}): BioFeature =>
  ({ type: 'CDS', name: 'c', start: segments![0].start, end: segments!.at(-1)!.end, strand, segments, ...extra });

it.each<[string, string, BioFeature, boolean?]>([
  ['a terminal stop', 'ATGAAATAA', cds([{ start: 0, end: 9 }])],
  ['a partial last codon', 'ATGAAACCCGGTN', cds([{ start: 0, end: 13 }])],
  ['an alternative start', 'GTGAAATAG', cds([{ start: 0, end: 9 }], 1, { metadata: { transl_table: '11' } })],
  ['a table 28 terminal set', 'ATGAAATAG', cds([{ start: 0, end: 9 }], 1, { metadata: { transl_table: '28' } })],
  ['ambiguity codes', 'ATGNNNRAY', cds([{ start: 0, end: 9 }])],
  ['the reverse strand', 'TTATTTCAT', cds([{ start: 0, end: 9 }], -1)],
  ['mixed interval strands', 'ATGTGATAGTTATCA', cds([{ start: 0, end: 9, strand: 1 }, { start: 9, end: 15, strand: -1 }], 1, { operator: 'join' })],
  ['an origin-spanning join', 'AAATAAATG', cds([{ start: 6, end: 9 }, { start: 0, end: 6 }], 1, { operator: 'join' }), true],
  ['an applied code break and a stored protein', 'ATGTGATAA', cds([{ start: 0, end: 9 }], 1, { translationExceptions: ['(pos:4..6,aa:Sec)'], metadata: { translation: 'MUK' } })],
  ['a two-base last codon', 'ATGAAACC', cds([{ start: 0, end: 8 }])],
  ['an overlapping join sharing one base', 'ATGAATAA', cds([{ start: 0, end: 3 }, { start: 2, end: 8 }], 1, { operator: 'join' })],
  ['a short terminal TERM code break', 'ATGAAATA', cds([{ start: 0, end: 8 }], 1, { translationExceptions: ['(pos:7..8,aa:TERM)'] })],
])('reads back the full cached result for %s', (_name, sequence, feature, isCircular = false) => {
  const record: SeqRecord = { id: 'r', name: 'r', sequence, moleculeType: 'dna', isCircular, features: [feature] };
  const conceptual = conceptualTranslation(feature, record);
  expect(conceptual.status).toBe('ok');
  const stored = storedTranslation(feature);
  const comparison = stored && conceptual.status === 'ok' ? compareTranslation(stored, conceptual) : undefined;
  const checked = checkTranslation(feature, record);
  expect(JSON.parse(checked.metadata!._translationCheck)).toHaveProperty('codonProvenance');
  expect(JSON.stringify(checkedTranslation(checked, record))).toBe(JSON.stringify({ ...conceptual, comparison }));
});

const codon = (codonIndex: number, fragment: string, alignedIndices: number[], effective: string, terminalRemoved = false) => ({
  codonIndex, ...(terminalRemoved ? {} : { proteinIndex: codonIndex }), fragment, triplet: fragment.padEnd(3, 'N'), alignedIndices,
  ordinary: effective, contextual: effective, effective, terminalRemoved,
});

const twoBaseLastCodon = {
  status: 'ok', codons: [codon(0, 'ATG', [0, 1, 2], 'M'), codon(1, 'AAA', [3, 4, 5], 'K'), codon(2, 'CC', [6, 7], 'P')],
  residues: 'MKP', possible: ['M', 'K', 'P'], internalStops: [], threePrimeIndeterminate: false, alignedIndices: [0, 1, 2, 3, 4, 5, 6, 7],
};

it.each([
  ['a two-base last codon', 'ATGAAACC', cds([{ start: 0, end: 8 }]), twoBaseLastCodon],
  ['an overlapping join sharing one base', 'ATGAATAA', cds([{ start: 0, end: 3 }, { start: 2, end: 8 }], 1, { operator: 'join' }), {
    status: 'ok', codons: [codon(0, 'ATG', [0, 1, 2], 'M'), codon(1, 'GAA', [2, 3, 4], 'E'), codon(2, 'TAA', [5, 6, 7], '*', true)],
    residues: 'ME', possible: ['M', 'E'], internalStops: [], threePrimeIndeterminate: false, alignedIndices: [0, 1, 2, 2, 3, 4],
  }],
])('reads back the codons of %s as stated by hand', (_name, sequence, feature, expected) => {
  const record: SeqRecord = { id: 'r', name: 'r', sequence, moleculeType: 'dna', isCircular: false, features: [feature] };
  expect(JSON.stringify(checkedTranslation(checkTranslation(feature, record), record))).toBe(JSON.stringify(expected));
});

it.each<[string, (cache: { status: string; residues: string; codonProvenance: { indices: number[] } }) => void]>([
  ['a corrupt run count', cache => { cache.codonProvenance.indices = [0, 1e15]; }],
  ['a run length that disagrees with the bases', cache => { cache.codonProvenance.indices = [0, 7]; }],
  ['a compact form under an unavailable status', cache => { cache.status = 'unavailable'; cache.residues = 'FAKE'; }],
])('recomputes instead of expanding %s', (_name, forge) => {
  const feature = cds([{ start: 0, end: 8 }]);
  const record: SeqRecord = { id: 'r', name: 'r', sequence: 'ATGAAACC', moleculeType: 'dna', isCircular: false, features: [feature] };
  const cache = JSON.parse(checkTranslation(feature, record).metadata!._translationCheck);
  forge(cache);
  const started = performance.now();
  const result = checkedTranslation({ ...feature, metadata: { _translationCheck: JSON.stringify(cache) } }, record);
  expect(performance.now() - started).toBeLessThan(1000);
  expect(JSON.stringify(result)).toBe(JSON.stringify(twoBaseLastCodon));
});
