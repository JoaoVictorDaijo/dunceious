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

import type { DetailKey, SeqRecord } from '@/src/domain/bio/types';
import { exportToGenBank } from '@/src/core/genbank/serialize';
import { exportToGff3 } from '@/src/core/formats/gff3';
import { exportToFasta, type FastaExportOptions } from '@/src/core/formats/fasta';
import { emptyReport, type ExportResult, type ExportReport } from '@/src/core/exportReport';
import { serializeProject, type ProjectState } from './projectFile';
import { buildSequenceSections, hasAnnotationFilters, type HubFilters } from './hubModel';
import { buildFeatureGroups } from './featureComparison';

export type HubExportFormat = 'fasta' | 'genbank' | 'gff3' | 'project';
export type ExportOptions = Partial<Pick<FastaExportOptions, 'residues' | 'header'>> & {
  types?: Set<string>;
  matchingKeys?: Set<string>;
  fileName?: string;
  projectState?: Omit<ProjectState, 'records'>;
};
export interface ExportSelectionState {
  records: SeqRecord[];
  selectedRecords: Set<string>;
  hubHidden?: Set<string>;
  filters: HubFilters;
  tab?: 'sequences' | 'features';
  onlyProblems?: boolean;
}
export const EXPORT_EXTENSION: Record<HubExportFormat, string> = { fasta: 'fasta', genbank: 'gb', gff3: 'gff3', project: 'json' };
export const EXPORT_DETAIL_LABELS: Record<DetailKey, string> = { organism: 'Organism', host: 'Host', location: 'Location', collectionDate: 'Collection date' };

export function matchingExportIds(state: ExportSelectionState): Set<string> {
  const records = state.records.filter(record => !state.hubHidden?.has(record.id));
  if (state.tab === 'features') return new Set(buildFeatureGroups(records, state.filters, state.onlyProblems ?? false).flatMap(group => group.rows.map(row => row.record.id)));
  return new Set(buildSequenceSections(records, state.filters, { grouped: false }, 'load').map(section => section.record.id));
}

export function initialExportSelection(state: ExportSelectionState): { preset: 'selected' | 'filtered' | 'all'; ids: Set<string> } {
  const selected = new Set(state.records.filter(record => state.selectedRecords.has(record.id) && !state.hubHidden?.has(record.id)).map(record => record.id));
  if (selected.size) return { preset: 'selected', ids: selected };
  const filters = state.filters;
  const filtering = Boolean(state.hubHidden?.size) || hasAnnotationFilters(filters) || Boolean(filters.sequenceQuery.trim() || filters.needsAttention || filters.onlyIds || state.tab === 'features' && state.onlyProblems);
  return filtering ? { preset: 'filtered', ids: matchingExportIds(state) } : { preset: 'all', ids: new Set(state.records.map(record => record.id)) };
}

/** Filtering uses original feature indices; source information is independent of annotation choices. */
export function exportRecordsForOptions(records: SeqRecord[], format: HubExportFormat, options: ExportOptions): SeqRecord[] {
  if (format !== 'genbank' && format !== 'gff3') return records;
  return records.map(record => ({ ...record, features: record.features.filter((feature, index) => feature.type === 'source'
    || (options.types === undefined || options.types.has(feature.type)) && (options.matchingKeys === undefined || options.matchingKeys.has(`${record.id}:${index}`))) }));
}

/** Preview and download share this dispatch so the report describes the actual file. */
export function serializeExport(records: SeqRecord[], format: HubExportFormat, options: ExportOptions = {}): ExportResult {
  const chosen = exportRecordsForOptions(records, format, options);
  if (format === 'genbank') return exportToGenBank(chosen);
  if (format === 'gff3') return exportToGff3(chosen);
  if (format === 'fasta') return exportToFasta(chosen, { residues: options.residues ?? 'original', header: options.header ?? 'id' });
  return { text: serializeProject({ featureColors: {}, showAnnotations: true, showTranslation: false, showConservation: false, ...options.projectState, records: chosen }), report: emptyReport() };
}

export function missingOrganismWarning(count: number): string {
  return `${count} ${count === 1 ? 'sequence has' : 'sequences have'} no organism; NCBI validation will reject this file, though most viewers open it`;
}

export function describeExport(records: SeqRecord[], format: HubExportFormat, options: ExportOptions = {}): { report: ExportReport; summary: string } {
  const { report } = serializeExport(records, format, options);
  if (format === 'project') return { report, summary: 'Every value, original file detail, edit state, display name, modifier and colour is kept.' };
  const written = Object.values(report.writtenDetails).reduce((a, b) => a + b, 0);
  const omitted = Object.values(report.invalidDetailsOmitted).reduce((a, b) => a + b, 0);
  const notes = [format === 'fasta' ? 'Sequences only; no annotations.' : format === 'gff3' ? 'Annotations and source regions; no residues.' : 'Sequences and annotations with valid qualifiers.'];
  if (written) notes.push(`${written} detail ${written === 1 ? 'value' : 'values'} written.`);
  if (omitted) notes.push(`${omitted} invalid edited ${omitted === 1 ? 'detail' : 'details'} left out.`);
  if (report.droppedAttributes) notes.push(`${report.droppedAttributes} non-GenBank attributes left out.`);
  if (report.deprecatedModifiersOmitted) notes.push(`${report.deprecatedModifiersOmitted} deprecated modifiers left out.`);
  if (report.adjustedIds.length) notes.push(`${report.adjustedIds.length} IDs adjusted.`);
  notes.push('Display names stay in Dunceious.');
  return { report, summary: notes.join(' ') + (report.missingOrganism ? `\n${missingOrganismWarning(report.missingOrganism)}` : '') };
}
