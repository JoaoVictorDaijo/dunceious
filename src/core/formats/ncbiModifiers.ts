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

import type { DetailKey, SequenceDetails } from '@/src/domain/bio/types';

export const MODIFIER_TO_DETAIL: Readonly<Record<string, DetailKey>> = {
  organism: 'organism', host: 'host', 'geo-loc-name': 'location', geo_loc_name: 'location', country: 'location',
  'collection-date': 'collectionDate', collection_date: 'collectionDate',
};

// NCBI's spellings and deprecation list govern submission-compatible headers (checked 2026-10-13).
// https://www.ncbi.nlm.nih.gov/genbank/mods_fastadefline/
export const DETAIL_TO_MODIFIER: Readonly<Record<DetailKey, string>> = {
  organism: 'organism', host: 'host', location: 'geo-loc-name', collectionDate: 'collection-date',
};

export const DEPRECATED_MODIFIERS: ReadonlySet<string> = new Set([
  'acronym', 'anamorph', 'authority', 'biotype', 'biovar', 'chemovar', 'clone-lib', 'common',
  'forma', 'forma-specialis', 'group', 'identified-by', 'pathovar', 'pop-variant', 'serogroup',
  'subclone', 'subgroup', 'substrain', 'subtype', 'synonym', 'teleomorph', 'tissue-lib', 'type',
]);

export function parseModifiers(headerRest: string): {
  details: SequenceDetails; unknown: Record<string, string>; text: string;
} {
  const details: SequenceDetails = {};
  const unknown: Record<string, string> = {};
  const text = headerRest.replace(/\[([^\s=[\]]+)=([^[\]]*)\]/g, (_match, key: string, value: string) => {
    const detail = Object.hasOwn(MODIFIER_TO_DETAIL, key.toLowerCase()) ? MODIFIER_TO_DETAIL[key.toLowerCase()] : undefined;
    if (detail) details[detail] = value;
    else Object.defineProperty(unknown, key, { value, writable: true, enumerable: true, configurable: true });
    return ' ';
  }).replace(/\s+/g, ' ').trim();
  return { details, unknown, text };
}
