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

import { expect, it } from 'vitest';
import { formatInsdcLocation } from '../insdcLocation';
const record = { length: 10, isCircular: true };
it.each([
  [{ start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 3 }, { start: 6, end: 9 }] }, 'join(1..3,7..9)'],
  [{ start: 8, end: 2, strand: 1 }, 'join(9..10,1..2)'],
  [{ start: 8, end: 5, strand: 1, segments: [{ start: 8, end: 2, strand: -1 }, { start: 3, end: 5, strand: 1 }] }, 'join(complement(1..2),complement(9..10),4..5)'],
  [{ start: 0, end: 3, strand: 1, segments: [] }, '1..3'],
  [{ start: 4, end: 5, strand: 1 }, '5..5'],
  [{ start: 5, end: 5, strand: -1 }, 'complement(5^6)'],
  [{ start: 10, end: 10, strand: 1 }, '10^1'],
] as const)('formats stored parts %j', (feature, text) => {
  expect(formatInsdcLocation(JSON.parse(JSON.stringify(feature)), record)).toEqual({ kind: 'insdc', text });
});
it.each([{ start: 8, end: 2 }, { start: -1, end: 3 }, { start: 0, end: 15 }, { start: 0.5, end: 3 }])('refuses invalid linear geometry %j', span => {
  expect(formatInsdcLocation({ ...span, strand: 1 }, { length: 10 })).toEqual({ kind: 'no-insdc-form', reason: 'invalid-geometry', display: `${span.start + 1}..${span.end} (invalid location)` });
});
it('refuses empty wraps and partially specified strands', () => {
  for (const feature of [
    { start: 10, end: 0, strand: 1 as const },
    { start: 0, end: 5, strand: 1 as const, segments: [{ start: 10, end: 0 }] },
    { start: 0, end: 5, strand: 1 as const, segments: [{ start: 0, end: 2 }, { start: 3, end: 5, strand: 1 as const }] },
  ]) expect(formatInsdcLocation(feature, record)).toMatchObject({ reason: 'invalid-geometry' });
});
it.each([[0, 'before base 1'], [10, 'after base 10']] as const)('names linear edge %s inside oriented joins', (start, words) => {
  expect(formatInsdcLocation({ start: 0, end: 6, strand: -1, segments: [{ start, end: start }, { start: 3, end: 6 }] }, { length: 10 }))
    .toEqual({ kind: 'no-insdc-form', reason: 'linear-edge-site', display: `complement(join(${words},4..6))` });
});
it.each([
  [1, { fivePrimePartial: true }, 'join(<9..10,1..2)'],
  [-1, { fivePrimePartial: true }, 'complement(join(9..10,1..>2))'],
  [-1, { threePrimePartial: true }, 'complement(join(<9..10,1..2))'],
] as const)('places biological partial ends %s', (strand, ends, text) => {
  expect(formatInsdcLocation({ start: 8, end: 2, strand }, record, ends)).toEqual({ kind: 'insdc', text });
});

import { readFileSync } from 'node:fs';
import { parseGenBank } from '@/src/core/genbank';
import { extractFeatureSequence } from '../sequence';
it.each([
  ['J1', 'join(1..10,21..30)', 'TGTTACCTAGCTCTCTATGG'],
  ['J2', 'complement(join(1..10,21..30))', 'CCATAGAGAGCTAGGTAACA'],
  ['J3', 'join(complement(21..30),1..10)', 'CCATAGAGAGTGTTACCTAG'],
  ['J4', 'join(complement(5..6),1..2)', 'GTTG'],
  ['J5', 'join(5..6,1..2)', 'ACTG'],
  ['W2', 'join(complement(1..5),115..120)', 'TAACAATAACG'],
  ['W1', 'join(115..120,1..5)', 'ATAACGTGTTA'],
])('matches the independent conformance oracle for %s', (name, text, bases) => {
  const [source] = parseGenBank(readFileSync('docs/standards/conformance/fixture.gb', 'utf8'));
  const feature = source.features.find(feature => feature.name === name)!;
  expect(feature).toBeDefined();
  expect(formatInsdcLocation(feature, { length: 120, isCircular: true })).toEqual({ kind: 'insdc', text });
  const [reparsed] = parseGenBank(`LOCUS       TEST 120 bp DNA circular\nFEATURES             Location/Qualifiers\n     misc_feature    ${text}\nORIGIN\n        1 ${source.sequence}\n//`);
  expect(extractFeatureSequence(reparsed.features[0], source.sequence).featureSeq.toUpperCase()).toBe(bases);
});
it('keeps arbitrary written order and places partial ends in evaluation order', () => {
  expect(formatInsdcLocation({ start: 69610, end: 1200, strand: 1, segments: [{ start: 69610, end: 70000 }, { start: 1000, end: 1200 }] }, { length: 70000 })).toEqual({ kind: 'insdc', text: 'join(69611..70000,1001..1200)' });
  expect(formatInsdcLocation({ start: 0, end: 30, strand: 1, segments: [{ start: 20, end: 30, strand: -1 }, { start: 0, end: 10, strand: 1 }] }, { length: 40 }, { fivePrimePartial: true, threePrimePartial: true })).toEqual({ kind: 'insdc', text: 'join(complement(21..>30),1..>10)' });
});
