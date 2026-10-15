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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  D614G_INDEX, D614G_POSITION, D614G_WINDOW, GENES, GENOME_LENGTH, ORF1AB_START, TRS_HITS, TRS_MOTIF,
} from '../greeterContent';
import { BASE_SPAN, codonAt, geneAt, regionName, windowAround } from '../genomeZoom';
import { SARS_COV_2 } from '../sarsCov2Sequence';

// The greeter's facts must match the reference genome the workbench ships as an example.
const genbank = readFileSync(new URL('../../../../examples/sars-cov-2-NC_045512.gb', import.meta.url), 'utf-8');
const sequence = (genbank.split('ORIGIN')[1].match(/[acgt]+/g) ?? []).join('').toUpperCase();
const at = (start: number, length: number) => sequence.slice(start - 1, start - 1 + length);

describe('greeter content', () => {
  it('matches NC_045512.2', () => {
    expect(sequence).toHaveLength(GENOME_LENGTH);
    expect(at(266, ORF1AB_START.length)).toBe(ORF1AB_START);
    expect(at(23_394, D614G_WINDOW.length)).toBe(D614G_WINDOW);
    expect(at(23_394 + D614G_INDEX, 1)).toBe('A');
    const hits = [...sequence.matchAll(new RegExp(`(?=${TRS_MOTIF})`, 'g'))].map((m) => m.index! + 1);
    expect(hits).toEqual([...TRS_HITS]);
  });

  it('lists every CDS with its GenBank span', () => {
    for (const g of GENES) {
      const span = g.name === 'ORF1ab' ? `join(${g.start}..13468,13468..${g.end})` : `${g.start}..${g.end}`;
      expect(genbank).toContain(`     CDS             ${span}`);
    }
  });

  it('ships the same sequence as the example file', () => {
    expect(SARS_COV_2).toBe(sequence);
    expect(at(D614G_POSITION - D614G_INDEX, D614G_WINDOW.length)).toBe(D614G_WINDOW);
  });
});

/** The /translation qualifier of the first CDS for `gene`, as GenBank prints it. */
function translation(gene: string): string {
  // Each split piece starts with a CDS location; its first qualifier names the gene.
  const block = genbank.split(/\n {5}CDS {13}/).slice(1).find((b) => b.split('\n')[1].trim() === `/gene="${gene}"`)!;
  return block.match(/\/translation="([^"]+)"/)![1].replace(/\s+/g, '');
}

describe('codonAt', () => {
  it('reads codons in frame, matching the GenBank translations', () => {
    const spike = translation('S');
    for (const pos of [21_563, 21_564, 22_000, D614G_POSITION, 25_381]) {
      const c = codonAt(pos)!;
      expect(c.gene.name).toBe('S');
      expect(c.residue).toBe(spike[c.number - 1]);
    }
    expect(codonAt(D614G_POSITION)).toMatchObject({ number: 614, phase: 1, residue: 'D' });
  });

  it('follows the ORF1ab frameshift into the shifted frame', () => {
    const pp1ab = translation('ORF1ab');
    for (const pos of [266, 13_460, 13_466, 13_468, 13_469, 13_471, 15_000, 21_552]) {
      const c = codonAt(pos)!;
      expect(c.residue).toBe(pp1ab[c.number - 1]);
    }
    expect(codonAt(13_469)!.positions).toEqual([13_468, 13_469, 13_470]);
  });

  it('names the stop codon and the untranslated regions', () => {
    expect(codonAt(25_384)).toMatchObject({ gene: expect.objectContaining({ name: 'S' }), residue: '*' });
    expect(codonAt(100)).toBeUndefined();
    expect(regionName(100)).toBe('5′ untranslated region');
    expect(regionName(21_558)).toBe('Between genes');
    expect(regionName(29_800)).toBe('3′ untranslated region');
    expect(geneAt(27_757)!.name).toBe('ORF7a');
  });

  it('keeps windows inside the genome', () => {
    expect(windowAround(1, BASE_SPAN)).toEqual([1, BASE_SPAN]);
    expect(windowAround(GENOME_LENGTH, BASE_SPAN)).toEqual([GENOME_LENGTH - BASE_SPAN + 1, GENOME_LENGTH]);
    expect(windowAround(1000, BASE_SPAN)).toEqual([990, 1010]);
  });
});
