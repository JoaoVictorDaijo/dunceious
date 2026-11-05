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

import { describe, expect, it } from 'vitest';
import { ALIGNMENT_ENGINES, DEFAULT_ENGINE, buildSubmission, checkEngineLimits, parseEbiError, parseJobStatus, parseResultTypes, pickResultTypes, remapAlignment } from '../ebi';
import { preflightAlignment } from '../preflight';

const records = [{ id: 'real-a', sequence: 'A-C' }, { id: 'real-b', sequence: 'AGC' }];

describe('EBI contract', () => {
  it('declares the engine defaults, parameters, and limits', () => {
    expect(DEFAULT_ENGINE).toBe('mafft');
    expect(ALIGNMENT_ENGINES.map(e => [e.id, e.maxSequences, e.maxBytes])).toEqual([
      ['mafft', 500, 1000000], ['kalign', 2000, 2000000], ['clustalo', 4000, 4000000], ['muscle', 500, 1000000],
    ]);
    for (const kind of ['dna', 'protein'] as const) {
      expect(ALIGNMENT_ENGINES.map(e => e.buildParams(kind))).toEqual([
        { stype: kind, format: 'fasta', order: 'input' }, { stype: kind, format: 'fasta' },
        { stype: kind, outfmt: 'fa', order: 'input' }, { format: 'fasta' },
      ]);
    }
  });

  it.each([[1, 10, false], [2, 10, true], [500, 994999, true], [500, 995000, true], [500, 995001, false], [501, 10, false]])('checks %i records / %i bytes', (count, bytes, valid) => {
    expect(checkEngineLimits(ALIGNMENT_ENGINES[0], count, bytes) === null).toBe(valid);
  });

  it('aliases, strips gaps, wraps at 60, and ends with a newline', () => {
    const result = buildSubmission(records);
    expect(result.fasta).toBe('>s1\nAC\n>s2\nAGC\n');
    expect(result.bytes).toBe(15);
    expect([...result.aliases]).toEqual([['s1', 'real-a'], ['s2', 'real-b']]);
    expect(buildSubmission([{ id: 'private', sequence: 'A'.repeat(61) }]).fasta).toBe('>s1\n' + 'A'.repeat(60) + '\nA\n');
  });

  it.each([
    'Please enter an email address', 'Please enter a valid email address',
    'Invalid parameters: Sequence -> A minimum of 2 sequences is required',
    'Invalid parameters: Sequence -> Entry found which does not contain a sequence: b.',
    'Invalid parameters: Sequence Type -> Value for "stype" is not valid: junk',
  ])('extracts EBI description: %s', message => {
    expect(parseEbiError(`<error><description>${message}</description></error>`)).toBe(message);
  });

  it('decodes XML entities and bounds the raw fallback', () => {
    expect(parseEbiError('<error><description>A &amp; B &lt; 2 &#39;x&#39;</description></error>')).toBe("A & B < 2 'x'");
    expect(parseEbiError('  junk  ')).toBe('junk');
    expect(parseEbiError('x'.repeat(400))).toHaveLength(300);
  });

  it('prefers FASTA renderers and ignores stderr even on successful jobs', () => {
    const types = parseResultTypes('<types><type><identifier>out</identifier></type><type><identifier>error</identifier></type><type><identifier>fa</identifier></type><type><identifier>aln-fasta</identifier></type></types>');
    expect(types).toEqual(['out', 'error', 'fa', 'aln-fasta']);
    expect(pickResultTypes(types)).toEqual(['aln-fasta', 'fa', 'out']);
    expect(pickResultTypes(['error'])).toEqual([]);
  });

  it.each(['QUEUED', 'RUNNING', 'FINISHED', 'ERROR', 'FAILURE', 'NOT_FOUND'])('recognizes %s', status => {
    expect(parseJobStatus(` ${status}\n`)).toBe(status);
  });
  it('rejects unknown statuses', () => expect(parseJobStatus('PENDING')).toBeNull());

  it.each(['>s1\nA-C\n>s2\nAGC\n', '>s2\nagc\n>s1\na-c\n'])('remaps valid reordered/case-insensitive results', fasta => {
    const result = remapAlignment(fasta, buildSubmission(records));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records.map(record => [record.id, record.sequence])).toEqual([
      ['real-a', fasta.includes('agc') ? 'a-c' : 'A-C'], ['real-b', fasta.includes('agc') ? 'agc' : 'AGC'],
    ]);
  });

  it.each([
    ['>s1\nA-C\n', 'alias'], ['>s1\nA-C\n>s2\nAGC\n>s3\nAGC', 'alias'],
    ['>s1\nA-C\n>s1\nA-C', 'alias'], ['>s1\nAC\n>s2\nAGC', 'length'],
    ['>s1\n\n>s2\n', 'length'], ['>s1\nATC\n>s2\nAGC', 'sequence'],
  ])('rejects invalid results: %s', (fasta, reason) => {
    const result = remapAlignment(fasta, buildSubmission(records));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(reason);
  });

  it.each(['', '<html><body>Gateway timeout</body></html>', '<types><type><label>Alignment</label></type></types>'])('finds no usable result type in a malformed listing: %j', xml => {
    expect(pickResultTypes(parseResultTypes(xml))).toEqual([]);
  });

  it('trims and decodes result type identifiers', () => {
    expect(parseResultTypes('<identifier> aln-fasta\n</identifier><identifier>a&amp;b</identifier>')).toEqual(['aln-fasta', 'a&b']);
  });
});

// EBI's echo of RNA and protein residues is unmeasured; these pin how the round-trip
// check treats a residue EBI might rewrite, which would surface as invalid-result.
describe('EBI round-trip assumptions', () => {
  function submit(input: { id: string; sequence: string; moleculeType: 'rna' | 'protein' }[]) {
    const preflight = preflightAlignment(input, 'mafft');
    if (!preflight.ok) throw new Error(preflight.issues.map(issue => issue.message).join('; '));
    return preflight.submission;
  }

  it('accepts RNA echoed with U and rejects it if EBI answered with T', () => {
    const submission = submit([{ id: 'r1', sequence: 'ACGU', moleculeType: 'rna' }, { id: 'r2', sequence: 'AGU', moleculeType: 'rna' }]);
    expect(submission.fasta).toBe('>s1\nACGU\n>s2\nAGU\n');
    expect(remapAlignment('>s1\nACGU\n>s2\nA-GU\n', submission).ok).toBe(true);
    expect(remapAlignment('>s1\nACGT\n>s2\nA-GT\n', submission)).toEqual({ ok: false, reason: 'The returned sequence for s1 differs from the submitted sequence.' });
  });

  it('accepts protein X and rejects a returned stop that the preflight stripped before sending', () => {
    const submission = submit([{ id: 'p1', sequence: 'MKX*', moleculeType: 'protein' }, { id: 'p2', sequence: 'MX', moleculeType: 'protein' }]);
    expect(submission.fasta).toBe('>s1\nMKX\n>s2\nMX\n');
    expect(remapAlignment('>s1\nMKX\n>s2\nM-X\n', submission).ok).toBe(true);
    expect(remapAlignment('>s1\nMKX*\n>s2\nM-X-\n', submission)).toEqual({ ok: false, reason: 'The returned sequence for s1 differs from the submitted sequence.' });
  });
});
