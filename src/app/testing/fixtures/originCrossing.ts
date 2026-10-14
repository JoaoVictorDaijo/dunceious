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

import type { SeqRecord } from '@/src/domain/bio/types';

export function createOriginCrossingRecord(): SeqRecord {
  return {
    id: 'J02442', name: 'J02442', accession: 'J02442', moleculeType: 'dna',
    sequence: 'ACGT'.repeat(827), isCircular: true,
    features: [
      { type: 'CDS', name: 'polymerase', start: 2426, end: 1758, strand: 1,
        segments: [{ start: 2426, end: 3308 }, { start: 0, end: 1758 }],
        locationString: 'join(2427..3308,1..1758)', metadata: { gene: 'pol', product: 'polymerase' } },
      { type: 'CDS', name: 'envelope', start: 2991, end: 964, strand: 1,
        segments: [{ start: 2991, end: 3308 }, { start: 0, end: 964 }],
        locationString: 'join(2992..3308,1..964)', metadata: { gene: 'env', product: 'envelope' } },
      { type: 'CDS', name: 'core', start: 2020, end: 2587, strand: 1,
        locationString: '2021..2587', metadata: { gene: 'core', product: 'core' } },
      { type: 'mat_peptide', name: 'peptide', start: 295, end: 961, strand: 1,
        locationString: '296..961', metadata: { product: 'peptide' } },
    ],
  };
}
