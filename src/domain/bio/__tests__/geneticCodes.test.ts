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
import { parseLocation } from '@/src/core/genbank/locationParser';
import { describe, it, expect } from 'vitest';
import { detectEarlyStop, extractCodingSequence, featureTranslTable, isNcbiGeneticCode, translateFeature, translateSequence } from '@/src/domain/bio/sequence';

// Independent oracle: Biopython's NCBI codon tables, not Dunceious's own data.
const oracle = JSON.parse(
  readFileSync(new URL('./fixtures/ncbi-genetic-codes.biopython.json', import.meta.url), 'utf8'),
) as { tables: Record<string, { name: string; codons: Record<string, string> }> };

const ids = Object.keys(oracle.tables).map(Number);

describe('NCBI genetic codes', () => {
  it('accepts the NCBI table ids and rejects unavailable or non-integral ids', () => {
    for (const id of ids) expect(isNcbiGeneticCode(id)).toBe(true);
    for (const id of [-1, 0, 7, 8, 17, 18, 19, 20, 34, 1.5, NaN, Infinity]) expect(isNcbiGeneticCode(id)).toBe(false);
  });

  it.each(ids)('translates every codon of table %i like the NCBI table', id => {
    for (const [codon, residue] of Object.entries(oracle.tables[id].codons)) {
      expect(translateSequence(codon, id), `table ${id} ${codon}`).toBe(residue);
      expect(translateSequence(codon.toLowerCase().replace(/t/g, 'u'), id), `table ${id} lowercase RNA ${codon}`).toBe(residue);
    }
  });

  it('reads ciliate TAA/TAG as glutamine, not stops (table 6)', () => {
    expect(translateSequence('ATGTAATAGTGA', 6)).toBe('MQQ_');
    expect(detectEarlyStop('ATGTAATAGTGA', 6)).toBe(false);
  });

  it('claims no residue and no stop under an id that is not an NCBI code', () => {
    expect(translateSequence('ATGTAA', 7)).toBe('??');
    expect(translateSequence('ATGTAA', NaN)).toBe('??');
    expect(detectEarlyStop('TAATAATAA', 7)).toBe(false);
  });
});

describe('featureTranslTable', () => {
  it('defaults to the standard code when the qualifier is absent', () => {
    expect(featureTranslTable({})).toBe(1);
    expect(featureTranslTable({ metadata: {} })).toBe(1);
  });
  it('reads the integer value', () => {
    expect(featureTranslTable({ metadata: { transl_table: '11' } })).toBe(11);
    expect(featureTranslTable({ metadata: { transl_table: ' 4 ' } })).toBe(4);
    expect(featureTranslTable({ metadata: { transl_table: 6 } })).toBe(6);
  });
  it('keeps an invalid value invalid instead of falling back to table 1', () => {
    for (const value of ['abc', '', '  ', '11a', '1.5', '-1', '0xB', '1e1']) {
      const table = featureTranslTable({ metadata: { transl_table: value } });
      expect(table, value).toBeNaN();
      expect(translateSequence('ATGTAA', table), value).toBe('??');
    }
    expect(featureTranslTable({ metadata: { transl_table: '7' } })).toBe(7);
    expect(isNcbiGeneticCode(featureTranslTable({ metadata: { transl_table: '7' } }))).toBe(false);
  });
});

// Oracle: Biopython 1.88 Seq.translate(table, cds=True) ends a complete CDS at a codon that can
// terminate, e.g. table 27 ATGAAATGA -> "MK" (plain translate gives "MKW").
describe('translateFeature at the end of a complete CDS', () => {
  it.each([
    [27, 'ATGAAATGA', 'MK_'],
    [28, 'ATGAAATAA', 'MK_'],
    [28, 'ATGAAATAG', 'MK_'],
    [28, 'ATGAAATGA', 'MK_'],
    [31, 'ATGAAATAA', 'MK_'],
    [31, 'ATGAAATAG', 'MK_'],
    [1, 'ATGAAATAA', 'MK_'],
  ])('reads the last codon of a complete table-%i CDS as the stop', (table, seq, protein) => {
    expect(translateFeature({}, seq, table)).toBe(protein);
    expect(translateFeature({ metadata: { translation: 'MK' } }, seq, table)).toBe(protein);
  });

  it('keeps internal dual-coding codons as residues', () => {
    expect(translateFeature({}, 'ATGTGAAAATGA', 27)).toBe('MWK_');
  });

  it.each(['1..>9', 'complement(<1..9)'])('preserves the sense residue at a 3′-partial CDS end: %s', location => {
    const { strand, segments } = parseLocation(location);
    expect(translateFeature({ strand, segments }, 'ATGAAATGA', 27)).toBe('MKW');
  });

  // Oracle: the NCBI validator's translation, which marks the terminal stop only when the 3′ end
  // is complete, whatever the 5′ end.
  const validator: { cases: {
    id: string; sequence: string; location: string;
    segments: { start: number; end: number; strand: 1 | -1 }[]; validatorStopResidues: number[];
  }[] } = JSON.parse(readFileSync(new URL('./fixtures/ncbi-validator-terminal-stop.json', import.meta.url), 'utf8'));
  // The 3′ end is read from the parsed per-end flags, not the location text, so the validator's
  // verdict holds after an edit or a selection export has cleared that text (#226).
  it.each(validator.cases)('matches the NCBI validator terminal stop: $id ($location)', ({ sequence, location, segments, validatorStopResidues }) => {
    const parsed = parseLocation(location);
    const pinned = { start: 0, end: sequence.length, strand: segments[0].strand, segments };
    expect(extractCodingSequence(parsed, sequence).codingSeq).toBe(extractCodingSequence(pinned, sequence).codingSeq);
    const feature = { start: parsed.start, end: parsed.end, strand: parsed.strand, segments: parsed.segments };
    const protein = translateFeature(feature, extractCodingSequence(feature, sequence).codingSeq, 27);
    const stops = [...protein].flatMap((residue, i) => residue === '_' ? [i + 1] : []);
    expect(stops).toEqual(validatorStopResidues);
  });

  // The final three bases spell TGA out of frame and cannot terminate the last full codon.
  it.each([
    ['ATGAAATGAATGA', 'MKWM'],
    ['ATGAAATGAAATGA', 'MKWN'],
  ])('does not terminate a CDS with an incomplete final codon: %s', (seq, protein) => {
    expect(translateFeature({}, seq, 27)).toBe(protein);
  });

  it('recognizes a lowercase RNA terminal dual-coding codon', () => {
    expect(translateFeature({}, 'augaaauga', 27)).toBe('MK_');
  });

  it('does not turn sense or ambiguous final codons into stops', () => {
    expect(translateFeature({}, 'ATGAAA', 27)).toBe('MK');
    expect(translateFeature({}, 'ATGTGN', 27)).toBe('M?');
  });

  it('claims no terminal stop with an unknown table or empty coding sequence', () => {
    expect(translateFeature({}, 'ATGAAATGA', 7)).toBe('???');
    expect(translateFeature({}, '', 27)).toBe('');
  });

  it('keeps alternative initiation literal unless a stored translation supplies Met', () => {
    expect(translateFeature({}, 'GTGAAATAA', 11)).toBe('VK_');
    expect(translateFeature({ metadata: { translation: 'MK' } }, 'GTGAAATAA', 11)).toBe('MK_');
  });
});
