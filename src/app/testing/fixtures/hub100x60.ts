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

/** Source-only records keep empty-state coverage alongside the 98 × 60 annotation load. */
export function createHub100x60(): SeqRecord[] {
  const sequence = 'ACGT'.repeat(7500);
  const types = ['gene', 'CDS', 'mat_peptide', 'misc_feature'] as const;
  return Array.from({ length: 100 }, (_, recordIndex) => {
    const id = `hub${String(recordIndex + 1).padStart(3, '0')}`;
    const organism = recordIndex % 2 === 0 ? 'Fixture organism A' : 'Fixture organism B';
    const partial = recordIndex === 1;
    const source: BioFeature = {
      type: 'source', name: 'source', start: 0, end: sequence.length, strand: 1,
      metadata: { organism, host: 'Homo sapiens', geo_loc_name: 'Brazil:São Paulo', collection_date: '2020', isolate: id },
    };
    const annotations: BioFeature[] = recordIndex >= 98 ? [] : Array.from({ length: 60 }, (_, featureIndex) => {
      const start = featureIndex * 450;
      const end = start + 300;
      const type = types[featureIndex % types.length];
      return {
        type, name: `${id}-feature-${featureIndex + 1}`, start, end,
        strand: featureIndex % 2 === 0 ? 1 : -1,
        locationString: `${partial && featureIndex === 0 ? '<' : ''}${start + 1}..${end}`,
        metadata: { gene: `gene${featureIndex + 1}`, product: `Fixture product ${featureIndex + 1}`, note: 'fixture-hit', ...(type === 'CDS' ? { codon_start: '1' } : {}) },
      };
    });
    if (recordIndex === 0) annotations[0] = {
      ...annotations[0], start: 29850, end: 150,
      locationString: 'join(29851..30000,1..150)',
      segments: [{ start: 29850, end: 30000 }, { start: 0, end: 150 }],
    };
    return {
      id, name: id, accession: id, definition: `${id}, ${partial ? 'partial' : 'complete'} genome`,
      sequence, moleculeType: 'dna', isCircular: recordIndex === 0, visible: true,
      importedFrom: 'hub100x60.gb', fileDetails: { organism, host: 'Homo sapiens', location: 'Brazil:São Paulo', collectionDate: '2020' },
      features: [source, ...annotations],
    };
  });
}
