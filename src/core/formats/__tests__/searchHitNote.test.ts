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

import { expect, it } from 'vitest';
import { withSearchHit } from '@/src/domain/bio/searchHit';
import type { BioFeature, SearchHitProvenance, SeqRecord } from '@/src/domain/bio/types';
import { searchHitNote } from '../searchHitNote';
import { exportToGenBank } from '../../genbank/serialize';
import { exportToGff3 } from '../gff3';

const base: BioFeature = { name: 'hit', type: 'misc_feature', start: 0, end: 4, strand: 1, metadata: { note: 'User note' } };
const provenance: SearchHitProvenance = { v: 1, query: 'ACGT', mode: 'whole', alphabet: 'nucleotide', params: { minQueryIdentity: 80 },
  strand: 1, cigar: '3=1X', edits: 1, span: { start: 0, end: 4, strand: 1 },
  appVersion: '3.4.0', createdAt: '2026-10-16T00:00:00Z', exportNote: false };
const record = (feature: BioFeature): SeqRecord => ({ id: 'r', name: 'r', sequence: 'ACGA', features: [feature] });
it('leaves exports byte-for-byte unchanged unless the note is opted into', () => {
  const f = withSearchHit(base, provenance);
  expect(searchHitNote(f)).toBeNull();
  for (const exporter of [exportToGenBank, exportToGff3]) expect(exporter([record(f)]).text).toBe(exporter([record(base)]).text);
});
it('appends an opt-in note alongside user notes and suppresses stale notes', () => {
  const f = withSearchHit(base, { ...provenance, exportNote: true });
  const note = 'Found by Dunceious fuzzy search (whole query, min query identity 80%): query ACGT (4 nt), 75% query identity, 1 edit, CIGAR 3=1X';
  expect(searchHitNote(f)).toBe(note);
  const gb = exportToGenBank([record(f)]).text;
  expect(gb).toContain('/note="User note"'); expect(gb).toContain('/note="Found by Dunceious');
  const gff = exportToGff3([record(f)]).text;
  expect(decodeURIComponent(gff)).toContain('Note=' + note);
  expect(gff).toContain('note=User%20note');
  expect(gb + gff).not.toContain('_searchHit');
  expect(searchHitNote({ ...f, end: 3 })).toBeNull();
});
