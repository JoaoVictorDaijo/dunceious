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

// Everything genomic here is real NC_045512.2 data (examples/sars-cov-2-NC_045512.gb),
// so the greeter never shows a number the workbench would contradict.

export const REPO_URL = 'https://github.com/JoaoVictorDaijo/dunceious';
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;

export const GENOME_LENGTH = 29_903;

export interface Gene {
  name: string;
  product: string;
  start: number;
  end: number;
}

export const GENES: readonly Gene[] = [
  { name: 'ORF1ab', product: 'ORF1ab polyprotein', start: 266, end: 21_555 },
  { name: 'S', product: 'surface glycoprotein', start: 21_563, end: 25_384 },
  { name: 'ORF3a', product: 'ORF3a protein', start: 25_393, end: 26_220 },
  { name: 'E', product: 'envelope protein', start: 26_245, end: 26_472 },
  { name: 'M', product: 'membrane glycoprotein', start: 26_523, end: 27_191 },
  { name: 'ORF6', product: 'ORF6 protein', start: 27_202, end: 27_387 },
  { name: 'ORF7a', product: 'ORF7a protein', start: 27_394, end: 27_759 },
  { name: 'ORF7b', product: 'ORF7b', start: 27_756, end: 27_887 },
  { name: 'ORF8', product: 'ORF8 protein', start: 27_894, end: 28_259 },
  { name: 'N', product: 'nucleocapsid phosphoprotein', start: 28_274, end: 29_533 },
  { name: 'ORF10', product: 'ORF10 protein', start: 29_558, end: 29_674 },
];

/** The spike gene, so the ring opens on the protein most visitors have heard of. */
export const INITIAL_GENE = 1;

export const GENE_COLORS = ['#38bdf8', '#a78bfa', '#4ade80', '#fb7185', '#facc15'] as const;
export const BASE_COLORS: Record<string, string> = { A: '#86efac', T: '#fda4af', C: '#93c5fd', G: '#fde047' };

/**
 * SVG path for a ring band between genome positions `start` and `end`, centred
 * on the origin with position 1 at twelve o'clock, running clockwise.
 */
export function ringBand(start: number, end: number, innerR: number, outerR: number, length = GENOME_LENGTH): string {
  const point = (r: number, pos: number) => {
    const a = (pos / length) * Math.PI * 2 - Math.PI / 2;
    return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  };
  const large = (end - start) / length > 0.5 ? 1 : 0;
  return `M ${point(outerR, start)} A ${outerR} ${outerR} 0 ${large} 1 ${point(outerR, end)} `
    + `L ${point(innerR, end)} A ${innerR} ${innerR} 0 ${large} 0 ${point(innerR, start)} Z`;
}

export const FEATURES = [
  { title: 'Reads your files', body: 'Multi-record GenBank (nucleotide or protein) and FASTA, plus GFF3 and BED annotations.', color: '#38bdf8' },
  { title: 'Semantic zoom', body: 'From mismatch density, to every base, to amino-acid translations over each CDS.', color: '#4ade80' },
  { title: 'Finds things', body: 'Exact search with IUPAC codes, or fuzzy Smith-Waterman on both strands.', color: '#facc15' },
  { title: 'Aligns, if you ask', body: 'Bring your own aligned FASTA, or send it to MAFFT, Kalign, Clustal Omega or MUSCLE at EMBL-EBI.', color: '#a78bfa' },
  { title: 'Exports cleanly', body: 'FASTA, GFF3, GenBank or the whole workspace as a project file.', color: '#fb7185' },
] as const;

export const TOUR_STEPS = [
  { title: 'Drop a file. That’s the setup.', body: 'No account, no install, no server. Dunceious opens GenBank and FASTA right in the browser tab.' },
  { title: 'Zoom from genome to codon.', body: 'One viewer, three levels: where sequences differ, every base, and the protein each CDS encodes.' },
  { title: 'Search like you think.', body: 'Type a motif with IUPAC codes, or let Smith-Waterman find near matches. Turn any hit into an annotation.' },
  { title: 'Compare sequences.', body: 'Load an alignment, or ask EMBL-EBI to run MAFFT for you, and see every difference at a glance.' },
] as const;

/** The first 24 bases of ORF1ab (from 266) and the residues they encode. */
export const ORF1AB_START = 'ATGGAGAGCCTTGTCCCTGGTTTC';
export const ORF1AB_RESIDUES = 'MESLVPGF';

/** The leader TRS core, and every exact hit on the forward strand. */
export const TRS_MOTIF = 'ACGAAC';
export const TRS_HITS = [70, 21_556, 25_385, 26_237, 26_473, 27_041, 27_388, 27_888, 28_260] as const;

/** 23,394–23,413 of the reference; index 9 is A23403, the middle base of spike codon 614. */
export const D614G_WINDOW = 'TTTATCAGGATGTTAACTGC';
export const D614G_INDEX = 9;
/** Lineages that all carry 23403G. */
export const D614G_LINEAGES = ['Alpha', 'Delta', 'BA.1', 'BA.2'] as const;

/** Deterministic noise so decorative strips render the same on every visit. */
export function seededNoise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49_297) % 233_280;
    return s / 233_280;
  };
}
