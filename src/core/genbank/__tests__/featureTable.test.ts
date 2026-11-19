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
import { it, expect } from 'vitest';
import { FEATURE_TABLE } from '@/src/domain/bio/insdcFeatureTable';
import proteinExpected from './proteinTable.expected.json';
import expected from './featureTable.expected.json';
import { parseGenBank, exportToGenBank } from '../index';

it('matches the independently transcribed Appendix II table from independent-source tables', () => {
  // Independent-source transcriptions; a full hand-curated table review remains pending.
  expect(FEATURE_TABLE.nucleotide).toEqual(expected);
  expect(FEATURE_TABLE.protein).toEqual(proteinExpected);

});
it('matches curated toolkit protein subtype rules and flat-file precedence', () => {
  expect(FEATURE_TABLE.protein.source.mandatory).toEqual([]);
  expect(FEATURE_TABLE.protein.CDS.optional).toContain('coded_by');
  expect(FEATURE_TABLE.protein.Protein.optional).toContain('calculated_mol_wt');
  expect(FEATURE_TABLE.protein.Region.optional).not.toContain('calculated_mol_wt');
  expect(FEATURE_TABLE.flatFileOnly).toContain('peptide');
  expect(FEATURE_TABLE.flatFileOnly).not.toContain('coded_by');
  const raw = readFileSync('examples/peptide/pomc-orthologs/human-pomc-NP_000930.gb', 'utf8');
  const parsed = parseGenBank(raw);
  expect(parsed.findings.filter(f => f.code !== 'repeated-qualifier')).toEqual([]);
  expect(exportToGenBank(parsed.records).text).toContain('/coded_by=');
});
