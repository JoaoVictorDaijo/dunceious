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

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SeqRecord } from '../../types';
import {
  getNucleotideColor,
  getAminoAcidColor,
  getFeatureColor,
  getOriginalPos,
  exportToFasta,
  exportToGff,
  downloadBlob,
} from '../bioUtils';

describe('getNucleotideColor', () => {
  it('returns the canonical colour for each base (case-insensitive)', () => {
    expect(getNucleotideColor('A')).toBe('#22c55e');
    expect(getNucleotideColor('t')).toBe('#f43f5e');
    expect(getNucleotideColor('C')).toBe('#3b82f6');
    expect(getNucleotideColor('g')).toBe('#eab308');
  });

  it('returns the gap colour for "-"', () => {
    expect(getNucleotideColor('-')).toBe('#64748b');
  });

  it('returns the fallback colour for an unknown character', () => {
    expect(getNucleotideColor('X')).toBe('#94a3b8');
  });
});

describe('getAminoAcidColor', () => {
  it('colours hydrophobic non-polar residues amber', () => {
    for (const aa of ['A', 'V', 'I', 'L', 'M']) {
      expect(getAminoAcidColor(aa)).toBe('#f59e0b');
    }
  });

  it('colours each special/grouped residue by its convention', () => {
    expect(getAminoAcidColor('G')).toBe('#94a3b8'); // slate
    expect(getAminoAcidColor('P')).toBe('#d97706'); // dark amber
    expect(getAminoAcidColor('F')).toBe('#a855f7'); // aromatic purple
    expect(getAminoAcidColor('W')).toBe('#a855f7');
    expect(getAminoAcidColor('Y')).toBe('#8b5cf6'); // violet
    expect(getAminoAcidColor('K')).toBe('#3b82f6'); // positive blue
    expect(getAminoAcidColor('R')).toBe('#3b82f6');
    expect(getAminoAcidColor('H')).toBe('#60a5fa'); // sky blue
    expect(getAminoAcidColor('D')).toBe('#ef4444'); // negative red
    expect(getAminoAcidColor('E')).toBe('#f97316'); // orange-red
    expect(getAminoAcidColor('S')).toBe('#22c55e'); // polar green
    expect(getAminoAcidColor('T')).toBe('#22c55e');
    expect(getAminoAcidColor('N')).toBe('#10b981'); // emerald
    expect(getAminoAcidColor('Q')).toBe('#10b981');
    expect(getAminoAcidColor('C')).toBe('#eab308'); // cysteine yellow
  });

  it('colours stop codons (* and _) red and gaps slate', () => {
    expect(getAminoAcidColor('*')).toBe('#ef4444');
    expect(getAminoAcidColor('_')).toBe('#ef4444');
    expect(getAminoAcidColor('-')).toBe('#64748b');
  });

  it('is case-insensitive and falls back for unknown residues', () => {
    expect(getAminoAcidColor('a')).toBe('#f59e0b');
    expect(getAminoAcidColor('Z')).toBe('#94a3b8');
  });
});

describe('getFeatureColor', () => {
  it('returns the mapped colour for a known feature type', () => {
    expect(getFeatureColor('CDS')).toBe('#8b5cf6');
    expect(getFeatureColor('gene')).toBe('#0ea5e9');
  });

  it('prefers a custom colour override when provided', () => {
    expect(getFeatureColor('CDS', { CDS: '#123456' })).toBe('#123456');
  });

  it('falls through to the built-in map when the override lacks the type', () => {
    expect(getFeatureColor('gene', { CDS: '#123456' })).toBe('#0ea5e9');
  });

  it('returns the fallback colour for an unknown feature type', () => {
    expect(getFeatureColor('totally_unknown')).toBe('#94a3b8');
  });
});

