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

import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { reverseComplement } from '@/src/domain/bio/sequence';

export function annotationDirection(feature: BioFeature, moleculeType?: SeqRecord['moleculeType'], strand?: 1 | -1): string {
  if (moleculeType === 'protein') return 'Protein region';
  if (strand === undefined && feature.segments?.some(s => s.strand === 1) && feature.segments.some(s => s.strand === -1)) return 'Mixed strands · by segment';
  const direction = strand ?? getFeatureStrand(feature);
  if (direction === 1) return 'Forward (+) 5′ → 3′';
  if (direction === -1) return 'Reverse (−) 3′ ← 5′';
  return direction === '.' ? 'Unstranded (.) · reference bases' : 'Unknown (?) · reference bases';
}

/** One base at its existing screen coordinate, not a reversed sequence or a
 * spliced product. On the minus strand the complementary letters read 3′→5′
 * left-to-right. RNA stays RNA; this display helper never changes stored data.
 */
export function annotationBase(base: string, strand: ReturnType<typeof getFeatureStrand>, moleculeType?: SeqRecord['moleculeType']): string {
  if (strand !== -1 || moleculeType === 'protein') return base;
  return reverseComplement(base, moleculeType);
}

export function fitAnnotationText(text: string, width: number, charWidth: number): string {
  const capacity = Math.max(0, Math.floor((width - 8) / charWidth));
  if (capacity < 2) return '';
  return text.length <= capacity ? text : text.slice(0, capacity - 1) + '…';
}
