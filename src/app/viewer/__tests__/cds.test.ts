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
import { assignTranslationLanes, computeBrokenFeatureMap, codonFrame, geneticCodeWarning } from '../cds';
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

  it('does not flag a ciliate CDS whose internal TAA/TAG are glutamine (table 6)', () => {
    // ATG TAA TAG GAG — both internal codons are Gln under NCBI table 6.
    const seq = 'ATGTAATAGGAG';
    const plain = cds({ start: 0, end: 12 });
    const ciliate = cds({ start: 0, end: 12, metadata: { transl_table: '6' } });
    expect(computeBrokenFeatureMap([plain], seq).get(plain)).toBe(true);
    expect(computeBrokenFeatureMap([ciliate], seq).get(ciliate)).toBe(false);
  });

  it('claims no early stop under unknown, empty or malformed table qualifiers', () => {
    for (const value of ['7', '', '11x']) {
      const f = cds({ start: 0, end: 9, metadata: { transl_table: value } });
      expect(computeBrokenFeatureMap([f], 'ATGTAGGAG').get(f), value).toBe(false);
    }
  });

  it('uses the selected code after orienting an origin-crossing reverse CDS', () => {
    // join(10..12,1..9) has sequence TTAAGGTCACAT; its complement is ATGTGACCTTAA.
    const genome = 'AGGTCACATTTA';
    const plain = cds({ start: 9, end: 9, strand: -1,
      segments: [{ start: 9, end: 12 }, { start: 0, end: 9 }] });
    const mitochondrial = { ...plain, metadata: { transl_table: '2' } };
    const map = computeBrokenFeatureMap([plain, mitochondrial], genome);
    expect(map.get(plain)).toBe(true);
    expect(map.get(mitochondrial)).toBe(false);
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



describe('assignTranslationLanes', () => {
  const seq = 'A'.repeat(60);

  it('uses a single lane for one translation', () => {
    const f = cds({ start: 4, end: 31 });
    expect(assignTranslationLanes([f], seq)).toMatchObject({ forward: 1, reverse: 0 });
  });

  it('shares a lane across reading frames when the features do not overlap', () => {
    const a = cds({ start: 0, end: 12 });
    const b = cds({ start: 13, end: 25 });
    const lanes = assignTranslationLanes([a, b], seq);
    expect(lanes.forward).toBe(1);
    expect([lanes.laneOf.get(a)?.get(0), lanes.laneOf.get(b)?.get(1)]).toEqual([0, 0]);
  });

  it('shares a lane for overlapping features in the same frame', () => {
    const ab = cds({ start: 0, end: 30 });
    const a = cds({ start: 0, end: 15 });
    expect(assignTranslationLanes([ab, a], seq).forward).toBe(1);
  });

  it('splits overlapping features in different frames', () => {
    const a = cds({ start: 0, end: 30 });
    const b = cds({ start: 10, end: 40 });
    const lanes = assignTranslationLanes([b, a], seq);
    expect(lanes.forward).toBe(2);
    expect([lanes.laneOf.get(a)?.get(0), lanes.laneOf.get(b)?.get(1)]).toEqual([0, 1]);
  });

  it('gives each frame of a frameshifted join its own lane where the frames overlap', () => {
    // -1 PRF: the second segment re-reads base 14, continuing in frame 2.
    const pp1ab = cds({ start: 0, end: 30, segments: [{ start: 0, end: 15 }, { start: 14, end: 30 }] });
    const lanes = assignTranslationLanes([pp1ab], seq);
    expect(lanes.forward).toBe(2);
    expect(Object.fromEntries(lanes.laneOf.get(pp1ab)!)).toEqual({ 0: 0, 2: 1 });
  });

  it('packs strands independently and skips non-coding and undirected features', () => {
    const fwd = cds({ start: 0, end: 30 });
    const rev = cds({ start: 10, end: 40, strand: -1 });
    const gene = cds({ type: 'gene', start: 1, end: 30 });
    const unknown = cds({ start: 11, end: 30, metadata: { _gffStrand: '?' } });
    const lanes = assignTranslationLanes([fwd, rev, gene, unknown], seq);
    expect(lanes).toMatchObject({ forward: 1, reverse: 1 });
    expect(lanes.laneOf.has(gene) || lanes.laneOf.has(unknown)).toBe(false);
  });

  it('assigns no lanes in a peptide record', () => {
    expect(assignTranslationLanes([cds({ start: 0, end: 9 })], seq, 'protein')).toMatchObject({ forward: 0, reverse: 0 });
  });
});


it('shares a translation lane with a different-frame feature inside a circular join gap', () => {
  const wrap = cds({ start: 98, end: 4, segments: [{ start: 98, end: 100 }, { start: 0, end: 4 }] });
  const middle = cds({ start: 30, end: 36 });
  expect(assignTranslationLanes([wrap, middle], 'A'.repeat(100)).forward).toBe(1);
});


describe('geneticCodeWarning', () => {
  it('warns for invalid coding qualifiers, with no warning for supported codes or non-coding features', () => {
    for (const type of ['CDS', 'cds', 'ORF', 'orf']) {
      for (const transl_table of ['7', '', '11x']) {
        expect(geneticCodeWarning(cds({ type, metadata: { transl_table } }))).toBe(
          `⚠ /transl_table=${transl_table} is not an NCBI genetic code; codons are not translated`,
        );
      }
      expect(geneticCodeWarning(cds({ type }))).toBeNull();
      expect(geneticCodeWarning(cds({ type, metadata: { transl_table: '27' } }))).toBeNull();
    }
    expect(geneticCodeWarning(cds({ type: 'gene', metadata: { transl_table: '7' } }))).toBeNull();
  });
});
