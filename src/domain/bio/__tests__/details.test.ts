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
import { readDetails, writeDetails, isDetailEdited, validateDetail } from '../details';
import type { SeqRecord, DetailKey } from '../types';

const record = (extra: Partial<SeqRecord> = {}): SeqRecord => ({
  id: 'X', name: 'X', sequence: 'ACGT', features: [], ...extra,
});

describe('sequence details', () => {
  it('creates a whole-sequence source immutably without adding an annotation', () => {
    const original = record();
    const next = writeDetails(original, { host: 'Homo sapiens' });
    expect(next.features).toEqual([{ type: 'source', name: 'source', start: 0, end: 4, strand: 1, metadata: { host: 'Homo sapiens' } }]);
    expect(original.features).toEqual([]);
    expect(readDetails(next)).toEqual({ host: 'Homo sapiens' });
  });

  it('reads legacy country, preferring geo_loc_name when both exist', () => {
    const legacy = record({ features: [{ type: 'source', name: 'source', start: 0, end: 4, strand: 1, metadata: { country: 'Oman' } }] });
    expect(readDetails(legacy)).toEqual({ location: 'Oman' });
    legacy.features[0].metadata!.geo_loc_name = 'Saudi Arabia:Riyadh';
    expect(readDetails(legacy)).toEqual({ location: 'Saudi Arabia:Riyadh' });
  });

  it('keeps legacy location spelling, removes empty values, and preserves unrelated metadata', () => {
    const original = record({ locationQualifier: 'country', features: [{ type: 'source', name: 'source', start: 0, end: 4, strand: 1, metadata: { country: 'Oman', host: 'camel', isolate: 'K1' } }] });
    const next = writeDetails(original, { location: 'Saudi Arabia:Riyadh', host: '' });
    expect(next.features[0].metadata).toEqual({ country: 'Saudi Arabia:Riyadh', isolate: 'K1' });
    expect(original.features[0].metadata).toEqual({ country: 'Oman', host: 'camel', isolate: 'K1' });
    expect(writeDetails(next, { location: '' }).features[0].metadata).toEqual({ isolate: 'K1' });
  });

  it('compares each field with its file value, equating absent and empty', () => {
    const r = record({ fileDetails: { host: 'camel', organism: '' } });
    expect(isDetailEdited(r, 'organism')).toBe(false);
    expect(isDetailEdited(r, 'host')).toBe(true);
    expect(isDetailEdited(writeDetails(r, { host: 'camel' }), 'host')).toBe(false);
  });
});

describe('validateDetail', () => {
  it.each(['2014', 'Mar-2014', '21-Mar-2014', '2014-03', '2014-03-21', '2014-03-21T10Z', '2014-03-21T10:30Z', '21-Mar-2014T10:30:59Z', '2000-02-29'])('accepts date %s', value => {
    expect(validateDetail('collectionDate', value)).toBeNull();
  });

  it.each(['March 2014', '2014-13', '2014-02-29', '31-Apr-2014', '2014-03-21T24Z', '2014-03-21T10:60Z', '2014-03-21T10:30', '2014/2015'])('rejects invalid or unsupported date %s', value => {
    expect(validateDetail('collectionDate', value)).toEqual(expect.any(String));
  });

  it('accepts INSDC geography and rejects invented locations', () => {
    expect(validateDetail('location', 'Saudi Arabia:Riyadh')).toBeNull();
    expect(validateDetail('location', 'Atlantic Ocean:Charlie Gibbs Fracture Zone')).toBeNull();
    expect(validateDetail('location', 'Atlantis')).toEqual(expect.any(String));
  });

  it.each(['organism', 'host', 'location', 'collectionDate'] as DetailKey[])('accepts missing terms and empty deletion for %s', key => {
    for (const value of ['', 'missing', 'not applicable', 'not collected', 'not provided', 'restricted access', 'missing: control sample', 'missing: human-identifiable']) {
      expect(validateDetail(key, value)).toBeNull();
    }
    expect(validateDetail(key, 'bad\nvalue')).toEqual(expect.any(String));
  });

  it('accepts non-empty organism and host text', () => {
    expect(validateDetail('organism', 'MERS-CoV')).toBeNull();
    expect(validateDetail('host', 'Camelus dromedarius')).toBeNull();
    expect(validateDetail('host', '   ')).toEqual(expect.any(String));
  });
});

it('appends new source details without shifting existing annotation indices', () => {
  const a = { type: 'gene', name: 'a', start: 0, end: 2, strand: 1 as const };
  const b = { ...a, name: 'b' };
  const next = writeDetails(record({ features: [a, b] }), { host: 'camel' });
  expect(next.features[0]).toBe(a); expect(next.features[1]).toBe(b);
  expect(next.features[2].type).toBe('source');
  expect(readDetails(next)).toEqual({ host: 'camel' });
});
