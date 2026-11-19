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
 * location string. Long locations may wrap onto continuation lines indented 21 spaces.
 */

import { FEATURE_TABLE } from '@/src/domain/bio/insdcFeatureTable';
import type { FindingSink, GenBankFinding } from './findings';
import { locationTextProblem, validateLocation } from './locationValidation';
import type { BioFeature } from '@/src/domain/bio/types';
import { isUndrawnProteinBond } from '@/src/domain/bio/proteinBond';
import { parseLocation, type LocationData } from './locationParser';
import { parseQualifiers } from './qualifierParser';

/** Qualifier keys whose value should become the feature display name */
const NAME_QUALIFIERS = ['gene', 'product', 'label', 'locus_tag'];

const INDENT21 = ' '.repeat(21);

function parenthesisDelta(text: string): number {
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth++;
    else if (char === ')') depth--;
  }
  return depth;
}

export function parseFeatures(lines: string[], finding?: FindingSink, protein = false, length?: number, circular = false): BioFeature[] {
  const features: BioFeature[] = [];
  const undrawnBonds: string[] = [];
  let inFeatures = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('FEATURES')) {
      inFeatures = true;
      continue;
    }
    if (!inFeatures) continue;

    if (/^(?:ORIGIN|CONTIG|BASE COUNT)(?:\s|$)|^\/\//.test(line)) break;

    // Feature key line: exactly 5 spaces, then a non-space key token.
    // Keys such as 5'UTR are valid in GenBank and are not matched by \w+.
    const featureMatch = line.match(/^ {5}(\S+)(?: +(.*))?$/);
    if (!featureMatch) {
      if (!line.trim()) continue;
      finding?.('refuse', 'malformed-feature', `Feature table line "${line.trim()}" cannot be read.`, i + 1);
      while (i + 1 < lines.length && lines[i + 1].startsWith(INDENT21)) i++;
      continue;
    }

    const featureLine = i + 1;
    const [, type, initialLoc] = featureMatch;
    const locationLines = [initialLoc ?? ''];
    let openParentheses = parenthesisDelta(locationLines[0]);

    // INSDC FT 11.4 §3.3.2 puts qualifiers after the location, which can itself contain '/'.
    while (
      i + 1 < lines.length &&
      lines[i + 1].startsWith(INDENT21) &&
      (openParentheses > 0 || !lines[i + 1].trim().startsWith('/'))
    ) {
      const continuation = lines[++i].slice(INDENT21.length);
      locationLines.push(continuation);
      openParentheses += parenthesisDelta(continuation);
    }

    const fullLocation = locationLines.map(part => part.trim()).join('');
    const error = locationTextProblem(locationLines.join('')) ?? validateLocation(fullLocation, length, circular, protein);
    let location;
    try { location = parseLocation(fullLocation, length === undefined ? undefined : { length, isCircular: circular }, protein); }
    catch { location = { segments: [], strand: 1 as const, start: 0, end: 0 }; }
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
    const { qualifiers, lastIdx, translationExceptions } = parseQualifiers(lines, i + 1, (tier, code, message, line) => qualifierFindings.push({ tier, code, message, line }));
    i = lastIdx;
    if (translationExceptions) feature.translationExceptions = translationExceptions;

    for (const [key, value] of Object.entries(qualifiers)) {
      if (NAME_QUALIFIERS.includes(key)) {
        feature.name = value;
      }
      if (key === 'translation') {
        feature.metadata!._translationSource = 'imported';
      }
      const recognised: readonly string[] = protein ? FEATURE_TABLE.proteinQualifiers : FEATURE_TABLE.nucleotideQualifiers;
      if (key.startsWith('_') || !recognised.includes(key)) (feature.unknownQualifiers ??= Object.create(null))[key] = value;
      else feature.metadata![key] = value;
    }

    if (!NAME_QUALIFIERS.some(key => qualifiers[key]) && qualifiers.standard_name) feature.name = qualifiers.standard_name;

    if (error) finding?.('refuse', error.code, `${type} location ${fullLocation || '(missing)'}: ${error.message}`, featureLine, { key: type, name: feature.name });
    else if (protein && isUndrawnProteinBond(feature)) {
      const name = feature.name === type ? type : `${type} ${feature.name}`;
      undrawnBonds.push(`${name} (${fullLocation})`);
    }
    for (const f of qualifierFindings) finding?.(f.tier, f.code, f.message, f.line, { key: type, name: feature.name });
    features.push(feature);
  }

  if (undrawnBonds.length) finding?.('warning', 'undrawn-protein-bonds', `Protein bonds kept without drawing: ${undrawnBonds.join(', ')}.`);
  return features;
}
