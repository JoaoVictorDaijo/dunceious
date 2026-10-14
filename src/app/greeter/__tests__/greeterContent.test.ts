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
  D614G_INDEX, D614G_WINDOW, GENES, GENOME_LENGTH, ORF1AB_START, TRS_HITS, TRS_MOTIF, ringBand,
} from '../greeterContent';

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

  it('draws bands longer than half the genome with the large-arc flag', () => {
    expect(ringBand(266, 21_555, 120, 146)).toMatch(/^M [-\d.]+ [-\d.]+ A 146 146 0 1 1 /);
    expect(ringBand(21_563, 25_384, 120, 146)).toMatch(/^M [-\d.]+ [-\d.]+ A 146 146 0 0 1 /);
    expect(ringBand(0, 0, 120, 146)).toMatch(/^M 0\.00 -146\.00 /);
  });
});
