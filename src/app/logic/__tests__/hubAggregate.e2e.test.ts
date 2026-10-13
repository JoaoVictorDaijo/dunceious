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

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseGenBank } from '@/src/core/genbank/index';
import { buildSequenceSections, type HubFilters } from '@/src/app/logic/hubModel';
import type { SeqRecord } from '@/src/domain/bio/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadExample(file: string): string {
  try {
    return readFileSync(resolve(__dirname, '../../../../examples/', file), 'utf-8');
  } catch {
    return '';
  }
}

describe('Annotation Hub aggregate — influenza-a-pr8-8segments.gb', () => {
  const content = loadExample('influenza-a-pr8-8segments.gb');
  if (!content) {
    it.skip('fixture file not found', () => {});
    return;
  }

  let records: SeqRecord[];
  beforeAll(() => {
    records = parseGenBank(content);
  });

  it('renders one header per sequence and one row per annotation', () => {
    const filters: HubFilters = { query: '', types: new Set(), strand: 'all', sequenceQuery: '', needsAttention: false };
    const items = buildSequenceSections(records, filters, { grouped: false }, 'load');
    const headers = items;
    const featureRows = items.flatMap(section => section.rows);

    expect(headers).toHaveLength(8);
    expect(featureRows).toHaveLength(28);
    expect(featureRows.length).toBe(records.reduce((acc, r) => acc + r.features.filter(f => f.type !== 'source').length, 0));
  });

  it('groups every feature under its own record header', () => {
    const filters: HubFilters = { query: '', types: new Set(), strand: 'all', sequenceQuery: '', needsAttention: false };
    const items = buildSequenceSections(records, filters, { grouped: false }, 'load');
    for (const r of records) {
      const section = items.find(item => item.record.id === r.id);
      expect(section).toBeDefined();
      expect(section?.total).toBe(r.features.filter(f => f.type !== 'source').length);
    }
  });
});
