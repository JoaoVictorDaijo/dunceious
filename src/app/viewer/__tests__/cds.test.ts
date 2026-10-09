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
import { computeBrokenFeatureMap, codonFrame } from '../cds';
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
    const f = cds({ start: 0, end: 9 });
    expect(computeBrokenFeatureMap([f], 'ATGTAGGAG').get(f)).toBe(true);
  });

  it('does not flag a valid CDS', () => {
    const f = cds({ start: 0, end: 9 });
    expect(computeBrokenFeatureMap([f], 'ATGCCCGAG').get(f)).toBe(false);
  });

  it('honours the feature /transl_table so a mitochondrial TGA is not a false stop', () => {
    // TGG TGA AAA — internal TGA is a stop under the standard code, Trp under table 2.
    const seq = 'TGGTGAAAA';
    const plain = cds({ start: 0, end: 9 });
    expect(computeBrokenFeatureMap([plain], seq).get(plain)).toBe(true);
    const mito = cds({ start: 0, end: 9, metadata: { transl_table: '2' } });
    expect(computeBrokenFeatureMap([mito], seq).get(mito)).toBe(false);
  });

  it('ignores non-CDS features', () => {
    const map = computeBrokenFeatureMap([cds({ type: 'gene', start: 0, end: 9 })], 'ATGTAGGAG');
    expect(map.size).toBe(0);
  });

  it('does not mark a non-CDS feature that shares a broken CDS interval', () => {
    const broken = cds({ start: 0, end: 9 });
    const source = cds({ type: 'source', start: 0, end: 9 });
    const map = computeBrokenFeatureMap([source, broken], 'ATGTAGGAG');
    expect(map.get(broken)).toBe(true);
    expect(map.has(source)).toBe(false);
  });

  it('never flags features of a peptide record', () => {
    // Amino-acid letters read as codons can look like an early stop; they are not codons.
    const f = cds({ start: 0, end: 9 });
    expect(computeBrokenFeatureMap([f], 'MFVTAGFLV', 'protein').size).toBe(0);
  });

  it('trusts the stored /translation over recomputation for broken detection', () => {
    // ATG TGA CCC recomputes to M _ P — an internal stop — but /transl_except
    // recodes the TGA to selenocysteine, so the annotated protein is not broken.
    const seq = 'ATGTGACCC';
    const recomputed = cds({ start: 0, end: 9 });
    expect(computeBrokenFeatureMap([recomputed], seq).get(recomputed)).toBe(true);
    const annotated = cds({ start: 0, end: 9, translation: 'MUP' });
    expect(computeBrokenFeatureMap([annotated], seq).get(annotated)).toBe(false);
  });
});

describe('codonFrame', () => {
  it('is the first base modulo 3 on the forward strand', () => {
    expect(codonFrame(0, 1)).toBe(0);
    expect(codonFrame(1, 1)).toBe(1);
    expect(codonFrame(5, 1)).toBe(2);
    // ORF1ab after the −1 slip: CGG starts on 0-based 13467 → frame 0, not the ORF1a frame 1.
    expect(codonFrame(13467, 1)).toBe(0);
  });

  it('keeps the exclusive-end convention on the reverse strand', () => {
    // A reverse codon read from base 5 downwards occupies [3, 6): lane = 6 % 3.
    expect(codonFrame(5, -1)).toBe(0);
    expect(codonFrame(6, -1)).toBe(1);
  });
});

