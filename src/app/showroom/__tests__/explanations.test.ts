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

import { describe, expect, it } from 'vitest';
import { EXPLANATIONS, type ExplainId } from '../explanations';

const IDS: ExplainId[] = [
  'import', 'export', 'project', 'options', 'hub',
  'ingest-sequences', 'ingest-alignment', 'ingest-annotations', 'ingest-project',
  'context-menu', 'remove-record', 'view-details', 'add-annotation', 'annotate-hit', 'join-hits',
  'align-submit', 'external-link', 'select-mode', 'conservation', 'export-fasta',
];

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter(Boolean);

describe('EXPLANATIONS', () => {
  it('covers exactly the explaining controls', () => {
    expect(Object.keys(EXPLANATIONS).sort()).toEqual([...IDS].sort());
  });

  it.each(IDS)('%s has a title and two or three plain sentences', id => {
    const { title, body } = EXPLANATIONS[id];
    expect(title.trim()).not.toBe('');
    expect(title[0]).toBe(title[0].toUpperCase());
    expect(sentences(body).length).toBeGreaterThanOrEqual(2);
    expect(sentences(body).length).toBeLessThanOrEqual(3);
    expect(body).toMatch(/[.!?]$/);
    expect(`${title} ${body}`).not.toContain('→');
  });
});
