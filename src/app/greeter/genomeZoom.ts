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

import { translateSequence } from '@/src/domain/bio/sequence';
import { GENES, GENOME_LENGTH, type Gene } from './greeterContent';
import { SARS_COV_2 } from './sarsCov2Sequence';

/** Bases shown in the middle strip, one per SVG unit across the 342-unit width. */
export const REGION_SPAN = 342;
/** Bases shown as letters in the bottom strip. */
export const BASE_SPAN = 21;

export const clampPosition = (pos: number) => Math.min(GENOME_LENGTH, Math.max(1, Math.round(pos)));

/** 1-based base at a 1-based position. */
export const baseAt = (pos: number) => SARS_COV_2[pos - 1] ?? '';

/** First and last position of a window of `span` bases centred on `center`, kept inside the genome. */
export function windowAround(center: number, span: number): [number, number] {
  const start = Math.min(Math.max(1, center - Math.floor(span / 2)), GENOME_LENGTH - span + 1);
  return [start, start + span - 1];
}

export function geneAt(pos: number): Gene | undefined {
  return GENES.find((g) => g.segments.some(([s, e]) => pos >= s && pos <= e));
}

export interface Codon {
  gene: Gene;
  /** 1-based codon number in the gene's protein. */
  number: number;
  /** 0, 1 or 2: where `pos` sits inside the codon. */
  phase: number;
  /** The three genome positions read for this codon, in order. */
  positions: [number, number, number];
  residue: string;
}

/** The genome position of a 0-based offset into a gene's coding sequence. */
function positionOfOffset(gene: Gene, offset: number): number | undefined {
  let rest = offset;
  for (const [s, e] of gene.segments) {
    const length = e - s + 1;
    if (rest < length) return s + rest;
    rest -= length;
  }
  return undefined;
}

/**
 * The codon that reads `pos`. ORF1ab's −1 ribosomal frameshift reads base
 * 13,468 twice; this returns the first reading, so codons after it follow the
 * shifted frame exactly as the polyprotein does.
 */
export function codonAt(pos: number): Codon | undefined {
  const gene = geneAt(pos);
  if (!gene) return undefined;
  let offset = 0;
  for (const [s, e] of gene.segments) {
    if (pos >= s && pos <= e) {
      offset += pos - s;
      break;
    }
    offset += e - s + 1;
  }
  const phase = offset % 3;
  const first = offset - phase;
  const positions = [0, 1, 2].map((i) => positionOfOffset(gene, first + i));
  if (positions.some((p) => p === undefined)) return undefined;
  const triplet = positions.map((p) => baseAt(p!)).join('');
  return {
    gene,
    number: first / 3 + 1,
    phase,
    positions: positions as [number, number, number],
    residue: translateSequence(triplet).replace('_', '*'),
  };
}

/** Where the lens is when it is outside every gene. */
export function regionName(pos: number): string {
  if (pos < GENES[0].start) return '5′ untranslated region';
  if (pos > GENES[GENES.length - 1].end) return '3′ untranslated region';
  return 'Between genes';
}

/** Centre the lens on a gene's first codon. */
export const geneLandmark = (gene: Gene) => gene.start + 1;

export const AMINO_ACID_NAMES: Record<string, string> = {
  A: 'alanine', R: 'arginine', N: 'asparagine', D: 'aspartate', C: 'cysteine',
  Q: 'glutamine', E: 'glutamate', G: 'glycine', H: 'histidine', I: 'isoleucine',
  L: 'leucine', K: 'lysine', M: 'methionine', F: 'phenylalanine', P: 'proline',
  S: 'serine', T: 'threonine', W: 'tryptophan', Y: 'tyrosine', V: 'valine', '*': 'stop',
};
