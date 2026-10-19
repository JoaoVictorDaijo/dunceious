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
  for (const line of readExample('nucleotide/sars-cov-2-variants/aligned.fasta').split('\n')) {
    if (line.startsWith('>')) { id = line.slice(1).trim().split(/\s+/)[0]; rows.set(id, ''); }
    else if (line.trim() !== '') rows.set(id, rows.get(id)! + line.trim());
  }
  return rows;
}

describe('loadSampleRecords', () => {
  it('the sample is four aligned records of one length', () => {
    const records = loadSampleRecords();
    expect(records.map(r => r.id)).toEqual(['NC_045512', 'OL461693', 'OR279985', 'OR323867']);
    expect(new Set(records.map(r => r.alignedSequence?.length))).toEqual(new Set([29_903]));
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
    expect(records[0].importedFrom).toBe('sars-cov-2-NC_045512.gb');
    expect(records[3].importedFrom).toBe('variants.gb');
  });

  it('shows SARS-CoV-2 as the workbench parses it', () => {
    const direct = handleBioMessage({ type: 'PARSE_GENBANK', filename: 'sars-cov-2-NC_045512.gb', content: readExample('nucleotide/coronaviruses/sars-cov-2-NC_045512.gb') });
    if (direct.type !== 'PARSE_SUCCESS') throw new Error(`parse failed: ${direct.type}`);
    const sars = loadSampleRecords()[0];
    expect(sars.sequence).toHaveLength(29_903);
    expect(sars.features).toHaveLength(direct.records[0].features.length);
    expect(sars.sequence).toBe(direct.records[0].sequence);
  });

  it('parses once and returns the same array afterwards', () => {
    expect(loadSampleRecords()).toBe(loadSampleRecords());
  });
});
