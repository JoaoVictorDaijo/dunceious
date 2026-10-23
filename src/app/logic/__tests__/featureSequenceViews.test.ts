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

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGenBank } from '@/src/core/genbank';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { featureSequenceViews } from '../viewModel';

// Independent oracle: INSDC rules applied by hand (docs/standards/conformance/oracle.py), which
// Biopython 1.88 and EMBOSS 6.6.0 `extractfeat -join Y` reproduce on the same fixture.
const dir = 'docs/standards/conformance';
const [record] = parseGenBank(readFileSync(`${dir}/fixture.gb`, 'utf8'));
const oracle = Object.fromEntries(readFileSync(`${dir}/expected-oracle.txt`, 'utf8').trim().split('\n')
  .map(line => line.split('\t') as [string, string]));
const views = (label: string) => {
  const feature = record.features.find(f => f.metadata?.label === label);
  if (!feature) throw new Error(`fixture has no ${label}`);
  return featureSequenceViews(record, feature);
};
const upper = (s: string | null) => s?.toUpperCase() ?? null;

describe('featureSequenceViews against the INSDC conformance oracle', () => {
  it.each(['J1', 'J2', 'J3', 'W1'])('%s: the feature sequence is the joined, oriented location', label => {
    expect(upper(views(label).feature)).toBe(oracle[label]);
  });

  it('O1: an order() location has no feature sequence, only its region', () => {
    expect(oracle.O1).toMatch(/^NOT JOINED/);
    const o1 = views('O1');
    expect(o1.feature).toBeNull();
    expect(o1).toMatchObject({ featureLength: 6, intervals: 2, regionStart: 0, regionEnd: 13, regionLength: 13 });
    expect(upper(o1.region)).toBe('TGTTACCTAGGGC');
  });

  it('P1: flagged partial; the bases are those of the stated range', () => {
    const p1 = views('P1');
    expect(p1.partial).toBe(true);
    expect(upper(p1.feature)).toBe(oracle.P1.split(' ')[0]);
    expect(views('J1').partial).toBe(false);
  });

  it('W1: the region crosses the origin, record bases 115..120 then 1..5', () => {
    expect(views('W1')).toMatchObject({ regionStart: 114, regionEnd: 5, regionLength: 11, featureLength: 11, intervals: 2 });
    expect(upper(views('W1').region)).toBe(oracle.W1);
  });

  it('J2: the region stays forward-strand record bases 1..30, gap included', () => {
    const j2 = views('J2');
    expect(j2).toMatchObject({ featureLength: 20, regionLength: 30, regionStart: 0, regionEnd: 30 });
    expect(upper(j2.region)).toBe('TGTTACCTAGGGCGCACGCGCTCTCTATGG');
  });
});

describe('featureSequenceViews on hand-derived cases', () => {
  const rec = (sequence: string, moleculeType?: SeqRecord['moleculeType']): SeqRecord =>
    ({ id: 'r', name: 'r', sequence, moleculeType, features: [] });
  const feat = (f: Partial<BioFeature>): BioFeature => ({ type: 'misc_feature', name: 'f', start: 0, end: 0, strand: 1, ...f });

  it('reverse-complements a single-interval complement() feature', () => {
    // complement(2..5) on AACCGGTTAC: bases ACCG, reverse complement CGGT.
    const v = featureSequenceViews(rec('AACCGGTTAC'), feat({ start: 1, end: 5, strand: -1, locationString: 'complement(2..5)' }));
    expect(v).toMatchObject({ feature: 'CGGT', region: 'ACCG', featureLength: 4, regionLength: 4, intervals: 1 });
  });

  it('writes U for a reverse feature on an RNA record', () => {
    // complement(1..4) on AACG(U): AACG reverse-complemented in RNA is CGUU.
    expect(featureSequenceViews(rec('AACGU', 'rna'), feat({ start: 0, end: 4, strand: -1 })).feature).toBe('CGUU');
  });

  it("joins a protein record's intervals without orienting them", () => {
    const v = featureSequenceViews(rec('MKVLATGQW', 'protein'),
      feat({ start: 1, end: 8, strand: -1, segments: [{ start: 1, end: 3 }, { start: 5, end: 8 }] }));
    expect(v).toMatchObject({ feature: 'KVTGQ', region: 'KVLATGQ', featureLength: 5, regionLength: 7 });
  });

  it('gives an empty feature sequence for an empty interval', () => {
    expect(featureSequenceViews(rec('ACGT'), feat({ start: 2, end: 2 }))).toMatchObject({ feature: '', region: '', featureLength: 0 });
  });

  it('extracts a 300 kb reverse interval of a mixed-strand join', () => {
    // join(complement(1..300000),300001) on A×300000 then C: rc gives T×300000, then C.
    const sequence = 'A'.repeat(300000) + 'C';
    const v = featureSequenceViews(rec(sequence), feat({ start: 0, end: 300001, strand: 1,
      segments: [{ start: 0, end: 300000, strand: -1 }, { start: 300000, end: 300001, strand: 1 }] }));
    expect(v.feature).toBe('T'.repeat(300000) + 'C');
  });
});

