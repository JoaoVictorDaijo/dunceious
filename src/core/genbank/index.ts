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

/**
 * Public API for the modular GenBank parser.
 *
 * Re-exports the primary parsing function for downstream code that imports
 * from this module.
 */

import type { SeqRecord } from '@/src/domain/bio/types';
import { splitRecords } from './recordSplitter';
import { toSeqRecord } from './toSeqRecord';

export { splitRecords } from './recordSplitter';
export { parseHeader } from './headerParser';
export { parseLocation } from './locationParser';
export { parseQualifiers } from './qualifierParser';
export { parseFeatures } from './featureParser';
export { toSeqRecord } from './toSeqRecord';

/**
 * Parses a raw GenBank file string (single- or multi-record) and returns an
 * array of SeqRecord objects.
 */
export function parseGenBank(content: string): SeqRecord[] {
  return splitRecords(content).map(toSeqRecord);
}
