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
 * Identity passthrough: the qualifier lines are handed straight to
 * parseQualifiers with fromIdx=0, so index 0 is the first qualifier line.
 */
function makeLines(qualLines: string[]): string[] {
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

describe('parseQualifiers – malformed / skip branches', () => {
  const INDENT = ' '.repeat(21);

  // NOTE: a trimmed line that does not start with '/' can never match the
  // '^/'-anchored qualifier regex, so the `!startsWith('/')` guard and the
  // regex-no-match guard are two routes to the same "skip this line" outcome —
  // no input can isolate one from the other. These tests pin the observable
  // contract (line skipped, index advanced), not a specific guard.
  it('skips an indented non-"/" line and advances the index past it', () => {
    const lines = [`${INDENT}orphan text`, `${INDENT}/gene="AXL2"`];
    const { qualifiers, lastIdx } = parseQualifiers(lines, 0);
    expect(qualifiers).not.toHaveProperty('orphan');
    expect(qualifiers['gene']).toBe('AXL2');
    expect(lastIdx).toBe(1);
  });

  it('skips a "/" line that fails the /key(=value) pattern and advances the index', () => {
    // A bare "/" has no \w+ after it → regex match fails → skip branch.
    const lines = [`${INDENT}/`, `${INDENT}/gene="AXL2"`];
    const { qualifiers, lastIdx } = parseQualifiers(lines, 0);
    expect(Object.keys(qualifiers)).toEqual(['gene']);
    expect(qualifiers['gene']).toBe('AXL2');
    expect(lastIdx).toBe(1);
  });

  it('does not absorb a following non-qualifier line into a skipped "/" line', () => {
    // The malformed '/' is skipped outright; the loose line after it is not
    // swallowed as a continuation value, and the real qualifier still parses.
    const lines = [`${INDENT}/`, `${INDENT}loose continuation`, `${INDENT}/gene="AXL2"`];
    const { qualifiers } = parseQualifiers(lines, 0);
    expect(Object.keys(qualifiers)).toEqual(['gene']);
    expect(qualifiers['gene']).toBe('AXL2');
  });

  it('returns empty qualifiers and the terminal index when every line is skipped', () => {
    const lines = [`${INDENT}orphan one`, `${INDENT}orphan two`];
    const { qualifiers, lastIdx } = parseQualifiers(lines, 0);
    expect(Object.keys(qualifiers)).toHaveLength(0);
    // Both indented lines are consumed (i → 2) so lastIdx = i - 1 = 1.
    expect(lastIdx).toBe(1);
  });
});
