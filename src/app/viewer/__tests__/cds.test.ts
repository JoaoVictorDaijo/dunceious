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

import { describe, it, expect } from 'vitest';
import { computeBrokenFeatureMap, translationFrame } from '../cds';
import type { BioFeature } from '@/src/domain/bio/types';

const cds = (over: Partial<BioFeature>): BioFeature => ({
  type: 'CDS',
  name: 'x',
  start: 0,
  end: 0,
  strand: 1,
  ...over,
});

describe('computeBrokenFeatureMap', () => {
  it('flags a CDS with an internal (early) stop as broken', () => {
    // ATG TAG GAG — the TAG stop is not the last codon.
    const map = computeBrokenFeatureMap([cds({ start: 0, end: 9 })], 'ATGTAGGAG');
    expect(map.get('0-9-1')).toBe(true);
  });

  it('does not flag a valid CDS', () => {
    const map = computeBrokenFeatureMap([cds({ start: 0, end: 9 })], 'ATGCCCGAG');
    expect(map.get('0-9-1')).toBe(false);
  });

  it('honours the feature /transl_table so a mitochondrial TGA is not a false stop', () => {
    // TGG TGA AAA — internal TGA is a stop under the standard code, Trp under table 2.
    const seq = 'TGGTGAAAA';
    expect(computeBrokenFeatureMap([cds({ start: 0, end: 9 })], seq).get('0-9-1')).toBe(true);
    const mito = cds({ start: 0, end: 9, metadata: { transl_table: '2' } });
    expect(computeBrokenFeatureMap([mito], seq).get('0-9-1')).toBe(false);
  });

  it('ignores non-CDS features', () => {
    const map = computeBrokenFeatureMap([cds({ type: 'gene', start: 0, end: 9 })], 'ATGTAGGAG');
    expect(map.size).toBe(0);
  });

  it('trusts the stored /translation over recomputation for broken detection', () => {
    // ATG TGA CCC recomputes to M _ P — an internal stop — but /transl_except
    // recodes the TGA to selenocysteine, so the annotated protein is not broken.
    const seq = 'ATGTGACCC';
    expect(computeBrokenFeatureMap([cds({ start: 0, end: 9 })], seq).get('0-9-1')).toBe(true);
    const annotated = cds({ start: 0, end: 9, translation: 'MUP' });
    expect(computeBrokenFeatureMap([annotated], seq).get('0-9-1')).toBe(false);
  });
});

describe('translationFrame', () => {
  it('is the start modulo 3 for a forward feature (codon_start=1)', () => {
    expect(translationFrame(cds({ strand: 1, start: 0 }))).toBe(0);
    expect(translationFrame(cds({ strand: 1, start: 1 }))).toBe(1);
    expect(translationFrame(cds({ strand: 1, start: 5 }))).toBe(2);
  });

  it('is the end modulo 3 for a reverse feature (codon_start=1)', () => {
    expect(translationFrame(cds({ strand: -1, end: 6 }))).toBe(0);
    expect(translationFrame(cds({ strand: -1, end: 7 }))).toBe(1);
  });

  it('folds /codon_start into a forward feature lane (shifts it forward)', () => {
    expect(translationFrame(cds({ strand: 1, start: 0, metadata: { codon_start: '2' } }))).toBe(1);
    expect(translationFrame(cds({ strand: 1, start: 0, metadata: { codon_start: '3' } }))).toBe(2);
  });

  it('subtracts the /codon_start phase for a reverse feature (reads down from end)', () => {
    expect(translationFrame(cds({ strand: -1, end: 6, metadata: { codon_start: '2' } }))).toBe(2);
    expect(translationFrame(cds({ strand: -1, end: 6, metadata: { codon_start: '3' } }))).toBe(1);
  });

  it('stays in {0,1,2} when the phase pushes the reverse anchor negative', () => {
    expect(translationFrame(cds({ strand: -1, end: 1, metadata: { codon_start: '3' } }))).toBe(2);
  });
});
