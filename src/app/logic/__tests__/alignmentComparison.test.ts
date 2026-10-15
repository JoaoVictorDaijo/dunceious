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
  isAlignmentComparisonSettings,
  resolveReference,
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

  it('is off while the highlight is none or no alignment is loaded', () => {
    expect(activeComparison(records, DEFAULT_ALIGNMENT_COMPARISON, true, false)).toBeNull();
    expect(activeComparison(records, { ...DEFAULT_ALIGNMENT_COMPARISON, highlight: 'disagreements' }, false, false)).toBeNull();
  });

  it('carries the reference sequence and alphabet', () => {
    const active = activeComparison(records, { referenceId: 'alpha', highlight: 'disagreements', matchDots: true }, true, true);
    expect(active).toEqual({ referenceId: 'alpha', referenceSeq: 'ACGA', highlight: 'disagreements', matchDots: true, alphabet: 'protein' });
  });

  it('never uses match dots when highlighting agreements', () => {
    const active = activeComparison(records, { referenceId: null, highlight: 'agreements', matchDots: true }, true, false);
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
