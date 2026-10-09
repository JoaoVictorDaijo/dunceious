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
import { ALIGNMENT_ENGINES, DEFAULT_ENGINE, buildSubmission, checkEngineLimits, parseEbiError, parseJobStatus, parseResultTypes, pickResultTypes, remapAlignment } from '../ebi';

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
});
