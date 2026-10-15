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

import { compareToReference, type ComparisonAlphabet } from '@/src/domain/bio/referenceComparison';
import type { SeqRecord } from '@/src/domain/bio/types';

/** Which residues keep their colour in the non-reference rows. */
export type ComparisonHighlight = 'none' | 'disagreements' | 'agreements';

export interface AlignmentComparisonSettings {
  /** The chosen reference record; null (or a record that is gone) falls back to the first aligned record. */
  referenceId: string | null;
  highlight: ComparisonHighlight;
  /** Draw residues identical to the reference as a match dot (·), as NCBI's MSA Viewer, Geneious and UGENE do. */
  matchDots: boolean;
}

export const DEFAULT_ALIGNMENT_COMPARISON: AlignmentComparisonSettings = {
  referenceId: null,
  highlight: 'none',
  matchDots: true,
};

const HIGHLIGHTS: readonly ComparisonHighlight[] = ['none', 'disagreements', 'agreements'];

export function isAlignmentComparisonSettings(value: unknown): value is AlignmentComparisonSettings {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (v.referenceId === null || typeof v.referenceId === 'string')
    && HIGHLIGHTS.includes(v.highlight as ComparisonHighlight)
    && typeof v.matchDots === 'boolean';
}

/** Records that can take part in a comparison: only aligned rows share the reference's columns. */
export function comparisonCandidates(records: SeqRecord[]): SeqRecord[] {
  return records.filter(r => r.alignedSequence);
}

/** A comparison needs a reference and at least one other aligned row. */
export function canCompare(records: SeqRecord[]): boolean {
  return comparisonCandidates(records).length >= 2;
}

/**
 * The record every other row is compared against. Hidden records still count:
 * hiding the reference must not silently change what the visible rows are compared to.
 */
export function resolveReference(records: SeqRecord[], referenceId: string | null): SeqRecord | null {
  const aligned = comparisonCandidates(records);
  return aligned.find(r => r.id === referenceId) ?? aligned[0] ?? null;
}

/** Picking a reference asks to compare against it, so an idle comparison starts showing differences. */
export function withReference(settings: AlignmentComparisonSettings, referenceId: string): AlignmentComparisonSettings {
  return { ...settings, referenceId, highlight: settings.highlight === 'none' ? 'disagreements' : settings.highlight };
}

/** What the sequence rows need to draw a comparison; null when rows draw as usual. */
export interface ActiveComparison {
  referenceId: string;
  referenceSeq: string;
  highlight: Exclude<ComparisonHighlight, 'none'>;
  /** Only ever true with `disagreements`: a dot claims identity, so it never stands for a muted difference. */
  matchDots: boolean;
  alphabet: ComparisonAlphabet;
}

export function activeComparison(
  records: SeqRecord[],
  settings: AlignmentComparisonSettings,
  isProteinSession: boolean,
): ActiveComparison | null {
  if (!canCompare(records) || settings.highlight === 'none') return null;
  const reference = resolveReference(records, settings.referenceId);
  if (!reference?.alignedSequence) return null;
  return {
    referenceId: reference.id,
    referenceSeq: reference.alignedSequence,
    highlight: settings.highlight,
    matchDots: settings.highlight === 'disagreements' && settings.matchDots,
    alphabet: isProteinSession ? 'protein' : 'nucleotide',
  };
}

export type ResidueStyle = 'normal' | 'muted' | 'dot' | 'indel';

/**
 * How one residue is drawn under a comparison; the viewer and the menu preview share it.
 * Gaps always draw as gaps, darkened when they are a highlighted difference; a dot only
 * ever stands for confirmed identity, so ambiguity codes stay letters.
 */
export function residueStyle(
  char: string,
  referenceChar: string | undefined,
  comparison: Pick<ActiveComparison, 'highlight' | 'matchDots' | 'alphabet'> | null | undefined,
): ResidueStyle {
  if (!comparison) return 'normal';
  const relation = compareToReference(char, referenceChar, comparison.alphabet);
  if (char === '-') return relation === 'gap' && comparison.highlight === 'disagreements' ? 'indel' : 'normal';
  const highlighted = comparison.highlight === 'disagreements'
    ? relation === 'substitution' || relation === 'gap'
    : relation === 'identical';
  if (highlighted) return 'normal';
  return relation === 'identical' && comparison.matchDots ? 'dot' : 'muted';
}
