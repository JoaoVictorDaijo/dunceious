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

import { describe, it, expect } from 'vitest';
import type { SeqRecord } from '@/src/domain/bio/types';
import { parseGenBank } from '../index';
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
    // '_'-prefixed and empty non-flag metadata are omitted; real qualifier is kept.
    expect(gb).toContain('/organism="E. coli"');
    expect(gb).not.toContain('_internal');
    expect(gb).not.toContain('/empty=');
    expect(gb.trimEnd().endsWith('//')).toBe(true);
  });

  it('writes INSDC flag qualifiers bare and still drops other empty values', () => {
    const gb = exportToGenBank([record({
      features: [{ type: 'CDS', name: 'pp1ab', start: 0, end: 10, strand: 1,
        metadata: { ribosomal_slippage: '', pseudo: '', note: '' } }],
    })]);
    expect(gb).toContain('                     /ribosomal_slippage\n');
    expect(gb).toContain('                     /pseudo\n');
    expect(gb).not.toContain('/note');
  });

  it('round-trips the /ribosomal_slippage flag through parse and export', () => {
    const gb = exportToGenBank([record({ features: [{ type: 'CDS', name: 'pp1ab', start: 0, end: 10, strand: 1,
      metadata: { ribosomal_slippage: '' } }] })]);
    const [rec] = parseGenBank(gb);
    expect(rec.features.find(f => f.type === 'CDS')?.metadata?.ribosomal_slippage).toBe('');
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


describe('custom annotation roundtrip', () => {
  it.each([1, -1] as const)('retains a custom primer name, region and strand %s', strand => {
    const source = record({ features: [{ type: 'primer', name: 'Synthetic primer', start: 1, end: 8, strand }] });
    const snapshot = structuredClone(source);
    const parsed = parseGenBank(exportToGenBank([source]));
    expect(parsed[0].features[0]).toMatchObject(source.features[0]);
    expect(parsed[0].sequence).toBe(source.sequence);
    expect(source).toEqual(snapshot);
  });
});


it.each(['.', '?'])('refuses to invent a GenBank location strand for GFF %s', raw => {
  const source = record({ features: [{ type: 'misc_feature', name: 'Unknown synthetic', start: 1, end: 8, strand: 1, metadata: { _gffStrand: raw } }] });
  expect(() => exportToGenBank([source])).toThrow(/Export GFF3 or project JSON/);
});

it('roundtrips a newly created reverse annotation with separate segments', () => {
  const source = record({ features: [{ type: 'misc_feature', name: 'Joined synthetic', start: 1, end: 9, strand: -1, segments: [{ start: 1, end: 3 }, { start: 6, end: 9 }] }] });
  const exported = exportToGenBank([source]);
  expect(exported).toContain('complement(join(2..3,7..9))');
  expect(parseGenBank(exported)[0].features[0]).toMatchObject(source.features[0]);
});
