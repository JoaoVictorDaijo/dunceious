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

import { malformedCodeBreakMessage, checkTranslation, isCds, translationReason, translationWarning } from '@/src/domain/bio/translation';
import type { BioFeature, FeatureSegment, SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import { isPartialLocation } from '@/src/domain/bio/locationFlags';
import { parseLocation, siteFitsRecord } from '@/src/core/genbank/locationParser';
import { hasPartialStrands } from '@/src/domain/bio/featureParts';
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
  const records = state.records.map(record => ({ ...record, features: record.features.map(feature => {
    const { biological: _biological, ...stored } = feature;
    if (stored.metadata) {
      stored.metadata = { ...stored.metadata };
      delete stored.metadata._translationCheck;
    }
    return stored;
  }) }));
  return JSON.stringify({ ...state, records, format: 2, version: state.version ?? __APP_VERSION__ }, null, 2);
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
    && (feature.translationExceptions === undefined || Array.isArray(feature.translationExceptions) && feature.translationExceptions.every(item => typeof item === 'string'))
    && ['color', 'translation', 'locationString'].every(key => feature[key] === undefined || typeof feature[key] === 'string')
    && (feature.operator === undefined || feature.operator === 'join' || feature.operator === 'order')
    && (feature.betweenBases === undefined || feature.betweenBases === true)
    && (feature.writtenOrder === undefined || (Array.isArray(feature.writtenOrder) && feature.writtenOrder.every(Number.isInteger)))
    && (feature.remoteParts === undefined || (Array.isArray(feature.remoteParts) && feature.remoteParts.every(part => isObject(part)
      && coordinates(part) && typeof part.accession === 'string' && (part.strand === 1 || part.strand === -1) && Number.isInteger(part.index))))
    && (feature.metadata === undefined || stringMap(feature.metadata))
    && (feature.unknownQualifiers === undefined || stringMap(feature.unknownQualifiers))
    && (feature.segments === undefined || (Array.isArray(feature.segments) && feature.segments.every(segment => isObject(segment) && coordinates(segment)
      && (segment.strand === undefined || segment.strand === 1 || segment.strand === -1)))))) return false;
  return value.tracks === undefined || (Array.isArray(value.tracks) && value.tracks.every(track => isObject(track)
    && (track.kind === undefined || track.kind === 'line' || track.kind === 'interval')
    && (track.color === undefined || typeof track.color === 'string')
    && typeof track.id === 'string' && typeof track.name === 'string' && Array.isArray(track.data)
    && track.data.every(item => isObject(item) && coordinates(item) && typeof item.value === 'number' && Number.isFinite(item.value))));
}

/** Same intervals, in the same order: the stored geometry is still the one the text was read as. */
function sameIntervals(a: FeatureSegment[] | undefined, b: FeatureSegment[]): boolean {
  return a?.length === b.length && a.every((part, i) => part.start === b[i].start && part.end === b[i].end);
}

/**
 * Projects saved before features carried `operator`, `betweenBases`, per-end partial flags,
 * `writtenOrder` and `remoteParts` hold them only in `locationString`, which the first edit clears;
 * read them from that text while it is still there. Remote intervals were stored as local
 * segments then, so a feature that has them is re-read from its text whole (#245).
 */
