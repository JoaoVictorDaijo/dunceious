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

import sarsCov2 from '@/examples/sars-cov-2-NC_045512.gb?raw';
import mitochondrion from '@/examples/human-mitochondrion-NC_012920.gb?raw';
import influenza from '@/examples/influenza-a-pr8-8segments.gb?raw';
import type { SeqRecord } from '@/src/domain/bio/types';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { applyParseSuccess } from '@/src/app/logic/bioResponse';

const SAMPLE_FILES: ReadonlyArray<readonly [filename: string, content: string]> = [
  ['sars-cov-2-NC_045512.gb', sarsCov2],
  ['human-mitochondrion-NC_012920.gb', mitochondrion],
  ['influenza-a-pr8-8segments.gb', influenza],
];

let cached: SeqRecord[] | null = null;

/**
 * The sample session as the workbench builds it when the three files are dropped
 * together: each GenBank file goes through the bio worker's handler in drop order,
 * and its records are acknowledged with `applyParseSuccess` before the next file.
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
  cached = records;
  return records;
}