describe('getOriginalPos', () => {
  it('is the identity for a gap-free sequence', () => {
    expect(getOriginalPos('ACGT', 4)).toBe(4);
    expect(getOriginalPos('ACGT', 0)).toBe(0);
  });

  it('discounts leading and internal gaps before the position', () => {
    // '--AC' up to pos 4 → 2 real bases
    expect(getOriginalPos('--AC', 4)).toBe(2);
    // 'A-C-G' up to pos 5 → A,C,G = 3
    expect(getOriginalPos('A-C-G', 5)).toBe(3);
  });

  it('clamps a position past the end of the aligned sequence', () => {
    expect(getOriginalPos('ACGT', 100)).toBe(4);
  });
});

function record(overrides: Partial<SeqRecord> = {}): SeqRecord {
  return { id: 'REC1', name: 'Record 1', sequence: 'ATGCAAATAG', features: [], ...overrides };
}

describe('exportToGff', () => {
  it('emits the version header and a tab-delimited feature line with 1-based start', () => {
    const gff = exportToGff([record({
      features: [{ type: 'CDS', name: 'my gene', start: 9, end: 20, strand: 1 }],
    })]);
    expect(gff.startsWith('##gff-version 3\n')).toBe(true);
    // start is 0-based 9 → GFF 1-based 10; end stays 20; strand '+'
    expect(gff).toContain('REC1\tDunceious\tCDS\t10\t20\t.\t+\t0\tID=my_gene;Name=my gene');
  });

  it('renders a minus-strand feature as a full tab-delimited line with 1-based start', () => {
    const gff = exportToGff([record({
      features: [{ type: 'gene', name: 'g1', start: 3, end: 9, strand: -1 }],
    })]);
    // 0-based start 3 → GFF 1-based 4; end 9; strand '-'; name → ID/Name attrs.
    expect(gff).toContain('REC1\tDunceious\tgene\t4\t9\t.\t-\t0\tID=g1;Name=g1');
  });
});

describe('exportToFasta', () => {
  it('wraps a single record at 60 characters per line', () => {
    expect(exportToFasta([record({ sequence: 'A'.repeat(70) })]))
      .toBe('>REC1\n' + 'A'.repeat(60) + '\n' + 'A'.repeat(10));
  });

  it('emits a plain header and unwrapped sequence for a short record', () => {
    expect(exportToFasta([record()])).toBe('>REC1\nATGCAAATAG');
  });

  it('slices to [start, end) and stamps the slice header when both are given', () => {
    // 'ATGCAAATAG'.substring(2, 5) → 'GCA'
    expect(exportToFasta([record()], 2, 5)).toBe('>REC1 [Slice: 2-5]\nGCA');
  });

  it('prefers alignedSequence over sequence when present', () => {
    expect(exportToFasta([record({ alignedSequence: 'XXXX' })])).toBe('>REC1\nXXXX');
  });

  it('joins multiple records with a blank line', () => {
    const out = exportToFasta([
      record({ id: 'A', sequence: 'AAA' }),
      record({ id: 'B', sequence: 'CCC' }),
    ]);
    expect(out).toBe('>A\nAAA\n\n>B\nCCC');
  });
});

describe('downloadBlob', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wires content and mimeType into a Blob, clicks the anchor, and revokes the URL', () => {
    const click = vi.fn();
    const anchor: Record<string, unknown> = { click };
    const createElement = vi.fn(() => anchor);
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const createObjectURL = vi.fn((_blob: unknown) => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    const blobs: Array<{ parts: unknown; opts: unknown }> = [];
    class BlobStub {
      parts: unknown;
      opts: unknown;
      constructor(parts: unknown, opts: unknown) {
        this.parts = parts;
        this.opts = opts;
        blobs.push(this);
      }
    }

    vi.stubGlobal('document', { createElement, body: { appendChild, removeChild } });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('Blob', BlobStub);

    downloadBlob('hello', 'out.txt', 'text/plain');

    // Blob is built from the content + mimeType and handed to createObjectURL.
    expect(blobs).toHaveLength(1);
    expect(blobs[0].parts).toEqual(['hello']);
    expect(blobs[0].opts).toEqual({ type: 'text/plain' });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(BlobStub);
    // Anchor wiring + lifecycle.
    expect(createElement).toHaveBeenCalledWith('a');
    expect(anchor.href).toBe('blob:mock-url');
    expect(anchor.download).toBe('out.txt');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
