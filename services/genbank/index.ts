/**
 * Public API for the modular GenBank parser.
 *
 * Re-exports the primary parsing function so that downstream code importing
 * from `services/genbankParser` (or this index) continues to work unchanged.
 */

import type { SeqRecord } from '../../src/domain/bio/types';
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
