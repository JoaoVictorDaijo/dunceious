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
import { parseHeader } from '../headerParser';

describe('parseHeader – LOCUS line', () => {
  it('extracts the locus id', () => {
    const lines = ['LOCUS       TEST001   30 bp    DNA'];
    const h = parseHeader(lines);
    expect(h.id).toBe('TEST001');
  });

  it('detects circular flag', () => {
    const lines = ['LOCUS       CIRC001   30 bp    DNA    circular'];
    expect(parseHeader(lines).isCircular).toBe(true);
  });

  it('detects linear (no circular keyword)', () => {
    const lines = ['LOCUS       LIN001    30 bp    DNA'];
    expect(parseHeader(lines).isCircular).toBe(false);
  });

  it('is case-insensitive for circular detection', () => {
    const lines = ['LOCUS       X   10 bp    DNA   CIRCULAR'];
    expect(parseHeader(lines).isCircular).toBe(true);
  });

  it('defaults id to "Unknown" when no LOCUS line', () => {
    expect(parseHeader([]).id).toBe('Unknown');
  });
});

describe('parseHeader – DEFINITION', () => {
  it('parses a single-line DEFINITION', () => {
    const lines = [
      'LOCUS       T1   10 bp',
      'DEFINITION  Simple test definition.',
    ];
    const h = parseHeader(lines);
    expect(h.definition).toBe('Simple test definition.');
  });

  it('joins multi-line DEFINITION with spaces', () => {
    const lines = [
      'LOCUS       T1   10 bp',
      'DEFINITION  Saccharomyces cerevisiae TCP1-beta subunit (TCP1) gene,',
      '            partial cds; and AXL2 gene.',
    ];
    const h = parseHeader(lines);
    expect(h.definition).toContain('TCP1-beta subunit');
    expect(h.definition).toContain('AXL2');
    // Must be a single string with no extra double spaces
    expect(h.definition).not.toContain('  ');
  });

  it('truncates long DEFINITION to 27 chars + "..." for name', () => {
    const longDef = 'A'.repeat(50);
    const lines = [`DEFINITION  ${longDef}`];
    const h = parseHeader(lines);
    expect(h.name).toBe('A'.repeat(27) + '...');
  });

  it('uses full DEFINITION as name when <= 30 chars', () => {
    const lines = ['DEFINITION  Short def.'];
    expect(parseHeader(lines).name).toBe('Short def.');
  });
});

describe('parseHeader – SOURCE fallback', () => {
  it('uses SOURCE as name when DEFINITION is absent', () => {
    const lines = ['LOCUS T1   10 bp', 'SOURCE      Homo sapiens'];
    const h = parseHeader(lines);
    expect(h.name).toBe('Homo sapiens');
  });

  it('does not overwrite DEFINITION-derived name with SOURCE', () => {
    const lines = [
      'DEFINITION  My definition.',
      'SOURCE      Homo sapiens',
    ];
    const h = parseHeader(lines);
    expect(h.name).toBe('My definition.');
  });
});

describe('parseHeader – moleculeType', () => {
  it('defaults to "dna" for a standard bp LOCUS line', () => {
    const lines = ['LOCUS       TEST001   30 bp    DNA'];
    expect(parseHeader(lines).moleculeType).toBe('dna');
  });

  it('detects protein records when unit is "aa"', () => {
    const lines = ['LOCUS       PROT001  150 aa            linear   UNK 01-JAN-2024'];
    expect(parseHeader(lines).moleculeType).toBe('protein');
  });

  it('detects RNA records when unit is "mRNA"', () => {
    const lines = ['LOCUS       SEQ001    50 bp    mRNA'];
    expect(parseHeader(lines).moleculeType).toBe('rna');
  });

  it('is case-insensitive for RNA detection', () => {
    const lines = ['LOCUS       SEQ002    50 bp    rRNA'];
    expect(parseHeader(lines).moleculeType).toBe('rna');
  });

  it('defaults to "dna" when no LOCUS line is present', () => {
    expect(parseHeader([]).moleculeType).toBe('dna');
  });
});
