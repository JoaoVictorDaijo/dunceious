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

import type { BioFeature, DetailKey, SeqRecord } from './types';
import { DETAIL_QUALIFIER, isDetailEdited } from './details';
import { isPartialLocation } from './locationFlags';

type FeatureStatus = { annotations: BioFeature[]; partial: boolean };
// Annotation edits replace the feature array; label and visibility edits can reuse its biology.
const featureStatuses = new WeakMap<BioFeature[], FeatureStatus>();
const partialRecords = new WeakMap<SeqRecord, boolean>();

function featureStatus(features: BioFeature[]): FeatureStatus {
  let status = featureStatuses.get(features);
  if (!status) {
    status = { annotations: features.filter(f => !isSourceFeature(f)), partial: features.some(isPartialLocation) };
    featureStatuses.set(features, status);
  }
  return status;
}

export function isSourceFeature(feature: BioFeature): boolean {
  return feature.type === 'source';
}

export function annotationFeatures(record: SeqRecord): BioFeature[] {
  return featureStatus(record.features).annotations.slice();
}

export function isUnannotated(record: SeqRecord): boolean {
  return featureStatus(record.features).annotations.length === 0;
}

export function isPartial(record: SeqRecord): boolean {
  let partial = partialRecords.get(record);
  if (partial === undefined) {
    partial = /\bpartial\b/i.test(record.definition ?? '') || featureStatus(record.features).partial;
    partialRecords.set(record, partial);
  }
  return partial;
}

export function isEdited(record: SeqRecord): boolean {
  return Boolean(record.annotationsEdited) || (Object.keys(DETAIL_QUALIFIER) as DetailKey[]).some(key => isDetailEdited(record, key));
}

export function needsAttention(record: SeqRecord): boolean {
  return isUnannotated(record) || isPartial(record) || isEdited(record);
}

export function isolateOf(record: SeqRecord): string {
  const source = record.features.find(isSourceFeature)?.metadata;
  return source?.isolate || source?.strain || record.definition || '';
}
