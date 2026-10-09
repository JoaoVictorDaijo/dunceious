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
import { preflightAlignment, validateEmail } from '../preflight';

const records = [{ id: 'a', sequence: 'AC' }, { id: 'b', sequence: 'AGC' }];
describe('structural email validation (DNS remains EBI-side)', () => {
  it.each(['a..b@x.com', '.a@x.com', 'a.@x.com', 'a'.repeat(65) + '@x.com', 'a@x.com.', 'user+tag@gmail.com', 'A_B-C@EBI.AC.UK', 'a@google.museum', 'a@my-domain.com', 'a@nonexistent.example'])('accepts %s', email => {
    expect(validateEmail(email)).toEqual({ ok: true, value: email });
  });
  it.each(['a@localhost', 'a@[127.0.0.1]', '"a"@x.com', 'A <a@x.com>', 'é@x.com', 'a b@x.com', 'a@@x.com', 'a@x..com', 'a@x.c', 'a@x.com..'])('rejects %s', email => {
    expect(validateEmail(email)).toMatchObject({ ok: false, reason: 'format' });
  });
  it('explains empty, surrounding whitespace, and excessive total length', () => {
    expect(validateEmail('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateEmail(' a@x.com ')).toEqual({ ok: false, reason: 'whitespace' });
    expect(validateEmail('a'.repeat(249) + '@x.com')).toEqual({ ok: false, reason: 'too-long' });
  });
});

describe('alignment preflight', () => {
  it('enforces minimum and engine-specific count boundaries', () => {
    expect(preflightAlignment(records.slice(0, 1), 'mafft')).toMatchObject({ ok: false, issues: [{ code: 'too-few' }] });
    expect(preflightAlignment(records, 'mafft').ok).toBe(true);
    expect(preflightAlignment(Array.from({ length: 500 }, (_, i) => ({ id: String(i), sequence: 'AC' })), 'mafft').ok).toBe(true);
    expect(preflightAlignment(Array.from({ length: 501 }, (_, i) => ({ id: String(i), sequence: 'AC' })), 'mafft')).toMatchObject({ ok: false, issues: [{ code: 'too-many' }] });
    const many = Array.from({ length: 1500 }, (_, i) => ({ id: String(i), sequence: 'AC' }));
    for (const engine of ['mafft', 'muscle'] as const) expect(preflightAlignment(many, engine).ok).toBe(false);
    for (const engine of ['kalign', 'clustalo'] as const) expect(preflightAlignment(many, engine).ok).toBe(true);
  });
  it('counts 60-column newlines at the conservative byte boundary', () => {
    // 978678 residues + 16312 wrapping newlines + 4 header bytes, then 6 bytes for s2.
    const exact = [{ id: 'a', sequence: 'A'.repeat(978678) }, { id: 'b', sequence: 'A' }];
    const result = preflightAlignment(exact, 'mafft');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.submission.bytes).toBe(995000);
    expect(preflightAlignment([{ ...exact[0], sequence: exact[0].sequence + 'A' }, exact[1]], 'mafft')).toMatchObject({ ok: false, issues: [{ code: 'too-large' }] });
    expect(preflightAlignment([{ id: 'a', sequence: 'A'.repeat(990000) }, records[1]], 'mafft').ok).toBe(false);
  });
  it('reports all global issues with IDs and distinct bad characters', () => {
    const result = preflightAlignment([{ id: 'empty', sequence: '- . \n' }, { id: 'bad', sequence: 'AC@22' }], 'mafft');
    expect(result).toMatchObject({ ok: false, issues: [
      { code: 'empty-sequence', recordIds: ['empty'] },
      { code: 'invalid-characters', recordIds: ['bad'], characters: ['@', '2'], message: expect.stringContaining('Dunceious') },
    ] });
  });
  it('normalizes gaps/whitespace and accepts nucleotide IUPAC including U and lowercase', () => {
    const result = preflightAlignment([{ id: 'a', sequence: 'acgtu .-\nryswkmbdhvn' }, records[1]], 'mafft');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.submission.sequences.get('s1')).toBe('acgturyswkmbdhvn');
  });
  it('strips a single terminal protein stop but rejects internal stops', () => {
    const protein = [{ id: 'p', sequence: 'ACDEFGHIKLMNPQRSTVWYBXZJUO*', moleculeType: 'protein' as const }, { id: 'q', sequence: 'MK' }];
    const result = preflightAlignment(protein, 'muscle');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.submission.sequences.get('s1')).toBe('ACDEFGHIKLMNPQRSTVWYBXZJUO');
    expect(preflightAlignment([{ ...protein[0], sequence: 'MK**' }, protein[1]], 'muscle')).toMatchObject({ ok: false, issues: [{ code: 'internal-stop', recordIds: ['p'] }] });
  });
});
