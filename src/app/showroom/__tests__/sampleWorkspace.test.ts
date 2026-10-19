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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { loadSampleRecords } from '../sampleWorkspace';

const readExample = (file: string) => readFileSync(resolve(__dirname, '../../../../examples/', file), 'utf-8');

/** Reads the bundled FASTA without the app's parser: it is the oracle, not a subject. */
function alignedRows(): Map<string, string> {
  const rows = new Map<string, string>();
  let id = '';
  for (const line of readExample('nucleotide/t7-phages/aligned.fasta').split('\n')) {
    if (line.startsWith('>')) { id = line.slice(1).trim().split(/\s+/)[0]; rows.set(id, ''); }
    else if (line.trim() !== '') rows.set(id, rows.get(id)! + line.trim());
  }
  return rows;
}

describe('loadSampleRecords', () => {
  it('the sample is three aligned records of one length', () => {
    const records = loadSampleRecords();
    expect(records.map(r => r.id)).toEqual(['NC_001604', 'NC_011045', 'NC_003298']);
    expect(new Set(records.map(r => r.alignedSequence?.length))).toEqual(new Set([alignedRows().get('NC_001604')!.length]));
  });

  it('alignment as loaded equals the bundled FASTA', () => {
    const rows = alignedRows();
    expect(loadSampleRecords()).toHaveLength(rows.size);
    for (const record of loadSampleRecords()) {
      expect(record.alignedSequence).toBe(rows.get(record.id));
    }
  });

  it('keeps every record visible and records which file it came from', () => {
    const records = loadSampleRecords();
    expect(records.every(r => r.visible === true)).toBe(true);
    expect(records.map(r => r.importedFrom)).toEqual(['phage-t7-NC_001604.gb', 'phage-13a-NC_011045.gb', 'phage-t3-NC_003298.gb']);
  });

  it('shows phage T7 as the workbench parses it', () => {
    const direct = handleBioMessage({ type: 'PARSE_GENBANK', filename: 'phage-t7-NC_001604.gb', content: readExample('nucleotide/t7-phages/phage-t7-NC_001604.gb') });
    if (direct.type !== 'PARSE_SUCCESS') throw new Error(`parse failed: ${direct.type}`);
    const t7 = loadSampleRecords()[0];
    expect(t7.sequence).toHaveLength(39_937);
    expect(t7.features).toHaveLength(direct.records[0].features.length);
    expect(t7.sequence).toBe(direct.records[0].sequence);
  });

  it('parses once and returns the same array afterwards', () => {
    expect(loadSampleRecords()).toBe(loadSampleRecords());
  });
});