function withLegacyLocation(feature: BioFeature, record: SeqRecord): BioFeature {
  if (!feature.locationString) return feature;
  let parsed: ReturnType<typeof parseLocation>;
  // Text saved before import validation may not parse; the feature then stays as it was saved.
  try { parsed = parseLocation(feature.locationString); } catch { return feature; }
  if (parsed.remoteParts && !feature.remoteParts) {
    const { segments, strand, start, end, operator, writtenOrder, remoteParts } = parsed;
    return { ...feature, segments, strand, start, end, remoteParts,
      ...(operator && { operator }), ...(writtenOrder && { writtenOrder }) };
  }
  let next = feature;
  if (!feature.segments?.length && feature.start === parsed.start && feature.end === parsed.end && feature.strand === parsed.strand) next = { ...feature, segments: parsed.segments };
  if (!next.operator && parsed.operator && (next.segments?.length ?? 0) > 1) next = { ...next, operator: parsed.operator };
  if (!next.betweenBases && parsed.betweenBases && siteFitsRecord(feature.locationString, record.sequence.length, record.isCircular === true)) {
    next = { ...next, start: parsed.start, end: parsed.end, segments: parsed.segments, betweenBases: true };
  }
  if (!next.writtenOrder && parsed.writtenOrder && sameIntervals(next.segments, parsed.segments)) next = { ...next, writtenOrder: parsed.writtenOrder };
  if (!isPartialLocation(next) && isPartialLocation(parsed) && sameIntervals(next.segments, parsed.segments)) {
    next = { ...next, segments: next.segments!.map((part, i) => ({ ...part,
      ...(parsed.segments[i].partialStart && { partialStart: true as const }),
      ...(parsed.segments[i].partialEnd && { partialEnd: true as const }) })) };
  }
  return next;
}

export function parseProject(text: string, addLog: (message: string) => void = console.warn): { ok: true; project: ProjectFile } | { ok: false; message: string } {
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
  const widths = new Set((value.records as SeqRecord[]).filter(record => record.alignedSequence !== undefined).map(record => record.alignedSequence!.length));
  if (widths.size > 1) return { ok: false, message: "This project file contains an alignment whose rows have different lengths" };
  const ids = new Set<string>();
  for (const record of value.records as SeqRecord[]) {
    for (const feature of record.features) {
      if (hasPartialStrands(feature)) return { ok: false, message: `Feature ${feature.name} has a strand on some of its pieces but not others.` };
      const scalar = feature.metadata?.transl_except ?? feature.unknownQualifiers?.transl_except;
      if (scalar !== undefined) return { ok: false, message: `CDS ${feature.name}, /transl_except ${JSON.stringify(scalar)}: canonical translationExceptions array required; scalar qualifiers are invalid project data` };
      delete feature.biological;
      const malformed = malformedCodeBreakMessage(withLegacyLocation(feature, record), record);
      if (malformed) return { ok: false, message: malformed };
    }
    if (/[-.]/.test(record.sequence)) return { ok: false, message: `This project file contains gap characters in the sequence of ${record.id}; the file is damaged` };
    const id = record.id.toLowerCase();
    if (ids.has(id)) return { ok: false, message: `This project file contains a duplicate record ID: ${record.id}.` };
    ids.add(id);
    const aligned = record.alignedSequence;
    if (aligned?.includes('.')) return { ok: false, message: `This project file contains an alignment with "." gaps in ${record.id}; only "-" is supported.` };
    if (aligned && !isGappedCopyOf(aligned, record.sequence)) {
      return { ok: false, message: `This project file contains an alignment whose residues differ from sequence ${record.id}.` };
    }
  }
  const project = value as unknown as ProjectFile;
  project.records = project.records.map(record => ({
    ...record, features: record.features.map(feature => {
      let normalized = withLegacyLocation(feature, record);
      if (!isCds(normalized)) return normalized;
      normalized = { ...normalized, metadata: { ...normalized.metadata } };
      delete normalized.metadata!._translationCheck;
      if (isCds(normalized) && record.moleculeType === 'protein' && normalized.metadata!._translationSource === 'computed') {
        delete normalized.metadata!.translation;
        normalized.metadata!._translationSource = 'removed';
        normalized.metadata!._translationMessage = `Translation discarded on load: ${translationReason({ status: 'unavailable', reason: 'protein-record' }, normalized)}`;
        addLog(`${normalized.name}: ${normalized.metadata!._translationMessage}`);
      }
      return checkTranslation(normalized, record);
    }),
  }));
  const warning = translationWarning(project.records);
  if (warning) addLog(warning);
  return { ok: true, project };
}
