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

import type { BioFeature } from '@/src/domain/bio/types';
import { detectEarlyStop, extractCodingSequence } from '@/src/domain/bio';

/** Feature types rendered as translated coding sequences (CDS/ORF, upper- and lower-case forms). */
export const CDS_ORF_TYPES = ['CDS', 'ORF', 'orf', 'cds'];

/**
 * Maps each CDS/ORF feature's `${start}-${end}-${strand}` key to whether its
 * coding sequence has an internal (early) stop codon — a "broken" protein.
 */
export const computeBrokenFeatureMap = (features: BioFeature[], seq: string): Map<string, boolean> => {
  const map = new Map<string, boolean>();
  features
    .filter(f => CDS_ORF_TYPES.includes(f.type))
    .forEach(f => {
      const { codingSeq } = extractCodingSequence(f, seq);
      const translTable = parseInt(String(f.metadata?.transl_table ?? '1'), 10) || 1;
      map.set(`${f.start}-${f.end}-${f.strand}`, detectEarlyStop(codingSeq, translTable));
    });
  return map;
};
