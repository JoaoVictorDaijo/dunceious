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
  FRAMESHIFT_POSITION, GENE1_RESIDUES, GENE1_START, GENES, GENOME_LENGTH, PHI10_PROMOTERS, PROMOTER_HITS, PROMOTER_MOTIF,
} from '../greeterContent';
import { BASE_SPAN, codonAt, geneAt, regionName, windowAround } from '../genomeZoom';
import { T7_GENOME } from '../t7Sequence';

// The greeter's facts must match the genomes the workbench ships as examples.
const read = (file: string) => readFileSync(new URL(`../../../../examples/nucleotide/t7-phages/${file}`, import.meta.url), 'utf-8');
const genbank = read('phage-t7-NC_001604.gb');
const sequenceOf = (record: string) => (record.split('ORIGIN')[1].match(/[acgt]+/g) ?? []).join('').toUpperCase();
const sequence = sequenceOf(genbank);
const at = (start: number, length: number) => sequence.slice(start - 1, start - 1 + length);

interface Feature { type: string; location: string; qualifiers: Record<string, string> }

/** Every feature of a GenBank record, read straight from the flat file rather than through the app's parser. */
function features(record: string): Feature[] {
  const table = record.split('\nFEATURES')[1].split('\nORIGIN')[0];
  return table.split(/\n {5}(?=\S)/).slice(1).map((block) => {
    const [type, ...rest] = block.split(/\s+/);
    const flat = rest.join(' ').replace(/\s+/g, ' ');
    const qualifiers = Object.fromEntries([...flat.matchAll(/\/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    return { type, location: block.split('\n')[0].slice(type.length).trim(), qualifiers };
  });
}

const cds = features(genbank).filter((f) => f.type === 'CDS');
const spansOf = (location: string) => [...location.matchAll(/(\d+)\.\.(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
const locationOf = (g: (typeof GENES)[number]) =>
  g.segments.length > 1 ? `join(${g.segments.map(([s, e]) => `${s}..${e}`).join(',')})` : `${g.start}..${g.end}`;
const translationOf = (g: (typeof GENES)[number]) => cds.find((f) => f.location === locationOf(g))!.qualifiers.translation.replace(/\s+/g, '');
const named = (name: string) => GENES.find((g) => g.name === name)!;

describe('greeter content', () => {
  it('ships the same sequence as the example file', () => {
    expect(sequence).toHaveLength(GENOME_LENGTH);
    expect(T7_GENOME).toBe(sequence);
  });

  it('lists exactly the CDS no other CDS contains, each with its GenBank span and product', () => {
    const outermost = cds.filter((f, i) => {
      const [[start], last] = [spansOf(f.location)[0], spansOf(f.location).at(-1)!];
      return !cds.some((other, j) => {
        const spans = spansOf(other.location);
        const [os, oe] = [spans[0][0], spans.at(-1)![1]];
        return j !== i && os <= start && last[1] <= oe && (os !== start || oe !== last[1] || j < i);
      });
    });
    expect(GENES.map(locationOf)).toEqual(outermost.map((f) => f.location));
    for (const [i, g] of GENES.entries()) expect(g.product, g.name).toBe(outermost[i].qualifiers.product);
  });

  it('names genes as the RefSeq notes do wherever a note states the gene number', () => {
    let checked = 0;
    for (const g of GENES) {
      const stated = cds.find((f) => f.location === locationOf(g))!.qualifiers.note?.match(/^(?:possible )?gene ([0-9.]+[A-Z]?(?:-[0-9.]+)?)\b/);
      if (!stated) continue;
      expect(g.name).toBe(stated[1]);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('starts gene 1 with the RNA polymerase codons it shows', () => {
    expect(named('1').start).toBe(3_171);
    expect(at(3_171, GENE1_START.length)).toBe(GENE1_START);
    expect(translationOf(named('1')).startsWith(GENE1_RESIDUES)).toBe(true);
  });

  it('finds every exact promoter hit, each ending on an annotated T7 promoter', () => {
    const hits = [...sequence.matchAll(new RegExp(`(?=${PROMOTER_MOTIF})`, 'g'))].map((m) => m.index! + 1);
    expect(hits).toEqual([...PROMOTER_HITS]);
    const promoters = new Map(features(genbank).filter((f) => f.type === 'regulatory').map((f) => [f.location, f.qualifiers.note]));
    for (const hit of hits) expect(promoters.get(String(hit + PROMOTER_MOTIF.length - 1)), String(hit)).toMatch(/^T7 promoter phi/);
  });

  it('shows each phage its own annotated gene 10 promoter', () => {
    const [t7, phage13a, t3] = PHI10_PROMOTERS;
    expect(at(t7.start, t7.sequence.length)).toBe(t7.sequence);
    expect(features(genbank).find((f) => f.location === String(t7.start + 17))!.qualifiers.note).toBe('T7 promoter phi10');
    for (const [{ start, sequence: shown }, file, note] of [
      [phage13a, 'phage-13a-NC_011045.gb', 'phi10'],
      [t3, 'phage-t3-NC_003298.gb', 'T3 promoter phi10'],
    ] as const) {
      const record = read(file);
      const span = `${start}..${start + shown.length - 1}`;
      expect(features(record).find((f) => f.type === 'regulatory' && f.location === span)!.qualifiers.note).toBe(note);
      expect(sequenceOf(record).slice(start - 1, start - 1 + shown.length)).toBe(shown);
    }
  });
});

describe('codonAt', () => {
  it('reads codons in frame, matching the GenBank translations', () => {
    const polymerase = translationOf(named('1'));
    for (const pos of [3_171, 3_172, 4_000, 5_000, 5_819]) {
      const c = codonAt(pos)!;
      expect(c.gene.name).toBe('1');
      expect(c.residue).toBe(polymerase[c.number - 1]);
    }
  });

  it('follows the −1 gene 10 frameshift into the shifted frame', () => {
    const gp10b = translationOf(named('10B'));
    for (const pos of [22_967, 23_980, 23_987, FRAMESHIFT_POSITION, 23_990, 23_992, 24_100, 24_159]) {
      const c = codonAt(pos)!;
      expect(c.gene.name).toBe('10B');
      expect(c.residue, String(pos)).toBe(gp10b[c.number - 1]);
    }
    expect(codonAt(FRAMESHIFT_POSITION + 1)!.positions).toEqual([FRAMESHIFT_POSITION, FRAMESHIFT_POSITION + 1, FRAMESHIFT_POSITION + 2]);
  });

  it('steps over the base the +1 gene 0.6B frameshift skips', () => {
    const gp06b = translationOf(named('0.6B'));
    expect(codonAt(1_795)).toBeUndefined();
    expect(regionName(1_795)).toBe('Skipped by the +1 frameshift in gene 0.6B');
    // 1,636–1,639 also belong to gene 0.5, which is listed first, so start past it.
    for (const pos of [1_640, 1_794, 1_796, 1_969]) {
      const c = codonAt(pos)!;
      expect(c.gene.name).toBe('0.6B');
      expect(c.residue, String(pos)).toBe(gp06b[c.number - 1]);
    }
  });

  it('shows an alternative start codon as its literal residue', () => {
    // Gene 19 starts on GTG: GenBank's /translation writes the initiator as M.
    expect(at(37_370, 3)).toBe('GTG');
    expect(translationOf(named('19'))[0]).toBe('M');
    expect(codonAt(37_370)).toMatchObject({ number: 1, residue: 'V' });
  });

  it('names the stop codon and the regions between and around the genes', () => {
    expect(codonAt(5_822)).toMatchObject({ gene: expect.objectContaining({ name: '1' }), residue: '*' });
    expect(codonAt(100)).toBeUndefined();
    expect(regionName(100)).toBe('Left end of the genome');
    expect(regionName(3_120)).toBe('Between genes');
    expect(regionName(39_800)).toBe('Right end of the genome');
    expect(geneAt(1_278)!.name).toBe('0.3');
  });

  it('keeps windows inside the genome', () => {
    expect(windowAround(1, BASE_SPAN)).toEqual([1, BASE_SPAN]);
    expect(windowAround(GENOME_LENGTH, BASE_SPAN)).toEqual([GENOME_LENGTH - BASE_SPAN + 1, GENOME_LENGTH]);
    expect(windowAround(1000, BASE_SPAN)).toEqual([990, 1010]);
  });
});
