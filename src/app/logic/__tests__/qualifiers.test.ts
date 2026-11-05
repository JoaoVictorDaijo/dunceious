/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import { describe, expect, it } from 'vitest';
import { metadataFromRows, qualifierIssue, qualifierRows } from '../qualifiers';

describe('qualifier rows', () => {
  it('hides internal keys and keeps the stored order', () => {
    expect(qualifierRows({ gene: 'S', _gffStrand: '.', product: 'spike' })).toEqual([
      { id: 0, key: 'gene', value: 'S' },
      { id: 1, key: 'product', value: 'spike' },
    ]);
  });

  it('rebuilds metadata preserving internal keys, renames and removals', () => {
    const previous = { gene: 'S', _gffStrand: '.', note: 'old' };
    const rows = [
      { id: 0, key: 'locus_tag', value: 'S' },
      { id: 2, key: ' /note ', value: 'edited' },
      { id: 3, key: '', value: 'draft' },
    ];
    expect(metadataFromRows(previous, rows)).toEqual({ _gffStrand: '.', locus_tag: 'S', note: 'edited' });
  });

  it('never lets an edited row overwrite an internal key', () => {
    expect(metadataFromRows({ _gffStrand: '?' }, [{ id: 0, key: '_gffStrand', value: '+' }])).toEqual({ _gffStrand: '?' });
  });

  it('flags rows that would not round-trip through GenBank', () => {
    const rows = [
      { id: 0, key: 'note', value: 'a' },
      { id: 1, key: 'note', value: 'b' },
      { id: 2, key: 'two words', value: '' },
      { id: 3, key: '_secret', value: '' },
      { id: 4, key: 'db_xref', value: 'GeneID:1' },
    ];
    expect(rows.map(r => qualifierIssue(r, rows))).toEqual(['duplicate', null, 'invalid', 'internal', null]);
  });
});
