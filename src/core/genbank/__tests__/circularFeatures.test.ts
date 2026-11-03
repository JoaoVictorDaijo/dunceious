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
import { parseGenBank } from '../index';

const CIRCULAR_GB = `LOCUS       PLASMID1        6000 bp    DNA    circular   01-JAN-2024
DEFINITION  Synthetic circular plasmid with origin-crossing gene.
ACCESSION   PLASMID1
FEATURES             Location/Qualifiers
     source          1..6000
                     /organism="synthetic"
                     /mol_type="genomic DNA"
     gene            join(5500..6000,1..300)
                     /gene="wrapGene"
                     /note="crosses the origin"
     CDS             join(5500..6000,1..300)
                     /gene="wrapGene"
                     /product="WrapProtein"
                     /translation="MWRAP"
     gene            1000..2000
                     /gene="innerGene"
     CDS             complement(join(4700..5000,1..100))
                     /gene="compWrap"
                     /product="CompWrapProtein"
                     /translation="MCWRAP"
ORIGIN
        1 ${'atgc'.repeat(1500)}
//
`;

describe('circular GenBank import', () => {
  it('imports circular topology and every feature from a complete record', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    expect(record.sequence).toHaveLength(6000);
    expect(record.isCircular).toBe(true);
    expect(record.features).toHaveLength(5);
  });

  it('keeps the forward gene envelope, written intervals and raw location across the origin', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    expect(record.features.find(f => f.type === 'gene' && f.name === 'wrapGene')).toMatchObject({
      start: 5499, end: 300, strand: 1, locationString: 'join(5500..6000,1..300)',
      segments: [{ start: 5499, end: 6000 }, { start: 0, end: 300 }],
    });
  });

  it('imports a forward wrapping CDS with its annotated translation', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    expect(record.features.find(f => f.type === 'CDS' && f.name === 'WrapProtein')).toMatchObject({
      start: 5499, end: 300, strand: 1, translation: 'MWRAP',
    });
  });

  it('keeps a whole-feature reverse wrap in written segment order', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    expect(record.features.find(f => f.name === 'CompWrapProtein')).toMatchObject({
      start: 4699, end: 100, strand: -1,
      segments: [{ start: 4699, end: 5000 }, { start: 0, end: 100 }],
    });
  });

  it('keeps an internal feature linear', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    expect(record.features.find(f => f.name === 'innerGene')).toMatchObject({ start: 999, end: 2000 });
  });
});
