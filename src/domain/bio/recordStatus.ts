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

export function isSourceFeature(feature: BioFeature): boolean {
  return feature.type === 'source';
}

export function annotationFeatures(record: SeqRecord): BioFeature[] {
  return record.features.filter(f => !isSourceFeature(f));
}

export function isUnannotated(record: SeqRecord): boolean {
  return annotationFeatures(record).length === 0;
}

export function isPartial(record: SeqRecord): boolean {
  return /\bpartial\b/i.test(record.definition ?? '') || record.features.some(f => /[<>]/.test(f.locationString ?? ''));
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
