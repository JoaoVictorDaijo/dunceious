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
import { extractCodingSequence, isFeatureBroken } from '@/src/domain/bio';

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
 * Vertical lane (0, 1, or 2) for a feature's amino-acid row: its reading-frame
 * phase, folding in `/codon_start`. Forward features read up from `start`,
 * reverse features down from `end`, so the `codon_start` offset shifts the lane
 * forward on the plus strand and backward on the minus strand. Features sharing
 * a reading frame share a lane; those in different frames get different lanes.
 */
export const translationFrame = (feature: BioFeature): 0 | 1 | 2 => {
  const codonStart = parseInt(String(feature.metadata?.codon_start ?? '1'), 10);
  const phase = Number.isFinite(codonStart) && codonStart > 1 ? codonStart - 1 : 0;
  const anchor = feature.strand === 1 ? feature.start + phase : feature.end - phase;
  return (((anchor % 3) + 3) % 3) as 0 | 1 | 2;
};
