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
import { parseFasta, exportToFasta } from '@/src/core/formats/fasta';
import { parseGenBank } from '@/src/core/genbank';
import { exportToGenBank } from '@/src/core/genbank/serialize';
import { degenerateToRegex } from '@/src/core/search/query';
import { reverseComplement, translateSequence, detectEarlyStop, detectMoleculeType, processTransposition, sliceRecordsBySelection } from '@/src/domain/bio';
import type { SeqRecord } from '@/src/domain/bio/types';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { runSearch } from '@/src/workers/handlers/search';
import type { SearchWorkerRequest } from '@/src/workers/protocol';
import { runInlineSearch } from '@/src/app/logic/runInlineSearch';

// All sequences in this suite are synthetic.
describe('RNA ingestion and export', () => {
  it('preserves wrapped lowercase uracil and IUPAC ambiguity in FASTA', () => {
    const [record] = parseFasta('>rna\naugc\nryswkmbdhvn');
    expect(record.moleculeType).toBe('rna');
    expect(record.sequence).toBe('augcryswkmbdhvn');
    expect(exportToFasta([record])).toBe('>rna\naugcryswkmbdhvn');
    expect(exportToFasta([record], 1, 4)).toContain('\nugc');
  });

  it.each(['RNA', 'mRNA', 'ss-RNA'])('round-trips a GenBank %s LOCUS and uracil', (molecule) => {
    const [record] = parseGenBank(
      'LOCUS       RNA1       9 bp    ' + molecule + '    linear\nORIGIN\n        1 augcccuag\n//\n',
    );
    expect(record.moleculeType).toBe('rna');
    expect(record.sequence).toBe('AUGCCCUAG');
    const exported = exportToGenBank([record]);
    expect(exported).toContain('bp    RNA');
    expect(exported).toContain('augcccuag');
    expect(parseGenBank(exported)[0]).toMatchObject({ moleculeType: 'rna', sequence: record.sequence });
  });

  it('preserves RNA and protein molecule types through the bio worker', () => {
    const parsed = handleBioMessage({ type: 'PARSE_FASTA', content: '>rna\nAUGCCCUAG\n>protein\nMUOP' });
    if (parsed.type !== 'FASTA_SUCCESS') throw new Error('Unexpected parse response');
    expect(parsed.alignedData.map(r => r.moleculeType)).toEqual(['rna', 'protein']);
    const [rna] = parsed.alignedData;
    const processed = handleBioMessage({ type: 'PROCESS_RECORDS', records: [{ ...rna, alignedSequence: 'AUG-CCCUAG' }] });
    if (processed.type !== 'SUCCESS') throw new Error('Unexpected processing response');
    expect(processed.records[0]).toMatchObject({ moleculeType: 'rna', sequence: 'AUGCCCUAG' });
    expect(processed.consensus).toBe('AUG-CCCUAG');
  });

  it('keeps DNA ambiguity and selenocysteine-containing proteins distinct from RNA', () => {
    expect(detectMoleculeType('ACGTRYSWKMBDHVN')).toBe('dna');
    expect(detectMoleculeType('ACGURYSWKMBDHVN')).toBe('rna');
    const [protein] = parseFasta('>protein\nMUOP');
    expect(protein).toMatchObject({ moleculeType: 'protein', sequence: 'MUOP' });
    const exported = exportToGenBank([protein]);
    expect(exported).toContain(' aa ');
    expect(parseGenBank(exported)[0]).toMatchObject({ moleculeType: 'protein', sequence: 'MUOP' });
  });

  it('preserves RNA and rebases annotations through aligned search, selection and reimport', () => {
    const [parsed] = parseFasta('>rna\nCCAUGG');
    const record: SeqRecord = {
      ...parsed, alignedSequence: 'CC-AUGG',
      features: [{ type: 'CDS', name: 'cds', start: 2, end: 5, strand: 1 }],
    };
    const [transposed] = processTransposition([record]);
    const [hit] = runInlineSearch({
      searchQuery: 'AYG', records: [transposed], mode: 'exact',
      options: { minScore: 0, strand: 'fwd', maxResults: 100 },
    });
    expect(hit).toMatchObject({ start: 3, end: 6, sequence: 'AUG', segments: [{ start: 3, end: 6 }] });
    const [selected] = sliceRecordsBySelection([transposed], hit.start, hit.end);
    expect(selected).toMatchObject({ moleculeType: 'rna', sequence: 'AUG', alignedSequence: undefined });
    expect(selected.features[0]).toMatchObject({ start: 0, end: 3, segments: [{ start: 0, end: 3 }] });
    for (const reimported of [parseFasta(exportToFasta([selected]))[0], parseGenBank(exportToGenBank([selected]))[0]]) {
      expect(reimported).toMatchObject({ moleculeType: 'rna', sequence: 'AUG' });
    }
    expect(record).toMatchObject({ sequence: 'CCAUGG', alignedSequence: 'CC-AUGG' });
  });
});

