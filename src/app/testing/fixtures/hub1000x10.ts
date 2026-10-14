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
export function createHub1000x10(): SeqRecord[] {
  const sequence = 'ACGT'.repeat(2500);
  return Array.from({ length: 1000 }, (_, i) => {
    const id = `index${String(i + 1).padStart(4, '0')}`;
    const organism = i < 500 ? 'Fixture organism A' : 'Fixture organism B';
    return { id, name: id, sequence, moleculeType: 'dna', visible: true, importedFrom: 'hub1000x10.gb', fileDetails: { organism }, features: [
      { name: 'source', type: 'source', start: 0, end: sequence.length, strand: 1, metadata: { organism, isolate: id } },
      ...Array.from({ length: 10 }, (_, j) => ({ name: `${id}-feature-${j + 1}`, type: j % 2 ? 'CDS' : 'gene', start: j * 900, end: j * 900 + 600, strand: j % 3 ? 1 as const : -1 as const, metadata: { gene: `gene${j + 1}`, note: 'index-hit' } })),
    ] };
  });
}
