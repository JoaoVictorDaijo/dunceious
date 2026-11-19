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
])('reads back the full cached result for %s', (_name, sequence, feature, isCircular = false) => {
  const record: SeqRecord = { id: 'r', name: 'r', sequence, moleculeType: 'dna', isCircular, features: [feature] };
  const conceptual = conceptualTranslation(feature, record);
  expect(conceptual.status).toBe('ok');
  const stored = storedTranslation(feature);
  const comparison = stored && conceptual.status === 'ok' ? compareTranslation(stored, conceptual) : undefined;
  const read = checkedTranslation(checkTranslation(feature, record), record);
  expect(JSON.stringify(read)).toBe(JSON.stringify({ ...conceptual, comparison }));
});
