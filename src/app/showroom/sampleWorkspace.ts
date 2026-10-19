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

import phageT7 from '@/examples/nucleotide/t7-phages/phage-t7-NC_001604.gb?raw';
import phage13a from '@/examples/nucleotide/t7-phages/phage-13a-NC_011045.gb?raw';
import phageT3 from '@/examples/nucleotide/t7-phages/phage-t3-NC_003298.gb?raw';
import alignedFasta from '@/examples/nucleotide/t7-phages/aligned.fasta?raw';
import type { SeqRecord } from '@/src/domain/bio/types';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { applyFastaResponse, applyParseSuccess } from '@/src/app/logic/bioResponse';

const SAMPLE_FILES: ReadonlyArray<readonly [filename: string, content: string]> = [
  ['phage-t7-NC_001604.gb', phageT7],
  ['phage-13a-NC_011045.gb', phage13a],
  ['phage-t3-NC_003298.gb', phageT3],
];

const ALIGNMENT_FILE = 'aligned.fasta';

let cached: SeqRecord[] | null = null;

/**
 * The sample session as the workbench builds it when the three T7-like phage
 * genomes are dropped together and the bundled MAFFT alignment is laid over them: each GenBank file goes through the bio worker's handler in drop order and is
 * acknowledged with `applyParseSuccess`, then `aligned.fasta` is parsed as an external
 * alignment and overlaid exactly as an upload would be. Anything other than a clean
 * overlay means the bundled data no longer matches, which must fail loudly rather than
 * leave the showroom silently unaligned.
 * Parsed once per page load; callers must not mutate the result.
 */
export function loadSampleRecords(): SeqRecord[] {
  if (cached) return cached;
  let records: SeqRecord[] = [];
  for (const [filename, content] of SAMPLE_FILES) {
    const response = handleBioMessage({ type: 'PARSE_GENBANK', filename, content });
    if (response.type !== 'PARSE_SUCCESS') {
      throw new Error(`Sample file ${filename} did not parse: ${response.type === 'ERROR' ? response.error : response.type}`);
    }
    records = applyParseSuccess(records, response.records, filename).next;
  }

  const parsed = handleBioMessage({ type: 'PARSE_FASTA', filename: ALIGNMENT_FILE, content: alignedFasta, asAlignment: true });
  if (parsed.type !== 'FASTA_SUCCESS') {
    throw new Error(`Sample alignment ${ALIGNMENT_FILE} did not parse: ${parsed.type === 'ERROR' ? parsed.error : parsed.type}`);
  }
  const overlay = applyFastaResponse(records, parsed.alignedData, true, ALIGNMENT_FILE);
  if (overlay.kind !== 'overlay') {
    throw new Error(`Sample alignment ${ALIGNMENT_FILE} was rejected: ${overlay.kind}`);
  }

  cached = overlay.next;
  return cached;
}
