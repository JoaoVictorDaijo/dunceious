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


import type { BioFeature, ConceptualTranslation, TranslationExceptionEvidence } from '@/src/domain/bio/types';
import { compareTranslation, storedTranslation, translationReason } from '@/src/domain/bio/translation';

type Comparison = ReturnType<typeof compareTranslation>;
export const diagnosticPreview = (value: string): string => value.length > 160
  ? `${value.slice(0, 160)}… (preview; complete value in feature details)` : value;

export function translationSummary(feature: BioFeature, result: ConceptualTranslation, prepared?: { stored?: string; comparison?: Comparison }): string {
  const stored = prepared ? prepared.stored : storedTranslation(feature);
  const comparison = prepared ? prepared.comparison : stored && result.status === 'ok' ? compareTranslation(stored, result) : undefined;
  const clauses: string[] = [];
  if (result.status === 'unavailable') clauses.push(`Can't verify: ${diagnosticPreview(translationReason(result, feature))}`);
  else {
    clauses.push(`${result.residues.length} translation positions (terminal stop excluded)${result.internalStops.length ? `, ${result.internalStops.length} internal stop${result.internalStops.length === 1 ? '' : 's'}` : ''}`);
    if (result.threePrimeIndeterminate) clauses.push('End uncertain; the last translation position is retained');
  }
  if (comparison?.differing.length) clauses.push(`Annotation differs from DNA at ${comparison.differing.length} codon${comparison.differing.length === 1 ? '' : 's'}`);
  if (comparison) for (const [n, direction] of [[comparison.storedExtra.length, 'longer'], [comparison.storedShortBy, 'shorter']] as const) {
    if (n) clauses.push(`Annotated protein is ${n} translation position${n === 1 ? '' : 's'} ${direction} than the DNA-derived protein`);
  }
  const counts = { applied: 0, dropped: 0, deferred: 0, malformed: 0 };
  for (const e of result.exceptions ?? []) counts[e.status]++;
  for (const [status, count] of Object.entries(counts)) if (count) clauses.push(`${count} ${status} translation exception${count === 1 ? '' : 's'}`);
  if (result.exceptions?.length || (result.status === 'ok' && result.internalStops.length) || feature.metadata?._translationMessage) clauses.push('Complete diagnostics in feature details');
  return clauses.join('. ');
}

export interface LocalExceptionDescription { applied: boolean; text: string }

/** Tooltip previews are explicit; every occurrence remains in the canonical evidence and details. */
export function indexExceptionDescriptions(entries: TranslationExceptionEvidence[] = []): Map<number, LocalExceptionDescription> {
  const groups = new Map<number, { count: number; applied: boolean; previews: TranslationExceptionEvidence[] }>();
  for (const e of entries) {
    if (e.codonIndex === undefined) continue;
    let group = groups.get(e.codonIndex);
    if (!group) { group = { count: 0, applied: false, previews: [] }; groups.set(e.codonIndex, group); }
    group.count++;
    group.applied ||= e.status === 'applied';
    if (group.previews.length < 2) group.previews.push(e);
  }
  const descriptions = new Map<number, LocalExceptionDescription>();
  for (const [i, group] of groups) {
    const text = group.previews.map(e => `Translation exception: ${diagnosticPreview(e.raw)}. ${e.status === 'applied' ? 'Applied.' : `It was not applied (${e.status}): ${diagnosticPreview(e.reason ?? 'translation unavailable')}.`}`).join(' ');
    descriptions.set(i, { applied: group.applied, text: `${text} ${group.previews.length} of ${group.count} occurrences shown; complete diagnostics in feature details.` });
  }
  return descriptions;
}
