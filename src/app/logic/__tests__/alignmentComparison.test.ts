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
import {
  DEFAULT_ALIGNMENT_COMPARISON,
  activeComparison,
  canCompare,
  isAlignmentComparisonSettings,
  residueStyle,
  resolveReference,
  withReference,
} from '../alignmentComparison';

const rec = (id: string, aligned?: string, extra: Partial<SeqRecord> = {}): SeqRecord => ({
  id, name: id, sequence: (aligned ?? 'ACGT').replace(/-/g, ''), features: [], alignedSequence: aligned, ...extra,
});

describe('resolveReference', () => {
  const records = [rec('wuhan', 'AC-T'), rec('alpha', 'ACGT'), rec('delta', 'AGGT')];

  it('uses the chosen record', () => {
    expect(resolveReference(records, 'delta')?.id).toBe('delta');
  });

  it('falls back to the first aligned record when nothing is chosen or the choice is gone', () => {
    expect(resolveReference(records, null)?.id).toBe('wuhan');
    expect(resolveReference(records, 'removed')?.id).toBe('wuhan');
  });

  it('keeps a hidden reference instead of switching to another row', () => {
    const hidden = [rec('wuhan', 'AC-T', { visible: false }), rec('alpha', 'ACGT')];
    expect(resolveReference(hidden, 'wuhan')?.id).toBe('wuhan');
  });

  it('skips records that are not part of the alignment', () => {
    expect(resolveReference([rec('raw'), rec('alpha', 'ACGT')], 'raw')?.id).toBe('alpha');
  });
});

describe('activeComparison', () => {
  const records = [rec('wuhan', 'ACGT'), rec('alpha', 'ACGA')];

  it('is off while the highlight is none or fewer than two records are aligned', () => {
    expect(activeComparison(records, DEFAULT_ALIGNMENT_COMPARISON, false)).toBeNull();
    expect(activeComparison([rec('wuhan', 'ACGT'), rec('raw')], { ...DEFAULT_ALIGNMENT_COMPARISON, highlight: 'disagreements' }, false)).toBeNull();
  });

  it('carries the reference sequence and alphabet', () => {
    const active = activeComparison(records, { referenceId: 'alpha', highlight: 'disagreements', matchDots: true }, true);
    expect(active).toEqual({ referenceId: 'alpha', referenceSeq: 'ACGA', highlight: 'disagreements', matchDots: true, alphabet: 'protein' });
  });

  it('never uses match dots when highlighting agreements', () => {
    const active = activeComparison(records, { referenceId: null, highlight: 'agreements', matchDots: true }, false);
    expect(active?.matchDots).toBe(false);
  });
});

describe('isAlignmentComparisonSettings', () => {
  it('accepts valid settings', () => {
    expect(isAlignmentComparisonSettings(DEFAULT_ALIGNMENT_COMPARISON)).toBe(true);
    expect(isAlignmentComparisonSettings({ referenceId: 'x', highlight: 'agreements', matchDots: false })).toBe(true);
  });

  it('rejects malformed settings', () => {
    expect(isAlignmentComparisonSettings(null)).toBe(false);
    expect(isAlignmentComparisonSettings({ referenceId: 1, highlight: 'none', matchDots: true })).toBe(false);
    expect(isAlignmentComparisonSettings({ referenceId: null, highlight: 'differences', matchDots: true })).toBe(false);
    expect(isAlignmentComparisonSettings({ referenceId: null, highlight: 'none' })).toBe(false);
  });
});

describe('canCompare', () => {
  it('needs two aligned records, whatever the raw lengths', () => {
    // Equal-length raw records pass the viewer's alignment check but share no alignment columns.
    expect(canCompare([rec('a'), rec('b')])).toBe(false);
    expect(canCompare([rec('a', 'ACGT'), rec('b')])).toBe(false);
    expect(canCompare([rec('a', 'ACGT'), rec('b', 'AC-T'), rec('raw')])).toBe(true);
  });
});

describe('residueStyle', () => {
  const differences = { highlight: 'disagreements' as const, matchDots: true, alphabet: 'nucleotide' as const };
  const identity = { highlight: 'agreements' as const, matchDots: false, alphabet: 'nucleotide' as const };

  it('draws everything normally without a comparison', () => {
    expect(residueStyle('G', 'A', null)).toBe('normal');
  });

  it('in Differences: dots identity, keeps substitutions and insertions, darkens deletions', () => {
    expect(residueStyle('A', 'A', differences)).toBe('dot');
    expect(residueStyle('G', 'A', differences)).toBe('normal');
    expect(residueStyle('G', '-', differences)).toBe('normal');
    expect(residueStyle('-', 'A', differences)).toBe('indel');
    expect(residueStyle('-', '-', differences)).toBe('normal');
    expect(residueStyle('N', 'A', differences)).toBe('muted');
    expect(residueStyle('A', 'A', { ...differences, matchDots: false })).toBe('muted');
  });

  it('in Identity: colours only identical residues and never dots', () => {
    expect(residueStyle('A', 'A', identity)).toBe('normal');
    expect(residueStyle('G', 'A', identity)).toBe('muted');
    expect(residueStyle('G', '-', identity)).toBe('muted');
    expect(residueStyle('-', 'A', identity)).toBe('normal');
    expect(residueStyle('N', 'A', identity)).toBe('muted');
  });
});

describe('withReference', () => {
  it('starts an idle comparison in Differences and keeps an active highlight', () => {
    expect(withReference(DEFAULT_ALIGNMENT_COMPARISON, 'delta')).toEqual({ referenceId: 'delta', highlight: 'disagreements', matchDots: true });
    expect(withReference({ referenceId: null, highlight: 'agreements', matchDots: false }, 'delta'))
      .toEqual({ referenceId: 'delta', highlight: 'agreements', matchDots: false });
  });
});
