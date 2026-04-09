/**
 * Assembles a SeqRecord from a single-record GenBank line array by
 * combining the outputs of the individual sub-parsers.
 */

import type { SeqRecord } from '../../src/domain/bio/types';
import { parseHeader } from './headerParser';
import { parseFeatures } from './featureParser';

/** Extracts the nucleotide sequence from the ORIGIN section */
function parseSequence(lines: string[]): string {
  let sequence = '';
  let inOrigin = false;

  for (const line of lines) {
    if (line.startsWith('ORIGIN')) {
      inOrigin = true;
      continue;
    }
    if (inOrigin) {
      if (line.trim().startsWith('//')) break;
      sequence += line.replace(/[^A-Za-z\-*]/g, '').toUpperCase();
    }
  }

  return sequence;
}

export function toSeqRecord(recordStr: string): SeqRecord {
  const lines = recordStr.split(/\r?\n/);

  const header = parseHeader(lines);
  const features = parseFeatures(lines);
  const sequence = parseSequence(lines);

  return {
    id: header.id,
    name: header.name,
    definition: header.definition,
    sequence,
    features,
    isCircular: header.isCircular,
  };
}
