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

import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import oracle from '../../../../docs/standards/conformance/result-genbank-biopython-1.88.json';
import { parseGenBank, parseLocation } from '../index';
import { extractFeatureSequence } from '@/src/domain/bio/sequence';

for (const [path, expected] of Object.entries(oracle)) it(`matches Biopython 1.88: ${path}`, () => {
  const raw = readFileSync(path, 'utf8');
  const result = parseGenBank(raw);
  // order() Site features are read since #306 (LOC-2), so these examples load without refusals.
  expect(result.findings.filter(f => f.tier === 'refuse')).toEqual([]);
  const independentlyRead = [...raw.matchAll(/^LOCUS\s+(\S+)\s+(\d+)\s+(bp|aa)\b/gm)];
  expect(result.records).toHaveLength(independentlyRead.length);
  expect(result.records.map(r => [r.id, r.sequence.length, r.moleculeType === 'protein' ? 'aa' : 'bp'])).toEqual(independentlyRead.map(m => [m[1], Number(m[2]), m[3]]));
  for (const [index, r] of result.records.entries()) {
    expect(r.sequence).toBe(expected[index].sequence);
    expect(r.features).toHaveLength(expected[index].features.length);
    for (const [i, f] of r.features.entries()) {
      const parts = f.segments!.map(p => ({ start: p.start, end: p.end, strand: p.strand ?? f.strand }));
      if (f.strand === -1 && !f.segments!.some(p => p.strand !== undefined)) parts.reverse();
      expect({ key: f.type, parts }).toEqual({ key: expected[index].features[i].key, parts: expected[index].features[i].parts.map(p => ({ ...p, strand: p.strand ?? 1 })) });
      const actual = extractFeatureSequence(f, r.sequence, r.moleculeType ?? 'dna').featureSeq.toUpperCase();
      const normalise = (s: string) => r.moleculeType === 'rna' ? s.replace(/U/g, 'T') : s;
      expect(normalise(actual)).toBe(normalise(expected[index].features[i].extracted));
    }
  }
});

it('matches the independent INSDC oracle for J4, J5 and W2', () => {
  const sequence = readFileSync('docs/standards/conformance/fixture.seq', 'utf8');
  const expected = Object.fromEntries(readFileSync('docs/standards/conformance/expected-oracle.txt', 'utf8').trim().split('\n').map(l => l.split('\t')));
  for (const [id, location] of [['J4', 'complement(join(complement(1..2),5..6))'], ['J5', 'complement(join(complement(1..2),complement(5..6)))'], ['W2', 'complement(join(complement(115..120),1..5))']]) {
    expect(extractFeatureSequence(parseLocation(location), sequence).featureSeq).toBe(expected[id]);
  }
});

it('matches the independent RNA minus-strand oracle without substituting DNA output', () => {
  const expected = readFileSync('docs/standards/conformance/expected-oracle.txt', 'utf8').split('\n').find(l => l.startsWith('RNA1\t'))!.split('\t')[1];
  expect(extractFeatureSequence(parseLocation('complement(1..4)'), 'ACGU', 'rna').featureSeq).toBe(expected);
});
