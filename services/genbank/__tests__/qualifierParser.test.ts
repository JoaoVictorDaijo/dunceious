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
import { parseQualifiers } from '../qualifierParser';

/**
 * Build an array that mimics a GenBank record's line array by prepending
 * filler lines so that fromIdx=0 refers to the first qualifier line.
 */
function makeLines(qualLines: string[]): string[] {
  // Prefix with a dummy feature line at index -1
  // We'll pass fromIdx = 0 pointing straight at qualLines
  return qualLines;
}

describe('parseQualifiers', () => {
  const INDENT = ' '.repeat(21);

  it('parses a simple /key="value" qualifier', () => {
    const lines = makeLines([`${INDENT}/gene="testGene"`]);
    const { qualifiers } = parseQualifiers(lines, 0);
    expect(qualifiers['gene']).toBe('testGene');
  });

  it('strips surrounding double-quotes from values', () => {
    const lines = makeLines([`${INDENT}/product="test protein"`]);
    const { qualifiers } = parseQualifiers(lines, 0);
    expect(qualifiers['product']).toBe('test protein');
  });

  it('stores flag qualifiers (no "=") as an empty string', () => {
    const lines = makeLines([`${INDENT}/pseudo`]);
    const { qualifiers } = parseQualifiers(lines, 0);
    expect(qualifiers).toHaveProperty('pseudo');
    expect(qualifiers['pseudo']).toBe('');
  });

  it('parses multiple qualifiers', () => {
    const lines = makeLines([
      `${INDENT}/gene="AXL2"`,
      `${INDENT}/product="Axl2p"`,
      `${INDENT}/note="membrane-anchored"`,
    ]);
    const { qualifiers } = parseQualifiers(lines, 0);
    expect(qualifiers['gene']).toBe('AXL2');
    expect(qualifiers['product']).toBe('Axl2p');
    expect(qualifiers['note']).toBe('membrane-anchored');
  });

  it('joins multi-line /translation without whitespace', () => {
    const lines = makeLines([
      `${INDENT}/translation="MTQLQISLLL`,
      `${INDENT}TKDLCQIAVI`,
      `${INDENT}HKQEKF"`,
    ]);
    const { qualifiers } = parseQualifiers(lines, 0);
    expect(qualifiers['translation']).toBe('MTQLQISLLLTKDLCQIAVIHKQEKF');
  });

  it('stops at a non-indented line', () => {
    const lines = makeLines([
      `${INDENT}/gene="geneA"`,
      '     CDS             10..20',
    ]);
    const { qualifiers, lastIdx } = parseQualifiers(lines, 0);
    expect(qualifiers['gene']).toBe('geneA');
    // lastIdx should point to the last consumed qualifier line (index 0)
    expect(lastIdx).toBe(0);
  });

  it('returns empty qualifiers for empty input', () => {
    const { qualifiers } = parseQualifiers([], 0);
    expect(Object.keys(qualifiers)).toHaveLength(0);
  });

  it('ignores continuation lines that are not qualifier starts', () => {
    // A continuation of a previous value that happens to not start with /
    const lines = makeLines([
      `${INDENT}/note="this is a long`,
      `${INDENT}note that wraps"`,
    ]);
    const { qualifiers } = parseQualifiers(lines, 0);
    expect(qualifiers['note']).toContain('this is a long');
    expect(qualifiers['note']).toContain('note that wraps');
  });
});
