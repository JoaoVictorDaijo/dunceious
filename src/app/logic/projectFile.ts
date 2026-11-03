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

import type { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import { isGappedCopyOf } from '@/src/domain/bio/sequence';
import { sanitizeId } from './idHelpers';
import { isAlignmentComparisonSettings, type AlignmentComparisonSettings } from './alignmentComparison';

export interface ProjectState {
  name?: string;
  records: SeqRecord[];
  featureColors: Record<string, string>;
  activeSelection?: SelectionArea | null;
  showAnnotations: boolean;
  showTranslation: boolean;
  showConservation: boolean;
  /** Absent in projects saved before reference comparison existed. */
  alignmentComparison?: AlignmentComparisonSettings;
  version?: string;
  selectionRange?: { start: number; end: number };
  exportedAt?: string;
}

export interface ProjectFile extends ProjectState { format: 2 }

export function serializeProject(state: ProjectState): string {
  return JSON.stringify({ ...state, format: 2, version: state.version ?? __APP_VERSION__ }, null, 2);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringMap(value: unknown): boolean {
  return isObject(value) && Object.values(value).every(item => typeof item === 'string');
}

function coordinates(value: unknown): boolean {
  return isObject(value) && typeof value.start === 'number' && Number.isFinite(value.start)
    && typeof value.end === 'number' && Number.isFinite(value.end);
}

function validRecord(value: unknown): boolean {
  if (!isObject(value) || typeof value.id !== 'string' || sanitizeId(value.id) !== value.id || typeof value.name !== 'string'
    || typeof value.sequence !== 'string' || !Array.isArray(value.features)) return false;
  for (const key of ['definition', 'accession', 'version', 'importedFrom', 'label', 'alignedSequence']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return false;
  }
  for (const key of ['fileDetails', 'fastaModifiers']) {
    if (value[key] !== undefined && !stringMap(value[key])) return false;
  }
  for (const key of ['annotationsEdited', 'visible', 'isCircular']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return false;
  }
  if (value.moleculeType !== undefined && !['dna', 'rna', 'protein'].includes(value.moleculeType as string)) return false;
  if (value.locationQualifier !== undefined && !['country', 'geo_loc_name'].includes(value.locationQualifier as string)) return false;
  if (value.metadata !== undefined && !isObject(value.metadata)) return false;
  if (!value.features.every(feature => isObject(feature) && coordinates(feature)
    && typeof feature.type === 'string' && typeof feature.name === 'string'
    && (feature.strand === 1 || feature.strand === -1)
    && ['color', 'translation', 'locationString'].every(key => feature[key] === undefined || typeof feature[key] === 'string')
    && (feature.metadata === undefined || stringMap(feature.metadata))
    && (feature.segments === undefined || (Array.isArray(feature.segments) && feature.segments.every(segment => isObject(segment) && coordinates(segment)
      && (segment.strand === undefined || segment.strand === 1 || segment.strand === -1)))))) return false;
  return value.tracks === undefined || (Array.isArray(value.tracks) && value.tracks.every(track => isObject(track)
    && (track.kind === undefined || track.kind === 'line' || track.kind === 'interval')
    && (track.color === undefined || typeof track.color === 'string')
    && typeof track.id === 'string' && typeof track.name === 'string' && Array.isArray(track.data)
    && track.data.every(item => isObject(item) && coordinates(item) && typeof item.value === 'number' && Number.isFinite(item.value))));
}

export function parseProject(text: string): { ok: true; project: ProjectFile } | { ok: false; message: string } {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { return { ok: false, message: 'This project file is not valid JSON.' }; }
  if (!isObject(value) || value.format !== 2) return { ok: false,
    message: "This project was saved by an earlier version of Dunceious and can't be opened." };
  const selection = value.activeSelection;
  if (!Array.isArray(value.records) || !value.records.every(validRecord) || !stringMap(value.featureColors)
    || !['showAnnotations', 'showTranslation', 'showConservation'].every(key => typeof value[key] === 'boolean')
    || (value.alignmentComparison !== undefined && !isAlignmentComparisonSettings(value.alignmentComparison))
    || (value.name !== undefined && typeof value.name !== 'string')
    || (value.selectionRange !== undefined && !coordinates(value.selectionRange))
    || (value.exportedAt !== undefined && typeof value.exportedAt !== 'string')
    || (value.version !== undefined && typeof value.version !== 'string')
    || (selection !== undefined && selection !== null && (!isObject(selection) || !coordinates(selection)
      || !Array.isArray(selection.recordIds) || !selection.recordIds.every(id => typeof id === 'string')))) {
    return { ok: false, message: 'This project file contains invalid workspace data.' };
  }
  const ids = new Set<string>();
  for (const record of value.records as SeqRecord[]) {
    const id = record.id.toLowerCase();
    if (ids.has(id)) return { ok: false, message: `This project file contains a duplicate record ID: ${record.id}.` };
    ids.add(id);
    const aligned = record.alignedSequence;
    if (aligned?.includes('.')) return { ok: false, message: `This project file contains an alignment with "." gaps in ${record.id}; only "-" is supported.` };
    if (aligned && !isGappedCopyOf(aligned, record.sequence)) {
      return { ok: false, message: `This project file contains an alignment whose residues differ from sequence ${record.id}.` };
    }
  }
  return { ok: true, project: value as unknown as ProjectFile };
}
