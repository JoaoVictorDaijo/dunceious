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
import type { SeqRecord } from '@/src/domain/bio/types';
import { exportToGenBank } from '../serialize';

function record(overrides: Partial<SeqRecord> = {}): SeqRecord {
  return { id: 'REC1', name: 'Record 1', sequence: 'ATGCAAATAG', features: [], ...overrides };
}

describe('exportToGenBank', () => {
  it('writes a DNA LOCUS with a de-duplicated Dunceious definition marker', () => {
    const gb = exportToGenBank([record({
      definition: 'Sample seq Exported by Dunceious.',
      features: [{
        type: 'source', name: 'source', start: 0, end: 10, strand: 1,
        metadata: { organism: 'E. coli', _internal: 'hidden', empty: '' },
      }],
    })]);
    expect(gb).toContain('LOCUS');
    expect(gb).toContain('bp    DNA');
    // Marker must appear exactly once (not accumulated on re-export).
    expect(gb.match(/Exported by Dunceious\./g)).toHaveLength(1);
    expect(gb).toContain('ORGANISM  E. coli');
    // '_'-prefixed and empty metadata are omitted; real qualifier is kept.
    expect(gb).toContain('/organism="E. coli"');
    expect(gb).not.toContain('_internal');
    expect(gb).not.toContain('/empty=');
    expect(gb.trimEnd().endsWith('//')).toBe(true);
  });

  it('writes a protein LOCUS using "aa" units', () => {
    const gb = exportToGenBank([record({ moleculeType: 'protein', sequence: 'MKV' })]);
    expect(gb).toContain(' aa ');
    expect(gb).not.toContain('DNA');
  });

  it('renders the ORIGIN block and feature locations (plus, complement, passthrough)', () => {
    const gb = exportToGenBank([record({
      sequence: 'ATGCAAATAG', // 10 bp
      features: [
        { type: 'CDS', name: 'fwd', start: 0, end: 6, strand: 1 },
        { type: 'CDS', name: 'rev', start: 2, end: 8, strand: -1 },
        { type: 'gene', name: 'joined', start: 0, end: 8, strand: 1, locationString: 'join(1..3,6..8)' },
      ],
    })]);
    // ORIGIN: 1-based line number right-justified to width 9, then the
    // lowercased sequence in 10-base groups.
    expect(gb).toContain('        1 atgcaaatag');
    // strand +1 reconstructs '1..6'; strand -1 reconstructs 'complement(3..8)';
    // an explicit locationString is passed through verbatim.
    expect(gb).toContain('1..6');
    expect(gb).toContain('complement(3..8)');
    expect(gb).toContain('join(1..3,6..8)');
  });
});