describe('RNA codons and complements', () => {
  it.each([1, 2, 3, 4, 5, 11])('translates all 64 RNA codons under table %i', (table) => {
    for (const a of 'ACGU') for (const b of 'ACGU') for (const c of 'ACGU') {
      const codon = a + b + c;
      expect(translateSequence(codon.toLowerCase(), table)).toBe(translateSequence(codon.replace(/U/g, 'T'), table));
    }
  });

  it('translates RNA start/stops and preserves the original sequence', () => {
    const sequence = 'augcccuag';
    expect(translateSequence(sequence)).toBe('MP_');
    expect(sequence).toBe('augcccuag');
    expect(detectEarlyStop('AUGUAGGAG')).toBe(true);
    expect(detectEarlyStop('AUGCCCUAG')).toBe(false);
    expect(detectEarlyStop('UGGUGAAAA', 2)).toBe(false);
    expect(translateSequence('UGA', 2)).toBe('W');
  });

  it('uses U for RNA adenine complements, including lowercase ambiguity and gaps', () => {
    expect(reverseComplement('AUGC', 'rna')).toBe('GCAU');
    expect(reverseComplement('AAA', 'rna')).toBe('UUU');
    const sequence = 'augc-ryswkmbdhvn';
    expect(reverseComplement(reverseComplement(sequence, 'rna'), 'rna')).toBe(sequence);
    expect(reverseComplement('ryswkmbdhv', 'rna')).toBe('bdhvkmwsry');
    expect(reverseComplement('ATGC')).toBe('GCAT');
  });
});

describe('RNA IUPAC search', () => {
  it.each(['Y', 'W', 'K', 'B', 'D', 'H', 'N'])('%s includes both uracil and thymine', (code) => {
    expect(degenerateToRegex(code).test('u')).toBe(true);
    expect(degenerateToRegex(code).test('T')).toBe(true);
  });

  it.each(['R', 'S', 'M', 'V'])('%s excludes uracil', (code) => {
    expect(degenerateToRegex(code).test('U')).toBe(false);
  });

  it('keeps literal U/T and protein ambiguity meanings distinct', () => {
    expect(degenerateToRegex('U').test('T')).toBe(false);
    expect(degenerateToRegex('T').test('U')).toBe(false);
    expect(degenerateToRegex('N', 'protein').test('U')).toBe(false);
    expect(degenerateToRegex('B', 'protein').test('U')).toBe(false);
    expect(degenerateToRegex('U', 'protein').test('U')).toBe(true);
  });

  it.each(['exact', 'fuzzy'] as const)('finds %s RNA reverse hits in worker and inline paths', (mode) => {
    const records: SeqRecord[] = [
      { id: 'rna', name: 'rna', sequence: 'AAA', alignedSequence: 'A-AA', features: [], moleculeType: 'rna' },
      { id: 'dna', name: 'dna', sequence: 'AAA', features: [], moleculeType: 'dna' },
    ];
    const request: SearchWorkerRequest = {
      searchQuery: 'UUU', records, mode, moleculeType: 'dna',
      options: { minScore: 6, strand: 'rev', maxResults: 100 },
    };
    const response = runSearch(request);
    if ('error' in response) throw new Error(response.error);
    for (const results of [response.results, runInlineSearch(request)]) {
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        recordId: 'rna', start: 0, end: 4, strand: -1,
        segments: [{ start: 0, end: 1 }, { start: 2, end: 4 }],
      });
      if (mode === 'fuzzy') expect(results[0].score).toBe(6);
    }
    expect(records[0].sequence).toBe('AAA');
    expect(records[0].alignedSequence).toBe('A-AA');
  });

  it('finds gapped forward IUPAC hits and infers RNA for legacy search projections', () => {
    const request: SearchWorkerRequest = {
      searchQuery: 'AYG', records: [{ id: 'rna', sequence: 'CCA-UG' }], mode: 'exact',
      options: { minScore: 0, strand: 'fwd', maxResults: 100 },
    };
    expect(runInlineSearch(request)[0]).toMatchObject({ sequence: 'A-UG', start: 2, end: 6, strand: 1 });
    request.searchQuery = 'UCAU';
    request.records = [{ id: 'rna', sequence: 'AUGA' }];
    request.options.strand = 'rev';
    expect(runInlineSearch(request)[0]).toMatchObject({ sequence: 'UCAU', start: 0, end: 4, strand: -1 });
  });

  it.each(['exact', 'fuzzy'] as const)('honours an RNA request in %s legacy projections without U', (mode) => {
    const request: SearchWorkerRequest = {
      searchQuery: 'UUU', records: [{ id: 'rna', sequence: 'AAA' }], mode, moleculeType: 'rna',
      options: { minScore: 6, strand: 'rev', maxResults: 100 },
    };
    const response = runSearch(request);
    if ('error' in response) throw new Error(response.error);
    for (const results of [response.results, runInlineSearch(request)]) {
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ recordId: 'rna', strand: -1, start: 0, end: 3 });
    }
  });

  it.each(['exact', 'fuzzy'] as const)('preserves protein U in %s searches and suppresses reverse hits', (mode) => {
    const request: SearchWorkerRequest = {
      searchQuery: 'MUOP', records: [{ id: 'protein', sequence: 'MUOP' }], mode, moleculeType: 'protein',
      options: { minScore: 8, strand: 'both', maxResults: 100 },
    };
    const response = runSearch(request);
    if ('error' in response) throw new Error(response.error);
    for (const results of [response.results, runInlineSearch(request)]) {
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ sequence: 'MUOP', strand: 1, start: 0, end: 4 });
    }
  });
});
