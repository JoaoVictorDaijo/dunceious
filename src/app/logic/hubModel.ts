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

import type { BioFeature, SeqRecord, QuantitativeTrack } from '@/src/domain/bio/types';
import { readDetails } from '@/src/domain/bio/details';
import { annotationFeatures, isolateOf, needsAttention } from '@/src/domain/bio/recordStatus';
import { getFeatureStrand } from '@/src/domain/bio/strand';

export type GroupField = 'organism' | 'host' | 'location' | 'year' | 'file';
export type HubFilters = { query: string; types: Set<string>; strand: 'all' | 'fwd' | 'rev'; sequenceQuery: string; needsAttention: boolean; onlyIds?: Set<string> };
export type SortOrder = 'load' | 'accession' | 'fewest';
export type SequenceSection = { key: string; group: string | null; record: SeqRecord; rows: BioFeature[]; total: number; tracks?: QuantitativeTrack[] };
export type GroupMode = { grouped: false } | { grouped: true; field: GroupField };

export function groupKeyOf(record: SeqRecord, field: GroupField): string {
  const details = readDetails(record);
  const value = field === 'file' ? record.importedFrom
    : field === 'location' ? details.location?.split(':')[0]
    : field === 'year' ? details.collectionDate?.split('T')[0].match(/\b\d{4}\b/)?.[0]
    : details[field];
  return value?.trim() || 'Not specified';
}

export function groupPreview(records: SeqRecord[], field: GroupField): { groups: number; notSpecified: number } {
  const keys = records.map(record => groupKeyOf(record, field));
  return { groups: new Set(keys.filter(key => key !== 'Not specified')).size, notSpecified: keys.filter(key => key === 'Not specified').length };
}

function contains(values: (string | undefined)[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  return values.some(value => value?.toLowerCase().includes(needle));
}

export function matchesAnnotation(feature: BioFeature, query: string): boolean {
  return contains([feature.name, feature.metadata?.gene, feature.metadata?.product, feature.type, feature.metadata?.note], query);
}

export function matchesSequence(record: SeqRecord, query: string): boolean {
  return contains([record.id, record.accession, record.name, record.label, isolateOf(record), ...Object.values(readDetails(record)), record.definition], query);
}

export function matchesSequenceFilters(record: SeqRecord, filters: HubFilters): boolean {
  return matchesSequence(record, filters.sequenceQuery)
    && (!filters.needsAttention || needsAttention(record))
    && (!filters.onlyIds || filters.onlyIds.has(record.id));
}

export function matchesAnnotationFilters(feature: BioFeature, filters: HubFilters): boolean {
  const strand = getFeatureStrand(feature);
  return matchesAnnotation(feature, filters.query)
    && (filters.types.size === 0 || filters.types.has(feature.type))
    && (filters.strand === 'all' || strand === (filters.strand === 'fwd' ? 1 : -1));
}

export function hasAnnotationFilters(filters: HubFilters): boolean {
  return Boolean(filters.query.trim()) || filters.types.size > 0 || filters.strand !== 'all';
}

export function buildSequenceSections(records: SeqRecord[], filters: HubFilters, mode: GroupMode, sort: SortOrder): SequenceSection[] {
  const sections = records.filter(record => matchesSequenceFilters(record, filters)).map(record => {
    const annotations = annotationFeatures(record);
    return {
      key: record.id, group: mode.grouped ? groupKeyOf(record, mode.field) : null,
      tracks: (record.tracks ?? []).filter(track => track.name.toLowerCase().includes(filters.query.trim().toLowerCase()) && (!filters.types.size || filters.types.has('track')) && filters.strand === 'all'),
      record, rows: annotations.filter(feature => matchesAnnotationFilters(feature, filters)), total: annotations.length,
    };
  }).filter(section => !hasAnnotationFilters(filters) || section.rows.length > 0 || section.tracks.length > 0);
  return sections.sort((a, b) => {
    if (a.group !== b.group) {
      if (a.group === 'Not specified') return 1;
      if (b.group === 'Not specified') return -1;
      const byGroup = (a.group ?? '').localeCompare(b.group ?? '');
      if (byGroup) return byGroup;
    }
    if (sort === 'accession') return (a.record.accession || a.record.id).localeCompare(b.record.accession || b.record.id);
    if (sort === 'fewest') return a.total - b.total;
    return 0;
  });
}

export function searchHits(sections: SequenceSection[]): string[] {
  return [...new Set(sections.flatMap(section => {
    const visible = new Set(section.rows);
    return [...(section.tracks ?? []).map(track => `${section.record.id}:track:${track.id}`), ...section.record.features.flatMap((feature, index) => visible.has(feature) ? [`${section.record.id}:${index}`] : [])];
  }))];
}
