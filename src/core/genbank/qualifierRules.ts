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

export type QualifierSyntax = 'quoted' | 'unquoted' | 'flag';

// Value syntax is part of the format contract, even for numeric-looking text.
// https://www.insdc.org/submitting-standards/feature-table/ (2026-10-13)
export const NUCLEOTIDE_QUALIFIERS: ReadonlyMap<string, QualifierSyntax> = new Map([
  ['allele', 'quoted'],
  ['altitude', 'quoted'],
  ['anticodon', 'unquoted'],
  ['artificial_location', 'quoted'],
  ['bio_material', 'quoted'],
  ['bound_moiety', 'quoted'],
  ['cell_line', 'quoted'],
  ['cell_type', 'quoted'],
  ['chromosome', 'quoted'],
  ['circular_RNA', 'flag'],
  ['citation', 'unquoted'],
  ['clone', 'quoted'],
  ['clone_lib', 'quoted'],
  ['codon_start', 'unquoted'],
  ['collected_by', 'quoted'],
  ['collection_date', 'quoted'],
  ['compare', 'unquoted'],
  ['country', 'quoted'],
  ['cultivar', 'quoted'],
  ['culture_collection', 'quoted'],
  ['db_xref', 'quoted'],
  ['dev_stage', 'quoted'],
  ['direction', 'unquoted'],
  ['EC_number', 'quoted'],
  ['ecotype', 'quoted'],
  ['environmental_sample', 'flag'],
  ['estimated_length', 'unquoted'],
  ['exception', 'quoted'],
  ['experiment', 'quoted'],
  ['focus', 'flag'],
  ['frequency', 'quoted'],
  ['function', 'quoted'],
  ['gap_type', 'quoted'],
  ['gene', 'quoted'],
  ['gene_synonym', 'quoted'],
  ['geo_loc_name', 'quoted'],
  ['germline', 'flag'],
  ['haplogroup', 'quoted'],
  ['haplotype', 'quoted'],
  ['host', 'quoted'],
  ['identified_by', 'quoted'],
  ['inference', 'quoted'],
  ['isolate', 'quoted'],
  ['isolation_source', 'quoted'],
  ['lab_host', 'quoted'],
  ['lat_lon', 'quoted'],
  ['linkage_evidence', 'quoted'],
  ['locus_tag', 'quoted'],
  ['macronuclear', 'flag'],
  ['map', 'quoted'],
  ['mating_type', 'quoted'],
  ['metagenome_source', 'quoted'],
  ['mobile_element_type', 'quoted'],
  ['mod_base', 'unquoted'],
  ['mol_type', 'quoted'],
  ['ncRNA_class', 'quoted'],
  ['note', 'quoted'],
  ['number', 'unquoted'],
  ['old_locus_tag', 'quoted'],
  ['operon', 'quoted'],
  ['organelle', 'quoted'],
  ['organism', 'quoted'],
  ['partial', 'flag'],
  ['PCR_conditions', 'quoted'],
  ['PCR_primers', 'quoted'],
  ['phenotype', 'quoted'],
  ['plasmid', 'quoted'],
  ['pop_variant', 'quoted'],
  ['product', 'quoted'],
  ['protein_id', 'quoted'],
  ['proviral', 'flag'],
  ['pseudo', 'flag'],
  ['pseudogene', 'quoted'],
  ['rearranged', 'flag'],
  ['recombination_class', 'quoted'],
  ['regulatory_class', 'quoted'],
  ['replace', 'quoted'],
  ['ribosomal_slippage', 'flag'],
  ['rpt_family', 'quoted'],
  ['rpt_type', 'unquoted'],
  ['rpt_unit_range', 'unquoted'],
  ['rpt_unit_seq', 'quoted'],
  ['satellite', 'quoted'],
  ['segment', 'quoted'],
  ['serotype', 'quoted'],
  ['serovar', 'quoted'],
  ['sex', 'quoted'],
  ['specimen_voucher', 'quoted'],
  ['standard_name', 'quoted'],
  ['strain', 'quoted'],
  ['sub_clone', 'quoted'],
  ['submitter_seqid', 'quoted'],
  ['sub_species', 'quoted'],
  ['sub_strain', 'quoted'],
  ['tag_peptide', 'unquoted'],
  ['tissue_lib', 'quoted'],
  ['tissue_type', 'quoted'],
  ['transcript_id', 'quoted'],
  ['transgenic', 'flag'],
  ['translation', 'quoted'],
  ['transl_except', 'unquoted'],
  ['transl_table', 'unquoted'],
  ['trans_splicing', 'flag'],
  ['type_material', 'quoted'],
  ['variety', 'quoted'],
]);

// GenPept adds protein feature qualifiers to the INSDC vocabulary.
// https://github.com/ncbi/ncbi-cxx-toolkit-public/blob/main/src/objtools/format/feature_item.cpp (2026-10-13)
export const PROTEIN_QUALIFIERS: ReadonlyMap<string, QualifierSyntax> = new Map([
  ...NUCLEOTIDE_QUALIFIERS,
  ['bond_type', 'quoted'],
  ['calculated_mol_wt', 'unquoted'],
  ['coded_by', 'quoted'],
  ['derived_from', 'quoted'],
  ['heterogen', 'quoted'],
  ['name', 'quoted'],
  ['non_std_residue', 'quoted'],
  ['region_name', 'quoted'],
  ['sec_str_type', 'quoted'],
  ['site_type', 'quoted'],
  ['UniProtKB_evidence', 'quoted'],
]);

export function formatQualifier(key: string, value: string, syntax: QualifierSyntax): string[] {
  const indent = ' '.repeat(21);
  if (syntax === 'flag') return [indent + '/' + key];
  if (!value) return [];

  const quoted = syntax === 'quoted';
  const escaped = quoted ? value.replace(/"/g, '""') : value;
  let remaining = `/${key}=${quoted ? '"' : ''}${escaped}${quoted ? '"' : ''}`;
  const lines: string[] = [];
  while (remaining.length > 58) {
    let boundary = key === 'translation' ? 58 : -1;
    if (key !== 'translation') {
      for (let i = 58; i > 0; i--) {
        if (remaining[i] === ' ' && remaining[i - 1] !== ' ' && remaining[i + 1] !== ' ') {
          boundary = i;
          break;
        }
      }
    }
    // Splitting an unbroken text token would add a space on import and change its value.
    if (boundary < 0) break;
    lines.push(indent + remaining.slice(0, boundary));
    remaining = remaining.slice(boundary + (key === 'translation' ? 0 : 1));
  }
  lines.push(indent + remaining);
  return lines;
}
