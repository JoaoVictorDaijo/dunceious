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

import { describe, expect, it } from 'vitest';
import { cigarSpans, expandCigar, formatCigar, parseCigar } from '../cigar';

describe('SAM extended CIGAR', () => {
  it('counts query and reference consumption independently', () => {
    expect(cigarSpans('11=1X12=1I13=1X11=1D14=')).toEqual({ query: 64, record: 64 });
    expect(cigarSpans('3S5=2S')).toEqual({ query: 10, record: 5 });
    expect(cigarSpans('2I3D')).toEqual({ query: 2, record: 3 });
  });
  it('run-length encodes columns', () => {
    expect(formatCigar(['=', '=', 'X', 'I', 'D', '=', '='])).toBe('2=1X1I1D2=');
    expect(formatCigar([])).toBe('');
  });
  it.each(['', '5', '0=', '3Q', '2=3=', '=','-1X', '1=foo', '1.5X', '9007199254740992='])(
    'rejects malformed CIGAR %j', cigar => expect(() => parseCigar(cigar)).toThrow(Error),
  );
  it.each(['2=1X1I1D2=', '3S5=2S', '1D', '7I'])(
    'round trips canonical CIGAR %s', cigar => {
      expect(formatCigar(expandCigar(cigar))).toBe(cigar);
    },
  );
  it('parses operation runs', () => {
    expect(parseCigar('2=1X')).toEqual([{ op: '=', length: 2 }, { op: 'X', length: 1 }]);
    expect(expandCigar('2S1=')).toEqual(['S', 'S', '=']);
  });
});
