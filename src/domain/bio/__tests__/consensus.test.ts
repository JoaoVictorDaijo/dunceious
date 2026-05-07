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
import { calculateConsensus } from '../consensus';
import type { SeqRecord } from '../types';

function makeRecord(id: string, sequence: string, alignedSequence?: string): SeqRecord {
  return { id, name: id, sequence, features: [], alignedSequence };
}

describe('calculateConsensus', () => {
  it('returns empty string for an empty records array', () => {
    expect(calculateConsensus([])).toBe('');
  });

  it('returns empty string when no record has an alignedSequence', () => {
    expect(calculateConsensus([makeRecord('r1', 'ACGT')])).toBe('');
  });

  it('returns the aligned sequence itself for a single record', () => {
    const record = makeRecord('r1', 'ACGT', 'ACGT');
    expect(calculateConsensus([record])).toBe('ACGT');
  });

  it('picks the majority base at each column', () => {
    const r1 = makeRecord('r1', 'AAA', 'AAA');
    const r2 = makeRecord('r2', 'AAC', 'AAC');
    const r3 = makeRecord('r3', 'AAC', 'AAC');
    // col 2: A(1) vs C(2) → C wins
    expect(calculateConsensus([r1, r2, r3])).toBe('AAC');
  });

  it('handles gap characters as ordinary votes', () => {
    const r1 = makeRecord('r1', 'A', 'A-C');
    const r2 = makeRecord('r2', 'A', 'A-C');
    const consensus = calculateConsensus([r1, r2]);
    // Both records agree at every position
    expect(consensus).toBe('A-C');
  });

  it('handles ties by returning the last winner found in iteration order', () => {
    // A tie at col 0: A(1) vs G(1) – implementation returns last encountered max
    const r1 = makeRecord('r1', 'A', 'A');
    const r2 = makeRecord('r2', 'G', 'G');
    const result = calculateConsensus([r1, r2]);
    expect(['A', 'G']).toContain(result);
  });

  it('ignores records without an alignedSequence', () => {
    const r1 = makeRecord('r1', 'ACGT', 'ACGT');
    const r2 = makeRecord('r2', 'TTTT'); // no alignedSequence
    expect(calculateConsensus([r1, r2])).toBe('ACGT');
  });

  it('handles different-length aligned sequences by using the longest length', () => {
    const r1 = makeRecord('r1', 'ACG', 'ACG');
    const r2 = makeRecord('r2', 'ACGT', 'ACGT');
    const result = calculateConsensus([r1, r2]);
    // The last column only has 'T' from r2 so that wins
    expect(result.length).toBe(4);
    expect(result[3]).toBe('T');
  });

  it('returns "-" as consensus when all records have a gap at a position', () => {
    const r1 = makeRecord('r1', 'A', 'A-');
    const r2 = makeRecord('r2', 'A', 'A-');
    const result = calculateConsensus([r1, r2]);
    expect(result[1]).toBe('-');
  });
});
