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

// Everything genomic here is real NC_045512.2 data (examples/nucleotide/coronaviruses/sars-cov-2-NC_045512.gb),
// so the greeter never shows a number the workbench would contradict.

export const REPO_URL = 'https://github.com/JoaoVictorDaijo/dunceious';
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
/** The production address (index.html's canonical URL), to type on a computer later. */
export const SITE_HOST = 'dunceious.pages.dev';

export const GENOME_LENGTH = 29_903;

export interface Gene {
  name: string;
  product: string;
  start: number;
  end: number;
  /** Coding segments in reading order, as in the GenBank location. */
  segments: readonly (readonly [number, number])[];
}

const gene = (name: string, product: string, ...segments: [number, number][]): Gene => ({
  name, product, start: segments[0][0], end: segments[segments.length - 1][1], segments,
});

// ORF1ab's join(266..13468,13468..21555) is the −1 ribosomal frameshift: base 13,468 is read twice.
export const GENES: readonly Gene[] = [
  gene('ORF1ab', 'ORF1ab polyprotein', [266, 13_468], [13_468, 21_555]),
  gene('S', 'surface glycoprotein', [21_563, 25_384]),
  gene('ORF3a', 'ORF3a protein', [25_393, 26_220]),
  gene('E', 'envelope protein', [26_245, 26_472]),
  gene('M', 'membrane glycoprotein', [26_523, 27_191]),
  gene('ORF6', 'ORF6 protein', [27_202, 27_387]),
  gene('ORF7a', 'ORF7a protein', [27_394, 27_759]),
  gene('ORF7b', 'ORF7b', [27_756, 27_887]),
  gene('ORF8', 'ORF8 protein', [27_894, 28_259]),
  gene('N', 'nucleocapsid phosphoprotein', [28_274, 29_533]),
  gene('ORF10', 'ORF10 protein', [29_558, 29_674]),
];

/** The workbench's nucleotide colours (src/app/viewer/colors.ts), which the greeter may not import. */
export const BASE_COLORS: Record<string, string> = { A: '#22c55e', T: '#f43f5e', C: '#3b82f6', G: '#eab308' };

export const FEATURES = [
  { title: 'Reads your files', body: 'Multi-record GenBank (nucleotide or protein) and FASTA, plus GFF3 and BED annotations.', color: '#38bdf8' },
  { title: 'Semantic zoom', body: 'From mismatch density, to every base, to amino-acid translations over each CDS.', color: '#4ade80' },
  { title: 'Finds things', body: 'Exact search with IUPAC codes, or fuzzy search by identity on both strands.', color: '#facc15' },
  { title: 'Aligns, if you ask', body: 'Bring your own aligned FASTA, or send it to MAFFT, Kalign, Clustal Omega or MUSCLE at EMBL-EBI.', color: '#a78bfa' },
  { title: 'Exports cleanly', body: 'FASTA, GFF3, GenBank or the whole workspace as a project file.', color: '#fb7185' },
] as const;

export const TOUR_STEPS = [
  { title: 'Drop a file. That’s the setup.', body: 'No account, no install, no server. Dunceious opens GenBank and FASTA right in the browser tab.' },
  { title: 'Zoom from genome to codon.', body: 'One viewer, three levels: where sequences differ, every base, and the protein each CDS encodes.' },
  { title: 'Search like you think.', body: 'Type a motif with IUPAC codes, or set a minimum identity to find near matches. Turn any hit into an annotation.' },
  { title: 'Compare sequences.', body: 'Load an alignment, or ask EMBL-EBI to run MAFFT for you, and see every difference at a glance.' },
] as const;

/** The first 24 bases of ORF1ab (from 266) and the residues they encode. */
export const ORF1AB_START = 'ATGGAGAGCCTTGTCCCTGGTTTC';
export const ORF1AB_RESIDUES = 'MESLVPGF';

/** The leader TRS core, and every exact hit on the forward strand. */
export const TRS_MOTIF = 'ACGAAC';
export const TRS_HITS = [70, 21_556, 25_385, 26_237, 26_473, 27_041, 27_388, 27_888, 28_260] as const;

/** A23403G, the middle base of spike codon 614 (D614G); the hero opens here. */
export const D614G_POSITION = 23_403;

/** 23,394–23,413 of the reference; index 9 is D614G_POSITION. */
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
