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

import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { readDetails } from '@/src/domain/bio/details';
import { annotationFeatures, isPartial, isUnannotated } from '@/src/domain/bio/recordStatus';
import { matchesAnnotationFilters, matchesSequenceFilters, type HubFilters } from './hubModel';
import { featureLength } from './viewModel';

export type CellState = 'present' | 'odd' | 'duplicate' | 'missing' | 'not-determined' | 'unannotated' | 'absent' | 'hidden';
type FeatureRow = { record: SeqRecord; feature: BioFeature };
export type FeatureGroup = {
  key: string; organism: string; identity: string; types: string[]; medianStart: number;
  rows: FeatureRow[]; cells: { recordId: string; state: CellState }[];
  counts: { present: number; missing: number; odd: number; duplicate: number; notDetermined: number; pool: number };
  hiddenCount?: number;
  accessory: boolean; compared: boolean;
  notComparedReason?: 'organism unknown' | 'no complete annotated sequences';
};

export function featureIdentity(feature: BioFeature): string {
  const metadata = feature.metadata;
  if (['mat_peptide', 'sig_peptide', 'transit_peptide'].includes(feature.type) && metadata?.product?.trim()) return metadata.product.trim();
  return metadata?.gene?.trim() || metadata?.locus_tag?.trim() || feature.name;
}

function organismOf(record: SeqRecord): string | null {
  return readDetails(record).organism?.trim() || null;
}

function groupKey(organism: string | null, identity: string): string {
  return JSON.stringify([organism, identity]);
}

