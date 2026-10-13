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

import type { DetailKey, SequenceDetails, SeqRecord } from './types';
import { INSDC_COUNTRIES, INSDC_MISSING_TERMS } from './insdcVocabulary';

export const DETAIL_QUALIFIER: Record<DetailKey, string> = {
  organism: 'organism', host: 'host', location: 'geo_loc_name', collectionDate: 'collection_date',
};

export function readDetails(record: SeqRecord): SequenceDetails {
  const metadata = record.features.find(f => f.type === 'source')?.metadata ?? {};
  const details: SequenceDetails = {};
  for (const key of Object.keys(DETAIL_QUALIFIER) as DetailKey[]) {
    const value = key === 'location' ? metadata.geo_loc_name ?? metadata.country : metadata[DETAIL_QUALIFIER[key]];
    if (value !== undefined) details[key] = value;
  }
  return details;
}

/** Partial updates leave other source qualifiers and the imported snapshot intact. */
export function writeDetails(record: SeqRecord, details: SequenceDetails): SeqRecord {
  const sourceIndex = record.features.findIndex(f => f.type === 'source');
  const source = sourceIndex < 0
    ? { type: 'source', name: 'source', start: 0, end: record.sequence.length, strand: 1 as const }
    : record.features[sourceIndex];
  const metadata = { ...source.metadata };
  for (const key of Object.keys(details) as DetailKey[]) {
    const qualifier = key === 'location' ? record.locationQualifier ?? 'geo_loc_name' : DETAIL_QUALIFIER[key];
    if (key === 'location') {
      delete metadata.country;
      delete metadata.geo_loc_name;
    }
    if (details[key]) metadata[qualifier] = details[key]!;
    else delete metadata[qualifier];
  }
  const updated = { ...source, metadata };
  const features = [...record.features];
  if (sourceIndex < 0) features.unshift(updated);
  else features[sourceIndex] = updated;
  return { ...record, features };
}

export function isDetailEdited(record: SeqRecord, key: DetailKey): boolean {
  return (readDetails(record)[key] ?? '') !== (record.fileDetails?.[key] ?? '');
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function validDate(value: string): boolean {
  const [date, time, extra] = value.split('T');
  if (extra !== undefined) return false;
  if (time !== undefined && !/^(?:[01]\d|2[0-3])(?::[0-5]\d(?::[0-5]\d)?)?Z$/.test(time)) return false;

  let year: number;
  let month: number;
  let day: number;
  const numeric = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(date);
  const named = /^(?:(\d{2})-)?([A-Z][a-z]{2})-(\d{4})$/.exec(date);
  if (numeric) {
    year = Number(numeric[1]);
    month = Number(numeric[2] ?? 1);
    day = Number(numeric[3] ?? 1);
  } else if (named) {
    year = Number(named[3]);
    month = months.indexOf(named[2]) + 1;
    day = Number(named[1] ?? 1);
  } else return false;

  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function validateDetail(key: DetailKey, value: string): string | null {
  if (value === '') return null;
  if (/[\r\n]/.test(value) || !value.trim()) return 'Use non-empty text without line breaks.';
  if (INSDC_MISSING_TERMS.includes(value)) return null;
  if (key === 'collectionDate' && !validDate(value)) {
    return 'Use an INSDC date: YYYY, Mon-YYYY, DD-Mon-YYYY, YYYY-MM or YYYY-MM-DD, optionally with a UTC time.';
  }
  if (key === 'location' && !INSDC_COUNTRIES.includes(value.split(':')[0].trim())) {
    return 'Choose a country, ocean or sea from the INSDC vocabulary.';
  }
  return null;
}
