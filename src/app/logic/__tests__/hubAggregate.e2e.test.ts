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
 * Database Hub view-model over a real multi-record file (influenza A PR8, 8
 * segments). The panel header reads "{records.length} Sequences • {allFeaturesCount}
 * Annotations" and its virtualised body is driven by buildFlattenedFeatures; the
 * existing unit tests exercise only synthetic single-record inputs, so this
 * pins the multi-record aggregate that ships to the Hub.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseGenBank } from '@/src/core/genbank/index';
import { buildFlattenedFeatures } from '@/src/app/logic/featureManager';
import type { SeqRecord } from '@/src/domain/bio/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadExample(file: string): string {
  try {
    return readFileSync(resolve(__dirname, '../../../../examples/', file), 'utf-8');
  } catch {
    return '';
  }
}

describe('Database Hub aggregate — influenza-a-pr8-8segments.gb', () => {
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
    const items = buildFlattenedFeatures(records, '');
    const headers = items.filter(i => i.type === 'header');
    const featureRows = items.filter(i => i.type === 'feature');

    // "8 Sequences"
    expect(headers).toHaveLength(8);
    // "36 Annotations" — matches the reduce used for allFeaturesCount.
    expect(featureRows).toHaveLength(36);
    expect(featureRows.length).toBe(records.reduce((acc, r) => acc + r.features.length, 0));
  });

  it('groups every feature under its own record header', () => {
    const items = buildFlattenedFeatures(records, '');
    for (const r of records) {
      const header = items.find(i => i.type === 'header' && i.recordId === r.id);
      expect(header).toBeDefined();
      // Narrow the discriminated union; only the 'header' variant carries count.
      if (header && header.type === 'header') {
        expect(header.count).toBe(r.features.length);
      }
    }
  });
});
