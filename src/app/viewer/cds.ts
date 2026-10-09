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

import { getFeatureStrand } from '@/src/domain/bio/strand';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { alignedToOriginalPositions, extractCodingSequence, isFeatureBroken } from '@/src/domain/bio';

/** Feature types rendered as translated coding sequences (CDS/ORF, upper- and lower-case forms). */
export const CDS_ORF_TYPES = ['CDS', 'ORF', 'orf', 'cds'];

/**
 * Maps each CDS/ORF feature to whether its protein has an internal (early) stop
 * codon — a "broken" protein. Prefers the stored `/translation` over
 * recomputation (see {@link isFeatureBroken}).
 *
 * Keyed by the feature object, not its interval: a source or gene sharing a
 * broken CDS's span must not inherit the mark. A peptide record has no codons
 * to read, so it never has broken features.
 */
export const computeBrokenFeatureMap = (
  features: BioFeature[],
  seq: string,
  moleculeType?: SeqRecord['moleculeType'],
): Map<BioFeature, boolean> => {
  const map = new Map<BioFeature, boolean>();
  if (moleculeType === 'protein') return map;
  features
    .filter(f => CDS_ORF_TYPES.includes(f.type) && typeof getFeatureStrand(f) === 'number')
    .forEach(f => {
      const { codingSeq } = extractCodingSequence(f, seq);
      const translTable = parseInt(String(f.metadata?.transl_table ?? '1'), 10) || 1;
      map.set(f, isFeatureBroken(f, codingSeq, translTable));
    });
  return map;
};

/**
 * Reading frame (0, 1, or 2) of one codon, from its first base. A forward
 * codon reads up from `firstBase`; a reverse codon reads down from it and
 * occupies `[firstBase - 2, firstBase]`, so its frame is the exclusive end
 * `firstBase + 1` modulo 3 and a plain reverse CDS keeps the frame of its
 * `end`. `firstBase` is a biological index: in an alignment the caller maps
 * columns to residues first (see `alignedToOriginalPositions`). Computed per
 * codon rather than per feature so that a ribosomal frameshift inside a join
 * changes frame (and row) where translation really does.
 */
export const codonFrame = (firstBase: number, strand: 1 | -1): 0 | 1 | 2 => {
  const anchor = strand === 1 ? firstBase : firstBase + 1;
  return (((anchor % 3) + 3) % 3) as 0 | 1 | 2;
};

type Frame = 0 | 1 | 2;

/** Amino-acid row assignment for a record's translated CDS/ORF features. */
export interface TranslationLanes {
  /** Lane of each feature's codons per reading frame, counted outward from the nucleotide row. */
  laneOf: Map<BioFeature, Map<Frame, number>>;
  forward: number;
  reverse: number;
}

export const NO_TRANSLATION_LANES: TranslationLanes = { laneOf: new Map(), forward: 0, reverse: 0 };

/**
 * Packs each strand's CDS/ORF translations into as few rows as possible.
 * Overlapping codons in the same reading frame are the same codons, so they
 * share a row; only an overlap in a different frame forces a new one. A
 * frameshifted join reads in two frames, so each frame of a feature is packed
 * on its own and the frameshift step crosses between their rows. Lanes are
 * derived from the whole record, not the viewport, so rows stay put while scrolling.
 */
export const assignTranslationLanes = (
  features: BioFeature[],
  seq: string,
  moleculeType?: SeqRecord['moleculeType'],
): TranslationLanes => {
  if (moleculeType === 'protein') return NO_TRANSLATION_LANES;
  const positions = seq.includes('-') ? alignedToOriginalPositions(seq) : null;
  const laneOf = new Map<BioFeature, Map<Frame, number>>();
  const pack = (strand: 1 | -1) => {
    const units: { feature: BioFeature; frame: Frame; start: number; end: number }[] = [];
    features
      .filter(f => CDS_ORF_TYPES.includes(f.type) && getFeatureStrand(f) === strand)
      .forEach(f => {
        const { codingSeq, alignedIndices } = extractCodingSequence(f, seq);
        const spans = new Map<Frame, { start: number; end: number }>();
        for (let j = 0; j < codingSeq.length - 2; j += 3) {
          const startIdx = alignedIndices[j];
          const endIdx = alignedIndices[j + 2];
          if (startIdx === undefined || endIdx === undefined) continue;
          const frame = codonFrame(positions ? positions[startIdx] : startIdx, strand);
          const lo = Math.min(startIdx, endIdx);
          const hi = Math.max(startIdx, endIdx) + 1;
          const span = spans.get(frame);
          spans.set(frame, span ? { start: Math.min(span.start, lo), end: Math.max(span.end, hi) } : { start: lo, end: hi });
        }
        spans.forEach((span, frame) => units.push({ feature: f, frame, ...span }));
      });
    const lanes: (typeof units)[] = [];
    units.sort((a, b) => a.start - b.start).forEach(unit => {
      let lane = lanes.findIndex(placed => placed.every(p =>
        p.frame === unit.frame || unit.end <= p.start || p.end <= unit.start));
      if (lane < 0) lane = lanes.push([]) - 1;
      lanes[lane].push(unit);
      const frames = laneOf.get(unit.feature) ?? new Map<Frame, number>();
      laneOf.set(unit.feature, frames.set(unit.frame, lane));
    });
    return lanes.length;
  };
  const forward = pack(1);
  const reverse = pack(-1);
  return { laneOf, forward, reverse };
};
