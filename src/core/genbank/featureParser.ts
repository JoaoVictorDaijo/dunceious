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

/**
 * Parses the FEATURES section of a single-record GenBank line array.
 *
 * Feature type lines start at column 5 (5-space indent) followed by the
 * location string.  Long location strings may wrap onto continuation lines
 * (indented 21 spaces) that do not start with '/'.
 */

import { FEATURE_TABLE } from '@/src/domain/bio/insdcFeatureTable';
import type { FindingSink, GenBankFinding } from './findings';
import { validateLocation } from './locationValidation';
import type { BioFeature } from '@/src/domain/bio/types';
import { parseLocation, type LocationData } from './locationParser';
import { parseQualifiers } from './qualifierParser';

/** Qualifier keys whose value should become the feature display name */
const NAME_QUALIFIERS = ['gene', 'product', 'label', 'locus_tag'];

const INDENT21 = ' '.repeat(21);

export function parseFeatures(lines: string[], finding?: FindingSink, protein = false, length?: number, circular = false): BioFeature[] {
  const features: BioFeature[] = [];
  let inFeatures = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('FEATURES')) {
      inFeatures = true;
      continue;
    }
    if (!inFeatures) continue;

    if (/^(ORIGIN|CONTIG|\/\/)/.test(line)) break;

    // Feature key line: exactly 5 spaces, then a non-space key token.
    // Keys such as 5'UTR are valid in GenBank and are not matched by \w+.
    const featureMatch = line.match(/^ {5}(\S+)(?: +(.*))?$/);
    if (!featureMatch) continue;

    const featureLine = i + 1;
    const [, type, initialLoc] = featureMatch;
    let fullLocation = (initialLoc ?? '').trim();

    // Accumulate multi-line location (continuation lines, no qualifier)
    while (
      i + 1 < lines.length &&
      lines[i + 1].startsWith(INDENT21) &&
      !lines[i + 1].trim().startsWith('/')
    ) {
      fullLocation += lines[++i].trim();
    }

    const error = validateLocation(fullLocation, length, circular);
    let location;
    try { location = parseLocation(fullLocation); } catch { location = { segments: [], strand: 1 as const, start: 0, end: 0 }; }
    const { segments, strand, start, end, operator, betweenBases, writtenOrder, remoteParts } = location as LocationData;

    const feature: BioFeature = {
      type,
      name: type,
      start,
      end,
      strand,
      segments,
      locationString: fullLocation,
      metadata: {},
      ...(operator && { operator }),
      ...(betweenBases && { betweenBases }),
      ...(writtenOrder && { writtenOrder }),
      ...(remoteParts && { remoteParts }),
    };

    const qualifierFindings: Omit<GenBankFinding, 'record'>[] = [];
    const { qualifiers, lastIdx } = parseQualifiers(lines, i + 1, (tier, code, message, line) => qualifierFindings.push({ tier, code, message, line }));
    i = lastIdx;

    for (const [key, value] of Object.entries(qualifiers)) {
      if (NAME_QUALIFIERS.includes(key)) {
        feature.name = value;
      }
      if (key === 'translation') {
        feature.translation = value;
      }
      const recognised: readonly string[] = protein ? FEATURE_TABLE.proteinQualifiers : FEATURE_TABLE.nucleotideQualifiers;
      if (key.startsWith('_') || !recognised.includes(key)) (feature.unknownQualifiers ??= Object.create(null))[key] = value;
      else feature.metadata![key] = value;
    }

    if (!NAME_QUALIFIERS.some(key => qualifiers[key]) && qualifiers.standard_name) feature.name = qualifiers.standard_name;

    if (error) finding?.('refuse', error.code, `${type} location ${fullLocation || '(missing)'}: ${error.message}`, featureLine, { key: type, name: feature.name });
    for (const f of qualifierFindings) finding?.(f.tier, f.code, f.message, f.line, { key: type, name: feature.name });
    features.push(feature);
  }

  return features;
}
