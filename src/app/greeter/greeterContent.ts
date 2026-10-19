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

// Everything genomic here is real NC_001604.1 data (examples/nucleotide/t7-phages/phage-t7-NC_001604.gb),
// so the greeter never shows a number the workbench would contradict.

export const REPO_URL = 'https://github.com/JoaoVictorDaijo/dunceious';
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
/** The production address (index.html's canonical URL), to type on a computer later. */
export const SITE_HOST = 'dunceious.pages.dev';

export const GENOME_LENGTH = 39_937;

export interface Gene {
  /** T7 gene number, as in Dunn & Studier's map; drawn as "Gene <name>". */
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

// Every CDS of NC_001604.1 that no other CDS contains, with its /product. A
// nested CDS (0.6A, 4.1, 4B, 5.5, 5.7, 10A, 18.7, 19.2, 19.3) is left out so
// each position names one gene. RefSeq gives no /gene qualifiers, so the gene
// numbers come from the /note of each CDS in V01146.1, Dunn & Studier's
// submission of the same sequence with the same coordinates.
// Three joins are programmed frameshifts: 0.6B skips base 1,795 (+1), and
// 5.5-5.7 and 10B read bases 17,147 and 23,989 twice (−1).
export const GENES: readonly Gene[] = [
  gene('0.3', 'ocr-like anti-restriction', [925, 1_278]),
  gene('0.4', 'hypothetical protein', [1_278, 1_433]),
  gene('0.5', 'hypothetical protein', [1_496, 1_639]),
  gene('0.6B', 'hypothetical protein', [1_636, 1_794], [1_796, 1_972]),
  gene('0.7', 'serine-threonine kinase', [2_021, 3_100]),
  gene('1', 'RNA polymerase', [3_171, 5_822]),
  gene('1.1', 'hypothetical protein', [6_007, 6_135]),
  gene('1.2', 'dGTPase inhibitor; target for F exclusion', [6_137, 6_394]),
  gene('1.3', 'DNA ligase', [6_475, 7_554]),
  gene('1.4', 'hypothetical protein', [7_608, 7_763]),
  gene('1.5', 'hypothetical protein', [7_791, 7_880]),
  gene('1.6', 'hypothetical protein', [7_906, 8_166]),
  gene('1.7', 'nucleotide kinase', [8_166, 8_756]),
  gene('1.8', 'hypothetical protein', [8_749, 8_895]),
  gene('2', 'RNA polymerase inhibitor', [8_898, 9_092]),
  gene('2.5', 'Gp2.5-like ssDNA binding protein and ssDNA annealing protein', [9_158, 9_856]),
  gene('2.8', 'endonuclease', [9_857, 10_276]),
  gene('3', 'endonuclease', [10_257, 10_706]),
  gene('3.5', 'amidase', [10_706, 11_161]),
  gene('3.8', 'HNH endonuclease', [11_225, 11_590]),
  gene('4A', 'DNA primase/helicase', [11_565, 13_265]),
  gene('4.2', 'hypothetical protein', [12_988, 13_326]),
  gene('4.3', 'hypothetical protein', [13_352, 13_564]),
  gene('4.5', 'hypothetical protein', [13_584, 13_853]),
  gene('4.7', 'hypothetical protein', [13_927, 14_334]),
  gene('5', 'DNA polymerase I', [14_353, 16_467]),
  gene('5.3', 'hypothetical protein', [16_483, 16_839]),
  gene('5.5-5.7', 'hypothetical protein', [16_851, 17_147], [17_147, 17_359]),
  gene('5.9', 'Gp5.9-like inihibitor of recBCD nuclease', [17_359, 17_517]),
  gene('6', 'exonuclease', [17_504, 18_406]),
  gene('6.3', 'DUF5516 domain-containing protein', [18_394, 18_507]),
  gene('6.5', 'DUF2717 domain-containing protein', [18_605, 18_859]),
  gene('6.7', 'DUF5476 family protein', [18_864, 19_130]),
  gene('7', 'host range and adsorption protein', [19_130, 19_531]),
  gene('7.3', 'host range and adsorption protein', [19_535, 19_834]),
  gene('7.7', 'HNH endonuclease', [19_848, 20_240]),
  gene('8', 'head-tail adaptor', [20_240, 21_850]),
  gene('9', 'head assembly', [21_950, 22_873]),
  gene('10B', 'major head protein', [22_967, 23_989], [23_989, 24_162]),
  gene('11', 'tail protein', [24_228, 24_818]),
  gene('12', 'tail protein', [24_842, 27_226]),
  gene('13', 'internal virion protein', [27_307, 27_723]),
  gene('14', 'internal virion protein', [27_728, 28_318]),
  gene('15', 'internal virion protein', [28_325, 30_568]),
  gene('16', 'internal virion protein with endolysin domain', [30_595, 34_551]),
  gene('17', 'tail fiber protein', [34_624, 36_285]),
  gene('17.5', 'holin', [36_344, 36_547]),
  gene('18', 'terminase small subunit', [36_553, 36_822]),
  gene('18.5', 'Rz-like spanin', [36_917, 37_348]),
  gene('19', 'terminase large subunit', [37_370, 39_130]),
  gene('19.5', 'hypothetical protein', [39_389, 39_538]),
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

/** The first 24 bases of gene 1, the T7 RNA polymerase (from 3,171), and the residues they encode. */
export const GENE1_START = 'ATGAACACGATTAACATCGCTAAG';
export const GENE1_RESIDUES = 'MNTINIAK';

/**
 * The φ10 promoter through its transcription start, and every exact hit on the
 * forward strand. Each hit's last base is the +1 of an annotated T7 promoter:
 * φ1.1B, φ6.5, φ9, φ10, φ13, φ17 and φOR.
 */
export const PROMOTER_MOTIF = 'TAATACGACTCACTATAG';
export const PROMOTER_HITS = [5_906, 18_528, 21_848, 22_887, 27_257, 34_549, 39_212] as const;

/** Base 23,989, read twice by the −1 frameshift that makes gp10B; the hero opens here. */
export const FRAMESHIFT_POSITION = 23_989;

/** The gene 10 promoter (φ10) as each genome annotates it, 23 bases each. */
export const PHI10_PROMOTERS = [
  { phage: 'T7', start: 22_887, sequence: 'TAATACGACTCACTATAGGGAGA' },
  { phage: '13a', start: 21_352, sequence: 'TAATACGACTCACTATAGGGAGA' },
  { phage: 'T3', start: 20_733, sequence: 'AATTAACCCTCACTAAAGGGAGA' },
] as const;

/** Deterministic noise so decorative strips render the same on every visit. */
export function seededNoise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49_297) % 233_280;
    return s / 233_280;
  };
}