export function countFeatureGroups(records: SeqRecord[], filters: HubFilters): number {
  const keys = new Set<string>();
  for (const record of records) {
    if (!matchesSequenceFilters(record, filters)) continue;
    const organism = organismOf(record);
    for (const feature of annotationFeatures(record)) {
      if (matchesAnnotationFilters(feature, filters)) keys.add(groupKey(organism, featureIdentity(feature)));
    }
  }
  return keys.size;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function lengthOf(row: FeatureRow): number {
  const { record, feature } = row;
  return featureLength(record.sequence.length, feature.start, feature.end, feature.segments);
}

function partialLocation(feature: BioFeature): boolean {
  return /[<>]/.test(feature.locationString ?? '');
}

function featureSortKey(feature: BioFeature): string {
  return JSON.stringify([feature.type, feature.name, feature.start, feature.end, feature.strand,
    feature.segments, feature.locationString, feature.translation, feature.color,
    Object.entries(feature.metadata ?? {}).sort(([a], [b]) => a.localeCompare(b))]);
}

function compareRows(a: FeatureRow, b: FeatureRow): number {
  return a.record.id.localeCompare(b.record.id) || featureSortKey(a.feature).localeCompare(featureSortKey(b.feature));
}

function compareGroup(organism: string | null, identity: string, records: SeqRecord[], allRows: FeatureRow[]): FeatureGroup {
  const baseline = records.filter(record => !isPartial(record) && !isUnannotated(record));
  const notComparedReason = organism === null ? 'organism unknown' : baseline.length === 0 ? 'no complete annotated sequences' : undefined;
  const compared = notComparedReason === undefined;
  const byRecord = new Map<string, Map<string, FeatureRow[]>>();
  for (const row of allRows) {
    const types = byRecord.get(row.record.id) ?? new Map<string, FeatureRow[]>();
    const rows = types.get(row.feature.type) ?? [];
    rows.push(row);
    types.set(row.feature.type, rows);
    byRecord.set(row.record.id, types);
  }
  const types = [...new Set(allRows.map(row => row.feature.type))].sort();
  const medians = new Map<string, number>();
  // Duplicate copies and fragments cannot establish a biological length baseline.
  for (const type of types) {
    const lengths = baseline.flatMap(record => {
      const rows = byRecord.get(record.id)?.get(type);
      return rows?.length === 1 && !partialLocation(rows[0].feature) ? [lengthOf(rows[0])] : [];
    });
    if (lengths.length) medians.set(type, median(lengths));
  }
  const accessory = compared && baseline.filter(record => byRecord.has(record.id)).length < baseline.length / 2;
  const cells = records.map(record => {
    const entries = byRecord.get(record.id);
    let state: CellState;
    if (entries) {
      if ([...entries.values()].some(rows => rows.length > 1)) state = 'duplicate';
      else if (compared && [...entries].some(([type, rows]) => {
        const reference = medians.get(type);
        return reference !== undefined && !partialLocation(rows[0].feature)
          && Math.abs(lengthOf(rows[0]) - reference) > reference * 0.03;
      })) state = 'odd';
      else state = 'present';
    } else if (isPartial(record)) state = 'not-determined';
    else if (isUnannotated(record)) state = 'unannotated';
    else state = compared && !accessory ? 'missing' : 'absent';
    return { recordId: record.id, state };
  });
  return {
    key: groupKey(organism, identity), organism: organism ?? 'No organism', identity, types,
    medianStart: median(allRows.map(row => row.feature.start)),
    rows: allRows.sort(compareRows), cells,
    counts: {
      present: records.filter(record => byRecord.has(record.id)).length,
      missing: cells.filter(cell => cell.state === 'missing').length,
      odd: cells.filter(cell => cell.state === 'odd').length,
      duplicate: cells.filter(cell => cell.state === 'duplicate').length,
      notDetermined: cells.filter(cell => cell.state === 'not-determined').length,
      pool: records.length,
    }, accessory, compared, ...(notComparedReason ? { notComparedReason } : {}),
  };
}

function compareFeatures(records: SeqRecord[]): FeatureGroup[] {
  const organisms = new Map<string | null, SeqRecord[]>();
  for (const record of records) {
    const organism = organismOf(record);
    const members = organisms.get(organism) ?? [];
    members.push(record);
    organisms.set(organism, members);
  }
  const result: FeatureGroup[] = [];
  for (const [organism, members] of organisms) {
    const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
    const identities = new Map<string, FeatureRow[]>();
    for (const record of sorted) {
      for (const feature of annotationFeatures(record)) {
        const identity = featureIdentity(feature);
        const rows = identities.get(identity) ?? [];
        rows.push({ record, feature });
        identities.set(identity, rows);
      }
    }
    for (const [identity, rows] of identities) {
      result.push(compareGroup(organism, identity, sorted, rows));
    }
  }
  return result.sort((a, b) => a.organism.localeCompare(b.organism) || a.identity.localeCompare(b.identity) || a.key.localeCompare(b.key));
}

// Record updates replace the workspace array. Retaining only its latest sequence pool bounds search memory.
const comparisons = new WeakMap<SeqRecord[], { sequenceKey: string; groups: FeatureGroup[] }>();

function comparisonGroups(records: SeqRecord[], filters: HubFilters): FeatureGroup[] {
  const sequenceKey = JSON.stringify([filters.sequenceQuery, filters.needsAttention,
    filters.onlyIds ? [...filters.onlyIds].sort() : null]);
  let cached = comparisons.get(records);
  if (!cached || cached.sequenceKey !== sequenceKey) {
    cached = { sequenceKey, groups: compareFeatures(records.filter(record => matchesSequenceFilters(record, filters))) };
    comparisons.set(records, cached);
  }
  return cached.groups;
}

export function buildFeatureGroups(records: SeqRecord[], filters: HubFilters, onlyProblems: boolean): FeatureGroup[] {
  return comparisonGroups(records, filters).flatMap(group => {
    if (onlyProblems && group.counts.missing === 0 && group.counts.odd === 0) return [];
    const rows = group.rows.filter(row => matchesAnnotationFilters(row.feature, filters)).map(row => ({ ...row }));
    if (!rows.length) return [];
    return [{ ...group, rows, types: [...group.types], cells: group.cells.map(cell => ({ ...cell })), counts: { ...group.counts } }];
  });
}
