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
import { parseBED, parseGFF3, parseBedGraph } from '../annotations';

describe('parseBED', () => {
  it('parses a track grouped by chromosome with score from column 5', () => {
    const out = parseBED('chr1\t10\t20\tnameCol\t7', 'f.bed');
    expect(out.chr1).toHaveLength(1);
    expect(out.chr1[0]).toMatchObject({ type: 'track', kind: 'interval', id: 'f.bed_chr1', name: 'f.bed' });
    expect(out.chr1[0].data).toEqual([{ start: 10, end: 20, value: 7 }]);
  });
  it('defaults a missing/NaN score to 0', () => {
    expect(parseBED('chr1\t10\t20', 'f.bed').chr1[0].data[0].value).toBe(0);
  });
  it('skips lines with fewer than 3 columns and NaN coordinates', () => {
    expect(parseBED('chr1\t10', 'f.bed')).toEqual({});
    expect(parseBED('chr1\tx\t20', 'f.bed')).toEqual({});
  });
  it('ignores header/#/track/browser lines and reuses one track per chrom', () => {
    const out = parseBED('track name=x\nchr1\t0\t5\nchr1\t8\t9', 'f.bed');
    expect(out.chr1).toHaveLength(1);
    expect(out.chr1[0].data).toHaveLength(2);
  });
});

describe('parseGFF3', () => {
  it('converts the 1-based start to 0-based and maps strand', () => {
    const out = parseGFF3('chr1\tsrc\tgene\t10\t20\t.\t-\t0\tID=g1');
    const f = out.chr1[0];
    expect(f.start).toBe(9); // 10 - 1
    expect(f.end).toBe(20);
    expect(f.strand).toBe(-1);
    expect(f.segments).toEqual([{ start: 9, end: 20 }]);
  });
  it('prefers Name over ID for the feature name and omits a "." score', () => {
    const f = parseGFF3('c\ts\tgene\t5\t9\t.\t+\t0\tID=g1;Name=myGene').c[0];
    expect(f.name).toBe('myGene');
    expect(f.metadata).not.toHaveProperty('score');
    expect(f.metadata).toMatchObject({ source: 's', phase: '0', ID: 'g1', Name: 'myGene' });
  });
  it('falls back to `${type}_${start+1}` when no ID/Name', () => {
    expect(parseGFF3('c\ts\tCDS\t5\t9\t.\t+\t0\tfoo=bar').c[0].name).toBe('CDS_5');
  });
  it('keeps a non-"." score in metadata and URL-decodes attribute values', () => {
    const f = parseGFF3('c\ts\tgene\t1\t9\t3.2\t+\t0\tID=a;note=a%20b').c[0];
    expect(f.metadata!.score).toBe('3.2');
    expect(f.metadata!.note).toBe('a b');
  });
  it('skips rows with fewer than 9 tab columns', () => {
    expect(parseGFF3('c\ts\tgene\t1\t9')).toEqual({});
  });
});

describe('parseBedGraph', () => {
  it('parses a line track with a numeric value', () => {
    const out = parseBedGraph('chr1\t10\t20\t3.5', 'f.bedgraph');
    expect(out.chr1[0]).toMatchObject({ kind: 'line', name: 'f.bedgraph' });
    expect(out.chr1[0].data).toEqual([{ start: 10, end: 20, value: 3.5 }]);
  });
  it('skips a row whose value is NaN (unlike BED, which defaults score to 0)', () => {
    expect(parseBedGraph('chr1\t10\t20\tx', 'f.bedgraph')).toEqual({});
  });
  it('skips lines with fewer than 4 columns', () => {
    expect(parseBedGraph('chr1\t10\t20', 'f.bedgraph')).toEqual({});
  });
});
