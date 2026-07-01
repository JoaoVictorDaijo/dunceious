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
import { handleBioMessage } from '../handleBioMessage';

describe('handleBioMessage — PARSE_FASTA', () => {
  it('returns FASTA_SUCCESS with parsed records and echoes asAlignment', () => {
    const res = handleBioMessage({ type: 'PARSE_FASTA', content: '>a\nACGT', asAlignment: true });
    expect(res).toMatchObject({ type: 'FASTA_SUCCESS', asAlignment: true });
    if (res.type === 'FASTA_SUCCESS') {
      expect(res.alignedData).toHaveLength(1);
      expect(res.alignedData[0].id).toBe('a');
    }
  });
});

describe('handleBioMessage — PARSE_ANNOTATIONS format dispatch', () => {
  it('routes .bed to the BED parser (interval track)', () => {
    const res = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'x.bed', content: 'chr1\t0\t5\tn\t2' });
    expect(res.type).toBe('ANNOTATIONS_SUCCESS');
    if (res.type === 'ANNOTATIONS_SUCCESS') {
      expect((res.annotations.chr1[0] as { kind: string }).kind).toBe('interval');
    }
  });
  it('routes .gff3 to the GFF3 parser (0-based start)', () => {
    const res = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'x.gff3', content: 'chr1\ts\tgene\t10\t20\t.\t+\t0\tID=g' });
    expect(res.type).toBe('ANNOTATIONS_SUCCESS');
    if (res.type === 'ANNOTATIONS_SUCCESS') {
      expect((res.annotations.chr1[0] as { start: number }).start).toBe(9);
    }
  });
  it('routes .bedgraph to the BedGraph parser (line track)', () => {
    const res = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'x.bedgraph', content: 'chr1\t0\t5\t1.5' });
    if (res.type === 'ANNOTATIONS_SUCCESS') {
      expect((res.annotations.chr1[0] as { kind: string }).kind).toBe('line');
    } else { throw new Error('expected ANNOTATIONS_SUCCESS'); }
  });
  it('falls back to GFF3 for an extensionless 9-tab-column first line', () => {
    const res = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'noext', content: 'chr1\ts\tgene\t10\t20\t.\t+\t0\tID=g' });
    if (res.type === 'ANNOTATIONS_SUCCESS') {
      expect((res.annotations.chr1[0] as { start: number }).start).toBe(9); // GFF3 0-based
    } else { throw new Error('expected ANNOTATIONS_SUCCESS'); }
  });
  it('falls back to BED for extensionless non-9-column content', () => {
    const res = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'noext', content: 'chr1\t0\t5\tn\t2' });
    if (res.type === 'ANNOTATIONS_SUCCESS') {
      expect((res.annotations.chr1[0] as { kind: string }).kind).toBe('interval'); // BED
    } else { throw new Error('expected ANNOTATIONS_SUCCESS'); }
  });
});

describe('handleBioMessage — records & genbank routing', () => {
  it('routes PROCESS_RECORDS to transposition + consensus (empty input)', () => {
    const res = handleBioMessage({ type: 'PROCESS_RECORDS', records: [] });
    expect(res.type).toBe('SUCCESS');
    if (res.type === 'SUCCESS') {
      expect(res.records).toEqual([]);
      expect(res.consensus).toBe('');
    }
  });
  it('routes PARSE_GENBANK to the GenBank parser', () => {
    const gb = 'LOCUS       TEST        10 bp    DNA     linear   UNK 01-JAN-2020\nORIGIN\n        1 atgcaaatag\n//\n';
    const res = handleBioMessage({ type: 'PARSE_GENBANK', content: gb });
    expect(res.type).toBe('PARSE_SUCCESS');
  });
  it('echoes asAlignment=false on FASTA_SUCCESS', () => {
    const res = handleBioMessage({ type: 'PARSE_FASTA', content: '>a\nACGT', asAlignment: false });
    expect(res).toMatchObject({ type: 'FASTA_SUCCESS', asAlignment: false });
  });
});
