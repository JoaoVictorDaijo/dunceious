/*
 * Dunceious
 *
 * This file is part of Dunceious.
 *
 * Dunceious is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
export default defineConfig(() => {
[72 more lines]
/**
 * The vendored example files under examples/, shared by every test that reads
 * them. Paths are relative to examples/ and grouped the way the folder is: a
 * set is a sub-folder of related genomes meant to be aligned together.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { SeqRecord } from '@/src/domain/bio/types';

export const EXAMPLES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../examples');

export const EXAMPLES = {
  arabidopsisChloroplast: 'nucleotide/arabidopsis-chloroplast-NC_000932.gb',
  humanMitochondrion: 'nucleotide/human-mitochondrion-NC_012920.gb',
  influenzaPr8: 'nucleotide/influenza-a-pr8-8segments.gb',
  sarsCov2Variants: 'nucleotide/sars-cov-2-variants/variants.gb',
  orf1abPolyprotein: 'peptide/sars-cov-2-orf1ab-polyprotein-YP_009724389.gb',
  humanInsulin: 'peptide/human-insulin-NP_000198.gb',
} as const;

export const EXAMPLE_SETS = {
  coronaviruses: [
    'nucleotide/coronaviruses/sars-cov-2-NC_045512.gb',
    'nucleotide/coronaviruses/sars-cov-NC_004718.gb',
    'nucleotide/coronaviruses/mers-cov-NC_019843.gb',
  ],
  t7Phages: [
    'nucleotide/t7-phages/phage-t7-NC_001604.gb',
    'nucleotide/t7-phages/phage-13a-NC_011045.gb',
    'nucleotide/t7-phages/phage-t3-NC_003298.gb',
  ],
  t4Phages: [
    'nucleotide/t4-phages/phage-t4-NC_000866.gb',
    'nucleotide/t4-phages/phage-t6-NC_054907.gb',
    'nucleotide/t4-phages/phage-kha5h-NC_054905.gb',
  ],
  pomcOrthologs: [
    'peptide/pomc-orthologs/human-pomc-NP_000930.gb',
    'peptide/pomc-orthologs/mouse-pomc-NP_032921.gb',
    'peptide/pomc-orthologs/cow-pomc-NP_776576.gb',
  ],
} as const;

/** Throws on a missing file: a moved example must fail its tests, never skip them. */
export function loadExample(path: string): string {
  return readFileSync(resolve(EXAMPLES_DIR, path), 'utf-8');
}

export function typeHistogram(records: SeqRecord[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const r of records) for (const f of r.features) h[f.type] = (h[f.type] || 0) + 1;
  return h;
}
